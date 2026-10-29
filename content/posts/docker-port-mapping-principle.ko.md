---
title: "Docker 실전: 포트 매핑 원리 - veth NIC 에서 iptables DNAT 까지"
date: 2026-10-23T15:22:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 가 컨테이너 포트를 호스트에 어떻게 매핑하는지 관찰합니다. veth NIC 와 docker0 브리지에서 iptables DNAT 규칙, 그리고 외부 접근을 가능하게 하는 net.ipv4.ip_forward 커널 스위치까지."
---

# Docker 실전: 포트 매핑 원리 - veth NIC 에서 iptables DNAT 까지

## docker 포트 매핑 원리

1. 초기 환경

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

2. 컨테이너 2개 생성

```bash
root@docker02:~# docker run -d -p 81:80 --name c1 uhub.service.ucloud.cn/dawn/nginx:1.30.4
53efc7e7cfcbd3d23bc0eed398e20b56c61ef0b64911eee4dafa71407c581f8f
root@docker02:~# docker run -d -p 82:80 --name c2 uhub.service.ucloud.cn/dawn/nginx:latest
ff10508a36b1b9f78e1875503f4dbd17a4fdd3ad35e7fcb445f6f1834e02ce0a
```

  --name

  컨테이너 이름을 지정합니다.

3. 네트워크 인터페이스 정보 다시 확인

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

4. 컨테이너 IP 주소 확인

```bash
root@docker02:~# docker exec c1 hostname -I
172.17.0.2
root@docker02:~# docker exec c2 hostname -I
172.17.0.3
```

5. docker0 브리지가 연결한 가상 NIC 확인

```bash
root@docker02:~# apt install bridge-utils
root@docker02:~# brctl show docker0
bridge name     bridge id               STP enabled     interfaces
docker0         8000.02426035b74d       no              veth2803724
                                                        veth93ad0f5
```

6. iptables 로 컨테이너 주소 변환 확인

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

7. 포워딩 커널 파라미터 테스트

```bash
root@docker02:~# sysctl -q net.ipv4.ip_forward
net.ipv4.ip_forward = 1
```

"net.ipv4.ip_forward" 이 0 이면 컨테이너는 외부 네ットワークに 도달할 수 없고, docker0 의 패킷을 호スト의 ens33 NIC 로 포워딩할 수 없습니다.

"net.ipv4.ip_forward" 이 0 이어도 같은 노드의 컨테이너 간 통신에는 영향을 주지 않습니다.



8. ip_forward 비정상 현상과 조치

WARNING: IPv4 forwarding is disabled. Networking will not work.

  원인:

  커널 포워딩 기능이 활성화되지 않았습니다.

  해결책:

  sysctl -w net.ipv4.ip_forward=1