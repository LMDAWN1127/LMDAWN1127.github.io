---
title: "Redis Core Practice (Part 2): Five Core Data Types, MySQL Hot Cache, and Transaction Features"
date: 2026-11-06T14:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cache", "MySQL", "Transactions", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Part 2 of the Redis Core Practice series: In-depth analysis of global key lifecycle management (keys/scan/expire/ttl), hands-on practice with Strings, Hash, List, Set, and SortedSet data structures, real-world implementations including high-concurrency counters, WeChat comment streams, friend topology, and TopN leaderboards, importing MySQL 3308 multi-instance hot rows into Redis Hash via Linux pipes, and in-depth comparison between MySQL ACID transactions and Redis weak transactions with WATCH optimistic locking."
---

# Redis Core Practice (Part 2): Five Core Data Types, MySQL Hot Cache, and Transaction Features

## 2.1 Overview of Data Types and Storage Models

In relational databases, we optimize B+ tree index storage by designing schemas and declaring specific column types (`char`, `varchar`, `int`, `tinyint`). In Redis, however, data types directly determine the in-memory data storage layout and the algorithmic complexity of retrieval operations.

---

## 2.2 Universal Key Management Operations

Redis provides a suite of global key management commands independent of specific underlying data structures:

```bash
# Connect to 11.0.1.101 Redis instance
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.

# 1. View all existing key names
11.0.1.101:6379> keys *
 1) "city_9"
 2) "id"
 3) "city_6"
 4) "gender"
 5) "city_4"
 6) "city_1"
-- Avoid using keys * in production with large datasets (blocks single thread); scan incremental iteration is recommended

# 2. Query the data type associated with a key
11.0.1.101:6379> type city_1
hash
11.0.1.101:6379> type a
string

# 3. Set and query time-to-live (EXPIRE / TTL and PEXPIRE / PTTL)
11.0.1.101:6379> expire a 60
(integer) 1
11.0.1.101:6379> ttl a
(integer) 55
-- Returns remaining seconds; -1 indicates persistent, -2 indicates expired/deleted

11.0.1.101:6379> pexpire a 60000
(integer) 1
11.0.1.101:6379> pttl a
(integer) 56000
-- Set and inspect remaining TTL in milliseconds

# 4. Remove expiration (persist key in memory permanently)
11.0.1.101:6379> persist a
(integer) 1

# 5. Delete specified key-value pair
11.0.1.101:6379> del a
(integer) 1

# 6. Check if key exists
11.0.1.101:6379> exists a
(integer) 0
-- 0 indicates non-existent, 1 indicates exists

# 7. Rename key
11.0.1.101:6379> rename city_10 city_ten
OK
```

---

## 2.3 Practical Applications of Five Core Data Types

### 2.3.1 Data Type 1: Strings

Strings is the fundamental data structure in Redis, mapping one Key to one Value. A single value supports up to 512MB.

#### 1. Basic Read/Write and Batch Operations
```redis
# Single key storage and retrieval
11.0.1.101:6379> set name dawn
OK
11.0.1.101:6379> get name
"dawn"

# Batch set and get (reduces multiple network RTT overheads)
11.0.1.101:6379> mset id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> mget id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. High-Concurrency Counter Practice (Page Views, Likes, Order Sequence Numbers)
```redis
# Basic increment and decrement
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 1
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 2
11.0.1.101:6379> decr 123456_20240410_diancan
(integer) 1

# Increment and decrement by specific offsets
11.0.1.101:6379> incrby 123456_20240410_diancan 10000
(integer) 10001
11.0.1.101:6379> decrby 123456_20240410_diancan 5000
(integer) 5001
```

---

### 2.3.2 Data Type 2: Hash

Hash is a mapping table of String fields and values, exceptionally well-suited for storing object records (similar to a row in MySQL), with support for independently modifying individual fields.

#### 1. Basic Hash Read and Write
```redis
# Store user object records
11.0.1.101:6379> hmset stu01 id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> hmset stu02 id 102 name xiaoA age 21 gender f
OK

# Inspect attributes of a specific object
11.0.1.101:6379> hmget stu01 id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. Production Practice: Importing MySQL Hot Rows into Redis Hash Cache

A MySQL 8.0 multi-instance service is running on the current host `master` (port `3308`, socket `/data/3308/mysql.sock`). We use SQL to format and concatenate hot data from `world.city` into Redis commands, then batch export and import them into Redis:

```bash
# 1. Ensure MySQL 3308 is running and enter interactive shell
[root@master ~]# systemctl start mysqld3308
[root@master ~]# mysql -S /data/3308/mysql.sock
mysql> use world;
mysql> show tables;
+----------------------+
| Tables_in_world      |
+----------------------+
| city                 |
| country              |
| countrylanguage      |
+----------------------+
3 rows in set (0.00 sec)

# 2. Use SQL concat function to format rows into hmset commands and export
mysql> select concat("hmset city_",id," id ",id," name ",name) from world.city limit 10 into outfile '/tmp/hmset.txt';
Query OK, 10 rows affected (0.00 sec)
mysql> quit

# 3. Check exported file content
[root@master ~]# cat /tmp/hmset.txt
hmset city_1 id 1 name Kabul
hmset city_2 id 2 name Qandahar
hmset city_3 id 3 name Herat
hmset city_4 id 4 name Mazar-e-Sharif
hmset city_5 id 5 name Amsterdam
hmset city_6 id 6 name Rotterdam
hmset city_7 id 7 name Haag
hmset city_8 id 8 name Utrecht
hmset city_9 id 9 name Eindhoven
hmset city_10 id 10 name Tilburg

# 4. Rapidly batch pipe into Redis via Linux pipeline
[root@master ~]# cat /tmp/hmset.txt | redis-cli -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
OK
OK
OK
OK
OK
OK
OK
OK
OK
OK

# 5. Verify import results in Redis client
[root@master ~]# redis-cli -a 123456
127.0.0.1:6379> hgetall city_1
1) "id"
2) "1"
3) "name"
4) "Kabul"

127.0.0.1:6379> hmget city_1 id name
1) "1"
2) "Kabul"
```

> **Enterprise Architecture Evolution**: In real-world microservice architectures, open-source middleware (such as Alibaba Canal or Debezium) is typically used to masquerade as a MySQL slave, tailing the Binlog to parse and write inserts and updates into Redis Hash in real-time, achieving automated incremental cache synchronization and refresh.

---

### 2.3.3 Data Type 3: List (Doubly Linked Message List)

Similar to Shell / awk arrays `array[zhangsan, lisi, wangwu]`. Redis List is a simple doubly-linked list of strings, commonly used for latest feed timelines, paginated comment displays, or lightweight FIFO message queues.

```redis
# Push new comments from the left sequentially (latest comments appear at the top)
127.0.0.1:6379> LPUSH wechat "taday is nice day ~"
(integer) 1
127.0.0.1:6379> LPUSH wechat "taday is bad day ~"
(integer) 2
127.0.0.1:6379> LPUSH wechat "taday is good day ~"
(integer) 3
127.0.0.1:6379> LPUSH wechat "taday is rainy day ~"
(integer) 4
127.0.0.1:6379> LPUSH wechat "taday is friday ~"
(integer) 5

# Retrieve all comments (0 to -1 fetches the full range)
127.0.0.1:6379> lrange wechat 0 -1
1) "taday is friday ~"
2) "taday is rainy day ~"
3) "taday is good day ~"
4) "taday is bad day ~"
5) "taday is nice day ~"
```

---

### 2.3.4 Data Type 4: Set (Unordered Deduplicated Set)

Set is an unordered collection of Strings with unique, deduplicated elements. Implemented internally via hash tables with $O(1)$ time complexity. Natively supports set intersection (`SINTER`), union (`SUNION`), and difference (`SDIFF`) operations, ideal for social friend graph processing.

```redis
# Record followed friend lists for two users:
127.0.0.1:6379> sadd xiaoQ xiaoA xiaoB oldgirl oldbaby tom
(integer) 5
127.0.0.1:6379> sadd dawn oldgirl oldbaby oldli Lucy tom
(integer) 5

# 1. Union calculation (get full set of friends for both users, automatically deduplicated):
127.0.0.1:6379> SUNION xiaoQ dawn
1) "xiaoB"
2) "oldgirl"
3) "xiaoA"
4) "tom"
5) "oldli"
6) "Lucy"
7) "oldbaby"

# 2. Intersection calculation (get mutual friends between both users):
127.0.0.1:6379> SINTER xiaoQ dawn
1) "oldbaby"
2) "oldgirl"
3) "tom"

# 3. Difference calculation (find one-way unique friends for recommendations):
127.0.0.1:6379> SDIFF xiaoQ dawn
1) "xiaoB"
2) "xiaoA"
-- Friends belonging to xiaoQ but not dawn

127.0.0.1:6379> SDIFF dawn xiaoQ 
1) "oldli"
2) "Lucy"
-- Friends belonging to dawn but not xiaoQ
```

---

### 2.3.5 Data Type 5: SortedSet (ZSet Ordered Set)

SortedSet associates a floating-point score (Score) with each element based on Set semantics. Elements remain unique, but members are ordered automatically by score from lowest to highest. Widely used for real-time leaderboards, trending searches, and point rankings.

```redis
# Create leaderboard with initial score weights (all scores 0):
127.0.0.1:6379> zadd topN 0 smlt 0 fskl 0 fshkl 0 lzlsfs 0 wdhbx 0 wxg
(integer) 6

# Simulate traffic surges, dynamically accumulating scores via ZINCRBY:
127.0.0.1:6379> ZINCRBY topN 100000 smlt  
"100000"
127.0.0.1:6379> ZINCRBY topN 10000 fskl
"10000"
127.0.0.1:6379> ZINCRBY topN 1000000 fshkl
"1000000"
127.0.0.1:6379> ZINCRBY topN 100 lzlsfs
"100"
127.0.0.1:6379> ZINCRBY topN 10 wdhbx
"10"
127.0.0.1:6379> ZINCRBY topN 100000000 wxg
"100000000"

# Retrieve top 3 leaderboard members in descending score order (index 0 to 2):
127.0.0.1:6379> ZREVRANGE topN 0 2
1) "wxg"
2) "fshkl"
3) "smlt"
```

---

## 2.4 Redis Transactions and Weak Transaction In-Depth

### 2.4.1 Transaction Concepts and Business Scenario: Vending Machine Workflow

Database transactions require ACID compliance, where the core guarantee is **Atomicity (A)** — all operations in a transaction either completely succeed or completely fail.

Taking a beverage vending machine transaction as an example, the end-to-end chain consists of:
1. **Query Product**: Check machine stock;
2. **Deduct Payment**: Connect to database, insert debit transaction record (`insert`);
3. **Dispense Item**: Deduct stock by one (`update stock = stock - 1`);
4. **Retrieve Item**: Dispenser sensor triggers, update replenishment status (`update need_replenish = 1`).

> **Failure Scenario**: If step 4 encounters a motor jam resulting in dispensing failure, relational databases must execute a **Rollback** to undo previous payment and stock changes, ensuring asset and inventory integrity.

### 2.4.2 Comparison: MySQL Strong Atomicity vs Redis Weak Transactions

- **MySQL Implementation**:
  - Relies on **Undo Logs** to achieve atomicity;
  - `begin` starts the transaction, DML changes occur in dirty memory pages, and `rollback` reverses operations using Undo Logs upon exceptions; normal completion triggers `commit` to disk.
- **Redis Weak Transaction Implementation**:
  - Relies on **command pipeline queues**;
  - Ensures queued commands are executed sequentially and uninterrupted by other clients (providing isolation);
  - **Lacks runtime rollback capability**: If a command inside the queue triggers an error at runtime (e.g., executing a List command on a String), Redis continues executing remaining commands; **commands that already executed successfully will NOT roll back!**

### 2.4.3 Redis Transaction Commands Practice

```redis
# 1. Initiate transaction (MULTI)
127.0.0.1:6379> MULTI
OK

# 2. Enter sequential commands (commands are queued via QUEUED)
127.0.0.1:6379(TX)> set a b
QUEUED
127.0.0.1:6379(TX)> set c d
QUEUED

# 3. Commit and execute (EXEC, executes in queue order and returns each command result)
127.0.0.1:6379(TX)> exec
1) OK
2) OK

# 4. Discard transaction (DISCARD, flushes current command queue and exits transaction mode)
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379(TX)> set test 123
QUEUED
127.0.0.1:6379(TX)> DISCARD
OK
127.0.0.1:6379> get test
(nil)
```

> **Supplementary Mechanism (WATCH Optimistic Locking)**: Before executing `MULTI`, one or more keys can be monitored via `WATCH <key>`. If any watched key is modified by another client prior to `EXEC`, the current client's transaction is aborted, returning `(nil)`, realizing classic optimistic locking (CAS) concurrency control.
