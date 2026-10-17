---
title: "Filebeat 采集 Tomcat 日志实战：自定义 JSON 访问日志与多行错误日志匹配"
date: 2026-10-17T23:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Filebeat", "Tomcat日志"]
showToc: true
summary: "围绕 EFK 采集 Tomcat 日志展开：部署 Tomcat 并自定义 JSON 格式访问日志（server.xml AccessLogValve），用 Filebeat 采集 JSON 访问日志写入 Elasticsearch（索引 dawn-log-tomcat，json.keys_under_root 关键配置），以及用 multiline 多行匹配采集 catalina.out 启动/错误日志（索引 dawn-log-tomcat-errorlog），最后在 Kibana 查看数据。"
---

## EFK架构采集tomcat日志

### 1. 部署tomcat

```bash
root@elk01:~# wget https://archive.apache.org/dist/tomcat/tomcat-10/v10.1.25/bin/apache-tomcat-10.1.25.tar.gz
```

### 2. 创建工作目录

```bash
root@elk01:~# mkdir /dawn/softwares -pv
```

### 3. 解压软件包

```bash
root@elk01:~# tar xf apache-tomcat-10.1.25.tar.gz -C /dawn/softwares/
```

### 4. 配置tomcat的环境变量

```bash
root@elk01:~# vim /etc/profile.d/tomcat.sh
```

```bash
#!/bin/bash

export JAVA_HOME=/usr/share/elasticsearch/jdk
export TOMCAT_HOME=/dawn/softwares/apache-tomcat-10.1.25
export PATH=$PATH:$JAVA_HOME/bin:$TOMCAT_HOME/bin
```

```bash
root@elk01:~# source /etc/profile.d/tomcat.sh
```

### 5. 启动tomcat服务

```bash
root@elk01:~# catalina.sh start
Using CATALINA_BASE:   /dawn/softwares/apache-tomcat-10.1.25
Using CATALINA_HOME:   /dawn/softwares/apache-tomcat-10.1.25
Using CATALINA_TMPDIR: /dawn/softwares/apache-tomcat-10.1.25/temp
Using JRE_HOME:        /usr/share/elasticsearch/jdk
Using CLASSPATH:       /dawn/softwares/apache-tomcat-10.1.25/bin/bootstrap.jar:/dawn/softwares/apache-tomcat-10.1.25/bin/tomcat-juli.jar
Using CATALINA_OPTS:
Tomcat started.
root@elk01:~# ss -ntl | grep 8080
LISTEN 0      100                     *:8080             *:*
```

### 6. 访问tomcat服务

http://11.0.1.111:8080/

![image-20261017183648334](/images/filebeat-tomcat-log-collection-image-20261017183648334.png)

### 7. 查看访问日志

```bash
root@elk01:~# cat /dawn/softwares/apache-tomcat-10.1.25/logs/localhost_access_log.2026-10-17.txt
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET / HTTP/1.1" 200 11239
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /tomcat.svg HTTP/1.1" 200 67795
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /tomcat.css HTTP/1.1" 200 5584
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /bg-nav.png HTTP/1.1" 200 1401
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /bg-middle.png HTTP/1.1" 200 1918
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /bg-button.png HTTP/1.1" 200 713
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /asf-logo-wide.svg HTTP/1.1" 200 27235
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /bg-upper.png HTTP/1.1" 200 3103
11.0.1.1 - - [17/Oct/2026:10:35:18 +0000] "GET /favicon.ico HTTP/1.1" 200 21630
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET / HTTP/1.1" 200 11239
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /tomcat.css HTTP/1.1" 200 5584
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /tomcat.svg HTTP/1.1" 200 67795
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /bg-nav.png HTTP/1.1" 200 1401
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /asf-logo-wide.svg HTTP/1.1" 200 27235
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /bg-upper.png HTTP/1.1" 200 3103
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /bg-button.png HTTP/1.1" 200 713
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /bg-middle.png HTTP/1.1" 200 1918
11.0.1.1 - - [17/Oct/2026:10:36:39 +0000] "GET /favicon.ico HTTP/1.1" 200 21630
```

## 自定义tomcat日志并使用filebeat采集

### 1. 自定义日志格式

```bash
root@elk01:~# vim /dawn/softwares/apache-tomcat-10.1.25/conf/server.xml
```

```xml
...(143行左右)
              <Host name="tomcat.dawn.com"  appBase="webapps"
                unpackWARs="true" autoDeploy="true">

                <Valve className="org.apache.catalina.valves.AccessLogValve" directory="logs"
            prefix="tomcat.dawn.com_access_log" suffix=".json"
pattern="{&quot;clientip&quot;:&quot;%h&quot;,&quot;ClientUser&quot;:&quot;%l&quot;,&quot;authenticated&quot;:&quot;%u&quot;,&quot;AccessTime&quot;:&quot;%t&quot;,&quot;request&quot;:&quot;%r&quot;,&quot;status&quot;:&quot;%s&quot;,&quot;SendBytes&quot;:&quot;%b&quot;,&quot;Query?string&quot;:&quot;%q&quot;,&quot;partner&quot;:&quot;%{Referer}i&quot;,&quot;http_user_agent&quot;:&quot;%{User-Agent}i&quot;}"/>

          </Host>
```

### 2. 重启tomcat服务

```bash
root@elk01:~# catalina.sh stop
Using CATALINA_BASE:   /dawn/softwares/apache-tomcat-10.1.25
Using CATALINA_HOME:   /dawn/softwares/apache-tomcat-10.1.25
Using CATALINA_TMPDIR: /dawn/softwares/apache-tomcat-10.1.25/temp
Using JRE_HOME:        /usr/share/elasticsearch/jdk
Using CLASSPATH:       /dawn/softwares/apache-tomcat-10.1.25/bin/bootstrap.jar:/dawn/softwares/apache-tomcat-10.1.25/bin/tomcat-juli.jar
Using CATALINA_OPTS:
root@elk01:~# catalina.sh start
Using CATALINA_BASE:   /dawn/softwares/apache-tomcat-10.1.25
Using CATALINA_HOME:   /dawn/softwares/apache-tomcat-10.1.25
Using CATALINA_TMPDIR: /dawn/softwares/apache-tomcat-10.1.25/temp
Using JRE_HOME:        /usr/share/elasticsearch/jdk
Using CLASSPATH:       /dawn/softwares/apache-tomcat-10.1.25/bin/bootstrap.jar:/dawn/softwares/apache-tomcat-10.1.25/bin/tomcat-juli.jar
Using CATALINA_OPTS:
Tomcat started.
```

### 3. 验证日志格式

3. 1 使用curl工具测试

```bash
root@elk03:/etc/filebeat# curl -H 'HOST: tomcat.dawn.com' 11.0.1.111:8080
```

3. 2 查看日志

```bash
root@elk01:~# cat /dawn/softwares/apache-tomcat-10.1.25/logs/
catalina.2026-10-17.log                     localhost_access_log.2026-10-17.txt
catalina.out                                tomcat.dawn.com_access_log.2026-10-17.json
localhost.2026-10-17.log
root@elk01:~# cat /dawn/softwares/apache-tomcat-10.1.25/logs/tomcat.dawn.com_access_log.2026-10-17.json
{"clientip":"11.0.1.113","ClientUser":"-","authenticated":"-","AccessTime":"[17/Oct/2026:11:06:28 +0000]","request":"GET / HTTP/1.1","status":"200","SendBytes":"11239","Query?string":"","partner":"-","http_user_agent":"curl/7.81.0"}
```

### 4. 编写filebeat采集tomcat日志

```bash
root@elk01:/etc/filebeat# vim config/07-tomcat-to-es.yaml
```

```yaml
filebeat.inputs:
- type: log
  paths:
    - /dawn/softwares/apache-tomcat-10.1.25/logs/tomcat.dawn.com_access_log*.json
  # 将message的json格式解析后放在顶级字段中，并删除message字段。
  json.keys_under_root: true

output.elasticsearch:
  hosts: 
  - "http://11.0.1.111:9200"
  - "http://11.0.1.112:9200"
  - "http://11.0.1.113:9200"
  index: "dawn-log-tomcat"

# 禁用索引的生命周期(Index Lifecycle Management,简称"ilm")，如果不禁用则忽略自定义索引名称
setup.ilm.enabled: false
# ES的索引模板名称
setup.template.name: "dawn"
# ES索引模板的匹配模式
setup.template.pattern: "dawn-log*"
# 如果索引模板已经存在，是否覆盖，推荐设置为false
setup.template.overwrite: false
# 设置索引模板
setup.template.settings:
  # 设置索引的分片数量
  index.number_of_shards: 5
  # 设置索引的副本数量
  index.number_of_replicas: 0
```

### 5. 启动filebeat

```bash
root@elk01:/etc/filebeat# filebeat -e -c config/07-tomcat-to-es.yaml
```

![image-20261017191453160](/images/filebeat-tomcat-log-collection-image-20261017191453160.png)

## filebeat多行匹配采集tomcat启动日志

### 1. 编写filebeat配置文件

```bash
root@elk01:/etc/filebeat# vim config/08-tomcat_errlog-to-es.yaml
filebeat.inputs:
- type: log
  paths:
    - /dawn/softwares/apache-tomcat-10.1.25/logs/catalina.out 
  multiline:
    # 指定多行匹配的模式，支持pattern模式
    type: pattern
    # 指定匹配模式
    pattern: '^\d{2}'
    # 参考链接: https://www.elastic.co/guide/en/beats/filebeat/7.17/multiline-examples.html
    negate: true
    match: after

output.elasticsearch:
  hosts: 
  - "http://11.0.1.111:9200"
  - "http://11.0.1.112:9200"
  - "http://11.0.1.113:9200"
  index: "dawn-log-tomcat-errorlog"

# 禁用索引的生命周期(Index Lifecycle Management,简称"ilm")，如果不禁用则忽略自定义索引名称
setup.ilm.enabled: false
# ES的索引模板名称
setup.template.name: "dawn"
# ES索引模板的匹配模式
setup.template.pattern: "dawn-log*"
# 如果索引模板已经存在，是否覆盖，推荐设置为false
setup.template.overwrite: false
# 设置索引模板
setup.template.settings:
  # 设置索引的分片数量
  index.number_of_shards: 5
  # 设置索引的副本数量
  index.number_of_replicas: 0
```

### 2. 启动实例

```bash
root@elk01:/etc/filebeat# filebeat -e -c config/08-tomcat_errlog-to-es.yaml
```

### 3. kibana查看数据

![image-20261017234049250](/images/filebeat-tomcat-log-collection-image-20261017234049250.png)
