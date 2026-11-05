---
title: "Linux awk 文本分析利器：从语法原理到 Nginx 访问日志统计"
date: 2026-11-05T13:56:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "awk", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "系统剖析 Linux 三剑客之 awk 文本分析利器，全面解析工作机制与生命周期（BEGIN/BODY/END）、核心内部变量与 printf 格式化输出、模式匹配与条件循环控制，并结合 11 个企业级 Nginx 访问日志统计实战案例，深入掌握关联数组在海量日志分析中的高级应用。"
---

# Linux awk 文本分析利器：从语法原理到 Nginx 访问日志统计

`awk` 是一种功能强大的文本流处理与编程语言，专为在 Linux/Unix 环境下进行模式扫描与数据提取而设计。

awk 的输入可以来自标准输入、外部文件或命令管道输出，在生产运维自动化和海量日志（如 Nginx、Apache、MySQL 日志）分析中扮演着极其核心的角色。

---

## 一、awk 工作机制与语法结构

### 1. awk 数据处理流程
1. **逐行扫描**：自顶向下逐行读取输入流，并将整行内容赋值给内部变量 `$0`。
2. **字段切分**：依据字段分隔符（由 `FS` 变量或 `-F` 选项指定，默认是空格或制表符）将每行拆解，分别赋值给 `$1`, `$2`, ..., `$NF`。
3. **模式匹配**：寻找符合模式（Pattern）条件的行；若未指定模式，则默认匹配所有行。
4. **动作执行**：执行对应的大括号 `{action}` 动作；若未指定动作，则默认输出整行到标准输出。

### 2. 标准语法格式
```bash
awk [options] 'commands' filenames
awk [options] -f awk-script-file filenames
```

### 3. options 核心选项与命令阶段
- `-F`：指定输入字段分隔符（默认为空格或 Tab）
- `-v`：预定义用户变量

awk 执行的生命周期分为三个阶段：
```
行处理前（初始化）        逐行处理阶段             所有行处理完成后
   BEGIN { }          Pattern { action }             END { }
```

#### (1) BEGIN 模块（读文件前执行）
常用于初始化变量、打印报表表头或无需读取文件进行的数学运算：
```bash
[root@dawn ~]# awk 'BEGIN{print 1/2}'
0.5
```

修改字段分隔符：
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"} {print $1}' /root/passwd
```

设定输出字段分隔符（`OFS`）：
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"; OFS="---"} {print $1,$3}' /root/passwd
root---0
bin---1
```

执行流程验证：
```bash
[root@dawn ~]# awk 'BEGIN{print "--- START ---"} {print $0} END {print "--- END ---"}' /etc/hosts
--- START ---
127.0.0.1   localhost localhost.localdomain
::1         localhost localhost.localdomain
--- END ---
```

---

## 二、awk 内部变量与格式化输出

### 1. 核心内部变量汇总
| 变量名 | 含义说明 |
| :--- | :--- |
| `$0` | 存储当前整条记录（整行内容） |
| `$1` ~ `$NF` | 当前记录中被切分的第 1 列至最后一列字段 |
| `NF` | Number of Fields，当前行的字段总数 |
| `NR` | Number of Records，已处理记录的总行号（多个文件连续累加） |
| `FNR` | File Number of Records，当前文件内的行号（每个文件独立从 1 开始计） |
| `FS` | Field Separator，输入字段分隔符（默认是空格/制表符） |
| `OFS` | Output Field Separator，输出字段分隔符（默认空格，由逗号 `,` 触发） |
| `RS` | Record Separator，输入记录分隔符（默认换行符 `\n`） |
| `ORS` | Output Record Separator，输出记录分隔符（默认换行符 `\n`） |

### 2. 内部变量经典实操
#### (1) `$0` 与 `NR` 行号
```bash
[root@dawn ~]# awk '{print NR, $0}' /root/passwd | head -n 3
1 root:x:0:0:root:/root:/bin/bash
2 bin:x:1:1:bin:/bin:/sbin/nologin
3 daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) `NR` 与 `FNR` 的多文件区别
```bash
[root@dawn ~]# awk '{print "NR="NR, "FNR="FNR, $1}' /etc/hosts /root/file
NR=1 FNR=1 127.0.0.1
NR=2 FNR=2 ::1
NR=3 FNR=1 #
NR=4 FNR=2 #
```

#### (3) 最后一列 `$NF` 与多重分隔符
```bash
[root@dawn ~]# awk -F: '{print NF, $NF}' /root/passwd | head -n 3
7 /bin/bash
7 /sbin/nologin
7 /sbin/nologin
```

支持集合分隔符（同时以空格或冒号切分）：
```bash
[root@dawn ~]# awk -F"[ :]" '{print NF, $1, $2}' /root/passwd | head -n 3
7 root x
7 bin x
7 daemon x
```

### 3. print 与 printf 格式化函数
- `print`：自动在结尾追加换行符。
- `printf`：严格遵循 C 语言格式化规范，不会自动换行（需显式加 `\n`），支持左对齐 `-` 与定长占位。

```bash
[root@dawn ~]# awk -F: '{printf "%-15s %-10s %-15s\n", $1, $3, $NF}' /root/passwd | head -n 5
root            0          /bin/bash      
bin             1          /sbin/nologin  
daemon          2          /sbin/nologin  
adm             3          /sbin/nologin  
lp              4          /sbin/nologin  
```

---

## 三、模式动作、表达式与条件循环

### 1. 模式匹配与关系运算符
awk 支持正则表达式匹配（`~` 包含，`!~` 不包含）和数值关系比较（`<`, `<=`, `==`, `!=`, `>=`, `>`）：

```bash
# 匹配以 root 开头的行
[root@dawn ~]# awk '/^root/' /root/passwd

# 匹配第 1 列包含 root 且 UID 小于等于 15
[root@dawn ~]# awk -F: '$1 ~ /root/ && $3 <= 15' /root/passwd
root:x:0:0:root:/root:/bin/bash

# 匹配登录 Shell 为 /bin/bash 的用户
[root@dawn ~]# awk -F: '$7 == "/bin/bash" {print $1, $3}' /root/passwd
root 0
```

### 2. datafile 经典多列数据处理
测试样本 `/root/datafile` 如下：
```text
northwest       NW      Charles Dennison        25833   0.25    0.5     0.75
western         WE      Sharon Gray             27548   0.1     0.2     0.3
southwest       SW      Lewis Dalsass           19835   0.15    0.25    0.35
southern        SO      Clara Allen             17087   0.05    0.15    0.25
southeast       SE      Kirk Sanchez            23842   0.2     0.3     0.4
eastern         EA      Peter Guenther          28537   0.3     0.4     0.5
northeast       NE      Richard Phillips        22442   0.25    0.35    0.45
north           NO      Ralph Morgan            14525   0.1     0.2     0.3
central         CT      Ann Stephens            29375   0.35    0.45    0.55
```

实战指令：
```bash
[root@dawn ~]# awk '/west/' /root/datafile
[root@dawn ~]# awk '/^north/' /root/datafile
[root@dawn ~]# awk '$3 ~ /^north/' /root/datafile
[root@dawn ~]# awk '{print $3, $2}' /root/datafile
[root@dawn ~]# awk '$2 !~ /E/{print $1, $2}' /root/datafile
```

### 3. 条件判断（if-else）与计数统计
```bash
[root@dawn ~]# awk -F: '{
    if ($3 == 0) {
        admin++
    } else if ($3 > 0 && $3 < 1000) {
        sys++
    } else {
        normal++
    }
}
END {
    print "管理员数量: " admin
    print "系统用户数量: " sys
    print "普通用户数量: " normal
}' /root/passwd
管理员数量: 1
系统用户数量: 24
普通用户数量: 0
```

### 4. 循环语句（while 与 for）
```bash
# while 循环
[root@dawn ~]# awk 'BEGIN{ i=1; while(i<=5){print i; i++} }'

# for 循环遍历字段
[root@dawn ~]# awk -F: 'NR==1 { for(i=1; i<=NF; i++) print "第"i"列:", $i }' /root/passwd
第1列: root
第2列: x
第3列: 0
第4列: 0
第5列: root
第6列: /root
第7列: /bin/bash
```

---

## 四、awk 关联数组与企业级 Nginx 日志分析

### 1. 关联数组原理
在 awk 中，数组是关联数组（Associative Arrays），其索引可以是任意字符串或数字。

语法模型：`array[key]++`，表示每次扫描到相应的 key，就把该 key 对应的计数器自增 1。在 `END` 块中通过 `for (k in array)` 循环遍历所有键值。

#### 统计系统用户登录 Shell 类型分布
```bash
[root@dawn ~]# awk -F: '{shells[$NF]++} END{for(i in shells){print i, shells[i]}}' /root/passwd
/bin/bash 1
/sbin/nologin 23
/sbin/halt 1
```

---

### 2. 企业级 Nginx 日志分析 11 案例实战

日志格式标准规范：
```text
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                 '$status $body_bytes_sent "$http_referer" '
                 '"$http_user_agent" "$http_x_forwarded_for"';
```
测试日志路径为 `/var/log/nginx/access.log`

#### (1) 统计 2018 年 01 月 25 日全天 PV 访问总量
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{pv++} END{print "总PV量:", pv}' /var/log/nginx/access.log
总PV量: 20
```

#### (2) 统计 10:00 至 10:05 区间的 PV 访问量
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00"{pv++} END{print "区间PV:", pv}' /var/log/nginx/access.log
区间PV: 7
```

#### (3) 统计全天访问量最高的 Top 10 IP
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
16 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (4) 统计特定时间段内访问次数最多的 Top IP
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:10:00"{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
4 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (5) 统计访问频次超过 10 次的高频客户端 IP
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){if(ips[i] > 10){print i, "访问次数:", ips[i]}}}' /var/log/nginx/access.log
11.0.1.1 访问次数: 16
```

#### (6) 统计访问量最多的 Top 10 页面（$request Top 10）
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{urls[$7]++} END{for(u in urls){print urls[u], u}}' /var/log/nginx/access.log | sort -rn | head -n 10
2 /index.html
1 /test.png
1 /login
1 /doc
1 /api/v1
1 /app.js
1 /about.html
```

#### (7) 统计各 URL 访问消耗的总带宽大小（$body_bytes_sent 累加）
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{req[$7]++; size[$7]+=$10} END{for(u in req){print req[u], u, size[u]" Bytes"}}' /var/log/nginx/access.log | sort -rn | head -n 10
2 /index.html 2048 Bytes
1 /test.png 2048 Bytes
1 /login 512 Bytes
1 /doc 4096 Bytes
1 /api/v1 128 Bytes
1 /app.js 0 Bytes
1 /about.html 1024 Bytes
```

#### (8) 统计每个 IP 请求的不同 HTTP 状态码分布
```bash
[root@dawn ~]# awk '{ip_code[$1" "$9]++} END{for(ic in ip_code){print ip_code[ic], ic}}' /var/log/nginx/access.log | sort -rn | head -n 10
15 11.0.1.1 200
2 192.168.1.10 200
1 192.168.1.10 404
1 11.0.1.3 500
1 11.0.1.2 404
1 11.0.1.1 304
```

#### (9) 统计 404 状态码出现的次数
```bash
[root@dawn ~]# awk '$9 == "404"{count++} END{print "404 错误总数:", count}' /var/log/nginx/access.log
404 错误总数: 1
```

#### (10) 统计特定时间段内的 404 异常请求
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00" && $9 == "404"{count++} END{print "该时段404数:", count}' /var/log/nginx/access.log
该时段404数: 1
```

#### (11) 全站 HTTP 状态码分布综合统计
```bash
[root@dawn ~]# awk '{code[$9]++} END{for(s in code){print "状态码 " s ":", code[s] " 次"}}' /var/log/nginx/access.log
状态码 200: 17 次
状态码 304: 1 次
状态码 404: 1 次
状态码 500: 1 次
```
