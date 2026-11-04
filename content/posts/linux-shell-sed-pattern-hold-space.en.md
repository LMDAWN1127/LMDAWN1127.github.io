---
title: "Linux sed Stream Editor Hands-on: Pattern Space and Hold Space"
date: 2026-11-04T14:10:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "sed", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "An in-depth analysis of the core architecture of sed (Stream Editor), systematically reviewing common options and editing actions, deeply dissecting the interaction mechanism between Pattern Space and Hold Space, and demonstrating multi-editing, inverted selection, and batch configuration cleanup based on enterprise practical cases."
---

# Linux sed Stream Editor Hands-on: Pattern Space and Hold Space

sed (Stream Editor) is a non-interactive stream editor that processes text line by line.

When processing text, sed stores the currently processed line in a temporary buffer known as the "Pattern Space". Next, it applies specified sed commands to process the buffer content, and outputs the result to the screen upon completion. It then reads and processes the next line, repeating this cycle until the end of the file. sed does not modify the original file unless the `-i` option is used or the output is redirected.

---

## I. sed Syntax Format and Core Parameters

### 1. Basic Command Format
```bash
sed [options] 'command' file(s)
```

### 2. sed Regular Expression Support
sed supports matching lines or text patterns using regular expressions:
- **Basic Regular Expressions (BRE)**: `^`, `$`, `.`, `*`, `[]`, `[^]`, `\<`, `\>`, `\(\)`, `\{\}`
- **Extended Regular Expressions (ERE)**: `?`, `+`, `{ }`, `|`, `( )` (requires `sed -r` or backslash escaping `\+` in basic mode)

### 3. sed Options (options)
- `-e`: Allows multiple edits (executing multiple edit scripts in a single command line)
- `-n`: Suppresses default output of Pattern Space (commonly paired with the `p` command)
- `-i`: Directly modifies the source file content
- `-r`: Supports extended regular expressions (ERE) without escaping symbols like `+`, `?`, `()`

### 4. sed Built-in Command Actions
| Command | Description |
| :--- | :--- |
| `p` | Prints the contents of Pattern Space |
| `a` | Appends text below the current line |
| `i` | Inserts text above the current line |
| `c` | Replaces the entire current line with new text |
| `d` | Deletes the content in Pattern Space and immediately reads the next line |
| `n` | Reads the next input line and starts processing from the next command |
| `w` | Writes matched lines to an external new file |
| `!` | Executes commands on all lines other than the selected lines (inverted selection) |
| `h` | Overwrites Pattern Space content into Hold Space |
| `H` | Appends Pattern Space content into Hold Space |
| `g` | Retrieves Hold Space content and overwrites Pattern Space |
| `G` | Retrieves Hold Space content and appends it after Pattern Space |
| `x` | Exchanges content between Pattern Space and Hold Space |

---

## II. Basic Editing Operations: Multi-editing and CRUD

Test samples take `/root/passwd` and `/etc/hosts` on the `dawn` host as examples

### 1. Multi-edit Operations
#### Method 1: Pipeline Cascade Processing
```bash
[root@dawn ~]# sed '1,9d' /root/passwd | sed 's#root#dawn#g'
```

#### Method 2: Combining with the `-e` Option
```bash
[root@dawn ~]# sed -e '1,9d' -e 's#root#dawn#g' /root/passwd
```

---

### 2. Print Command `p`
#### (1) Print lines matching halt
```bash
[root@dawn ~]# sed -n '/halt/p' /root/passwd
halt:x:7:0:halt:/sbin:/sbin/halt
```

#### (2) Print the second line
```bash
[root@dawn ~]# sed -n '2p' /root/passwd
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) Print the last line
```bash
[root@dawn ~]# sed -n '$p' /root/passwd
```

---

### 3. Append Command `a` and Insert Command `i`
- `a` (append): Appends content below the target line
- `i` (insert): Inserts content above the target line

#### (1) Append new configuration below line 2
```bash
[root@dawn ~]# sed '2a listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
listen 80;
daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) Insert new configuration above line 2
```bash
[root@dawn ~]# sed '2i listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
listen 80;
bin:x:1:1:bin:/bin:/sbin/nologin
```

---

### 4. Line Replacement Command `c`
#### (1) Replace entire line by specifying line number
```bash
[root@dawn ~]# sed '7c SELINUX=Disabled' /etc/selinux/config
```

#### (2) Locate by regex match and replace entire line
```bash
[root@dawn ~]# sed '/^SELINUX=/c SELINUX=Disabled' /etc/selinux/config
```

#### (3) Enterprise Practice: Non-interactive system configuration modification
```bash
[root@dawn ~]# sed -ri '/UseDNS/cUseDNS no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/GSSAPIAuthentication/c#GSSAPIAuthentication no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/^SELINUX=/cSELINUX=disabled' /etc/selinux/config
```

---

### 5. Delete Command `d`
#### (1) Delete a specific single line (e.g., line 3, without affecting source file)
```bash
[root@dawn ~]# sed '3d' /root/passwd
```

#### (2) Delete from line 3 to the last line
```bash
[root@dawn ~]# sed '3,$d' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) Delete the last line
```bash
[root@dawn ~]# sed '$d' /root/passwd
```

#### (4) Delete all content
```bash
[root@dawn ~]# sed '1,$d' /root/passwd
```

#### (5) Delete matching specified pattern
```bash
[root@dawn ~]# sed '/mail/d' /root/passwd
```

---

### 6. Write File Command `w`
#### (1) Write matched lines to a new file
```bash
[root@dawn ~]# sed -n '/root/w newfile' /root/passwd
[root@dawn ~]# cat newfile
root:x:0:0:root:/root:/bin/bash
```

#### (2) Extract line 2 individually and write to a new file
```bash
[root@dawn ~]# sed -n '2w newfile' /root/passwd
```

---

### 7. Cross-line Processing Command `n`
`n` indicates reading the next line into Pattern Space, causing subsequent commands to act on the next line

#### (1) After matching root line, delete the line following root
```bash
[root@dawn ~]# sed '/root/{n;d}' /root/passwd
```

#### (2) After matching root line, replace content in its following line
```bash
[root@dawn ~]# sed '/root/{n; s/bin/dawn/}' /root/passwd
```

---

## III. Advanced Architecture: Pattern Space and Hold Space Deep Dive

### 1. sed Execution Flow Mechanism
sed is a stream-oriented line editor. Stream-oriented means accepting standard input, reading line by line, and outputting to standard output.

The specific process is as follows: sed reads the line to be processed into a temporary buffer (Pattern Space), commands in the sed script act sequentially on this buffer, and after all commands finish processing, the buffer content is printed to the screen and Pattern Space is cleared; then the next line is read, repeating the above cycle until the end of the file.

### 2. Pattern Space and Hold Space Concepts
- **Pattern Space**: Acts as the **workshop**, where sed places the currently read line for processing and transformation.
- **Hold Space**: Acts as the **warehouse**, used for temporarily storing semi-finished data during processing.

### 3. Advanced Space Operation Instructions
- `h`: Overwrites Pattern Space content into Hold Space
- `H`: Appends Pattern Space content into Hold Space
- `g`: Overwrites Hold Space content into Pattern Space
- `G`: Appends Hold Space content into Pattern Space
- `x`: Exchanges content between Pattern Space and Hold Space

### 4. Classic Space Operation Practical Cases

#### Case 1: Write line 1 into Hold Space and replace the last line
```bash
[root@dawn ~]# sed '1h;$g' /etc/hosts
```

#### Case 2: Write line 1 into Hold Space and append it to the last line
```bash
[root@dawn ~]# sed '1h;$G' /etc/hosts
```

#### Case 3: Delete line 1 and save to Hold Space, then append to the last line
```bash
[root@dawn ~]# sed -r '1{h;d};$G' /etc/hosts
```

#### Case 4: Write line 1 into Hold Space, and replace all lines from line 2 onward with line 1
```bash
[root@dawn ~]# sed -r '1h;2,$g' /etc/hosts
```

#### Case 5: Reverse file order practical case `sed '1!G;h;$!d'`
- `1!G`: Do not execute G append on line 1 (avoiding an extra empty newline at the top), append Hold Space content starting from line 2.
- `h`: Store current Pattern Space content into Hold Space.
- `$!d`: Except for the last line, clear Pattern Space without printing after processing each line.

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

## IV. Inverted Selection and Advanced Regex Replacement

### 1. Inverted Selection Command `!`
#### Delete all lines except line 3
```bash
[root@dawn ~]# sed -r '3!d' /etc/hosts
```

---

### 2. Match and Replace Command `s` Advanced
- Syntax: `s/pattern/replacement/flags`
- Common flags:
  - `g`: Globally replace all matches in the line
  - `i`: Ignore case matching
  - `&`: Represents the entire content matched by the preceding regex

#### (1) Replace the first occurrence of characters in each line
```bash
[root@dawn ~]# sed 's/root/alice/' /root/passwd
```

#### (2) Replace only line-start match
```bash
[root@dawn ~]# sed 's/^root/alice/' /root/passwd
```

#### (3) Append specified string after matched line (using `&`)
```bash
[root@dawn ~]# sed -r 's/[0-9][0-9]$/& .5/' /root/passwd
```

#### (4) Global replacement and case-insensitive matching
```bash
[root@dawn ~]# sed -r 's/root/alice/g' /root/passwd
[root@dawn ~]# sed -r 's/root/alice/gi' /root/passwd
```

#### (5) Regex Grouping and Backreference
Use parentheses `()` for grouping, and invoke via `\1`, `\2` in backreferences:
```bash
[root@dawn ~]# sed -r 's#(root)#\1-alice#g' /root/passwd
```

Extracting system IP address practical:
```bash
[root@dawn ~]# ip addr show eth0 | grep "inet " | sed -r 's#^.*inet ([0-9.]+)/.*$#\1#'
101.133.147.148
```

#### (6) Path replacement delimiter tips
When replacement content contains numerous slashes `/` (such as file paths), it is recommended to use `#` or `@` instead of the conventional delimiter `/`:
```bash
[root@dawn ~]# sed -r 's#/etc/abc/456#/dev/null#g' a.txt
[root@dawn ~]# sed -r 's@/etc/abc/456@/dev/null@g' a.txt
```

---

## V. Batch Configuration File Cleanup and Comment Management

Test sample `/root/file` content is as follows:
```bash
[root@dawn ~]# cat /root/file
# This is a sample config
   # Tabbed comment
#Another comment

listen 80;
server_name localhost;
```

### 1. Filter and Delete Comment Lines and Empty Lines
#### (1) Delete `#` comments at line start (cannot delete comments with leading spaces or tabs)
```bash
[root@dawn ~]# sed '/^#/d' /root/file
```

#### (2) Correctly delete comment lines starting with tabs or spaces
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d' /root/file
```

#### (3) Delete blank empty lines
```bash
[root@dawn ~]# sed -r '/^[ \t]*$/d' /root/file
```

#### (4) One-click delete all comment lines and pure empty lines (high-frequency enterprise usage)
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d; /^[ \t]*$/d' /root/file
listen 80;
server_name localhost;
```
Equivalent syntax:
```bash
[root@dawn ~]# sed -r '/^[ \t]*($|#)/d' /root/file
listen 80;
server_name localhost;
```

---

### 2. Batch Adding and Managing Comment Characters
#### (1) Add `#` comment to lines 2 through 4
```bash
[root@dawn ~]# sed '2,4s/^/#/' /root/file
```

#### (2) Standardized comment addition for indented lines
```bash
[root@dawn ~]# sed -r '2,5s/^[ \t]*#*/# /' /root/file
```
