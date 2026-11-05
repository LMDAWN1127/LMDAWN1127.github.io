---
title: "Shell Scripting Hands-on (Part 1): Script Specifications, Variable Classification, and String Slicing/Substitution"
date: 2026-11-05T14:30:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "A systematic review of enterprise-grade Shell script development and execution standards. Deep dive into global environment variables, local variables, and special positional parameters ($0-$9, $#, $*, $@, $?). Master advanced native Bash string parameter expansion techniques including slicing, length evaluation, greedy pattern truncation, and substitution."
---

# Shell Scripting Hands-on (Part 1): Script Specifications, Variable Classification, and String Slicing/Substitution

---

## I. Shell and Script Development Standards

### 1. What are Shell and Shell Scripts
- **Shell**: A command interpreter. It receives and interprets terminal commands entered by users, passes them to the operating system kernel for hardware scheduling and execution, and returns the execution results to the user.
  - **Interactive Shell**: The user types a command in the terminal; the Shell executes it immediately and returns the result.
  - **Non-interactive Shell**: The Shell reads and executes batches of commands from a script file or pipe continuously without human intervention.
- **Shell Script**: A program file containing a sequence of Linux commands, control flow logic (conditionals, loops), and functions organized by business requirements.

The default interpreter in Linux is Bash:
```bash
[root@dawn ~]# echo $SHELL
/bin/bash
```

### 2. Enterprise Shell Script Coding Standards
1. **Unified File Extension**: Script files should strictly end with `.sh` and have meaningful names (e.g., `check_disk.sh`).
2. **Interpreter Declaration**: The first line must specify the Shebang in the standard format `#!/bin/bash`.
3. **Metadata Comments**: Include author, creation date, functional description, and version information at the top of the script.
4. **Clear Comments**: Provide concise Chinese or English comments for key logic, complex regular expressions, and core functions.
5. **ASCII Punctuation**: All quotes (`""`, `''`), backticks, brackets (`[]`, `[[]]`, `{}`, `()`), semicolons, and colons must be standard half-width English characters.
6. **Paired Writing**: Write paired characters simultaneously to avoid missing closing brackets or quotes.

### 3. Creating the First Shell Script and Three Execution Methods
Create `test.sh` in directory `/server/scripts/dawn01` on host `web01` (`11.0.1.7`):
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/test.sh
#!/bin/bash
echo "hehe"
EOF
```

#### Execution Method 1: Direct Execution via Interpreter (No Execute Permission Required)
```bash
[root@web01 dawn01]# sh /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# bash /server/scripts/dawn01/test.sh
hehe
```

#### Execution Method 2: Direct Execution via Path (Requires +x Permission)
```bash
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/test.sh
[root@web01 dawn01]# /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# ./test.sh
hehe
```

#### Execution Method 3: Execution via source or Dot . (Loaded in Current Parent Shell)
```bash
[root@web01 dawn01]# . /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# source /server/scripts/dawn01/test.sh
hehe
```

> **Core Mechanism Differences**:
>
> - Methods 1 and 2 run inside a **Subshell**. Variables defined within the script are destroyed upon exit without affecting the current terminal environment.
> - Method 3 (`source` or `.`) executes directly within the **Current Parent Shell**. Variables and environment modifications defined in the script persist in the active terminal session.

---

## II. Shell Variable Classification and Definition Rules

### 1. Concept and Classification of Variables
Using a fixed identifier to represent dynamic or variable values constitutes a variable.
- **Global Variables (Environment Variables)**: System built-in or exported via `export`, effective across the current parent Shell and all child subshells.
- **Local Variables (User-defined Variables)**: Scope is limited to the current Shell session or script where they are declared.

### 2. Variable Lifecycle and Configuration Files
- **Temporary Variables**: Declared directly in the terminal via `name=dawn` or `export name=dawn`, which expire when the session disconnects.
- **Persistent Variables**: Saved in system or user profile configuration files:
  - `/etc/profile`: Loaded for all users at system login (most common)
  - `~/.bash_profile`: Loaded when the current user logs in
  - `~/.bashrc`: Loaded when the current user starts a new Bash instance
  - `/etc/bashrc`: Loaded system-wide when non-login Shells launch

### 3. Variable Naming Rules and Assignment Types
#### (1) Naming Rules
Composed of letters, digits, and underscores. **Cannot start with a digit**. **No spaces are allowed** around the equal sign `=`. Global environment variables are uppercase (e.g., `NGINX_PORT`), while local variables are lowercase or snake_case (e.g., `user_age`).

#### (2) String Assignment (Single vs. Double Quotes)
- **Single Quotes `''`**: What you see is what you get; all special characters (including `$` and `\`) are treated as literal text, and variables are not evaluated.
- **Double Quotes `""`**: Weak reference; variables, command substitutions, and escape characters are evaluated.
```bash
[root@web01 ~]# name="dawn"
[root@web01 ~]# test_single='name: $name'
[root@web01 ~]# echo $test_single
name: $name

[root@web01 ~]# test_double="name: $name"
[root@web01 ~]# echo $test_double
name: dawn
```

#### (3) Variable Concatenation and Brace Isolation
When a variable is immediately followed by other characters, wrap the variable name in `{}` to delineate its boundary:
```bash
[root@web01 ~]# ip="11.0.1.7"
[root@web01 ~]# host="web01"
[root@web01 ~]# echo "$ip_$host"
web01
[root@web01 ~]# echo "${ip}_$host"
11.0.1.7_web01
```

#### (4) Command Substitution Assignment (Backticks vs `$()`)
Capturing the output of a system command into a variable (using `$()` is recommended):
```bash
[root@web01 ~]# count=$(cat /etc/passwd | wc -l)
[root@web01 ~]# echo $count
27

# Dynamic timestamp variable
[root@web01 ~]# now_time=$(date +%F_%H-%M-%S)
[root@web01 ~]# echo $now_time
2026-11-04_12-40-00
```

---

## III. Shell Positional Parameters and Built-in Special Variables

### 1. Core Positional Parameters
| Variable | Meaning and Function |
| :--- | :--- |
| `$0` | Current script name; includes full path if invoked with path |
| `$1` ~ `$9` | 1st to 9th positional arguments passed to the script |
| `${10}` ~ `${n}` | 10th and subsequent positional arguments (requires curly braces `{}`) |
| `$#` | Total count of positional parameters passed to the script |
| `$*` | All positional parameters; treated as a single string `"$1 $2 ..."` when double-quoted `"$*"` |
| `$@` | All positional parameters; preserved as separate strings `"$1" "$2" ...` when double-quoted `"$@"` |
| `$?` | Exit status of the most recently executed command (`0` indicates success, non-zero indicates failure) |
| `$$` | Process PID of the currently running Shell script |
| `$!` | Process PID of the most recently backgrounded command |
| `$_` | Last argument of the previous command |

### 2. Positional Parameters Hands-on Verification
Write a multi-argument printing script on `web01`:
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

### 3. Core Differences between `$*` and `$@` in Quoted Loops
```bash
[root@web01 dawn01]# set -- "I am" dawn 18

# "$*" is treated as a single concatenated string
[root@web01 dawn01]# for i in "$*"; do echo "$i"; done
I am dawn 18

# "$@" maintains individual argument units
[root@web01 dawn01]# for i in "$@"; do echo "$i"; done
I am
dawn
18
```

---

## IV. Practical Variable Parameter Passing Methods

In automated operations, there are three primary ways to pass external data into scripts:

### 1. Direct Command Line Positional Parameters
Ideal for automated scheduling, Crontab cron jobs, and unattended background scripts:
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

### 2. Internal Variable Renaming and Reassignment
Assign `$1` and `$2` explicitly to semantic variables for better maintainability:
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

### 3. Interactive Input with `read`
Used in interactive installers and setup wizards (supports `-p` prompt, `-t` timeout, `-s` silent/hidden input):
```bash
[root@web01 dawn02]# cat /server/scripts/dawn02/name.sh
#!/bin/bash
read -p "请输入你的姓名和年龄: " name age
echo "name=$name"
echo "age=$age"
```

---

## V. Advanced String Processing: Slicing, Length, Deletion, and Substitution

Using native Bash parameter expansion syntax allows string processing without spawning external processes (like awk, sed, or cut), offering significant performance gains.

### 1. String Slicing and Extraction `${var:start:length}`
```bash
[root@web01 dawn02]# name="I am dawn"
[root@web01 dawn02]# echo ${name:2}      # Slices from index 2 to end
am dawn
[root@web01 dawn02]# echo ${name:2:2}    # Slices 2 characters starting from index 2
am
[root@web01 dawn02]# echo ${name:5:8}    # Slices 8 characters starting from index 5
dawn
```

### 2. Measuring Variable String Length
#### Method 1: Native Syntax `${#var}` (Fastest & Recommended)
```bash
[root@web01 dawn02]# echo ${#name}
13
```

#### Method 2: Comparison with External Commands
```bash
[root@web01 dawn02]# echo -n "$name" | wc -c
13
[root@web01 dawn02]# expr length "$name"
13
[root@web01 dawn02]# echo "$name" | awk '{print length}'
13
```

---

### 3. Pattern Deletion (Prefix and Suffix Truncation)
- `${var#pattern}`: Matches from start, deletes **shortest** match
- `${var##pattern}`: Matches from start, **greedily deletes longest** match
- `${var%pattern}`: Matches from end, deletes **shortest** match
- `${var%%pattern}`: Matches from end, **greedily deletes longest** match

```bash
[root@web01 dawn02]# url="www.baidu.com"

# Deletion from start
[root@web01 dawn02]# echo ${url#*.}     # Delete up to the first dot
baidu.com
[root@web01 dawn02]# echo ${url##*.}    # Greedily delete up to the last dot
com

# Deletion from end
[root@web01 dawn02]# echo ${url%.*}     # Delete after the last dot
www.baidu
[root@web01 dawn02]# echo ${url%%.*}    # Greedily delete after the first dot
www

# Practical Sysadmin Case: Stripping the percentage sign from disk utilization
[root@web01 dawn02]# disk_use=$(df -h | awk '/\/$/{print $(NF-1)}')
[root@web01 dawn02]# echo $disk_use
13%
[root@web01 dawn02]# echo ${disk_use%\%}
13
```

---

### 4. Variable String Substitution
- `${var/old/new}`: Replaces the **first** matched occurrence
- `${var//old/new}`: Replaces **all** matched occurrences globally

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

### 5. Default Values and Fallback Evaluation
| Expression | If Variable is Set and Non-empty | If Variable is Unset or Empty |
| :--- | :--- | :--- |
| `${var:-word}` | Returns actual value of `$var` | Returns `word`, but does **not** modify `$var` |
| `${var:=word}` | Returns actual value of `$var` | Returns `word`, and **assigns `word` to `$var`** |
| `${var:?word}` | Returns actual value of `$var` | Prints `word` to stderr and **aborts execution** |
| `${var:+word}` | Returns `word` | Returns empty (used for existence testing) |

Verification example:
```bash
[root@web01 dawn02]# unset my_port
[root@web01 dawn02]# echo ${my_port:-8080}
8080
[root@web01 dawn02]# echo $my_port
# Original variable remains empty

[root@web01 dawn02]# echo ${my_port:=8080}
8080
[root@web01 dawn02]# echo $my_port
8080
# Original variable is successfully assigned default value 8080
```
