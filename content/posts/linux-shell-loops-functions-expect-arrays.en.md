---
title: "Shell Scripting Hands-on (Part 3): Loops, Function Packaging, Expect Automation, and Array Statistics"
date: 2026-11-05T14:57:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "A comprehensive guide to for and while loops in Shell, along with high-concurrency background network scanning. Master loop flow control (break, continue, exit), modular function design, automated interactive tasks via expect, and advanced indexed and associative arrays for data aggregation, frequency counting, and deduplicated random lottery algorithms."
---

# Shell Scripting Hands-on (Part 3): Loops, Function Packaging, Expect Automation, and Array Statistics

---

## I. for Loops and Batch Operations Practice

`for` loops are suitable for scenarios where the number of iterations is known or where iterating over a fixed list of items is required.

### 1. for Loop Syntax Structure
```bash
for 变量名 in 取值列表; do
    循环动作指令集合
done
```
The value list is separated by **spaces or newlines**, and can be numbers, strings, Shell sequences, command substitutions, or file contents.

### 2. Various Iteration Methods
#### (1) Iterating over Sequences and Numbers
```bash
[root@zabbix ~]# for i in {1..3}; do echo "第 $i 次循环"; done
第 1 次循环
第 2 次循环
第 3 次循环
```

#### (2) Iterating over Command Execution Results (Using Backticks or `$()`)
```bash
[root@zabbix ~]# for host in $(cat /etc/hosts | awk '{print $1}'); do
    echo "Host IP: $host"
done
```

---

### 3. Practical Case 1: Batch Creation and Management of System Users
Automate the creation of users `dawn1` through `dawn5` on `zabbix`:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/batch_user.sh
#!/bin/bash
for i in {1..5}; do
    user="dawn$i"
    id $user &>/dev/null
    if [ $? -ne 0 ]; then
        useradd $user
        echo "123456" | passwd --stdin $user &>/dev/null
        echo "用户 $user 创建成功"
    else
        echo "用户 $user 已存在，跳过创建"
    fi
done
EOF
[root@zabbix ~]# chmod +x /root/batch_user.sh
[root@zabbix ~]# /root/batch_user.sh
用户 dawn1 创建成功
用户 dawn2 创建成功
用户 dawn3 创建成功
用户 dawn4 创建成功
用户 dawn5 创建成功
```

---

### 4. Practical Case 2: High-Concurrency LAN Host Liveness Detection
Leverage Bash background subshells `&` and `wait` to perform sub-second LAN IP connectivity scans:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/fast_ping.sh
#!/bin/bash
NET="11.0.1"
echo "开始扫描 $NET.0/24 网段存活主机..."
for i in $(seq 1 100); do
    {
        ip="$NET.$i"
        ping -c 1 -W 1 "$ip" &>/dev/null
        if [ $? -eq 0 ]; then
            echo "[ ONLINE ] 主机 $ip 存活"
        fi
    } &
done
wait
echo "扫描完毕！"
EOF
[root@zabbix ~]# chmod +x /root/fast_ping.sh
```

---

## II. while Loops and Loop Flow Control

`while` loops continue executing as long as the condition evaluates to true, making them ideal for continuous polling and line-by-line data reading.

### 1. while Syntax Structure and Condition Loops
```bash
while [ 条件表达式 ]; do
    执行指令集合
done
```

Cumulative sum from 1 to 100:
```bash
[root@zabbix ~]# i=1; sum=0
[root@zabbix ~]# while [ $i -le 100 ]; do
    let sum+=i
    let i++
done
[root@zabbix ~]# echo "1到100累加和: $sum"
1到100累加和: 5050
```

---

### 2. Practical Case: Reading Files Line by Line with while
Standard line-by-line reading syntax: `while read line; do ... done < file`:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/batch_add_from_file.sh
#!/bin/bash
# 格式：用户名 密码
cat << 'DATA' > /tmp/users.txt
dawn_ops 123456
dawn_dev 654321
DATA

while read username password; do
    id "$username" &>/dev/null
    if [ $? -ne 0 ]; then
        useradd "$username"
        echo "$password" | passwd --stdin "$username" &>/dev/null
        echo "用户 $username 添加成功"
    fi
done < /tmp/users.txt
EOF
[root@zabbix ~]# chmod +x /root/batch_add_from_file.sh
```

---

### 3. Loop Flow Control: break, continue, and exit
- `exit [code]`: Immediately **terminates and exits the entire script**, returning an exit status code (0-255).
- `break`: Immediately **breaks out of the entire current loop level**, proceeding to subsequent code outside the loop.
- `continue`: Immediately **skips the remainder of the current iteration**, jumping straight to the condition check for the next iteration.

Comparative demonstration:
```bash
# break example: Terminates loop upon encountering 3
[root@zabbix ~]# for i in {1..5}; do
    [ $i -eq 3 ] && break
    echo $i
done
1
2

# continue example: Skips 3 and continues with subsequent iterations
[root@zabbix ~]# for i in {1..5}; do
    [ $i -eq 3 ] && continue
    echo $i
done
1
2
4
5
```

---

## III. Shell Function Packaging and Modular Design

Functions are well-organized, reusable blocks of code that serve as the foundation of modular script architecture.

### 1. Function Declaration Syntax
Three declaration styles (Method 1 is standard and recommended):
```bash
# Style 1
func_name() {
    指令集合
}

# Style 2
function func_name() {
    指令集合
}

# Style 3
function func_name {
    指令集合
}
```

### 2. Function Arguments and Variable Scopes
- **Inside functions `$1`, `$2`**: Represent the 1st and 2nd arguments passed to that specific function, **not** the script's global positional parameters.
- **Local variables `local`**: Declare with `local var=value` inside functions; the variable remains active only during the function's execution lifecycle, preventing global namespace pollution.

```bash
[root@zabbix ~]# cat << 'EOF' > /root/fun_test.sh
#!/bin/bash
test_scope() {
    local name="local_dawn"
    echo "函数内部 name: $name"
}
name="global_dawn"
test_scope
echo "函数外部 name: $name"
EOF
[root@zabbix ~]# sh /root/fun_test.sh
函数内部 name: local_dawn
函数外部 name: global_dawn
```

---

### 3. Function Return Values (return vs. echo)
- `return [0-255]`: Specifically designed to return **execution status codes**, retrieved via `$?`.
- `echo`: Specifically designed to output **data or computed results**, captured via command substitution `var=$(func)`.

```bash
[root@zabbix ~]# cat << 'EOF' > /root/calc.sh
#!/bin/bash
add() {
    echo $[$1 + $2]
}
result=$(add 50 70)
echo "计算结果为: $result"
EOF
[root@zabbix ~]# sh /root/calc.sh
计算结果为: 120
```

---

### 4. Practical Case: Service and URL Health Check Function `fun.sh`
Written on `zabbix`:
```bash
[root@zabbix ~]# cat /root/fun.sh
#!/bin/bash
check_url() {
    curl -I -s -m 3 -o /dev/null "$1"
    if [ $? -eq 0 ]; then
        echo "$1 is OK"
    else
        echo "$1 is DOWN"
    fi
}
check_url www.baidu.com
[root@zabbix ~]# /root/fun.sh
www.baidu.com is OK
```

---

## IV. expect Automated Interactive Login and Key Distribution

In environments where passwordless SSH is not yet configured, `expect` uses pseudo-terminals to automate interactive dialogues with tools like `ssh`, `passwd`, and `sftp`.

### 1. Core expect Commands
| Command | Description |
| :--- | :--- |
| `spawn` | Launches a new process whose I/O is intercepted and handled by expect |
| `expect "string"` | Monitors output and waits for a specific target string (supports regex) |
| `send "data\r"` | Simulates user keystrokes, with `\r` representing Enter |
| `interact` | Transfers session control to the user's keyboard for manual interaction |
| `expect eof` | Waits for the target child process to terminate and catches the EOF signal |
| `set timeout n` | Sets wait timeout in seconds (`-1` means wait indefinitely) |

---

### 2. Practical Case: Automated Batch SSH Public Key Distribution
Combining `sshpass` and `expect` to establish passwordless SSH across a cluster:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/distribute_key.sh
#!/bin/bash
# 1. 本地生成密钥对
[ ! -f ~/.ssh/id_rsa ] && ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa

# 2. 目标集群主机列表
CLUSTER_IPS="11.0.1.7 11.0.1.71 101.133.147.148"
PASSWORD="000000"

for ip in $CLUSTER_IPS; do
    echo "正在向 $ip 分发公钥..."
    /usr/bin/expect <<-EOF
        set timeout 5
        spawn ssh-copy-id -o StrictHostKeyChecking=no root@$ip
        expect {
            "yes/no" { send "yes\r"; exp_continue }
            "password:" { send "$PASSWORD\r" }
        }
        expect eof
EOF
done
EOF
[root@zabbix ~]# chmod +x /root/distribute_key.sh
```

---

## V. Shell Arrays and Advanced Data Statistics

Bash supports two array types:
1. **Indexed Arrays**: Indexed by **integers** (zero-based).
2. **Associative Arrays**: Indexed by **strings** (Bash 4.0+, explicitly declared with `declare -A`).

### 1. Indexed Array Operations
```bash
# Declaration and assignment
[root@zabbix ~]# array=(11.0.1.7 11.0.1.71 101.133.147.148)

# Access all elements and all indices
[root@zabbix ~]# echo "所有元素: ${array[@]}"
所有元素: 11.0.1.7 11.0.1.71 101.133.147.148
[root@zabbix ~]# echo "所有下标: ${!array[@]}"
所有下标: 0 1 2

# Retrieve array length (element count)
[root@zabbix ~]# echo "数组长度: ${#array[@]}"
数组长度: 3
```

---

### 2. Associative Arrays and Frequency Aggregation Model
Associative arrays are the most powerful tool in Shell for grouped aggregation and frequency counting.

Core aggregation logic:
```bash
declare -A count_dict
let count_dict[元素名]++
```

#### Practical Case 1: Counting Gender Distribution in a File
Categorize and aggregate `/root/sex.txt` on host `dawn`:
```bash
[root@dawn ~]# cat /root/sex.txt
male
female
male
male
female

[root@dawn ~]# cat << 'EOF' > /root/count_sex.sh
#!/bin/bash
declare -A sex_stat
while read line; do
    [ -z "$line" ] && continue
    let sex_stat["$line"]++
done < /root/sex.txt

echo "=== 性别统计结果 ==="
for k in "${!sex_stat[@]}"; do
    echo "$k: ${sex_stat[$k]} 次"
done
EOF
[root@dawn ~]# chmod +x /root/count_sex.sh
[root@dawn ~]# /root/count_sex.sh
=== 性别统计结果 ===
female: 2 次
male: 3 次
```

---

#### Practical Case 2: Counting Client IP Request Frequencies in Nginx Logs
Use associative arrays to aggregate distinct IP visit frequencies from `/var/log/nginx/access.log`:
```bash
[root@dawn ~]# cat << 'EOF' > /root/count_nginx_ip.sh
#!/bin/bash
declare -A ip_counts
while read line; do
    ip=$(echo "$line" | awk '{print $1}')
    [ -n "$ip" ] && let ip_counts["$ip"]++
done < /var/log/nginx/access.log

echo "=== Nginx 访问 IP 频次统计 ==="
for ip in "${!ip_counts[@]}"; do
    printf "%-18s 访问次数: %d\n" "$ip" "${ip_counts[$ip]}"
done
EOF
[root@dawn ~]# chmod +x /root/count_nginx_ip.sh
[root@dawn ~]# /root/count_nginx_ip.sh
=== Nginx 访问 IP 频次统计 ===
11.0.1.1           访问次数: 16
11.0.1.2           访问次数: 1
11.0.1.3           访问次数: 1
192.168.1.10       访问次数: 2
```

---

#### Practical Case 3: Automated Deduplicated Lottery and Raffle Program
Using `$RANDOM` and arrays to create an unbiased non-repeating number generator:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/lottery.sh
#!/bin/bash
> /tmp/lottery_record.txt
echo "=== 集群运维抽奖系统 (输入 'ok' 结束) ==="

while true; do
    read -p "请输入抽奖人姓名: " name
    [ "$name" == "ok" ] && break
    [ -z "$name" ] && continue

    while true; do
        num=$((RANDOM % 100 + 1))
        # 确保随机数不重复
        if ! grep -qw "$num" /tmp/lottery_record.txt; then
            echo "$num" >> /tmp/lottery_record.txt
            echo "抽奖人: $name, 获得号码: $num"
            break
        fi
    done
done

echo "=== 抽奖排行榜 Top 3 ==="
sort -rnk2 /tmp/lottery_record.txt 2>/dev/null | head -n 3
EOF
[root@zabbix ~]# chmod +x /root/lottery.sh
```
