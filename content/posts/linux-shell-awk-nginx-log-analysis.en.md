---
title: "Linux awk Text Analysis Tool: From Syntax Principles to Nginx Access Log Statistics"
date: 2026-11-05T13:56:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "awk", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "A systematic analysis of awk, one of the three core Linux text processing tools. Covers its working mechanism and lifecycle (BEGIN/BODY/END), core internal variables and printf formatting, pattern matching, conditional/loop control, and 11 real-world enterprise Nginx log analysis scenarios utilizing associative arrays."
---

# Linux awk Text Analysis Tool: From Syntax Principles to Nginx Access Log Statistics

`awk` is a powerful text stream processing and programming language specifically designed for pattern scanning and data extraction in Linux/Unix environments.

awk's input can originate from standard input, external files, or command pipe outputs, playing an essential role in production automation and massive log (e.g., Nginx, Apache, MySQL logs) analysis.

---

## I. awk Working Mechanism and Syntax Structure

### 1. awk Data Processing Workflow
1. **Line-by-line Scanning**: Reads the input stream line by line from top to bottom, assigning the entire line content to the internal variable `$0`.
2. **Field Splitting**: Splits each line according to the field separator (specified by the `FS` variable or the `-F` option, default is space or tab), assigning them respectively to `$1`, `$2`, ..., `$NF`.
3. **Pattern Matching**: Checks for lines matching the Pattern condition; if no pattern is specified, it matches all lines by default.
4. **Action Execution**: Executes the corresponding action within braces `{action}`; if no action is specified, the entire line is printed to standard output by default.

### 2. Standard Syntax Format
```bash
awk [options] 'commands' filenames
awk [options] -f awk-script-file filenames
```

### 3. Core Options and Command Phases
- `-F`: Specifies the input field separator (defaults to space or Tab)
- `-v`: Predefines a user variable

The execution lifecycle of awk is divided into three stages:
```
行处理前（初始化）        逐行处理阶段             所有行处理完成后
   BEGIN { }          Pattern { action }             END { }
```

#### (1) BEGIN Block (Executed Before Reading Files)
Often used to initialize variables, print report headers, or perform math operations without reading files:
```bash
[root@dawn ~]# awk 'BEGIN{print 1/2}'
0.5
```

Modifying the field separator:
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"} {print $1}' /root/passwd
```

Setting the output field separator (`OFS`):
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"; OFS="---"} {print $1,$3}' /root/passwd
root---0
bin---1
```

Execution flow verification:
```bash
[root@dawn ~]# awk 'BEGIN{print "--- START ---"} {print $0} END {print "--- END ---"}' /etc/hosts
--- START ---
127.0.0.1   localhost localhost.localdomain
::1         localhost localhost.localdomain
--- END ---
```

---

## II. awk Internal Variables and Formatted Output

### 1. Summary of Core Internal Variables
| Variable | Description |
| :--- | :--- |
| `$0` | Stores the entire current record (the whole line) |
| `$1` ~ `$NF` | Fields from the 1st column to the last column split in the current record |
| `NF` | Number of Fields, total number of fields in the current line |
| `NR` | Number of Records, total number of processed records (cumulative across multiple files) |
| `FNR` | File Number of Records, record number within the current file (starts at 1 for each file) |
| `FS` | Field Separator, input field separator (default: space/tab) |
| `OFS` | Output Field Separator, output field separator (default: space, triggered by comma `,`) |
| `RS` | Record Separator, input record separator (default: newline `\n`) |
| `ORS` | Output Record Separator, output record separator (default: newline `\n`) |

### 2. Classic Internal Variable Practice
#### (1) `$0` and `NR` Line Numbers
```bash
[root@dawn ~]# awk '{print NR, $0}' /root/passwd | head -n 3
1 root:x:0:0:root:/root:/bin/bash
2 bin:x:1:1:bin:/bin:/sbin/nologin
3 daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) Difference between `NR` and `FNR` Across Multiple Files
```bash
[root@dawn ~]# awk '{print "NR="NR, "FNR="FNR, $1}' /etc/hosts /root/file
NR=1 FNR=1 127.0.0.1
NR=2 FNR=2 ::1
NR=3 FNR=1 #
NR=4 FNR=2 #
```

#### (3) The Last Column `$NF` and Multiple Separators
```bash
[root@dawn ~]# awk -F: '{print NF, $NF}' /root/passwd | head -n 3
7 /bin/bash
7 /sbin/nologin
7 /sbin/nologin
```

Supporting separator sets (splitting simultaneously by space or colon):
```bash
[root@dawn ~]# awk -F"[ :]" '{print NF, $1, $2}' /root/passwd | head -n 3
7 root x
7 bin x
7 daemon x
```

### 3. print and printf Formatting Functions
- `print`: Automatically appends a newline character at the end.
- `printf`: Strictly follows C-style formatting, does not automatically append newlines (requires explicit `\n`), supports left alignment `-` and fixed-width formatting.

```bash
[root@dawn ~]# awk -F: '{printf "%-15s %-10s %-15s\n", $1, $3, $NF}' /root/passwd | head -n 5
root            0          /bin/bash      
bin             1          /sbin/nologin  
daemon          2          /sbin/nologin  
adm             3          /sbin/nologin  
lp              4          /sbin/nologin  
```

---

## III. Pattern Action, Expressions, and Conditional Loops

### 1. Pattern Matching and Relational Operators
awk supports regular expression matching (`~` matches, `!~` does not match) and numeric comparisons (`<`, `<=`, `==`, `!=`, `>=`, `>`):

```bash
# Match lines starting with root
[root@dawn ~]# awk '/^root/' /root/passwd

# Match lines where column 1 contains root and UID is less than or equal to 15
[root@dawn ~]# awk -F: '$1 ~ /root/ && $3 <= 15' /root/passwd
root:x:0:0:root:/root:/bin/bash

# Match users whose login shell is /bin/bash
[root@dawn ~]# awk -F: '$7 == "/bin/bash" {print $1, $3}' /root/passwd
root 0
```

### 2. Classic Multi-column Data Processing with datafile
Sample data `/root/datafile`:
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

Practical commands:
```bash
[root@dawn ~]# awk '/west/' /root/datafile
[root@dawn ~]# awk '/^north/' /root/datafile
[root@dawn ~]# awk '$3 ~ /^north/' /root/datafile
[root@dawn ~]# awk '{print $3, $2}' /root/datafile
[root@dawn ~]# awk '$2 !~ /E/{print $1, $2}' /root/datafile
```

### 3. Conditional Statements (if-else) and Count Statistics
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

### 4. Loop Statements (while and for)
```bash
# while loop
[root@dawn ~]# awk 'BEGIN{ i=1; while(i<=5){print i; i++} }'

# for loop traversing fields
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

## IV. awk Associative Arrays and Enterprise Nginx Log Analysis

### 1. Principle of Associative Arrays
In awk, arrays are associative arrays whose index can be any string or number.

Syntax model: `array[key]++`, meaning whenever the corresponding key is encountered, the counter for that key is incremented by 1. In the `END` block, use `for (k in array)` to traverse all keys.

#### Statistics on System User Login Shell Distribution
```bash
[root@dawn ~]# awk -F: '{shells[$NF]++} END{for(i in shells){print i, shells[i]}}' /root/passwd
/bin/bash 1
/sbin/nologin 23
/sbin/halt 1
```

---

### 2. Enterprise Nginx Log Analysis: 11 Practical Cases

Standard log format specification:
```text
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                 '$status $body_bytes_sent "$http_referer" '
                 '"$http_user_agent" "$http_x_forwarded_for"';
```
Test log file path: `/var/log/nginx/access.log`

#### (1) Calculate Total PV for the Entire Day of Jan 25, 2018
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{pv++} END{print "总PV量:", pv}' /var/log/nginx/access.log
总PV量: 20
```

#### (2) Calculate PV Volume Between 10:00 and 10:05
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00"{pv++} END{print "区间PV:", pv}' /var/log/nginx/access.log
区间PV: 7
```

#### (3) Calculate Top 10 IP Addresses by Daily Traffic
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
16 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (4) Calculate Top Accessing IPs in a Specific Time Range
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:10:00"{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
4 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (5) Find High-frequency Client IPs with More Than 10 Visits
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){if(ips[i] > 10){print i, "访问次数:", ips[i]}}}' /var/log/nginx/access.log
11.0.1.1 访问次数: 16
```

#### (6) Calculate Top 10 Most Visited Pages ($request Top 10)
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

#### (7) Calculate Total Bandwidth Consumed by Each URL (Sum of $body_bytes_sent)
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

#### (8) Calculate HTTP Status Code Distribution for Each IP
```bash
[root@dawn ~]# awk '{ip_code[$1" "$9]++} END{for(ic in ip_code){print ip_code[ic], ic}}' /var/log/nginx/access.log | sort -rn | head -n 10
15 11.0.1.1 200
2 192.168.1.10 200
1 192.168.1.10 404
1 11.0.1.3 500
1 11.0.1.2 404
1 11.0.1.1 304
```

#### (9) Count Total Occurrences of 404 Status Code
```bash
[root@dawn ~]# awk '$9 == "404"{count++} END{print "404 错误总数:", count}' /var/log/nginx/access.log
404 错误总数: 1
```

#### (10) Count 404 Abnormal Requests in a Specific Time Range
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00" && $9 == "404"{count++} END{print "该时段404数:", count}' /var/log/nginx/access.log
该时段404数: 1
```

#### (11) Comprehensive HTTP Status Code Distribution Across the Site
```bash
[root@dawn ~]# awk '{code[$9]++} END{for(s in code){print "状态码 " s ":", code[s] " 次"}}' /var/log/nginx/access.log
状态码 200: 17 次
状态码 304: 1 次
状态码 404: 1 次
状态码 500: 1 次
```
