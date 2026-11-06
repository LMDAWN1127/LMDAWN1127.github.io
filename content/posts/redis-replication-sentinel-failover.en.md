---
title: "Redis High Availability Practice (Part 3): Master-Replica Replication and Sentinel Automatic Failover"
date: 2026-11-06T16:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Sentinel", "High Availability", "Replication", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Part 3 of the Redis High Availability Practice series: In-depth analysis of the Redis Master-Replica replication mechanism (full BGSAVE synchronization, continuous command propagation, and repl_backlog circular buffer incremental resume), critical warnings against slave data wipeout accidents caused by unpersisted masters, hands-on deployment of a 6380/6381/6382 three-instance replication topology on a single host, and implementation of Sentinel clusters for sub-second subjective/objective down detection, Leader election, and automated failover."
---

# Redis High Availability Practice (Part 3): Master-Replica Replication and Sentinel Automatic Failover

## 3.1 Redis Master-Replica Replication Architecture and Principles

### 3.1.1 Why is Master-Replica Replication Needed?

Even if a single Redis server has RDB and AOF persistence enabled, hardware failures, power outages, or motherboard crashes can still disrupt the entire business service. To mitigate this, Redis provides the **Replication** feature, which automatically and asynchronously replicates data from one primary database (Master) to multiple replica databases (Slave / Replica), thereby achieving:
1. **Multi-replica Disaster Recovery**: Eliminates single points of failure (SPOF);
2. **Read/Write Splitting & Scalability**: The Master node focuses exclusively on write requests, while multiple Slave nodes share massive high-concurrency read requests;
3. **High Availability Foundation**: Serves as the underlying data layer for Sentinel high-availability architectures and Redis Cluster distributed topologies.

---

### 3.1.2 Master-Replica Synchronization Principles In-Depth

```
[Replica: 6381/6382] ──(1. slaveof / send PSYNC ?)──> [Master: 6380]
[Replica: 6381/6382] <──(2. Trigger BGSAVE, transfer RDB snapshot)── [Master: 6380]
[Replica: 6381/6382] (3. Flush stale data & load RDB snapshot)
[Replica: 6381/6382] <──(4. Send new writes from Replication Buffer)── [Master: 6380]
[Replica: 6381/6382] <──(5. Continuous command propagation: set sync)── [Master: 6380]
[Replica: 6381/6382] ──(6. Network reconnect: send PSYNC <runid> <offset>)──> [Master: 6380]
[Replica: 6381/6382] <──(7. Retransmit differential backlog data only)── [Master: 6380]
```

1. **Initial Connection Full Replication (SYNC / Full PSYNC)**:
   - After executing `slaveof <master_ip> <port>`, the replica sends a `PSYNC ? -1` command to the master;
   - Upon receiving the full sync request, the master triggers `BGSAVE` in the background to generate an RDB binary snapshot, while staging all incoming write commands generated during snapshot creation in a dedicated **Replication Buffer**;
   - The master transfers the generated RDB file to the replica. Once received, the replica first flushes its own memory and then loads the RDB file into memory;
   - The master then sends all buffered write commands from the Replication Buffer to the replica for replay, achieving initial data consistency.
2. **Normal Operating Continuous Command Propagation**:
   - Whenever new write operations occur on the master (such as `set`), the master automatically forwards them asynchronously as protocol commands to the replica for execution.
3. **Network Interruption Incremental Replication (PSYNC)**:
   - The master maintains a fixed-size circular **replication backlog buffer (repl_backlog)** and a replication offset in memory;
   - When a temporary connection drop occurs and reconnects, the replica sends a `PSYNC <master_replid> <offset>` request to the master;
   - If the requested offset is still present within the master's circular buffer, the master only retransmits the missing differential slice to the replica, avoiding the costly full RDB dump and reload cycle.

---

### 3.1.3 Key Protection Parameters and Master Persistence Pitfall

#### 1. Data Consistency Protection Parameters (Master Configuration)
```conf
min-slaves-to-write 1
-- At least 1 (or configured count) replica must remain healthy and connected, otherwise the master rejects write requests with an error

min-slaves-max-lag 3
-- Maximum acceptable lag in seconds for replica heartbeat before considering the connection lost
```

#### 2. Production Critical Risk: The Empty-Slave Disaster from Unpersisted Masters

**Critical Warning**: If the master node has persistence completely disabled (neither RDB nor AOF), and the master crashes unexpectedly, its memory state resets to zero. If an external monitoring agent or systemd restart watchdog automatically starts the master back up immediately, the master now boots with **completely empty memory**. It will treat this empty state as authoritative, generate an empty RDB snapshot, and replicate it over to all replicas, instantly wiping out all valid data across the entire cluster!  
**Production Standard**: Master nodes in replication topologies **must have persistence enabled**. If a master without persistence crashes, never start it directly; a replica must first be promoted to become the new master before restoring the crashed node.

---

## 3.2 Single-Host Three-Instance Replication Setup Practice

Three instances are planned on host `master` (`11.0.1.101`):

| Instance Port | Instance Role | Working Directory | Log Path |
| :--- | :--- | :--- | :--- |
| `6380` | Master | `/data/6380` | `/data/6380/redis.log` |
| `6381` | Slave 1 | `/data/6381` | `/data/6381/redis.log` |
| `6382` | Slave 2 | `/data/6382` | `/data/6382/redis.log` |

### Step 1: Create Directories and Write Configuration Files

```bash
[root@master ~]# mkdir -p /data/638{0..2}

# Batch generate configuration files for the three instances (with requirepass 123 and masterauth 123)
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

# Start the three Redis instances
[root@master ~]# redis-server /data/6380/redis.conf
[root@master ~]# redis-server /data/6381/redis.conf
[root@master ~]# redis-server /data/6382/redis.conf

# Verify listening ports
[root@master ~]# netstat -lntup | grep -E '6380|6381|6382'
tcp        0      0 0.0.0.0:6380            0.0.0.0:*               LISTEN      6332/redis-server * 
tcp        0      0 0.0.0.0:6381            0.0.0.0:*               LISTEN      6338/redis-server * 
tcp        0      0 0.0.0.0:6382            0.0.0.0:*               LISTEN      6344/redis-server * 
```

### Step 2: Enable Master-Replica Synchronization and Topology Verification

```bash
# Enable replication on 6381 and 6382 pointing to master 6380
[root@master ~]# redis-cli -p 6381 -a 123 slaveof 127.0.0.1 6380
OK
[root@master ~]# redis-cli -p 6382 -a 123 slaveof 127.0.0.1 6380
OK

# Check replication topology status on master 6380 (both replicas online):
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

# Check replication status on replica 6381:
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

### Step 3: Detach Replica from Master

```bash
# If a replica needs to detach and be promoted to an independent master:
[root@master ~]# redis-cli -p 6382 -a 123 slaveof no one
OK
```

---

## 3.3 Redis Sentinel High Availability Practice

### 3.3.1 Core Value and Component Responsibilities of Sentinel

In standalone master-replica setups, if the Master node fails, replicas cannot promote themselves automatically, requiring manual intervention and resulting in prolonged service outages. Introducing **Sentinel (Sentinel Cluster)** delivers automated, unattended high availability:

- **Monitoring**: Periodically sends PING heartbeats to the master, replicas, and peer Sentinel nodes to verify node health;
- **Automatic Failover**: When the master exceeds the heartbeat timeout, it is marked as subjectively down (sdown); once a quorum of Sentinels reaches objective down (odown) consensus, a Leader is elected via the Raft protocol to select the best replica and promote it to the new Master;
- **Topology Reconfiguration**: Sentinels command remaining replicas to re-point to the new Master, and automatically reconfigure the recovered original Master as a replica upon restart;
- **Client Notification**: Clients query Sentinel to obtain the current active Master IP/Port, making failover transparent to client applications.

---

### 3.3.2 Deploy Sentinel Instance (Port 26380)

```bash
[root@master ~]# mkdir -p /data/26380
[root@master ~]# cat >/data/26380/sentinel.conf <<EOF
port 26380
dir "/data/26380"
sentinel monitor mymaster 127.0.0.1 6380 1
-- Monitor master cluster (1 indicates Quorum; 1 Sentinel consensus triggers failover)
sentinel down-after-milliseconds mymaster 5000
-- Heartbeat timeout beyond 5000ms (5s) marks node as subjectively down (sdown)
sentinel auth-pass mymaster 123
-- Authentication password used to connect to master
EOF

# Start Sentinel service process
[root@master ~]# redis-sentinel /data/26380/sentinel.conf &>/tmp/sentinel.log &

# Verify listening port
[root@master ~]# netstat -lntup | grep 26380
tcp        0      0 0.0.0.0:26380           0.0.0.0:*               LISTEN      6373/redis-sentinel 
tcp6       0      0 :::26380                :::*                    LISTEN      6373/redis-sentinel 
```

---

### 3.3.3 End-to-End Master Failover Validation

#### Step 1: Simulate Master 6380 Crash
```bash
[root@master ~]# redis-cli -p 6380 -a 123 shutdown
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
```

#### Step 2: Verify Replica Auto-Promotion
Wait 10 seconds, then inspect the replication status of replicas `6381` and `6382`:
```bash
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
-- Sentinel automatically elected 6382 as the new master and redirected 6381 to sync from 6382!
```

#### Step 3: Verify Recovered Master Re-joining Topology
```bash
# Restart the original master 6380
[root@master ~]# redis-server /data/6380/redis.conf

# Check status on current master 6382 or replica 6381:
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
slave_read_repl_offset:996
-- 6380 was automatically demoted to a Slave upon restart, attaching to new Master 6382; topology restored
```

---

### 3.3.4 Sentinel Common Operations and Management Commands

```bash
# Connect to Sentinel interactive CLI
[root@master ~]# redis-cli -p 26380

# 1. Inspect detailed running status and configuration of monitored master
127.0.0.1:26380> SENTINEL masters

# 2. Inspect all replicas under the specified cluster name
127.0.0.1:26380> SENTINEL slaves mymaster

# 3. Retrieve IP and port of currently active master (core command for client routing)
127.0.0.1:26380> SENTINEL get-master-addr-by-name mymaster
1) "127.0.0.1"
2) "6382"

# 4. Manually force a failover switch
127.0.0.1:26380> SENTINEL failover mymaster
OK
```
