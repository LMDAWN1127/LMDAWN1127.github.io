---
title: "ELFK 实战：Filebeat 经 Kafka 到 Logstash 再到 ES 的数据管道"
date: 2026-10-22T17:55:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack"]
showToc: true
summary: "打通 ELFK 与 Kafka 的数据管道：Filebeat tcp 输入经 output.kafka 写入集群，Logstash 以 kafka input + json filter 消费并按天写入 ES 索引，Kibana 端到端验证。"
---

## filebeat写入数据到kafka集群

### 1. 编写配置文件

```bash
root@elk01:/etc/filebeat# vim config/18-tcp-to-kafka.yaml
```

```yaml
filebeat.inputs:
- type: tcp
  host: "0.0.0.0:9000"

output.kafka:
  # 指定kafka的集群地址
  hosts: ["elk01:9092", "elk02:9092", "elk03:9092"]

  # 指定存储的topic
  topic: 'dawn-devops-kafka'
```

```bash
root@elk01:/etc/filebeat# filebeat -e -c config/18-tcp-to-kafka.yaml
```

### 2. 发送测试数据

```bash
root@elk01:~# echo "abcdefg" | nc 11.0.1.111 9000
```

### 3. 检查数据是否写入kafka

```bash
root@elk02:~# kafka-console-consumer.sh --bootstrap-server 11.0.1.111:9092 --topic dawn-devops-kafka --from-beginning
{"@timestamp":"2026-10-22T09:30:08.295Z","@metadata":{"beat":"filebeat","type":"_doc","version":"7.17.22"},"log":{"source":{"address":"11.0.1.111:33768"}},"input":{"type":"tcp"},"ecs":{"version":"1.12.0"},"host":{"name":"elk01"},"agent":{"hostname":"elk01","ephemeral_id":"6cbabed0-0ccb-4f96-975c-704629350c18","id":"3fc3ff81-bd5d-448f-b985-9df6370f41c4","name":"elk01","type":"filebeat","version":"7.17.22"},"message":"abcdefg"}
```

## logstash从kafka读取数据到ES集群

### 1. 编写配置文件

```bash
root@elk03:/etc/logstash# vim config/10-kafka-to-es.conf
```

```ruby
input {
  kafka {
     # 指定kafka集群地址
     bootstrap_servers => "11.0.1.111:9092,11.0.1.112:9092,11.0.1.113:9092"
     # 读取的kafka列表
     topics => ["dawn-devops-kafka"]
     # 指定消费者组
     group_id => "devops-001"
     # 指定消费者组第一次从kafka拉取数据的位置，常用值: earliest, latest
     auto_offset_reset => "earliest"
  }

}

filter {
  json {
    # 对message字段做json格式解析
    source => "message"
  }

  mutate {
     remove_field => [ "input","agent","@version","ecs","log" ]
  }
}

output {
  stdout {}

  elasticsearch {
     hosts => ["http://11.0.1.111:9200","http://11.0.1.112:9200","http://11.0.1.113:9200"]
     index => "dawn-devops-kafka-%{+yyyy.MM.dd}"
     user => "elastic"
     password => "123456"
  }
}
```

```bash
root@elk03:/etc/logstash# logstash -rf config/10-kafka-to-es.conf
```

### 2. kibana查看数据

![image-20261022173720064](/images/elfk-kafka-pipeline-image-20261022173720064.png)
