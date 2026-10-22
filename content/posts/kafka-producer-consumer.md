---
title: "Kafka 生产者与消费者实战：消息收发、offset 与消费者组"
date: 2026-10-22T17:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kafka"]
showToc: true
summary: "Kafka console 生产者与消费者实操：从最新/从头两种消费位置对比、__consumer_offsets 原理，以及消费者组配置、offset 与 LAG 查看、多消费者分区分配观察。"
---

## kafka的生产者和消费者

### 1. 启动生产者

```bash
root@elk01:~# kafka-console-producer.sh --bootstrap-server 11.0.1.112:9092 --topic dawn-devops-001
```

### 2. 启动消费者

2.1 启动消费者从最新(最后的流位置)的位置拉取数据

```bash
[root@elk02 ~]# kafka-console-consumer.sh --bootstrap-server 11.0.1.112:9092 --topic dawn-devops-001
```

2.2 在生产者终端输入数据

```bash
root@elk01:~# kafka-console-producer.sh --bootstrap-server 11.0.1.112:9092 --topic dawn-devops-001
>aaaaa
>bbbbb
>ccccc
```

2.3 消费者能出现数据，但无法将消费者启动前的数据拿到手

2.4 启动消费者时从头拉取数据

```bash
root@elk02:~# kafka-console-consumer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001 --from-beginning
aaaaa
bbbbb
ccccc
aaaaa
bbbbb
ccccc
wb-test-msg-1
aaaaa
bbbbb
ccccc
111111
222222
333333
aaaaa
bbbbbb
ccccc
```

  当我们启动了一个消费者时，会自动产生一个新的topic，名称为"__consumer_offsets"，该topic存储的是消费者的消费数据记录，也就是offset

![image-20261022160657188](/images/kafka-producer-consumer-image-20261022160657188.png)

## kafka的消费者组

  offset：
    记录消费者组在partition中消费的偏移量。

  consumer group：
    消费者组，任何一个消费者都隶属于一个消费者组。

```bash
注：
   同一个分区不能“同时”被同一个消费者组的两个消费者进行消费;
   重平衡，指的是分区分配给消费者组的消费者的过程。
   
   当一个消费者组的数量发生变化时会触发重平衡;
   当topic的分区数量发生变化时，也会触发重平衡;
   消费者组的消费者过多时，可能会有部分消费者无法消费，因为其无法分配到分区。
```

### 1. 基于配置文件指定消费者组

1.1 修改配置文件

```bash
[root@elk03 ~]# grep "^group.id" ${KAFKA_HOME}/config/consumer.properties 
group.id=devops
```

1.2 启动消费者加载配置文件

```bash
root@elk03:~# kafka-console-consumer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001 --from-beginning   --consumer.config  ${KAFKA_HOME}/config/consumer.properties
aaaaa
bbbbb
ccccc
aaaaa
bbbbb
ccccc
wb-test-msg-1
aaaaa
bbbbb
ccccc
111111
222222
333333
aaaaa
bbbbbb
ccccc
```

### 2. 查看消费者消费的列表

```bash
root@elk01:~# kafka-consumer-groups.sh --bootstrap-server 11.0.1.111:9092 --list
devops
```

### 3. 查看指定消费者组消费分区的offset

```bash
root@elk01:~# kafka-consumer-groups.sh --bootstrap-server 11.0.1.111:9092 --describe --group devops

GROUP           TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG             CONSUMER-ID                                           HOST            CLIENT-ID
devops          dawn-devops-001 0          0               0               0               console-consumer-9f18be93-095b-4b46-a260-49b2b2c7e937 /11.0.1.113     console-consumer
devops          dawn-devops-001 1          0               0               0               console-consumer-9f18be93-095b-4b46-a260-49b2b2c7e937 /11.0.1.113     console-consumer
devops          dawn-devops-001 2          16              16              0               console-consumer-9f18be93-095b-4b46-a260-49b2b2c7e937 /11.0.1.113     console-consumer
```

### 4. 启动一个生产者

```bash
root@elk01:~# kafka-console-producer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001
>1111111111
>2222222222
>3333333333
```

### 5. 观察消费者的界面

```bash
root@elk03:~# kafka-console-consumer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001 --from-beginning   --consumer.config  ${KAFKA_HOME}/config/consumer.properties
aaaaa
bbbbb
ccccc
aaaaa
bbbbb
ccccc
wb-test-msg-1
aaaaa
bbbbb
ccccc
111111
222222
333333
aaaaa
bbbbbb
ccccc
1111111111
2222222222
3333333333
```

  此时终止消费者的界面。

### 6. 再次使用生产者写入测试数据

```bash
root@elk01:~# kafka-console-producer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001
>AAAAAAAAAAAAAAA
>BBBBBBBBBBBBBBBB
```

### 7. 再次查看消费者组的信息数据是有延迟的

```bash
root@elk01:~# kafka-consumer-groups.sh --bootstrap-server 11.0.1.111:9092 --describe --group devops

Consumer group 'devops' has no active members.

GROUP           TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG             CONSUMER-ID     HOST            CLIENT-ID
devops          dawn-devops-001 0          0               0               0               -               -               -
devops          dawn-devops-001 1          0               0               0               -               -               -
devops          dawn-devops-001 2          19              22              3               -               -               -
```

### 8. 同时启动多个消费者

8.1 基于配置文件指定消费者组

```bash
root@elk03:~# kafka-console-consumer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001 --from-beginning   --consumer.config  ${KAFKA_HOME}/config/consumer.properties
```

8.2 基于命令行方式启动消费者组

```bash
root@elk02:~# kafka-console-consumer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001 --consumer-property group.id=devops
888888
999999
1111111
```

8.3 观察消费者信息

```bash
root@elk01:~# kafka-consumer-groups.sh --bootstrap-server 11.0.1.111:9092 --describe --group devops

GROUP           TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG             CONSUMER-ID                                           HOST            CLIENT-ID
devops          dawn-devops-001 0          3               3               0               console-consumer-1c6a753c-01df-4ff8-85a3-f00e0f75fec2 /11.0.1.112     console-consumer
devops          dawn-devops-001 1          3               3               0               console-consumer-1c6a753c-01df-4ff8-85a3-f00e0f75fec2 /11.0.1.112     console-consumer
devops          dawn-devops-001 2          22              22              0               console-consumer-77188145-1121-4048-bd30-82fd2ee6060c /11.0.1.113     console-consumer
```

8.4 生产者继续生产数据

```bash
root@elk01:~# kafka-console-producer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-001
>888888
>999999
>1111111
>666666
>777777
```

8.5 观察输出

```bash
root@elk01:~# kafka-consumer-groups.sh --bootstrap-server 11.0.1.111:9092 --describe --group devops

GROUP           TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG             CONSUMER-ID                                           HOST            CLIENT-ID
devops          dawn-devops-001 0          5               5               0               console-consumer-1c6a753c-01df-4ff8-85a3-f00e0f75fec2 /11.0.1.112     console-consumer
devops          dawn-devops-001 1          3               3               0               console-consumer-1c6a753c-01df-4ff8-85a3-f00e0f75fec2 /11.0.1.112     console-consumer
devops          dawn-devops-001 2          22              22              0               console-consumer-77188145-1121-4048-bd30-82fd2ee6060c /11.0.1.113     console-consumer
```