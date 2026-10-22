---
title: "ZooKeeper 集群搭建与高可用验证实战"
date: 2026-10-22T11:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ZooKeeper"]
showToc: true
summary: "ZooKeeper 三节点集群实战：集群规模选择依据、13+1 步搭建流程（zoo.cfg/myid/systemd/免密登录），以及停 leader、停 follower 的故障演练，解读过半存活（quorum）机制。"
---

zookeeper集群规模选择说明
  如果读的请求大约在75%以下，建议选择3台。官方测试了910个客户端。

  官方文档：
https://zookeeper.apache.org/doc/current/zookeeperOver.html

## zookeeper集群搭建

### 1. 下载zookeeper

```bash
root@elk01:~# wget https://archive.apache.org/dist/zookeeper/zookeeper-3.8.4/apache-zookeeper-3.8.4-bin.tar.gz
```

### 2. 创建工作目录

```bash
root@elk01:~# mkdir -pv /dawn/{softwares,data,logs}/
root@elk02:~# mkdir -pv /dawn/{softwares,data,logs}/
root@elk03:~# mkdir -pv /dawn/{softwares,data,logs}/
```

### 3. 解压软件包

```bash
root@elk01:~# tar xf apache-zookeeper-3.8.4-bin.tar.gz -C /dawn/softwares/
```

### 4. 拷贝配置文件

```bash
root@elk01:~# cp /dawn/softwares/apache-zookeeper-3.8.4-bin/conf/zoo{_sample.cfg,.cfg}
root@elk01:~# ll /dawn/softwares/apache-zookeeper-3.8.4-bin/conf/zoo*
-rw-r--r-- 1 root root 1183 Oct 21 21:12 /dawn/softwares/apache-zookeeper-3.8.4-bin/conf/zoo.cfg
-rw-r--r-- 1 dawn dawn 1183 Feb 13  2024 /dawn/softwares/apache-zookeeper-3.8.4-bin/conf/zoo_sample.cfg
```

### 5. 修改zookeeper的集群地址

```bash
root@elk01:~# vim  /dawn/softwares/apache-zookeeper-3.8.4-bin/conf/zoo.cfg 
# 定义最小单元的时间范围tick。
tickTime=2000
# 启动时最长等待tick数量。
initLimit=5
# 数据同步时最长等待的tick时间进行响应ACK
syncLimit=2
# 指定数据目录
dataDir=/dawn/data/zk
# 监听端口
clientPort=2181
# 开启四字命令允许所有的节点访问。
4lw.commands.whitelist=*
# server.ID=A:B:C[:D]
# ID:
#    zk的唯一编号。
# A:
#    zk的主机地址。
# B:
#    leader的选举端口，是谁leader角色，就会监听该端口。
# C: 
#    数据通信端口。
# D:
#    可选配置，指定角色。
server.1=11.0.1.111:5888:6888
server.2=11.0.1.112:5888:6888
server.3=11.0.1.113:5888:6888
## Metrics Providers
#
# https://prometheus.io Metrics Exporter
#metricsProvider.className=org.apache.zookeeper.metrics.prometheus.PrometheusMetricsProvider
#metricsProvider.httpHost=0.0.0.0
#metricsProvider.httpPort=7000
#metricsProvider.exportJvmInfo=true
```

### 6. 同步配置文件到其他节点

```bash
root@elk01:~# scp -r /dawn/softwares/apache-zookeeper-3.8.4-bin/ 11.0.1.112:/dawn/softwares/

root@elk01:~# scp -r /dawn/softwares/apache-zookeeper-3.8.4-bin/ 11.0.1.113:/dawn/softwares/
```

### 7. 添加hosts文件解析

```bash
root@elk01:~# cat >> /etc/hosts <<EOF
11.0.1.111 elk01
11.0.1.112 elk02
11.0.1.113 elk03
EOF
```

### 8. 配置免密登录

```bash
root@elk01:~# ssh-keygen -t rsa -f ~/.ssh/id_rsa -P '' -q
root@elk01:~# ssh-copy-id elk01
root@elk01:~# ssh-copy-id elk02
root@elk01:~# ssh-copy-id elk03
```

### 9. 准备myID文件

```bash
root@elk01:~# for ((i=1; i<=3; i++)); do
    host_id=$(printf "%02d" "$i")
    ssh "elk${host_id}" "mkdir -p /dawn/data/zk && echo ${i} > /dawn/data/zk/myid"
done
root@elk01:~# more /dawn/data/zk/myid
1
root@elk02:~# more /dawn/data/zk/myid 
2
root@elk03:~# more /dawn/data/zk/myid 
3
```

### 10. 编写启动脚本

```bash
root@elk01:~# cat > /lib/systemd/system/zk.service <<EOF
[Unit]
Description=dawn zookeeper server
After=network.target

[Service]
Type=forking
Environment=JAVA_HOME=/usr/share/elasticsearch/jdk
ExecStart=/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkServer.sh start 

[Install]
WantedBy=multi-user.target
EOF
```

```bash
root@elk01:~# scp /lib/systemd/system/zk.service elk02:/lib/systemd/system/
zk.service        100%  251   180.4KB/s   00:00
root@elk01:~# scp /lib/systemd/system/zk.service elk03:/lib/systemd/system/
zk.service        100%  251   288.0KB/s   00:00
```

### 11. 启动zookeeper集群

```bash
# 三个节点都要执行
systemctl daemon-reload
systemctl enable --now zk
systemctl status zk
```

### 12. 检查端口是否监听

```bash
root@elk01:~# ss -ntl | grep 2181
LISTEN 0      50                      *:2181             *:*          
root@elk02:~# ss -ntl | grep 2181
LISTEN 0      50                      *:2181             *:*          
root@elk03:~# ss -ntl | grep 2181
LISTEN 0      50                      *:2181             *:*          
```

### 13. 配置环境变量

```bash
root@elk01:~# vim /etc/profile.d/zk.sh
```

```bash
#!/bin/bash

export JAVA_HOME=/usr/share/elasticsearch/jdk
export ZK_HOME=/dawn/softwares/apache-zookeeper-3.8.4-bin
export PATH=$PATH:$ZK_HOME/bin:$JAVA_HOME/bin
```

```bash
root@elk01:~# scp /etc/profile.d/zk.sh elk02:/etc/profile.d/
zk.sh             100%  163    99.6KB/s   00:00
root@elk01:~# scp /etc/profile.d/zk.sh elk03:/etc/profile.d/
zk.sh             100%  163   167.0KB/s   00:00
```

```bash
# 三个节点都要执行
source /etc/profile.d/zk.sh
```

### 14. 连接zookeeper集群

```bash
root@elk01:~# zkCli.sh -server 11.0.1.111:2181,11.0.1.112:2181,11.0.1.113:2181
```

## 验证zookeeper高可用集群

### 1. 查看zookeeper集群的状态

```bash
root@elk01:~# zkServer.sh status
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Client port found: 2181. Client address: localhost. Client SSL: false.
Mode: follower

root@elk02:~# zkServer.sh status
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Client port found: 2181. Client address: localhost. Client SSL: false.
Mode: leader

root@elk03:~# zkServer.sh status
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Client port found: 2181. Client address: localhost. Client SSL: false.
Mode: follower
```

### 2. 停止leader节点elk02

```bash
root@elk02:~# zkServer.sh stop
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Stopping zookeeper ... STOPPED
```

### 3. 再次查看集群信息

```bash
root@elk01:~# zkServer.sh status
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Client port found: 2181. Client address: localhost. Client SSL: false.
Mode: follower

root@elk02:~# zkServer.sh status
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Client port found: 2181. Client address: localhost. Client SSL: false.
Error contacting service. It is probably not running.

root@elk03:~# zkServer.sh status
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Client port found: 2181. Client address: localhost. Client SSL: false.
Mode: leader
```

### 4. 停止follower节点elk03

```bash
root@elk03:~# zkServer.sh stop
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Stopping zookeeper ... STOPPED
```

### 5. 集群崩溃

```bash
root@elk01:~# zkServer.sh status
ZooKeeper JMX enabled by default
Using config: /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
Client port found: 2181. Client address: localhost. Client SSL: false.
Error contacting service. It is probably not running.
```

1. 此时仅剩 elk01 一个节点。它自始至终都是 follower（leader 是先后被停掉的 elk02、elk03），但 3 节点集群至少要 2 票才能过半，票数不足时 ZooKeeper 会自动退出服务——所以 elk01 显示 "Error contacting service"，并非它自身崩溃

2. 对于分布式集群，节点必须半数以上存活，和ES类似
