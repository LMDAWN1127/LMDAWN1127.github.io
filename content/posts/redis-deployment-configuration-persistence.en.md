---
title: "Redis Core Practice (Part 1): Service Deployment, Security Hardening, and Persistence Mechanisms"
date: 2026-11-06T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cache", "Persistence", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Part 1 of the Redis Core Practice series: Systematically reviews Redis cache service positioning and comprehensive comparison with Memcached/Tair, provides step-by-step guidance on source compilation and installation, environment variables, and multi-instance planning under Linux, deeply analyzes the protected-mode mechanism and bind/requirepass security hardening, and details the underlying principles and trade-offs of RDB snapshots and AOF append logs."
---

# Redis Core Practice (Part 1): Service Deployment, Security Hardening, and Persistence Mechanisms

## 1.1 Host Environment Information

| Hostname | Business IP | OS Version | Kernel Version | GCC / Make Version | Redis Compiled Version |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `master` | `11.0.1.101` | CentOS Linux 7.9.2009 (Core) | `3.10.0-1160.el7.x86_64` | GCC 4.8.5 / GNU Make 3.82 | `Redis 6.2.10` |

---

## 1.2 Overview of Redis Cache Service

### 1.2.1 Cache Service Overview

Redis is an open-source in-memory data store used by millions of developers as a database, cache, streaming engine, and message broker.

- **Core Positioning**: Redis is a fully open-source, BSD-licensed, high-performance Key-Value database.
- **Architecture Role Division**: Redis belongs to the NoSQL database family. In internet web architectures, it primarily works in conjunction with relational databases (RDBMS such as MySQL) to support business workloads:
  - **Relational Database (MySQL)**: Responsible for persistent storage of core business data and complex transactional queries. However, as data volume and concurrent access surge, frequent disk I/O becomes a system bottleneck.
  - **Non-relational Database (Redis)**: Serves as a high-speed caching layer, utilizing peak in-memory read/write performance to cache core hot data, offloading read pressure from the database, and resolving stateless HTTP protocol communication issues (e.g., centralized distributed Session / Token sharing).

```
MySQL Bottleneck: (Constrained disk I/O performance; surge in data volume and concurrency causes latency spikes)
  └── Redis Collaboration: (Memory-based high-speed data caching and retrieval, sub-millisecond response)
```

---

### 1.2.2 Comprehensive Comparison of Mainstream Cache Services

#### 1. Core Product Features Comparison Table

| Dimension | Memcached | Redis | Tair |
| :--- | :--- | :--- | :--- |
| **Persistent Storage** | Not supported (pure in-memory, lost on restart) | **Natively supported (RDB snapshot + AOF command log)** | Supported (supports ddb / rdb / ldb storage engines) |
| **Data Types** | Simple String Key-Value | **Extremely rich (String, Hash, List, Set, ZSet, etc.)** | Common data types and custom data structures |
| **Thread & Concurrency Model** | Native multi-core multi-threaded, fast for small items | **Core commands single-threaded (no lock/context switch overhead), I/O multiplexing** | Multi-threaded architecture, steady single-node throughput |
| **High Availability** | No native support, relies on client-side consistent hashing | **Native Master-Slave replication and Sentinel** | Native HA and automatic failover |
| **Distributed Clustering** | Client-side sharding | **Native Redis Cluster (16384 hash slots sharding)** | Native distributed architecture (powers Alibaba massive workloads) |
| **Scaling Complexity** | High expansion complexity | **Supports online live resharding for smooth slot migration** | Supports dynamic horizontal scaling |

> **Read/Write Performance Summary**:
>
> - **Memcached**: Multi-core architecture, better suited for scenarios with **high concurrent user access with small data per user**;
> - **Redis**: High single-core performance (single node 500 to tens of thousands QPS), better suited for **high-frequency read/write, rich data structures, and persistent storage requirements**. Production environments typically adopt **multi-instance per host + distributed clustering**.

---

## 1.3 Redis Service Installation and Deployment

- **Official Download Page**: https://redis.io/downloads/

### Step 1: Download and Extract Cache Service

```bash
[root@master ~]# cd /usr/local/
[root@master local]# wget https://download.redis.io/releases/redis-6.2.10.tar.gz

[root@master local]# ls -l redis-6.2.10.tar.gz
-rw-r--r-- 1 root root 2490833 Jan 17  2023 redis-6.2.10.tar.gz

[root@master local]# tar xf redis-6.2.10.tar.gz
[root@master local]# ln -s redis-6.2.10 redis
[root@master local]# ls -ld redis
lrwxrwxrwx 1 root root 12 Nov  6 15:05 redis -> redis-6.2.10
# It is recommended to configure VM memory to 4G or higher to ensure sufficient buffer and fork process space
```

### Step 2: Install Dependencies and Compile Source Code

```bash
[root@master local]# yum install -y gcc automake autoconf libtool make
[root@master local]# cd /usr/local/redis
[root@master redis]# make
```
After successful compilation, executable binaries such as `redis-server`, `redis-cli`, and `redis-sentinel` will be generated in the `src/` directory.

### Step 3: Configure Global Environment Variables

```bash
[root@master redis]# vim /etc/profile
# Append Redis binary path to the end of the file:
export PATH=/usr/local/redis/src:$PATH

[root@master redis]# source /etc/profile
[root@master redis]# which redis-server redis-cli
/usr/local/redis/src/redis-server
/usr/local/redis/src/redis-cli
```

### Step 4: Initial Startup Verification and Connectivity Test

```bash
# Start default Redis service instance in background
[root@master redis]# redis-server &
[root@master redis]# netstat -lntup | grep redis
tcp        0      0 0.0.0.0:6379            0.0.0.0:*               LISTEN      5925/redis-server * 
tcp6       0      0 :::6379                 :::*                    LISTEN      5925/redis-server * 

# Connect client for basic read/write verification
[root@master redis]# redis-cli
127.0.0.1:6379> set a oldboy
OK
127.0.0.1:6379> get a
"oldboy"
127.0.0.1:6379> quit

# Cleanly stop current foreground test service
[root@master redis]# redis-cli shutdown
```

---

## 1.4 Basic Redis Management and Multi-Instance Standard Configuration

In production environments, default configurations are generally not used directly. Instead, standardized dedicated data directories and configuration files are created to facilitate multi-instance management and isolation on a single host.

### 1.4.1 Configuration File Planning and Creation

```bash
[root@master ~]# mkdir -p /data/6379
[root@master ~]# cat >/data/6379/redis.conf <<EOF
daemonize yes
-- Run daemon service in background
port 6379
-- Default listening port
logfile /data/6379/redis.log
-- Log file storage path
dir /data/6379
-- Data directory path for persistence files
dbfilename dump.rdb
-- Persisted snapshot filename
EOF

# Clean configuration file content:
cat >/data/6379/redis.conf <<EOF
daemonize yes
port 6379
logfile /data/6379/redis.log
dir /data/6379
dbfilename dump.rdb
EOF
```

### 1.4.2 Start and Verify with Specified Configuration File

```bash
[root@master ~]# redis-server /data/6379/redis.conf
[root@master ~]# netstat -lntup | grep redis
tcp        0      0 0.0.0.0:6379            0.0.0.0:*               LISTEN      5949/redis-server * 
tcp6       0      0 :::6379                 :::*                    LISTEN      5949/redis-server * 

[root@master ~]# redis-cli
127.0.0.1:6379> set name xiaoQ
OK
127.0.0.1:6379> get name
"xiaoQ"
127.0.0.1:6379> quit
```

---

## 1.5 Cache Service Security Configuration and Protected-Mode In-Depth

### 1.5.1 protected-mode Trigger Principle

Redis enables protected mode (`protected-mode yes`) by default, and leaves bind IP and authentication password unconfigured out of the box. In this state, attempting to access via a LAN remote IP (such as `11.0.1.101`) will result in Redis rejecting any write operations:

```bash
# Simulate remote client writing data via actual host IP:
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 set a 1
(error) DENIED Redis is running in protected mode because protected mode is enabled, no bind address was specified, no authentication password is requested to clients. In this mode connections are only accepted from the loopback interface. If you want to connect from external computers to Redis you may adopt one of the following solutions: 
1) Just disable protected mode sending the command 'CONFIG SET protected-mode no' from the loopback interface by connecting to Redis from the same host the server is running, however MAKE SURE Redis is not publicly accessible from internet if you do so. Use CONFIG REWRITE to make this change permanent. 
2) Alternatively you can just disable the protected mode by editing the Redis configuration file, and setting the protected mode option to 'no', and then restarting the server. 
3) If you started the server manually just for testing, restart it with the '--protected-mode no' option. 
4) Setup a bind address or an authentication password. NOTE: You only need to do one of the above things in order for the server to start accepting connections from the outside.
```

### 1.5.2 Production Security Hardening Practice (bind + requirepass)

Disabling protected mode directly in production is strictly prohibited. The standardized practice is to **explicitly bind listening network interface addresses** and **configure a high-strength password**:

```bash
[root@master ~]# vim /data/6379/redis.conf
# Add the following two core security settings:
bind 11.0.1.101 127.0.0.1
-- Listen on business communication interface and local loopback address

requirepass 123456
-- Configure remote authentication password
```

Restart service to apply security configurations:
```bash
[root@master ~]# redis-cli shutdown
[root@master ~]# redis-server /data/6379/redis.conf
```

### 1.5.3 Password Authentication and Login Operations

Once a password is configured, unauthenticated connections will be rejected immediately:
```bash
[root@master ~]# redis-cli
127.0.0.1:6379> set a 1
(error) NOAUTH Authentication required.

# Method 1: Authenticate interactively using auth command after connection is established
127.0.0.1:6379> auth 123456
OK
127.0.0.1:6379> set a 1
OK
127.0.0.1:6379> get a
"1"

# Method 2: Supply -a parameter directly during connection (commonly used in production scripts)
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
11.0.1.101:6379> get a
"1"
```

---

## 1.6 Online Inspection and Dynamic Configuration Modification (CONFIG GET / SET)

Redis supports dynamic querying and seamless online modification of configuration parameters at runtime, avoiding cache breakdown caused by service restarts:

```bash
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.

# 1. View all configuration options (similar to MySQL show variables;, version 6.2 has 148+ parameters)
11.0.1.101:6379> CONFIG GET *
... partial output omitted ...

# 2. Query specific configuration parameter
11.0.1.101:6379> CONFIG GET requirepass
1) "requirepass"
2) "123456"

# 3. Dynamically modify password online (takes effect immediately without restart)
11.0.1.101:6379> CONFIG SET requirepass 123
OK
11.0.1.101:6379> CONFIG GET requirepass
1) "requirepass"
2) "123"

# 4. Verify old password fails
11.0.1.101:6379> quit
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
AUTH failed: WRONGPASS invalid username-password pair or user is disabled.

# 5. Verify new password succeeds
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123
11.0.1.101:6379> ping
PONG
```

`CONFIG SET` only takes effect in current memory. To persist permanently to the configuration file on disk, execute `CONFIG REWRITE` to automatically write back in-memory settings to `/data/6379/redis.conf`.

---

## 1.7 Cache Service Data Persistence (RDB and AOF)

To prevent memory data loss caused by power failure or abnormal crash on a single node, Redis provides two persistence mechanisms: **RDB binary snapshot** and **AOF append-only log**.

### 1.7.1 Method 1: RDB (Redis DataBase) Snapshot Persistence

- **Working Principle**: Generates a point-in-time binary snapshot of the in-memory dataset at specified intervals.
- **Advantages**: Binary file structure is extremely compact, small storage footprint, extremely fast recovery load speed, ideal for full cold backups and disaster recovery; full synchronization in master-slave replication also depends on RDB.
- **Disadvantages**: Snapshots run periodically; data modified between two snapshot intervals will be lost if a crash occurs.

#### 1. Manually Trigger RDB Persistence
```bash
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123

# Synchronous save (blocks the main process until snapshot generation completes; use with caution in production):
11.0.1.101:6379> save
OK

# Background asynchronous save (forks a child process to write snapshot without blocking the main thread):
11.0.1.101:6379> bgsave
Background saving started
11.0.1.101:6379> quit

# View dump.rdb generated in data directory:
[root@master ~]# ls -l /data/6379/
total 20
-rw-r--r-- 1 root root  115 Nov  6 15:07 dump.rdb
-rw-r--r-- 1 root root  170 Nov  6 15:07 redis.conf
-rw-r--r-- 1 root root 4838 Nov  6 15:07 redis.log
```

#### 2. Automatic RDB Persistence Configuration
Edit `/data/6379/redis.conf`:
```conf
dir /data/6379
dbfilename dump.rdb

# Automatically trigger bgsave when any of the following rules are met:
save 900 1
-- At least 1 key changed within 900 seconds (15 minutes)
save 300 10
-- At least 10 keys changed within 300 seconds (5 minutes)
save 60 10000
-- At least 10000 keys changed within 60 seconds
```

Check currently effective snapshot policy via CLI:
```redis
11.0.1.101:6379> config get save
1) "save"
2) "3600 1 300 100 60 10000"
```

---

### 1.7.2 Method 2: AOF (Append Only File) Log Persistence

- **Working Principle**: Records all write commands received by the server in an append-only text log. On server restart, data is rebuilt in memory by replaying commands line by line.
- **Advantages**: Supports second-level disk flushing, maximizing data durability.
- **Disadvantages**: Because every write command is recorded, AOF files are much larger than RDB, and recovery replay speed is relatively slower.

#### AOF Core Configuration Parameters (Three Flush Policies):
Edit `/data/6379/redis.conf`:
```conf
dir /data/6379
dbfilename dump.rdb
appendonly yes
-- Enable AOF log persistence

# Flush policy selection:
# appendfsync always
-- Synchronously flush to AOF after every write command; safest but lowest write performance

appendfsync everysec
-- Asynchronously flush via background thread every second; balances data security with excellent write performance (production standard recommendation)

# appendfsync no
-- Flush completely managed by OS buffer (typically every 30 seconds); highest performance but carries power loss risk
```

---

### 1.7.3 Essential Differences Between RDB and AOF

> 1. **Different Data Recording Approaches**: RDB is a **binary full snapshot** of memory data at a specific point in time; AOF is a **continuous append-only logical text log** of write commands (similar to MySQL Binlog).
> 2. **Different Data Durability**: RDB has window-period data loss risks (data between two snapshots); AOF (`everysec` policy) loses at most 1 second of data, offering higher data durability.
> 3. **File Size and Recovery Performance**: RDB binary files have high compression ratio and small size, loaded directly into memory for ultra-fast disaster recovery; AOF files are relatively large and require line-by-line command replay, making recovery slower than RDB.
> 4. **Production Best Practice**: Enterprises typically **enable both RDB and AOF simultaneously**. AOF ensures data integrity (Redis prioritizes loading AOF upon restart), while RDB is periodically archived and transferred to remote backup nodes for cold disaster recovery.
