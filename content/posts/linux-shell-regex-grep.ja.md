---
title: "Linux 基礎実践：正規表現（BRE/ERE）と grep テキストフィルタリング"
date: 2026-11-04T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Regex", "grep", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux 運用における基本正規表現（BRE）と拡張正規表現（ERE）を体系的に整理し、dawn ホスト上で 14 の中核実践ケースを通じて grep テキストフィルタリングコマンドを徹底解説。"
---

# Linux 基礎実践：正規表現（BRE/ERE）と grep テキストフィルタリング

正規表現（Regular Expression、略称 RE）とは、検索プロセスにおいて指定した文字と一致させるための文字パターンです。

大半のプログラムでは、正規表現は2つのスラッシュの間に配置されます。例えば `/l[oO]ve/` はスラッシュで区切られた正規表現であり、検索対象の行の任意の位置に出現する同一パターンに一致します。正規表現において、メタ文字は最も重要な概念です。

### 正規表現の役割
1. Linux 三種の神器の中核基礎：`grep`、`sed`、`awk`
2. 大量の文字列ファイルに対する非対話型の自動構成と変更
3. 関連文字列の迅速なフィルタリング、パターンマッチング、および特定テキスト行の抽出

### 正規表現の注意事項
1. 正規表現は非常に広範に応用されており、様々なプログラミング言語（PHP、Python、Java、Go など）に存在します。
2. 正規表現と Shell ワイルドカード（Wildcards）には本質的な違いがあります。ワイルドカードは主にファイル名の一致（Bash によって解釈）に使用され、正規表現はファイル内のテキスト内容の一致に使用されます。

---

## 一、基本正規表現（BRE）と拡張正規表現（ERE）

メタ文字（Metacharacters）とは、特定の機能的意味を付与された特殊文字です。

| 正規表現 | 説明 |
| :--- | :--- |
| `\` | エスケープ文字。特殊文字をエスケープし、その特別な文法意味を無視する |
| `^` | 行頭に一致。awk では文字列の先頭への一致を表す |
| `$` | 行末に一致。awk では文字列の末尾への一致を表す |
| `^$` | 空行への一致を表す |
| `.` | 改行文字 `\n` を除く任意の単一文字に一致 |
| `.*` | 任意の長さの任意の文字に一致（最長一致・貪欲マッチ） |
| `[ ]` | 文字セット。角括弧内に含まれる任意の1文字に一致 |
| `[^ ]` | 否定文字セット。角括弧外の任意の1文字に一致 |
| `[ - ]` | 角括弧で指定された範囲内の任意の1文字に一致（例：`[a-z]`、`[0-9]`） |
| `?` | 直前の項目に 0 回または 1 回一致（拡張正規表現、grep では `-E` が必要） |
| `+` | 直前の項目に 1 回以上一致（拡張正規表現、grep では `-E` が必要） |
| `*` | 直前の項目に 0 回以上一致 |
| `( )` | グループ化式。マッチングまたは後方参照用の部分文字列を作成 |
| `{ n }` | 直前の項目に正確に n 回一致（n は非負整数） |
| `{ n, }` | 直前の項目に少なくとも n 回一致 |
| `{ n,m }` | 直前の項目に少なくとも n 回、最大 m 回一致（n <= m） |
| `|` | 論理 OR。縦線の両側のいずれかの項目に一致（例：`ab(c|d)` は `abc` または `abd` に一致） |

### POSIX 特定文字クラス
- `[[:space:]]`：任意の空白文字（スペース、タブなど）に一致
- `[[:digit:]]`：数字に一致（`[0-9]` と同等）
- `[[:lower:]]`：小文字に一致（`[a-z]` と同等）
- `[[:upper:]]`：大文字に一致（`[A-Z]` と同等）
- `[[:alpha:]]`：すべての大文字および小文字に一致（`[a-zA-Z]` と同等）

---

## 二、grep 正規表現 14 の実践ケース

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

### 1. m で始まる行をフィルタリング
```bash
[root@dawn ~]# grep "^m" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
```

### 2. m で終わる行をフィルタリング
```bash
[root@dawn ~]# grep "m$" /root/test.txt
our site is http:www.dawn.com
```

### 3. 空行を除外し行番号を表示
`-v` パラメータは反転マッチを表し、`-n` パラメータは対応する行番号を表示します：
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

### 4. 任意の1文字に一致（空行を除く）
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

### 5. すべての文字に一致（空行を含む）
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

### 6. 単一の任意文字に一致
ドット `.` は改行を除く任意の単一文字に一致します。例えば `c` で始まり `u` で終わり、中間が任意の1文字であるパターンに一致：
```bash
[root@dawn ~]# grep "c.u" /root/test.txt
I am czu student!
```
また、`d.wn` にも一致します（dawn を含む行に一致）：
```bash
[root@dawn ~]# grep "d.wn" /root/test.txt
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 7. ドット `.` で終わる行に一致
ピリオドは正規表現で特別なメタ文字であるため、そのリテラル値に一致させるには `\` でエスケープする必要があります：
```bash
[root@dawn ~]# grep "\.$" /root/test.txt
I study linux.
not 88888888.
```

### 8. 連続一致した内容を正確に抽出（-o パラメータ）
`-o` パラメータは各行で正確に一致した文字のみを出力し、空行フィルタリングと連携します：
```bash
[root@dawn ~]# grep -o "8*" /root/test.txt | grep -v "^$"
8
8
88888888
```

### 9. 指定した文字セット（[abc]）を含む行に一致
```bash
[root@dawn ~]# grep "[abc]" /root/test.txt
I am czu student!
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 10. 数字（[0-9]）を含む行に一致
```bash
[root@dawn ~]# grep "[0-9]" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
not 88888888.
```

### 11. 小文字（[a-z]）を含む行に一致
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

### 12. 繰り返し文字に一致（BRE モードで \{3\} を使用）
基本正規表現では、中括弧をバックスラッシュでエスケープする必要があります（連続する3つの8に一致）：
```bash
[root@dawn ~]# grep "8\{3\}" /root/test.txt
not 88888888.
```

### 13. 数字 8 が 3〜5 回繰り返して出現（ERE モード）
`-E` を使用して拡張正規表現を有効にすると、中括弧のエスケープは不要です：
```bash
[root@dawn ~]# grep -E "8{3,5}" /root/test.txt
not 88888888.
```

### 14. 少なくとも 1 回以上出現（+ または {1,}）
```bash
[root@dawn ~]# grep -E "8{1,}" /root/test.txt
my qq num is 3252408778
not 88888888.
```
`+` メタ文字を使用する場合と同等：
```bash
[root@dawn ~]# grep -E "8+" /root/test.txt
my qq num is 3252408778
not 88888888.
```
