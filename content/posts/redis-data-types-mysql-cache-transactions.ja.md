---
title: "Redis コア実践（2）：5大コアデータ型・MySQLホットデータキャッシュ・トランザクション特性"
date: 2026-11-06T14:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cache", "MySQL", "Transactions", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis コア実践シリーズ第2弾：キーのライフサイクル管理（keys/scan/expire/ttl）の体系的解説、Strings、Hash、List、Set、SortedSet の5大データ構造と高並行カウンタ、WeChatコメントタイムライン、友人関係トポロジー、TopNランキングの実践、Linux パイプラインを用いた MySQL 3308 マルチインスタンスのホットデータ行の Redis Hash 一括インポート、MySQL の厳格な ACID トランザクションと Redis の弱トランザクションの比較および WATCH 楽観的ロックの実践。"
---

# Redis コア実践（2）：5大コアデータ型・MySQLホットデータキャッシュ・トランザクション特性

## 2.1 データ型とストレージモデルの概要

リレーショナルデータベースでは、テーブル構造を定義しカラム型（`char`、`varchar`、`int`、`tinyint`）を明示的に宣言することで B+ ツリーインデックスのストレージを最適化します。一方 Redis では、データ型がメモリ内でのデータ格納構造とデータ検索・取得の計算量を直接決定します。

---

## 2.2 データ型の共通キー管理操作

Redis は、特定のデータ型に依存しない一連のグローバルキー管理コマンドを提供しています：

```bash
# 11.0.1.101 の Redis インスタンスに接続
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.

# 1. 既存の全キー名の一覧表示
11.0.1.101:6379> keys *
 1) "city_9"
 2) "id"
 3) "city_6"
 4) "gender"
 5) "city_4"
 6) "city_1"
-- 本番環境の大規模データでは keys * の使用は厳禁（シングルスレッドがブロックされるため）、scan による増分反復を推奨

# 2. キーに対応するデータ型の確認
11.0.1.101:6379> type city_1
hash
11.0.1.101:6379> type a
string

# 3. 有効期間の設定と確認（EXPIRE / TTL および PEXPIRE / PTTL）
11.0.1.101:6379> expire a 60
(integer) 1
11.0.1.101:6379> ttl a
(integer) 55
-- 残り秒数を返却；-1 は永続、-2 は期限切れ削除済みを示す

11.0.1.101:6379> pexpire a 60000
(integer) 1
11.0.1.101:6379> pttl a
(integer) 56000
-- ミリ秒単位での有効期限設定および残り有効期間の確認

# 4. 有効期間の解除（キーをメモリ内に永続保持させる）
11.0.1.101:6379> persist a
(integer) 1

# 5. 指定キーの削除
11.0.1.101:6379> del a
(integer) 1

# 6. キーの存在確認
11.0.1.101:6379> exists a
(integer) 0
-- 0 は存在しない、1 は存在する

# 7. キー名のリネーム
11.0.1.101:6379> rename city_10 city_ten
OK
```

---

## 2.3 5大コアデータ型の実践活用

### 2.3.1 データ型 1：Strings（文字列）

Strings は Redis で最も基本的なデータ構造であり、1つの Key に 1つの Value をマッピングします。単一 Value は最大 512MB までサポートされます。

#### 1. 基本的な読み書きと一括操作
```redis
# 単一キーの保存と取得
11.0.1.101:6379> set name dawn
OK
11.0.1.101:6379> get name
"dawn"

# 一括設定と取得（ネットワーク往復レイテンシ RTT を削減）
11.0.1.101:6379> mset id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> mget id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. 高並行カウンタ実践（PV数、いいね数、注文伝票番号）
```redis
# 基本的なインクリメントとデクリメント
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 1
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 2
11.0.1.101:6379> decr 123456_20240410_diancan
(integer) 1

# 指定数値での加算と減算
11.0.1.101:6379> incrby 123456_20240410_diancan 10000
(integer) 10001
11.0.1.101:6379> decrby 123456_20240410_diancan 5000
(integer) 5001
```

---

### 2.3.2 データ型 2：Hash（ハッシュテーブル）

Hash は String 型の field と value のマッピングテーブルであり、オブジェクトデータ（MySQL の1行のレコードに類似）の保存に極めて適しており、特定フィールドのみの独立した変更をサポートします。

#### 1. 基本的なハッシュの読み書き
```redis
# ユーザーオブジェクトレコードの保存
11.0.1.101:6379> hmset stu01 id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> hmset stu02 id 102 name xiaoA age 21 gender f
OK

# 指定オブジェクトの属性フィールドの確認
11.0.1.101:6379> hmget stu01 id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. 本番実践：MySQL のホットデータ行を Redis Hash キャッシュへインポート

現在のホスト `master` 上では MySQL 8.0 マルチインスタンスサービス（ポート `3308`、ソケット `/data/3308/mysql.sock`）が稼働しています。SQL を使用して `world.city` のホットデータを Redis コマンド形式に連結し、一括エクスポートして Redis にインポートします：

```bash
# 1. MySQL 3308 の稼働を確認して対話型端末にログイン
[root@master ~]# systemctl start mysqld3308
[root@master ~]# mysql -S /data/3308/mysql.sock
mysql> use world;
mysql> show tables;
+----------------------+
| Tables_in_world      |
+----------------------+
| city                 |
| country              |
| countrylanguage      |
+----------------------+
3 rows in set (0.00 sec)

# 2. SQL の concat 関数を用いてレコードを hmset コマンドに連結フォーマットしエクスポート
mysql> select concat("hmset city_",id," id ",id," name ",name) from world.city limit 10 into outfile '/tmp/hmset.txt';
Query OK, 10 rows affected (0.00 sec)
mysql> quit

# 3. エクスポートされたファイル内容を確認
[root@master ~]# cat /tmp/hmset.txt
hmset city_1 id 1 name Kabul
hmset city_2 id 2 name Qandahar
hmset city_3 id 3 name Herat
hmset city_4 id 4 name Mazar-e-Sharif
hmset city_5 id 5 name Amsterdam
hmset city_6 id 6 name Rotterdam
hmset city_7 id 7 name Haag
hmset city_8 id 8 name Utrecht
hmset city_9 id 9 name Eindhoven
hmset city_10 id 10 name Tilburg

# 4. Linux パイプライン経由で Redis へ高速一括投入
[root@master ~]# cat /tmp/hmset.txt | redis-cli -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
OK
OK
OK
OK
OK
OK
OK
OK
OK
OK

# 5. Redis クライアントでインポート結果を検証
[root@master ~]# redis-cli -a 123456
127.0.0.1:6379> hgetall city_1
1) "id"
2) "1"
3) "name"
4) "Kabul"

127.0.0.1:6379> hmget city_1 id name
1) "1"
2) "Kabul"
```

> **エンタープライズアーキテクチャの発展**：実際のマイクロサービスアーキテクチャでは、オープンソースのミドルウェア（Alibaba Canal や Debezium など）を MySQL のスレーブに見立てて Binlog を購読し、追加・変更データをリアルタイムに解析して Redis Hash に書き込むことで、キャッシュの自動増分同期とリフレッシュを実現します。

---

### 2.3.3 データ型 3：List（双方向メッセージリスト）

Shell / awk の配列 `array[zhangsan, lisi, wangwu]` に類似しています。Redis List は文字列のシンプルな双方向リンクドリストであり、SNS の最新タイムライン、コメント欄のページネーション表示、または軽量なメッセージキュー（FIFO）に広く活用されます。

```redis
# 新しいコメントを左側から順次プッシュ（最新のコメントが先頭に並ぶ）
127.0.0.1:6379> LPUSH wechat "taday is nice day ~"
(integer) 1
127.0.0.1:6379> LPUSH wechat "taday is bad day ~"
(integer) 2
127.0.0.1:6379> LPUSH wechat "taday is good day ~"
(integer) 3
127.0.0.1:6379> LPUSH wechat "taday is rainy day ~"
(integer) 4
127.0.0.1:6379> LPUSH wechat "taday is friday ~"
(integer) 5

# すべてのコメントデータを取得（0 から -1 で全件取得）
127.0.0.1:6379> lrange wechat 0 -1
1) "taday is friday ~"
2) "taday is rainy day ~"
3) "taday is good day ~"
4) "taday is bad day ~"
5) "taday is nice day ~"
```

---

### 2.3.4 データ型 4：Set（重複のない順序なし集合）

Set は重複のない一意な要素を持つ String 型の順序なし集合です。内部的にはハッシュテーブルで実装されており、時間計算量は $O(1)$ です。積集合（`SINTER`）、和集合（`SUNION`）、差集合（`SDIFF`）の演算をネイティブにサポートしており、SNS の友人関係ネットワーク処理に適しています。

```redis
# 2 人のユーザーのフォロー済みフレンドリストを登録：
127.0.0.1:6379> sadd xiaoQ xiaoA xiaoB oldgirl oldbaby tom
(integer) 5
127.0.0.1:6379> sadd dawn oldgirl oldbaby oldli Lucy tom
(integer) 5

# 1. 和集合の処理（2 人の全フレンド集合を取得、自動重複排除）：
127.0.0.1:6379> SUNION xiaoQ dawn
1) "xiaoB"
2) "oldgirl"
3) "xiaoA"
4) "tom"
5) "oldli"
6) "Lucy"
7) "oldbaby"

# 2. 積集合の処理（2 人の共通の友人を抽出）：
127.0.0.1:6379> SINTER xiaoQ dawn
1) "oldbaby"
2) "oldgirl"
3) "tom"

# 3. 差集合の処理（片方にのみ存在する友人を抽出し、知り合い候補を推薦）：
127.0.0.1:6379> SDIFF xiaoQ dawn
1) "xiaoB"
2) "xiaoA"
-- xiaoQ に属し、dawn には属さないフレンド

127.0.0.1:6379> SDIFF dawn xiaoQ 
1) "oldli"
2) "Lucy"
-- dawn に属し、xiaoQ には属さないフレンド
```

---

### 2.3.5 データ型 5：SortedSet（ZSet ソート済み順序付き集合）

SortedSet は Set の基礎の上に各要素に対して浮動小数点数スコア（Score）を紐付けたものです。要素の一意性は維持されたまま、スコアに基づいてメンバーが自動的に昇順で整列されます。リアルタイムランキング、検索トレンド、ポイント順位表などに広く使用されます。

```redis
# ランキングを作成し初期スコアを登録（全スコア 0）：
127.0.0.1:6379> zadd topN 0 smlt 0 fskl 0 fshkl 0 lzlsfs 0 wdhbx 0 wxg
(integer) 6

# アクセス急増を模擬し、ZINCRBY でメンバーのスコアを動的加算：
127.0.0.1:6379> ZINCRBY topN 100000 smlt  
"100000"
127.0.0.1:6379> ZINCRBY topN 10000 fskl
"10000"
127.0.0.1:6379> ZINCRBY topN 1000000 fshkl
"1000000"
127.0.0.1:6379> ZINCRBY topN 100 lzlsfs
"100"
127.0.0.1:6379> ZINCRBY topN 10 wdhbx
"10"
127.0.0.1:6379> ZINCRBY topN 100000000 wxg
"100000000"

# スコアの高い順に Top 3 メンバーを取得（インデックス 0 から 2）：
127.0.0.1:6379> ZREVRANGE topN 0 2
1) "wxg"
2) "fshkl"
3) "smlt"
```

---

## 2.4 Redis トランザクション操作と弱トランザクションの仕組み

### 2.4.1 トランザクションの概念と業務シナリオ：自動販売機のフロー

データベースのトランザクション（Transaction）は ACID 特性を満たすことが求められ、その中核は **A（Atomicity：原子性）** です。すなわち、トランザクション内のすべての操作はすべて成功するか、すべて失敗するかのいずれかでなければなりません。

飲料自動販売機での購入手続きを例にとると、一連の業務フローは次のようになります：
1. **商品の照会**：自動販売機内の在庫を確認；
2. **決済の実行**：データベースに接続し、取引テーブルに出金明細を挿入（`insert`）；
3. **商品の出庫**：在庫テーブルの商品数量を 1 減らす（`update stock = stock - 1`）；
4. **商品の受け取り**：商品出口センサーが作動し、補充フラグを更新（`update need_replenish = 1`）。

> **異常発生シナリオ**：第 4 ステップで排出モーターが噛み込み商品取り出しに失敗した場合、リレーショナルデータベースでは **ロールバック（Rollback）** を実行して事前の出金と在庫減算を取り消し、資金と在庫の整合性を保つ必要があります。

### 2.4.2 MySQL の厳格な原子性 vs Redis の弱トランザクションの比較

- **MySQL の実現方式**：
  - **Undo Log（ロールバックログ）** を基盤として原子性を実現；
  - `begin` でトランザクションを開始し、DML 操作はメモリ上のダーティページで行われ、例外が発生した場合は `rollback` を呼び出して Undo Log に基づき逆向きに取り消しを実施。正常終了時は `commit` でディスクへ永続化。
- **Redis の弱トランザクション実現方式**：
  - **コマンドパイプラインキュー** を基盤として実現；
  - キューに積まれたコマンド群は**順序通りに集中実行され、実行中に他のクライアントコマンドに割り込まれないこと（隔離性）** を保証；
  - **実行時ロールバック機能を備えていない**：キュー内のいずれかのコマンドが実行時にエラー（例：String 型に対して List コマンドを実行）を起こした場合でも、Redis は後続のコマンドを実行し続け、**既に正常実行されたコマンドはロールバックされません！**

### 2.4.3 Redis トランザクションコマンド実践

```redis
# 1. トランザクションの開始（MULTI）
127.0.0.1:6379> MULTI
OK

# 2. 連続してコマンドを入力（コマンドは QUEUED 状態となりキューに積まれる）
127.0.0.1:6379(TX)> set a b
QUEUED
127.0.0.1:6379(TX)> set c d
QUEUED

# 3. コミットして実行（EXEC、キューに入った順序で順次実行し各結果を返却）
127.0.0.1:6379(TX)> exec
1) OK
2) OK

# 4. トランザクションの破棄（DISCARD、現在のコマンドキューをクリアしトランザクションを直接終了）
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379(TX)> set test 123
QUEUED
127.0.0.1:6379(TX)> DISCARD
OK
127.0.0.1:6379> get test
(nil)
```

> **補足メカニズム（WATCH による楽観的ロック）**：`MULTI` を実行する前に、`WATCH <key>` を使用して 1 つまたは複数のキーを監視できます。もしこれらの監視対象キーが `EXEC` 実行前に他のクライアントによって変更された場合、現在のクライアントのトランザクション全体が自動的に中断され失敗して `(nil)` を返却します。これにより古典的な楽観的ロック（CAS）による並行性制御が実現されます。
