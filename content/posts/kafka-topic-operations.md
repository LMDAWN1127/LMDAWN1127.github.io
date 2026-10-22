---
title: "Kafka topic 操作实战：增删改查与副本分区约束"
date: 2026-10-22T14:45:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kafka"]
showToc: true
summary: "kafka-topics.sh 实战：topic 创建（副本因子不能超过存活 broker 数）、查看详情（Leader/Replicas/ISR 解读）、分区扩容（只能调大不能调小）与删除（延迟约一分钟清理数据）。"
---

## kafka的topic管理

### 1.同步主机解析

```bash
root@elk01:~# scp /etc/hosts elk02:/etc/
hosts            100%  271    88.1KB/s   00:00
root@elk01:~# scp /etc/hosts elk03:/etc/
hosts            100%  271    72.3KB/s   00:00
```

### 2. 查看现有的topic列表

```bash
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --list
```

### 3. 创建topic

```bash
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --create --topic dawn-devops --partitions 3 --replication-factor 2
Created topic dawn-devops.
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --create --topic dawn-devops-001 --partitions 3 --replication-factor 2
Created topic dawn-devops-001.
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --list
dawn-devops
dawn-devops-001
```

  创建topic时，副本数量不能大于存活的broker节点数量。因为同一个分区的副本不能同时在同一个broker节点上存储

```bash
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --create --topic dawn-devops-002 --partitions 3 --replication-factor 5
Error while executing topic command : Replication factor: 5 larger than available brokers: 3.
[2026-10-22 14:30:51,727] ERROR org.apache.kafka.common.errors.InvalidReplicationFactorException: Replication factor: 5 larger than available brokers: 3.
 (org.apache.kafka.tools.TopicCommand)
```

### 4. 查看topic的详细信息

```bash
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --describe   # 默认查看所有的topic信息
Topic: dawn-devops      TopicId: evmiJCe5QsafhPpBtkmJUg    PartitionCount: 3       ReplicationFactor: 2       Configs:
        Topic: dawn-devops      Partition: 0    Leader: 3  Replicas: 3,1   Isr: 3,1
        Topic: dawn-devops      Partition: 1    Leader: 1  Replicas: 1,2   Isr: 1
        Topic: dawn-devops      Partition: 2    Leader: 2  Replicas: 2,3   Isr: 2,3
Topic: dawn-devops-001  TopicId: vT_X6XKWSd2lB2ggwX7NmQ    PartitionCount: 3       ReplicationFactor: 2       Configs:
        Topic: dawn-devops-001  Partition: 0    Leader: 2  Replicas: 2,3   Isr: 2,3
        Topic: dawn-devops-001  Partition: 1    Leader: 3  Replicas: 3,1   Isr: 3,1
        Topic: dawn-devops-001  Partition: 2    Leader: 1  Replicas: 1,2   Isr: 1
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --describe --topic dawn-devops  # 查看指定的topic信息
Topic: dawn-devops      TopicId: evmiJCe5QsafhPpBtkmJUg    PartitionCount: 3       ReplicationFactor: 2       Configs:
        Topic: dawn-devops      Partition: 0    Leader: 3  Replicas: 3,1   Isr: 3,1
        Topic: dawn-devops      Partition: 1    Leader: 1  Replicas: 1,2   Isr: 1
        Topic: dawn-devops      Partition: 2    Leader: 2  Replicas: 2,3   Isr: 2,3
```

### 5. 修改topic

```bash
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --describe --topic dawn-devops
Topic: dawn-devops      TopicId: evmiJCe5QsafhPpBtkmJUg    PartitionCount: 3       ReplicationFactor: 2       Configs:
        Topic: dawn-devops      Partition: 0    Leader: 3  Replicas: 3,1   Isr: 3,1
        Topic: dawn-devops      Partition: 1    Leader: 1  Replicas: 1,2   Isr: 1
        Topic: dawn-devops      Partition: 2    Leader: 2  Replicas: 2,3   Isr: 2,3
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --alter --topic dawn-devops --partitions 5
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --describe --topic dawn-devops
Topic: dawn-devops      TopicId: evmiJCe5QsafhPpBtkmJUg    PartitionCount: 5       ReplicationFactor: 2       Configs:
        Topic: dawn-devops      Partition: 0    Leader: 3  Replicas: 3,1   Isr: 3,1
        Topic: dawn-devops      Partition: 1    Leader: 1  Replicas: 1,2   Isr: 1
        Topic: dawn-devops      Partition: 2    Leader: 2  Replicas: 2,3   Isr: 2,3
        Topic: dawn-devops      Partition: 3    Leader: 3  Replicas: 3,2   Isr: 3,2
        Topic: dawn-devops      Partition: 4    Leader: 1  Replicas: 1,3   Isr: 1,3
```

  分区数量只能调大，不能调小！因此生产环境注意，不要设置太大的分区数量。

```bash
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --alter --topic dawn-devops --partitions 3
Error while executing topic command : Topic currently has 5 partitions, which is higher than the requested 3.
[2026-10-22 14:34:01,103] ERROR org.apache.kafka.common.errors.InvalidPartitionsException: Topic currently has 5 partitions, which is higher than the requested 3.
 (org.apache.kafka.tools.TopicCommand)
```

### 6. 删除topic

```bash
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --list
dawn-devops
dawn-devops-001
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --delete --topic dawn-devops
root@elk01:~# kafka-topics.sh --bootstrap-server 11.0.1.112:9092 --list
dawn-devops-001
```

  删除topic时，数据会延迟"log.segment.delete.delay.ms"(默认一分钟)后删除。