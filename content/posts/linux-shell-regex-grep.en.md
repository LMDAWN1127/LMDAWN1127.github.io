---
title: "Linux Hands-on Basics: Regular Expressions (BRE/ERE) and grep Text Filtering"
date: 2026-11-04T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Regex", "grep", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "A systematic review of Basic Regular Expressions (BRE) and Extended Regular Expressions (ERE) in Linux operations, deeply analyzing grep text filtering commands based on the dawn host across 14 core practical cases."
---

# Linux Hands-on Basics: Regular Expressions (BRE/ERE) and grep Text Filtering

A regular expression (Regular Expression, abbreviated as RE) is a character pattern used to match specified characters during search processes.

In most programs, regular expressions are placed between two forward slashes; for example, `/l[oO]ve/` is a regular expression delimited by forward slashes, matching identical patterns occurring at any position within searched lines. In regular expressions, metacharacters are the most fundamental concept.

### Purpose of Regular Expressions
1. Core foundation of the Linux Three Musketeers: `grep`, `sed`, `awk`
2. Numerous string files require non-interactive automated configuration and modification
3. Quickly filter relevant strings, match patterns, and extract specific text lines

### Precautions for Regular Expressions
1. Regular expressions are widely used across various programming languages (e.g., PHP, Python, Java, Go, etc.).
2. Regular expressions differ fundamentally from Shell wildcards: wildcards primarily match filenames (interpreted by Bash), while regular expressions match text content within files.

---

## I. Basic Regular Expressions (BRE) and Extended Regular Expressions (ERE)

Metacharacters are special characters endowed with specific functional meanings.

| Regular Expression | Description |
| :--- | :--- |
| `\` | Escape character, escapes special characters and ignores their special grammatical meaning |
| `^` | Matches the beginning of a line; in awk represents the start of a string |
| `$` | Matches the end of a line; in awk represents the end of a string |
| `^$` | Represents matching empty lines |
| `.` | Matches any single character except newline `\n` |
| `.*` | Matches any character of any length (greedy matching) |
| `[ ]` | Character set, matches any single character contained within the square brackets |
| `[^ ]` | Inverted character set, matches any single character outside the square brackets |
| `[ - ]` | Matches any single character within the range specified in brackets, e.g., `[a-z]`, `[0-9]` |
| `?` | Matches the preceding item 0 or 1 time (extended regex, requires `-E` in grep) |
| `+` | Matches the preceding item 1 or more times (extended regex, requires `-E` in grep) |
| `*` | Matches the preceding item 0 or more times |
| `( )` | Grouping expression, creates a substring for matching or backreferencing |
| `{ n }` | Matches the preceding item exactly n times, where n is a non-negative integer |
| `{ n, }` | Preceding item matches at least n times |
| `{ n,m }` | Preceding item matches at least n times and at most m times (n <= m) |
| `|` | Logical OR, matches either item on either side of the vertical bar, e.g., `ab(c|d)` matches `abc` or `abd` |

### POSIX Specific Character Classes
- `[[:space:]]`: Matches any whitespace character (spaces, Tab, etc.)
- `[[:digit:]]`: Matches digits, equivalent to `[0-9]`
- `[[:lower:]]`: Matches lowercase letters, equivalent to `[a-z]`
- `[[:upper:]]`: Matches uppercase letters, equivalent to `[A-Z]`
- `[[:alpha:]]`: Matches all uppercase and lowercase letters, equivalent to `[a-zA-Z]`

---

## II. 14 Practical Cases of grep Regular Expressions

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

### 1. Filter lines starting with m
```bash
[root@dawn ~]# grep "^m" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
```

### 2. Filter lines ending with m
```bash
[root@dawn ~]# grep "m$" /root/test.txt
our site is http:www.dawn.com
```

### 3. Exclude empty lines and print line numbers
The `-v` parameter indicates inverted matching, and the `-n` parameter displays the corresponding line numbers:
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

### 4. Match any single character (excluding empty lines)
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

### 5. Match all characters (including empty lines)
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

### 6. Match a single arbitrary character
The dot `.` matches any single non-newline character, for example matching patterns starting with `c`, ending with `u`, with any single character in between:
```bash
[root@dawn ~]# grep "c.u" /root/test.txt
I am czu student!
```
It can also match `d.wn` (matching lines containing dawn):
```bash
[root@dawn ~]# grep "d.wn" /root/test.txt
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 7. Match lines ending with a dot `.`
The period is a special metacharacter in regex; matching its literal value requires escaping with `\`:
```bash
[root@dawn ~]# grep "\.$" /root/test.txt
I study linux.
not 88888888.
```

### 8. Accurately extract continuous matched content (-o parameter)
The `-o` parameter outputs only the exact characters matched on each line, combined with filtering empty lines:
```bash
[root@dawn ~]# grep -o "8*" /root/test.txt | grep -v "^$"
8
8
88888888
```

### 9. Match lines containing specified character set ([abc])
```bash
[root@dawn ~]# grep "[abc]" /root/test.txt
I am czu student!
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 10. Match lines containing digits ([0-9])
```bash
[root@dawn ~]# grep "[0-9]" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
not 88888888.
```

### 11. Match lines containing lowercase letters ([a-z])
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

### 12. Match repeated characters (using \{3\} in BRE mode)
In basic regular expressions, curly braces must be escaped with a backslash (matching 3 consecutive 8s):
```bash
[root@dawn ~]# grep "8\{3\}" /root/test.txt
not 88888888.
```

### 13. Repeat digit 8 appearing 3 to 5 times (ERE mode)
Use `-E` to enable extended regular expressions, no escaping needed for curly braces:
```bash
[root@dawn ~]# grep -E "8{3,5}" /root/test.txt
not 88888888.
```

### 14. Match appearing at least 1 time or more (+ or {1,})
```bash
[root@dawn ~]# grep -E "8{1,}" /root/test.txt
my qq num is 3252408778
not 88888888.
```
Equivalent to using the `+` metacharacter:
```bash
[root@dawn ~]# grep -E "8+" /root/test.txt
my qq num is 3252408778
not 88888888.
```
