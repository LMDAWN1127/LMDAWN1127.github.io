---
title: "ES 集群健康状态查看实战：_cluster/health 全参数解析"
date: 2026-10-21T19:45:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack"]
showToc: true
summary: "通过 _cluster/health API 查看 ES 集群健康状态：curl + jq 的两种查询姿势（整包 JSON 与单字段提取），以及 status/timed_out/active_shards 等全部返回参数的逐项解读。"
---

## ES集群的API查看

```bash
root@elk02:~# apt -y install jq
root@elk02:~# curl -s -u elastic:123456 11.0.1.111:9200/_cluster/health | jq
{
  "cluster_name": "dawn",
  "status": "green",
  "timed_out": false,
  "number_of_nodes": 3,
  "number_of_data_nodes": 3,
  "active_primary_shards": 103,
  "active_shards": 286,
  "relocating_shards": 0,
  "initializing_shards": 0,
  "unassigned_shards": 0,
  "delayed_unassigned_shards": 0,
  "number_of_pending_tasks": 0,
  "number_of_in_flight_fetch": 0,
  "task_max_waiting_in_queue_millis": 0,
  "active_shards_percent_as_number": 100
}
root@elk02:~# curl -s -u elastic:123456 11.0.1.111:9200/_cluster/health | jq ".status"
"green"
root@elk02:~# curl -s -u elastic:123456 11.0.1.111:9200/_cluster/health | jq ".active_shards_percent_as_number"
100
```

相关参数说明:
cluster_name
集群的名称。

status
集群的健康状态，基于其主分片和副本分片的状态。
ES集群有以下三种状态:
green
所有分片都已分配。
yellow
所有主分片都已分配，但一个或多个副本分片未分配。
如果集群中的某个节点发生故障，则在修复该节点之前，某些数据可能不可用。
red
一个或多个主分片未分配，因此某些数据不可用。这可能会在集群启动期间短暂发生，因为分配了主分片。

timed_out
是否在参数false指定的时间段内返回响应（默认情况下30秒）。

number_of_nodes
集群内的节点数。

number_of_data_nodes
作为专用数据节点的节点数。

active_primary_shards
可用主分片的数量。

active_shards
可用主分片和副本分片的总数。

relocating_shards
正在重定位的分片数。

initializing_shards
正在初始化的分片数。

unassigned_shards
未分配的分片数。

delayed_unassigned_shards
分配因超时设置而延迟的分片数。

number_of_pending_tasks
尚未执行的集群级别更改的数量。

number_of_in_flight_fetch
未完成的提取次数。

task_max_waiting_in_queue_millis
自最早启动的任务等待执行以来的时间（以毫秒为单位）。

active_shards_percent_as_number
集群中活动分片的比率，以百分比表示。

官方文档： https://www.elastic.co/guide/en/elasticsearch/reference/7.17/cluster-health.html