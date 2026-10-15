---
title: "Elasticsearch 文档 API 管理：单文档与批量操作"
date: 2026-10-14T20:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Elasticsearch", "文档管理"]
showToc: true
summary: "围绕 Elasticsearch 文档的 REST API 展开：单文档的创建（指定/不指定 id）、查看（全量/指定/DSL 查询）、修改与删除，以及批量写入（_bulk）与批量读取（_mget）等常见文档级运维操作。"
---

## ES单个文档管理

### 文档创建

#### 1. 文档的创建(推荐)

```http
POST 11.0.1.113:9200/dawn/doc
{
    "name": "zlm",
    "hobby": [
        "吃饭",
        "睡觉",
        "上课"
    ]
}
```

#### 2. 文档的创建指定文档id(不推荐，可能存在id冲突问题)

```http
POST 11.0.1.113:9200/dawn/doc/2300160645
{
    "school": "czu",
    "class": "计算机001",
    "student": [
        {
            "name": "dark",
            "hobby": [
                "打球",
                "看书"
            ]
        },
        {
            "name": "ocean",
            "hobby": [
                "唱歌",
                "rap",
                "篮球"
            ]
        }
    ]
}
```

### 文档查看

#### 1. 查看所有的文档

```http
GET 11.0.1.113:9200/dawn/_search
```

#### 2. 查看指定的文档

```http
GET 11.0.1.113:9200/dawn/doc/2300160645
```

#### 3. 基于DSL语句查询

```http
POST 11.0.1.113:9200/dawn/_search
{
    "query": {
        "match": {
            "name": "zlm"
        }
    }
}
```

### 文档修改和删除

#### 1. 修改文档

```http
POST 11.0.1.113:9200/dawn/doc/2300160645/_update
{
    "doc":{
        "school" : "thu"
    }
}
```

#### 2. 删除文档

```http
DELETE 11.0.1.113:9200/dawn/doc/2300160645
```

## ES文档批量操作

### 文档批量创建（注意最后有一个换行）

只能采用扁平化的方式去写，不能采用Beautify的方式去写

```http
POST 11.0.1.113:9200/_bulk
{ "index" : { "_index" : "dawn05"} }
{"name": "张三","hobby": ["1","2","3"]}
{ "index" : { "_index" : "dawn05"} }
{"name": "李四","hobby": ["4","5","6"]}
{ "index" : { "_index" : "dawn05"} }
{"name": "王五","hobby": ["7","8","9"]}

```

![image-20261015140916895](/images/elasticsearch-document-api-management-image-20261015140916895.png)

### 文档批量查看

```http
POST 11.0.1.113:9200/_mget
{
    "docs": [
        {
            "_index": "dawn05",
            "_id": "854sPqEBMns9ROCbUcEr"
        },
        {
            "_index": "dawn05",
            "_id": "8p4sPqEBMns9ROCbUcEq"
        }
    ]
}
```

### 文档批量修改（注意最后有一个换行）

```http
POST 11.0.1.113:9200/_bulk
{ "update" : { "_index" : "dawn05","_id" : "9J4sPqEBMns9ROCbUcEr"} }
{ "doc" : {"age" : 30, "hobby": ["10","11","12"]} }

```

![image-20261015141507490](/images/elasticsearch-document-api-management-image-20261015141507490.png)

### 文档批量删除（注意最后有一个换行）

```http
POST 11.0.1.113:9200/_bulk
{ "delete" : { "_index" : "dawn05", "_id" : "854sPqEBMns9ROCbUcEr" } }
{ "delete" : { "_index" : "dawn05", "_id" : "8p4sPqEBMns9ROCbUcEq" } }
{ "delete" : { "_index" : "dawn05", "_id" : "9J4sPqEBMns9ROCbUcEr" } }
```

![image-20261015141852581](/images/elasticsearch-document-api-management-image-20261015141852581.png)

  对于文档的批量操作而言，使用"_bulk"的API实现数据的写操作(创建，修改，删除)，使用"_mget"实现读取操作。
