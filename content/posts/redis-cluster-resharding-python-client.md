---
title: "Redis 分布式实战（四）：Cluster 集群构建、槽位在线扩缩容与 Python 开发"
date: 2026-11-06T17:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cluster", "Python", "High Availability", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 分布式实战系列第四篇：深度剖析 Redis Cluster 16384 哈希槽分片机制与去中心化 Gossip 协议，实战演示 7000~7005 六节点分布式集群规划与一键构建，详述节点在线动态水平扩容、800 槽位平滑迁移（Resharding）与缩容归还下线，并演示基于 Python 客户端对接单实例、Sentinel 哨兵读写分离与 Redis Cluster 分布式操作及兼容性避坑。"
---

# Redis 分布式实战（四）：Cluster 集群构建、槽位在线扩缩容与 Python 开发

## 4.1 Redis Cluster 分布式架构核心原理

单机 Redis 受制于单核 CPU 与单台服务器物理内存上限。当业务数据突破数十 GB、并发吞吐达到数十万 QPS 时，需要采用分布式分片集群。

### 1. 16384 哈希槽（Hash Slot）分片机制
- Redis Cluster 预先分配固定的 **16384 个哈希槽（Slots 0~16383）**，并将这 16384 个槽位均匀打散分配给所有 Master 主节点；
- 存储数据时，对 Key 进行 CRC16 校验并对 16384 取模：
  $$	ext{Slot} = 	ext{CRC16}(Key) \pmod{16384}$$
- 客户端根据计算得出的槽位找到负责该槽位的主节点进行存取；若连接的节点不对，节点会返回 `MOVED` 重定向指令告知客户端正确的节点地址。

### 2. 去中心化与自动故障转移
- 节点之间通过专用的集群总线（端口偏移量 +10000，如 7000 节点的集群总线为 17000）运行 Gossip 协议进行周期性心跳探测；
- 每个主节点对应至少一个从节点；当某个主节点宕机后，集群会自动将对应的从节点晋升为新主节点，整个集群继续对外提供服务。

---

## 4.2 6 节点集群规划与构建实战

### 4.2.1 拓扑规划准备

| 实例端口 | 实例角色 | 工作目录 | 负责哈希槽范围 |
| :--- | :--- | :--- | :--- |
| `7000` | Master 1 | `/data/7000` | `0 ~ 5460`（5461 slots） |
| `7001` | Master 2 | `/data/7001` | `5461 ~ 10922`（5462 slots） |
| `7002` | Master 3 | `/data/7002` | `10923 ~ 16383`（5461 slots） |
| `7003` | Slave 3（对应 7002） | `/data/7003` | 副本备份 |
| `7004` | Slave 1（对应 7000） | `/data/7004` | 副本备份 |
| `7005` | Slave 2（对应 7001） | `/data/7005` | 副本备份 |

---

### 4.2.2 节点配置文件编写与启动

```bash
# 批量创建目录并生成 7000~7005 的配置文件
[root@master ~]# mkdir -p /data/700{0..5}
for p in {7000..7005}; do
cat >/data/${p}/redis.conf <<EOF
port ${p}
daemonize yes
pidfile /data/${p}/redis.pid
loglevel notice
logfile "/data/${p}/redis.log"
dbfilename dump.rdb
dir /data/${p}
protected-mode no
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
EOF
redis-server /data/${p}/redis.conf
done

# 验证 6 个集群实例均已启动
[root@master ~]# ps -ef | grep redis-server | grep cluster
root  6565  1  0 15:11 ?  00:00:00 redis-server *:7000 [cluster]
root  6568  1  0 15:11 ?  00:00:00 redis-server *:7001 [cluster]
root  6575  1  0 15:11 ?  00:00:00 redis-server *:7002 [cluster]
root  6582  1  0 15:11 ?  00:00:00 redis-server *:7003 [cluster]
root  6589  1  0 15:11 ?  00:00:00 redis-server *:7004 [cluster]
root  6596  1  0 15:11 ?  00:00:00 redis-server *:7005 [cluster]
```

---

### 4.2.3 一键建立集群与槽位分配（redis-cli --cluster create）

```bash
[root@master ~]# echo 'yes' | redis-cli --cluster create 127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 --cluster-replicas 1
>>> Performing hash slots allocation on 6 nodes...
Master[0] -> Slots 0 - 5460
Master[1] -> Slots 5461 - 10922
Master[2] -> Slots 10923 - 16383
Adding replica 127.0.0.1:7004 to 127.0.0.1:7000
Adding replica 127.0.0.1:7005 to 127.0.0.1:7001
Adding replica 127.0.0.1:7003 to 127.0.0.1:7002
...
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
```

检查集群拓扑确认：
```bash
[root@master ~]# redis-cli -p 7000 cluster nodes
5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 127.0.0.1:7000@17000 myself,master - 0 1793949082000 1 connected 0-5460
71373159de867b5ce8cb9e9fee99a4fe74df727c 127.0.0.1:7001@17001 master - 0 1793949083000 2 connected 5461-10922
341bfc1b1d01bf1b08e9ec07739648428669ad0d 127.0.0.1:7002@17002 master - 0 1793949083967 3 connected 10923-16383
ca4c281440a099732c2a694c35fa2f8dbe27bb6e 127.0.0.1:7004@17004 slave 5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 0 1793949083000 5 connected
c4b43a6e4da62c52231bc996ca19ee07a25e6e22 127.0.0.1:7005@17005 slave 71373159de867b5ce8cb9e9fee99a4fe74df727c 0 1793949083000 6 connected
867245944a3daeb924c3d66e5f1a1b03f371d1ea 127.0.0.1:7003@17003 slave 341bfc1b1d01bf1b08e9ec07739648428669ad0d 0 1793949083000 4 connected
```

---

## 4.3 集群在线动态扩容（Add Node & Reshard）

业务并发激增时，需要在不停止服务的前提下平滑添加节点并分配哈希槽。

### 步骤一：创建并启动 7006（新主）与 7007（新从）

```bash
mkdir -p /data/700{6,7}
for p in 7006 7007; do
cat >/data/${p}/redis.conf <<EOF
port ${p}
daemonize yes
pidfile /data/${p}/redis.pid
loglevel notice
logfile "/data/${p}/redis.log"
dbfilename dump.rdb
dir /data/${p}
protected-mode no
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
EOF
redis-server /data/${p}/redis.conf
done
```

### 步骤二：将 7006 作为 Master 加入集群

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7000
>>> Adding node 127.0.0.1:7006 to cluster 127.0.0.1:7000
...
>>> Send CLUSTER MEET to node 127.0.0.1:7006 to make it join the cluster.
[OK] New node added correctly.

# 查看 7006 的节点 ID（此时尚未分配任何 Slot）：
[root@master ~]# redis-cli -p 7000 cluster nodes | grep 7006
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949142057 0 connected
```

### 步骤三：在线迁移 800 个槽位至 7006（Resharding 重分片）

```bash
# 获取 7000 与 7006 的 Node ID
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')

# 将 7000 上的 800 个槽位在线重分片转移到 7006：
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7000 --cluster-to $ID_7006 --cluster-slots 800 --cluster-yes
Ready to move 800 slots.
  Source nodes: M: 5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 127.0.0.1:7000
  Destination node: M: aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006
Moving slot 0 ~ 799 from 127.0.0.1:7000 to 127.0.0.1:7006...
```

### 步骤四：添加从节点 7007 挂载向 7006

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7007 127.0.0.1:7000 --cluster-slave --cluster-master-id $ID_7006
>>> Adding node 127.0.0.1:7007 to cluster 127.0.0.1:7000
...
>>> Configure node as replica of 127.0.0.1:7006.
[OK] New node added correctly.

# 检查 7006 与 7007 主从状态：
[root@master ~]# redis-cli -p 7000 cluster nodes | grep -E '7006|7007'
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949162000 7 connected 0-799
8023a28d56a02989a0db7994502f182e6ac808bd 127.0.0.1:7007@17007 slave aaa204f9be194ae2640be58552d24446da1c83bb 0 1793949162547 0 connected
```

---

## 4.4 集群在线动态缩容（Reshard 归还槽位 & Del Node）

下线节点时，**必须先将该主节点上的所有槽位完整迁移归还给其他主节点**，否则直接删除会导致集群槽位残缺而拒绝服务。

```bash
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')
ID_7007=$(redis-cli -p 7000 cluster nodes | grep 7007 | awk '{print $1}')

# 1. 将 7006 上的 800 个槽位完整归还给 7000
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7006 --cluster-to $ID_7000 --cluster-slots 800 --cluster-yes

# 2. 下线删除 7007 从节点
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7007 $ID_7007
>>> Removing node 8023a28d56a02989a0db7994502f182e6ac808bd from cluster 127.0.0.1:7007
[OK] Node deleted.

# 3. 下线删除 7006 主节点
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7006 $ID_7006
>>> Removing node aaa204f9be194ae2640be58552d24446da1c83bb from cluster 127.0.0.1:7006
[OK] Node deleted.
```

---

## 4.5 Python 客户端接口调用开发

### 4.5.1 Python 环境与库依赖准备

在 CentOS 7 上安装 Python 3 环境与 Redis SDK：

```bash
[root@master ~]# yum install -y python3 python3-pip
[root@master ~]# python3 -V
Python 3.6.8
```

**版本兼容性踩坑避雷**：若使用 `redis-py-cluster 2.1.3`，该库底层依赖了旧版 `redis._compat` 模块。如果直接安装最新版 `redis 4.x`，会抛出 `ModuleNotFoundError: No module named 'redis._compat'` 异常  
**正确安装方式**：锁定安装 `redis==3.5.3` 经典兼容版本：

> ```bash
> pip3 install "redis==3.5.3" redis-py-cluster -i https://mirrors.aliyun.com/pypi/simple/
> ```

---

### 4.5.2 Python 连接 Redis 单实例

```python
import redis

# 连接 11.0.1.101 单实例（6379 端口）
r = redis.StrictRedis(host='11.0.1.101', port=6379, db=0, password='123456')
r.set('dawn', 'xiaoQ')
print(r.get('dawn'))  # 输出: b'xiaoQ'
```

---

### 4.5.3 Python 集成 Sentinel 哨兵实现读写分离

客户端直连 Sentinel 哨兵集群（`26380`），由哨兵自动解析获取当前的 Master（写入）与 Slaves（读取），实现代码级读写分离：

```python
from redis.sentinel import Sentinel

# 1. 连接 Sentinel 哨兵集群
sentinel = Sentinel([('localhost', 26380)], socket_timeout=0.1)

# 2. 自动探测集群主从拓扑
master_addr = sentinel.discover_master('mymaster')
slaves_addr = sentinel.discover_slaves('mymaster')
print('Master 节点地址:', master_addr)  # 例如: ('127.0.0.1', 6382)
print('Slaves 节点地址:', slaves_addr)   # 例如: [('127.0.0.1', 6381), ('127.0.0.1', 6380)]

# 3. 读写分离路由：写 Master，读 Slave
master = sentinel.master_for('mymaster', socket_timeout=0.1, password='123')
slave = sentinel.slave_for('mymaster', socket_timeout=0.1, password='123')

# 4. 执行读写测试
master.set('dawn', '123')
print('从库读取数据结果: slave.get("dawn") =', slave.get('dawn'))  # 输出: b'123'
```

---

### 4.5.4 Python 直连 Redis Cluster 分布式集群

通过 `rediscluster.RedisCluster` 客户端连接集群，客户端会自动根据键的 CRC16 槽位路由存取，屏蔽底层分片细节：

```python
from rediscluster import RedisCluster

# 任意指定集群中若干种子节点即可自动发现全集群拓扑
startup_nodes = [
    {"host": "127.0.0.1", "port": "7000"},
    {"host": "127.0.0.1", "port": "7001"},
    {"host": "127.0.0.1", "port": "7002"}
]

rc = RedisCluster(startup_nodes=startup_nodes, decode_responses=True)
rc.set("foo", "bar")
print('集群读取验证: rc.get("foo") =', rc.get("foo"))  # 输出: bar
```
