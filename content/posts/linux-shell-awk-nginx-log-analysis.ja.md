---
title: "Linux awk テキスト分析の決定版：構文の原理から Nginx アクセスログ集計まで"
date: 2026-11-05T13:56:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "awk", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux 三銃士の一つである awk テキスト分析ツールを体系的に徹底解説。動作メカニズムとライフサイクル（BEGIN/BODY/END）、中核となる組み込み変数と printf 整形出力、パターンマッチングと条件分岐・ループ制御、そして連想配列を活用した 11 の企業レベル Nginx アクセスログ集計実践まで網羅します。"
---

# Linux awk テキスト分析の決定版：構文の原理から Nginx アクセスログ集計まで

`awk` は、Linux/Unix 環境においてパターンスキャンとデータ抽出に特化して設計された、強力なテキストストリーム処理ツールおよびプログラミング言語です。

awk の入力は標準入力、外部ファイル、またはコマンドパイプ出力から取得でき、本番運用の自動化や大量ログ（Nginx、Apache、MySQL ログなど）の分析において極めて中核的な役割を果たします。

---

## 一、awk の動作メカニズムと構文構造

### 1. awk データ処理フロー
1. **行ごとのスキャン**：入力ストリームを上から下へ 1 行ずつ読み込み、行全体の内容を内部変数 `$0` に代入します。
2. **フィールド分割**：フィールド区切り文字（`FS` 変数または `-F` オプションで指定、デフォルトは空白またはタブ）に従って各行を分解し、それぞれ `$1`, `$2`, ..., `$NF` に代入します。
3. **パターンマッチング**：パターン（Pattern）条件に合致する行を検索します。パターンが指定されていない場合は、デフォルトですべての行にマッチします。
4. **アクションの実行**：対応する波括弧 `{action}` 内のアクションを実行します。アクションが指定されていない場合は、デフォルトで行全体を標準出力に出力します。

### 2. 標準構文フォーマット
```bash
awk [options] 'commands' filenames
awk [options] -f awk-script-file filenames
```

### 3. options 主要オプションとコマンドステージ
- `-F`：入力フィールド区切り文字を指定（デフォルトは空白または Tab）
- `-v`：ユーザー定義変数を事前定義

awk の実行ライフサイクルは 3 つのステージに分かれます：
```
行処理前（初期化）        逐次行処理ステージ           すべての行処理完了後
   BEGIN { }          Pattern { action }             END { }
```

#### (1) BEGIN ブロック（ファイル読み込み前に実行）
変数の初期化、レポートヘッダーの印刷、またはファイルを読み取らずに行う計算によく使用されます：
```bash
[root@dawn ~]# awk 'BEGIN{print 1/2}'
0.5
```

フィールド区切り文字の変更：
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"} {print $1}' /root/passwd
```

出力フィールド区切り文字（`OFS`）の設定：
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"; OFS="---"} {print $1,$3}' /root/passwd
root---0
bin---1
```

実行フローの検証：
```bash
[root@dawn ~]# awk 'BEGIN{print "--- START ---"} {print $0} END {print "--- END ---"}' /etc/hosts
--- START ---
127.0.0.1   localhost localhost.localdomain
::1         localhost localhost.localdomain
--- END ---
```

---

## 二、awk 内部変数とフォーマット出力

### 1. 主要内部変数のまとめ
| 変数名 | 意味・説明 |
| :--- | :--- |
| `$0` | 現在のレコード全体（行全体の内容）を保持 |
| `$1` ~ `$NF` | 現在のレコードで分割された第 1 列から最終列までのフィールド |
| `NF` | Number of Fields、現在の行の総フィールド数 |
| `NR` | Number of Records、処理されたレコードの総行番号（複数ファイルで累積加算） |
| `FNR` | File Number of Records、現在のファイル内での行番号（ファイルごとに 1 から開始） |
| `FS` | Field Separator、入力フィールド区切り文字（デフォルト：空白/タブ） |
| `OFS` | Output Field Separator、出力フィールド区切り文字（デフォルト：空白、カンマ `,` で発動） |
| `RS` | Record Separator、入力レコード区切り文字（デフォルト：改行 `\n`） |
| `ORS` | Output Record Separator、出力レコード区切り文字（デフォルト：改行 `\n`） |

### 2. 内部変数の定番実践
#### (1) `$0` と `NR` 行番号
```bash
[root@dawn ~]# awk '{print NR, $0}' /root/passwd | head -n 3
1 root:x:0:0:root:/root:/bin/bash
2 bin:x:1:1:bin:/bin:/sbin/nologin
3 daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) 複数ファイルにおける `NR` と `FNR` の違い
```bash
[root@dawn ~]# awk '{print "NR="NR, "FNR="FNR, $1}' /etc/hosts /root/file
NR=1 FNR=1 127.0.0.1
NR=2 FNR=2 ::1
NR=3 FNR=1 #
NR=4 FNR=2 #
```

#### (3) 最終列 `$NF` と複数区切り文字
```bash
[root@dawn ~]# awk -F: '{print NF, $NF}' /root/passwd | head -n 3
7 /bin/bash
7 /sbin/nologin
7 /sbin/nologin
```

集合区切り文字のサポート（空白またはコロンで同時に分割）：
```bash
[root@dawn ~]# awk -F"[ :]" '{print NF, $1, $2}' /root/passwd | head -n 3
7 root x
7 bin x
7 daemon x
```

### 3. print と printf フォーマット関数
- `print`：末尾に自動で改行文字を付加します。
- `printf`：C言語のフォーマット仕様に厳格に従い、自動改行は行いません（明示的に `\n` を追加する必要があります）。左揃え `-` や固定長指定をサポートします。

```bash
[root@dawn ~]# awk -F: '{printf "%-15s %-10s %-15s\n", $1, $3, $NF}' /root/passwd | head -n 5
root            0          /bin/bash      
bin             1          /sbin/nologin  
daemon          2          /sbin/nologin  
adm             3          /sbin/nologin  
lp              4          /sbin/nologin  
```

---

## 三、パターンアクション、式、および条件ループ

### 1. パターンマッチングと関係演算子
awk は正規表現マッチング（`~` 含む、`!~` 含まない）および数値関係比較（`<`, `<=`, `==`, `!=`, `>=`, `>`）をサポートします：

```bash
# root で始まる行にマッチ
[root@dawn ~]# awk '/^root/' /root/passwd

# 第 1 列に root を含み、UID が 15 以下の行にマッチ
[root@dawn ~]# awk -F: '$1 ~ /root/ && $3 <= 15' /root/passwd
root:x:0:0:root:/root:/bin/bash

# ログインシェルが /bin/bash であるユーザーにマッチ
[root@dawn ~]# awk -F: '$7 == "/bin/bash" {print $1, $3}' /root/passwd
root 0
```

### 2. datafile による代表的な複数列データ処理
テスト用サンプル `/root/datafile`：
```text
northwest       NW      Charles Dennison        25833   0.25    0.5     0.75
western         WE      Sharon Gray             27548   0.1     0.2     0.3
southwest       SW      Lewis Dalsass           19835   0.15    0.25    0.35
southern        SO      Clara Allen             17087   0.05    0.15    0.25
southeast       SE      Kirk Sanchez            23842   0.2     0.3     0.4
eastern         EA      Peter Guenther          28537   0.3     0.4     0.5
northeast       NE      Richard Phillips        22442   0.25    0.35    0.45
north           NO      Ralph Morgan            14525   0.1     0.2     0.3
central         CT      Ann Stephens            29375   0.35    0.45    0.55
```

実践コマンド：
```bash
[root@dawn ~]# awk '/west/' /root/datafile
[root@dawn ~]# awk '/^north/' /root/datafile
[root@dawn ~]# awk '$3 ~ /^north/' /root/datafile
[root@dawn ~]# awk '{print $3, $2}' /root/datafile
[root@dawn ~]# awk '$2 !~ /E/{print $1, $2}' /root/datafile
```

### 3. 条件分岐（if-else）とカウント集計
```bash
[root@dawn ~]# awk -F: '{
    if ($3 == 0) {
        admin++
    } else if ($3 > 0 && $3 < 1000) {
        sys++
    } else {
        normal++
    }
}
END {
    print "管理员数量: " admin
    print "系统用户数量: " sys
    print "普通用户数量: " normal
}' /root/passwd
管理员数量: 1
系统用户数量: 24
普通用户数量: 0
```

### 4. ループ文（while と for）
```bash
# while ループ
[root@dawn ~]# awk 'BEGIN{ i=1; while(i<=5){print i; i++} }'

# for ループによるフィールド走査
[root@dawn ~]# awk -F: 'NR==1 { for(i=1; i<=NF; i++) print "第"i"列:", $i }' /root/passwd
第1列: root
第2列: x
第3列: 0
第4列: 0
第5列: root
第6列: /root
第7列: /bin/bash
```

---

## 四、awk 連想配列とエンタープライズ Nginx ログ分析

### 1. 連想配列の原理
awk では、配列はすべて連想配列（Associative Arrays）であり、そのインデックスには任意の文字列や数値を使用できます。

構文モデル：`array[key]++` は、該当する key を走査するたびに、その key に対応するカウンターを 1 ずつインクリメントすることを意味します。`END` ブロックで `for (k in array)` ループを使用してすべてのキーを走査します。

#### システムユーザーのログインシェル種別分布の集計
```bash
[root@dawn ~]# awk -F: '{shells[$NF]++} END{for(i in shells){print i, shells[i]}}' /root/passwd
/bin/bash 1
/sbin/nologin 23
/sbin/halt 1
```

---

### 2. エンタープライズ Nginx ログ分析 11 実践ケース

標準ログフォーマット仕様：
```text
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                 '$status $body_bytes_sent "$http_referer" '
                 '"$http_user_agent" "$http_x_forwarded_for"';
```
テスト用ログパス：`/var/log/nginx/access.log`

#### (1) 2018 年 1 月 25 日の終日 PV（ページビュー）総数の集計
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{pv++} END{print "总PV量:", pv}' /var/log/nginx/access.log
总PV量: 20
```

#### (2) 10:00 から 10:05 までの時間帯の PV アクセス量の集計
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00"{pv++} END{print "区间PV:", pv}' /var/log/nginx/access.log
区间PV: 7
```

#### (3) 終日アクセス数が最も多い Top 10 IP の集計
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
16 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (4) 特定の時間帯においてアクセス頻度が最も高い Top IP の集計
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:10:00"{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
4 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (5) アクセス頻度が 10 回を超える高頻度クライアント IP の集計
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){if(ips[i] > 10){print i, "访问次数:", ips[i]}}}' /var/log/nginx/access.log
11.0.1.1 访问次数: 16
```

#### (6) アクセス数が最も多い Top 10 ページ（$request Top 10）の集計
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{urls[$7]++} END{for(u in urls){print urls[u], u}}' /var/log/nginx/access.log | sort -rn | head -n 10
2 /index.html
1 /test.png
1 /login
1 /doc
1 /api/v1
1 /app.js
1 /about.html
```

#### (7) 各 URL アクセスによって消費された総トラフィック帯域幅の集計（$body_bytes_sent の累計）
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{req[$7]++; size[$7]+=$10} END{for(u in req){print req[u], u, size[u]" Bytes"}}' /var/log/nginx/access.log | sort -rn | head -n 10
2 /index.html 2048 Bytes
1 /test.png 2048 Bytes
1 /login 512 Bytes
1 /doc 4096 Bytes
1 /api/v1 128 Bytes
1 /app.js 0 Bytes
1 /about.html 1024 Bytes
```

#### (8) 各 IP リクエストにおける HTTP ステータスコード分布の集計
```bash
[root@dawn ~]# awk '{ip_code[$1" "$9]++} END{for(ic in ip_code){print ip_code[ic], ic}}' /var/log/nginx/access.log | sort -rn | head -n 10
15 11.0.1.1 200
2 192.168.1.10 200
1 192.168.1.10 404
1 11.0.1.3 500
1 11.0.1.2 404
1 11.0.1.1 304
```

#### (9) 404 ステータスコードの発生回数の集計
```bash
[root@dawn ~]# awk '$9 == "404"{count++} END{print "404 错误总数:", count}' /var/log/nginx/access.log
404 错误总数: 1
```

#### (10) 特定時間帯における 404 異常リクエストの集計
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00" && $9 == "404"{count++} END{print "该时段404数:", count}' /var/log/nginx/access.log
该时段404数: 1
```

#### (11) サイト全体の HTTP ステータスコード分布総合集計
```bash
[root@dawn ~]# awk '{code[$9]++} END{for(s in code){print "状态码 " s ":", code[s] " 次"}}' /var/log/nginx/access.log
状态码 200: 17 次
状态码 304: 1 次
状态码 404: 1 次
状态码 500: 1 次
```
