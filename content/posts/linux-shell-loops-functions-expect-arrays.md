---
title: "Shell 编程实战（三）：循环控制、函数封装、expect 交互与数组统计"
date: 2026-11-05T14:57:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "全面解析 Shell 中 for/while 循环遍历与高并发后台并发扫描，深入掌握 break/continue/exit 流程跳转与模块化函数封装规范，深度实战 expect 自动化免密交互分发与密钥部署，并结合普通数组与关联数组掌握分组聚合、频次统计及随机抽奖算法实现。"
---

# Shell 编程实战（三）：循环控制、函数封装、expect 交互与数组统计

---

## 一、for 循环与批量运维实战

`for` 循环适用于已知循环次数或针对固定列表项遍历的场景。

### 1. for 循环语法结构
```bash
for 变量名 in 取值列表; do
    循环动作指令集合
done
```
取值列表以**空格或换行符**分隔，可以是数字、字符串、Shell 序列、命令替换或文件内容。

### 2. 多种遍历方式
#### (1) 遍历序列与数值
```bash
[root@zabbix ~]# for i in {1..3}; do echo "第 $i 次循环"; done
第 1 次循环
第 2 次循环
第 3 次循环
```

#### (2) 遍历命令执行结果（使用反引号或 `$()`）
```bash
[root@zabbix ~]# for host in $(cat /etc/hosts | awk '{print $1}'); do
    echo "Host IP: $host"
done
```

---

### 3. 实战一：批量创建与管理系统用户
在 `zabbix` 上批量自动化创建 `dawn1` 至 `dawn5` 用户：
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

### 4. 实战二：局域网多进程高并发存活探测
利用 Bash 后台子进程 `&` 与 `wait` 实现秒级局域网 IP 连通性扫描：
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

## 二、while 循环与循环流程跳转控制

`while` 循环基于条件真伪持续执行，适用于条件未满足时的持续轮询和逐行数据读取。

### 1. while 语法结构与条件循环
```bash
while [ 条件表达式 ]; do
    执行指令集合
done
```

累加求和 1 到 100：
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

### 2. 实战：while 按行读取文件
标准读取语法：`while read line; do ... done < 文件`：
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

### 3. break、continue 与 exit 流程跳转控制
- `exit [code]`：立即**终止并退出整个脚本**，可返回指定的状态码（0~255）。
- `break`：立即**跳出当前整层循环**，继续执行循环体外的后续代码。
- `continue`：立即**终止当前这一轮循环**，直接跳入下一次循环判断。

对比演示：
```bash
# break 示例：遇到 dawn3 即刻终止后续遍历
[root@zabbix ~]# for i in {1..5}; do
    [ $i -eq 3 ] && break
    echo $i
done
1
2

# continue 示例：跳过 dawn3，继续执行后续项
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

## 三、Shell 函数封装与模块化架构

函数（Function）是组织良好、可重复调用的代码块，是实现大型脚本模块化设计的基础。

### 1. 函数声明语法
三种声明方式（第一种最规范常用）：
```bash
# 方式 1
func_name() {
    指令集合
}

# 方式 2
function func_name() {
    指令集合
}

# 方式 3
function func_name {
    指令集合
}
```

### 2. 函数传参与内部变量作用域
- **函数内部 `$1`, `$2`**：代表传递给该函数的第 1、第 2 个参数，**而非**脚本外部的全局位置参数。
- **局部变量 `local`**：在函数内部使用 `local 变量名=值`，该变量仅在函数生命周期内生效，避免污染全局变量。

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

### 3. 函数返回值（return vs echo）
- `return [0-255]`：专门用于向外部返回**执行状态码**，通过 `$?` 获取。
- `echo`：专门用于向外部输出**数据或计算结果**，通过命令替换 `var=$(func)` 获取。

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

### 4. 实战：服务与 URL 探测函数封装 `fun.sh`
在 `zabbix` 上编写 URL 连通性测试模块：
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

## 四、expect 自动化无交互登录与密钥分发

在无法直接免密登录的环境中，`expect` 基于伪终端实现与交互式程序（如 `ssh`, `passwd`, `sftp`）的自动化数据收发。

### 1. expect 核心指令说明
| 指令 | 作用说明 |
| :--- | :--- |
| `spawn` | 启动一个新进程，该进程的后续输入输出由 expect 捕获接管 |
| `expect "string"` | 监控并等待标准输出中出现指定的目标字符串（支持正则） |
| `send "data\r"` | 模拟人工输入字符串，`\r` 代表回车确认 |
| `interact` | 将会话控制权转交给人工键盘，允许用户继续交互操作 |
| `expect eof` | 等待目标子进程结束并捕获 EOF 退出信号 |
| `set timeout n` | 设定匹配等待超时秒数（`-1` 表示永久等待） |

---

### 2. 自动化批量分发 SSH 公钥实战
结合 `sshpass` 与 `expect` 批量打通各主机免密通道：
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

## 五、Shell 数组与数据统计进阶

Bash 支持两种数组类型：
1. **普通数组（Indexed Arrays）**：使用**整数下标**索引（从 0 开始）。
2. **关联数组（Associative Arrays）**：使用**字符串**作为索引（Bash 4.0+，需显式使用 `declare -A` 声明）。

### 1. 普通数组基础操作
```bash
# 声明与赋值
[root@zabbix ~]# array=(11.0.1.7 11.0.1.71 101.133.147.148)

# 获取所有元素与所有下标
[root@zabbix ~]# echo "所有元素: ${array[@]}"
所有元素: 11.0.1.7 11.0.1.71 101.133.147.148
[root@zabbix ~]# echo "所有下标: ${!array[@]}"
所有下标: 0 1 2

# 获取数组长度（元素个数）
[root@zabbix ~]# echo "数组长度: ${#array[@]}"
数组长度: 3
```

---

### 2. 关联数组与频次统计模型
关联数组是 Shell 中处理分组统计、频次聚合最强大的工具。

统计模型核心逻辑：
```bash
declare -A count_dict
let count_dict[元素名]++
```

#### 实战一：统计文本性别分布
在 `dawn` 主机上对 `/root/sex.txt` 进行分类汇总：
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

#### 实战二：统计 Nginx 访问日志各客户端 IP 出现频次
利用关联数组对 `/var/log/nginx/access.log` 提取独立 IP 访问统计：
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

#### 实战三：自动化抽奖与抓阄防重复程序
利用 `$RANDOM` 与数组构建不重复随机分配模型：
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
