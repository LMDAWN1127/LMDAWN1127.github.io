---
title: "Docker 실전: macvlan 으로 구현하는 컨테이너 크로스 호스트 네트워크"
date: 2026-10-27T14:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "두 Docker 호스트에서 macvlan 드라이버로 같은 대역의 커스텀 네트워크를 만들고 컨테이너 간 크로스 호스트 L2 통신을 시연합니다. 또한 macvlan 이 기본적으로 호스트나 외부망과 통신하지 못하는 문제의 해결책을 제시하고 WordPress 멀티 노드 배포 실습으로 마무리합니다."
---

# Docker 실전: macvlan 으로 구현하는 컨테이너 크로스 호스트 네트워크

macvlan 은 Linux 커널이 제공하는 네트워크 가상화 기술입니다. 컨테이너는 호스트 물리 네트워크에서 **독립된 MAC 주소와 IP** 를 직접 가지며 물리 머신처럼 L2 네트워크에 참여합니다. 이 글에서는 두 Docker 호스트(docker01 / docker02)에서 macvlan 드라이버로 같은 대역의 커스텀 네트워크를 만들고 컨테이너가 어떻게 **크로스 호스트 L2 통신**을 하는지 시연하며, "macvlan 은 기본적으로 호스트나 외부망과 통신할 수 없다"는 문제의 해결책을 덧붙이고 마지막으로 WordPress 멀티 노드 배포 실습으로 마무리합니다.

## 1. 두 노드의 Linux 커널이 macvlan 모듈을 지원하는지 확인

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

## 2. 두 노드에 같은 대역의 커스텀 네트워크 생성

```bash
root@docker01:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
d77a0f2205f858b463477be344303f89573ffb8b118a52de743810fd0db01fa5

root@docker02:~# docker network create -d macvlan --subnet 172.29.0.0/16 --gateway 172.29.0.254 -o parent=ens33 dawn-macvlan
1620e221dc2c17027856fa59fb9b47dd9b0ef756a5767dda4a1aaea615c49194
```

## 3. 11.0.1.121 노드에서 커스텀 네트워크로 컨테이너 실행 및 IP 수동 할당

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

## 4. 11.0.1.122 노드에서 커스텀 네트워크로 컨테이너 실행 및 IP 수동 할당

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

## 5. 두 컨테이너의 연결성 테스트

```bash
root@docker02:~# docker exec c2 ping 172.29.0.101 -c 3 # 크로스 노드 통신 성공
PING 172.29.0.101 (172.29.0.101): 56 data bytes
64 bytes from 172.29.0.101: seq=0 ttl=64 time=14.520 ms
64 bytes from 172.29.0.101: seq=1 ttl=64 time=0.415 ms
64 bytes from 172.29.0.101: seq=2 ttl=64 time=0.424 ms

--- 172.29.0.101 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.415/5.119/14.520 ms

root@docker01:~# docker exec c1 ping 172.29.0.102 -c 3 # 크로스 노드 통신 성공
PING 172.29.0.102 (172.29.0.102): 56 data bytes
64 bytes from 172.29.0.102: seq=0 ttl=64 time=10.223 ms
64 bytes from 172.29.0.102: seq=1 ttl=64 time=0.359 ms
64 bytes from 172.29.0.102: seq=2 ttl=64 time=0.423 ms

--- 172.29.0.102 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.359/3.668/10.223 ms
```

## 6. macvlan 이 외부망에 접근하지 못하는 문제 해결

```bash
root@docker02:~# docker exec c2 ping baidu.com -c 3 # 외부망 접근 불가
PING baidu.com (111.63.65.247): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker exec c2 ping baidu.com -c 3
PING baidu.com (111.63.65.103): 56 data bytes

--- baidu.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
root@docker02:~# docker network connect bridge c2  # 외부망에 나갈 수 있는 네트워크 타입 추가
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

## 7. macvlan 의 장단점

### 장점

- 1. Docker 가 기본 지원하므로 추가 플러그인이 필요 없고 설정도 비교적 간단하다.

- 2. 1~3 대 정도의 소규모 Docker 환경에 적합하다. 서버가 너무 많으면 IP 를 수동 할당하는 작업량이 눈에 띄지 않게 늘어난다.

### 단점

- 1. IP 주소를 수동으로 할당해야 한다. 자동 할당에 맡기면 여러 호스트에서 자동 할당된 IP 가 충돌할 수 있어 결국 사람이 개입해 관리해야 한다;

- 2. 같은 호스트의 같은 네트워크(이 예에서는 "dawn_macvlan") 안의 컨테이너끼리 통신은 문제없고 호스트를 넘나드는 컨테이너 통신도 문제없지만, 컨테이너는 자기 호스트와 통신할 수 없고 외부망에도 접속할 수 없다;

- 3. macvlan 은 물리 NIC 하나를 묶어야 하며 이미 묶여 있으면 생성할 수 없다.



꼭 macvlan 을 써야 한다면 IP 는 수동으로 할당해야 한다. 외부망 접속이 안 되는 문제는 "docker network connect" 로 외부망에 나갈 수 있는 NIC 를 하나 더 붙이면 해결된다.

## 8. 실전 사례

커스텀 macvlan 네트워크로 wordpress 환경을 서로 다른 노드에 배포

### 1. 모든 노드에 커스텀 네트워크 생성

```bash
# macvlan NIC 는 여러 대역에 바인딩할 수 없으므로 이전 환경을 정리한 뒤 생성
root@docker01:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
799bba4c0422a9770fc8da23691f6b0c19a2e1c9652cc1be48eb308926cf2103
root@docker02:~# docker network create -d macvlan --subnet 172.22.0.0/16 --gateway 172.22.0.254 -o parent=ens33 dawn-wordpress
66c3f36cfd8380014d554fa7a525c394579706d967e7b6029e0d89940a724f91
```

### 2. MySQL 데이터베이스 생성

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

### 3. wordpress 생성

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

### 4. wordpress 가 외부망에 접근하도록 브리지 NIC 추가

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

### 5. 접속 테스트

![image-20261027143836481](/images/docker-macvlan-cross-host-image-20261027143836481.png)