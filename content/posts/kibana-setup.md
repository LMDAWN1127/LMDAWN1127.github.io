---
title: "Kibana 环境搭建与配置：从 deb 安装到接入 Elasticsearch 集群"
date: 2026-10-14T22:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Kibana", "可视化"]
showToc: true
summary: "记录 Kibana 7.17.22 的离线环境搭建全流程：通过 deb 包下载与 dpkg 安装，修改 kibana.yml 接入 Elasticsearch 集群（配置 server.port/host、elasticsearch.hosts、i18n.locale 中文），使用 systemctl 启动并验证 5601 端口监听，最后通过 WebUI 访问。"
---

### 1. 下载kibana

```bash
root@kibana:~# wget https://artifacts.elastic.co/downloads/kibana/kibana-7.17.22-amd64.deb
```

### 2. 安装kibana

```bash
root@kibana:~# dpkg -i kibana-7.17.22-amd64.deb
```

### 3. 修改kibana的配置文件

```bash
root@kibana:~# vim /etc/kibana/kibana.yml
```

```yaml
# 监听的端口
server.port: 5601
# 监听的地址
server.host: "0.0.0.0"
# 指定ES集群地址
elasticsearch.hosts: ["http://11.0.1.111:9200","http://11.0.1.112:9200","http://11.0.1.113:9200"]
# 国际化语言
i18n.locale: "zh-CN"
```

### 4. 启动kibana

```bash
root@kibana:~# systemctl enable --now kibana.service
root@kibana:~# ss -ntl | grep 5601
LISTEN 0      511          0.0.0.0:5601      0.0.0.0:*         
```

### 5. 访问kibana的WebUI

http://11.0.1.114:5601/

![image-20261015170858992](/images/kibana-setup-image-20261015170858992.png)
