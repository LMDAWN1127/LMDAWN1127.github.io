---
title: "Shell スクリプト実践（二）：数値演算・条件テストと case 制御フロー"
date: 2026-11-05T14:38:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux における 6 つの数値演算手法（expr、$(())、$[]、let、bc、awk）を徹底解説。test、[]、[[]] による条件判定と正規表現比較を体系的に整理し、if-elif によるディスク容量監視アラートや OS 判定を実装。さらに case 構文を活用した対話型メニュー、Nginx サービス管理、Jumpserver（踏み台サーバー）の設計まで網羅します。"
---

# Shell スクリプト実践（二）：数値演算・条件テストと case 制御フロー

---

## 一、Linux における 6 つの数値演算手法

Bash ではデフォルトですべての変数が文字列として扱われます。数値演算を行うには、専用の演算構文や外部ツールを使用する必要があります。

### 1. `expr` 整数演算とパラメータ妥当性検証
- `expr` は四則演算をサポートしますが、**演算子の両側にスペースが必要**です；
- 乗算記号 `*` は Shell のワイルドカードであるため、バックスラッシュで `\*` とエスケープする必要があります；
- 終了ステータス `$?` を利用して、入力値が整数であるかを検証する用途で多用されます。

```bash
[root@web01 dawn02]# expr 1 + 1
2
[root@web01 dawn02]# expr 10 \* 2
20
[root@web01 dawn02]# expr 10 / 2 \* 3 - 5
10

# 渡された引数が整数であるか検証
[root@web01 dawn02]# expr 1 + 10 &>/dev/null; echo $?
0
[root@web01 dawn02]# expr 1 + hehe &>/dev/null; echo $?
2
```

### 2. `$(( ))` 算術展開（最も一般的・最高パフォーマンス）
Bash ネイティブの構文です。内部の変数で `$` を省略でき、乗算のエスケープも不要で、演算子前後のスペースも任意です：
```bash
[root@web01 dawn02]# echo $((10 * 10 - 2 + 5))
103
[root@web01 dawn02]# a=10; b=20
[root@web01 dawn02]# echo $((a * b))
200
```

### 3. `$[ ]` 算術式
`$(( ))` と同様に、基本的な整数演算をサポートします：
```bash
[root@web01 dawn02]# echo $[10 * 10]
100
[root@web01 dawn02]# echo $[a + b]
30
```

### 4. `let` 演算とインクリメント・デクリメント
ループ内のカウンタや変数加算に最適で、構文がシンプルです：
```bash
[root@web01 dawn02]# let i++
[root@web01 dawn02]# echo $i
1
[root@web01 dawn02]# let i+=10
[root@web01 dawn02]# echo $i
11
```

**前置と後置インクリメントの違い**：
`let c=a++` は代入後に加算；`let d=++b` は加算後に代入。

### 5. `bc` 任意精度計算機（浮動小数点数対応）
パイプ経由で式を `bc` に渡すことで、小数計算や高精度スケール指定が可能です：
```bash
[root@web01 ~]# echo "10 + 10.5" | bc
20.5
[root@web01 ~]# echo "scale=2; 10 / 3" | bc
3.33
```

### 6. `awk` による数値計算
awk の `BEGIN` ブロックを利用して浮動小数点の計算を行います：
```bash
[root@web01 ~]# awk 'BEGIN{printf "%.2f\n", 10/3}'
3.33
```

---

### 実践例：2 つの引数による四則演算カリキュレータ `count.sh`
`web01`（`/server/scripts/dawn02/count.sh`）上で作成：
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

## 二、条件テスト式：test、[ ]、[[ ]]

条件テストは評価結果に基づき、終了ステータス `0`（真 / 成立）または非 `0`（偽 / 不成立）を返します。

### 1. ファイル状態テスト
| テスト引数 | 説明 |
| :--- | :--- |
| `-f file` | 通常ファイルであり、かつ存在するか判定 |
| `-d dir` | ディレクトリであり、かつ存在するか判定 |
| `-e path` | ファイルまたはディレクトリが存在するか判定 |
| `-r file` | 現在のユーザーに読み取り権限があるか判定 |
| `-w file` | 現在のユーザーに書き込み権限があるか判定 |
| `-x file` | 現在のユーザーに実行権限があるか判定 |
| `-s file` | ファイルが存在し、ファイルサイズが 0 バイト超であるか判定 |

```bash
[root@web01 ~]# [ -f /etc/hosts ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ -d /etc ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ ! -f /etc/not_exist ] && echo 成立
成立
```

### 2. 文字列の比較
| テスト式 | 説明 |
| :--- | :--- |
| `str1 = str2` または `==` | 2 つの文字列が等しいか判定 |
| `str1 != str2` | 2 つの文字列が等しくないか判定 |
| `-z str` | 文字列長が 0 か判定（空文字列の場合に真） |
| `-n str` | 文字列長が 0 でないか判定（空でない場合に真） |

```bash
[root@web01 dawn02]# [ "$SHELL" == "/bin/bash" ] && echo 成立
成立

# 変数が空であるか検証
[root@web01 dawn02]# unset my_var
[root@web01 dawn02]# [ -z "$my_var" ] && echo "变量为空"
变量为空
[root@web01 dawn02]# my_var="dawn"
[root@web01 dawn02]# [ -n "$my_var" ] && echo "变量非空: $my_var"
变量非空: dawn
```

### 3. 正規表現マッチング `[[ =~ ]]`
二重角括弧 `[[ ]]` を使用することで、拡張正規表現によるマッチングが可能です：
```bash
[root@web01 ~]# [[ root =~ ^r ]] && echo 成立
成立

# 引数が純粋な数字であるかを検証
[root@web01 ~]# age=25
[root@web01 ~]# [[ "$age" =~ ^[0-9]+$ ]] && echo "是纯数字" || echo "非法输入"
是纯数字
```

### 4. 数値関係の比較
単一角括弧 `[ ]` 内での数値比較には関係演算子を使用する必要があります：
- `-eq`（等しい）
- `-ne`（等しくない）
- `-gt`（より大きい）
- `-ge`（以上）
- `-lt`（より小さい）
- `-le`（以下）

```bash
[root@web01 dawn02]# [ 10 -gt 5 ] && echo 成立
成立
[root@web01 dawn02]# [ 10 -eq 10 -a 5 -lt 8 ] && echo "多条件满足"
多条件满足
```

---

## 三、if 条件分岐と点検アラート実践

### 1. if 文の構文構造
#### (1) 単一分岐構文
```bash
if [ 条件式 ]; then
    実行コマンド群
fi
```

#### (2) 2 分岐構文
```bash
if [ 条件式 ]; then
    コマンド群 A
else
    コマンド群 B
fi
```

#### (3) 多重分岐構文
```bash
if [ 条件式 1 ]; then
    コマンド群 1
elif [ 条件式 2 ]; then
    コマンド群 2
else
    デフォルトのフォールバックコマンド群
fi
```

---

### 2. 実践例 1：ディスク使用率監視アラートスクリプト `disk.sh`
`web01`（`11.0.1.7`）上でルートパーティションの使用率を監視：
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

### 3. 実践例 2：OS バージョン識別とリポジトリ自動切り替え `os.sh`
`zabbix`（`11.0.1.71`）上で動作環境を自動判別：
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

## 四、case 制御フローとサービス管理スクリプト

分岐数が多い場合、`case` 文はネストされた `if-elif` よりも可読性が高く効率的です。

### 1. case 構文構造
```bash
case "$変数" in
    パターン 1)
        実行コマンド 1
        ;;
    パターン 2|パターン 3)
        実行コマンド 2
        ;;
    *)
        マッチしない場合のデフォルトコマンド
        ;;
esac
```

---

### 2. 実践例 1：システムハードウェア情報対話型点検メニュー
```bash
[root@zabbix ~]# cat << 'EOF' > /root/sys_info.sh
#!/bin/bash
show_menu() {
    echo -e " \033[33m 1. 查看磁盘空间 \033[0m"
    echo -e " \033[33m 2. 查看内存占用 \033[0m"
    echo -e " \033[33m 3. 查看系统负载 \033[0m"
    echo -e " \033[33m 4. 查看在线用户 \033[0m"
    echo -e " \033[33m q. 退出程序 \033[0m"
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

### 3. 実践例 2：Nginx サービス制御スクリプト
本番環境で独自コンパイルされたサービスを標準的に管理：
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

### 4. 実践例 3：Jumpserver 踏み台サーバー設計
case 文と無限ループを用いて権限制御された運用踏み台サーバーを構築：
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
