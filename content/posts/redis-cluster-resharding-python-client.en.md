---
title: "Redis Distributed Practice (Part 4): Cluster Architecture, Online Resharding, and Python Client Development"
date: 2026-11-06T17:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cluster", "Python", "High Availability", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Part 4 of the Redis Distributed Practice series: In-depth analysis of the Redis Cluster 16384 hash slots sharding mechanism and decentralized Gossip protocol, hands-on deployment of a 7000~7005 six-node distributed cluster, live horizontal scaling with 800 slots resharding, graceful node decommissioning, and Python client integration with standalone instances, Sentinel read/write splitting, and Redis Cluster with compatibility pitfall solutions."
---

# Redis Distributed Practice (Part 4): Cluster Architecture, Online Resharding, and Python Client Development

## 4.1 Redis Cluster Distributed Architecture Core Principles

A single-instance Redis deployment is constrained by single-core CPU throughput and host physical memory limits. When business data scales beyond tens of gigabytes and concurrency throughput reaches hundreds of thousands of QPS, adopting a distributed sharded cluster becomes necessary.

### 1. 16384 Hash Slot Sharding Mechanism
- Redis Cluster pre-allocates a fixed set of **16384 hash slots (Slots 0~16383)**, distributing these 16384 slots evenly among all Master nodes;
- When storing data, the Key is calculated using CRC16 checksum modulo 16384:
  $$\text{Slot} = \text{CRC16}(Key) \pmod{16384}$$
- The client routes read and write operations to the Master node responsible for the calculated slot; if connected to an incorrect node, the node responds with a `MOVED` redirection directive guiding the client to the correct node address.

### 2. Decentralization and Automatic Failover
- Cluster nodes communicate over dedicated cluster bus channels (port offset +10000, e.g., port 17000 for node 7000) running the Gossip protocol for periodic heartbeat discovery;
- Each Master corresponds to at least one Slave replica; when a Master node fails, the cluster automatically promotes its corresponding Slave to become the new Master, ensuring continuous service availability.

---

## 4.2 Six-Node Cluster Planning and Deployment Practice

### 4.2.1 Topology Planning and Preparation

| Instance Port | Instance Role | Working Directory | Allocated Hash Slot Range |
| :--- | :--- | :--- | :--- |
| `7000` | Master 1 | `/data/7000` | `0 ~ 5460` (5461 slots) |
| `7001` | Master 2 | `/data/7001` | `5461 ~ 10922` (5462 slots) |
| `7002` | Master 3 | `/data/7002` | `10923 ~ 16383` (5461 slots) |
| `7003` | Slave 3 (for 7002) | `/data/7003` | Replica Backup |
| `7004` | Slave 1 (for 7000) | `/data/7004` | Replica Backup |
| `7005` | Slave 2 (for 7001) | `/data/7005` | Replica Backup |

---

### 4.2.2 Node Configuration Creation and Startup

```bash
# Batch create directories and generate configurations for ports 7000~7005
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

# Verify all 6 cluster instances are running
[root@master ~]# ps -ef | grep redis-server | grep cluster
root  6565  1  0 15:11 ?  00:00:00 redis-server *:7000 [cluster]
root  6568  1  0 15:11 ?  00:00:00 redis-server *:7001 [cluster]
root  6575  1  0 15:11 ?  00:00:00 redis-server *:7002 [cluster]
root  6582  1  0 15:11 ?  00:00:00 redis-server *:7003 [cluster]
root  6589  1  0 15:11 ?  00:00:00 redis-server *:7004 [cluster]
root  6596  1  0 15:11 ?  00:00:00 redis-server *:7005 [cluster]
```

---

### 4.2.3 One-Click Cluster Creation and Slot Allocation (redis-cli --cluster create)

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

Verify cluster topology:
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

## 4.3 Live Online Cluster Scaling (Add Node & Reshard)

When business concurrency surges, nodes need to be dynamically added and hash slots redistributed without interrupting running services.

### Step 1: Create and Start 7006 (New Master) and 7007 (New Replica)

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

### Step 2: Add 7006 to Cluster as Master

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7000
>>> Adding node 127.0.0.1:7006 to cluster 127.0.0.1:7000
...
>>> Send CLUSTER MEET to node 127.0.0.1:7006 to make it join the cluster.
[OK] New node added correctly.

# Inspect Node ID of 7006 (no slots assigned yet):
[root@master ~]# redis-cli -p 7000 cluster nodes | grep 7006
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949142057 0 connected
```

### Step 3: Online Migration of 800 Slots to 7006 (Resharding)

```bash
# Retrieve Node IDs for 7000 and 7006
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')

# Online reshard 800 slots from 7000 to 7006:
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7000 --cluster-to $ID_7006 --cluster-slots 800 --cluster-yes
Ready to move 800 slots.
  Source nodes: M: 5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 127.0.0.1:7000
  Destination node: M: aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006
Moving slot 0 ~ 799 from 127.0.0.1:7000 to 127.0.0.1:7006...
```

### Step 4: Attach Replica 7007 to Master 7006

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7007 127.0.0.1:7000 --cluster-slave --cluster-master-id $ID_7006
>>> Adding node 127.0.0.1:7007 to cluster 127.0.0.1:7000
...
>>> Configure node as replica of 127.0.0.1:7006.
[OK] New node added correctly.

# Verify master-replica topology for 7006 and 7007:
[root@master ~]# redis-cli -p 7000 cluster nodes | grep -E '7006|7007'
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949162000 7 connected 0-799
8023a28d56a02989a0db7994502f182e6ac808bd 127.0.0.1:7007@17007 slave aaa204f9be194ae2640be58552d24446da1c83bb 0 1793949162547 0 connected
```

---

## 4.4 Live Online Cluster Shrinking (Reshard Return Slots & Del Node)

When decommissioning nodes, **all slots on the master node must first be completely returned to other master nodes**; deleting the node directly causes slot gaps and cluster-wide rejection of service.

```bash
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')
ID_7007=$(redis-cli -p 7000 cluster nodes | grep 7007 | awk '{print $1}')

# 1. Return all 800 slots on 7006 back to 7000
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7006 --cluster-to $ID_7000 --cluster-slots 800 --cluster-yes

# 2. Decommission and remove replica node 7007
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7007 $ID_7007
>>> Removing node 8023a28d56a02989a0db7994502f182e6ac808bd from cluster 127.0.0.1:7007
[OK] Node deleted.

# 3. Decommission and remove master node 7006
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7006 $ID_7006
>>> Removing node aaa204f9be194ae2640be58552d24446da1c83bb from cluster 127.0.0.1:7006
[OK] Node deleted.
```

---

## 4.5 Python Client Development and API Usage

### 4.5.1 Python Environment and Dependency Setup

Install Python 3 environment and Redis SDK on CentOS 7:

```bash
[root@master ~]# yum install -y python3 python3-pip
[root@master ~]# python3 -V
Python 3.6.8
```

**Version Compatibility Warning**: If using `redis-py-cluster 2.1.3`, the library internally depends on the legacy `redis._compat` module. Installing the latest `redis 4.x` directly causes `ModuleNotFoundError: No module named 'redis._compat'`  
**Correct Installation Command**: Pin to `redis==3.5.3` for compatibility:

> ```bash
> pip3 install "redis==3.5.3" redis-py-cluster -i https://mirrors.aliyun.com/pypi/simple/
> ```

---

### 4.5.2 Python Connecting to Standalone Redis

```python
import redis

# Connect to 11.0.1.101 standalone instance (port 6379)
r = redis.StrictRedis(host='11.0.1.101', port=6379, db=0, password='123456')
r.set('dawn', 'xiaoQ')
print(r.get('dawn'))  # Output: b'xiaoQ'
```

---

### 4.5.3 Python Integration with Sentinel for Read/Write Splitting

Clients connect directly to the Sentinel cluster (`26380`). Sentinel automatically discovers the active Master (for writes) and Slaves (for reads), enabling code-level read/write separation:

```python
from redis.sentinel import Sentinel

# 1. Connect to Sentinel cluster
sentinel = Sentinel([('localhost', 26380)], socket_timeout=0.1)

# 2. Automatically discover topology
master_addr = sentinel.discover_master('mymaster')
slaves_addr = sentinel.discover_slaves('mymaster')
print('Master Node Address:', master_addr)  # e.g.: ('127.0.0.1', 6382)
print('Slaves Node Addresses:', slaves_addr)   # e.g.: [('127.0.0.1', 6381), ('127.0.0.1', 6380)]

# 3. Read/write routing: writes to Master, reads from Slave
master = sentinel.master_for('mymaster', socket_timeout=0.1, password='123')
slave = sentinel.slave_for('mymaster', socket_timeout=0.1, password='123')

# 4. Perform read/write test
master.set('dawn', '123')
print('Slave Read Verification: slave.get("dawn") =', slave.get('dawn'))  # Output: b'123'
```

---

### 4.5.4 Python Connecting Directly to Redis Cluster

Connect via `rediscluster.RedisCluster`. The client automatically computes CRC16 slot routing for read and write operations, transparently managing sharding details:

```python
from rediscluster import RedisCluster

# Specify seed nodes to auto-discover full cluster topology
startup_nodes = [
    {"host": "127.0.0.1", "port": "7000"},
    {"host": "127.0.0.1", "port": "7001"},
    {"host": "127.0.0.1", "port": "7002"}
]

rc = RedisCluster(startup_nodes=startup_nodes, decode_responses=True)
rc.set("foo", "bar")
print('Cluster Read Verification: rc.get("foo") =', rc.get("foo"))  # Output: bar
```
