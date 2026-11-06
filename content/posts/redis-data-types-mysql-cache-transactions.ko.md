---
title: "Redis 핵심 실전 (2): 5대 핵심 데이터 타입, MySQL 핫 캐시 및 트랜잭션 특성"
date: 2026-11-06T14:00:00+08:00
draft: false
author: "DAWN"
tags: ["Redis", "Cache", "MySQL", "Transactions", "Linux"]
categories: ["Redis", "Linux"]
showToc: true
summary: "Redis 핵심 실전 시리즈 제2편: 전역 키 라이프사이클 관리(keys/scan/expire/ttl) 체계적 분석, Strings, Hash, List, Set, SortedSet 5대 데이터 구조와 고동시성 카운터, 위챗 댓글 타임라인, 친구 관계 토폴로지, TopN 랭킹 실전, Linux 파이프라인을 활용한 MySQL 3308 다중 인스턴스 핫 행 데이터의 Redis Hash 일괄 마이그레이션, MySQL 엄격한 ACID 트랜잭션과 Redis 약한 트랜잭션의 비교 및 WATCH 낙관적 락 실전을 다룹니다."
---

# Redis 핵심 실전 (2): 5대 핵심 데이터 타입, MySQL 핫 캐시 및 트랜잭션 특성

## 2.1 데이터 타입 및 스토리지 모델 개요

관계형 데이터베이스에서는 테이블 스키마를 정의하고 컬럼 타입(`char`, `varchar`, `int`, `tinyint`)을 명시하여 B+ 트리 인덱스 스토리지를 최적화합니다. 반면 Redis에서는 데이터 타입이 메모리 내 데이터 저장 구조와 데이터 검색·조회 알고리즘 복잡도를 직접 결정합니다.

---

## 2.2 데이터 타입 공통 키 관리 작업

Redis는 특정 데이터 타입에 구애받지 않는 일련의 전역 키 관리 명령을 제공합니다:

```bash
# 11.0.1.101 Redis 인스턴스 접속
[root@master ~]# redis-cli -h 11.0.1.101 -p 6379 -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.

# 1. 존재하는 모든 키 이름 목록 확인
11.0.1.101:6379> keys *
 1) "city_9"
 2) "id"
 3) "city_6"
 4) "gender"
 5) "city_4"
 6) "city_1"
-- 대규모 데이터가 있는 프로덕션 환경에서 keys * 사용은 엄격히 금지됩니다(단일 스레드 블로킹 발생). scan 증분 반복 조회를 권장합니다

# 2. 키에 해당하는 데이터 타입 확인
11.0.1.101:6379> type city_1
hash
11.0.1.101:6379> type a
string

# 3. 유효 시간 설정 및 조회 (EXPIRE / TTL 및 PEXPIRE / PTTL)
11.0.1.101:6379> expire a 60
(integer) 1
11.0.1.101:6379> ttl a
(integer) 55
-- 남은 유효 초 반환; -1은 영구 보존, -2는 만료되어 삭제됨을 의미

11.0.1.101:6379> pexpire a 60000
(integer) 1
11.0.1.101:6379> pttl a
(integer) 56000
-- 밀리초 단위로 유효 시간을 설정하고 남은 시간 확인

# 4. 유효 시간 제거 (키를 메모리에 영구 상주하도록 변경)
11.0.1.101:6379> persist a
(integer) 1

# 5. 지정된 키-값 쌍 삭제
11.0.1.101:6379> del a
(integer) 1

# 6. 키 존재 여부 확인
11.0.1.101:6379> exists a
(integer) 0
-- 0은 미존재, 1은 존재를 나타냄

# 7. 키 이름 변경
11.0.1.101:6379> rename city_10 city_ten
OK
```

---

## 2.3 5대 핵심 데이터 타입 실전 활용

### 2.3.1 데이터 타입 1: Strings (문자열)

Strings는 Redis에서 가장 기본적인 데이터 구조로, 하나의 Key에 하나의 Value를 매핑합니다. 단일 Value는 최대 512MB까지 지원합니다.

#### 1. 기본 읽기/쓰기 및 일괄 작업
```redis
# 단일 저장 및 조회
11.0.1.101:6379> set name dawn
OK
11.0.1.101:6379> get name
"dawn"

# 일괄 설정 및 조회 (여러 번의 네트워크 RTT 지연 최소화)
11.0.1.101:6379> mset id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> mget id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. 고동시성 카운터 실전 (조회수, 좋아요, 주문 일련번호)
```redis
# 기본 증가 및 감소
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 1
11.0.1.101:6379> incr 123456_20240410_diancan
(integer) 2
11.0.1.101:6379> decr 123456_20240410_diancan
(integer) 1

# 지정 수치만큼 가감
11.0.1.101:6379> incrby 123456_20240410_diancan 10000
(integer) 10001
11.0.1.101:6379> decrby 123456_20240410_diancan 5000
(integer) 5001
```

---

### 2.3.2 데이터 타입 2: Hash (해시 테이블)

Hash는 String 타입의 field와 value를 매핑하는 테이블로, 객체 데이터(MySQL의 한 행 레코드와 유사)를 저장하기에 적합하며 개별 필드만을 독립적으로 수정할 수 있습니다.

#### 1. 기본 해시 읽기 및 쓰기
```redis
# 사용자 객체 레코드 저장
11.0.1.101:6379> hmset stu01 id 101 name xiaoQ age 20 gender m
OK
11.0.1.101:6379> hmset stu02 id 102 name xiaoA age 21 gender f
OK

# 특정 객체의 속성 필드 조회
11.0.1.101:6379> hmget stu01 id name age gender
1) "101"
2) "xiaoQ"
3) "20"
4) "m"
```

#### 2. 프로덕션 실전: MySQL 핫 행 데이터를 Redis Hash 캐시로 가져오기

현재 호스트 `master`에는 MySQL 8.0 다중 인스턴스 서비스(포트 `3308`, 소켓 `/data/3308/mysql.sock`)가 실행 중입니다. SQL을 사용하여 `world.city`의 핫 데이터를 Redis 명령어 형태로 연결하고 일괄 내보내기한 후 Redis에 임포트합니다:

```bash
# 1. MySQL 3308 실행 상태 확인 및 대화형 터미널 진입
[root@master ~]# systemctl start mysqld3308
[root@master ~]# mysql -S /data/3308/mysql.sock
mysql> use world;
mysql> show tables;
+----------------------+
| Tables_in_world      |
+----------------------+
| city                 |
| country              |
| countrylanguage      |
+----------------------+
3 rows in set (0.00 sec)

# 2. SQL concat 함수로 행 데이터를 hmset 명령어로 포맷 연결 후 파일 출력
mysql> select concat("hmset city_",id," id ",id," name ",name) from world.city limit 10 into outfile '/tmp/hmset.txt';
Query OK, 10 rows affected (0.00 sec)
mysql> quit

# 3. 내보낸 파일 내용 확인
[root@master ~]# cat /tmp/hmset.txt
hmset city_1 id 1 name Kabul
hmset city_2 id 2 name Qandahar
hmset city_3 id 3 name Herat
hmset city_4 id 4 name Mazar-e-Sharif
hmset city_5 id 5 name Amsterdam
hmset city_6 id 6 name Rotterdam
hmset city_7 id 7 name Haag
hmset city_8 id 8 name Utrecht
hmset city_9 id 9 name Eindhoven
hmset city_10 id 10 name Tilburg

# 4. Linux 파이프라인을 통해 초고속으로 Redis에 일괄 주입
[root@master ~]# cat /tmp/hmset.txt | redis-cli -a 123456
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
OK
OK
OK
OK
OK
OK
OK
OK
OK
OK

# 5. Redis 클라이언트에서 임포트 결과 검증
[root@master ~]# redis-cli -a 123456
127.0.0.1:6379> hgetall city_1
1) "id"
2) "1"
3) "name"
4) "Kabul"

127.0.0.1:6379> hmget city_1 id name
1) "1"
2) "Kabul"
```

> **엔터프라이즈 아키텍처 발전**: 실제 마이크로서비스 아키텍처에서는 오픈 소스 미들웨어(알리바바 Canal, Debezium 등)를 활용하여 MySQL 슬레이브로 위장하고 Binlog를 구독하여 추가 및 변경된 데이터를 실시간으로 파싱해 Redis Hash에 기록함으로써 자동화된 증분 캐시 동기화 및 갱신을 수행합니다.

---

### 2.3.3 데이터 타입 3: List (양방향 연결 리스트)

Shell / awk 배열 `array[zhangsan, lisi, wangwu]`와 유사합니다. Redis List는 문자열의 단순 양방향 연결 리스트로, 소셜 최신 피드 타임라인, 댓글 페이지네이션 표시, 경량 메시지 큐(FIFO) 구현에 주로 사용됩니다.

```redis
# 왼쪽에서부터 새 댓글을 차례대로 푸시 (최신 댓글이 맨 위에 정렬됨)
127.0.0.1:6379> LPUSH wechat "taday is nice day ~"
(integer) 1
127.0.0.1:6379> LPUSH wechat "taday is bad day ~"
(integer) 2
127.0.0.1:6379> LPUSH wechat "taday is good day ~"
(integer) 3
127.0.0.1:6379> LPUSH wechat "taday is rainy day ~"
(integer) 4
127.0.0.1:6379> LPUSH wechat "taday is friday ~"
(integer) 5

# 전체 댓글 데이터 조회 (0부터 -1까지 지정하여 전체 범위 조회)
127.0.0.1:6379> lrange wechat 0 -1
1) "taday is friday ~"
2) "taday is rainy day ~"
3) "taday is good day ~"
4) "taday is bad day ~"
5) "taday is nice day ~"
```

---

### 2.3.4 데이터 타입 4: Set (순서 없는 중복 제거 집합)

Set은 중복되지 않는 고유 요소를 갖는 String 타입의 무순서 집합입니다. 내부적으로 해시 테이블로 구현되어 시간 복잡도는 $O(1)$입니다. 교집합(`SINTER`), 합집합(`SUNION`), 차집합(`SDIFF`) 연산을 기본 지원하므로 소셜 친구 관계망 분석에 적합합니다.

```redis
# 두 사용자의 팔로우 친구 목록 등록:
127.0.0.1:6379> sadd xiaoQ xiaoA xiaoB oldgirl oldbaby tom
(integer) 5
127.0.0.1:6379> sadd dawn oldgirl oldbaby oldli Lucy tom
(integer) 5

# 1. 합집합 처리 (두 사용자의 전체 친구 집합 추출, 자동 중복 제거):
127.0.0.1:6379> SUNION xiaoQ dawn
1) "xiaoB"
2) "oldgirl"
3) "xiaoA"
4) "tom"
5) "oldli"
6) "Lucy"
7) "oldbaby"

# 2. 교집합 처리 (두 사람의 공동 친구 추출):
127.0.0.1:6379> SINTER xiaoQ dawn
1) "oldbaby"
2) "oldgirl"
3) "tom"

# 3. 차집합 처리 (한쪽에만 존재하는 친구 추출, 알 수도 있는 친구 추천):
127.0.0.1:6379> SDIFF xiaoQ dawn
1) "xiaoB"
2) "xiaoA"
-- xiaoQ에는 속하지만 dawn에게는 속하지 않는 친구

127.0.0.1:6379> SDIFF dawn xiaoQ 
1) "oldli"
2) "Lucy"
-- dawn에게는 속하지만 xiaoQ에는 속하지 않는 친구
```

---

### 2.3.5 데이터 타입 5: SortedSet (ZSet 정렬된 집합)

SortedSet은 Set의 특성 위에 각 요소마다 부동 소수점 점수(Score)를 부여한 구조입니다. 요소의 고유성은 유지되면서 점수를 기준으로 멤버가 자동으로 오름차순 정렬됩니다. 실시간 랭킹 차트, 실시간 검색어, 포인트 순위표 등에 널리 활용됩니다.

```redis
# 랭킹 생성 및 초기 가중치 점수 등록 (전체 Score 0):
127.0.0.1:6379> zadd topN 0 smlt 0 fskl 0 fshkl 0 lzlsfs 0 wdhbx 0 wxg
(integer) 6

# 인기도 급상승 시뮬레이션, ZINCRBY로 멤버 점수 동적 누적:
127.0.0.1:6379> ZINCRBY topN 100000 smlt  
"100000"
127.0.0.1:6379> ZINCRBY topN 10000 fskl
"10000"
127.0.0.1:6379> ZINCRBY topN 1000000 fshkl
"1000000"
127.0.0.1:6379> ZINCRBY topN 100 lzlsfs
"100"
127.0.0.1:6379> ZINCRBY topN 10 wdhbx
"10"
127.0.0.1:6379> ZINCRBY topN 100000000 wxg
"100000000"

# 점수가 높은 순서대로 Top 3 멤버 추출 (인덱스 0부터 2):
127.0.0.1:6379> ZREVRANGE topN 0 2
1) "wxg"
2) "fshkl"
3) "smlt"
```

---

## 2.4 Redis 트랜잭션 작업 및 약한 트랜잭션 분석

### 2.4.1 트랜잭션 개념 및 비즈니스 시나리오: 자판기 프로세스

데이터베이스 트랜잭션(Transaction)은 ACID 속성을 충족해야 하며, 그 핵심은 **A(Atomicity, 원자성)** 입니다. 즉, 트랜잭션 내의 모든 작업은 모두 성공하거나 모두 실패해야 합니다.

음료 자판기 구매 과정을 예로 들면 다음과 같은 전체 비즈니스 흐름이 수행됩니다:
1. **상품 조회**: 자판기 내부 재고 확인;
2. **결제 처리**: 데이터베이스에 접속하여 거래 내역 테이블에 출금 상세 삽입(`insert`);
3. **상품 출고**: 재고 테이블의 상품 수량 1 차감(`update stock = stock - 1`);
4. **상품 수령**: 배출구 센서 작동 및 보충 상태 업데이트(`update need_replenish = 1`).

> **예외 시나리오**: 4단계에서 모터 걸림 등으로 상품 배출에 실패한 경우, 관계형 데이터베이스에서는 반드시 **Rollback(롤백)** 메커니즘을 통해 이전의 결제 및 재고 차감을 취소하여 자산과 재고의 일관성을 유지해야 합니다.

### 2.4.2 MySQL 엄격한 원자성 vs Redis 약한 트랜잭션 비교

- **MySQL 구현 방식**:
  - **Undo Log(롤백 로그)** 를 기반으로 원자성 구현;
  - `begin`으로 트랜잭션을 시작하고 DML 작업은 메모리의 더티 페이지에서 수행되며, 오류 발생 시 `rollback`을 호출하여 Undo Log를 기반으로 역순 취소를 수행. 정상 완료 시 `commit`으로 디스크에 영구 반영.
- **Redis 약한 트랜잭션 구현 방식**:
  - **명령어 파이프라인 큐** 를 기반으로 구현;
  - 큐에 적재된 일련의 명령어들이 **순서대로 집중 실행되며 실행 도중 다른 클라이언트 명령에 방해받지 않음(격리성)** 을 보장;
  - **런타임 롤백 기능 미지원**: 큐 내부의 특정 명령어가 런타임에 에러(예: String 타입에 List 명령어 실행)를 발생시키더라도 Redis는 나머지 후속 명령어들을 계속 실행하며, **이미 성공적으로 실행된 명령어는 절대 롤백되지 않습니다!**

### 2.4.3 Redis 트랜잭션 명령어 실전

```redis
# 1. 트랜잭션 시작 (MULTI)
127.0.0.1:6379> MULTI
OK

# 2. 연속 명령어 입력 (명령어가 QUEUED 상태로 큐에 적재됨)
127.0.0.1:6379(TX)> set a b
QUEUED
127.0.0.1:6379(TX)> set c d
QUEUED

# 3. 커밋 및 실행 (EXEC, 큐 적재 순서대로 순차 실행 후 각 명령어 결과 반환)
127.0.0.1:6379(TX)> exec
1) OK
2) OK

# 4. 트랜잭션 취소 (DISCARD, 현재 명령어 큐를 비우고 트랜잭션 모드 즉시 종료)
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379(TX)> set test 123
QUEUED
127.0.0.1:6379(TX)> DISCARD
OK
127.0.0.1:6379> get test
(nil)
```

> **보충 메커니즘 (WATCH 낙관적 락)**: `MULTI`를 실행하기 전에 `WATCH <key>`로 하나 이상의 키를 모니터링할 수 있습니다. 감시 중인 키가 `EXEC` 실행 전에 다른 클라이언트에 의해 수정되면 현재 클라이언트의 전체 트랜잭션이 자동으로 중단되고 실행 실패하여 `(nil)`을 반환하므로 전형적인 낙관적 락(CAS) 동시성 제어가 구현됩니다.
