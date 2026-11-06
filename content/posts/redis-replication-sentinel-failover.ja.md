---
title: "Redis 高可用性実践（3）：主従レプリケーションの仕組みと Sentinel 自動フェイルオーバー"
date: 2026-11-06T16:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Sentinel", "High Availability", "Replication", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 高可用性実践シリーズ第3弾：Redis 主従レプリケーションの内部メカニズム（フル BGSAVE 同期、差分コマンド伝播、repl_backlog バックログバッファによるレジューム）の徹底解剖、マスターノードの永続化未設定によるスレーブデータ全消失事故の警鐘、単一マシン上での 6380/6381/6382 3インスタンス構成によるレプリケーション構築、および Sentinel 哨兵クラスタによるミリ秒単位の主観的/客観的ダウン判定、リーダー選出、自動フェイルオーバーの実証。"
---

# Redis 高可用性実践（3）：主従レプリケーションの仕組みと Sentinel 自動フェイルオーバー

## 3.1 Redis 主従レプリケーション機能のアーキテクチャと原理

### 3.1.1 なぜ主従レプリケーションが必要なのか？

単一の Redis サーバーでは、RDB や AOF による永続化を設定していたとしても、ハードウェア障害、電源喪失、マザーボード故障が発生した場合、サービス全体の中断は避けられません。そこで Redis は**レプリケーション（Replication）**機能を提供し、1 台のプライマリデータベース（Master）のデータを複数のレプリカデータベース（Slave / Replica）へ自動的かつ非同期に同期することで、以下を実現します：
1. **複数レプリカによるディザスタリカバリ**：単一障害点（SPOF）の排除；
2. **読み書き分離によるスケールアウト**：Master ノードは書き込み処理に特化し、複数の Slave ノードで大規模な並行読み取りトラフィックを分散；
3. **高可用性の基盤**：Sentinel 哨兵アーキテクチャおよび Redis Cluster 分散クラスタのデータ基盤として機能。

---

### 3.1.2 主従レプリケーション（Master-Replica）同期メカニズムの徹底解剖

```
[スレーブ: 6381/6382] ──(1. slaveof / PSYNC ? 送信)──> [マスター: 6380]
[スレーブ: 6381/6382] <──(2. BGSAVE トリガー、RDB スナップショット転送)── [マスター: 6380]
[スレーブ: 6381/6382] (3. 既存データ消去 & RDB スナップショット読み込み)
[スレーブ: 6381/6382] <──(4. Replication Buffer の新規コマンド送信)── [マスター: 6380]
[スレーブ: 6381/6382] <──(5. 継続的な差分コマンド伝播: set コマンド同期)── [マスター: 6380]
[スレーブ: 6381/6382] ──(6. ネットワーク瞬断復旧: PSYNC <runid> <offset> 送信)──> [マスター: 6380]
[スレーブ: 6381/6382] <──(7. リング状バックログバッファの差分のみ再転送)── [マスター: 6380]
```

1. **初回接続時のフルレプリケーション（SYNC / Full PSYNC）**：
   - スレーブが `slaveof <master_ip> <port>` を実行後、マスターへ `PSYNC ? -1` コマンドを送信；
   - マスターはフル同期要求を受信後、バックグラウンドで `BGSAVE` をトリガーして RDB バイナリスナップショットを生成し、スナップショット生成中に発生したすべての新しい書き込みコマンドを専用の **Replication Buffer（レプリケーションバッファ）** に一時保持；
   - マスターは生成された RDB ファイルをスレーブへ転送。スレーブは受信後、まず自身のメモリをクリアしてから RDB ファイルをメモリへ完全にロード；
   - その後、マスターは Replication Buffer に蓄積されたすべての書き込みコマンドをスレーブへ送信・再生（リプレイ）させ、主従のデータ整合性を確立。
2. **通常運用時の継続的コマンド伝播**：
   - マスターで新しい書き込み操作（例：`set`）が発生するたびに、プロトコルコマンド形式でスレーブへ非同期に転送・実行。
3. **ネットワーク瞬断時の増分レプリケーション（PSYNC）**：
   - マスターはメモリ上に固定サイズのリング状**複製バックログバッファ（repl_backlog）**と複製オフセット（Offset）を保持；
   - 主従間の接続が一時的に切断された後に再接続した際、スレーブはマスターへ `PSYNC <master_replid> <offset>` 要求を送信；
   - スレーブが要求したオフセットがマスターのリングバッファ内に残っていれば、マスターは不足している差分データのみをスレーブへ継続送信し、時間のかかるフル RDB の再生成とロードを回避。

---

### 3.1.3 コア保護パラメータとマスター永続化の致命的リスク

#### 1. データ整合性保護パラメータ（マスター側設定）
```conf
min-slaves-to-write 1
-- 少なくとも 1 台（または指定台数）のスレーブが正常に接続されている状態でない限り、マスターは書き込み要求を拒否しエラーを返す

min-slaves-max-lag 3
-- スレーブとのハートビート遅延の許容最大秒数（この閾値を超えると接続断と判定）
```

#### 2. 本番環境の高リスク罠：マスター永続化未設定によるスレーブデータ全消去事故

**重大警告**：マスター側で永続化（RDB も AOF も）を完全に無効化している場合、マスターが予期せずクラッシュ・ダウンすると、メモリ上のデータはすべて消失（ゼロ）します。この時、外部監視や自動復旧スクリプトがマスターを即座に再起動してしまうと、マスターは**空のメモリ状態を正として空の RDB を生成し、すべてのスレーブへ同期上書き**してしまいます。その結果、全スレーブに保持されていた正常なデータが一瞬で全消去される惨事となります！  
**本番規範**：主従レプリケーション環境のマスターノードは**必ず永続化を有効化**しなければなりません。永続化が無効のマスターがダウンした場合、直接再起動することは厳禁であり、必ずスレーブのいずれかをマスターへ昇格させた後に復旧作業を行ってください。

---

## 3.2 単一マシン上での 3 インスタンス主従レプリケーション構築実践

ホスト `master`（`11.0.1.101`）上で 3 つのインスタンスを設計：

| インスタンスポート | 役割 | 作業ディレクトリ | ログ出力先 |
| :--- | :--- | :--- | :--- |
| `6380` | マスター（Master） | `/data/6380` | `/data/6380/redis.log` |
| `6381` | スレーブ 1（Slave 1） | `/data/6381` | `/data/6381/redis.log` |
| `6382` | スレーブ 2（Slave 2） | `/data/6382` | `/data/6382/redis.log` |

### ステップ 1：ディレクトリ作成とインスタンス設定ファイルの作成

```bash
[root@master ~]# mkdir -p /data/638{0..2}

# 3 つのインスタンスの設定ファイルを一括生成（認証パスワード 123 と主従間認証 masterauth 123 を含む）
for port in 6380 6381 6382; do
cat >/data/${port}/redis.conf <<EOF
port ${port}
daemonize yes
pidfile /data/${port}/redis.pid
loglevel notice
logfile "/data/${port}/redis.log"
dbfilename dump.rdb
dir /data/${port}
requirepass 123
masterauth 123
EOF
done

# 3 つの Redis インスタンスを起動
[root@master ~]# redis-server /data/6380/redis.conf
[root@master ~]# redis-server /data/6381/redis.conf
[root@master ~]# redis-server /data/6382/redis.conf

# ポートのリスニング状態を確認
[root@master ~]# netstat -lntup | grep -E '6380|6381|6382'
tcp        0      0 0.0.0.0:6380            0.0.0.0:*               LISTEN      6332/redis-server * 
tcp        0      0 0.0.0.0:6381            0.0.0.0:*               LISTEN      6338/redis-server * 
tcp        0      0 0.0.0.0:6382            0.0.0.0:*               LISTEN      6344/redis-server * 
```

### ステップ 2：主従同期の有効化とトポロジー状態の確認

```bash
# 6381 および 6382 で主従同期を有効化し、マスター 6380 を指定
[root@master ~]# redis-cli -p 6381 -a 123 slaveof 127.0.0.1 6380
OK
[root@master ~]# redis-cli -p 6382 -a 123 slaveof 127.0.0.1 6380
OK

# マスター 6380 のレプリケーショントポロジー状態を確認（2 つのスレーブが正常オンライン）：
[root@master ~]# redis-cli -p 6380 -a 123 info replication
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
# Replication
role:master
connected_slaves:2
slave0:ip=127.0.0.1,port=6381,state=online,offset=0,lag=0
slave1:ip=127.0.0.1,port=6382,state=online,offset=0,lag=0
master_failover_state:no-failover
master_replid:b26c0fadaba463a8e0bb4b7f0b289a0c1b06f62d
master_repl_offset:0

# スレーブ 6381 のレプリケーション状態を確認：
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6380
master_link_status:up
master_last_io_seconds_ago:2
master_sync_in_progress:0
slave_read_only:1
```

### ステップ 3：主従同期状態の解除

```bash
# 特定のスレーブを主従関係から離脱させ、独立したマスターへ昇格させる場合：
[root@master ~]# redis-cli -p 6382 -a 123 slaveof no one
OK
```

---

## 3.3 Redis Sentinel（哨兵）アーキテクチャによる高可用性実践

### 3.3.1 Sentinel アーキテクチャの中核的価値とコンポーネントの責務

単純な主従構成では、Master ノードがダウンした場合にスレーブが自動昇格できず、運用担当者の手動介入が必要となり業務停止時間が長期化します。**Sentinel（哨兵クラスタ）**を導入することで、完全自動・無人運用の高可用性が実現されます：

- **監視（Monitoring）**：マスター、スレーブ、および他の Sentinel ノードに対して定期的に PING ハートビートを送信し、稼働健全性を監視；
- **自動フェイルオーバー（Automatic Failover）**：マスターのハートビート応答が途絶えて主観的ダウン（sdown）と判定され、過半数の Sentinel が客観的ダウン（odown）で合意に達した場合、Raft プロトコルに基づきリーダーを選出して最適なスレーブを新マスターへ昇格；
- **トポロジーの自動再構築**：残りのスレーブに対して新マスターへの再同期を命じ、障害のあった旧マスターが復旧起動した際にはスレーブとして新マスター配下に自動接続；
- **クライアント通知**：クライアントは Sentinel へ問い合わせて現在のアクティブなマスター IP/Port を取得できるため、フェイルオーバーは透過的に完了。

---

### 3.3.2 Sentinel 哨兵インスタンスの構築（ポート 26380）

```bash
[root@master ~]# mkdir -p /data/26380
[root@master ~]# cat >/data/26380/sentinel.conf <<EOF
port 26380
dir "/data/26380"
sentinel monitor mymaster 127.0.0.1 6380 1
-- クラスタマスターの監視（数値 1 はクォーラム Quorum を表し、1 つの Sentinel が異常と判定すればフェイルオーバー可能）
sentinel down-after-milliseconds mymaster 5000
-- ハートビート検出で 5000ミリ秒（5秒）以上無応答の場合に主観的ダウンと判定
sentinel auth-pass mymaster 123
-- マスター接続時に使用する認証パスワード
EOF

# Sentinel 哨兵サービスプロセスを起動
[root@master ~]# redis-sentinel /data/26380/sentinel.conf &>/tmp/sentinel.log &

# リスニングポートの確認
[root@master ~]# netstat -lntup | grep 26380
tcp        0      0 0.0.0.0:26380           0.0.0.0:*               LISTEN      6373/redis-sentinel 
tcp6       0      0 :::26380                :::*                    LISTEN      6373/redis-sentinel 
```

---

### 3.3.3 マスター障害時の自動フェイルオーバー検証

#### ステップ 1：マスター 6380 の異常ダウンを模擬
```bash
[root@master ~]# redis-cli -p 6380 -a 123 shutdown
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
```

#### ステップ 2：スレーブの自動昇格を検証
10 秒待機後、スレーブ `6381` および `6382` のレプリケーション状態を確認：
```bash
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
-- Sentinel が自動的に 6382 を新マスターに選出し、6381 を 6382 向きに自動再接続！
```

#### ステップ 3：復旧した旧マスターの自動再収容を検証
```bash
# 旧マスター 6380 を再起動
[root@master ~]# redis-server /data/6380/redis.conf

# 現在のマスター 6382 またはスレーブ 6381 の状態を確認：
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
slave_read_repl_offset:996
-- 6380 は起動後に Sentinel によって自動的に Slave へ降格され、新 Master 6382 配下に再接続されてトポロジーが自動復旧
```

---

### 3.3.4 Sentinel の主要運用管理コマンド

```bash
# Sentinel 対話型クライアントに接続
[root@master ~]# redis-cli -p 26380

# 1. 監視対象マスターの詳細な稼働ステータスと設定情報の確認
127.0.0.1:26380> SENTINEL masters

# 2. 指定クラスタ配下の全スレーブ情報の確認
127.0.0.1:26380> SENTINEL slaves mymaster

# 3. 現在有効なマスターの IP とポートを迅速に取得（クライアントルーティングの中核コマンド）
127.0.0.1:26380> SENTINEL get-master-addr-by-name mymaster
1) "127.0.0.1"
2) "6382"

# 4. 手動で強制フェイルオーバーを実行
127.0.0.1:26380> SENTINEL failover mymaster
OK
```
