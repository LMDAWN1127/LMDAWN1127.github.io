---
title: "Docker 实战：macvlan 实现容器跨主机网络互联"
date: 2026-10-27T14:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "在两台 Docker 主机上用 macvlan 驱动创建同网段自定义网络，演示容器跨主机二层互通；并给出 macvlan 默认无法连通宿主机/外网的解决办法，最后以 WordPress 多节点部署实战收尾。"
---

# Docker 实战：macvlan 实现容器跨主机网络互联

macvlan 是 Linux 内核提供的网络虚拟化技术，它让容器直接拥有宿主机物理网络中的**独立 MAC 地址与 IP**，从而像物理机一样接入二层网络。本文在两台 Docker 主机（docker01 / docker02）上用 macvlan 驱动创建同网段自定义网络，演示容器如何**跨主机二层互通**，并补充「macvlan 默认无法连通宿主机与外网」的解决办法，最后用一个 WordPress 多节点部署实战收尾。

## 1. 两个节点加载Linux内核是否支持macvlan模块

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

## 2. 两个节点创建同网段的自定义网络类型

```bash
root@docker01:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
d77a0f2205f858b463477be344303f89573ffb8b118a52de743810fd0db01fa5

root@docker02:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
1620e221dc2c17027856fa59fb9b47dd9b0ef756a5767dda4a1aaea615c49194
```

## 3. 11.0.1.121节点基于自定义网络启动容器并手动分配IP地址

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

## 4. 11.0.1.122节点基于自定义网络启动容器并手动分配IP地址

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

## 5. 测试2个容器的连通性

```bash
root@docker02:~# docker exec c2 ping 172.29.0.101 -c 3 # 跨节点通讯成功
PING 172.29.0.101 (172.29.0.101): 56 data bytes
64 bytes from 172.29.0.101: seq=0 ttl=64 time=14.520 ms
64 bytes from 172.29.0.101: seq=1 ttl=64 time=0.415 ms
64 bytes from 172.29.0.101: seq=2 ttl=64 time=0.424 ms

--- 172.29.0.101 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.415/5.119/14.520 ms

root@docker01:~# docker exec c1 ping 172.29.0.102 -c 3 # 跨节点通讯成功
PING 172.29.0.102 (172.29.0.102): 56 data bytes
64 bytes from 172.29.0.102: seq=0 ttl=64 time=10.223 ms
64 bytes from 172.29.0.102: seq=1 ttl=64 time=0.359 ms
64 bytes from 172.29.0.102: seq=2 ttl=64 time=0.423 ms

--- 172.29.0.102 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.359/3.668/10.223 ms
```

## 6. 解决macvlan无法访问外网的情况

```bash
root@docker02:~# docker exec c2 ping baidu.com -c 3 # 无法访问外网
PING baidu.com (111.63.65.247): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker exec c2 ping baidu.com -c 3
PING baidu.com (111.63.65.103): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker network connect bridge c2  # 添加一个能够访问外网的网络类型
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

## 7. macvlan的优缺点

### 优点

- 1. docker原生支持，无需安装额外插件，配置起来相对简单。

- 2. 适合小规模docker环境，例如只有1-3台，如果服务器过多，手动分配IP地址可能会无形之间增加工作量。

### 缺点

- 1. 需要手动分配IP地址，如果让其自动分配IP地址可能会存在多个主机自动分配的IP地址冲突的情况，到时候还需要人工介入维护;

- 2. 本机相同网络(本案例为"dawn_macvlan")的容器之间相互通信没问题，跨主机之间的容器进行通信也没问题，但容器无法与宿主机之间进行通信，也无法连接到外网;

- 3. macvlan需要绑定一块物理网卡，若网卡已经被绑定，则无法创建。



如果非要使用macvlan，我们需要手动分配IP地址，无法联网的问题，只需要使用"docker network connect"重新分配一块能够访问外网的网卡即可解决。

## 8. 实战案例

使用自定义macvlan网络将wordpress环境部署在不同节点

### 1. 所有节点创建自定义网络

```bash
# macvlan网卡不能多个网段绑定，需要清除之前的环境再创建
root@docker01:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
799bba4c0422a9770fc8da23691f6b0c19a2e1c9652cc1be48eb308926cf2103
root@docker02:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
66c3f36cfd8380014d554fa7a525c394579706d967e7b6029e0d89940a724f91
```

### 2. 创建MySQL数据库

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

### 3. 创建wordpress

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

### 4. 添加一块桥接网卡，以便于wordpress能够访问外网

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

### 5. 测试访问

![image-20261027143836481](/images/docker-macvlan-cross-host-image-20261027143836481.png)