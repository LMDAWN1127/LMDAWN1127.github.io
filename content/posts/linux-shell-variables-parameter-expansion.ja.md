---
title: "Shell スクリプト実践（一）：開発規範・変数分類と文字列スライス・置換"
date: 2026-11-05T14:30:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "エンタープライズレベルの Shell スクリプト作成規約と実行メカニズムを体系的に整理。グローバル環境変数、ローカル変数、特殊位置パラメータ（$0〜$9、$#、$*、$@、$?）を徹底解説し、Bash ネイティブの文字列スライス、長さ計測、最長・最短パターン削除、文字列置換などの高度なパラメータ展開手法を網羅します。"
---

# Shell スクリプト実践（一）：開発規範・変数分類と文字列スライス・置換

---

## 一、Shell とスクリプト開発規約

### 1. Shell と Shell スクリプトとは
- **Shell**：コマンドインタプリタ。ユーザーがターミナルに入力したコマンドを受け取って解釈し、OS カーネル（Kernel）に渡してハードウェア処理を実行させ、その結果をターミナルに返却します。
  - **対話型 Shell**：ユーザーがターミナルでコマンドを 1 行入力すると、即座に実行されて結果が返されます。
  - **非対話型 Shell**：スクリプトファイルやパイプから一括してコマンドを連続読み込み、人の介入なしに実行します。
- **Shell スクリプト（Script）**：一連の Linux コマンド、制御構文（条件分岐、ループ）、関数などを業務ロジックに従ってテキストファイルにまとめ、インタプリタによって実行されるプログラムファイルです。

Linux のデフォルトインタプリタは Bash です：
```bash
[root@dawn ~]# echo $SHELL
/bin/bash
```

### 2. エンタープライズ向け Shell スクリプトコーディング規約
1. **拡張子の統一**：スクリプトファイル名は必ず `.sh` で終わるようにし、目的が明確にわかる命名にします（例：`check_disk.sh`）。
2. **インタプリタの明記**：スクリプトの先頭行には Shebang（`#!/bin/bash`）を必ず記述します。
3. **メタ情報のコメント**：スクリプト先頭に作成者、作成日時、機能概要、バージョン情報を記述します。
4. **適切なコメント記述**：重要なロジック、複雑な正規表現、主要関数には明確なコメントを付与します。
5. **半角英数記号の使用**：クォート（`""`, `''`）、バッククォート、括弧（`[]`, `[[]]`, `{}`, `()`）、セミコロン、コロンはすべて半角英数文字を使用します。
6. **ペア記号の即時入力**：括弧や引用符などのペア記号は同時に閉じ、構文エラーを防ぎます。

### 3. 初めてのスクリプト作成と 3 つの実行方法
`web01`（`11.0.1.7`）ホストの `/server/scripts/dawn01` ディレクトリに `test.sh` を作成します：
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/test.sh
#!/bin/bash
echo "hehe"
EOF
```

#### 実行方法 1：インタプリタによる直接実行（実行権限不要）
```bash
[root@web01 dawn01]# sh /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# bash /server/scripts/dawn01/test.sh
hehe
```

#### 実行方法 2：パス指定による直接実行（+x 実行権限の付与が必須）
```bash
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/test.sh
[root@web01 dawn01]# /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# ./test.sh
hehe
```

#### 実行方法 3：source またはドット . による実行（現在の親 Shell に読み込み）
```bash
[root@web01 dawn01]# . /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# source /server/scripts/dawn01/test.sh
hehe
```

> **中核メカニズムの違い**：
>
> - 方法 1 と方法 2 は**サブシェル（Subshell）**内で実行されます。スクリプト内の変数はスクリプト終了時に破棄され、現在の端末環境には影響しません。
> - 方法 3（`source` または `.`）は**現在の親 Shell** 内で直接実行されます。スクリプト内で定義された変数や環境変更は、そのまま現在の端末環境に残ります。

---

## 二、Shell 変数の分類と定義規約

### 1. 変数の概念と分類
固定の識別子を用いて動的または不特定な値を表したものが変数です。
- **グローバル変数（環境変数）**：システム組み込み、または `export` でエクスポートされた変数。現在の親 Shell およびそこから派生するすべてのサブシェルで有効です。
- **ローカル変数（通常変数）**：ユーザー定義変数。定義された現在の Shell セッションまたはスクリプト内部のみで有効です。

### 2. 変数のライフサイクルと設定ファイル
- **一時変数**：ターミナルで直接 `name=dawn` や `export name=dawn` と宣言したもので、接続切断時に破棄されます。
- **永続変数**：システムまたはユーザーの設定ファイルに記述します：
  - `/etc/profile`：全ユーザーのログイン時に読み込まれます（最も一般的）
  - `~/.bash_profile`：現在のユーザーのログイン時に読み込まれます
  - `~/.bashrc`：現在のユーザーが新しい Bash インスタンスを起動した時に読み込まれます
  - `/etc/bashrc`：非ログイン Shell 起動時に全システム共通で読み込まれます

### 3. 変数命名規則と代入タイプ
#### (1) 命名規約
英字、数字、アンダースコアで構成し、**数字から始めることはできません**。等号 `=` の両側に**空白を入れてはいけません**。環境変数は全大文字（例：`NGINX_PORT`）、通常変数は小文字やスネークケース（例：`user_age`）を推奨します。

#### (2) 文字列代入（シングルクォート vs ダブルクォート）
- **シングルクォート `''`**：見たままの文字列となり、内部の特殊文字（`$` や `\` を含む）はすべて通常テキストとして扱われ、変数は展開されません。
- **ダブルクォート `""`**：弱い引用であり、内部の変数展開、コマンド置換、エスケープシーケンスが評価されます。
```bash
[root@web01 ~]# name="dawn"
[root@web01 ~]# test_single='name: $name'
[root@web01 ~]# echo $test_single
name: $name

[root@web01 ~]# test_double="name: $name"
[root@web01 ~]# echo $test_double
name: dawn
```

#### (3) 変数の結合と波括弧による境界分離
変数の直後に他の文字列を連結する場合、境界を明確にするために変数名を `{}` で囲む必要があります：
```bash
[root@web01 ~]# ip="11.0.1.7"
[root@web01 ~]# host="web01"
[root@web01 ~]# echo "$ip_$host"
web01
[root@web01 ~]# echo "${ip}_$host"
11.0.1.7_web01
```

#### (4) コマンド実行結果の代入（バッククォートと `$()`）
コマンドの標準出力を変数に格納する場合、`$()` の使用を推奨します：
```bash
[root@web01 ~]# count=$(cat /etc/passwd | wc -l)
[root@web01 ~]# echo $count
27

# 動的日時の取得
[root@web01 ~]# now_time=$(date +%F_%H-%M-%S)
[root@web01 ~]# echo $now_time
2026-11-04_12-40-00
```

---

## 三、Shell 位置パラメータと組み込み特殊変数

### 1. 主要位置パラメータ一覧
| 変数名 | 意味と機能 |
| :--- | :--- |
| `$0` | 現在実行中のスクリプト名を取得（パス付き実行の場合はパスを含む） |
| `$1` ~ `$9` | スクリプトに渡された第 1 〜第 9 引数を取得 |
| `${10}` ~ `${n}` | 第 10 引数以降を取得（波括弧 `{}` が必須） |
| `$#` | スクリプトに渡された引数の総数を取得 |
| `$*` | すべての位置引数を取得。ダブルクォート `"$*"` で囲むと全体を 1 つの文字列 `"$1 $2 ..."` として扱う |
| `$@` | すべての位置引数を取得。ダブルクォート `"$@"` で囲むと各引数を独立した文字列 `"$1" "$2" ...` として保持 |
| `$?` | 直前のコマンドの終了ステータスを取得（`0` は成功、非 `0` は失敗） |
| `$$` | 現在実行中の Shell スクリプトのプロセス PID を取得 |
| `$!` | 直前にバックグラウンドで実行されたプロセスの PID を取得 |
| `$_` | 直前のコマンドの最後の引数を取得 |

### 2. 位置パラメータの実践検証
`web01` 上で複数引数を出力するスクリプトを作成します：
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

### 3. `$*` と `$@` のクォート付きループ時における決定的な違い
```bash
[root@web01 dawn01]# set -- "I am" dawn 18

# "$*" は全体を 1 つの文字列としてループ処理
[root@web01 dawn01]# for i in "$*"; do echo "$i"; done
I am dawn 18

# "$@" は各引数を個別の要素として維持
[root@web01 dawn01]# for i in "$@"; do echo "$i"; done
I am
dawn
18
```

---

## 四、Shell 引数受け渡し方式の実践

運用の自動化において、外部データをスクリプトに渡す代表的な 3 つの方法があります：

### 1. コマンドラインからの直接引数渡し
自動化タスク、Crontab 定期実行、バックグラウンド処理に最適です：
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

### 2. 内部変数への再代入渡し
`$1`、`$2` を意味のある変数名に代入し、可読性と保守性を向上させます：
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

### 3. `read` による対話型入力渡し
対話型のセットアップウィザードに適しています（`-p` プロンプト、`-t` タイムアウト、`-s` パスワード非表示入力など）：
```bash
[root@web01 dawn02]# cat /server/scripts/dawn02/name.sh
#!/bin/bash
read -p "请输入你的姓名和年龄: " name age
echo "name=$name"
echo "age=$age"
```

---

## 五、高度な文字列処理：スライス・長さ取得・パターン削除と置換

Bash ネイティブの変数文字列展開構文を活用することで、外部コマンド（awk, sed, cut など）を起動せずに高速かつ効率的な文字列処理を実現できます。

### 1. 文字列スライス抽出 `${var:start:length}`
```bash
[root@web01 dawn02]# name="I am dawn"
[root@web01 dawn02]# echo ${name:2}      # インデックス 2 から末尾まで抽出
am dawn
[root@web01 dawn02]# echo ${name:2:2}    # インデックス 2 から 2 文字抽出
am
[root@web01 dawn02]# echo ${name:5:8}    # インデックス 5 から 8 文字抽出
dawn
```

### 2. 文字列の長さ計測
#### 方法 1：ネイティブ構文 `${#var}`（最高効率・推奨）
```bash
[root@web01 dawn02]# echo ${#name}
13
```

#### 方法 2：外部コマンドとの比較
```bash
[root@web01 dawn02]# echo -n "$name" | wc -c
13
[root@web01 dawn02]# expr length "$name"
13
[root@web01 dawn02]# echo "$name" | awk '{print length}'
13
```

---

### 3. パターンマッチによる削除（前方一致・後方一致）
- `${var#pattern}`：前方から検索し、**最短一致**を削除
- `${var##pattern}`：前方から検索し、**最長一致（貪欲）**を削除
- `${var%pattern}`：後方から検索し、**最短一致**を削除
- `${var%%pattern}`：後方から検索し、**最長一致（貪欲）**を削除

```bash
[root@web01 dawn02]# url="www.baidu.com"

# 前方からの削除
[root@web01 dawn02]# echo ${url#*.}     # 最初に見つかるドットまでを削除
baidu.com
[root@web01 dawn02]# echo ${url##*.}    # 最後に見つかるドットまでを最長削除
com

# 後方からの削除
[root@web01 dawn02]# echo ${url%.*}     # 最後のドット以降を削除
www.baidu
[root@web01 dawn02]# echo ${url%%.*}    # 最初のドット以降を最長削除
www

# 運用実践：ディスク使用率からパーセント記号を除去
[root@web01 dawn02]# disk_use=$(df -h | awk '/\/$/{print $(NF-1)}')
[root@web01 dawn02]# echo $disk_use
13%
[root@web01 dawn02]# echo ${disk_use%\%}
13
```

---

### 4. 文字列置換
- `${var/old/new}`：最初に一致した文字列のみを置換
- `${var//old/new}`：一致したすべての文字列をグローバル置換

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

### 5. 変数の初期値設定とフォールバック評価
| 式 | 変数に値があり空でない場合 | 変数が未定義または空の場合 |
| :--- | :--- | :--- |
| `${var:-word}` | `$var` の実際の値を返す | `word` を返すが、`$var` は**変更しない** |
| `${var:=word}` | `$var` の実際の値を返す | `word` を返し、**`$var` に `word` を代入する** |
| `${var:?word}` | `$var` の実際の値を返す | `word` を標準エラーに出力して**スクリプトを中断終了** |
| `${var:+word}` | `word` を返す | 空文字を返す（存在チェックに使用） |

検証例：
```bash
[root@web01 dawn02]# unset my_port
[root@web01 dawn02]# echo ${my_port:-8080}
8080
[root@web01 dawn02]# echo $my_port
# 元の変数は空のまま

[root@web01 dawn02]# echo ${my_port:=8080}
8080
[root@web01 dawn02]# echo $my_port
8080
# 元の変数にデフォルト値 8080 が正常に代入される
```
