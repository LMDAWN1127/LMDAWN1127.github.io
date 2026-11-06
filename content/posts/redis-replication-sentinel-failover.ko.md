---
title: "Redis 고가용성 실전 (3): Master-Replica 복제 원리와 Sentinel 자동 장애 조치"
date: 2026-11-06T16:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Sentinel", "High Availability", "Replication", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 고가용성 실전 시리즈 제3편: Redis Master-Replica 복제 내부 메커니즘(전체 BGSAVE 동기화, 지속적 명령 전파, repl_backlog 환형 버퍼를 통한 증분 복제 재개) 심층 분석, 마스터 영속성 미구성으로 인한 슬레이브 데이터 전면 초기화 사고 경고, 단일 서버 내 6380/6381/6382 3개 인스턴스 복제 토폴로지 구축, 그리고 Sentinel 센티널 클러스터를 통한 주관적/객관적 다운 판정, 리더 선출 및 무중단 자동 장애 조치 실전을 다룹니다."
---

# Redis 고가용성 실전 (3): Master-Replica 복제 원리와 Sentinel 자동 장애 조치

## 3.1 Redis Master-Replica 복제 기능 아키텍처 및 원리

### 3.1.1 주종(Master-Replica) 복제가 필요한 이유

단일 Redis 서버는 RDB 및 AOF 영속성이 활성화되어 있더라도 하드웨어 손상, 전원 장애, 메인보드 고장 발생 시 전체 서비스 중단을 피할 수 없습니다. 이에 Redis는 **복제(Replication)** 기능을 제공하여 마스터(Master) 데이터베이스의 데이터를 여러 복제본(Slave / Replica)으로 자동 비동기 복제함으로써 다음을 실현합니다:
1. **다중 복제본 재해 복구**: 단일 장애점(SPOF) 제거;
2. **읽기/쓰기 분리를 통한 확장**: Master 노드는 쓰기 작업에 전념하고, 여러 Slave 노드가 대규모 동시 읽기 트래픽 분산;
3. **고가용성의 주춧돌**: Sentinel 센티널 아키텍처 및 Redis Cluster 분산 클러스터의 기반 데이터 레이어로 기능.

---

### 3.1.2 Master-Replica 동기화 원리 심층 분석

```
[슬레이브: 6381/6382] ──(1. slaveof / PSYNC ? 전송)──> [마스터: 6380]
[슬레이브: 6381/6382] <──(2. BGSAVE 트리거, RDB 스냅샷 전송)── [마스터: 6380]
[슬레이브: 6381/6382] (3. 기존 데이터 초기화 & RDB 스냅샷 로드)
[슬레이브: 6381/6382] <──(4. Replication Buffer의 신규 쓰기 명령 전송)── [마스터: 6380]
[슬레이브: 6381/6382] <──(5. 지속적 증분 명령 전파: set 명령 동기화)── [마스터: 6380]
[슬레이브: 6381/6382] ──(6. 네트워크 순간 단절 재연결: PSYNC <runid> <offset> 전송)──> [마스터: 6380]
[슬레이브: 6381/6382] <──(7. 환형 복제 백로그 버퍼의 차량 데이터만 재전송)── [마스터: 6380]
```

1. **최초 연결 전체 복제 (SYNC / Full PSYNC)**:
   - 슬레이브가 `slaveof <master_ip> <port>`를 실행한 후 마스터에 `PSYNC ? -1` 명령을 전송;
   - 마스터는 전체 동기화 요청을 수신한 뒤 백그라운드에서 `BGSAVE`를 실행하여 RDB 바이너리 스냅샷을 생성하고, 스냅샷 생성 중에 인입되는 모든 신규 쓰기 명령을 전용 **Replication Buffer**에 임시 보관;
   - 마스터는 생성된 RDB 파일을 슬레이브로 전송하며, 슬레이브는 수신 후 먼저 자체 메모리를 비우고 RDB 파일을 메모리에 완전히 로드;
   - 마스터는 Replication Buffer에 저장된 모든 쓰기 명령을 슬레이브로 전송하여 재실행(Replay)함으로써 주종 간 데이터 일치 완료.
2. **정상 운영 중 지속적인 명령 전파**:
   - 마스터에서 새로운 쓰기 작업(예: `set`)이 발생할 때마다 프로토콜 명령 형태로 슬레이브에 비동기 전달되어 실행.
3. **네트워크 단절 후 증분 복제 (PSYNC)**:
   - 마스터는 메모리에 고정 크기의 환형 **복제 백로그 버퍼(repl_backlog)**와 복제 오프셋(Offset)을 유지;
   - 일시적인 연결 단절 후 재연결 시 슬레이브는 마스터에 `PSYNC <master_replid> <offset>` 요청을 전송;
   - 슬레이브가 요청한 오프셋이 마스터의 환형 버퍼 내에 여전히 존재하면, 마스터는 누락된 차분 데이터만 슬레이브에 이어 전송하여 비용이 큰 전체 RDB 생성 및 로딩 과정을 생략.

---

### 3.1.3 핵심 보호 매개변수 및 마스터 영속성 미구성의 치명적 사고

#### 1. 데이터 일관성 보호 매개변수 (마스터 구성)
```conf
min-slaves-to-write 1
-- 최소 1개(또는 지정 개수) 이상의 슬레이브가 정상 연결 상태여야 마스터 쓰기를 허용하며, 그렇지 않을 경우 쓰기 요청을 거부하고 에러 반환

min-slaves-max-lag 3
-- 슬레이브 하트비트 응답의 최대 지연 허용 초(이 임계값을 초과하면 연결 끊김으로 간주)
```

#### 2. 프로덕션 고위험 함정: 마스터 영속성 미구성으로 인한 슬레이브 데이터 전면 초기화 사고

**중요 경고**: 마스터 노드에서 영속성(RDB 및 AOF 모두)이 비활성화된 상태에서 마스터가 예기치 않게 다운되면 메모리 데이터는 완전히 소실(0)됩니다. 이때 외부 모니터링이나 시스템 데몬 스크립트가 마스터를 즉시 자동 재기동하면, 마스터는 **비어 있는 메모리를 기준 상태로 인식하여 빈 RDB를 생성하고 모든 슬레이브에 덮어쓰기 동기화**를 수행합니다. 그 결과 모든 슬레이브의 정상 데이터가 순식간에 완전히 영구 삭제되는 치명적 사고가 발생합니다!  
**프로덕션 표준**: 복제 아키텍처의 마스터 노드는 **반드시 영속성을 활성화**해야 합니다. 영속성이 없는 마스터가 다운된 경우 절대로 직접 재부팅해서는 안 되며, 반드시 슬레이브 중 하나를 새 마스터로 승격시킨 후 복구해야 합니다.

---

## 3.2 단일 서버 내 3개 인스턴스 주종 복제 구축 실전

호스트 `master`(`11.0.1.101`)에서 3개 인스턴스 구성 계획:

| 인스턴스 포트 | 인스턴스 역할 | 작업 디렉터리 | 로그 경로 |
| :--- | :--- | :--- | :--- |
| `6380` | 마스터 (Master) | `/data/6380` | `/data/6380/redis.log` |
| `6381` | 슬레이브 1 (Slave 1) | `/data/6381` | `/data/6381/redis.log` |
| `6382` | 슬레이브 2 (Slave 2) | `/data/6382` | `/data/6382/redis.log` |

### 1단계: 디렉터리 생성 및 인스턴스 설정 파일 작성

```bash
[root@master ~]# mkdir -p /data/638{0..2}

# 3개 인스턴스의 설정 파일을 일괄 생성 (인증 비밀번호 123 및 주종 인증 masterauth 123 포함)
for port in 6380 6381 6382; do
cat >/data/${port}/redis.conf <<EOF
port ${port}
daemonize yes
pidfile /data/${port}/redis.pid
loglevel notice
logfile "/data/${port}/redis.log"
dbfilename dump.rdb
dir /data/${port}
requirepass 123
masterauth 123
EOF
done

# 3개 Redis 인스턴스 실행
[root@master ~]# redis-server /data/6380/redis.conf
[root@master ~]# redis-server /data/6381/redis.conf
[root@master ~]# redis-server /data/6382/redis.conf

# 포트 리스닝 상태 확인
[root@master ~]# netstat -lntup | grep -E '6380|6381|6382'
tcp        0      0 0.0.0.0:6380            0.0.0.0:*               LISTEN      6332/redis-server * 
tcp        0      0 0.0.0.0:6381            0.0.0.0:*               LISTEN      6338/redis-server * 
tcp        0      0 0.0.0.0:6382            0.0.0.0:*               LISTEN      6344/redis-server * 
```

### 2단계: 주종 동기화 활성화 및 토폴로지 상태 확인

```bash
# 6381 및 6382에서 6380 마스터를 바라보도록 주종 동기화 활성화
[root@master ~]# redis-cli -p 6381 -a 123 slaveof 127.0.0.1 6380
OK
[root@master ~]# redis-cli -p 6382 -a 123 slaveof 127.0.0.1 6380
OK

# 6380 마스터의 복제 토폴로지 상태 확인 (2개 슬레이브 모두 온라인):
[root@master ~]# redis-cli -p 6380 -a 123 info replication
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
# Replication
role:master
connected_slaves:2
slave0:ip=127.0.0.1,port=6381,state=online,offset=0,lag=0
slave1:ip=127.0.0.1,port=6382,state=online,offset=0,lag=0
master_failover_state:no-failover
master_replid:b26c0fadaba463a8e0bb4b7f0b289a0c1b06f62d
master_repl_offset:0

# 6381 슬레이브 복제 상태 확인:
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6380
master_link_status:up
master_last_io_seconds_ago:2
master_sync_in_progress:0
slave_read_only:1
```

### 3단계: 주종 동기화 해제

```bash
# 특정 슬레이브를 주종 관계에서 분리하여 독립 마스터로 승격할 경우:
[root@master ~]# redis-cli -p 6382 -a 123 slaveof no one
OK
```

---

## 3.3 Redis Sentinel(센티널) 아키텍처 고가용성 실전

### 3.3.1 Sentinel 아키텍처 핵심 가치 및 구성 요소 역할

단순 주종 구조에서는 Master 노드가 다운될 경우 슬레이브가 자동으로 승격되지 않아 엔지니어의 수동 개입이 필요하며 서비스 장애 시간이 길어집니다. **Sentinel(센티널 클러스터)**을 도입하면 무인 자동 고가용성을 확보할 수 있습니다:

- **모니터링(Monitoring)**: 마스터, 슬레이브 및 다른 Sentinel 노드에 주기적으로 PING 하트비트를 전송하여 헬스체크 수행;
- **자동 장애 조치(Automatic Failover)**: 마스터의 하트비트 응답이 중단되어 주관적 다운(sdown)으로 판단되고, 과반수의 Sentinel이 객관적 다운(odown)에 합의하면 Raft 프로토콜을 통해 리더를 선출하여 최적의 슬레이브를 새 마스터로 승격;
- **토폴로지 재구성**: 나머지 슬레이브에 새 마스터를 바라보도록 동기화 방향을 재설정하고, 장애가 발생했던 기존 마스터가 복구되면 슬레이브로 새 마스터에 자동 연결;
- **클라이언트 알림**: 클라이언트는 Sentinel에 쿼리하여 현재 활성 마스터 IP/Port를 획득하므로 장애 조치가 투명하게 처리됨.

---

### 3.3.2 Sentinel 센티널 인스턴스 구축 (포트 26380)

```bash
[root@master ~]# mkdir -p /data/26380
[root@master ~]# cat >/data/26380/sentinel.conf <<EOF
port 26380
dir "/data/26380"
sentinel monitor mymaster 127.0.0.1 6380 1
-- 마스터 클러스터 모니터링 (숫자 1은 Quorum으로, 1개 센티널이 이상으로 판단하면 장애 조치 트리거)
sentinel down-after-milliseconds mymaster 5000
-- 하트비트 체크에서 5000밀리초(5초) 이상 무응답 시 주관적 다운으로 판정
sentinel auth-pass mymaster 123
-- 마스터 연결 시 사용할 인증 비밀번호
EOF

# Sentinel 센티널 서비스 프로세스 실행
[root@master ~]# redis-sentinel /data/26380/sentinel.conf &>/tmp/sentinel.log &

# 리스닝 포트 확인
[root@master ~]# netstat -lntup | grep 26380
tcp        0      0 0.0.0.0:26380           0.0.0.0:*               LISTEN      6373/redis-sentinel 
tcp6       0      0 :::26380                :::*                    LISTEN      6373/redis-sentinel 
```

---

### 3.3.3 마스터 장애 시 자동 Failover 장애 조치 전체 검증

#### 1단계: 마스터 6380 이상 다운 모의 테스트
```bash
[root@master ~]# redis-cli -p 6380 -a 123 shutdown
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
```

#### 2단계: 슬레이브 자동 승격 검증
10초 대기 후 슬레이브 `6381` 및 `6382`의 복제 상태 확인:
```bash
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
-- Sentinel이 6382를 새 마스터로 자동 선출하고, 6381을 6382로 자동 리디렉션하여 동기화 완료!
```

#### 3단계: 복구된 이전 마스터 자동 재편입 검증
```bash
# 이전 마스터 6380 재시작
[root@master ~]# redis-server /data/6380/redis.conf

# 현재 마스터 6382 또는 슬레이브 6381의 상태 확인:
[root@master ~]# redis-cli -p 6381 -a 123 info replication
# Replication
role:slave
master_host:127.0.0.1
master_port:6382
master_link_status:up
slave_read_repl_offset:996
-- 6380은 시작 후 Sentinel에 의해 자동으로 Slave로 강등되어 새 Master 6382에 연결되므로 토폴로지가 자동 복구됨
```

---

### 3.3.4 Sentinel 주요 운영 관리 명령어

```bash
# Sentinel 대화형 클라이언트 접속
[root@master ~]# redis-cli -p 26380

# 1. 모니터링 대상 마스터의 상세 실행 상태 및 구성 확인
127.0.0.1:26380> SENTINEL masters

# 2. 지정 클러스터의 모든 슬레이브 정보 확인
127.0.0.1:26380> SENTINEL slaves mymaster

# 3. 현재 활성 마스터의 IP와 포트 신속 조회 (클라이언트 라우팅 핵심 명령)
127.0.0.1:26380> SENTINEL get-master-addr-by-name mymaster
1) "127.0.0.1"
2) "6382"

# 4. 수동으로 강제 장애 조치 전환 실행
127.0.0.1:26380> SENTINEL failover mymaster
OK
```
