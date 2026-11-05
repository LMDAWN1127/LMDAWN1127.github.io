---
title: "Shell 编程实战（二）：数值运算、条件测试与 case 流程控制"
date: 2026-11-05T14:38:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "深入剖析 Linux 下 6 种数值运算方法（expr、$(())、$[]、let、bc、awk），系统梳理 test、[] 与 [[]] 条件测试与正则比对规范，结合 if-elif 多分支实现磁盘监控告警与系统架构适配，并通过 case 语句深度打造交互式运维菜单、Nginx 服务管理与跳板机（Jumpserver）核心架构。"
---

# Shell 编程实战（二）：数值运算、条件测试与 case 流程控制

---

## 一、Linux 下的 6 种数值运算方法

Bash 默认将所有变量视为字符串类型，若需进行数学运算，必须依赖专用的运算机制或外部工具。

### 1. `expr` 整数运算与参数合法性校验
- `expr` 支持四则运算，但**运算符两端必须保留空格**；
- 乘号 `*` 是 Shell 通配符，必须使用反斜线转义为 `\*`；
- 常用于利用返回值 `$?` 校验输入是否为纯整数。

```bash
[root@web01 dawn02]# expr 1 + 1
2
[root@web01 dawn02]# expr 10 \* 2
20
[root@web01 dawn02]# expr 10 / 2 \* 3 - 5
10

# 校验传参是否为整数
[root@web01 dawn02]# expr 1 + 10 &>/dev/null; echo $?
0
[root@web01 dawn02]# expr 1 + hehe &>/dev/null; echo $?
2
```

### 2. `$(( ))` 算术扩展（最常用、执行效率最高）
原生语法，内部变量可省略 `$` 符号，乘号无需转义，运算符两侧无需空格：
```bash
[root@web01 dawn02]# echo $((10 * 10 - 2 + 5))
103
[root@web01 dawn02]# a=10; b=20
[root@web01 dawn02]# echo $((a * b))
200
```

### 3. `$[ ]` 算术表达式
与 `$(( ))` 类似，支持基本整数运算：
```bash
[root@web01 dawn02]# echo $[10 * 10]
100
[root@web01 dawn02]# echo $[a + b]
30
```

### 4. `let` 运算与自增自减
主要用于循环体计数及变量累加，语法紧凑：
```bash
[root@web01 dawn02]# let i++
[root@web01 dawn02]# echo $i
1
[root@web01 dawn02]# let i+=10
[root@web01 dawn02]# echo $i
11
```

**前缀与后缀自增差异**：
`let c=a++` 先赋值后自增；`let d=++b` 先自增后赋值。

### 5. `bc` 任意精度计算器（支持浮点运算）
通过管道将表达式传递给 `bc`，支持小数及高精度配置：
```bash
[root@web01 ~]# echo "10 + 10.5" | bc
20.5
[root@web01 ~]# echo "scale=2; 10 / 3" | bc
3.33
```

### 6. `awk` 数值计算
借助 awk 的 `BEGIN` 块进行浮点运算：
```bash
[root@web01 ~]# awk 'BEGIN{printf "%.2f\n", 10/3}'
3.33
```

---

### 实战案例：双参数四则运算计算器 `count.sh`
在 `web01`（`/server/scripts/dawn02/count.sh`）上编写：
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

## 二、条件测试表达式：test、[ ] 与 [[ ]]

条件测试根据测试结果返回状态码 `0`（为真，成立）或非 `0`（为假，不成立）。

### 1. 文件状态测试
| 测试参数 | 说明 |
| :--- | :--- |
| `-f file` | 判断是否为普通文件且存在 |
| `-d dir` | 判断是否为目录且存在 |
| `-e path` | 判断文件或目录是否存在 |
| `-r file` | 判断当前用户是否具备可读权限 |
| `-w file` | 判断当前用户是否具备可写权限 |
| `-x file` | 判断当前用户是否具备可执行权限 |
| `-s file` | 判断文件存在且文件大小大于 0 字节 |

```bash
[root@web01 ~]# [ -f /etc/hosts ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ -d /etc ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ ! -f /etc/not_exist ] && echo 成立
成立
```

### 2. 字符串比对
| 测试参数 | 说明 |
| :--- | :--- |
| `str1 = str2` 或 `==` | 判断两字符串是否相等 |
| `str1 != str2` | 判断两字符串是否不相等 |
| `-z str` | 判断字符串长度是否为 0（为空返回真） |
| `-n str` | 判断字符串长度是否不为 0（非空返回真） |

```bash
[root@web01 dawn02]# [ "$SHELL" == "/bin/bash" ] && echo 成立
成立

# 校验变量是否为空
[root@web01 dawn02]# unset my_var
[root@web01 dawn02]# [ -z "$my_var" ] && echo "变量为空"
变量为空
[root@web01 dawn02]# my_var="dawn"
[root@web01 dawn02]# [ -n "$my_var" ] && echo "变量非空: $my_var"
变量非空: dawn
```

### 3. 正则比对 `[[ =~ ]]`
使用双中括号 `[[ ]]` 支持扩展正则表达式匹配：
```bash
[root@web01 ~]# [[ root =~ ^r ]] && echo 成立
成立

# 校验传参必须为纯数字
[root@web01 ~]# age=25
[root@web01 ~]# [[ "$age" =~ ^[0-9]+$ ]] && echo "是纯数字" || echo "非法输入"
是纯数字
```

### 4. 数值关系比较
在单中括号 `[ ]` 中，数值比对必须使用关系运算符：
- `-eq`（Equal）
- `-ne`（Not Equal）
- `-gt`（Greater Than）
- `-ge`（Greater or Equal）
- `-lt`（Less Than）
- `-le`（Less or Equal）

```bash
[root@web01 dawn02]# [ 10 -gt 5 ] && echo 成立
成立
[root@web01 dawn02]# [ 10 -eq 10 -a 5 -lt 8 ] && echo "多条件满足"
多条件满足
```

---

## 三、if 条件判断与巡检告警实战

### 1. if 语句语法结构
#### (1) 单分支结构
```bash
if [ 条件表达式 ]; then
    执行指令集合
fi
```

#### (2) 双分支结构
```bash
if [ 条件表达式 ]; then
    指令集合 A
else
    指令集合 B
fi
```

#### (3) 多分支结构
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

### 2. 实战一：磁盘使用率监控告警脚本 `disk.sh`
在 `web01`（`11.0.1.7`）上编写监控根分区使用率：
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

### 3. 实战二：操作系统版本识别与自适应仓库配置 `os.sh`
在 `zabbix`（`11.0.1.71`）上编写自适应环境判断脚本：
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

## 四、case 流程控制与服务管理脚本

当匹配分支较多时，`case` 语句比多层 `if-elif` 更加清晰、高效。

### 1. case 语法结构
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

### 2. 实战一：系统巡检硬件信息交互菜单
```bash
[root@zabbix ~]# cat << 'EOF' > /root/sys_info.sh
#!/bin/bash
show_menu() {
    echo -e "[33m 1. 查看磁盘空间 [0m"
    echo -e "[33m 2. 查看内存占用 [0m"
    echo -e "[33m 3. 查看系统负载 [0m"
    echo -e "[33m 4. 查看在线用户 [0m"
    echo -e "[33m q. 退出程序 [0m"
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

### 3. 实战二：Nginx 服务启停管理控制脚本
在生产环境中统一以服务化管理脚本控制自编译服务：
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

### 4. 实战三：Jumpserver 跳板机架构设计
利用 case 语句与死循环构建权限受限的终端运维跳板机：
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
