---
title: "Elasticsearch 数据映射（ip/date/geo_point）"
date: 2026-10-15T22:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Elasticsearch", "映射"]
showToc: true
summary: "围绕 Elasticsearch 字段映射（mapping）展开三个实战案例：ip 类型字段配合 CIDR 网段查询、date 类型字段按生日排序、geo_point 类型字段写入经纬度并经 Kibana Maps 在地图上可视化展示。"
---

## IP案例

### 1. 自定义数据类型

```http
PUT 11.0.1.111:9200/dawn-ip
{
    "mappings": {
        "properties": {
            "ip_addr": {
                "type": "ip"
            }
        }
    },
    "settings": {
        "number_of_shards": 3,
        "number_of_replicas": 0
    }
}
```

### 2. 查看自定义类型索引

```http
GET 11.0.1.111:9200/dawn-ip
```

### 3. 创建测试数据

```http
POST  11.0.1.111:9200/_bulk
{ "create": { "_index": "dawn-ip"} }
{ "ip_addr": "192.168.10.101" }          
{ "create": { "_index": "dawn-ip"} }
{ "ip_addr": "192.168.10.201" }          
{ "create": { "_index": "dawn-ip"} }
{ "ip_addr": "172.31.10.100" }           
{ "create": { "_index": "dawn-ip"} }
{ "ip_addr": "11.0.1.222" }              
{ "create": { "_index": "dawn-ip"} }
{ "ip_addr": "192.168.20.91" }
{ "create": { "_index": "dawn-ip"} }
{ "ip_addr": "11.0.1.113" }
```

### 4. 查看IP的网段

```http
GET 11.0.1.111:9200/dawn-ip/_search
{
    "query": {
        "match" : {
            "ip_addr": "192.168.0.0/16"
        }
    }
}
```

![image-20261016112930943](/images/elasticsearch-data-mapping-image-20261016112930943.png)

### 5. 删除索引

```http
DELETE 11.0.1.111:9200/dawn-ip
```

## date案例

### 1. 创建索引

```http
PUT 11.0.1.111:9200/dawn-date
{
  "mappings": {
    "properties": {
      "birthday": {
        "type":   "date",
        "format": "yyyy-MM-dd"
      }
    }
  }
}
```

### 2. 创建测试数据

```http
POST  11.0.1.111:9200/_bulk
{ "create": { "_index": "dawn-date"} }
{ "name": "father","birthday": "1980-11-01" }
{ "create": { "_index": "dawn-date"} }
{ "name": "mother","birthday": "1982-08-01" }
{ "create": { "_index": "dawn-date"} }
{ "name": "brother","birthday": "2010-06-01" }
{ "create": { "_index": "dawn-date"} }

```

### 3. 查看年龄，从大到小(比较的是数字，数字大的在下面)

```http
GET 11.0.1.111:9200/dawn-date/_search
{
  "sort": { "birthday": "asc"} 
}
```

![image-20261016112223190](/images/elasticsearch-data-mapping-image-20261016112223190.png)

## geo_point案例

### 1. 创建索引

```http
PUT 11.0.1.113:9200/dawn-map
{
  "mappings": {
    "properties": {
      "location": { 
        "type": "geo_point"
      }
    }
  }
}
```

### 2. 写入地理位置（lat代表纬度,lon代表经度）

```http
POST 11.0.1.113:9200/_bulk
{ "create": { "_index": "dawn-map"}}
{ "location": { "lat": 39.914,"lon": 116.386}}
{ "create": { "_index": "dawn-map"}}
{ "location": { "lat": 42.210,"lon": 101.666}}
{ "create": { "_index": "dawn-map"}}
{ "location": { "lat": 32.850,"lon": 98.124}}
{ "create": { "_index": "dawn-map"}}
{ "location": { "lat": 79.850,"lon": 128.124}}
{ "create": { "_index": "dawn-map"}}
{ "location": { "lat": 63.850,"lon": 179.124}}

```

### 3. kibana的map展示

![image-20261016114600158](/images/elasticsearch-data-mapping-image-20261016114600158.png)

![image-20261016114633200](/images/elasticsearch-data-mapping-image-20261016114633200.png)

![image-20261016114942669](/images/elasticsearch-data-mapping-image-20261016114942669.png)

![image-20261016115211249](/images/elasticsearch-data-mapping-image-20261016115211249.png)
