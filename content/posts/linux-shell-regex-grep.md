---
title: "Linux 基础实战：正则表达式（BRE/ERE）与 grep 文本过滤"
date: 2026-11-04T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Regex", "grep", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "系统化梳理 Linux 运维中的基础正则表达式（BRE）与扩展正则表达式（ERE），并基于 dawn 主机结合 14 个核心实战案例深度解析 grep 文本过滤命令。"
---

# Linux 基础实战：正则表达式（BRE/ERE）与 grep 文本过滤

正则表达式（Regular Expression，简称 RE）是一种字符模式，用于在查找过程中匹配指定的字符。

在大多数程序里，正则表达式都被置于两个正斜杠之间；例如 `/l[oO]ve/` 就是由正斜杠界定的正则表达式，它将匹配被查找的行中任何位置出现的相同模式。在正则表达式中，元字符是最重要的概念。

### 正则表达式的作用
1. Linux 三剑客核心基础：`grep`、`sed`、`awk`
2. 大量的字符串文件需要进行非交互式自动化配置与修改
3. 快速过滤相关字符串、匹配模式并提取特定文本行

### 正则表达式注意事项
1. 正则表达式应用非常广泛，存在于各种编程语言中（如 PHP、Python、Java、Go 等）。
2. 正则表达式和 Shell 通配符（Wildcards）有着本质区别：通配符主要用于匹配文件名（由 Bash 解释），而正则表达式用于匹配文件内的文本内容。

---

## 一、基础正则表达式（BRE）与扩展正则表达式（ERE）

元字符（Metacharacters）是赋予了特定功能含义的特殊字符。

| 正则表达式 | 描述 |
| :--- | :--- |
| `\` | 转义符，将特殊字符进行转义，忽略其特殊语法意义 |
| `^` | 匹配行首；在 awk 中表示匹配字符串的开始 |
| `$` | 匹配行尾；在 awk 中表示匹配字符串的结尾 |
| `^$` | 表示匹配空行 |
| `.` | 匹配除换行符 `\n` 之外的任意单个字符 |
| `.*` | 匹配任意长度的任意字符（贪婪匹配） |
| `[ ]` | 字符集合，匹配包含在方括号之中的任意一个字符 |
| `[^ ]` | 字符集合取反，匹配方括号之外的任意一个字符 |
| `[ - ]` | 匹配方括号指定范围内的任意一个字符，如 `[a-z]`、`[0-9]` |
| `?` | 匹配之前的项 0 次或 1 次（扩展正则，grep 需加 `-E`） |
| `+` | 匹配之前的项 1 次或多次（扩展正则，grep 需加 `-E`） |
| `*` | 匹配之前的项 0 次或多次 |
| `( )` | 分组匹配表达式，创建一个用于匹配的子串或后向引用 |
| `{ n }` | 匹配之前的项精确 n 次，n 为非负整数 |
| `{ n, }` | 之前的项至少匹配 n 次 |
| `{ n,m }` | 之前的项至少匹配 n 次，最多匹配 m 次（n <= m） |
| `|` | 或逻辑，匹配竖线两边的任意一项，例如 `ab(c|d)` 匹配 `abc` 或 `abd` |

### POSIX 特定字符类
- `[[:space:]]`：匹配任意空白字符（空格、Tab 等）
- `[[:digit:]]`：匹配数字，等价于 `[0-9]`
- `[[:lower:]]`：匹配小写字母，等价于 `[a-z]`
- `[[:upper:]]`：匹配大写字母，等价于 `[A-Z]`
- `[[:alpha:]]`：匹配所有大小写字母，等价于 `[a-zA-Z]`

---

## 二、grep 正则表达式 14 个实战案例

```bash
[root@dawn ~]# cat /root/test.txt
I am czu student!
I study linux.
test

I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 1. 过滤以 m 开头的行
```bash
[root@dawn ~]# grep "^m" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
```

### 2. 过滤以 m 结尾的行
```bash
[root@dawn ~]# grep "m$" /root/test.txt
our site is http:www.dawn.com
```

### 3. 排除空行并打印行号
`-v` 参数表示反向匹配，`-n` 参数表示显示对应的行号：
```bash
[root@dawn ~]# grep -vn "^$" /root/test.txt
1:I am czu student!
2:I study linux.
3:test
5:I like badminton ball ,billiard ball and chinese chess!
6:my blog is https://lmdawn1127.github.io
7:our site is http:www.dawn.com
8:my qq num is 3252408778
9:not 88888888.
```

### 4. 匹配任意一个字符（不包括空行）
```bash
[root@dawn ~]# grep "." /root/test.txt
I am czu student!
I study linux.
test
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 5. 匹配所有字符（包括空行）
```bash
[root@dawn ~]# grep ".*" /root/test.txt
I am czu student!
I study linux.
test

I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 6. 匹配单个任意字符
点号 `.` 匹配任意单个非换行字符，例如匹配以 `c` 开头、`u` 结尾且中间为任意单字符的模式：
```bash
[root@dawn ~]# grep "c.u" /root/test.txt
I am czu student!
```
也可以匹配 `d.wn`（匹配包含 dawn 的行）：
```bash
[root@dawn ~]# grep "d.wn" /root/test.txt
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 7. 匹配以点 `.` 结尾的行
句点在正则中为特殊元字符，匹配其字面值需要使用 `\` 进行转义：
```bash
[root@dawn ~]# grep "\.$" /root/test.txt
I study linux.
not 88888888.
```

### 8. 精确提取连续匹配内容（-o 参数）
`-o` 参数只输出每行中精确匹配到的字符，配合过滤空行：
```bash
[root@dawn ~]# grep -o "8*" /root/test.txt | grep -v "^$"
8
8
88888888
```

### 9. 匹配包含指定字符集合（[abc]）的行
```bash
[root@dawn ~]# grep "[abc]" /root/test.txt
I am czu student!
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 10. 匹配包含数字（[0-9]）的行
```bash
[root@dawn ~]# grep "[0-9]" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
not 88888888.
```

### 11. 匹配包含小写字母（[a-z]）的行
```bash
[root@dawn ~]# grep "[a-z]" /root/test.txt
I am czu student!
I study linux.
test
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 12. 匹配重复字符（BRE 模式下使用 \{3\}）
在基础正则表达式中，花括号需使用反斜线转义（匹配连续 3 个 8）：
```bash
[root@dawn ~]# grep "8\{3\}" /root/test.txt
not 88888888.
```

### 13. 重复数字 8 出现 3 到 5 次（ERE 模式）
使用 `-E` 启用扩展正则表达式，花括号无需转义：
```bash
[root@dawn ~]# grep -E "8{3,5}" /root/test.txt
not 88888888.
```

### 14. 匹配至少出现 1 次或 1 次以上（+ 或 {1,}）
```bash
[root@dawn ~]# grep -E "8{1,}" /root/test.txt
my qq num is 3252408778
not 88888888.
```
等价于使用 `+` 元字符：
```bash
[root@dawn ~]# grep -E "8+" /root/test.txt
my qq num is 3252408778
not 88888888.
```
