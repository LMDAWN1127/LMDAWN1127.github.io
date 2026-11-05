---
title: "Shell Scripting Hands-on (Part 2): Arithmetic Operations, Condition Tests, and Case Flow Control"
date: 2026-11-05T14:38:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "An in-depth analysis of 6 arithmetic methods in Linux (expr, $(()), $[], let, bc, awk). Systematically covers test, [], and [[]] conditional tests and regex pattern matching, demonstrates if-elif branching for disk monitoring and OS version adaptation, and explores case statements to build interactive menus, Nginx service management, and Jumpserver architecture."
---

# Shell Scripting Hands-on (Part 2): Arithmetic Operations, Condition Tests, and Case Flow Control

---

## I. Six Numerical Arithmetic Methods in Linux

Bash treats all variables as string types by default. To perform mathematical calculations, dedicated arithmetic expansion mechanisms or external utilities must be used.

### 1. `expr` Integer Arithmetic and Parameter Validity Checking
- `expr` supports the four basic arithmetic operations, but **spaces must be kept on both sides of operators**;
- The multiplication symbol `*` is a Shell wildcard and must be escaped with a backslash `\*`;
- Commonly used to verify whether user input is an integer via exit status `$?`.

```bash
[root@web01 dawn02]# expr 1 + 1
2
[root@web01 dawn02]# expr 10 \* 2
20
[root@web01 dawn02]# expr 10 / 2 \* 3 - 5
10

# Validate whether input argument is an integer
[root@web01 dawn02]# expr 1 + 10 &>/dev/null; echo $?
0
[root@web01 dawn02]# expr 1 + hehe &>/dev/null; echo $?
2
```

### 2. `$(( ))` Arithmetic Expansion (Most Common & Highest Performance)
Native syntax; variables inside can omit the `$` prefix, multiplication does not require escaping, and spaces around operators are optional:
```bash
[root@web01 dawn02]# echo $((10 * 10 - 2 + 5))
103
[root@web01 dawn02]# a=10; b=20
[root@web01 dawn02]# echo $((a * b))
200
```

### 3. `$[ ]` Arithmetic Expression
Similar to `$(( ))`, supports basic integer operations:
```bash
[root@web01 dawn02]# echo $[10 * 10]
100
[root@web01 dawn02]# echo $[a + b]
30
```

### 4. `let` Expression and Increment/Decrement Operations
Primarily used for loop counters and variable increments with clean syntax:
```bash
[root@web01 dawn02]# let i++
[root@web01 dawn02]# echo $i
1
[root@web01 dawn02]# let i+=10
[root@web01 dawn02]# echo $i
11
```

**Prefix vs. Postfix Increment Difference**:
`let c=a++` assigns first, then increments; `let d=++b` increments first, then assigns.

### 5. `bc` Arbitrary Precision Calculator (Supports Floating Point)
Pass expressions to `bc` via pipes, supporting floating-point numbers and precision scaling:
```bash
[root@web01 ~]# echo "10 + 10.5" | bc
20.5
[root@web01 ~]# echo "scale=2; 10 / 3" | bc
3.33
```

### 6. `awk` Numerical Calculation
Perform floating-point calculations using awk's `BEGIN` block:
```bash
[root@web01 ~]# awk 'BEGIN{printf "%.2f\n", 10/3}'
3.33
```

---

### Practical Scenario: Two-parameter Arithmetic Calculator `count.sh`
Written on `web01` (`/server/scripts/dawn02/count.sh`):
```bash
[root@web01 dawn02]# cat << 'EOF' > /server/scripts/dawn02/count.sh
#!/bin/bash
# 传参计数脚本
[ $# -ne 2 ] && echo "请输入俩参数" && exit 50
expr $1 + $2 &>/dev/null
[ $? -ne 0 ] && echo "请输入整数" && exit 100
echo "$1+$2=$[$1+$2]"
echo "$1-$2=$[$1-$2]"
echo "$1*$2=$[$1*$2]"
echo "$1/$2=$[$1/$2]"
EOF
[root@web01 dawn02]# chmod +x /server/scripts/dawn02/count.sh
[root@web01 dawn02]# /server/scripts/dawn02/count.sh 10 20
10+20=30
10-20=-10
10*20=200
10/20=0
```

---

## II. Conditional Test Expressions: test, [ ], and [[ ]]

Conditional tests return exit status `0` (true/success) or non-zero (false/failure) based on evaluation.

### 1. File Status Testing
| Test Flag | Description |
| :--- | :--- |
| `-f file` | True if file exists and is a regular file |
| `-d dir` | True if directory exists |
| `-e path` | True if file or directory exists |
| `-r file` | True if readable by the current user |
| `-w file` | True if writable by the current user |
| `-x file` | True if executable by the current user |
| `-s file` | True if file exists and its size is greater than 0 bytes |

```bash
[root@web01 ~]# [ -f /etc/hosts ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ -d /etc ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ ! -f /etc/not_exist ] && echo 成立
成立
```

### 2. String Comparison
| Test Expression | Description |
| :--- | :--- |
| `str1 = str2` or `==` | True if two strings are equal |
| `str1 != str2` | True if two strings are not equal |
| `-z str` | True if string length is 0 (empty string) |
| `-n str` | True if string length is non-zero (non-empty string) |

```bash
[root@web01 dawn02]# [ "$SHELL" == "/bin/bash" ] && echo 成立
成立

# Check if variable is empty
[root@web01 dawn02]# unset my_var
[root@web01 dawn02]# [ -z "$my_var" ] && echo "变量为空"
变量为空
[root@web01 dawn02]# my_var="dawn"
[root@web01 dawn02]# [ -n "$my_var" ] && echo "变量非空: $my_var"
变量非空: dawn
```

### 3. Regular Expression Pattern Matching `[[ =~ ]]`
Use double brackets `[[ ]]` to support extended regular expression matching:
```bash
[root@web01 ~]# [[ root =~ ^r ]] && echo 成立
成立

# Validate input is purely numeric
[root@web01 ~]# age=25
[root@web01 ~]# [[ "$age" =~ ^[0-9]+$ ]] && echo "是纯数字" || echo "非法输入"
是纯数字
```

### 4. Integer Relational Comparison
Inside single brackets `[ ]`, integer comparisons must use relational operators:
- `-eq` (Equal)
- `-ne` (Not Equal)
- `-gt` (Greater Than)
- `-ge` (Greater or Equal)
- `-lt` (Less Than)
- `-le` (Less or Equal)

```bash
[root@web01 dawn02]# [ 10 -gt 5 ] && echo 成立
成立
[root@web01 dawn02]# [ 10 -eq 10 -a 5 -lt 8 ] && echo "多条件满足"
多条件满足
```

---

## III. if Conditional Branching and Inspection Alerting Practice

### 1. Syntax Structure of if Statements
#### (1) Single-branch Structure
```bash
if [ 条件表达式 ]; then
    执行指令集合
fi
```

#### (2) Double-branch Structure
```bash
if [ 条件表达式 ]; then
    指令集合 A
else
    指令集合 B
fi
```

#### (3) Multi-branch Structure
```bash
if [ 条件表达式 1 ]; then
    指令集合 1
elif [ 条件表达式 2 ]; then
    指令集合 2
else
    默认兜底指令集合
fi
```

---

### 2. Practical Case 1: Disk Utilization Monitoring Alert Script `disk.sh`
Monitor root partition usage on `web01` (`11.0.1.7`):
```bash
[root@web01 dawn02]# cat /server/scripts/dawn02/disk.sh
#!/bin/bash
disk_use=$(df -h | awk '/\/$/{print $(NF-1)}' | tr -d '%')
if [ $disk_use -gt 80 ]; then
    echo "Warning: Disk usage is ${disk_use}%!"
else
    echo "Disk usage is normal: ${disk_use}%"
fi
[root@web01 dawn02]# /server/scripts/dawn02/disk.sh
Disk usage is normal: 13%
```

---

### 3. Practical Case 2: OS Version Detection and Adaptive Repo Setup `os.sh`
Environment detection script written on `zabbix` (`11.0.1.71`):
```bash
[root@zabbix ~]# cat /root/os.sh
#!/bin/bash
os_ver=$(cat /etc/redhat-release | awk '{print $4}' | awk -F. '{print $1}')
if [ "$os_ver" == "7" ]; then
    echo "Current OS is CentOS 7"
elif [ "$os_ver" == "8" ]; then
    echo "Current OS is CentOS 8"
else
    echo "Other OS"
fi
[root@zabbix ~]# /root/os.sh
Current OS is CentOS 7
```

---

## IV. case Flow Control and Service Management Scripts

When matching across multiple branches, `case` statements are clearer and more efficient than deeply nested `if-elif` constructs.

### 1. case Syntax Structure
```bash
case "$变量" in
    模式 1)
        执行命令 1
        ;;
    模式 2|模式 3)
        执行命令 2
        ;;
    *)
        无匹配时的默认命令
        ;;
esac
```

---

### 2. Practical Case 1: Interactive System Inspection Hardware Menu
```bash
[root@zabbix ~]# cat << 'EOF' > /root/sys_info.sh
#!/bin/bash
show_menu() {
    echo -e " \033[33m 1. 查看磁盘空间 \033[0m"
    echo -e " \033[33m 2. 查看内存占用 \033[0m"
    echo -e " \033[33m 3. 查看系统负载 \033[0m"
    echo -e " \033[33m 4. 查看在线用户 \033[0m"
    echo -e " \033[33m q. 退出程序 \033[0m"
}
show_menu
while true; do
    read -p "请输入选项编号: " choice
    case "$choice" in
        1)
            df -h
            ;;
        2)
            free -m
            ;;
        3)
            uptime
            ;;
        4)
            w
            ;;
        q|quit|exit)
            echo "感谢使用，退出脚本！"
            exit 0
            ;;
        *)
            echo "输入有误，请输入 [1-4|q]！"
            show_menu
            ;;
    esac
done
EOF
[root@zabbix ~]# chmod +x /root/sys_info.sh
```

---

### 3. Practical Case 2: Nginx Service Lifecycle Management Script
Standardizing compiled service management in production environments:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/nginx_ctl.sh
#!/bin/bash
[ -f /etc/init.d/functions ] && . /etc/init.d/functions
NGINX_BIN="/usr/sbin/nginx"

case "$1" in
    start)
        $NGINX_BIN &>/dev/null
        if [ $? -eq 0 ]; then
            action "Starting Nginx:" /bin/true
        else
            action "Starting Nginx:" /bin/false
        fi
        ;;
    stop)
        $NGINX_BIN -s stop &>/dev/null
        if [ $? -eq 0 ]; then
            action "Stopping Nginx:" /bin/true
        else
            action "Stopping Nginx:" /bin/false
        fi
        ;;
    reload)
        $NGINX_BIN -s reload &>/dev/null
        action "Reloading Nginx:" /bin/true
        ;;
    status)
        netstat -lntup | grep -q ":80 "
        if [ $? -eq 0 ]; then
            echo "Nginx is running (Port 80 is listening)."
        else
            echo "Nginx is stopped."
        fi
        ;;
    restart)
        $NGINX_BIN -s stop &>/dev/null
        sleep 1
        $NGINX_BIN &>/dev/null
        action "Restarting Nginx:" /bin/true
        ;;
    *)
        echo "Usage: $0 {start|stop|reload|restart|status}"
        exit 1
        ;;
esac
EOF
[root@zabbix ~]# chmod +x /root/nginx_ctl.sh
```

---

### 4. Practical Case 3: Jumpserver Architecture Implementation
Constructing a restricted terminal bastion host using case statements and an infinite loop:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/jumpserver.sh
#!/bin/bash
WEB01=11.0.1.7
ZABBIX=11.0.1.71
DAWN=101.133.147.148

trap "echo ' 提示：禁止通过 Ctrl+C 中断跳板机！'" INT TSTP HUP

clear
echo "=========================================="
echo "          DAWN 集群自动化跳板系统          "
echo "=========================================="
echo " 1) 连接 Web01 服务器 (11.0.1.7)"
echo " 2) 连接 Zabbix 监控服务器 (11.0.1.71)"
echo " 3) 连接 Dawn 阿里云外网节点 (101.133.147.148)"
echo " q) 退出当前登录"
echo "=========================================="

while true; do
    read -p "请选择需要接入的服务器 [1-3|q]: " target
    case "$target" in
        1)
            echo "Connecting to web01..."
            ssh -o StrictHostKeyChecking=no root@$WEB01
            ;;
        2)
            echo "Connecting to zabbix..."
            ssh -o StrictHostKeyChecking=no root@$ZABBIX
            ;;
        3)
            echo "Connecting to dawn..."
            ssh -o StrictHostKeyChecking=no root@$DAWN
            ;;
        q|exit)
            echo "安全登出，再见！"
            exit 0
            ;;
        *)
            echo "无效选项，请重新输入！"
            ;;
    esac
done
EOF
[root@zabbix ~]# chmod +x /root/jumpserver.sh
```
