---
title: "Logstash 进阶实战：多分支语句、多实例与 pipeline 语法"
date: 2026-10-21T13:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ElasticStack", "Logstash"]
showToc: true
summary: "Logstash 进阶第二篇：if 多分支语句（file/beats/tcp 三种输入分别走 grok+geoip+useragent）、多实例部署（多进程各加载一个配置）与 pipelines.yml 多 pipeline 语法，以及三者的关系与 sincedb 注意事项。"
---

# logstash的多分支语句、多实例与pipeline语法

## 一、logstash的多分支语句

### 1. 自定义模式文件

```bash
root@elk03:/etc/logstash/config# vim /etc/logstash/dawn-patterns/dawn
SCHOOL (dawn|devops|k8s)
CLAss [a-z0-9]+[0-9]{2}
YEAR4 (19|20)[0-9]{2}
year  (19|20)[0-9]{2}
```

### 2. 测试数据

xixi 分支：

```
123.112.21.112 - - [20/Oct/2026:21:20:00 +0800] "GET /index.html HTTP/1.1" 200 1024 "https://www.dawn.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
202.96.134.133 - - [20/Oct/2026:21:20:05 +0800] "POST /api/login HTTP/1.1" 404 512 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
8.8.8.8 - - [20/Oct/2026:21:20:10 +0800] "GET /static/app.js HTTP/1.1" 200 20480 "https://www.dawn.com/index.html" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36"
```

haha 分支：

```yaml
filebeat.inputs:
- type: log
  paths: ["/tmp/haha.log"]
  fields:
    type: haha
  fields_under_root: true

output.logstash:
  hosts: ["127.0.0.1:9999"]
```

hehe 分支：

```bash
exec 3<>/dev/tcp/127.0.0.1/8888
printf '%s\n' "dawn haha devops01 xixi 2024 123.112.21.112" >&3
printf '%s\n' "devops haha k8s07 xixi 2025 8.8.8.8" >&3
printf '%s\n' "这一行没有IP 应该grok失败" >&3
exec 3>&-
```

### 3. 配置文件

```bash
root@elk03:/etc/logstash# vim config/08-input_multiple-to-es.yaml
```

```yaml
input {
  file {
    path => ["/tmp/xixi.log"]
    start_position => "beginning"
    type => "xixi"
  }

  beats {
    port => 9999
    type => "haha"
  }

  tcp {
    port => 8888
    type => "hehe"
  }
}

filter {
   # 如果类型是"xixi"，则遵循if语句代码块的处理逻辑。
   if [type] == "xixi" {
       grok {
         match => {
           message => "%{HTTPD_COMMONLOG}"
         }
       }

       geoip {
         source => "clientip"
         # 不写 database 插件会自己去下载 mmdb，且每次新 path.data 都要重下
         database => "/etc/logstash/GeoLite2-City.mmdb"
       }

       useragent {
         source => "message"

         target => "dawn-device"
       }

       date {
          match => ["timestamp","dd/MMM/yyyy:HH:mm:ss Z"]
       }


       mutate {
         remove_field => [ "ecs","agent","tags","input","@version","log","host" ]
       }
   } else if [type] == "haha" {
       mutate {
         remove_field => [ "ecs","agent","tags","input","@version","log", "host"]
       }
   } else {
       grok {
          patterns_dir => ["/etc/logstash/dawn-patterns/"]

          match => {
            message => "%{SCHOOL:dawn-school} haha %{CLAss:dawn-class} xixi %{year:dawn-year} %{IPV4:dawn-ip}"
          }

          tag_on_failure => ["_grokparsefailure"]
      }

      mutate {
        remove_field => [ "ecs","agent","tags","input","@version","log","host" ]
      }
   }
}

output {
  stdout {}

  if [type] == "xixi" {
      elasticsearch {
         hosts => ["http://11.0.1.111:9200","http://11.0.1.112:9200","http://11.0.1.113:9200"]
         index => "dawn-logstash-if-xixi-%{+yyyy.MM.dd}"
      }
  } else if [type] == "haha" {
      elasticsearch {
         hosts => ["http://11.0.1.111:9200","http://11.0.1.112:9200","http://11.0.1.113:9200"]
         index => "dawn-logstash-if-haha-%{+yyyy.MM.dd}"
      }
  }else {
      elasticsearch {
         hosts => ["http://11.0.1.111:9200","http://11.0.1.112:9200","http://11.0.1.113:9200"]
         index => "dawn-logstash-if-hehe-%{+yyyy.MM.dd}"
      }
  }
}
```

### 4. 启动与验证

```bash
logstash -f /etc/logstash/config/08-input_multiple-to-es.yaml --path.data=/tmp/logstash-08f --path.logs=/tmp/logstash-08f/logs
```

查询

```bash
curl -s "http://11.0.1.111:9200/dawn-logstash-if-hehe-2026.10.20/_count"
```

## 二、logstash的多实例

### 1. 创建测试数据

```bash
cat > /tmp/apps.log <<'EOF'
INFO 2026-10-20 09:15:32|1001|login|svip1|99.50
INFO 2026-10-20 09:16:05|1002|logout|svip2|0.00
WARN 2026-10-20 10:20:11|1003|buy|svip3|199.00
ERROR 2026-10-20 11:05:47|1004|refund|svip4|59.90
INFO 2026-10-20 12:30:00|1005|login|svip5|128.00
EOF
```

### 2. 启动三个实例

```bash
# 实例1
logstash -rf config/02-file-to-stdout.conf --path.data=/tmp/logstash-haha

# 实例2
logstash -rf config/03-file-filter-elasticsearch.conf --path.data=/tmp/logstash-haha2

# 实例3
logstash -rf config/04-file-filter-elasticsearch_custom_index.conf --path.data=/tmp/logstash-xixi
```

### 3. 验证

```bash
curl -s "http://127.0.0.1:9200/dawn-apps-2026.10.20/_count"

curl -s "http://127.0.0.1:9200/_cat/indices/logstash-*?v&h=index,docs.count"
```

## 三、logstash的pipeline语法

### 1. pipelines.yml

```bash
mkdir -pv /usr/share/logstash/config/
vim /usr/share/logstash/config/pipelines.yml
```

```yaml
- pipeline.id: dawn_xixi
  path.config: "/etc/logstash/config/02-file-to-stdout.conf"

- pipeline.id: dawn_haha
  path.config: "/etc/logstash/config/03-file-filter-elasticsearch.conf"
```

### 2. 启动验证

```bash
logstash -r
```

日志确认两个 pipeline 都加载（一个进程，多个 pipeline）：

```bash
[INFO ] agent - Pipelines running {:count=>2, :running_pipelines=>[:dawn_xixi, :dawn_haha], :non_running_pipelines=>[]}
```

用 `-f` 时自动忽略 pipelines.yml：

```bash
[WARN ] [LogStash::Runner] multilocal - Ignoring the 'pipelines.yml' file because modules or command line options are specified
```

### 3. sincedb

```bash
rm -f /usr/share/logstash/data/plugins/inputs/file/.sincedb_*    # 裸命令方式
rm -f /var/lib/logstash/plugins/inputs/file/.sincedb_*           # --path.settings /etc/logstash 方式
```

### 4. 三者的关系

1. pipeline 和多分支语句的关系：在每个 pipeline 中，都可以使用多分支语法
2. logstash 实例和 pipeline 的关系：一个 logstash 可以启动多个 pipeline，本质上就是一个进程加载了多个配置文件
3. logstash 多实例：启动多个 logstash 进程，每个进程都有一个 main pipeline，本质上就是每个进程加载一个配置文件
