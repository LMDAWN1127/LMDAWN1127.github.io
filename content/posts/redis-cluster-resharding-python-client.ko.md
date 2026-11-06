---
title: "Redis 분산 실전 (4): Cluster 클러스터 구축, 온라인 슬롯 확장/축소 및 Python 개발"
date: 2026-11-06T17:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cluster", "Python", "High Availability", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 분산 실전 시리즈 제4편: Redis Cluster 16384 해시 슬롯 샤딩 메커니즘과 탈중앙화 Gossip 프로토콜 심층 분석, 7000~7005 6개 노드 분산 클러스터 설계 및 원클릭 구축 실전, 노드 무중단 동적 수평 확장, 800개 슬롯의 온라인 무중단 마이그레이션(Resharding) 및 축소 시 슬롯 반환·안전한 노드 제거, 그리고 Python 클라이언트를 통한 단일 인스턴스·Sentinel 센티널 읽기/쓰기 분리·Redis Cluster 분산 연동 개발과 라이브러리 호환성 문제 해결책을 총망라합니다."
---

# Redis 분산 실전 (4): Cluster 클러스터 구축, 온라인 슬롯 확장/축소 및 Python 개발

## 4.1 Redis Cluster 분산 아키텍처 핵심 원리

단일 Redis 인스턴스는 단일 코어 CPU 처리 성능과 단일 서버 물리 메모리 한계의 제약을 받습니다. 비즈니스 데이터가 수십 GB를 초과하고 동시 처리량이 수십만 QPS에 달할 때는 분산 샤딩 클러스터를 도입해야 합니다.

### 1. 16384 해시 슬롯(Hash Slot) 샤딩 메커니즘
- Redis Cluster는 사전에 고정된 **16384개의 해시 슬롯(Slots 0~16383)** 을 할당하고, 이 16384개 슬롯을 모든 Master 노드에 균등하게 분산 배치합니다;
- 데이터를 저장할 때 Key에 대해 CRC16 체크섬을 계산하고 16384로 모듈러 연산을 수행합니다:
  $$\text{Slot} = \text{CRC16}(Key) \pmod{16384}$$
- 클라이언트는 계산된 슬롯을 담당하는 Master 노드를 찾아 읽기/쓰기를 수행하며, 잘못된 노드에 연결된 경우 해당 노드는 `MOVED` 리디렉션 명령을 반환하여 클라이언트에 올바른 노드 주소를 안내합니다.

### 2. 탈중앙화 및 자동 장애 조치
- 노드 간에는 전용 클러스터 버스(포트 오프셋 +10000, 예: 7000 노드의 클러스터 버스는 17000)를 통해 Gossip 프로토콜을 실행하며 주기적인 하트비트로 장애를 감지하고 상태를 동기화합니다;
- 각 Master 노드는 최소 하나 이상의 Slave 복제본에 대응합니다. 특정 Master 노드가 다운되면 클러스터는 해당 Slave 노드를 새 Master로 자동 승격시켜 클러스터 전체 서비스의 지속성을 보장합니다.

---

## 4.2 6개 노드 클러스터 계획 및 구축 실전

### 4.2.1 토폴로지 계획 준비

| 인스턴스 포트 | 인스턴스 역할 | 작업 디렉터리 | 담당 해시 슬롯 범위 |
| :--- | :--- | :--- | :--- |
| `7000` | Master 1 | `/data/7000` | `0 ~ 5460` (5461 slots) |
| `7001` | Master 2 | `/data/7001` | `5461 ~ 10922` (5462 slots) |
| `7002` | Master 3 | `/data/7002` | `10923 ~ 16383` (5461 slots) |
| `7003` | Slave 3 (7002 대응) | `/data/7003` | 복제본 백업 |
| `7004` | Slave 1 (7000 대응) | `/data/7004` | 복제본 백업 |
| `7005` | Slave 2 (7001 대응) | `/data/7005` | 복제본 백업 |

---

### 4.2.2 노드 설정 파일 작성 및 인스턴스 실행

```bash
# 디렉터리를 일괄 생성하고 7000~7005 설정 파일 생성
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

# 6개 클러스터 인스턴스 정상 실행 확인
[root@master ~]# ps -ef | grep redis-server | grep cluster
root  6565  1  0 15:11 ?  00:00:00 redis-server *:7000 [cluster]
root  6568  1  0 15:11 ?  00:00:00 redis-server *:7001 [cluster]
root  6575  1  0 15:11 ?  00:00:00 redis-server *:7002 [cluster]
root  6582  1  0 15:11 ?  00:00:00 redis-server *:7003 [cluster]
root  6589  1  0 15:11 ?  00:00:00 redis-server *:7004 [cluster]
root  6596  1  0 15:11 ?  00:00:00 redis-server *:7005 [cluster]
```

---

### 4.2.3 원클릭 클러스터 구축 및 슬롯 할당 (redis-cli --cluster create)

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

클러스터 토폴로지 상태 확인:
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

## 4.3 클러스터 온라인 동적 확장 (Add Node & Reshard)

비즈니스 트래픽이 급증할 때 실행 중인 서비스를 중단하지 않고 원활하게 새 노드를 추가하고 해시 슬롯을 재분배합니다.

### 1단계: 7006(새 마스터) 및 7007(새 슬레이브) 생성 및 실행

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

### 2단계: 7006을 Master로 클러스터에 편입

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7000
>>> Adding node 127.0.0.1:7006 to cluster 127.0.0.1:7000
...
>>> Send CLUSTER MEET to node 127.0.0.1:7006 to make it join the cluster.
[OK] New node added correctly.

# 7006 노드 ID 확인 (이 시점에서는 슬롯 미할당):
[root@master ~]# redis-cli -p 7000 cluster nodes | grep 7006
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949142057 0 connected
```

### 3단계: 7006으로 800개 슬롯 온라인 마이그레이션 (Resharding 재샤딩)

```bash
# 7000 및 7006의 Node ID 추출
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')

# 7000의 800개 슬롯을 7006으로 온라인 재샤딩 마이그레이션:
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7000 --cluster-to $ID_7006 --cluster-slots 800 --cluster-yes
Ready to move 800 slots.
  Source nodes: M: 5de0fa7124f106f687c5df0f823bf02c8d5f6f5c 127.0.0.1:7000
  Destination node: M: aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006
Moving slot 0 ~ 799 from 127.0.0.1:7000 to 127.0.0.1:7006...
```

### 4단계: 슬레이브 노드 7007을 7006에 복제본으로 연결

```bash
[root@master ~]# redis-cli --cluster add-node 127.0.0.1:7007 127.0.0.1:7000 --cluster-slave --cluster-master-id $ID_7006
>>> Adding node 127.0.0.1:7007 to cluster 127.0.0.1:7000
...
>>> Configure node as replica of 127.0.0.1:7006.
[OK] New node added correctly.

# 7006 및 7007 주종 토폴로지 상태 확인:
[root@master ~]# redis-cli -p 7000 cluster nodes | grep -E '7006|7007'
aaa204f9be194ae2640be58552d24446da1c83bb 127.0.0.1:7006@17006 master - 0 1793949162000 7 connected 0-799
8023a28d56a02989a0db7994502f182e6ac808bd 127.0.0.1:7007@17007 slave aaa204f9be194ae2640be58552d24446da1c83bb 0 1793949162547 0 connected
```

---

## 4.4 클러스터 온라인 동적 축소 (Reshard 슬롯 반환 & Del Node)

노드를 안전하게 제거할 때는 **반드시 해당 Master 노드의 모든 슬롯을 다른 Master 노드로 완전히 이전 반환**해야 합니다. 슬롯이 남은 상태에서 노드를 삭제하면 클러스터 슬롯 구성이 불완전해져 서비스가 거부됩니다.

```bash
ID_7000=$(redis-cli -p 7000 cluster nodes | grep 7000 | awk '{print $1}')
ID_7006=$(redis-cli -p 7000 cluster nodes | grep 7006 | awk '{print $1}')
ID_7007=$(redis-cli -p 7000 cluster nodes | grep 7007 | awk '{print $1}')

# 1. 7006의 800개 슬롯을 7000으로 완전 반환
[root@master ~]# redis-cli --cluster reshard 127.0.0.1:7000 --cluster-from $ID_7006 --cluster-to $ID_7000 --cluster-slots 800 --cluster-yes

# 2. 슬레이브 노드 7007 안전 제거
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7007 $ID_7007
>>> Removing node 8023a28d56a02989a0db7994502f182e6ac808bd from cluster 127.0.0.1:7007
[OK] Node deleted.

# 3. 마스터 노드 7006 안전 제거
[root@master ~]# redis-cli --cluster del-node 127.0.0.1:7006 $ID_7006
>>> Removing node aaa204f9be194ae2640be58552d24446da1c83bb from cluster 127.0.0.1:7006
[OK] Node deleted.
```

---

## 4.5 Python 클라이언트를 통한 API 연동 개발

### 4.5.1 Python 환경 및 라이브러리 의존성 준비

CentOS 7 환경에 Python 3 및 Redis SDK 설치:

```bash
[root@master ~]# yum install -y python3 python3-pip
[root@master ~]# python3 -V
Python 3.6.8
```

**버전 호환성 문제 해결 방안**: `redis-py-cluster 2.1.3` 라이브러리를 사용할 경우 내부적으로 구버전 `redis._compat` 모듈에 의존합니다. 최신 `redis 4.x`를 직접 설치하면 `ModuleNotFoundError: No module named 'redis._compat'` 예외가 발생합니다.  
**올바른 설치 방법**: 호환성이 검증된 `redis==3.5.3` 버전을 명시하여 설치합니다:

> ```bash
> pip3 install "redis==3.5.3" redis-py-cluster -i https://mirrors.aliyun.com/pypi/simple/
> ```

---

### 4.5.2 Python으로 Redis 단일 인스턴스 연결

```python
import redis

# 11.0.1.101 단일 인스턴스(6379 포트) 연결
r = redis.StrictRedis(host='11.0.1.101', port=6379, db=0, password='123456')
r.set('dawn', 'xiaoQ')
print(r.get('dawn'))  # 출력: b'xiaoQ'
```

---

### 4.5.3 Python으로 Sentinel 센티널 연동 및 읽기/쓰기 분리

클라이언트는 Sentinel 센티널 클러스터(`26380`)에 직접 연결하며, 센티널이 현재 활성 Master(쓰기용)와 Slaves(읽기용)를 자동 파싱하여 코드 레벨에서 읽기/쓰기 분리를 구현합니다:

```python
from redis.sentinel import Sentinel

# 1. Sentinel 센티널 클러스터 연결
sentinel = Sentinel([('localhost', 26380)], socket_timeout=0.1)

# 2. 클러스터 주종 토폴로지 자동 탐색
master_addr = sentinel.discover_master('mymaster')
slaves_addr = sentinel.discover_slaves('mymaster')
print('Master 노드 주소:', master_addr)  # 예: ('127.0.0.1', 6382)
print('Slaves 노드 주소:', slaves_addr)   # 예: [('127.0.0.1', 6381), ('127.0.0.1', 6380)]

# 3. 읽기/쓰기 분리 라우팅: Master 쓰기, Slave 읽기
master = sentinel.master_for('mymaster', socket_timeout=0.1, password='123')
slave = sentinel.slave_for('mymaster', socket_timeout=0.1, password='123')

# 4. 읽기/쓰기 테스트 수행
master.set('dawn', '123')
print('슬레이브 데이터 읽기 결과: slave.get("dawn") =', slave.get('dawn'))  # 출력: b'123'
```

---

### 4.5.4 Python으로 Redis Cluster 분산 클러스터 직접 연결

`rediscluster.RedisCluster` 클라이언트를 통해 클러스터에 연결하면, 클라이언트는 Key의 CRC16 슬롯 라우팅을 자동 처리하여 하위 샤딩 세부 사항을 투명하게 추상화합니다:

```python
from rediscluster import RedisCluster

# 클러스터 내 임의의 시드 노드들을 지정하여 클러스터 전체 토폴로지 자동 탐색
startup_nodes = [
    {"host": "127.0.0.1", "port": "7000"},
    {"host": "127.0.0.1", "port": "7001"},
    {"host": "127.0.0.1", "port": "7002"}
]

rc = RedisCluster(startup_nodes=startup_nodes, decode_responses=True)
rc.set("foo", "bar")
print('클러스터 읽기 검증: rc.get("foo") =', rc.get("foo"))  # 출력: bar
```
