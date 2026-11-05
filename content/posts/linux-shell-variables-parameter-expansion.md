---
title: "Shell 编程实战（一）：脚本规范、变量分类与字串切片替换"
date: 2026-11-05T14:30:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "系统梳理企业级 Shell 脚本编写与执行规范，深入剖析全局环境变量、局部变量与特殊位置变量（$0~$9、$#、$*、$@、$?）底层机制，全面掌握原生变量字串切片、测长、贪婪删除与模式替换等高级处理技巧。"
---

# Shell 编程实战（一）：脚本规范、变量分类与字串切片替换

---

## 一、Shell 与脚本开发规范

### 1. 什么是 Shell 与 Shell 脚本
- **Shell**：命令解释器。它负责接收并解释用户输入的终端指令，将其传递给操作系统内核（Kernel），内核调度硬件执行后，再将执行结果返回给 Shell 呈现给用户。
  - **交互式 Shell**：用户在终端输入一条命令，Shell 立即执行并返回结果。
  - **非交互式 Shell**：Shell 从脚本文件或管道中读取成批指令连续执行，无需人工干预。
- **Shell 脚本（Script）**：将一系列 Linux 命令、流程控制（判断、循环）、函数等按业务逻辑组织并存储到文本文件中，由解释器执行的程序文件。

Linux 默认解释器为 Bash：
```bash
[root@dawn ~]# echo $SHELL
/bin/bash
```

### 2. 企业级 Shell 脚本编写规范
1. **统一扩展名**：脚本文件名严格以 `.sh` 结尾，见名知意（如 `check_disk.sh`）。
2. **声明解释器**：脚本首行必须指明 Shebang，标准格式为 `#!/bin/bash`。
3. **元信息注释**：脚本头部应注明作者、创建时间、功能描述及版本信息。
4. **代码注释清晰**：关键逻辑、复杂正则与核心函数必须包含中文或英文注释。
5. **英文半角符号**：所有引号（`""`, `''`）、反引号、括号（`[]`, `[[]]`, `{}`, `()`）及分号冒号必须为英文字符。
6. **成对书写**：成对的符号一次性写完，防止语法闭合遗漏。

### 3. 创建首个 Shell 脚本与三种执行方式
在 `web01`（`11.0.1.7`）主机的 `/server/scripts/dawn01` 目录下创建 `test.sh`：
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/test.sh
#!/bin/bash
echo "hehe"
EOF
```

#### 执行方式一：通过解释器直接执行（无需可执行权限）
```bash
[root@web01 dawn01]# sh /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# bash /server/scripts/dawn01/test.sh
hehe
```

#### 执行方式二：通过路径直接执行（必须赋予 +x 权限）
```bash
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/test.sh
[root@web01 dawn01]# /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# ./test.sh
hehe
```

#### 执行方式三：通过 source 或点号 . 执行（在当前父 Shell 中加载）
```bash
[root@web01 dawn01]# . /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# source /server/scripts/dawn01/test.sh
hehe
```

> **核心机制区别**：
>
> - 方式一与方式二均是在**子 Shell**（Subshell）中执行，脚本内变量在脚本退出后自动销毁，不影响当前终端环境。
> - 方式三（`source` 或 `.`）是在**当前父 Shell** 中直接执行，脚本中定义的变量和环境变更会直接保留在当前终端环境中。

---

## 二、Shell 变量分类与定义规范

### 1. 变量的概念与分类
用一个固定的标识符表示动态或不固定的值，即为变量。
- **全局变量（环境变量）**：系统内置或通过 `export` 导出的变量，对当前父 Shell 及其所有派生的子 Shell 均生效。
- **局部变量（普通变量）**：自定义变量，作用域仅限于声明它的当前 Shell 会话或脚本内部。

### 2. 变量生存周期与配置文件
- **临时变量**：在终端直接声明 `name=dawn` 或 `export name=dawn`，终端断开即失效。
- **永久生效**：写入系统或用户配置文件：
  - `/etc/profile`：全系统所有用户登录均加载（最常用）
  - `~/.bash_profile`：当前用户登录时加载
  - `~/.bashrc`：当前用户启动新 Bash 实例时加载
  - `/etc/bashrc`：全系统非登录 Shell 启动时加载

### 3. 变量定义规范与不同赋值类型
#### (1) 命名规范
由字母、数字和下划线组成，**不能以数字开头**，等号两边**严禁存在空格**。全局环境变量推荐全大写（如 `NGINX_PORT`），普通变量推荐小写或下划线命名（如 `user_age`）。

#### (2) 字符串赋值（单引号 vs 双引号）
- **单引号 `''`**：所见即所得，内部任何特殊字符（包括 `$`、`\`）均作为普通文本，不解析变量。
- **双引号 `""`**：弱引用，能够解析内部的变量、命令替换与转义符。
```bash
[root@web01 ~]# name="dawn"
[root@web01 ~]# test_single='name: $name'
[root@web01 ~]# echo $test_single
name: $name

[root@web01 ~]# test_double="name: $name"
[root@web01 ~]# echo $test_double
name: dawn
```

#### (3) 变量组合与花括号隔离
当变量与后续字符紧挨拼接时，必须用 `{}` 将变量名包裹，以明确边界：
```bash
[root@web01 ~]# ip="11.0.1.7"
[root@web01 ~]# host="web01"
[root@web01 ~]# echo "$ip_$host"
web01
[root@web01 ~]# echo "${ip}_$host"
11.0.1.7_web01
```

#### (4) 命令输出赋值（反引号与 `$()`）
将系统命令的执行输出捕获并赋值给变量，推荐使用 `$()`：
```bash
[root@web01 ~]# count=$(cat /etc/passwd | wc -l)
[root@web01 ~]# echo $count
27

# 动态时间变量
[root@web01 ~]# now_time=$(date +%F_%H-%M-%S)
[root@web01 ~]# echo $now_time
2026-11-04_12-40-00
```

---

## 三、Shell 位置参数与内置特殊变量

### 1. 核心位置参数
| 变量名 | 含义与功能 |
| :--- | :--- |
| `$0` | 获取当前执行的脚本名称；若带路径执行则包含完整路径 |
| `$1` ~ `$9` | 获取传递给脚本的第 1 到第 9 个位置参数 |
| `${10}` ~ `${n}` | 获取第 10 个及以上的位置参数，必须使用花括号 `{}` |
| `$#` | 获取传递给脚本的位置参数总个数 |
| `$*` | 获取所有位置参数；加双引号 `"$*"` 时将所有参数视为单个字符串 `"$1 $2 ..."` |
| `$@` | 获取所有位置参数；加双引号 `"$@"` 时保持各参数独立 `"$1" "$2" ...` |
| `$?` | 获取上一条命令的执行退出状态码（`0` 表示执行成功，非 `0` 表示失败） |
| `$$` | 获取当前 Shell 脚本运行时的进程 PID 号 |
| `$!` | 获取最近一个在后台运行的进程 PID 号 |
| `$_` | 获取上一条命令的最后一个参数 |

### 2. 位置参数实操验证
在 `web01` 上编写多参数打印脚本：
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/pos.sh
#!/bin/bash
echo "脚本名称 \$0: $0"
echo "第 1 个参数 \$1: $1"
echo "第 2 个参数 \$2: $2"
echo "第 10 个参数 \${10}: ${10}"
echo "参数总数 \$#: $#"
EOF
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/pos.sh
[root@web01 dawn01]# /server/scripts/dawn01/pos.sh {a..z}
脚本名称 $0: /server/scripts/dawn01/pos.sh
第 1 个参数 $1: a
第 2 个参数 $2: b
第 10 个参数 ${10}: j
参数总数 $#: 26
```

### 3. `$*` 与 `$@` 在带引号循环遍历时的核心差异
```bash
[root@web01 dawn01]# set -- "I am" dawn 18

# "$*" 视为一个整体字符串
[root@web01 dawn01]# for i in "$*"; do echo "$i"; done
I am dawn 18

# "$@" 保持独立参数单元
[root@web01 dawn01]# for i in "$@"; do echo "$i"; done
I am
dawn
18
```

---

## 四、Shell 变量传参方式实战

在自动化运维中，主要有三种将外部数据传递给脚本的方式：

### 1. 命令行直接位置传参
适用于自动化调度、Crontab 定时任务和后台脚本：
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/url.sh
#!/bin/bash
[ $# -ne 1 ] && echo "Usage: $0 <domain>" && exit 1
ping -c 1 -W 1 "$1" &>/dev/null
if [ $? -eq 0 ]; then
    echo "主机 $1: 网络畅通 (ONLINE)"
else
    echo "主机 $1: 无法访问 (OFFLINE)"
fi
EOF
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/url.sh
[root@web01 dawn01]# /server/scripts/dawn01/url.sh 11.0.1.71
主机 11.0.1.71: 网络畅通 (ONLINE)
```

### 2. 内部重命名赋值传参
将 `$1`、`$2` 显式赋值给具有语义的内部变量，提升可读性：
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/user_info.sh
#!/bin/bash
username="$1"
userage="$2"
echo "Username is: $username, Age is: $userage"
EOF
[root@web01 dawn01]# sh /server/scripts/dawn01/user_info.sh dawn 25
Username is: dawn, Age is: 25
```

### 3. `read` 交互式读入传参
适用于人机交互安装引导脚本（支持 `-p` 提示信息、`-t` 超时等待、`-s` 隐式输入）：
```bash
[root@web01 dawn02]# cat /server/scripts/dawn02/name.sh
#!/bin/bash
read -p "请输入你的姓名和年龄: " name age
echo "name=$name"
echo "age=$age"
```

---

## 五、变量字串高级处理：切片、测长、删除与替换

利用 Bash 原生变量字串扩展语法，可以在不调用外部命令（如 awk、sed、cut）的前提下高效完成字符串处理，性能提升显著。

### 1. 字符串切片提取 `${var:start:length}`
```bash
[root@web01 dawn02]# name="I am dawn"
[root@web01 dawn02]# echo ${name:2}      # 从索引 2 开始截取到末尾
am dawn
[root@web01 dawn02]# echo ${name:2:2}    # 从索引 2 开始截取 2 个字符
am
[root@web01 dawn02]# echo ${name:5:8}    # 从索引 5 开始截取 8 个字符
dawn
```

### 2. 统计变量字串长度
#### 方式 1：原生语法 `${#var}`（效率最高，推荐）
```bash
[root@web01 dawn02]# echo ${#name}
13
```

#### 方式 2：外部命令计算对比
```bash
[root@web01 dawn02]# echo -n "$name" | wc -c
13
[root@web01 dawn02]# expr length "$name"
13
[root@web01 dawn02]# echo "$name" | awk '{print length}'
13
```

---

### 3. 变量字串模式删除（前缀与后缀截断）
- `${var#pattern}`：从前往后匹配，删除**最短**匹配项
- `${var##pattern}`：从前往后匹配，**贪婪删除最长**匹配项
- `${var%pattern}`：从后往前匹配，删除**最短**匹配项
- `${var%%pattern}`：从后往前匹配，**贪婪删除最长**匹配项

```bash
[root@web01 dawn02]# url="www.baidu.com"

# 从前往后删除
[root@web01 dawn02]# echo ${url#*.}     # 删除到第一个点号
baidu.com
[root@web01 dawn02]# echo ${url##*.}    # 贪婪删除到最后一个点号
com

# 从后往前删除
[root@web01 dawn02]# echo ${url%.*}     # 删除最后一个点号之后的内容
www.baidu
[root@web01 dawn02]# echo ${url%%.*}    # 贪婪删除第一个点号之后的所有内容
www

# 运维实战：去除磁盘使用率百分号
[root@web01 dawn02]# disk_use=$(df -h | awk '/\/$/{print $(NF-1)}')
[root@web01 dawn02]# echo $disk_use
13%
[root@web01 dawn02]# echo ${disk_use%\%}
13
```

---

### 4. 变量字串内容替换
- `${var/old/new}`：替换匹配到的**第一个**字符串
- `${var//old/new}`：全局替换匹配到的**所有**字符串

```bash
[root@web01 dawn02]# url="www.baidu.com"
[root@web01 dawn02]# echo ${url/baidu/dark}
www.dark.com

[root@web01 dawn02]# echo ${url/w/W}
Www.baidu.com
[root@web01 dawn02]# echo ${url//w/W}
WWW.baidu.com
```

---

### 5. 变量赋初值与容错运算
| 表达式 | 变量有值且非空 | 变量未定义或为空 |
| :--- | :--- | :--- |
| `${var:-word}` | 返回 `$var` 的实际值 | 返回 `word`，但**不改变** `$var` 的值 |
| `${var:=word}` | 返回 `$var` 的实际值 | 返回 `word`，并**将 `word` 赋给 `$var`** |
| `${var:?word}` | 返回 `$var` 的实际值 | 将 `word` 输出至标准错误并**中断退出** |
| `${var:+word}` | 返回 `word` | 返回空值（用于条件存在性测试） |

示例验证：
```bash
[root@web01 dawn02]# unset my_port
[root@web01 dawn02]# echo ${my_port:-8080}
8080
[root@web01 dawn02]# echo $my_port
# 原变量依然为空

[root@web01 dawn02]# echo ${my_port:=8080}
8080
[root@web01 dawn02]# echo $my_port
8080
# 原变量被成功赋予默认值 8080
```
