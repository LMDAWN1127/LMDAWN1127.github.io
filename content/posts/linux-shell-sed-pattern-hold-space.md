---
title: "Linux sed 流编辑器实战：Pattern Space 与 Hold Space"
date: 2026-11-04T14:10:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "sed", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "深入剖析 Linux 三剑客之 sed 流编辑器核心架构，系统梳理常用选项与编辑动作，深度解析模式空间（Pattern Space）与暂存空间（Hold Space）交互机制，并结合企业实战讲解多重编辑、条件反选与配置文件批量清理技巧。"
---

# Linux sed 流编辑器实战：Pattern Space 与 Hold Space

sed（Stream Editor）是一个非交互式的流编辑器，一次处理一行文本内容。

在处理文本时，sed 把当前处理的行存储在临时缓冲区中，该缓冲区称为“模式空间”（Pattern Space）。接着用指定的 sed 命令处理缓冲区中的内容，处理完成后将缓冲区内容输出到屏幕。随后读入并处理下一行，如此循环往复直至文件末尾。除非使用 `-i` 参数或通过重定向存储输出，否则 sed 不会修改原文件。

---

## 一、sed 语法格式与核心参数

### 1. 命令基本格式
```bash
sed [options] 'command' file(s)
```

### 2. sed 正则表达式支持
sed 支持使用正则表达式匹配行或文本模式：
- **基本元字符集（BRE）**：`^`, `$`, `.`, `*`, `[]`, `[^]`, `\<`, `\>`, `\(\)`, `\{\}`
- **扩展元字符集（ERE）**：`?`, `+`, `{ }`, `|`, `( )`（需使用 `sed -r` 或在基本模式下使用反斜线转义 `\+`）

### 3. sed 选项参数（options）
- `-e`：允许多项编辑（在一行命令中执行多个编辑脚本）
- `-n`：取消默认的模式空间输出（通常与 `p` 命令配合使用）
- `-i`：直接修改源文件内容
- `-r`：支持扩展正则表达式（ERE），无需对 `+`、`?`、`()` 等符号转义

### 4. sed 内置命令动作
| 命令 | 说明 |
| :--- | :--- |
| `p` | 打印模式空间的内容 |
| `a` | 在当前行之后追加文本 |
| `i` | 在当前行之前插入文本 |
| `c` | 将当前行整行替换修改为新文本 |
| `d` | 删除模式空间中的内容，并直接读入下一行 |
| `n` | 读入下一输入行，从下一条命令开始处理 |
| `w` | 将匹配到的行写入外部新文件 |
| `!` | 对所选行以外的所有行执行命令（反向选择） |
| `h` | 将模式空间（Pattern Space）的内容覆盖写入暂存空间（Hold Space） |
| `H` | 将模式空间的内容追加到暂存空间 |
| `g` | 将暂存空间的内容取出并覆盖模式空间 |
| `G` | 将暂存空间的内容取出并追加在模式空间后面 |
| `x` | 交换模式空间与暂存空间的内容 |

---

## 二、基础编辑操作：多重编辑与增删改查

测试样本以 `dawn` 主机上的 `/root/passwd` 和 `/etc/hosts` 为例

### 1. 多项编辑操作
#### 方式一：管道级联处理
```bash
[root@dawn ~]# sed '1,9d' /root/passwd | sed 's#root#dawn#g'
```

#### 方式二：使用 `-e` 参数组合
```bash
[root@dawn ~]# sed -e '1,9d' -e 's#root#dawn#g' /root/passwd
```

---

### 2. 打印命令 `p`
#### (1) 打印匹配 halt 的行
```bash
[root@dawn ~]# sed -n '/halt/p' /root/passwd
halt:x:7:0:halt:/sbin:/sbin/halt
```

#### (2) 打印第二行
```bash
[root@dawn ~]# sed -n '2p' /root/passwd
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) 打印最后一行
```bash
[root@dawn ~]# sed -n '$p' /root/passwd
```

---

### 3. 追加命令 `a` 与插入命令 `i`
- `a`（append）：在目标行下方追加内容
- `i`（insert）：在目标行上方插入内容

#### (1) 在第 2 行下方追加新配置
```bash
[root@dawn ~]# sed '2a listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
listen 80;
daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) 在第 2 行上方插入新配置
```bash
[root@dawn ~]# sed '2i listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
listen 80;
bin:x:1:1:bin:/bin:/sbin/nologin
```

---

### 4. 整行替换命令 `c`
#### (1) 指定行号整行替换
```bash
[root@dawn ~]# sed '7c SELINUX=Disabled' /etc/selinux/config
```

#### (2) 正则匹配定位后整行替换
```bash
[root@dawn ~]# sed '/^SELINUX=/c SELINUX=Disabled' /etc/selinux/config
```

#### (3) 企业实战：非交互式修改系统配置
```bash
[root@dawn ~]# sed -ri '/UseDNS/cUseDNS no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/GSSAPIAuthentication/c#GSSAPIAuthentication no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/^SELINUX=/cSELINUX=disabled' /etc/selinux/config
```

---

### 5. 删除命令 `d`
#### (1) 删除指定单行（如第 3 行，不影响源文件）
```bash
[root@dawn ~]# sed '3d' /root/passwd
```

#### (2) 从第 3 行删除至最后一行
```bash
[root@dawn ~]# sed '3,$d' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) 删除最后一行
```bash
[root@dawn ~]# sed '$d' /root/passwd
```

#### (4) 删除全部内容
```bash
[root@dawn ~]# sed '1,$d' /root/passwd
```

#### (5) 匹配指定模式进行删除
```bash
[root@dawn ~]# sed '/mail/d' /root/passwd
```

---

### 6. 写文件命令 `w`
#### (1) 将匹配到的行写入到新文件中
```bash
[root@dawn ~]# sed -n '/root/w newfile' /root/passwd
[root@dawn ~]# cat newfile
root:x:0:0:root:/root:/bin/bash
```

#### (2) 将第二行单独提取写入新文件
```bash
[root@dawn ~]# sed -n '2w newfile' /root/passwd
```

---

### 7. 跨行处理命令 `n`
`n` 表示读取下一行到模式空间，使后续命令作用于下一行

#### (1) 匹配 root 行后，删除 root 的下一行
```bash
[root@dawn ~]# sed '/root/{n;d}' /root/passwd
```

#### (2) 匹配 root 行后，替换其下一行中的内容
```bash
[root@dawn ~]# sed '/root/{n; s/bin/dawn/}' /root/passwd
```

---

## 三、高级架构：Pattern Space 与 Hold Space 原理剖析

### 1. sed 执行流程机制
sed 是面向流的行编辑器。所谓面向流，是指接受标准输入，逐行读入并输出到标准输出。

具体过程如下：sed 将处理的行读入到一个临时缓冲区（模式空间 Pattern Space），sed 脚本中的命令依次作用于该缓冲区，所有命令处理完毕后将缓冲区内容打印到屏幕，并清空 Pattern Space；接着读入下一行，重复上述循环，直到文件末尾。

### 2. Pattern Space 与 Hold Space 概念
- **Pattern Space（模式空间）**：相当于**车间**，sed 将当前读入的行放在此处进行加工处理。
- **Hold Space（暂存空间）**：相当于**仓库**，用于临时存放加工过程中的半成品数据。

### 3. 高级空间操作指令
- `h`：将 Pattern Space 内容覆盖至 Hold Space
- `H`：将 Pattern Space 内容追加至 Hold Space
- `g`：将 Hold Space 内容覆盖至 Pattern Space
- `G`：将 Hold Space 内容追加至 Pattern Space
- `x`：互换 Pattern Space 与 Hold Space 的内容

### 4. 空间操作经典案例实战

#### 案例 1：将第 1 行写入暂存区，替换最后一行
```bash
[root@dawn ~]# sed '1h;$g' /etc/hosts
```

#### 案例 2：将第 1 行写入暂存区，在最后一行追加调用
```bash
[root@dawn ~]# sed '1h;$G' /etc/hosts
```

#### 案例 3：将第 1 行删除并保留至暂存区，在最后一行追加
```bash
[root@dawn ~]# sed -r '1{h;d};$G' /etc/hosts
```

#### 案例 4：将第 1 行写入暂存区，从第 2 行开始全部用第 1 行替换
```bash
[root@dawn ~]# sed -r '1h;2,$g' /etc/hosts
```

#### 案例 5：文件倒序排列实战 `sed '1!G;h;$!d'`
- `1!G`：第一行不执行 G 追加（避免首行多出一个空换行符），从第二行起追加暂存区内容。
- `h`：将当前模式空间内容存入暂存区。
- `$!d`：除最后一行外，其余行处理完后均清空模式空间不打印。

```bash
[root@dawn ~]# cat << EOF > /root/num.txt
1 1 1
2 2 2
3 3 3
EOF

[root@dawn ~]# sed '1!G;h;$!d' /root/num.txt
3 3 3
2 2 2
1 1 1
```

---

## 四、条件反选与高级正则替换

### 1. 反向选择命令 `!`
#### 除了第 3 行，其余行全部删除
```bash
[root@dawn ~]# sed -r '3!d' /etc/hosts
```

---

### 2. 匹配替换命令 `s` 进阶
- 语法：`s/pattern/replacement/flags`
- 常用 flags：
  - `g`：全局替换行内所有匹配项
  - `i`：忽略大小写匹配
  - `&`：代表前面正则匹配到的完整内容

#### (1) 替换每行首个出现的字符
```bash
[root@dawn ~]# sed 's/root/alice/' /root/passwd
```

#### (2) 仅替换行首匹配项
```bash
[root@dawn ~]# sed 's/^root/alice/' /root/passwd
```

#### (3) 匹配行后追加指定字符串（使用 `&`）
```bash
[root@dawn ~]# sed -r 's/[0-9][0-9]$/& .5/' /root/passwd
```

#### (4) 全局替换与忽略大小写
```bash
[root@dawn ~]# sed -r 's/root/alice/g' /root/passwd
[root@dawn ~]# sed -r 's/root/alice/gi' /root/passwd
```

#### (5) 正则分组与后向引用（Backreference）
使用小括号 `()` 分组，后向引用通过 `\1`, `\2` 调用：
```bash
[root@dawn ~]# sed -r 's#(root)#\1-alice#g' /root/passwd
```

提取系统 IP 地址实战：
```bash
[root@dawn ~]# ip addr show eth0 | grep "inet " | sed -r 's#^.*inet ([0-9.]+)/.*$#\1#'
101.133.147.148
```

#### (6) 路径替换定界符技巧
当替换内容中包含大量斜线 `/`（如路径）时，建议使用 `#` 或 `@` 代替常规定界符 `/`：
```bash
[root@dawn ~]# sed -r 's#/etc/abc/456#/dev/null#g' a.txt
[root@dawn ~]# sed -r 's@/etc/abc/456@/dev/null@g' a.txt
```

---

## 五、配置文件批量清理与注释管理

测试样本 `/root/file` 内容如下：
```bash
[root@dawn ~]# cat /root/file
# This is a sample config
   # Tabbed comment
#Another comment

listen 80;
server_name localhost;
```

### 1. 过滤与删除注释行与空行
#### (1) 删除行首 `#` 注释（无法删除含空格或制表符的注释）
```bash
[root@dawn ~]# sed '/^#/d' /root/file
```

#### (2) 正确删除含有制表符或空格开头的注释行
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d' /root/file
```

#### (3) 删除无内容空行
```bash
[root@dawn ~]# sed -r '/^[ \t]*$/d' /root/file
```

#### (4) 一键删除所有注释行及纯空行（企业高频用法）
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d; /^[ \t]*$/d' /root/file
listen 80;
server_name localhost;
```
等价语法：
```bash
[root@dawn ~]# sed -r '/^[ \t]*($|#)/d' /root/file
listen 80;
server_name localhost;
```

---

### 2. 批量添加与管理注释符
#### (1) 给第 2 行到第 4 行添加 `#` 注释
```bash
[root@dawn ~]# sed '2,4s/^/#/' /root/file
```

#### (2) 针对缩进行标准化添加注释
```bash
[root@dawn ~]# sed -r '2,5s/^[ \t]*#*/# /' /root/file
```
