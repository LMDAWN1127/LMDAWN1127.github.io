---
title: "Kafka 故障排查实战：集群起不来的五步排查法"
date: 2026-10-22T15:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kafka"]
showToc: true
summary: "Kafka 集群启动故障五步排查：JDK 环境检查、ZooKeeper 集群状态确认、server.properties 配置核对、前台启动捕获报错，以及清理 ZK 元数据与 Kafka 数据后的重启重试。"
---

## kafka集群起不来的解决思路

### 1. 检查jdk环境是否部署

```bash
root@elk01:~# java --version
openjdk 22.0.1 2024-04-16
OpenJDK Runtime Environment (build 22.0.1+8-16)
OpenJDK 64-Bit Server VM (build 22.0.1+8-16, mixed mode, sharing)
```

### 2. 检查zookeeper集群是否启动

http://11.0.1.111:8099/#

```bash
root@elk01:~# zkServer.sh status
root@elk02:~# zkServer.sh status
root@elk03:~# zkServer.sh status
```

### 3. 检查kafka的配置文件

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

### 4. 前台启动kafka

```bash
kafka-server-start.sh $KAFKA_HOME/config/server.properties
```

在前台运行kafka服务，观察报错信息

如果是后台运行的kafka也可以看日志，如下所示:

```bash
root@elk01:~# tail -100f /dawn/softwares/kafka_2.13-3.7.1/logs/server.log
```

根据错误信息解决问题

### 5. 清理元数据与数据后重启

5.1 删除zookeeper的元数据

```bash
deleteall /dawn-kafka371
```

5.2 删除kafka的数据

```bash
rm -rf /dawn/data/kafka-logs
```

5.3 重新启动kafka测试