---
title: "Redis 核心实战（一）：服务安装部署、安全加固与持久化机制"
date: 2026-11-06T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cache", "Persistence", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 核心实战系列第一篇：系统梳理 Redis 缓存服务定位与 Memcached/Tair 全维度对比，手把手演示基于 Linux 环境的源码编译安装、环境变量与多实例规划，深入拆解 protected-mode 保护模式原理与 bind/requirepass 安全加固，并详述 RDB 快照与 AOF 追加日志的底层机制与选型对比。"
---

# Redis 核心实战（一）：服务安装部署、安全加固与持久化机制

## 1.1 实战主机环境信息

| 主机名 | 业务网卡 IP | 操作系统版本 | 内核版本 | GCC / Make 版本 | Redis 编译版本 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `master` | `11.0.1.101` | CentOS Linux 7.9.2009 (Core) | `3.10.0-1160.el7.x86_64` | GCC 4.8.5 / GNU Make 3.82 | `Redis 6.2.10` |

---

## 1.2 Redis 缓存服务概述介绍

### 1.2.1 缓存服务概述介绍

Redis 是数百万开发人员使用的开源内存数据存储服务，经常被用于数据库、缓存、数据流引擎、以及消息中间件。

- **核心定位**：Redis 是完全开源的，遵守 BSD 协议的高性能 Key-Value 数据库。
- **业务架构分工**：Redis 服务属于 NoSQL 数据库产品系列，在互联网网站架构中主要配合关系型数据库（RDBMS 如 MySQL）完成业务支撑：
  - **关系型数据库（MySQL）**：负责核心业务数据的持久化存储与事务复杂查询，但随着数据量与访问并发量激增，频繁的磁盘 I/O 成为系统瓶颈。
  - **非关系型数据库（Redis）**：作为高速缓存层，利用内存极致读写能力缓存核心热点数据，分担数据库读压力并解决 HTTP 协议通讯无状态问题（如分布式 Session / Token 集中共享）。

```
MySQL 瓶颈：（磁盘 I/O 性能受限，数据量与并发激增导致响应变慢）
  └── Redis 协同：（基于内存进行高速数据缓存与调取，毫秒级响应）
```

---

### 1.2.2 主流缓存服务产品全维度对比

#### 1. 核心产品特性对比表

| 对比维度 | Memcached | Redis | Tair |
| :--- | :--- | :--- | :--- |
| **持久化存储** | 不支持（纯内存，宕机即失） | **原生支持（RDB 快照 + AOF 命令日志）** | 支持（支持 ddb / rdb / ldb 存储引擎） |
| **数据类型支持** | 单一字符串 Key-Value | **极其丰富（String, Hash, List, Set, ZSet 等）** | 支持常见数据类型与自定义数据结构 |
| **线程与并发模型** | 原生多核多线程，小数据读写快 | **核心命令单线程（无锁与上下文切换），I/O 多路复用** | 多线程架构，单机读写速度相对平缓 |
| **高可用方案** | 无原生支持，需客户端实现一致性哈希 | **原生支持 Master-Slave 主从复制与 Sentinel 哨兵** | 原生高可用与自动故障转移机制 |
| **分布式集群** | 客户端分片 | **原生支持 Redis Cluster（16384 哈希槽分片）** | 原生分布式架构（支撑阿里海量业务） |
| **架构扩容难度** | 扩容复杂度高 | **支持在线 Resharding 动态槽位平滑迁移** | 支持动态水平扩展 |

> **读写性能对比总结**：
>
> - **Memcached**：多核架构，更适合**多用户并发访问、每个用户少量数据读写**的场景；
> - **Redis**：单核处理能力强（单机 500~数万 QPS），更适合**高频读写、数据结构丰富、需要持久化保障**的热点业务场景，生产环境通常采用**单机多实例 + 分布式集群**进行部署。

---

## 1.3 Redis 服务安装部署

- **官方网站下载页面**：https://redis.io/downloads/

### 步骤一：缓存服务下载与解压

```bash
[root@master ~]# cd /usr/local/
[root@master local]# wget https://download.redis.io/releases/redis-6.2.10.tar.gz

[root@master local]# ls -l redis-6.2.10.tar.gz
-rw-r--r-- 1 root root 2490833 Jan 17  2023 redis-6.2.10.tar.gz

[root@master local]# tar xf redis-6.2.10.tar.gz
[root@master local]# ln -s redis-6.2.10 redis
[root@master local]# ls -ld redis
lrwxrwxrwx 1 root root 12 Nov  6 15:05 redis -> redis-6.2.10
# 部署 redis 服务的虚拟主机建议将内存调整为 4G 以上，保证缓存与 fork 进程空间充足
```

### 步骤二：安装依赖并编译源码

```bash
[root@master local]# yum install -y gcc automake autoconf libtool make
[root@master local]# cd /usr/local/redis
[root@master redis]# make
```
编译成功后，在 `src/` 目录下将生成 `redis-server`、`redis-cli`、`redis-sentinel` 等可执行文件

### 步骤三：配置服务全局环境变量

```bash
[root@master redis]# vim /etc/profile
# 在文件末尾添加 Redis 命令路径：
export PATH=/usr/local/redis/src:$PATH

[root@master redis]# source /etc/profile
[root@master redis]# which redis-server redis-cli
/usr/local/redis/src/redis-server
/usr/local/redis/src/redis-cli
```

### 步骤四：初次启动验证与连通测试

```bash
# 后台启动 Redis 默认服务实例
[root@master redis]# redis-server &
[root@master redis]# netstat -lntup | grep redis
tcp        0      0 0.0.0.0:6379            0.0.0.0:*               LISTEN      5925/redis-server * 
tcp6       0      0 :::6379                 :::*                    LISTEN      5925/redis-server * 

# 连接客户端进行基础读写存取
[root@master redis]# redis-cli
127.0.0.1:6379> set a dawn
OK
127.0.0.1:6379> get a
"dawn"
127.0.0.1:6379> quit

# 干净关闭当前前台测试服务
[root@master redis]# redis-cli shutdown
```

---

## 1.4 Redis 服务基础管理与多实例规范配置

生产环境中通常不使用默认配置启动，而是建立标准化的专用数据目录与配置文件，以便于单机多实例的管理与隔离。

### 1.4.1 配置文件规划与编写

```bash
[root@master ~]# mkdir -p /data/6379
[root@master ~]# cat >/data/6379/redis.conf <<EOF
daemonize yes
-- 表示定义服务程序在后台以守护进程方式运行
port 6379
-- 表示定义服务的默认监听端口
logfile /data/6379/redis.log
-- 表示服务运行日志存放路径
dir /data/6379
-- 表示定义数据目录路径，用于持久化文件存储
dbfilename dump.rdb
-- 表示持久化存储的数据快照文件名称
EOF

# 纯净版配置文件内容：
cat >/data/6379/redis.conf <<EOF
daemonize yes
port 6379
logfile /data/6379/redis.log
dir /data/6379
dbfilename dump.rdb
EOF
```

### 1.4.2 指定配置文件启动并验证

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

## 1.5 缓存服务安全配置与保护模式剖析

### 1.5.1 protected-mode 保护模式触发原理

Redis 默认开启了安全保护模式（`protected-mode yes`），并且默认未配置绑定 IP 与认证密码。在此状态下，如果尝试通过局域网远程 IP（如 `11.0.1.101`）访问，Redis 会拒绝执行任何写入操作：

```bash
# 模拟远程客户端通过本机真实 IP 写入数据：
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 set a 1
(error) DENIED Redis is running in protected mode because protected mode is enabled, no bind address was specified, no authentication password is requested to clients. In this mode connections are only accepted from the loopback interface. If you want to connect from external computers to Redis you may adopt one of the following solutions: 
1) Just disable protected mode sending the command 'CONFIG SET protected-mode no' from the loopback interface by connecting to Redis from the same host the server is running, however MAKE SURE Redis is not publicly accessible from internet if you do so. Use CONFIG REWRITE to make this change permanent. 
2) Alternatively you can just disable the protected mode by editing the Redis configuration file, and setting the protected mode option to 'no', and then restarting the server. 
3) If you started the server manually just for testing, restart it with the '--protected-mode no' option. 
4) Setup a bind address or an authentication password. NOTE: You only need to do one of the above things in order for the server to start accepting connections from the outside.
```

### 1.5.2 生产级安全加固实战（bind + requirepass）

生产中严禁直接关闭 protected-mode，规范的做法是**明确绑定监听网卡地址**并**配置高强度密码**：

```bash
[root@master ~]# vim /data/6379/redis.conf
# 增加以下两行核心安全配置：
bind 11.0.1.101 127.0.0.1
-- 监听业务通信地址与本地回环地址

requirepass 123456
-- 设置远程连接认证密码
```

重启服务生效安全配置：
```bash
[root@master ~]# redis-cli shutdown
[root@master ~]# redis-server /data/6379/redis.conf
```

### 1.5.3 密码认证与登录操作

配置密码后，未认证连接将直接拒绝操作：
```bash
[root@master ~]# redis-cli
127.0.0.1:6379> set a 1
(error) NOAUTH Authentication required.

# 方法一：连接建立后在交互环境中通过 auth 命令认证
127.0.0.1:6379> auth 123456
OK
127.0.0.1:6379> set a 1
OK
127.0.0.1:6379> get a
"1"

# 方法二：在连接建立时直接携带 -a 参数（生产脚本场景常用）
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
11.0.1.101:6379> get a
"1"
```

---

## 1.6 在线查看与动态修改配置（CONFIG GET / SET）

Redis 支持在运行时对配置参数进行动态查询与无缝在线修改，避免重启导致缓存击穿：

```bash
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.

# 1. 查看全部配置项（类似 MySQL 的 show variables;，6.2 版本有 148+ 项参数）
11.0.1.101:6379> CONFIG GET *
... 省略部分信息 ...

# 2. 查询指定配置参数
11.0.1.101:6379> CONFIG GET requirepass
1) "requirepass"
2) "123456"

# 3. 动态在线修改密码（无需重启立即生效）
11.0.1.101:6379> CONFIG SET requirepass 123
OK
11.0.1.101:6379> CONFIG GET requirepass
1) "requirepass"
2) "123"

# 4. 验证旧密码失效
11.0.1.101:6379> quit
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
AUTH failed: WRONGPASS invalid username-password pair or user is disabled.

# 5. 验证新密码成功
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123
11.0.1.101:6379> ping
PONG
```

`CONFIG SET` 仅在当前内存生效，若要永久持久化到磁盘配置文件中，可执行 `CONFIG REWRITE` 命令将内存配置自动回写更新至 `/data/6379/redis.conf`

---

## 1.7 缓存服务实现数据持久化存储（RDB 与 AOF）

为了防止单机掉电或异常崩溃导致内存数据丢失，Redis 提供了 **RDB 二进制快照** 与 **AOF 追加日志** 两种持久化机制。

### 1.7.1 方式一：RDB（Redis DataBase）快照持久化

- **工作原理**：在指定时间间隔内生成内存数据集的二进制时间点快照（Point-In-Time Snapshot）。
- **优点**：二进制文件结构极度紧凑、存储体积小、恢复加载极快，非常适合用于全量冷备与灾备；主从复制的全量同步同样依赖 RDB。
- **缺点**：快照属于定期执行，宕机时会丢失两次快照间隔期间修改的数据。

#### 1. 手动触发 RDB 持久化
```bash
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123

# 同步保存（阻塞当前主进程，直到快照生成完毕，生产环境慎用）：
11.0.1.101:6379> save
OK

# 后台异步保存（fork 子进程执行快照写入，不阻塞主线程）：
11.0.1.101:6379> bgsave
Background saving started
11.0.1.101:6379> quit

# 查看数据目录下生成的 dump.rdb 文件：
[root@master ~]# ls -l /data/6379/
total 20
-rw-r--r-- 1 root root  115 Nov  6 15:07 dump.rdb
-rw-r--r-- 1 root root  170 Nov  6 15:07 redis.conf
-rw-r--r-- 1 root root 4838 Nov  6 15:07 redis.log
```

#### 2. 自动触发 RDB 持久化配置
编辑 `/data/6379/redis.conf`：
```conf
dir /data/6379
dbfilename dump.rdb

# 满足以下任意一条规则即自动触发 bgsave：
save 900 1
-- 900 秒（15分钟）内至少有 1 个 key 发生更改
save 300 10
-- 300 秒（5分钟）内至少有 10 个 key 发生更改
save 60 10000
-- 60 秒内至少有 10000 个 key 发生更改
```

在命令行查看当前生效的快照策略：
```redis
11.0.1.101:6379> config get save
1) "save"
2) "3600 1 300 100 60 10000"
```

---

### 1.7.2 方式二：AOF（Append Only File）追加日志持久化

- **工作原理**：以文本追加形式记录服务端接收到的所有写操作命令，服务器重启时通过逐条重放命令重建内存数据。
- **优点**：支持秒级刷盘，最大程度保证数据不丢失。
- **缺点**：由于记录每一条写命令，AOF 文件体积远大于 RDB，恢复重放速度相对慢。

#### AOF 核心配置参数（三选一刷盘策略）：
编辑 `/data/6379/redis.conf`：
```conf
dir /data/6379
dbfilename dump.rdb
appendonly yes
-- 开启 AOF 日志持久化功能

# 刷盘策略选择：
# appendfsync always
-- 每个写命令执行完毕后立即同步刷盘到 AOF，最安全但写性能最低

appendfsync everysec
-- 每秒由后台线程异步刷盘一次，兼顾数据安全性与极佳写性能（生产推荐标准方案）

# appendfsync no
-- 刷盘工作完全交由操作系统缓冲区管理（通常 30 秒一次），性能最高但存在掉电丢失风险
```

---

### 1.7.3 RDB 与 AOF 的本质区别

> 1. **数据记录方式不同**：RDB 是某一时刻内存数据的**二进制完整快照**；AOF 是持续记录写操作命令的**文本追加逻辑日志**（类似 MySQL Binlog）。
> 2. **数据安全性不同**：RDB 存在窗口期数据丢失隐患（两次快照间隔的数据）；AOF（`everysec` 策略）最多仅丢失 1 秒数据，数据安全性更高。
> 3. **文件体积与恢复性能**：RDB 二进制文件压缩率高、体积小，故障恢复时直接载入内存，速度极快；AOF 文件相对庞大，恢复时需逐行重放命令，速度慢于 RDB。
> 4. **生产最佳实践**：企业中通常**同时开启 RDB 与 AOF**，利用 AOF 保障数据完整性（Redis 重启优先加载 AOF），利用 RDB 定期打包传输到异地备份节点做冷灾备与容灾恢复。
