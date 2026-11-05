---
title: "Shell スクリプト実践（三）：ループ制御・関数化・expect 対話自動化と配列集計"
date: 2026-11-05T14:57:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Shell における for / while ループ走査とバックグラウンド並列処理による高速スキャンを徹底解説。break / continue / exit によるフロー制御、モジュール化された関数設計、expect による対話型 SSH 鍵自動配布の実装、さらに通常配列と連想配列を活用した集計・出現頻度分析・重複防止抽選アルゴリズムまで網羅します。"
---

# Shell スクリプト実践（三）：ループ制御・関数化・expect 対話自動化と配列集計

---

## 一、for ループとバッチ運用管理実践

`for` ループは、ループ回数が既知である場合や固定リストの要素を順次処理するシナリオに適しています。

### 1. for ループの構文構造
```bash
for 变量名 in 取值列表; do
    循环动作指令集合
done
```
リストの値は**スペースまたは改行**で区切られ、数値、文字列、Shell シーケンス、コマンド置換、ファイル内容などが利用可能です。

### 2. さまざまな走査方式
#### (1) シーケンスと数値の走査
```bash
[root@zabbix ~]# for i in {1..3}; do echo "第 $i 次循环"; done
第 1 次循环
第 2 次循环
第 3 次循环
```

#### (2) コマンド実行結果の走査（バッククォートまたは `$()` を使用）
```bash
[root@zabbix ~]# for host in $(cat /etc/hosts | awk '{print $1}'); do
    echo "Host IP: $host"
done
```

---

### 3. 実践例 1：システムユーザーの一括作成と管理
`zabbix` 上で `dawn1` 〜 `dawn5` のユーザーを自動一括作成：
```bash
[root@zabbix ~]# cat << 'EOF' > /root/batch_user.sh
#!/bin/bash
for i in {1..5}; do
    user="dawn$i"
    id $user &>/dev/null
    if [ $? -ne 0 ]; then
        useradd $user
        echo "123456" | passwd --stdin $user &>/dev/null
        echo "用户 $user 创建成功"
    else
        echo "用户 $user 已存在，跳过创建"
    fi
done
EOF
[root@zabbix ~]# chmod +x /root/batch_user.sh
[root@zabbix ~]# /root/batch_user.sh
用户 dawn1 创建成功
用户 dawn2 创建成功
用户 dawn3 创建成功
用户 dawn4 创建成功
用户 dawn5 创建成功
```

---

### 4. 実践例 2：LAN 内マルチプロセス高並行死活監視
Bash のバックグラウンド子プロセス `&` と `wait` を組み合わせ、サブ秒単位で LAN 内の IP 疎通確認を実行：
```bash
[root@zabbix ~]# cat << 'EOF' > /root/fast_ping.sh
#!/bin/bash
NET="11.0.1"
echo "开始扫描 $NET.0/24 网段存活主机..."
for i in $(seq 1 100); do
    {
        ip="$NET.$i"
        ping -c 1 -W 1 "$ip" &>/dev/null
        if [ $? -eq 0 ]; then
            echo "[ ONLINE ] 主机 $ip 存活"
        fi
    } &
done
wait
echo "扫描完毕！"
EOF
[root@zabbix ~]# chmod +x /root/fast_ping.sh
```

---

## 二、while ループと制御フローの遷移

`while` ループは条件が真である間継続して実行され、条件を満たすまでのポーリングや 1 行ずつのデータ読み込みに適しています。

### 1. while 構文構造と条件ループ
```bash
while [ 条件表达式 ]; do
    执行指令集合
done
```

1 から 100 までの累積加算：
```bash
[root@zabbix ~]# i=1; sum=0
[root@zabbix ~]# while [ $i -le 100 ]; do
    let sum+=i
    let i++
done
[root@zabbix ~]# echo "1到100累加和: $sum"
1到100累加和: 5050
```

---

### 2. 実践例：while によるファイルの行単位読み込み
標準構文：`while read line; do ... done < ファイル`：
```bash
[root@zabbix ~]# cat << 'EOF' > /root/batch_add_from_file.sh
#!/bin/bash
# 格式：用户名 密码
cat << 'DATA' > /tmp/users.txt
dawn_ops 123456
dawn_dev 654321
DATA

while read username password; do
    id "$username" &>/dev/null
    if [ $? -ne 0 ]; then
        useradd "$username"
        echo "$password" | passwd --stdin "$username" &>/dev/null
        echo "用户 $username 添加成功"
    fi
done < /tmp/users.txt
EOF
[root@zabbix ~]# chmod +x /root/batch_add_from_file.sh
```

---

### 3. break、continue、exit によるフロー制御
- `exit [code]`：スクリプト全体を**直ちに終了**し、終了ステータスコード（0〜255）を返します。
- `break`：現在のループ全体から**直ちに抜け出し**、ループ外の以降の処理を継続します。
- `continue`：現在の回の処理を**直ちに中断**し、次のループの条件判定へスキップします。

比較デモ：
```bash
# break の例：3 に遭遇すると以降のループを中断
[root@zabbix ~]# for i in {1..5}; do
    [ $i -eq 3 ] && break
    echo $i
done
1
2

# continue の例：3 の回をスキップして後続の要素へ継続
[root@zabbix ~]# for i in {1..5}; do
    [ $i -eq 3 ] && continue
    echo $i
done
1
2
4
5
```

---

## 三、Shell 関数のカプセル化とモジュール設計

関数（Function）は再利用可能なコードブロックであり、大規模スクリプトのモジュール化設計に不可欠です。

### 1. 関数宣言構文
3 つの宣言方法（方法 1 が最も標準的で推奨）：
```bash
# 方法 1
func_name() {
    指令集合
}

# 方法 2
function func_name() {
    指令集合
}

# 方法 3
function func_name {
    指令集合
}
```

### 2. 関数の引数とローカル変数スコープ
- **関数内部の `$1`, `$2`**：その関数に渡された第 1、第 2 引数を表し、スクリプト外部の位置引数とは**異なります**。
- **ローカル変数 `local`**：関数内で `local 変数名=値` と宣言することで、変数のスコープを関数の実行中に限定し、グローバル名前空間の汚染を防ぎます。

```bash
[root@zabbix ~]# cat << 'EOF' > /root/fun_test.sh
#!/bin/bash
test_scope() {
    local name="local_dawn"
    echo "函数内部 name: $name"
}
name="global_dawn"
test_scope
echo "函数外部 name: $name"
EOF
[root@zabbix ~]# sh /root/fun_test.sh
函数内部 name: local_dawn
函数外部 name: global_dawn
```

---

### 3. 関数の戻り値（return vs echo）
- `return [0-255]`：呼び出し元に**終了ステータスコード**を返すために使用され、`$?` で取得します。
- `echo`：呼び出し元に**データや計算結果**を出力するために使用され、コマンド置換 `var=$(func)` で取得します。

```bash
[root@zabbix ~]# cat << 'EOF' > /root/calc.sh
#!/bin/bash
add() {
    echo $[$1 + $2]
}
result=$(add 50 70)
echo "计算结果为: $result"
EOF
[root@zabbix ~]# sh /root/calc.sh
计算结果为: 120
```

---

### 4. 実践例：サービスおよび URL 死活監視関数のモジュール化 `fun.sh`
`zabbix` 上で作成：
```bash
[root@zabbix ~]# cat /root/fun.sh
#!/bin/bash
check_url() {
    curl -I -s -m 3 -o /dev/null "$1"
    if [ $? -eq 0 ]; then
        echo "$1 is OK"
    else
        echo "$1 is DOWN"
    fi
}
check_url www.baidu.com
[root@zabbix ~]# /root/fun.sh
www.baidu.com is OK
```

---

## 四、expect による対話自動化と SSH 鍵配布

パスワードなしログインが設定されていない環境において、`expect` は疑似端末（PTY）を利用して対話型ツール（`ssh`、`passwd`、`sftp` など）との自動データ送受信を実現します。

### 1. expect の主要コマンド
| コマンド | 説明 |
| :--- | :--- |
| `spawn` | 新しいプロセスを起動し、その入出力を expect が捕捉・管理 |
| `expect "string"` | 出力を監視し、指定された文字列（正規表現対応）の出現を待機 |
| `send "data\r"` | キーボード入力をシミュレート（`\r` は Enter キー） |
| `interact` | セッションの制御をユーザーキーボードに引き渡し、手動操作を可能にする |
| `expect eof` | 対象プロセスの終了と EOF シグナルの発生を待機 |
| `set timeout n` | マッチ待機タイムアウト秒数を設定（`-1` は無制限） |

---

### 2. 実践例：SSH 公開鍵の自動一括配布
`sshpass` と `expect` を組み合わせてクラスター内の各サーバーへ鍵を自動配布：
```bash
[root@zabbix ~]# cat << 'EOF' > /root/distribute_key.sh
#!/bin/bash
# 1. 本地生成密钥对
[ ! -f ~/.ssh/id_rsa ] && ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa

# 2. 目标集群主机列表
CLUSTER_IPS="11.0.1.7 11.0.1.71 101.133.147.148"
PASSWORD="000000"

for ip in $CLUSTER_IPS; do
    echo "正在向 $ip 分发公钥..."
    /usr/bin/expect <<-EOF
        set timeout 5
        spawn ssh-copy-id -o StrictHostKeyChecking=no root@$ip
        expect {
            "yes/no" { send "yes\r"; exp_continue }
            "password:" { send "$PASSWORD\r" }
        }
        expect eof
EOF
done
EOF
[root@zabbix ~]# chmod +x /root/distribute_key.sh
```

---

## 五、Shell 配列と高度なデータ集計

Bash は 2 種類の配列をサポートします：
1. **通常配列（Indexed Arrays）**：**整数インデックス**でアクセス（0 から開始）。
2. **連想配列（Associative Arrays）**：**文字列キー**でアクセス（Bash 4.0+、`declare -A` による明示的宣言が必須）。

### 1. 通常配列の基本操作
```bash
# 宣言と代入
[root@zabbix ~]# array=(11.0.1.7 11.0.1.71 101.133.147.148)

# 全要素および全インデックスの取得
[root@zabbix ~]# echo "所有元素: ${array[@]}"
所有元素: 11.0.1.7 11.0.1.71 101.133.147.148
[root@zabbix ~]# echo "所有下标: ${!array[@]}"
所有下标: 0 1 2

# 配列の長さ（要素数）の取得
[root@zabbix ~]# echo "数组长度: ${#array[@]}"
数组长度: 3
```

---

### 2. 連想配列と頻度集計モデル
連想配列は Shell でグループ集計や出現頻度カウントを行うための最も強力なツールです。

集計のコアロジック：
```bash
declare -A count_dict
let count_dict[元素名]++
```

#### 実践例 1：テキスト内の性別分布集計
`dawn` ホスト上の `/root/sex.txt` を分類集計：
```bash
[root@dawn ~]# cat /root/sex.txt
male
female
male
male
female

[root@dawn ~]# cat << 'EOF' > /root/count_sex.sh
#!/bin/bash
declare -A sex_stat
while read line; do
    [ -z "$line" ] && continue
    let sex_stat["$line"]++
done < /root/sex.txt

echo "=== 性别统计结果 ==="
for k in "${!sex_stat[@]}"; do
    echo "$k: ${sex_stat[$k]} 次"
done
EOF
[root@dawn ~]# chmod +x /root/count_sex.sh
[root@dawn ~]# /root/count_sex.sh
=== 性别统计结果 ===
female: 2 次
male: 3 次
```

---

#### 実践例 2：Nginx アクセスログ内のクライアント IP 出現頻度集計
連想配列を用いて `/var/log/nginx/access.log` からユニーク IP ごとのアクセス数を集計：
```bash
[root@dawn ~]# cat << 'EOF' > /root/count_nginx_ip.sh
#!/bin/bash
declare -A ip_counts
while read line; do
    ip=$(echo "$line" | awk '{print $1}')
    [ -n "$ip" ] && let ip_counts["$ip"]++
done < /var/log/nginx/access.log

echo "=== Nginx 访问 IP 频次统计 ==="
for ip in "${!ip_counts[@]}"; do
    printf "%-18s 访问次数: %d\n" "$ip" "${ip_counts[$ip]}"
done
EOF
[root@dawn ~]# chmod +x /root/count_nginx_ip.sh
[root@dawn ~]# /root/count_nginx_ip.sh
=== Nginx 访问 IP 频次统计 ===
11.0.1.1           访问次数: 16
11.0.1.2           访问次数: 1
11.0.1.3           访问次数: 1
192.168.1.10       访问次数: 2
```

---

#### 実践例 3：自動抽選・重複防止くじ引きプログラム
`$RANDOM` と配列を組み合わせ、重複のないランダム割り当てモデルを構築：
```bash
[root@zabbix ~]# cat << 'EOF' > /root/lottery.sh
#!/bin/bash
> /tmp/lottery_record.txt
echo "=== 集群运维抽奖系统 (输入 'ok' 结束) ==="

while true; do
    read -p "请输入抽奖人姓名: " name
    [ "$name" == "ok" ] && break
    [ -z "$name" ] && continue

    while true; do
        num=$((RANDOM % 100 + 1))
        # 確保隨機數不重複
        if ! grep -qw "$num" /tmp/lottery_record.txt; then
            echo "$num" >> /tmp/lottery_record.txt
            echo "抽奖人: $name, 获得号码: $num"
            break
        fi
    done
done

echo "=== 抽奖排行榜 Top 3 ==="
sort -rnk2 /tmp/lottery_record.txt 2>/dev/null | head -n 3
EOF
[root@zabbix ~]# chmod +x /root/lottery.sh
```
