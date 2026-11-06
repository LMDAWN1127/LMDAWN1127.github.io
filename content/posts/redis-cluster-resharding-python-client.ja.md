---
title: "Redis 分散実践（4）：Clusterクラスタ構築・オンラインスロット拡縮・Python開発"
date: 2026-11-06T17:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cluster", "Python", "High Availability", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 分散実践シリーズ第4弾：Redis Cluster 16384 ハッシュスロット分割メカニズムと非中央集権型 Gossip プロトコルの深層解析、7000〜7005 6ノード分散クラスタの設計とワンコマンド構築、ノードの動的無停止水平スケールアウト、800スロットのスムーズなマイグレーション（Resharding）と縮退時のスロット返却・安全なノード削除、そして Python SDK による単一インスタンス・Sentinel 哨兵読み書き分離・Redis Cluster 分散操作の実装と互換性トラブル回避策を網羅解説。"
---

# Redis 分散実践（4）：Clusterクラスタ構築・オンラインスロット拡縮・Python開発

## 4.1 Redis Cluster 分散アーキテクチャの中核原理

単一の Redis インスタンスは、シングルコア CPU の処理能力と単一サーバーの物理メモリ上限によって制約されます。業務データが数十 GB を超え、並行スループットが数十万 QPS に達する場合、分散シャーディングクラスタの導入が不可欠となります。

### 1. 16384 ハッシュスロット（Hash Slot）シャーディング機構
- Redis Cluster はあらかじめ固定の **16384 個のハッシュスロット（Slot 0〜16383）** を割り当て、これら 16384 個のスロットをすべての Master ノードに均等に分散配置します；
- データを保存する際、Key に対して CRC16 チェックサムを計算し、16384 で剰余を求めます：
  $$\text{Slot} = \text{CRC16}(Key) \pmod{16384}$$
- クライアントは計算されたスロットを担当する Master ノードに対して読み書きを実行します。もし誤ったノードに接続した場合は、ノードが `MOVED` リダイレクト応答を返し、クライアントに正しいノードアドレスを通知します。

### 2. 非中央集権型自律制御と自動フェイルオーバー
- 各ノード間は専用のクラスタバス（ポート番号 +10000、例：7000 ノードのクラスタバスは 17000）を介して Gossip プロトコルを実行し、定期的なハートビートによる障害検知と状態交換を行います；
- 各 Master ノードには少なくとも 1 台の Slave ノードが対応します。ある Master ノードがダウンした場合、クラスタは対応する Slave ノードを自動的に新 Master へ昇格させ、クラスタ全体としてのサービス継続性を担保します。

---

## 4.2 6ノードクラスタの設計と構築実践

### 4.2.1 トポロジーの設計準備

| インスタンスポート | 役割 | 作業ディレクトリ | 担当ハッシュスロット範囲 |
| :--- | :--- | :--- | :--- |
| `7000` | Master 1 | `/data/7000` | `0 ~ 5460` (5461 slots) |
| `7001` | Master 2 | `/data/7001` | `5461 ~ 10922` (5462 slots) |
| `7002` | Master 3 | `/data/7002` | `10923 ~ 16383` (5461 slots) |
| `7003` | Slave 3 (7002 対応) | `/data/7003` | レプリカバックアップ |
| `7004` | Slave 1 (7000 対応) | `/data/7004` | レプリカバックアップ |
| `7005` | Slave 2 (7001 対応) | `/data/7005` | レプリカバックアップ |

---

### 4.2.2 ノード設定ファイルの作成とインスタンス起動

```bash
# ディレクトリを一括作成し、7000〜7005 の設定ファイルを生成
[root@master ~]# mkdir -p /data/700{0..5}
for p in {7000..7005}; do
cat >/data/${p}/redis.conf <<EOF
port ${p}
daemonize yes
pidfile /data/${p}/redis.pid
loglevel notice
logfile "/data/${p}/redis.log"
dbfilename dump.rdb
dir /data/${p}
protected-mode no
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
EOF
redis-server /data/${p}/redis.conf
done

# 6 つのクラスタインスタンスが正常稼働していることを確認
[root@master ~]# ps -ef | grep redis-server | grep cluster
root  6565  1  0 15:11 ?  00:00:00 redis-server *:7000 [cluster]
root  6568  1  0 15:11 ?  00:00:00 redis-server *:7001 [cluster]
root  6575  1  0 15:11 ?  00:00:00 redis-server *:7002 [cluster]
root  6582  1  0 15:11 ?  00:00:00 redis-server *:7003 [cluster]
root  6589  1  0 15:11 ?  00:00:00 redis-server *:7004 [cluster]
root  6596  1  0 15:11 ?  00:00:00 redis-server *:7005 [cluster]
```

---

### 4.2.3 クラスタの一括構築とスロット自動割り当て（redis-cli --cluster create）

```bash
[root@master ~]# echo 'yes' | redis-cli --cluster create 127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 --cluster-replicas 1
>>> Performing hash slots allocation on 6 nodes...
Master[0] -> Slots 0 - 5460
Master[1] -> Slots 5461 - 10922
Master[2] -> Slots 10923 - 16383
Adding replica 127.0.0.1:7004 to 127.0.0.1:7000
Adding replica 127.0.0.1:7005 to 127.0.0.1:7001
Adding replica 127.0.0.1:7003 to 127.0.0.1:7002
...
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
```

クラスタトポロジーの確認：
```bash
[root@master ~]# redis-cli -p 7000 cluster nodes
5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 127.0.0.1:7000@17000 myself,master - 0 1793949082000 1 connected 0-5460
71373159de867b5ce8cb9e9fee99a4fe74df727c 127.0.0.1:7001@17001 master - 0 1793949083000 2 connected 5461-10922
341bfc1b1d01bf1b08e9ec07739648428669ad0d 127.0.0.1:7002@17002 master - 0 1793949083967 3 connected 10923-16383
ca4c281440a099732c2a694c35fa2f8dbe27bb6e 127.0.0.1:7004@17004 slave 5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 0 1793949083000 5 connected
c4b43a6e4da62c52231bc996ca19ee07a25e6e22 127.0.0.1:7005@17005 slave 71373159de867b5ce8cb9e9fee99a4fe74df727c 0 1793949083000 6 connected
867245944a3daeb924c3d66e5f1a1b03f371d1ea 127.0.0.1:7003@17003 slave 341bfc1b1d01bf1b08e9ec07739648428669ad0d 0 1793949083000 4 connected
```

---

## 4.3 クラスタのオンライン動的スケールアウト（Add Node & Reshard）

業務トラフィック急増時、稼働中サービスを停止することなく、スムーズに新規ノードを追加してハッシュスロットを再配分します。

### ステップ 1：7006（新マスター）と 7007（新スレーブ）の作成と起動

```bash
mkdir -p /data/700{6,7}
for p in 7006 7007; do
cat >/data/${p}/redis.conf <<EOF
port ${p}
daemonize yes
pidfile /data/${p}/redis.pid
loglevel notice
logfile "/data/${p}/redis.log"
dbfilename dump.rdb
dir /data/${p}
protected-mode no
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
EOF
redis-server /data/${p}/redis.conf
done
```

### ステップ 2：7006 を Master としてクラスタに追加

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7000
>>> Adding node 127.0.0.1:7006 to cluster 127.0.0.1:7000
...
>>> Send CLUSTER MEET to node 127.0.0.1:7006 to make it join the cluster.
[OK] New node added correctly.

# 7006 のノード ID を確認（この時点ではスロット未割り当て）：
[root@master ~]# redis-cli -p 7000 cluster nodes | grep 7006
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949142057 0 connected
```

### ステップ 3：7006 へ 800 個のスロットをオンライン移行（Resharding 再分割）

```bash
# 7000 と 7006 の Node ID を取得
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')

# 7000 上の 800 スロットをオンライン再分割で 7006 へ転送：
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7000 --cluster-to $ID_7006 --cluster-slots 800 --cluster-yes
Ready to move 800 slots.
  Source nodes: M: 5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 127.0.0.1:7000
  Destination node: M: aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006
Moving slot 0 ~ 799 from 127.0.0.1:7000 to 127.0.0.1:7006...
```

### ステップ 4：スレーブノード 7007 を追加して 7006 配下に接続

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7007 127.0.0.1:7000 --cluster-slave --cluster-master-id $ID_7006
>>> Adding node 127.0.0.1:7007 to cluster 127.0.0.1:7000
...
>>> Configure node as replica of 127.0.0.1:7006.
[OK] New node added correctly.

# 7006 と 7007 の主従トポロジー状態を確認：
[root@master ~]# redis-cli -p 7000 cluster nodes | grep -E '7006|7007'
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949162000 7 connected 0-799
8023a28d56a02989a0db7994502f182e6ac808bd 127.0.0.1:7007@17007 slave aaa204f9be194ae2640be58552d24446da1c83bb 0 1793949162547 0 connected
```

---

## 4.4 クラスタのオンライン動的スケールイン（Reshard スロット返却 & Del Node）

ノードを安全に撤退・削除する際は、**必ず事前にその Master ノードが保持する全スロットを他の Master ノードへ完全に返却移行**しなければなりません。スロットを残したまま削除すると、クラスタ全体のスロット構成が不完全となりサービス提供が停止します。

```bash
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')
ID_7007=$(redis-cli -p 7000 cluster nodes | grep 7007 | awk '{print $1}')

# 1. 7006 上の 800 スロットを 7000 へ完全に返却
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7006 --cluster-to $ID_7000 --cluster-slots 800 --cluster-yes

# 2. スレーブノード 7007 を安全に削除
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7007 $ID_7007
>>> Removing node 8023a28d56a02989a0db7994502f182e6ac808bd from cluster 127.0.0.1:7007
[OK] Node deleted.

# 3. マスターノード 7006 を安全に削除
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7006 $ID_7006
>>> Removing node aaa204f9be194ae2640be58552d24446da1c83bb from cluster 127.0.0.1:7006
[OK] Node deleted.
```

---

## 4.5 Python クライアントによる API 連携開発

### 4.5.1 Python 環境とライブラリ依存関係の準備

CentOS 7 環境に Python 3 および Redis SDK をインストール：

```bash
[root@master ~]# yum install -y python3 python3-pip
[root@master ~]# python3 -V
Python 3.6.8
```

**バージョン互換性の落とし穴と対策**：`redis-py-cluster 2.1.3` を使用する場合、内部で旧版の `redis._compat` モジュールに依存しています。最新版の `redis 4.x` をそのままインストールすると、`ModuleNotFoundError: No module named 'redis._compat'` 例外が発生します。  
**正しいインストール手順**：互換性のあるクラシック版 `redis==3.5.3` を明示的に指定してインストールします：

> ```bash
> pip3 install "redis==3.5.3" redis-py-cluster -i https://mirrors.aliyun.com/pypi/simple/
> ```

---

### 4.5.2 Python による単一 Redis インスタンス接続

```python
import redis

# 11.0.1.101 単一インスタンス（ポート 6379）に接続
r = redis.StrictRedis(host='11.0.1.101', port=6379, db=0, password='123456')
r.set('dawn', 'xiaoQ')
print(r.get('dawn'))  # 出力: b'xiaoQ'
```

---

### 4.5.3 Python による Sentinel 哨兵連携と読み書き分離

クライアントは Sentinel 哨兵クラスタ（`26380`）に直接接続し、哨兵が自動的に現在のアクティブな Master（書き込み用）と Slaves（読み取り用）を解決・取得することで、コードレベルでの読み書き分離を実現します：

```python
from redis.sentinel import Sentinel

# 1. Sentinel 哨兵クラスタへ接続
sentinel = Sentinel([('localhost', 26380)], socket_timeout=0.1)

# 2. クラスタの主従トポロジーを自動検出
master_addr = sentinel.discover_master('mymaster')
slaves_addr = sentinel.discover_slaves('mymaster')
print('Master ノードアドレス:', master_addr)  # 例: ('127.0.0.1', 6382)
print('Slaves ノードアドレス:', slaves_addr)   # 例: [('127.0.0.1', 6381), ('127.0.0.1', 6380)]

# 3. 読み書き分離ルーティング：Master へ書き込み、Slave から読み取り
master = sentinel.master_for('mymaster', socket_timeout=0.1, password='123')
slave = sentinel.slave_for('mymaster', socket_timeout=0.1, password='123')

# 4. 読み書きテストの実行
master.set('dawn', '123')
print('スレーブからのデータ読み取り結果: slave.get("dawn") =', slave.get('dawn'))  # 出力: b'123'
```

---

### 4.5.4 Python による Redis Cluster 分散クラスタ直結

`rediscluster.RedisCluster` クライアントを介してクラスタに接続すると、クライアントが Key の CRC16 スロットに基づいて自動的にルーティングを行い、下層の分散シャーディング詳細を透過的に隠蔽します：

```python
from rediscluster import RedisCluster

# クラスタ内の任意のシードノードを複数指定することでクラスタ全体のトポロジーを自動検出
startup_nodes = [
    {"host": "127.0.0.1", "port": "7000"},
    {"host": "127.0.0.1", "port": "7001"},
    {"host": "127.0.0.1", "port": "7002"}
]

rc = RedisCluster(startup_nodes=startup_nodes, decode_responses=True)
rc.set("foo", "bar")
print('クラスタ読み取り検証: rc.get("foo") =', rc.get("foo"))  # 出力: bar
```
