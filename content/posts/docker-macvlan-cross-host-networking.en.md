---
title: "Docker in Practice: macvlan for Cross-Host Container Networking"
date: 2026-10-27T14:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Create same-subnet custom networks with the macvlan driver on two Docker hosts and demonstrate cross-host Layer-2 container connectivity; also cover the fix for macvlan's default inability to reach the host or the Internet, and finish with a multi-node WordPress deployment."
---

# Docker in Practice: macvlan for Cross-Host Container Networking

macvlan is a network virtualization technology provided by the Linux kernel. It gives a container its own **independent MAC address and IP** on the host's physical network, so the container joins the Layer-2 network just like a physical machine. This article creates same-subnet custom networks with the macvlan driver on two Docker hosts (docker01 / docker02), demonstrates how containers achieve **cross-host Layer-2 connectivity**, adds the fix for the fact that "macvlan cannot reach the host or the Internet by default", and closes with a hands-on multi-node WordPress deployment.

## 1. Check Whether Both Nodes' Linux Kernel Supports the macvlan Module

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

## 2. Create Custom Networks on the Same Subnet on Both Nodes

```bash
root@docker01:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
d77a0f2205f858b463477be344303f89573ffb8b118a52de743810fd0db01fa5

root@docker02:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
1620e221dc2c17027856fa59fb9b47dd9b0ef756a5767dda4a1aaea615c49194
```

## 3. Start a Container on 11.0.1.121 with a Manually Assigned IP on the Custom Network

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

## 4. Start a Container on 11.0.1.122 with a Manually Assigned IP on the Custom Network

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

## 5. Test Connectivity Between the Two Containers

```bash
root@docker02:~# docker exec c2 ping 172.29.0.101 -c 3 # cross-node communication succeeded
PING 172.29.0.101 (172.29.0.101): 56 data bytes
64 bytes from 172.29.0.101: seq=0 ttl=64 time=14.520 ms
64 bytes from 172.29.0.101: seq=1 ttl=64 time=0.415 ms
64 bytes from 172.29.0.101: seq=2 ttl=64 time=0.424 ms

--- 172.29.0.101 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.415/5.119/14.520 ms

root@docker01:~# docker exec c1 ping 172.29.0.102 -c 3 # cross-node communication succeeded
PING 172.29.0.102 (172.29.0.102): 56 data bytes
64 bytes from 172.29.0.102: seq=0 ttl=64 time=10.223 ms
64 bytes from 172.29.0.102: seq=1 ttl=64 time=0.359 ms
64 bytes from 172.29.0.102: seq=2 ttl=64 time=0.423 ms

--- 172.29.0.102 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.359/3.668/10.223 ms
```

## 6. Fix the Case Where macvlan Cannot Reach the Internet

```bash
root@docker02:~# docker exec c2 ping baidu.com -c 3 # cannot reach the Internet
PING baidu.com (111.63.65.247): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker exec c2 ping baidu.com -c 3
PING baidu.com (111.63.65.103): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker network connect bridge c2  # attach a network type that can reach the Internet
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

## 7. Pros and Cons of macvlan

### Advantages

- 1. Natively supported by Docker, no extra plugin needed, and configuration is relatively simple.

- 2. Good for small Docker environments, for example only 1-3 hosts; with too many servers, assigning IP addresses by hand quietly adds a lot of work.

### Disadvantages

- 1. You must assign IP addresses manually; if you let Docker assign them automatically, addresses auto-allocated on different hosts may conflict, and then manual intervention is required.

- 2. Containers on the same network on one host (in this case "dawn_macvlan") can talk to each other, and containers across hosts can talk to each other too, but a container cannot communicate with its own host and cannot reach the Internet;

- 3. macvlan must bind to a physical NIC; if that NIC is already bound, the network cannot be created.



If you must use macvlan, you need to assign IP addresses manually; the lack of Internet access is solved simply by using "docker network connect" to attach another NIC that can reach the Internet.

## 8. Hands-on Case

Deploy the wordpress environment on different nodes using a custom macvlan network

### 1. Create the Custom Network on All Nodes

```bash
# a macvlan NIC cannot bind multiple subnets; clean up the previous environment before creating
root@docker01:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
799bba4c0422a9770fc8da23691f6b0c19a2e1c9652cc1be48eb308926cf2103
root@docker02:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
66c3f36cfd8380014d554fa7a525c394579706d967e7b6029e0d89940a724f91
```

### 2. Create the MySQL Database

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

### 3. Create wordpress

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

### 4. Attach a Bridge NIC So wordpress Can Reach the Internet

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

### 5. Test Access

![image-20261027143836481](/images/docker-macvlan-cross-host-image-20261027143836481.png)