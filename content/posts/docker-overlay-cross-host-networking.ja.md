---
title: "Docker 実戦：Overlay によるコンテナのクロスホストネットワーク接続と WordPress 実践"
date: 2026-10-27T18:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "2 台の Docker ホストで Swarm クラスタを初期化し、attachable な overlay ネットワーク dawn-overlay を作成します。コンテナが IP とコンテナ名でクロスホスト通信することを確認し、docker_gwbridge 経由の外部ネットワーク出口を検証し、VXLAN（UDP 4789）をキャプチャしてデータのカプセル化を観察し、最後に WordPress のクロスホストデプロイで締めくくります。"
---

# Docker 実戦：Overlay によるコンテナのクロスホストネットワーク接続と WordPress 実践

## 1. 検証の目標

1. docker01 と docker02 で Docker Swarm クラスタを構成する。
2. カスタム overlay ネットワーク `dawn-overlay` をセグメント `172.30.0.0/16` で作成する。
3. docker02 でコンテナ `c1`、docker01 でコンテナ `c2` を起動する。
4. 2 つのコンテナが IP とコンテナ名でクロスホスト通信できることを確認する。
5. コンテナが `docker_gwbridge` 経由で外部ネットワークにアクセスできることを確認する。
6. ホストの業務 NIC `ens33` で VXLAN パケットをキャプチャし、overlay のカプセル化の様子を観察する。

## 2. 検証環境とトポロジー

### 2.1 ホスト環境

| ホスト | 業務 IP | NIC | Docker | Swarm ロール | 検証コンテナ |
|---|---|---|---|---|---|
| docker01 | 11.0.1.121/24 | ens33 | 27.0.3 | manager、leader | c2，172.30.0.3 |
| docker02 | 11.0.1.122/24 | ens33 | 27.0.3 | worker | c1，172.30.0.1 |

### 2.2 論理トポロジー

```text
                      Swarm クラスタ
             コントロールプレーン: Raft + ノード検出
                           
   docker01                              docker02
   11.0.1.121                            11.0.1.122
   manager / leader                     worker
        |                                     |
        |        UDP 4789, VXLAN トンネル          |
        |<===================================>|
        |                                     |
     c2 コンテナ                               c1 コンテナ
   172.30.0.3/16                         172.30.0.1/16
        |                                     |
        +------ dawn-overlay, 同一 L2 セグメント -----+

   コンテナの外部アクセス:eth1 -> docker_gwbridge -> ホスト NAT -> ens33
```

### 2.3 Swarm が必要とするポート

| ポート | プロトコル | 用途 |
|---|---|---|
| 2377 | TCP | Swarm 管理通信。主にノードの参加と管理ノードとの通信に使われる |
| 7946 | TCP、UDP | ノード間の検出と状態の伝播 |
| 4789 | UDP | overlay ネットワークの VXLAN カプセル化 |

クロスホストで ping が通らない場合、コンテナと overlay ネットワークが作成済みであれば、これらのポートと途中のネットワークセキュリティポリシーを最初に確認すべきです。

## 3. docker01 で Swarm を初期化

docker01 で実行：

```bash
docker swarm init \
  --advertise-addr 11.0.1.121 \
  --listen-addr 11.0.1.121:2377
```

```bash
Swarm initialized: current node (ilsct3hz5rg7tc1ln7l426p1e) is now a manager.
```

ノードを確認：

```bash
docker node ls
```

この時点では管理ノードのみです：

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
```

worker 参加トークンを確認：

```bash
docker swarm join-token worker
```

トークンはクラスタ参加の資格情報です。検証を再現する際は docker01 で都度取得してください。

初期化後、docker01 は以下を待ち受けます：

```bash
tcp  11.0.1.121:2377
tcp  11.0.1.121:7946
udp  11.0.1.121:7946
```



### 自動生成されるその他のネットワーク

Swarm 初期化後には次のものも確認できます：

| ネットワーク       | 役割                                                   |
| ----------------- | ------------------------------------------ |
| `ingress`         | Swarm サービスがポートを公開するときに使うルーティングメッシュ |
| `docker_gwbridge` | overlay コンテナをホストや外部ネットワークへつなぐローカルブリッジ |

## 4. docker02 をクラスタに参加させる

docker02 で以下のコマンドを実行：

```bash
docker swarm join \
  --token <WORKER_TOKEN> \
  --advertise-addr 11.0.1.122 \
  --listen-addr 11.0.1.122:2377 \
  11.0.1.121:2377
```

```bash
This node joined a swarm as a worker.
```

docker01 に戻って確認：

```bash
docker node ls
```

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
zqccn7zzxvujvbuw8i43jczdn     docker02   Ready     Active                          27.0.3
```

2 つのノードとも `Ready / Active` であり、クラスタのコントロールプレーンが正常であることを示します。

`docker node ls` は管理ノード用のコマンドです。worker で実行すると現在のノードは manager ではないと表示されます。

## 5. カスタム overlay ネットワークを作成

管理ノード docker01 で実行：

```bash
docker network create \
  -d overlay \
  --attachable \
  --subnet 172.30.0.0/16 \
  --gateway 172.30.0.254 \
  dawn-overlay
```

```bash
8myzpa127zbqa8x3wnzrfv1eh
```

ネットワークを確認：

```bash
docker network inspect dawn-overlay \
  --format 'Name={{.Name}} Id={{.Id}} Scope={{.Scope}} Driver={{.Driver}} Attachable={{.Attachable}} Subnet={{(index .IPAM.Config 0).Subnet}} Gateway={{(index .IPAM.Config 0).Gateway}}'
```

```bash
Name=dawn-overlay
Id=8myzpa127zbqa8x3wnzrfv1eh
Scope=swarm
Driver=overlay
Attachable=true
Subnet=172.30.0.0/16
Gateway=172.30.0.254
```

Swarm モードの overlay ネットワークは既定では主に service/task 向けです。通常のコンテナも `docker run --network dawn-overlay` で接続させたい場合は、ネットワーク作成時に `--attachable` を指定する必要があります。



ネットワーク作成直後に docker02 で実行：

```bash
docker network ls
docker network inspect dawn-overlay
```

観察された結果：

```bash
Error response from daemon: network dawn-overlay not found
```

この時点で `docker network ls` にあるのは `bridge`、`host`、`none`、`ingress`、`docker_gwbridge` だけで、`dawn-overlay` はまだありません。

これはクラスタ同期の失敗ではなく、Swarm overlay ネットワークのワーカーノードにおけるオンデマンド配備の仕組みです。ネットワーク設定はクラスタに保存されますが、ワーカーはコンテナやタスクが実際にそのネットワークへ接続する必要が生じたときにローカルのデータプレーン資源を作ります。

## 6. docker02 で c1 を起動

docker02 で実行：

```bash
docker run -d \
  --name c1 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

コンテナの NIC を確認：

```bash
docker exec c1 ifconfig
```

主な結果：

```text
eth0: inet addr 172.30.0.1/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

ネットワークを再確認：

```bash
docker network ls --filter name=dawn-overlay
NETWORK ID     NAME           DRIVER    SCOPE
8myzpa127zbq   dawn-overlay   overlay   swarm

docker network inspect dawn-overlay \
  --format 'Id={{.Id}} Scope={{.Scope}} Attachable={{.Attachable}}'
Id=8myzpa127zbqa8x3wnzrfv1eh Scope=swarm Attachable=true
```

コンテナを接続すると `dawn-overlay` が docker02 に現れ、ネットワーク ID は docker01 と完全に一致します。

## 7. docker01 で c2 を起動

docker01 で実行：

```bash
docker run -d \
  --name c2 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

NIC を確認：

```bash
docker exec c2 ifconfig
```

主な結果：

```text
eth0: inet addr 172.30.0.3/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

## 8. クロスホスト通信を検証

### 8.1 宛先 IP による通信

docker01 で実行：

```bash
docker exec c2 ping -c 3 172.30.0.1
PING 172.30.0.1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=7.124 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.414 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.518 ms

--- 172.30.0.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

### 8.2 コンテナ名による通信

続けて実行：

```bash
docker exec c2 ping -c 3 c1
PING c1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=0.996 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.456 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.492 ms

--- c1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

本番環境では動的に割り当てられるコンテナ IP を設定ファイルに書き込むのではなく、安定したサービス名やコンテナ名を優先して使うべきです。

## 9. ルーティングと外部アクセスを検証

c2 のルートを確認：

```bash
docker exec c2 route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         172.18.0.1      0.0.0.0         UG    0      0        0 eth1
172.18.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth1
172.30.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth0
```

宛先が `172.30.0.0/16` に属する場合は overlay の NIC `eth0` を通ります。

その他の宛先はデフォルトルート `172.18.0.1` を使い、`eth1` と `docker_gwbridge` に対応します。

外部ネットワークをテスト：

```bash
docker exec c2 ping -c 3 baidu.com
```

実際の結果：

```text
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 37.178/40.291/46.454 ms
```

同時に docker01 の `docker_gwbridge` でキャプチャ：

```bash
timeout 10 tcpdump -i docker_gwbridge -nn -c 2 icmp
```

別のターミナルで実行：

```bash
docker exec c2 ping -c 2 baidu.com
```

キャプチャできたパケット：

```text
IP 172.18.0.3 > 111.63.65.103: ICMP echo request
IP 111.63.65.103 > 172.18.0.3: ICMP echo reply
```

外部トラフィックは overlay の VXLAN トンネルではなく `docker_gwbridge` を通ることが確認できました。

## 10. VXLAN のクロスホストパケットをキャプチャ

docker01 でキャプチャを実行：

```bash
timeout 12 tcpdump -i ens33 -nn -vv -c 4 'udp port 4789'
```

別のターミナルでクロスホストのトラフィックを発生させる：

```bash
docker exec c2 ping -c 4 172.30.0.1
```

主要なパケット：

```text
11.0.1.121.41805 > 11.0.1.122.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.3 > 172.30.0.1: ICMP echo request

11.0.1.122.44099 > 11.0.1.121.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.1 > 172.30.0.3: ICMP echo reply
```

キャプチャ統計：

```text
4 packets captured
4 packets received by filter
0 packets dropped by kernel
```

クロスホストのコンテナは元のパケットを VXLAN にカプセル化し、2 台のホストの `ens33` ネットワーク経由で転送します。

## 11. 実践ケース：overlay で WordPress をデプロイ

カスタム overlay ネットワーク `172.23.0.0/16` で wordpress をデプロイします。

### 11.1 ネットワークを作成

```bash
# docker01
docker network create -d overlay --attachable \
  --subnet 172.23.0.0/16 --gateway 172.23.0.254 wp-overlay
```

### 11.2 docker02 に MySQL をデプロイ

```bash
# docker02
docker run -d --name wp-db --network wp-overlay --restart unless-stopped \
  -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=wordpress \
  -e MYSQL_PASSWORD=123456 \
  -e MYSQL_ROOT_PASSWORD=123456 \
  -v wp-db-data:/var/lib/mysql \
  mysql:8.4.1-oracle
```

### 11.3 docker01 に WordPress をデプロイ

```bash
# docker01
docker run -d --name wp-web --network wp-overlay --restart unless-stopped \
  -p 8080:80 \
  -e WORDPRESS_DB_HOST=wp-db:3306 \
  -e WORDPRESS_DB_NAME=wordpress \
  -e WORDPRESS_DB_USER=wordpress \
  -e WORDPRESS_DB_PASSWORD=123456 \
  uhub.service.ucloud.cn/dawn/wordpress:6.8
```

`WORDPRESS_DB_HOST=wp-db:3306` 直接使用容器名。两个容器虽在不同宿主机，但同处 `wp-overlay` 网络，Docker 内置 DNS 会将 `wp-db` 解析为 docker02 上的 MySQL 容器 IP，实现跨主机数据库访问。

クロスホストの DNS 解決を確認：

```bash
docker exec wp-web getent hosts wp-db
172.23.0.1  wp-db
```

### 11.4 インストール画面を確認

![image-20261027210610539](/images/docker-overlay-cross-host-networking-image-20261027210610539.png)

## 12. 検証環境のクリーンアップ

コンテナを削除：

```bash
# docker01
docker rm -f c2

# docker02
docker rm -f c1
```

manager でカスタムネットワークを削除：

```bash
docker network rm dawn-overlay
```

worker をクラスタから離脱させる：

```bash
# docker02
docker swarm leave
```

manager を離脱させクラスタを解散：

```bash
# docker01
docker swarm leave --force
```

クリーンアップ後の確認：

```bash
docker info --format '{{.Swarm.LocalNodeState}}'
docker network ls
docker ps -a
```
