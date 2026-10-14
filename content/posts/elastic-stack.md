---
title: "ElasticStack 架构设计与 Elasticsearch 集群部署"
date: 2026-10-14T15:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Elasticsearch", "集群"]
showToc: true
summary: "从 ElasticStack 组件（Elasticsearch / Logstash / Kibana / Beats）入手，重点记录 Elasticsearch 单点部署与集群搭建：软件包下载、服务安装、elasticsearch.yml 关键配置（集群名、数据与日志路径、监听地址端口、单点/集群模式）、节点时区统一、配置分发与集群启动、端口与节点状态验证。"
---

## ElasticStack

  - ElasticSearch，简称:"es"
    - 数据存储
    - 数据查询

  - filebeat:
    - 采集数据

  - kibana:
    - 用于出图展示

  - logstash:
    - 日志分析处理。

  - zookeeper:
    - 分布式协调服务，用于协调其他服务组件。

  - kafka:
    - 分布式消息队列，可以缓存数据。依赖zk实现元数据管理。

## ElasticSearch单点部署

### 1. 下载软件包

```bash
root@elk01:~# wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-7.17.22-amd64.deb
```

### 2. 安装ES服务

```bash
root@elk01:~# dpkg -i elasticsearch-7.17.22-amd64.deb
```

### 3. 修改配置文件

```bash
root@elk01:~# vim /etc/elasticsearch/elasticsearch.yml 
```

```yaml
# 指定集群的名称，每个ES集群的名称要唯一
cluster.name: dawn
# 数据的存储路径
path.data: /var/lib/elasticsearch
# 日志的存储路径
path.logs: /var/log/elasticsearch
# 指定监听的地址
network.host: 0.0.0.0
# 指定ES集群监听的端口号
http.port: 9200
# 数据传输端口
transport.port: 9300
# 部署集群为单点类型
discovery.type: "single-node"
```

### 4. 启动ES服务

```bash
root@elk01:~# systemctl enable --now elasticsearch.service
```

### 5. 验证ES服务是否启动成功

```bash
root@elk01:~# ss -ntl | grep "9[2|3]00"
LISTEN 0      4096               *:9200            *:*
LISTEN 0      4096               *:9300            *:*
```

### 6. 访问ES的WebUI

![image-20261014161818086](/images/elastic-stack-image-20261014161818086.png)

### 7. 查看集群的节点信息

```bash
root@elk01:~# curl 11.0.1.111:9200/_cat/nodes?v
ip         heap.percent ram.percent cpu load_1m load_5m load_15m node.role   master name
11.0.1.111           58          65   0    2.94    1.36     0.53 cdfhilmrstw *      elk01
```

## ElasticSearch单点卸载

### 1. 停止es服务

```bash
root@elk01:~# systemctl stop elasticsearch.service
```

### 2. 卸载软件

```bash
root@elk01:~# dpkg -r elasticsearch
(Reading database ... 76508 files and directories currently installed.)
Removing elasticsearch (7.17.22) ...
Stopping elasticsearch service... OK
Deleting log directory... OK
```

  此步骤只会清理日志文件，卸载脚本，删除ES软件等操作，并不会删除ES的数据。

### 3. 清理数据(生产环境不建议做，谨慎，数据需要备份或者迁移)

```bash
root@elk01:~# rm -rf /var/lib/elasticsearch/* /tmp/*
```

## Elasticsearch集群搭建

### 1. 下载ES软件包

将下载好的软件包拷贝到其他两个节点

```bash
root@elk01:~# scp elasticsearch-7.17.22-amd64.deb 11.0.1.112:~
root@elk01:~# scp elasticsearch-7.17.22-amd64.deb 11.0.1.113:~
```

### 2. 修改各节点的时区

```bash
root@elk01:~# ln -svf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
'/etc/localtime' -> '/usr/share/zoneinfo/Asia/Shanghai'
root@elk02:~# ln -svf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
'/etc/localtime' -> '/usr/share/zoneinfo/Asia/Shanghai'
root@elk03:~# ln -svf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
'/etc/localtime' -> '/usr/share/zoneinfo/Asia/Shanghai'
```

### 3. 安装ES服务

```bash
root@elk01:~# dpkg -i elasticsearch-7.17.22-amd64.deb
root@elk02:~# dpkg -i elasticsearch-7.17.22-amd64.deb
root@elk03:~# dpkg -i elasticsearch-7.17.22-amd64.deb
```

### 4. 修改ES集群的配置文件

```bash
[root@elk91 ~]# vim /etc/elasticsearch/elasticsearch.yml
cluster.name: dawn
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300
# 配置ES集群的服务发现列表主机
discovery.seed_hosts: ["11.0.1.111","11.0.1.112","11.0.1.113"]
# 配置ES集群启动时参与master选举的节点
cluster.initial_master_nodes: ["11.0.1.111","11.0.1.112","11.0.1.113"]
```

### 5. 将配置文件拷贝到其他节点

```bash
root@elk01:~# scp /etc/elasticsearch/elasticsearch.yml 11.0.1.112:/etc/elasticsearch/elasticsearch.yml
root@11.0.1.112's password:
elasticsearch.yml                                                                         100% 3641     4.1MB/s   00:00
root@elk01:~# scp /etc/elasticsearch/elasticsearch.yml 11.0.1.113:/etc/elasticsearch/elasticsearch.yml
root@11.0.1.113's password:
elasticsearch.yml                                                                         100% 3641     5.0MB/s   00:00
```

### 6. 启动ES集群

```bash
root@elk01:~# systemctl enable --now elasticsearch.service
root@elk02:~# systemctl enable --now elasticsearch.service
root@elk03:~# systemctl enable --now elasticsearch.service
```

### 7. 检查ES服务端口是否存在

```bash
root@elk01:~# ss -ntl | grep "9[2|3]00"
LISTEN 0      4096               *:9200            *:*
LISTEN 0      4096               *:9300            *:*
root@elk02:~# ss -ntl | grep "9[2|3]00"
LISTEN 0      4096               *:9200            *:*
LISTEN 0      4096               *:9300            *:*
root@elk03:~# ss -ntl | grep "9[2|3]00"
LISTEN 0      4096               *:9200            *:*
LISTEN 0      4096               *:9300            *:*
```

### 8. 查看集群的节点信息

```bash
root@elk01:~# curl -s 11.0.1.111:9200 | grep  cluster_uuid
  "cluster_uuid" : "JwoG2sV0RuOGHqWYzSWVvw",
root@elk01:~# curl -s 11.0.1.112:9200 | grep  cluster_uuid
  "cluster_uuid" : "JwoG2sV0RuOGHqWYzSWVvw",
root@elk01:~# curl -s 11.0.1.113:9200 | grep  cluster_uuid
  "cluster_uuid" : "JwoG2sV0RuOGHqWYzSWVvw",

root@elk01:~# curl -s 11.0.1.111:9200/_cat/nodes
11.0.1.112 25 96 3 0.00 0.10 0.07 cdfhilmrstw * elk02
11.0.1.113 34 96 2 0.00 0.08 0.06 cdfhilmrstw - elk03
11.0.1.111 36 97 3 0.01 0.04 0.17 cdfhilmrstw - elk01
```
