---
title: "Docker 実戦：macvlan によるコンテナのクロスホストネットワーク接続"
date: 2026-10-27T14:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "2 台の Docker ホストで macvlan ドライバにより同一セグメントのカスタムネットワークを作成し、コンテナのクロスホスト L2 接続を実演します。さらに macvlan が既定ではホストや外部ネットワークに接続できない問題の解決策を示し、最後に WordPress のマルチノードデプロイで締めくくります。"
---

# Docker 実戦：macvlan によるコンテナのクロスホストネットワーク接続

macvlan は Linux カーネルが提供するネットワーク仮想化技術です。コンテナはホストの物理ネットワーク上で**独立した MAC アドレスと IP** を直接持ち、物理マシンのようにレイヤ 2 ネットワークに参加できます。本記事では 2 台の Docker ホスト（docker01 / docker02）で macvlan ドライバにより同一セグメントのカスタムネットワークを作成し、コンテナがどのように**クロスホストのレイヤ 2 接続**を実現するかを実演します。さらに「macvlan は既定ではホストや外部ネットワークに接続できない」問題の解決策を補足し、最後に WordPress のマルチノードデプロイの実践で締めくくります。

## 1. 両ノードの Linux カーネルが macvlan モジュールをサポートするか確認

```bash
root@docker01:~# lsmod | grep macvlan
root@docker01:~# modprobe macvlan
root@docker01:~# lsmod | grep macvlan
macvlan                24576  0

root@docker02:~# lsmod | grep macvlan
root@docker02:~# modprobe macvlan
root@docker02:~# lsmod | grep macvlan
macvlan                24576  0
```

## 2. 両ノードで同一セグメントのカスタムネットワークを作成

```bash
root@docker01:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
d77a0f2205f858b463477be344303f89573ffb8b118a52de743810fd0db01fa5

root@docker02:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
1620e221dc2c17027856fa59fb9b47dd9b0ef756a5767dda4a1aaea615c49194
```

## 3. 11.0.1.121 ノードでカスタムネットワークによりコンテナを起動し IP を手動割り当て

```bash
root@docker01:~# docker container run -d -it --name c1 --network dawn-macvlan --ip 172.29.0.101 uhub.service.ucloud.cn/dawn/apps:v1
root@docker01:~# docker exec c1 ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:1D:00:65
          inet addr:172.29.0.101  Bcast:172.29.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```

## 4. 11.0.1.122 ノードでカスタムネットワークによりコンテナを起動し IP を手動割り当て

```bash
root@docker02:~# docker container run -d -it --name c2 --network dawn-macvlan --ip 172.29.0.102 uhub.service.ucloud.cn/dawn/apps:v1
root@docker02:~# docker exec c2 ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:1D:00:66
          inet addr:172.29.0.102  Bcast:172.29.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```

## 5. 2 つのコンテナの接続性をテスト

```bash
root@docker02:~# docker exec c2 ping 172.29.0.101 -c 3 # ノード間通信成功
PING 172.29.0.101 (172.29.0.101): 56 data bytes
64 bytes from 172.29.0.101: seq=0 ttl=64 time=14.520 ms
64 bytes from 172.29.0.101: seq=1 ttl=64 time=0.415 ms
64 bytes from 172.29.0.101: seq=2 ttl=64 time=0.424 ms

--- 172.29.0.101 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.415/5.119/14.520 ms

root@docker01:~# docker exec c1 ping 172.29.0.102 -c 3 # ノード間通信成功
PING 172.29.0.102 (172.29.0.102): 56 data bytes
64 bytes from 172.29.0.102: seq=0 ttl=64 time=10.223 ms
64 bytes from 172.29.0.102: seq=1 ttl=64 time=0.359 ms
64 bytes from 172.29.0.102: seq=2 ttl=64 time=0.423 ms

--- 172.29.0.102 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.359/3.668/10.223 ms
```

## 6. macvlan が外部ネットワークにアクセスできない場合の解決

```bash
root@docker02:~# docker exec c2 ping baidu.com -c 3 # 外部ネットワークにアクセスできない
PING baidu.com (111.63.65.247): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker exec c2 ping baidu.com -c 3
PING baidu.com (111.63.65.103): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker network connect bridge c2  # 外部ネットワークに出られるネットワーク種別を追加
root@docker02:~# docker exec c2 ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:1D:00:66
          inet addr:172.29.0.102  Bcast:172.29.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:14 errors:0 dropped:0 overruns:0 frame:0
          TX packets:16 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1068 (1.0 KiB)  TX bytes:1008 (1008.0 B)

eth1      Link encap:Ethernet  HWaddr 02:42:AC:11:00:02
          inet addr:172.17.0.2  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:9 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:806 (806.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:14 errors:0 dropped:0 overruns:0 frame:0
          TX packets:14 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:1283 (1.2 KiB)  TX bytes:1283 (1.2 KiB)
root@docker02:~# docker exec c2 ping baidu.com -c 3
PING baidu.com (111.63.65.103): 56 data bytes
64 bytes from 111.63.65.103: seq=0 ttl=127 time=46.758 ms
64 bytes from 111.63.65.103: seq=1 ttl=127 time=40.909 ms
64 bytes from 111.63.65.103: seq=2 ttl=127 time=40.681 ms

--- baidu.com ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 40.681/42.782/46.758 ms
```

## 7. macvlan の長所と短所

### 長所

- 1. Docker がネイティブに対応しており追加プラグインが不要で、設定も比較的簡単です。

- 2. 1〜3 台程度の小規模な Docker 環境に向いています。サーバーが多すぎると IP アドレスの手動割り当てが知らず知らずのうちに作業量を増やします。

### 短所

- 1. IP アドレスを手動で割り当てる必要があります。自動割り当てにすると複数のホストで自動割り当てされた IP が衝突する可能性があり、その際は人手でのメンテナンスが必要になります;

- 2. 同一ホストの同じネットワーク（本例では "dawn_macvlan"）内のコンテナ同士の通信は問題なく、ホストをまたぐコンテナ間通信も問題ありませんが、コンテナは自ホストと通信できず、外部ネットワークにも接続できません;

- 3. macvlan は物理 NIC を 1 枚バインドする必要があり、すでにバインド済みの場合は作成できません。



どうしても macvlan を使うなら IP アドレスは手動割り当てになります。ネットワークに出られない問題は "docker network connect" で外部ネットワークに出られる NIC をもう 1 枚割り当てるだけで解決します。

## 8. 実践ケース

カスタム macvlan ネットワークを使って wordpress 環境を異なるノードにデプロイする

### 1. 全ノードでカスタムネットワークを作成

```bash
# macvlan の NIC は複数セグメントにバインドできないため、以前の環境を掃除してから作成する
root@docker01:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
799bba4c0422a9770fc8da23691f6b0c19a2e1c9652cc1be48eb308926cf2103
root@docker02:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
66c3f36cfd8380014d554fa7a525c394579706d967e7b6029e0d89940a724f91
```

### 2. MySQL データベースを作成

```bash
root@docker02:~# docker run --name db-wp \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=dawn \
  -e MYSQL_PASSWORD=123456 \
  -v dawn:/var/lib/mysql \
  -d \
  --network dawn-wordpress \
  --ip 172.22.100.36 \
  mysql:8.4.1-oracle
cf4964342b754ae3864ba70d4c3e145beedfe649c7fae7cde4b619a4656eff6f
```

### 3. wordpress を作成

```bash
root@docker01:~# docker run -d --name wp \
  -e WORDPRESS_DB_HOST=172.22.100.36 \
  -e WORDPRESS_DB_USER=dawn \
  -e WORDPRESS_DB_PASSWORD=123456 \
  -e WORDPRESS_DB_NAME=wordpress \
  -p 88:80 \
  -v wordpress:/var/www/html/ \
  --ip 172.22.100.37 \
  --network dawn-wordpress \
  uhub.service.ucloud.cn/dawn/wordpress:6.8
```

### 4. wordpress が外部ネットワークに出られるようにブリッジ NIC を追加

```bash
root@docker01:~# docker ps
CONTAINER ID   IMAGE                                       COMMAND                  CREATED              STATUS              PORTS     NAMES
9054a98bfab0   uhub.service.ucloud.cn/dawn/wordpress:6.8   "docker-entrypoint.s…"   About a minute ago   Up About a minute             wp
root@docker01:~# docker network connect bridge wp
root@docker01:~# docker ps
CONTAINER ID   IMAGE                                       COMMAND                  CREATED         STATUS         PORTS                               NAMES
9054a98bfab0   uhub.service.ucloud.cn/dawn/wordpress:6.8   "docker-entrypoint.s…"   2 minutes ago   Up 2 minutes   0.0.0.0:88->80/tcp, :::88->80/tcp   wp
root@docker01:~# ss -ntl | grep 88
LISTEN 0      4096         0.0.0.0:88        0.0.0.0:*
LISTEN 0      4096            [::]:88           [::]:*
```

### 5. アクセスをテスト

![image-20261027143836481](/images/docker-macvlan-cross-host-image-20261027143836481.png)