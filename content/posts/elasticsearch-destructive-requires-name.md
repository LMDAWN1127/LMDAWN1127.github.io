---
title: "Elasticsearch 集群安全配置：action.destructive_requires_name 防误删保护"
date: 2026-10-14T21:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Elasticsearch", "集群配置"]
showToc: true
summary: "围绕 Elasticsearch 集群级安全设置 action.destructive_requires_name 展开：该配置决定删除索引时是否必须指定明确名称（禁用通配符与 _all）。涵盖动态 API（_cluster/settings，persistent/transient）与静态 elasticsearch.yml 两种配置方式，以及如何验证通配符删除被拦截、明确名称删除成功。"
---

### 1. 核心配置项

action.destructive_requires_name

这个配置项决定了删除索引时是否必须指定明确的索引名称。

`true`（推荐，ES 7.x 及以后版本的默认值）：必须指定明确索引名，禁止使用通配符（`*`）或 `_all` 删除。

`false` 允许使用通配符或 `_all` 删除。

------

### 2. 动态配置方式（推荐，无需重启）

通过 API 动态修改集群设置，立即生效：

```http
PUT 11.0.1.111:9200/_cluster/settings
{
  "persistent": {
    "action.destructive_requires_name": true
  }
}
```

`persistent`：持久生效，重启 ES 后依然有效

`transient`：临时生效，集群重启后失效

------

### 3. 静态配置方式（修改配置文件）

在每个节点的/etc/elasticsearch/elasticsearch.yml中添加：

```yaml
action.destructive_requires_name: true
```

修改后需要滚动重启整个集群生效，这种方法比动态设置更底层、更安全

------

### 4. 验证配置效果

尝试通配符删除（报错）

```http
DELETE 11.0.1.111:9200/dawn*
```

尝试明确名称删除（成功）

```http
DELETE 11.0.1.111:9200/dawn
```
