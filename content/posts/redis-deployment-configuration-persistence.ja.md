---
title: "Redis コア実践（1）：サービス構築・セキュリティ強化・永続化メカニズム"
date: 2026-11-06T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cache", "Persistence", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis コア実践シリーズ第1弾：Redis キャッシュサービスの位置づけと Memcached/Tair との全方位比較、Linux 環境でのソースコードビルド・インストール・環境変数・マルチインスタンス設計の実践、protected-mode 保護モードの仕組みと bind/requirepass セキュリティ強化、RDB スナップショットと AOF 追記ログの内部原理と選定比較を網羅解説。"
---

# Redis コア実践（1）：サービス構築・セキュリティ強化・永続化メカニズム

## 1.1 実践ホスト環境情報

| ホスト名 | 業務インターフェース IP | OS バージョン | カーネルバージョン | GCC / Make バージョン | Redis ビルドバージョン |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `master` | `11.0.1.101` | CentOS Linux 7.9.2009 (Core) | `3.10.0-1160.el7.x86_64` | GCC 4.8.5 / GNU Make 3.82 | `Redis 6.2.10` |

---

## 1.2 Redis キャッシュサービスの概要

### 1.2.1 キャッシュサービス概要解説

Redis は世界中で数百万の開発者に利用されているオープンソースのインメモリデータストアであり、データベース、キャッシュ、ストリーミングエンジン、メッセージブローカーとして広く活用されています。

- **コアな位置づけ**：Redis は完全にオープンソースであり、BSD ライセンスに準拠した高性能な Key-Value データベースです。
- **アーキテクチャ上の役割分担**：Redis サービスは NoSQL データベース製品ファミリーに属し、Web システムのアーキテクチャにおいて主にリレーショナルデータベース（RDBMS、例：MySQL）と連携して業務を支えます：
  - **リレーショナルデータベース（MySQL）**：コアビジネスデータの永続化ストレージと複雑なトランザクションクエリを担当しますが、データ量と同時アクセス数が急増すると、頻繁なディスク I/O がシステムのボトルネックとなります。
  - **非リレーショナルデータベース（Redis）**：高速キャッシュ層として機能し、メモリの極めて高速な読み書き性能を活かしてコアなホットデータをキャッシュします。データベースの読み取り負荷を軽減し、HTTP プロトコルのステートレス通信の課題（分散 Session / Token の集中共有など）を解決します。

```
MySQL のボトルネック：（ディスク I/O 性能の制約、データ量と並行処理急増による応答遅延）
  └── Redis との協調：（メモリベースの超高速データキャッシュとフェッチ、ミリ秒未満の応答）
```

---

### 1.2.2 主要キャッシュサービス製品の全次元比較

#### 1. コア製品特性比較表

| 比較項目 | Memcached | Redis | Tair |
| :--- | :--- | :--- | :--- |
| **永続化ストレージ** | 非対応（純粋なインメモリ、停止時消失） | **ネイティブ対応（RDB スナップショット + AOF コマンドログ）** | 対応（ddb / rdb / ldb ストレージエンジン対応） |
| **サポートデータ型** | 単一文字列 Key-Value | **極めて多彩（String, Hash, List, Set, ZSet など）** | 一般的なデータ型およびカスタムデータ構造 |
| **スレッドと並行モデル** | ネイティブマルチコア・マルチスレッド、小容量データ読み書きが高速 | **コアコマンドはシングルスレッド（ロック不要・コンテキストスイッチなし）、I/O 多重化** | マルチスレッドアーキテクチャ、単体読み書き速度は比較的安定 |
| **高可用性（HA）** | ネイティブ非対応、クライアント側の一貫性ハッシュが必要 | **Master-Slave 主従レプリケーションおよび Sentinel（監視役）をネイティブ対応** | ネイティブ高可用性と自動フェイルオーバー機構 |
| **分散クラスタ** | クライアント側シャーディング | **ネイティブ Redis Cluster（16384 ハッシュスロット分割）** | ネイティブ分散アーキテクチャ（アリババの大規模事業を支える） |
| **スケールアウト難度** | 拡張の複雑度が高い | **オンライン Resharding（動的スロット無停止移行）対応** | 動的な水平スケーリング対応 |

> **読み書き性能の比較総括**：
>
> - **Memcached**：マルチコアアーキテクチャであり、**多数のユーザーが同時にアクセスし、各ユーザーのデータ読み書き量が少ない**シナリオにより適しています；
> - **Redis**：シングルコアの処理能力が非常に高く（単体 500〜数万 QPS）、**高頻度な読み書き、多彩なデータ構造、永続化の保証が必要**なホットデータシナリオに適しています。本番環境では通常**単一マシン複数インスタンス + 分散クラスタ**構成を採用します。

---

## 1.3 Redis サービスのインストールとデプロイ

- **公式サイトダウンロードページ**：https://redis.io/downloads/

### ステップ 1：キャッシュサービスのダウンロードと展開

```bash
[root@master ~]# cd /usr/local/
[root@master local]# wget https://download.redis.io/releases/redis-6.2.10.tar.gz

[root@master local]# ls -l redis-6.2.10.tar.gz
-rw-r--r-- 1 root root 2490833 Jan 17  2023 redis-6.2.10.tar.gz

[root@master local]# tar xf redis-6.2.10.tar.gz
[root@master local]# ln -s redis-6.2.10 redis
[root@master local]# ls -ld redis
lrwxrwxrwx 1 root root 12 Nov  6 15:05 redis -> redis-6.2.10
# Redis を配備する仮想マシンのメモリは 4GB 以上を推奨、キャッシュと fork プロセス用の領域を確保
```

### ステップ 2：依存関係の導入とソースコードのコンパイル

```bash
[root@master local]# yum install -y gcc automake autoconf libtool make
[root@master local]# cd /usr/local/redis
[root@master redis]# make
```
コンパイル完了後、`src/` 配下に `redis-server`、`redis-cli`、`redis-sentinel` などの実行可能バイナリが生成されます。

### ステップ 3：グローバル環境変数の設定

```bash
[root@master redis]# vim /etc/profile
# ファイル末尾に Redis コマンドパスを追加：
export PATH=/usr/local/redis/src:$PATH

[root@master redis]# source /etc/profile
[root@master redis]# which redis-server redis-cli
/usr/local/redis/src/redis-server
/usr/local/redis/src/redis-cli
```

### ステップ 4：初期起動の検証と疎通テスト

```bash
# Redis デフォルトサービスインスタンスをバックグラウンド起動
[root@master redis]# redis-server &
[root@master redis]# netstat -lntup | grep redis
tcp        0      0 0.0.0.0:6379            0.0.0.0:*               LISTEN      5925/redis-server * 
tcp6       0      0 :::6379                 :::*                    LISTEN      5925/redis-server * 

# クライアントに接続して基本的な読み書きテストを実施
[root@master redis]# redis-cli
127.0.0.1:6379> set a dawn
OK
127.0.0.1:6379> get a
"dawn"
127.0.0.1:6379> quit

# 現在のフォアグラウンドテストサービスをクリーンにシャットダウン
[root@master redis]# redis-cli shutdown
```

---

## 1.4 Redis サービスの基本管理とマルチインスタンス標準設計

本番環境ではデフォルト設定での直接起動を行わず、単一サーバー上でのマルチインスタンス管理とリソース分離を容易にするため、標準化された専用データディレクトリと設定ファイルを整備します。

### 1.4.1 設定ファイルの設計と作成

```bash
[root@master ~]# mkdir -p /data/6379
[root@master ~]# cat >/data/6379/redis.conf <<EOF
daemonize yes
-- サービスプロセスをバックグラウンド（デーモン）として動作させる定義
port 6379
-- サービスのデフォルトリスニングポートの定義
logfile /data/6379/redis.log
-- サービスのログファイル出力先の定義
dir /data/6379
-- 永続化ファイルが保存されるデータディレクトリの定義
dbfilename dump.rdb
-- 永続化データスナップショットのファイル名の定義
EOF

# クリーンな設定ファイル内容：
cat >/data/6379/redis.conf <<EOF
daemonize yes
port 6379
logfile /data/6379/redis.log
dir /data/6379
dbfilename dump.rdb
EOF
```

### 1.4.2 指定した設定ファイルによる起動と検証

```bash
[root@master ~]# redis-server /data/6379/redis.conf
[root@master ~]# netstat -lntup | grep redis
tcp        0      0 0.0.0.0:6379            0.0.0.0:*               LISTEN      5949/redis-server * 
tcp6       0      0 :::6379                 :::*                    LISTEN      5949/redis-server * 

[root@master ~]# redis-cli
127.0.0.1:6379> set name xiaoQ
OK
127.0.0.1:6379> get name
"xiaoQ"
127.0.0.1:6379> quit
```

---

## 1.5 キャッシュサービスのセキュリティ設定と protected-mode（保護モード）の仕組み

### 1.5.1 protected-mode 保護モードの発動原理

Redis はデフォルトでセキュリティ保護モード（`protected-mode yes`）が有効化されており、初期状態ではバインド IP も認証パスワードも設定されていません。この状態で LAN 経由のリモート IP（例：`11.0.1.101`）から接続を試みると、Redis はすべての書き込み処理を拒否します：

```bash
# 実際のマシン IP を経由してリモートクライアントからのデータ書き込みをシミュレート：
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 set a 1
(error) DENIED Redis is running in protected mode because protected mode is enabled, no bind address was specified, no authentication password is requested to clients. In this mode connections are only accepted from the loopback interface. If you want to connect from external computers to Redis you may adopt one of the following solutions: 
1) Just disable protected mode sending the command 'CONFIG SET protected-mode no' from the loopback interface by connecting to Redis from the same host the server is running, however MAKE SURE Redis is not publicly accessible from internet if you do so. Use CONFIG REWRITE to make this change permanent. 
2) Alternatively you can just disable the protected mode by editing the Redis configuration file, and setting the protected mode option to 'no', and then restarting the server. 
3) If you started the server manually just for testing, restart it with the '--protected-mode no' option. 
4) Setup a bind address or an authentication password. NOTE: You only need to do one of the above things in order for the server to start accepting connections from the outside.
```

### 1.5.2 本番レベルのセキュリティ強化実践（bind + requirepass）

本番環境で protected-mode を安易に無効化することは厳禁です。標準的なアプローチは、**リスニング対象のネットワークインターフェースを明確にバインド**し、**強固なパスワードを設定**することです：

```bash
[root@master ~]# vim /data/6379/redis.conf
# 以下の2つのコアセキュリティ設定を追加：
bind 11.0.1.101 127.0.0.1
-- 業務通信アドレスおよびローカルループバックアドレスをリスニング

requirepass 123456
-- リモート接続用の認証パスワードを設定
```

サービスを再起動してセキュリティ設定を反映：
```bash
[root@master ~]# redis-cli shutdown
[root@master ~]# redis-server /data/6379/redis.conf
```

### 1.5.3 パスワード認証とログイン操作

パスワード設定後は、未認証の接続は操作が直接拒否されます：
```bash
[root@master ~]# redis-cli
127.0.0.1:6379> set a 1
(error) NOAUTH Authentication required.

# 方法 1：接続確立後に対話型環境で auth コマンドを実行して認証
127.0.0.1:6379> auth 123456
OK
127.0.0.1:6379> set a 1
OK
127.0.0.1:6379> get a
"1"

# 方法 2：接続時に直接 -a オプションでパスワードを渡す（本番スクリプト等で常用）
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
11.0.1.101:6379> get a
"1"
```

---

## 1.6 オンラインでの設定確認と動的変更（CONFIG GET / SET）

Redis は稼働中の設定パラメータの動的参照および無停止でのオンライン変更をサポートしており、再起動によるキャッシュスタンピード（キャッシュ障害）を防止できます：

```bash
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.

# 1. 全設定パラメータの一覧表示（MySQL の show variables; に類似、バージョン 6.2 では 148 項目以上存在）
11.0.1.101:6379> CONFIG GET *
... 一部出力を省略 ...

# 2. 指定パラメータの確認
11.0.1.101:6379> CONFIG GET requirepass
1) "requirepass"
2) "123456"

# 3. オンラインでの動的パスワード変更（再起動不要で即時反映）
11.0.1.101:6379> CONFIG SET requirepass 123
OK
11.0.1.101:6379> CONFIG GET requirepass
1) "requirepass"
2) "123"

# 4. 旧パスワードの無効化を確認
11.0.1.101:6379> quit
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
AUTH failed: WRONGPASS invalid username-password pair or user is disabled.

# 5. 新パスワードの認証成功を確認
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123
11.0.1.101:6379> ping
PONG
```

`CONFIG SET` は現在のメモリ上でのみ有効です。ディスク上の設定ファイルへ恒久的に反映させたい場合は、`CONFIG REWRITE` コマンドを実行してメモリ上の設定内容を `/data/6379/redis.conf` に自動書き戻し保存します。

---

## 1.7 キャッシュサービスのデータ永続化（RDB と AOF）

ノードの予期せぬ停電や異常クラッシュによるメモリデータ消失を防ぐため、Redis は **RDB バイナリスナップショット** と **AOF 追記ログ** の2種類の永続化メカニズムを提供しています。

### 1.7.1 方式 1：RDB（Redis DataBase）スナップショット永続化

- **動作原理**：指定した時間間隔で、メモリ上のデータセットの特定時点のバイナリスナップショット（Point-In-Time Snapshot）を生成します。
- **メリット**：バイナリ構造が非常にコンパクトでファイルサイズが小さく、リストア時の読み込み速度が極めて高速なため、フルコールドバックアップやディザスタリカバリに最適です。また、主従レプリケーションのフル同期も RDB に依存しています。
- **デメリット**：スナップショットは定期実行されるため、クラッシュ発生時に前回のスナップショットから障害発生時点までの変更データが失われます。

#### 1. RDB 永続化の手動トリガー
```bash
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123

# 同期保存（スナップショット生成完了までメインプロセスをブロックするため、本番環境では要注意）：
11.0.1.101:6379> save
OK

# バックグラウンド非同期保存（子プロセスを fork して書き込みを行い、メインスレッドをブロックしない）：
11.0.1.101:6379> bgsave
Background saving started
11.0.1.101:6379> quit

# データディレクトリ内に生成された dump.rdb を確認：
[root@master ~]# ls -l /data/6379/
total 20
-rw-r--r-- 1 root root  115 Nov  6 15:07 dump.rdb
-rw-r--r-- 1 root root  170 Nov  6 15:07 redis.conf
-rw-r--r-- 1 root root 4838 Nov  6 15:07 redis.log
```

#### 2. RDB 永続化の自動トリガー設定
`/data/6379/redis.conf` を編集：
```conf
dir /data/6379
dbfilename dump.rdb

# 以下のルールのいずれかを満たした場合に bgsave を自動実行：
save 900 1
-- 900秒（15分）以内に少なくとも 1 つのキーが変更された場合
save 300 10
-- 300秒（5分）以内に少なくとも 10 個のキーが変更された場合
save 60 10000
-- 60秒以内に少なくとも 10000 個のキーが変更された場合
```

コマンドラインで現在有効なスナップショットポリシーを確認：
```redis
11.0.1.101:6379> config get save
1) "save"
2) "3600 1 300 100 60 10000"
```

---

### 1.7.2 方式 2：AOF（Append Only File）追記ログ永続化

- **動作原理**：サーバーが受信したすべての書き込みコマンドをテキスト追記形式で記録し、サーバー再起動時にコマンドを順次再実行（リプレイ）することでメモリデータを復元します。
- **メリット**：秒単位でのディスク同期をサポートし、データの安全性を極限まで高めます。
- **デメリット**：すべての書き込みコマンドを記録するため、AOF ファイルは RDB に比べてサイズが肥大化し、復元リプレイ速度も比較的遅くなります。

#### AOF コア設定パラメータ（3つの同期ポリシー）：
`/data/6379/redis.conf` を編集：
```conf
dir /data/6379
dbfilename dump.rdb
appendonly yes
-- AOF ログ永続化機能を有効化

# ディスク同期ポリシーの選定：
# appendfsync always
-- 各書き込みコマンド完了後に即時 AOF へ同期フラッシュ。最も安全だが書き込み性能が最も低下

appendfsync everysec
-- バックグラウンドスレッドにより毎秒非同期フラッシュ。データ保全性と高速な書き込み性能を両立（本番運用の標準推奨）

# appendfsync no
-- フラッシュ処理を完全に OS バッファに委任（通常 30 秒周期）。最高性能だが電源断時のデータ喪失リスクあり
```

---

### 1.7.3 RDB と AOF の本質的な違い

> 1. **データ記録方式の違い**：RDB は特定時点のメモリデータの**バイナリ完全スナップショット**です。一方 AOF は書き込みコマンドを継続的に記録する**テキスト追記型論理ログ**です（MySQL の Binlog に相当）。
> 2. **データ保全性の違い**：RDB はスナップショット実行間隔によるデータ欠損リスクが存在します。一方 AOF（`everysec` ポリシー）では最大でも直近 1 秒間のデータ喪失にとどまり、保全性が高くなります。
> 3. **ファイルサイズとリカバリ性能**：RDB はバイナリ圧縮率が高くファイルサイズが小さいため、障害復旧時にそのままメモリ展開でき高速です。AOF はファイルが比較的大きく、コマンドを逐行リプレイする必要があるため復旧速度は RDB より遅くなります。
> 4. **本番環境のベストプラクティス**：企業環境では通常 **RDB と AOF を併用**します。AOF でデータ整合性を担保し（Redis 再起動時は AOF を優先読み込み）、RDB は定期的にアーカイブ・遠隔バックアップノードへ転送してコールドバックアップ・広域災害対策に活用します。
