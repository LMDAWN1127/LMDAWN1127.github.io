---
title: "Kafka 实战：单点与集群部署及核心术语"
date: 2026-10-22T14:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kafka"]
showToc: true
summary: "Kafka 3.7.1 实战：单点部署（对接已有 ZooKeeper 集群）、三节点集群搭建（broker.id 差异化配置与启动验证）、临时 znode 注册关系印证，以及 cluster/broker/producer/consumer/topic/partition/replica 核心术语梳理。"
---

## kafka单点环境部署

### 1. 下载kafka软件包

```bash
root@elk01:~# wget https://archive.apache.org/dist/kafka/3.7.1/kafka_2.13-3.7.1.tgz
```

### 2. 解压软件包

```bash
root@elk01:~# tar xf kafka_2.13-3.7.1.tgz  -C /dawn/softwares/
```

### 3. 修改kafka的配置文件

```bash
root@elk01:~# vim  /dawn/softwares/kafka_2.13-3.7.1/config/server.properties
```

```properties
...
# 指定节点的唯一标识
broker.id=1
# 指定数据存储路径
log.dirs=/dawn/data/kafka-logs
# 指定zookeeper集群存储的路径
zookeeper.connect=11.0.1.111:2181,11.0.1.112:2181,11.0.1.113:2181/dawn-kafka371
```

### 4. 配置环境变量

```bash
root@elk01:~# vim /etc/profile.d/kafka.sh
```

```bash
#!/bin/bash

export KAFKA_HOME=/dawn/softwares/kafka_2.13-3.7.1
export PATH=$PATH:${KAFKA_HOME}/bin
```

```bash
root@elk01:~# source /etc/profile.d/kafka.sh
```

### 5. 启动kafka节点

```bash
root@elk01:~# kafka-server-start.sh -daemon $KAFKA_HOME/config/server.properties 
```

### 6. 检查kafka在zookeeper集群的初始化信息

查看"/dawn-kafka371/brokers/ids/1"路径即可

发现"1"的znode是一个临时的zookeeper node

![image-20261022140000554](/images/kafka-deployment-terminology-image-20261022140000554.png)

### 7. 停止kafka服务

```bash
root@elk01:~# kafka-server-stop.sh 
```

### 8. 再次检查kafka在zookeeper集群的初始化信息

查看"/dawn-kafka371/brokers/ids/1"路径即可

发现"1"的znode是一个临时的zookeeper node消失了

![image-20261022140126115](/images/kafka-deployment-terminology-image-20261022140126115.png)

## kafka集群环境搭建

### 1.01节点同步配置到其他节点

```bash
root@elk01:~# scp -r /dawn/softwares/kafka_2.13-3.7.1/ elk02:/dawn/softwares/
root@elk01:~# scp -r /dawn/softwares/kafka_2.13-3.7.1/ elk03:/dawn/softwares/
root@elk01:~# scp /etc/profile.d/kafka.sh elk02:/etc/profile.d/
root@elk01:~# scp /etc/profile.d/kafka.sh elk03:/etc/profile.d/
```

### 2.02节点操作

```bash
[root@elk02 ~]# source /etc/profile.d/kafka.sh 
[root@elk02 ~]# grep "^broker.id" $KAFKA_HOME/config/server.properties 
broker.id=1
[root@elk02 ~]# sed -i '/^broker.id/s#1#2#' $KAFKA_HOME/config/server.properties 
[root@elk02 ~]# grep "^broker.id" $KAFKA_HOME/config/server.properties 
broker.id=2
```

### 3.03节点操作

```bash
root@elk03:~# source /etc/profile.d/kafka.sh
[root@elk03 ~]# grep "^broker.id" $KAFKA_HOME/config/server.properties 
broker.id=1 
[root@elk03 ~]# sed -i '/^broker.id/s#1#3#' $KAFKA_HOME/config/server.properties
[root@elk03 ~]# grep "^broker.id" $KAFKA_HOME/config/server.properties 
broker.id=3
```

### 4. 启动kafka集群

```bash
root@elk01:~# kafka-server-start.sh -daemon $KAFKA_HOME/config/server.properties 
root@elk02:~# kafka-server-start.sh -daemon $KAFKA_HOME/config/server.properties 
root@elk03:~# kafka-server-start.sh -daemon $KAFKA_HOME/config/server.properties 
```

### 5. 检查zookeeper的信息

![image-20261022140841179](/images/kafka-deployment-terminology-image-20261022140841179.png)

## kafka的相关术语

  - kafka cluster:
    kafka集群，也可以称为:"broker list"。

  - kafka server:
    也称为"broker",kafka集群的每一个kafka服务器实例。

  - producer:
    生产者，表示往kafka写入数据的一方。

  - consumer:
    从kafka读取数据的一方。

  - topic:
    是kafka的逻辑概念，是producer和consumer进行数据读写的媒介。

    可以类比ES的索引。

  - partition:
    分区，分区也是逻辑概念，每个topic最少有一个或多个分区，数据分布式存储在不同的分区中，每个分区可以分散的存储到各个broker。

  - replica:
    副本，每个分区最少有一个或者多个副本，是实际存储数据的媒介。
    当副本数量大于1时，则会区分leader 副本和follower副本，producer和consumer都只能基于leader副本进行数据读写。
    producer和consumer根本就不会发现follow副本的存在，follow只是负责备份leader数据，当leader挂掉时，取而代之。