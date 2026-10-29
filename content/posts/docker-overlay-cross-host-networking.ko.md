---
title: "Docker 실전: Overlay 로 구현하는 컨테이너 크로스 호스트 네트워크와 WordPress 실습"
date: 2026-10-27T18:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "두 Docker 호스트에 Swarm 클러스터를 초기화하고 attachable overlay 네트워크 dawn-overlay 를 만듭니다. 컨테이너가 IP 와 컨테이너 이름으로 크로스 호스트 통신하는 것을 확인하고 docker_gwbridge 를 통한 외부망 출구를 검증하며 VXLAN(UDP 4789) 캡처로 캡슐화를 관찰한 뒤 WordPress 크로스 호스트 배포 실습으로 마무리합니다."
---

# Docker 실전: Overlay 로 구현하는 컨테이너 크로스 호스트 네트워크와 WordPress 실습

## 1. 실험 목표

1. docker01 과 docker02 로 Docker Swarm 클러스터를 구성한다.
2. 커스텀 overlay 네트워크 `dawn-overlay` 를 `172.30.0.0/16` 대역으로 생성한다.
3. docker02 에서 컨테이너 `c1`, docker01 에서 컨테이너 `c2` 를 실행한다.
4. 두 컨테이너가 IP 와 컨테이너 이름으로 크로스 호스트 통신되는지 확인한다.
5. 컨테이너가 여전히 `docker_gwbridge` 를 통해 외부망에 접근하는지 확인한다.
6. 호스트 서비스 NIC `ens33` 에서 VXLAN 패킷을 캡처해 overlay 의 캡슐화 과정을 관찰한다.

## 2. 실험 환경과 토폴로지

### 2.1 호스트 환경

| 호스트 | 서비스 IP | NIC | Docker | Swarm 역할 | 테스트 컨테이너 |
|---|---|---|---|---|---|
| docker01 | 11.0.1.121/24 | ens33 | 27.0.3 | manager、leader | c2，172.30.0.3 |
| docker02 | 11.0.1.122/24 | ens33 | 27.0.3 | worker | c1，172.30.0.1 |

### 2.2 논리 토폴로지

```text
                      Swarm 클러스터
             컨트롤 플레인: Raft + 노드 탐색
                           
   docker01                              docker02
   11.0.1.121                            11.0.1.122
   manager / leader                     worker
        |                                     |
        |        UDP 4789, VXLAN 터널          |
        |<===================================>|
        |                                     |
     c2 컨테이너                               c1 컨테이너
   172.30.0.3/16                         172.30.0.1/16
        |                                     |
        +------ dawn-overlay, 동일 L2 대역 -----+

   컨테이너 외부망 접근:eth1 -> docker_gwbridge -> 호스트 NAT -> ens33
```

### 2.3 Swarm 에 필요한 포트

| 포트 | 프로토콜 | 용도 |
|---|---|---|
| 2377 | TCP | Swarm 관리 통신, 주로 노드 참여와 관리 노드 통신에 사용 |
| 7946 | TCP, UDP | 노드 간 탐색과 상태 전파 |
| 4789 | UDP | overlay 네트워크의 VXLAN 데이터 캡슐화 |

크로스 호스트 ping 이 실패하고 컨테이너와 overlay 네트워크는 이미 생성되어 있다면, 이 포트들과 중간 구간의 네트워크 보안 정책을 먼저 점검해야 한다.

## 3. docker01 에서 Swarm 초기화

docker01 에서 실행:

```bash
docker swarm init \
  --advertise-addr 11.0.1.121 \
  --listen-addr 11.0.1.121:2377
```

```bash
Swarm initialized: current node (ilsct3hz5rg7tc1ln7l426p1e) is now a manager.
```

노드 확인:

```bash
docker node ls
```

이 시점에는 관리 노드만 있습니다:

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
```

worker 참여 토큰 확인:

```bash
docker swarm join-token worker
```

토큰은 클러스터 참여 자격 증명이므로 실험을 재현할 때는 docker01 에서 실시간으로 받아야 한다.

초기화 후 docker01 은 다음을 리슨합니다:

```bash
tcp  11.0.1.121:2377
tcp  11.0.1.121:7946
udp  11.0.1.121:7946
```



### 자동 생성되는 다른 네트워크

Swarm 초기화 후에는 다음도 확인할 수 있습니다:

| 네트워크           | 역할                                                    |
| ----------------- | ------------------------------------------ |
| `ingress`         | Swarm 서비스가 포트를 게시할 때 사용하는 라우팅 메시 네트워크 |
| `docker_gwbridge` | overlay 컨테이너를 호스트와 외부망에 연결하는 로컬 브리지 네트워크 |

## 4. docker02 를 클러스터에 참여

docker02 에서 다음 명령 실행:

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

docker01 로 돌아가 확인:

```bash
docker node ls
```

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
zqccn7zzxvujvbuw8i43jczdn     docker02   Ready     Active                          27.0.3
```

두 노드가 모두 `Ready / Active` 이므로 클러스터 컨트롤 플레인이 정상입니다.

`docker node ls` 는 관리 노드 전용 명령이라 worker 에서 실행하면 현재 노드가 manager 가 아니라고 안내합니다.

## 5. 커스텀 overlay 네트워크 생성

관리 노드 docker01 에서 실행:

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

네트워크 확인:

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

Swarm 모드의 overlay 네트워크는 기본적으로 주로 service/task 용입니다. 일반 컨테이너도 `docker run --network dawn-overlay` 로 붙이려면 네트워크 생성 시 `--attachable` 을 지정해야 합니다.



네트워크를 막 만들었을 때 docker02 에서 실행:

```bash
docker network ls
docker network inspect dawn-overlay
```

관찰 결과:

```bash
Error response from daemon: network dawn-overlay not found
```

이 시점의 `docker network ls` 에도 `bridge`, `host`, `none`, `ingress`, `docker_gwbridge` 만 있고 `dawn-overlay` 는 아직 없습니다.

이것은 클러스터 동기화 실패가 아니라 워커 노드에서의 Swarm overlay 네트워크 온디맨드 배포 방식입니다. 네트워크 설정은 클러스터에 저장되지만, 워커는 컨테이너나 태스크가 실제로 그 네트워크에 붙어야 할 때 로컬 데이터 플레인 자원을 만듭니다.

## 6. docker02 에서 c1 실행

docker02 에서 실행:

```bash
docker run -d \
  --name c1 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

컨테이너 NIC 확인:

```bash
docker exec c1 ifconfig
```

주요 결과:

```text
eth0: inet addr 172.30.0.1/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

네트워크 재확인:

```bash
docker network ls --filter name=dawn-overlay
NETWORK ID     NAME           DRIVER    SCOPE
8myzpa127zbq   dawn-overlay   overlay   swarm

docker network inspect dawn-overlay \
  --format 'Id={{.Id}} Scope={{.Scope}} Attachable={{.Attachable}}'
Id=8myzpa127zbqa8x3wnzrfv1eh Scope=swarm Attachable=true
```

컨테이너가 붙으면 `dawn-overlay` 가 docker02 에 나타나고 네트워크 ID 는 docker01 과 완전히 동일합니다.

## 7. docker01 에서 c2 실행

docker01 에서 실행:

```bash
docker run -d \
  --name c2 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

NIC 확인:

```bash
docker exec c2 ifconfig
```

주요 결과:

```text
eth0: inet addr 172.30.0.3/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

## 8. 크로스 호스트 통신 검증

### 8.1 목적지 IP 로 통신

docker01 에서 실행:

```bash
docker exec c2 ping -c 3 172.30.0.1
PING 172.30.0.1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=7.124 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.414 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.518 ms

--- 172.30.0.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

### 8.2 컨테이너 이름으로 통신

이어서 실행:

```bash
docker exec c2 ping -c 3 c1
PING c1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=0.996 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.456 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.492 ms

--- c1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

운영 환경에서는 동적으로 할당된 컨테이너 IP 를 설정 파일에 하드코딩하지 말고 안정적인 서비스 이름이나 컨테이너 이름을 우선 사용해야 한다.

## 9. 라우팅과 외부망 접근 검증

c2 라우팅 확인:

```bash
docker exec c2 route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         172.18.0.1      0.0.0.0         UG    0      0        0 eth1
172.18.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth1
172.30.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth0
```

목적지가 `172.30.0.0/16` 에 속하면 overlay NIC `eth0` 으로 나갑니다.

그 밖의 주소는 기본 라우트 `172.18.0.1` 을 타며 `eth1` 과 `docker_gwbridge` 에 대응합니다.

외부망 테스트:

```bash
docker exec c2 ping -c 3 baidu.com
```

실제 결과:

```text
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 37.178/40.291/46.454 ms
```

동시에 docker01 의 `docker_gwbridge` 에서 캡처:

```bash
timeout 10 tcpdump -i docker_gwbridge -nn -c 2 icmp
```

다른 터미널에서 실행:

```bash
docker exec c2 ping -c 2 baidu.com
```

캡처된 패킷:

```text
IP 172.18.0.3 > 111.63.65.103: ICMP echo request
IP 111.63.65.103 > 172.18.0.3: ICMP echo reply
```

외부 트래픽이 overlay 의 VXLAN 터널이 아니라 `docker_gwbridge` 를 지난다는 것이 확인되었습니다.

## 10. VXLAN 크로스 호스트 패킷 캡처

docker01 에서 캡처 실행:

```bash
timeout 12 tcpdump -i ens33 -nn -vv -c 4 'udp port 4789'
```

다른 터미널에서 크로스 호스트 트래픽 발생:

```bash
docker exec c2 ping -c 4 172.30.0.1
```

주요 패킷:

```text
11.0.1.121.41805 > 11.0.1.122.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.3 > 172.30.0.1: ICMP echo request

11.0.1.122.44099 > 11.0.1.121.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.1 > 172.30.0.3: ICMP echo reply
```

캡처 통계:

```text
4 packets captured
4 packets received by filter
0 packets dropped by kernel
```

크로스 호스트 컨테이너는 원본 패킷을 VXLAN 으로 캡슐화한 뒤 두 호스트의 `ens33` 네트워크로 전송합니다.

## 11. 실전 사례: overlay 로 WordPress 배포

커스텀 overlay 네트워크 `172.23.0.0/16` 대역에 wordpress 를 배포한다.

### 11.1 네트워크 생성

```bash
# docker01
docker network create -d overlay --attachable \
  --subnet 172.23.0.0/16 --gateway 172.23.0.254 wp-overlay
```

### 11.2 docker02 에 MySQL 배포

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

### 11.3 docker01 에 WordPress 배포

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

`WORDPRESS_DB_HOST=wp-db:3306` 는 컨테이너 이름을 그대로 사용합니다. 두 컨테이너는 서로 다른 호스트에 있지만 같은 `wp-overlay` 네트워크에 있으므로 Docker 내장 DNS 가 `wp-db` 를 docker02 의 MySQL 컨테이너 IP 로 해석해 크로스 호스트 데이터베이스 접근을 구현합니다.

크로스 호스트 DNS 해석 확인:

```bash
docker exec wp-web getent hosts wp-db
172.23.0.1  wp-db
```

### 11.4 설치 페이지 확인

![image-20261027210610539](/images/docker-overlay-cross-host-networking-image-20261027210610539.png)

## 12. 실험 환경 정리

컨테이너 삭제:

```bash
# docker01
docker rm -f c2

# docker02
docker rm -f c1
```

manager 에서 커스텀 네트워크 삭제:

```bash
docker network rm dawn-overlay
```

worker 를 클러스터에서 탈퇴:

```bash
# docker02
docker swarm leave
```

manager 를 탈퇴시키고 클러스터 해산:

```bash
# docker01
docker swarm leave --force
```

정리 후 확인:

```bash
docker info --format '{{.Swarm.LocalNodeState}}'
docker network ls
docker ps -a
```
