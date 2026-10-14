---
title: "Elasticsearch 索引 API 管理"
date: 2026-10-14T18:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Elasticsearch", "索引管理"]
showToc: true
summary: "围绕 Elasticsearch 索引的 REST API 管理展开：索引的创建、查看、自定义分片数量与分片/副本数量，以及修改副本数量、删除指定索引、批量删除索引数据等常见运维操作。"
---

## 索引创建和查看

### 1. 创建索引

```http
PUT 11.0.1.111:9200/dawn
```

![image-20261014185105524](/images/elasticsearch-index-api-management-image-20261014185105524.png)

默认创建一个分片和一个副本

### 2. 查看索引

查看单个索引

```bash
GET 11.0.1.111:9200/dawn
```

![image-20261014185208747](/images/elasticsearch-index-api-management-image-20261014185208747.png)

查看所有索引

```bash
GET 11.0.1.111:9200/_cat/indices?v
```

![image-20261014185355828](/images/elasticsearch-index-api-management-image-20261014185355828.png)

### 3. 创建索引自定义分片数量

```json
PUT 11.0.1.111:9200/dawn-01
{
    "settings":{
        "number_of_shards": 3
    }
}
```

![image-20261014190104255](/images/elasticsearch-index-api-management-image-20261014190104255.png)

![image-20261014190409826](/images/elasticsearch-index-api-management-image-20261014190409826.png)

### 4. 创建索引自定义分片副本数量

```json
PUT 11.0.1.111:9200/dawn-02
{
    "settings":{
        "number_of_shards": 5,
        "number_of_replicas": 0
    }
}
```

![image-20261014190704996](/images/elasticsearch-index-api-management-image-20261014190704996.png)

![image-20261014190840253](/images/elasticsearch-index-api-management-image-20261014190840253.png)

## 索引修改和删除

### 1. 修改索引的副本数量

```http
PUT 11.0.1.111:9200/dawn-02/_settings
{
    "number_of_replicas": 2
}
```

![image-20261014191909818](/images/elasticsearch-index-api-management-image-20261014191909818.png)

![image-20261014191931829](/images/elasticsearch-index-api-management-image-20261014191931829.png)

### 2. 删除指定索引

```http
DELETE	11.0.1.111:9200/dawn-02
```

![image-20261014192146100](/images/elasticsearch-index-api-management-image-20261014192146100.png)

![image-20261014192227343](/images/elasticsearch-index-api-management-image-20261014192227343.png)

### 3. 批量删除索引数据

```http
DELETE 11.0.1.111:9200/dawn*
```

  ![image-20261014192428828](/images/elasticsearch-index-api-management-image-20261014192428828.png)

![image-20261014192443470](/images/elasticsearch-index-api-management-image-20261014192443470.png)

一旦删除了索引，意味着该索引下的所有文档全部删除！
