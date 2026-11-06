---
title: "Redis 核心实战（二）：五大核心数据类型、MySQL 热点缓存与事务特性"
date: 2026-11-06T14:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cache", "MySQL", "Transactions", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 核心实战系列第二篇：系统剖析全局键生命周期管理（keys/scan/expire/ttl），深度实战 Strings、Hash、List、Set、SortedSet 五大核心数据类型及高并发计数器、微信评论流、朋友圈好友拓扑与 TopN 排行榜，演示基于 Linux 管道将 MySQL 3308 多实例热点行批量灌入 Redis Hash，并深入对比 MySQL 强事务与 Redis 弱事务实现原理及 WATCH 乐观锁并发控制。"
---

# Redis 核心实战（二）：五大核心数据类型、MySQL 热点缓存与事务特性

## 2.1 数据类型与存储模型概述

在关系型数据库中，我们通过建立表结构并声明字段类型（`char`、`varchar`、`int`、`tinyint`）来优化索引树存储；而在 Redis 中，数据类型直接决定了数据在内存中的存储结构与检索调取复杂度。

---

## 2.2 数据类型通用键管理操作

Redis 提供了一组与具体数据类型无关的全局键管理命令：

```bash
# 连接 11.0.1.101 Redis 实例
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.

# 1. 查看已存在的所有 key 名称信息
11.0.1.101:6379> keys *
 1) "city_9"
 2) "id"
 3) "city_6"
 4) "gender"
 5) "city_4"
 6) "city_1"
-- 生产环境大数据量时严禁使用 keys *（单线程会被阻塞），建议使用 scan 增量式迭代

# 2. 查询键所对应的数据类型
11.0.1.101:6379> type city_1
hash
11.0.1.101:6379> type a
string

# 3. 设定与查询生存时间（EXPIRE / TTL 与 PEXPIRE / PTTL）
11.0.1.101:6379> expire a 60
(integer) 1
11.0.1.101:6379> ttl a
(integer) 55
-- 返回剩余有效秒数；-1 表示永久，-2 表示已过期删除

11.0.1.101:6379> pexpire a 60000
(integer) 1
11.0.1.101:6379> pttl a
(integer) 56000
-- 以毫秒为单位设置并查看剩余有效时间

# 4. 取消生存时间（使 key 变为永久驻留内存）
11.0.1.101:6379> persist a
(integer) 1

# 5. 删除指定的键值对
11.0.1.101:6379> del a
(integer) 1

# 6. 判断键是否存在
11.0.1.101:6379> exists a
(integer) 0
-- 0 表示不存在，1 表示存在

# 7. 重命名 key 名称
11.0.1.101:6379> rename city_10 city_ten
OK
```

---

## 2.3 五大核心数据类型实战应用

### 2.3.1 数据类型一：Strings（字符串）

Strings 是 Redis 最基本的数据结构，一个 Key 映射一个 Value，单个 Value 最大支持 512MB。

#### 1. 基础读写与批量操作
```redis
# 单个存储与读取
11.0.1.101:6379> set name dawn
OK
11.0.1.101:6379> get name
"dawn"

# 批量设置与调取（减少多次网络 RTT 延迟）
11.0.1.101:6379> mset id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> mget id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. 高并发计数器实战（浏览量、点赞、流水号）
```redis
# 基础递增与递减
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 1
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 2
11.0.1.101:6379> decr 123456_20240410_diancan
(integer) 1

# 指定数值累加与减少
11.0.1.101:6379> incrby 123456_20240410_diancan 10000
(integer) 10001
11.0.1.101:6379> decrby 123456_20240410_diancan 5000
(integer) 5001
```

---

### 2.3.2 数据类型二：Hash（哈希表）

Hash 是一个 String 类型的 field 和 value 的映射表，极其适合用来存储对象数据（类似 MySQL 中一行数据记录），并支持针对特定字段进行独立修改。

#### 1. 基础哈希读写
```redis
# 存储用户对象记录
11.0.1.101:6379> hmset stu01 id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> hmset stu02 id 102 name xiaoA age 21 gender f
OK

# 查看指定对象的属性字段
11.0.1.101:6379> hmget stu01 id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. 生产实战：将 MySQL 热点行数据导入 Redis Hash 缓存

在当前主机 `master` 上运行有 MySQL 8.0 多实例服务（端口 `3308`，Socket `/data/3308/mysql.sock`），我们通过 SQL 将 `world.city` 的热点数据拼接为 Redis 命令批量导出并导入 Redis：

```bash
# 1. 确保 MySQL 3308 运行并进入交互终端
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

# 2. 利用 SQL concat 函数将记录格式化拼接为 hmset 命令并导出
mysql> select concat("hmset city_",id," id ",id," name ",name) from world.city limit 10 into outfile '/tmp/hmset.txt';
Query OK, 10 rows affected (0.00 sec)
mysql> quit

# 3. 检查导出的文件内容
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

# 4. 通过 Linux 管道高速批量灌入 Redis
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

# 5. 在 Redis 客户端中验证导入结果
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

> **企业架构演进**：在真实微服务架构中，通常使用开源中间件（如阿里 Canal、Debezium）伪装为 MySQL 从库监听 Binlog，自动将新增与变更数据实时解析写入 Redis Hash，完成全自动缓存增量同步与刷新。

---

### 2.3.3 数据类型三：List（列表 / 消息双向链表）

类似于 Shell / awk 数组 `array[zhangsan, lisi, wangwu]`。Redis List 是简单的字符串双向链表，常用于社交动态最新发布流、评论区分页展示或简易消息队列（FIFO）。

```redis
# 依次将新评论从左侧推入列表（最新评论排在最上方）
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

# 调取所有评论数据（0 到 -1 表示获取全量数据）
127.0.0.1:6379> lrange wechat 0 -1
1) "taday is friday ~"
2) "taday is rainy day ~"
3) "taday is good day ~"
4) "taday is bad day ~"
5) "taday is nice day ~"
```

---

### 2.3.4 数据类型四：Set（无序去重集合）

Set 是 String 类型的无序集合，元素唯一不重复，内部通过哈希表实现，时间复杂度为 $O(1)$。原生支持集合的交集（`SINTER`）、并集（`SUNION`）、差集（`SDIFF`）计算，适合处理社交关系好友圈。

```redis
# 为两位用户录入关注的好友列表：
127.0.0.1:6379> sadd xiaoQ xiaoA xiaoB oldgirl oldbaby tom
(integer) 5
127.0.0.1:6379> sadd dawn oldgirl oldbaby oldli Lucy tom
(integer) 5

# 1. 并集处理（获取两人的全部好友集合，自动去重）：
127.0.0.1:6379> SUNION xiaoQ dawn
1) "xiaoB"
2) "oldgirl"
3) "xiaoA"
4) "tom"
5) "oldli"
6) "Lucy"
7) "oldbaby"

# 2. 交集处理（获取两人的共同好友）：
127.0.0.1:6379> SINTER xiaoQ dawn
1) "oldbaby"
2) "oldgirl"
3) "tom"

# 3. 差集处理（求单向独有好友，用于推荐可能认识的人）：
127.0.0.1:6379> SDIFF xiaoQ dawn
1) "xiaoB"
2) "xiaoA"
-- 属于 xiaoQ 但不属于 dawn 的好友

127.0.0.1:6379> SDIFF dawn xiaoQ 
1) "oldli"
2) "Lucy"
-- 属于 dawn 但不属于 xiaoQ 的好友
```

---

### 2.3.5 数据类型五：SortedSet（ZSet 有序集合）

SortedSet 在 Set 的基础上为每个元素关联一个浮点分值（Score），元素依然唯一，但成员会根据分值自动从小到大排列。常用于实时排行榜、热搜、积分排位。

```redis
# 创建榜单并录入初始权重分值（Score 均为 0）：
127.0.0.1:6379> zadd topN 0 smlt 0 fskl 0 fshkl 0 lzlsfs 0 wdhbx 0 wxg
(integer) 6

# 模拟热度飙升，通过 ZINCRBY 为成员动态累加分值：
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

# 按分值从高到低逆序调取 Top 3 榜单成员（下标 0 到 2）：
127.0.0.1:6379> ZREVRANGE topN 0 2
1) "wxg"
2) "fshkl"
3) "smlt"
```

---

## 2.4 Redis 服务事务操作与弱事务剖析

### 2.4.1 事务概念与业务场景：自动售卖机流程

数据库事务（Transaction）要求满足 ACID 特性，其中核心是 **A（Atomicity）原子性** —— 事务中的所有操作要么全部成功，要么全部失败。

以自动售卖机购买饮料为例，完整的业务链条包括：
1. **查询商品**：检查售卖机内货品库存；
2. **扣款支付**：连接服务端数据库，交易表插入扣款明细（`insert`）；
3. **商品出库**：库存表商品数量减一（`update stock = stock - 1`）；
4. **取走商品**：出货槽位传感器触发，更新补货状态（`update need_replenish = 1`）。

> **异常场景**：若第 4 步出货电机卡死导致取货失败，在关系型数据库中必须利用 **Rollback（回滚）** 机制撤销前面的扣款与库存扣减，确保资金与库存一致。

### 2.4.2 MySQL 强原子性 vs Redis 弱事务对比

- **MySQL 实现方式**：
  - 基于 **Undo Log（回滚日志）** 实现原子性；
  - `begin` 开启事务，执行 DML 操作在内存脏页中进行，遇到异常直接调用 `rollback` 根据 Undo Log 反向撤销；正常完成则 `commit` 落盘持久化。
- **Redis 弱事务实现方式**：
  - 基于**命令管道队列**实现；
  - 保证入队的这批命令会**按顺序集中执行且在执行期间不被其他客户端命令打断**（具有隔离性）；
  - **不具备运行时回滚能力**：如果队列中的某一条命令在运行时报错（例如对 String 执行了 List 命令），Redis 会继续执行后续命令，**已成功执行的命令不会发生回滚**！

### 2.4.3 Redis 事务命令实战

```redis
# 1. 开启事务（MULTI）
127.0.0.1:6379> MULTI
OK

# 2. 连续输入命令（命令进入排队队列 QUEUED）
127.0.0.1:6379(TX)> set a b
QUEUED
127.0.0.1:6379(TX)> set c d
QUEUED

# 3. 提交执行（EXEC，按入队顺序依次执行并返回每条命令结果）
127.0.0.1:6379(TX)> exec
1) OK
2) OK

# 4. 放弃事务（DISCARD，清空当前命令队列，直接退出事务模式）
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379(TX)> set test 123
QUEUED
127.0.0.1:6379(TX)> DISCARD
OK
127.0.0.1:6379> get test
(nil)
```

> **补充机制（WATCH 乐观锁）**：在执行 `MULTI` 前，可使用 `WATCH <key>` 监控一个或多个键。如果这些键在 `EXEC` 执行前被其他客户端修改了，当前客户端的整个事务将被自动打断并执行失败返回 `(nil)`，从而实现经典的乐观锁（CAS）并发控制。
