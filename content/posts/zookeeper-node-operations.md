---
title: "ZooKeeper 节点操作实战：常用命令、znode 类型与 watch 机制"
date: 2026-10-22T12:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ZooKeeper"]
showToc: true
summary: "ZooKeeper 客户端实战：ls/create/get/set/delete/deleteall 增删改查命令、持久/临时/顺序三种 znode 类型辨析（含 stat 字段解读），以及 watch 一次性事件机制。"
---

## zookeeper集群的常用命令增删改查

### 1. 查看zookeeper node列表

```bash
[zk: 11.0.1.113:2181(CONNECTED) 0] ls /
[zookeeper]
[zk: 11.0.1.113:2181(CONNECTED) 1]
```

### 2. 创建zookeeper node并存储数据

```bash
[zk: 11.0.1.113:2181(CONNECTED) 2] create /dawn xixi
Created /dawn
[zk: 11.0.1.113:2181(CONNECTED) 3] 
[zk: 11.0.1.113:2181(CONNECTED) 3] ls /
[dawn, zookeeper]
[zk: 11.0.1.113:2181(CONNECTED) 4] 
[zk: 11.0.1.113:2181(CONNECTED) 4] ls /dawn 
[]
[zk: 11.0.1.113:2181(CONNECTED) 5] 
```

### 3. 创建zookeeper node不存储数据

```bash
[zk: 11.0.1.113:2181(CONNECTED) 5] create /dawn/devops
Created /dawn/devops
[zk: 11.0.1.113:2181(CONNECTED) 6] 
[zk: 11.0.1.113:2181(CONNECTED) 6] get /dawn 
xixi
[zk: 11.0.1.113:2181(CONNECTED) 7] 
[zk: 11.0.1.113:2181(CONNECTED) 7] get /dawn/devops
null
[zk: 11.0.1.113:2181(CONNECTED) 8] 
```

### 4. 修改zookeeper node的数据

```bash
[zk: 11.0.1.113:2181(CONNECTED) 8] get /dawn/devops
null
[zk: 11.0.1.113:2181(CONNECTED) 9] 
[zk: 11.0.1.113:2181(CONNECTED) 9] set /dawn/devops haha
[zk: 11.0.1.113:2181(CONNECTED) 10] 
[zk: 11.0.1.113:2181(CONNECTED) 10] get /dawn/devops
haha
[zk: 11.0.1.113:2181(CONNECTED) 11] 
```

### 5. 删除zookeeper node(必须为空)

```bash
[zk: 11.0.1.113:2181(CONNECTED) 18] ls /dawn/devops 
[1, 2, 3]
[zk: 11.0.1.113:2181(CONNECTED) 19] 
[zk: 11.0.1.113:2181(CONNECTED) 19] 
[zk: 11.0.1.113:2181(CONNECTED) 19] ls /dawn/devops/3 
[]
[zk: 11.0.1.113:2181(CONNECTED) 20] 
[zk: 11.0.1.113:2181(CONNECTED) 20] delete /dawn/devops/3 
[zk: 11.0.1.113:2181(CONNECTED) 21] 
[zk: 11.0.1.113:2181(CONNECTED) 21] ls /dawn/devops 
[1, 2]
[zk: 11.0.1.113:2181(CONNECTED) 22] 
```

### 6. 删除zookeeper node(递归删除)

```bash
[zk: 11.0.1.113:2181(CONNECTED) 22] ls /dawn/devops 
[1, 2]
[zk: 11.0.1.113:2181(CONNECTED) 23] 
[zk: 11.0.1.113:2181(CONNECTED) 23] 
[zk: 11.0.1.113:2181(CONNECTED) 23] delete /dawn/devops 
Node not empty: /dawn/devops
[zk: 11.0.1.113:2181(CONNECTED) 24] 
[zk: 11.0.1.113:2181(CONNECTED) 24] ls /dawn/devops 
[1, 2]
[zk: 11.0.1.113:2181(CONNECTED) 25] 
[zk: 11.0.1.113:2181(CONNECTED) 25] deleteall /dawn/devops 
[zk: 11.0.1.113:2181(CONNECTED) 26] 
[zk: 11.0.1.113:2181(CONNECTED) 26] ls /dawn/devops 
Node does not exist: /dawn/devops
[zk: 11.0.1.113:2181(CONNECTED) 27]  
```

## zookeeper集群的zookeeper node类型

### 1. zookeeper node类型

- 临时zookeeper node
  当客户端链接断开时，超出了一定的时间范围（默认30s），则自动删除该zookeeper node。

- 永久zookeeper node
  当客户端断开链接时，zookeeper node并不会被删除，除非手动删除。

### 2. 创建临时zookeeper node

```bash
[zk: 11.0.1.113:2181(CONNECTED) 3] create /dawn/devops
Created /dawn/devops
[zk: 11.0.1.113:2181(CONNECTED) 4] create -e /dawn/k8s
Created /dawn/k8s
```

### 3. 查看zookeeper node的状态信息

```bash
[zk: 11.0.1.113:2181(CONNECTED) 5] stat /dawn/devops
cZxid = 0x700000005
ctime = Thu Oct 22 11:45:16 CST 2026
mZxid = 0x700000005
mtime = Thu Oct 22 11:45:16 CST 2026
pZxid = 0x700000005
cversion = 0
dataVersion = 0
aclVersion = 0
ephemeralOwner = 0x0
dataLength = 0
numChildren = 0
[zk: 11.0.1.113:2181(CONNECTED) 6] stat /dawn/k8s
cZxid = 0x700000006
ctime = Thu Oct 22 11:45:28 CST 2026
mZxid = 0x700000006
mtime = Thu Oct 22 11:45:28 CST 2026
pZxid = 0x700000006
cversion = 0
dataVersion = 0
aclVersion = 0
ephemeralOwner = 0x3000030b6010001
dataLength = 0
numChildren = 0
[zk: 11.0.1.113:2181(CONNECTED) 7]
```

![image-20261022115101803](/images/zookeeper-node-operations-image-20261022115101803.png)

### 4. 断开会话

```bash
[zk: 11.0.1.113:2181(CONNECTED) 8] quit
```

quit 退出客户端，直接关闭终端也可以。注意服务端不会立刻销毁会话，需等 negotiated timeout（默认 30s，见上一节截图里的 session 建立信息）超时后才清理，临时 znode 也是这时才被删除——下一节重连后可以观察到。

### 5. 新建一个会话

```bash
[zk: 11.0.1.113:2181(CONNECTED) 4] ls /dawn
[devops]
```

发现临时的zookeeper node(简称"znode")默认会在30s内自动删除

### 6. 创建顺序znode（sequential）

```bash
[zk: 11.0.1.113:2181(CONNECTED) 22] create -s /dawn/4
Created /dawn/40000000008
[zk: 11.0.1.113:2181(CONNECTED) 23] create -s /dawn/5
Created /dawn/50000000009
[zk: 11.0.1.113:2181(CONNECTED) 24] create -s /dawn/6
Created /dawn/60000000010
[zk: 11.0.1.113:2181(CONNECTED) 25] stat /dawn/40000000008
cZxid = 0x700000017
ctime = Thu Oct 22 12:03:09 CST 2026
mZxid = 0x700000017
mtime = Thu Oct 22 12:03:09 CST 2026
pZxid = 0x700000017
cversion = 0
dataVersion = 0
aclVersion = 0
ephemeralOwner = 0x0
dataLength = 0
numChildren = 0
[zk: 11.0.1.113:2181(CONNECTED) 26] stat /dawn/50000000009
cZxid = 0x700000018
ctime = Thu Oct 22 12:03:12 CST 2026
mZxid = 0x700000018
mtime = Thu Oct 22 12:03:12 CST 2026
pZxid = 0x700000018
cversion = 0
dataVersion = 0
aclVersion = 0
ephemeralOwner = 0x0
dataLength = 0
numChildren = 0
[zk: 11.0.1.113:2181(CONNECTED) 27] stat /dawn/60000000010
cZxid = 0x700000019
ctime = Thu Oct 22 12:03:15 CST 2026
mZxid = 0x700000019
mtime = Thu Oct 22 12:03:15 CST 2026
pZxid = 0x700000019
cversion = 0
dataVersion = 0
aclVersion = 0
ephemeralOwner = 0x0
dataLength = 0
numChildren = 0
[zk: 11.0.1.113:2181(CONNECTED) 28]
```

-s 表示 sequential（顺序）：ZooKeeper 会在节点名后自动追加一个 10 位单调递增序号（由事务 id 生成），所以 /dawn/4 实际建成 /dawn/40000000008，反复创建同名节点也不会冲突，常用于分布式队列、发号器这类场景。

顺序节点默认仍是持久节点（上面的 stat 输出里 ephemeralOwner = 0x0 可印证）；要临时顺序节点就把两个 flag 叠加：create -e -s /dawn/7。

## zookeeper集群的watch机制

客户端可以监控znode状态，一旦发生变化，就立刻通知客户端。watch事件是一次性的。

```bash
[zk: 11.0.1.112:2181(CONNECTED) 43] get -w /dawn 
[zk: 11.0.1.112:2181(CONNECTED) 44] ls -w /dawn
```
