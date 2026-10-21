---
title: "Kibana RBAC 实战：角色创建、用户授权与空间隔离"
date: 2026-10-21T19:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack"]
showToc: true
summary: "Kibana RBAC 实操：内置五大系统用户、创建 dawn_log_reader 只读角色（cluster/indices/applications 三段权限）、创建 elk_viewer 用户并五项登录验证（空间隔离、索引授权边界、只读界面、禁 Dev Tools、禁建索引模式），以及 Kibana 空间管理。"
---

## kibana的RBAC

内置用户：

| 用户            | 角色            | 用途                            |
| --------------- | --------------- | ------------------------------- |
| elastic         | superuser       | 超级管理员，本环境密码为 123456 |
| kibana_system   | kibana_system   | Kibana 服务连接 ES 专用         |
| logstash_system | logstash_system | logstash 集中写 ES              |
| beats_system    | beats_system    | filebeat 等 beats 写 ES         |
| apm_system      | apm_system      | APM Server                      |

### 1. 创建角色（RBAC 的核心）

角色由三段权限组成：

| 段           | 控制对象          | 典型内容                                                     |
| ------------ | ----------------- | ------------------------------------------------------------ |
| cluster      | 集群级操作        | monitor、manage_index_template、manage_security              |
| indices      | 索引级数据操作    | names（索引名模式，支持通配）+ privileges（read/write/all 等） |
| applications | Kibana 等应用功能 | feature_xxx.read / .write / .all + resources（空间）         |

创建"日志只读查看员"角色，全部在界面点：

1. 左侧导航最下方 Stack Management（齿轮图标）→ 左侧「安全」分区 → 角色 → 右上角创建角色
2. 角色名称填 `dawn_log_reader`
3. 集群权限：勾选 `monitor`（集群只读监控）
4. 索引权限：点添加索引权限 → 「索引」填 `dawn-log*`，「权限」勾选 `read` 和 `view_index_metadata`
5. Kibana 权限：点添加 Kibana 权限 → 「工作区」下拉选默认 → 在功能权限表里把 Discover、仪表板、可视化、地图 四行设为只读，其余保持无
6. 保存

![image-20261021171358019](/images/kibana-rbac-image-20261021171358019.png)

![image-20261021171836785](/images/kibana-rbac-image-20261021171836785.png)

![image-20261021171930836](/images/kibana-rbac-image-20261021171930836.png)

权限设计要点：

- indices 的索引模式用通配 `dawn-log*`，覆盖 dawn-log-nginx、dawn-log-filestream-*、dawn-logstash-* 等所有日志索引
- privileges 最小集：`view_index_metadata`（Kibana 列索引、查字段必需）+ `read`（检索）；不给 `write` 就是只读用户
- Kibana 权限控制到功能按钮级：Discover 只给只读就只能看不能存检索，不给「开发工具」就用不了 Dev Tools
- 「工作区」控制空间：选「* 所有工作区」可进所有空间，只选「默认」就进不了别的空间

### 2. 创建用户并绑定角色

1. Stack Management → 安全 → 用户 → 右上角创建用户
2. 表单填写：
   - 用户名：`elk_viewer`
   - 密码 / 确认密码：`Dawn123456`
   - 全名：ELK 日志只读查看员
   - 电子邮件地址：elk_viewer@dawn.com
   - 角色：下拉选择 `dawn_log_reader`
3. 保存

![image-20261021172259314](/images/kibana-rbac-image-20261021172259314.png)

![image-20261021172417341](/images/kibana-rbac-image-20261021172417341.png)

用户与角色是多对多，一个用户可以配多个角色，最终权限取并集，我演示的是一个用户绑一个角色

### 3. 准备索引模式

1. Stack Management →（Kibana 分组下）索引模式，确认列表里有 `dawn-log-tomcat-errorlog`（149 条 tomcat 错误日志，elk_viewer 授权范围内）和 `dawn-apps-*`（授权范围外，作对照）
2. 列表里没有的，点创建索引模式补建：名称填索引模式名（如 `dawn-log-tomcat-errorlog`），下一步选时间字段 `@timestamp`，保存

![image-20261021192517849](/images/kibana-rbac-image-20261021192517849.png)

![image-20261021192534028](/images/kibana-rbac-image-20261021192534028.png)

### 4. 用 elk_viewer 登录验证

开一个无痕窗口，用 elk_viewer / Dawn123456 登录

![image-20261021193023664](/images/kibana-rbac-image-20261021193023664.png)

**验证 1：空间切换器只剩「默认」。** 看页面左上角的空间切换器，elk_viewer 只能看到「默认」；elastic 视角是「默认」+「运维空间」两个。原因是 dawn_log_reader 的 Kibana 权限只授权了「默认」工作区

![image-20261021193114554](/images/kibana-rbac-image-20261021193114554.png)

**验证 2：授权范围内有数据。** 进 Discover → 左上角索引模式选 `dawn-log-tomcat-errorlog` → 文档列表正常展示

![image-20261021193229297](/images/kibana-rbac-image-20261021193229297.png)

**验证 3：授权范围外看得见对象、读不出数据。** 在 Discover 左上角把索引模式切换成 `dawn-apps-*`，会报错或查不出数据。默认空间里能看到 dawn-apps-* 的索引模式对象名，但读数据仍然按角色里的索引权限卡

![image-20261021193327046](/images/kibana-rbac-image-20261021193327046.png)

**验证 4：界面是只读的。**

- Discover 里改完检索条件，没有可用的「保存」入口（或提示无权限）——Discover 只授了只读
- 左侧导航没有 Stack Management 入口——本角色没有授予任何管理类功能
- 地址栏直接输入 `http://11.0.1.114:5601/app/dev_tools` 也进不去（返回 403）——没给「开发工具」功能权限

**验证 5：elk_viewer 自己建不了索引模式。** 即使索引模式名指向授权索引（如 `dawn-log-es*`），elk_viewer 尝试创建索引模式同样会被拒，所以索引模式只能由 elastic 建好给大家用

![image-20261021193958909](/images/kibana-rbac-image-20261021193958909.png)

### 5. Kibana 空间

Kibana 用"空间"给索引模式、仪表板、可视化分组，角色 Kibana 权限里的「工作区」决定用户能进哪些空间。

创建空间：

1. 点左上角空间切换器 → 管理空间
2. 点创建空间，ID 填 `elk_ops`，名称填「运维空间」
3. 保存

![image-20261021193437160](/images/kibana-rbac-image-20261021193437160.png)
