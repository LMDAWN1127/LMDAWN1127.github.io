---
title: "Redis 高可用实战（三）：主从复制原理与 Sentinel 哨兵故障自动转移"
date: 2026-11-06T16:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Sentinel", "High Availability", "Replication", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 高可用实战系列第三篇：深入剖析 Redis 主从复制底层机制（全量 BGSAVE 同步、增量命令传播与 repl_backlog 积压缓冲区断点续传），警示主库未持久化导致的从库清空生产事故，实战演示单机 6380/6381/6382 三实例主从复制搭建与拓扑维护，并结合 Sentinel 哨兵集群实战实现主库故障秒级主观/客观下线判断、Leader 选举与从库自动晋升纳管。"
---

# Redis 高可用实战（三）：主从复制原理与 Sentinel 哨兵故障自动转移

## 3.1 Redis 主从复制功能架构与原理

### 3.1.1 为什么需要主从复制？

单台 Redis 服务器即便配置了 RDB 与 AOF 持久化，一旦发生服务器硬件损坏、电源故障或主板宕机，依然会导致整个业务系统服务中断。为此，Redis 提供了**复制（Replication）**功能，将一台主数据库（Master）的数据自动异步同步到多个从数据库（Slave / Replica），从而实现：
1. **多副本容灾备份**：避免单点故障（SPOF）；
2. **读写分离扩展**：Master 节点专职处理写请求，多个 Slave 节点分担大规模高并发读请求；
3. **高可用基石**：作为 Sentinel 哨兵架构与 Redis Cluster 集群的底层数据底座。

---

### 3.1.2 主副本集（Master-Replica）同步原理剖析

```
[从库: 6381/6382] ──(1. slaveof / 发送 PSYNC ?)──> [主库: 6380]
[从库: 6381/6382] <──(2. 触发 BGSAVE，传输 RDB 快照)── [主库: 6380]
[从库: 6381/6382] (3. 清空旧数据并加载 RDB 快照)
[从库: 6381/6382] <──(4. 发送 Replication Buffer 缓存区新命令)── [主库: 6380]
[从库: 6381/6382] <──(5. 持续增量命令传播: set 命令同步)── [主库: 6380]
[从库: 6381/6382] ──(6. 网络瞬断重连: 发送 PSYNC <runid> <offset>)──> [主库: 6380]
[从库: 6381/6382] <──(7. 仅重传环形复制积压缓冲区差量数据)── [主库: 6380]
```

1. **初次连接全量复制（SYNC / Full PSYNC）**：
   - 从库执行 `slaveof <master_ip> <port>` 后，向主库发送 `PSYNC ? -1` 命令；
   - 主库收到全量同步请求后，在后台触发 `BGSAVE` 生成 RDB 二进制快照，并使用专用的 **Replication Buffer（复制缓冲区）** 暂存快照生成期间产生的所有新写命令；
   - 主库将生成的 RDB 文件传输给从库，从库收到后首先清空自身内存，然后将 RDB 文件完整载入内存；
   - 主库随后将 Replication Buffer 中的所有写命令同步发送给从库重放，至此主从数据达成一致。
2. **正常运行期持续命令传播**：
   - 主库只要发生新的写操作（如 `set`），就会自动以协议命令的形式异步推送给从库执行。
3. **网络瞬断增量复制（PSYNC）**：
   - 主库在内存中维护了一个固定大小的环形**复制积压缓冲区（repl_backlog）**与复制偏移量（Offset）；
   - 若主从连接发生短暂中断后重连，从库会向主库发送 `PSYNC <master_replid> <offset>` 请求；
   - 若从库请求的偏移量依然存在于主库的环形缓冲区内，主库仅将缺失的这部分差量数据续传给从库，无需重新执行耗时的全量 RDB 生成与加载。

---

### 3.1.3 核心保障参数与主从持久化致命陷阱

#### 1. 数据一致性保障参数（主库配置）
```conf
min-slaves-to-write 1
-- 必须有至少 1 个（或指定数量）从库处于正常连接状态，主库才允许写入，否则拒绝写请求返回错误

min-slaves-max-lag 3
-- 允许从库失去心跳交互的最长延迟秒数（超过该阈值视为主从断连）
```

#### 2. 生产高危陷阱：主库未开启持久化时的清空从库事故

**重要警示**：如果主库没有开启持久化（既无 RDB 也无 AOF），一旦主库意外崩溃宕机，内存数据全部归零；此时若有外部监控或运维守护脚本将主库立即自动重启上线，由于主库此时内存为空，它会把**空内存作为全量状态生成空 RDB 覆盖同步给所有从库**，导致所有从库完好的数据在瞬间被全部抹除清空！  
**生产规范**：主从复制架构中的主库**必须开启持久化**；若主库未开启持久化，宕机后绝对禁止直接上线，必须先将某个从库提升为主库后再行恢复。

---

## 3.2 单机三实例主从复制搭建实战

在主机 `master`（`11.0.1.101`）上规划单机三实例：

| 实例端口 | 实例身份 | 工作目录 | 日志路径 |
| :--- | :--- | :--- | :--- |
| `6380` | 主库（Master） | `/data/6380` | `/data/6380/redis.log` |
| `6381` | 从库 1（Slave 1） | `/data/6381` | `/data/6381/redis.log` |
| `6382` | 从库 2（Slave 2） | `/data/6382` | `/data/6382/redis.log` |

### 步骤一：创建目录与编写实例配置文件

```bash
[root@master ~]# mkdir -p /data/638{0..2}

# 批量编写三个实例的配置文件（包含认证密码 123 与主从通信认证 masterauth 123）
for port in 6380 6381 6382; do
cat >/data/${port}/redis.conf <<EOF
port ${port}
daemonize yes
pidfile /data/${port}/redis.pid
loglevel notice
logfile "/data/${port}/redis.log"
dbfilename dump.rdb
dir /data/${port}
requirepass 123
masterauth 123
EOF
done

# 启动三个 Redis 实例
[root@master ~]# redis-server /data/6380/redis.conf
[root@master ~]# redis-server /data/6381/redis.conf
[root@master ~]# redis-server /data/6382/redis.conf

# 检查端口监听确认
[root@master ~]# netstat -lntup | grep -E '6380|6381|6382'
tcp        0      0 0.0.0.0:6380            0.0.0.0:*               LISTEN      6332/redis-server * 
tcp        0      0 0.0.0.0:6381            0.0.0.0:*               LISTEN      6338/redis-server * 
tcp        0      0 0.0.0.0:6382            0.0.0.0:*               LISTEN      6344/redis-server * 
```

### 步骤二：开启主从同步与拓扑检查

```bash
# 在 6381 与 6382 上开启主从同步，指向 6380 主库
[root@master ~]# redis-cli -p 6381 -a 123 slaveof 127.0.0.1 6380
OK
[root@master ~]# redis-cli -p 6382 -a 123 slaveof 127.0.0.1 6380
OK

# 查看 6380 主库的复制拓扑状态（两个从库已全部上线）：
[root@master ~]# redis-cli -p 6380 -a 123 info replication
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
# Replication
role:master
connected_slaves:2
slave0:ip=127.0.0.1,port=6381,state=online,offset=0,lag=0
slave1:ip=127.0.0.1,port=6382,state=online,offset=0,lag=0
master_failover_state:no-failover
master_replid:b26c0fadaba463a8e0bb4b7f0b289a0c1b06f62d
master_repl_offset:0

# 查看 6381 从库复制状态：
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6380
master_link_status:up
master_last_io_seconds_ago:2
master_sync_in_progress:0
slave_read_only:1
```

### 步骤三：解除主从同步状态

```bash
# 若需要将某个从库脱离主从关系提升为独立主库：
[root@master ~]# redis-cli -p 6382 -a 123 slaveof no one
OK
```

---

## 3.3 Redis 哨兵架构高可用实战（Sentinel）

### 3.3.1 哨兵架构核心价值与组件职责

单纯的主从架构中，如果 Master 节点宕机，从库无法自动晋升为主库，需要运维人员人工介入，业务不可用时间长。引入 **Sentinel（哨兵集群）** 可提供全自动无人值守的高可用保障：

- **监控（Monitoring）**：周期性向主库、从库及其他 Sentinel 节点发送 PING 心跳，检测节点健康状态；
- **自动故障转移（Automatic Failover）**：当主库心跳超时判定为主观下线（sdown）且多数 Sentinel 达成客观下线（odown）共识后，哨兵基于 Raft 协议选举 Leader 并挑选最优从库晋升为新 Master；
- **重构拓扑关系**：哨兵命令其余从库重新挂载向新 Master 同步，并在原 Master 修复重启后将其作为从库接入；
- **通知客户端**：客户端直连 Sentinel 获取最新主库 IP/Port，主从切换透明无感。

---

### 3.3.2 搭建 Sentinel 哨兵实例（端口 26380）

```bash
[root@master ~]# mkdir -p /data/26380
[root@master ~]# cat >/data/26380/sentinel.conf <<EOF
port 26380
dir "/data/26380"
sentinel monitor mymaster 127.0.0.1 6380 1
-- 监控集群主库（数值 1 表示法定票数 Quorum，有 1 个哨兵认为主库异常即可触发故障转移）
sentinel down-after-milliseconds mymaster 5000
-- 心跳检测超过 5000 毫秒（5秒）无响应则判定为主观下线
sentinel auth-pass mymaster 123
-- 连接主库所使用的认证密码
EOF

# 启动 Sentinel 哨兵服务进程
[root@master ~]# redis-sentinel /data/26380/sentinel.conf &>/tmp/sentinel.log &

# 检查监听端口
[root@master ~]# netstat -lntup | grep 26380
tcp        0      0 0.0.0.0:26380           0.0.0.0:*               LISTEN      6373/redis-sentinel 
tcp6       0      0 :::26380                :::*                    LISTEN      6373/redis-sentinel 
```

---

### 3.3.3 主库宕机自动 Failover 故障转移全流程验证

#### 步骤一：模拟主库 6380 异常宕机
```bash
[root@master ~]# redis-cli -p 6380 -a 123 shutdown
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
```

#### 步骤二：验证从库自动晋升
等待 10 秒后，查看从库 `6381` 与 `6382` 的复制状态：
```bash
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
-- 哨兵已经自动选举 6382 成为新主库，并将 6381 自动重定向指向 6382 同步！
```

#### 步骤三：验证故障原主库恢复重新纳管
```bash
# 重新启动原主库 6380
[root@master ~]# redis-server /data/6380/redis.conf

# 检查当前主库 6382 或从库 6381 的状态：
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
slave_read_repl_offset:996
-- 6380 启动后已被哨兵自动降级为 Slave，挂载到新 Master 6382 下，拓扑自动恢复
```

---

### 3.3.4 Sentinel 常用运维管理命令

```bash
# 连接进入哨兵客户端交互
[root@master ~]# redis-cli -p 26380

# 1. 查询当前监控的主库详细运行状态与配置
127.0.0.1:26380> SENTINEL masters

# 2. 查询指定集群名下的所有从库信息
127.0.0.1:26380> SENTINEL slaves mymaster

# 3. 快速获取当前有效主库的 IP 与端口（客户端寻址核心命令）
127.0.0.1:26380> SENTINEL get-master-addr-by-name mymaster
1) "127.0.0.1"
2) "6382"

# 4. 手动强制触发一次故障切换
127.0.0.1:26380> SENTINEL failover mymaster
OK
```
