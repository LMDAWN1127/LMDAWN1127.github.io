---
title: "Elasticsearch 索引 API 管理"
date: 2026-10-14T18:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Elasticsearch", "索引管理"]
showToc: true
summary: "围绕 Elasticsearch 索引的 REST API 管理展开：索引的创建、查看、自定义分片与副本数量，修改副本数量、删除指定/批量删除索引数据，索引开启与关闭，索引模板与组件模板的创建/查看/修改/删除，以及索引别名的增删改查与实际查询应用。"
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

## 索引开启和关闭

### 1. 关闭索引

```http
POST 11.0.1.111:9200/dawn/_close
```

![image-20261015172832660](/images/elasticsearch-index-api-management-image-20261015172832660.png)

### 2. 开启索引

```http
POST 11.0.1.111:9200/dawn/_open
```

![image-20261015172749054](/images/elasticsearch-index-api-management-image-20261015172749054.png)

1. 一旦一个索引被关闭，则意味着该索引不可访问;

2. 被关闭的索引数据并不会丢失;

3. 默认情况下，ES的索引都是处于开启状态。

## 索引模板

### 1. 索引模板介绍

索引模板就是创建索引时要遵循的模板规则。

索引模板仅对新创建的索引有效，已经创建的索引并不受索引模板的影响。

### 2. 查看所有的索引模板

```http
GET 11.0.1.111:9200/_index_template
```

### 3. 创建自定义索引模板

```http
POST 11.0.1.111:9200/_index_template/dawn
{
    "index_patterns": [
        "dawn*"
    ],
    "template": {
        "settings": {
            "number_of_shards": 5,
            "number_of_replicas": 0
        }
    }
}
```

### 4. 查看单个索引模板

```http
GET 11.0.1.111:9200/_index_template/dawn
```

### 5. 创建测试的索引

```http
PUT 11.0.1.111:9200/dawn-01
```

![image-20261015182939307](/images/elasticsearch-index-api-management-image-20261015182939307.png)

### 6. 修改索引模板

```http
PUT 11.0.1.111:9200/_index_template/dawn
{
    "index_patterns": [
        "dawn*"
    ],
    "template": {
        "settings": {
            "number_of_shards": 3,
            "number_of_replicas": 2
        }
    }
}
```

### 7. 再次创建索引

```http
PUT 11.0.1.111:9200/dawn-02
```

![image-20261015183124535](/images/elasticsearch-index-api-management-image-20261015183124535.png)

### 8. 删除索引模板

```http
DELETE 11.0.1.111:9200/_index_template/dawn
```

## 组件模板和索引模板联合使用

### 1. 查看现有的组件模板

```http
GET 11.0.1.111:9200/_component_template/
```

### 2. 创建自定义的组件模板

```http
POST 11.0.1.111:9200/_component_template/dark
{
    "template": {
        "settings": {
            "number_of_shards": 10
        }
    }
}
```

### 3. 查看单个组件模板

```http
GET 11.0.1.111:9200/_component_template/dark
```

### 4. 创建索引模板指定组件模板

```http
GET 11.0.1.111:9200/_index_template/dawn
{
    "index_patterns": [
        "dawn*"
    ],
    "composed_of": [
        "dark"
    ],
    "template": {
        "settings": {
            "number_of_replicas": 2
        }
    }
}
```

### 5. 创建测试索引

```http
PUT 11.0.1.111:9200/dawn-03
```

![image-20261015184955865](/images/elasticsearch-index-api-management-image-20261015184955865.png)

## 索引别名的创建

### 1. 索引别名介绍

所谓的索引别名，其实就是给索引起名字。

其应用场景可以将多个不同的索引打上相同的别名，将来基于别名进行查询，就可以将这些不同索引的数据一起查询。

### 2. 准备测试数据

```http
POST 11.0.1.111:9200/_bulk
{ "index" : { "_index" : "czu-235"} }
{"name": "小张","hobby": ["1","2","3"]}
{ "index" : { "_index" : "czu-235"} }
{"name": "小王","hobby": ["4","5","6"]}
{ "index" : { "_index" : "czu-236"} }
{"name": "小赵","hobby": ["7","8","9"]}
{ "index" : { "_index" : "czu-231"} }
{"name": "小李","hobby": ["10","11","12"]}
{ "index" : { "_index" : "czu-232"} }
{"name": "小黄","hobby": ["13","14","15"]}
{ "index" : { "_index" : "czu-234"} }
{"name": "小陈","hobby": ["16","17","18"]}

```

### 3. 添加别名

```http
POST 11.0.1.111:9200/_aliases
{
    "actions": [
        {
            "add": {
                "index": "czu-235",
                "alias": "czu"
            }
        },
        {
            "add": {
                "index": "czu-234",
                "alias": "czu"
            }
        },
        {
            "add": {
                "index": "czu-231",
                "alias": "ok"
            }
        },
        {
            "add": {
                "index": "czu-232",
                "alias": "ok"
            }
        },
        {
            "add": {
                "index": "czu-236",
                "alias": "ok"
            }
        }
    ]
}
```

### 4. kibana基于别名查询数据

![image-20261015195351452](/images/elasticsearch-index-api-management-image-20261015195351452.png)

![image-20261015195447217](/images/elasticsearch-index-api-management-image-20261015195447217.png)

![image-20261015195031528](/images/elasticsearch-index-api-management-image-20261015195031528.png)

## 索引别名的查看、删除和修改

### 1. 查看所有索引的别名信息

```http
GET 11.0.1.111:9200/_alias
```

### 2. 查看某个索引的别名信息

```http
GET 11.0.1.111:9200/czu-235/_alias
```

### 3. 删除索引别名

```json
POST 11.0.1.111:9200/_aliases
{
  "actions": [
    {
      "remove": {
        "index": "czu-235",
        "alias": "czu"
      }
    },
     {
      "remove": {
        "index": "czu-234",
        "alias": "czu"
      }
    }
  ]
}
```

删除前

![image-20261015201126261](/images/elasticsearch-index-api-management-image-20261015201126261.png)

删除后

![image-20261015201150551](/images/elasticsearch-index-api-management-image-20261015201150551.png)

### 4. 修改别名

```http
POST 11.0.1.111:9200/_aliases
{
    "actions": [
        {
            "remove": {
                "index": "czu-231",
                "alias": "ok"
            }
        },
        {
            "add": {
                "index": "czu-231",
                "alias": "no"
            }
        }
    ]
}
```

修改前

![image-20261015201337301](/images/elasticsearch-index-api-management-image-20261015201337301.png)

修改后

![image-20261015201614936](/images/elasticsearch-index-api-management-image-20261015201614936.png)
