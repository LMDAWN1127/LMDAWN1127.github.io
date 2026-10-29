---
title: "Docker 実戦：ポートマッピングの仕組み - veth NIC から iptables DNAT まで"
date: 2026-10-23T15:22:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker がコンテナポートをホストにどうマッピングするかを観察します。veth NIC や docker0 ブリッジから、iptables の DNAT ルール、そして外部アクセスを可能にする net.ipv4.ip_forward カーネルスイッチまで。"
---

# Docker 実戦：ポートマッピングの仕組み - veth NIC から iptables DNAT まで

## docker のポートマッピングの仕組み

1. 初期環境

```bash
root@docker02:~# ifconfig
docker0: flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500
        inet 172.17.0.1  netmask 255.255.0.0  broadcast 172.17.255.255
        inet6 fe80::42:60ff:fe35:b74d  prefixlen 64  scopeid 0x20<link>
        ether 02:42:60:35:b7:4d  txqueuelen 0  (Ethernet)
        RX packets 26  bytes 4752 (4.7 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 49  bytes 5226 (5.2 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

ens33: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 11.0.1.122  netmask 255.255.255.0  broadcast 11.0.1.255
        inet6 fe80::20c:29ff:fe41:61df  prefixlen 64  scopeid 0x20<link>
        ether 00:0c:29:41:61:df  txqueuelen 1000  (Ethernet)
        RX packets 314249  bytes 448056676 (448.0 MB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 32424  bytes 2514167 (2.5 MB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0
        inet6 ::1  prefixlen 128  scopeid 0x10<host>
        loop  txqueuelen 1000  (Local Loopback)
        RX packets 436  bytes 37594 (37.5 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 436  bytes 37594 (37.5 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
```

2. コンテナを 2 つ作成

```bash
root@docker02:~# docker run -d -p 81:80 --name c1 uhub.service.ucloud.cn/dawn/nginx:1.30.4
53efc7e7cfcbd3d23bc0eed398e20b56c61ef0b64911eee4dafa71407c581f8f
root@docker02:~# docker run -d -p 82:80 --name c2 uhub.service.ucloud.cn/dawn/nginx:latest
ff10508a36b1b9f78e1875503f4dbd17a4fdd3ad35e7fcb445f6f1834e02ce0a
```

  --name

  コンテナの名前を指定します。

3. ネットワークインターフェースの情報を再度確認

```bash
root@docker02:~# ifconfig
docker0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 172.17.0.1  netmask 255.255.0.0  broadcast 172.17.255.255
        inet6 fe80::42:60ff:fe35:b74d  prefixlen 64  scopeid 0x20<link>
        ether 02:42:60:35:b7:4d  txqueuelen 0  (Ethernet)
        RX packets 26  bytes 4752 (4.7 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 51  bytes 5446 (5.4 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

ens33: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 11.0.1.122  netmask 255.255.255.0  broadcast 11.0.1.255
        inet6 fe80::20c:29ff:fe41:61df  prefixlen 64  scopeid 0x20<link>
        ether 00:0c:29:41:61:df  txqueuelen 1000  (Ethernet)
        RX packets 314280  bytes 448058942 (448.0 MB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 32452  bytes 2520419 (2.5 MB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0
        inet6 ::1  prefixlen 128  scopeid 0x10<host>
        loop  txqueuelen 1000  (Local Loopback)
        RX packets 436  bytes 37594 (37.5 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 436  bytes 37594 (37.5 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

veth2803724: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet6 fe80::dc53:d2ff:fe46:17a  prefixlen 64  scopeid 0x20<link>
        ether de:53:d2:46:01:7a  txqueuelen 0  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 10  bytes 876 (876.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

veth93ad0f5: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet6 fe80::14df:5dff:feed:798e  prefixlen 64  scopeid 0x20<link>
        ether 16:df:5d:ed:79:8e  txqueuelen 0  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 6  bytes 516 (516.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
```

4. コンテナの IP アドレスを確認

```bash
root@docker02:~# docker exec c1 hostname -I
172.17.0.2
root@docker02:~# docker exec c2 hostname -I
172.17.0.3
```

5. docker0 ブリッジがブリッジしている仮想 NIC を確認

```bash
root@docker02:~# apt install bridge-utils
root@docker02:~# brctl show docker0
bridge name     bridge id               STP enabled     interfaces
docker0         8000.02426035b74d       no              veth2803724
                                                        veth93ad0f5
```

6. iptables でコンテナのアドレス変換を確認

```bash
root@docker02:~# iptables -t nat -vnL
Chain PREROUTING (policy ACCEPT 0 packets, 0 bytes)
 pkts bytes target     prot opt in     out     source               destination
    9  5962 DOCKER     all  --  *      *       0.0.0.0/0            0.0.0.0/0            ADDRTYPE match dst-type LOCAL

Chain INPUT (policy ACCEPT 0 packets, 0 bytes)
 pkts bytes target     prot opt in     out     source               destination

Chain OUTPUT (policy ACCEPT 0 packets, 0 bytes)
 pkts bytes target     prot opt in     out     source               destination
    0     0 DOCKER     all  --  *      *       0.0.0.0/0           !127.0.0.0/8          ADDRTYPE match dst-type LOCAL

Chain POSTROUTING (policy ACCEPT 0 packets, 0 bytes)
 pkts bytes target     prot opt in     out     source               destination
    0     0 MASQUERADE  all  --  *      !docker0  172.17.0.0/16        0.0.0.0/0
    0     0 MASQUERADE  tcp  --  *      *       172.17.0.2           172.17.0.2           tcp dpt:80
    0     0 MASQUERADE  tcp  --  *      *       172.17.0.3           172.17.0.3           tcp dpt:80

Chain DOCKER (2 references)
 pkts bytes target     prot opt in     out     source               destination
    0     0 RETURN     all  --  docker0 *       0.0.0.0/0            0.0.0.0/0
    0     0 DNAT       tcp  --  !docker0 *       0.0.0.0/0            0.0.0.0/0            tcp dpt:81 to:172.17.0.2:80
    0     0 DNAT       tcp  --  !docker0 *       0.0.0.0/0            0.0.0.0/0            tcp dpt:82 to:172.17.0.3:80
```

7. 転送のカーネルパラメータをテスト

```bash
root@docker02:~# sysctl -q net.ipv4.ip_forward
net.ipv4.ip_forward = 1
```

"net.ipv4.ip_forward" が 0 の場合、コンテナは外部ネットワークに到達できず、docker0 のパケットをホストの ens33 NIC に転送できません。

"net.ipv4.ip_forward" が 0 の場合でも、同一ノード上のコンテナ間通信には影響しません。



8. ip_forward の異常な挙動と対処

WARNING: IPv4 forwarding is disabled. Networking will not work.

  原因:

  カーネルの転送機能が有効になっていません。

  解決策:

  sysctl -w net.ipv4.ip_forward=1