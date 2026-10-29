---
title: "Docker 실전: 컨테이너 라이프사이클 관리 - 시작, 중지, 재시작 정책"
date: 2026-10-26T14:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker stop, start, restart 와 시작 시 명령 지정, 그리고 5 가지 재시작 정책을 다룹니다. 정책이 다른 컨테이너 5 개를 만들고 kill -9 로 강제 종료해 재시작 횟수를 비교하며 dockerd 재시작 후 살아나는 컨테이너를 확인합니다."
---

# Docker 실전: 컨테이너 라이프사이클 관리 - 시작, 중지, 재시작 정책

## 1. 컨테이너 시작과 중지

### 1. 컨테이너 중지

```bash
root@docker02:~# docker stop  -t 0 es01   # 컨테이너 이름을 지정해 중지할 수 있습니다. -t 는 kill 신호를 보낼 때까지의 대기 시간입니다. 중지가 오래 걸리면 기본 대기 시간은 10s 입니다
es01
root@docker02:~# docker stop 31198819a488
```

### 2. 컨테이너 시작

```bash
root@docker02:~# docker start es01
es01
root@docker02:~# docker start 31198819a488
```

### 3. 컨테이너 재시작

  먼저 중지하고 그다음 시작합니다. 컨테이너를 중지할 때마다 STATUS 는 다시 카운트됩니다

```bash
root@docker02:~# docker restart es01
```

docker stop 명령은 본질적으로 docker kill 을 호출해 컨테이너의 프로세스 ID 를 종료합니다

```bash
root@docker02:~# docker start kibana es01
kibana
es01
root@docker02:~# docker kill kibana
```

컨테이너 시작은 본질적으로 호스트에서 프로세스 ID 하나를 시작하는 것입니다

```bash
root@docker02:~# ps -ef | grep java
dawn       16267   16248  0 08:55 ?        00:00:08 /usr/share/elasticsearch/jdk/bin/java -Xms4m -Xmx64m -XX:+UseSerialGC -Dcli.name=server -Dcli.script=/usr/share/elasticsearch/bin/elasticsearch -Dcli.libs=lib/tools/server-cli -Des.path.home=/usr/share/elasticsearch -Des.path.conf=/usr/share/elasticsearch/config -Des.distribution.type=docker -cp /usr/share/elasticsearch/lib/*:/usr/share/elasticsearch/lib/cli-launcher/* org.elasticsearch.launcher.CliToolLauncher
dawn       16325   16267  5 08:55 ?        00:02:52 /usr/share/elasticsearch/jdk/bin/java -Des.networkaddress.cache.ttl=60 -Des.networkaddress.cache.negative.ttl=10 -Djava.security.manager=allow -XX:+AlwaysPreTouch -Xss1m -Djava.awt.headless=true -Dfile.encoding=UTF-8 -Djna.nosys=true -XX:-OmitStackTraceInFastThrow -Dio.netty.noUnsafe=true -Dio.netty.noKeySetOptimization=true -Dio.netty.recycler.maxCapacityPerThread=0 -Dlog4j.shutdownHookEnabled=false -Dlog4j2.disable.jmx=true -Dlog4j2.formatMsgNoLookups=true -Djava.locale.providers=SPI,COMPAT --add-opens=java.base/java.io=org.elasticsearch.preallocate --add-opens=org.apache.lucene.core/org.apache.lucene.store=org.elasticsearch.vec --enable-native-access=org.elasticsearch.nativeaccess -Des.cgroups.hierarchy.override=/ -XX:ReplayDataFile=logs/replay_pid%p.log -Djava.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Djna.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Des.distribution.type=docker -XX:+UnlockDiagnosticVMOptions -XX:G1NumCollectionsKeepPinned=10000000 -XX:+UseG1GC -Djava.io.tmpdir=/tmp/elasticsearch-8824704605208172111 --add-modules=jdk.incubator.vector -XX:+HeapDumpOnOutOfMemoryError -XX:+ExitOnOutOfMemoryError -XX:HeapDumpPath=data -XX:ErrorFile=logs/hs_err_pid%p.log -Xlog:gc*,gc+age=trace,safepoint:file=logs/gc.log:utctime,level,pid,tags:filecount=32,filesize=64m -Xms1937m -Xmx1937m -XX:MaxDirectMemorySize=1016070144 -XX:G1HeapRegionSize=4m -XX:InitiatingHeapOccupancyPercent=30 -XX:G1ReservePercent=15 --module-path /usr/share/elasticsearch/lib --add-modules=jdk.net --add-modules=ALL-MODULE-PATH -m org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch
root       18095    1268  0 09:50 pts/0    00:00:00 grep --color=auto java
```

## 2. 컨테이너 시작 시 사용자 지정 명령 지정

### 1.컨테이너 시작 명령 확인

```bash
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                       COMMAND                                       CREATED          STATUS          PORTS                                       NAMES
23d3c92b8ff878aa823714d9809fe576ee58ccf4f32c82d318883a58932c6182   uhub.service.ucloud.cn/dawn/kibana:8.14.3   "/bin/tini -- /usr/local/bin/kibana-docker"   59 minutes ago   Up 59 minutes   0.0.0.0:5601->5601/tcp, :::5601->5601/tcp   kibana
```

### 2.컨테이너를 사용자 지정 명령으로 시작

```bash
root@docker02:~# docker run -d -p 81:80 --name c1 uhub.service.ucloud.cn/dawn/nginx:1.30.4 sleep 120
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                      COMMAND                             CREATED         STATUS         PORTS                               NAMES
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.sh sleep 120"   7 seconds ago   Up 7 seconds   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
```

### 3.컨테이너 생성 후 연결

```bash
root@docker02:~# docker run -d --name c3 uhub.service.ucloud.cn/dawn/apps:v1 sleep 120
c5b72d46d1b5a6a42523292bcd2102ad2ecab8c7c66253885ce8cddbfc1f00e5
root@docker02:~# docker exec c3 ps -ef
PID   USER     TIME  COMMAND
    1 root      0:00 sleep 120
    6 root      0:00 ps -ef
root@docker02:~# docker exec c3 nginx
2026/10/26 03:23:58 [notice] 12#12: using the "epoll" event method
2026/10/26 03:23:58 [notice] 12#12: nginx/1.20.1
2026/10/26 03:23:58 [notice] 12#12: built by gcc 10.2.1 20201203 (Alpine 10.2.1_pre1)
2026/10/26 03:23:58 [notice] 12#12: OS: Linux 5.15.0-198-generic
2026/10/26 03:23:58 [notice] 12#12: getrlimit(RLIMIT_NOFILE): 1024:524288
2026/10/26 03:23:58 [notice] 18#18: start worker processes
2026/10/26 03:23:58 [notice] 18#18: start worker process 19
2026/10/26 03:23:58 [notice] 18#18: start worker process 20
root@docker02:~# docker exec c3 ps -ef
PID   USER     TIME  COMMAND
    1 root      0:00 sleep 120
   18 root      0:00 nginx: master process nginx
   19 nginx     0:00 nginx: worker process
   20 nginx     0:00 nginx: worker process
   21 root      0:00 ps -ef
root@docker02:~# docker exec c3 nginx -s stop
2026/10/26 03:25:01 [notice] 27#27: signal process started
root@docker02:~# docker exec c3 ps -ef
PID   USER     TIME  COMMAND
    1 root      0:00 sleep 120
   18 root      0:00 [nginx]
   33 root      0:00 ps -ef
root@docker02:~# docker ps -l
CONTAINER ID   IMAGE                                 COMMAND                  CREATED         STATUS                      PORTS     NAMES
c5b72d46d1b5   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   2 minutes ago   Exited (0) 29 seconds ago             c3
root@docker02:~# docker exec c3 ps -ef
Error response from daemon: container c5b72d46d1b5a6a42523292bcd2102ad2ecab8c7c66253885ce8cddbfc1f00e5 is not running
```

컨테이너는 시작할 때 시작 명령을 바꿀 수 있고 바꾸면 기본 시작 명령을 덮어씁니다;

컨테이너의 시작 명령이 종료되면 컨테이너도 중지됩니다.

## 3. 컨테이너 재시작 정책

### 1.재시작 정책

| 정책                | 의미                               | 종료 코드 0 (정상) | 0 이외 (비정상)       | dockerd 재시작 후                     |
| ------------------ | ---------------------------------- | ---------------- | -------------------- | ------------------------------------- |
| `no`               | 기본값, 재시작하지 않음            | 재시작 안 함    | 재시작 안 함          | 시작 안 함                            |
| `always`           | 항상 재시작                        | **재시작**     | 재시작                | **무조건 시작** (수동 stop 이후에도)  |
| `on-failure[:max]` | 비정상 종료 시에만 재시작          | **재시작 안 함** | 재시작 (상한 도달 후 정지) | 마지막 종료 상황에 따라           |
| `unless-stopped`   | 항상 재시작하지만 수동 중지 후에는 자동으로 살리지 않음 | **재시작** | 재시작 | **수동 stop 한 적이 없을 때만** 시작 |

### 2.실습 사례

#### 2.1 상주 서비스 (nginx), 비정상 종료 재현

정책이 서로 다른 컨테이너 5 개를 한 번에 생성

```bash
root@docker02:~# docker run -d --name policy-no --restart no uhub.service.ucloud.cn/dawn/apps:v1
55739e4c92d6ff9c9a457f06a0da6307bff2304d18190372d77da22ad705bd78
root@docker02:~# docker run -d --name policy-always --restart always uhub.service.ucloud.cn/dawn/apps:v1
29ca89007a83d83df7842d7e40fbaa852d461fd0f3cdb3f449fa638e197e06de
root@docker02:~# docker run -d --name policy-unless-stopped --restart unless-stopped uhub.service.ucloud.cn/dawn/apps:v1
00b3fc7432f4ee82dffb42fe58e503b68c553019ff72ddad8ae74fd79b3cd392
root@docker02:~# docker run -d --name policy-on-failure --restart on-failure:3 uhub.service.ucloud.cn/dawn/apps:v1
1ede464183e3d8ff1892c596136fcec3db95f5b70586962b4d3085b60392a149
root@docker02:~# docker run -d --name policy-on-failure-max --restart on-failure uhub.service.ucloud.cn/dawn/apps:v1
49d0681c2797cb9be756d1a4b9c9de542a8f1dfd404253e51bb86fa4aba97d15
root@docker02:~# docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
NAMES                   STATUS         PORTS
policy-on-failure-max   Up 2 seconds   80/tcp
policy-on-failure       Up 2 seconds   80/tcp
policy-unless-stopped   Up 3 seconds   80/tcp
policy-always           Up 3 seconds   80/tcp
policy-no               Up 3 seconds   80/tcp
```

kill -9 로 프로세스가 강제 종료된 상태 (비정상 종료) 를 재현

```bash
#### 실행 중인 컨테이너의 메인 프로세스 PID 를 가져와 호스트에서 강제 종료
root@docker02:~# docker ps -qa | xargs -r docker inspect -f '{{.State.Pid}}' | grep -v '^0$' | xargs -r kill -9
```

5 라운드 연속으로 kill 하고 각 라운드가 끝난 뒤 상태와 재시작 횟수를 확인

```bash
root@docker02:~# for c in $(docker ps -qa); do docker inspect -f '{{.Name}} restarts={{.RestartCount}}' $c; done
```

|         |                      |               |                       |                                  |                       |
| ------- | -------------------- | ------------- | --------------------- | -------------------------------- | --------------------- |
| 라운드  | policy-no            | policy-always | policy-unless-stopped | policy-on-failure(:3)            | policy-on-failure-max |
| 초기    | Up                   | Up            | Up                    | Up                               | Up                    |
| 1 라운드 | **Exited (137)** r=0 | Up r=1      | Up r=1                | Up r=1                           | Up r=1                |
| 2 라운드 | Exited (137)        | Up r=2        | Up r=2                | Up r=2                           | Up r=2                |
| 3 라운드 | Exited (137)        | Up r=3        | Up r=3                | Up r=3                           | Up r=3                |
| 4 라운드 | Exited (137)        | Up r=4        | Up r=4                | **Exited (137) r=3 (상한 도달 후 정지)** | Up r=4        |
| 5 라운드 | Exited (137)        | Up r=5        | Up r=5                | **Exited (137) r=3 (더 이상 재시작 안 함)** | Up r=5    |

주요 출력:

```
===== 4 라운드 kill -9 =====
policy-on-failure-max Up 2 seconds
policy-on-failure Exited (137) 2 seconds ago      ← 이미 3 회 재시작되어 on-failure:3 상한에 도달
policy-unless-stopped Up 2 seconds
policy-always Up 2 seconds
policy-no Exited (137) 12 seconds ago
-- 재시작 횟수 --
/policy-on-failure-max restarts=4
/policy-on-failure restarts=3                     ← 3 에서 멈추고 더 이상 증가하지 않음
```

#### 2.2 단기 작업 (sleep 10), 프로그램이 스스로 종료

```bash
root@docker02:~# docker run -d --name policy-no --restart no uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-always --restart always uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-unless-stopped --restart unless-stopped uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure --restart on-failure:3 uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure-max --restart on-failure uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
```

생성 직후 (sleep 미완료) 는 모두 Up

```bash
policy-on-failure-max Up Less than a second
policy-on-failure Up Less than a second
policy-unless-stopped Up Less than a second
policy-always Up 1 second
policy-no Up 1 second
```

35 초 (약 3 주기) 기다린 뒤 다시 확인

```bash
root@docker02:~# docker ps -a --format '{{.Names}} {{.Status}}'
policy-on-failure-max Exited (0) 25 seconds ago
policy-on-failure Exited (0) 25 seconds ago
policy-unless-stopped Up 4 seconds
policy-always Up 4 seconds
policy-no Exited (0) 26 seconds ago

root@docker02:~# for c in $(docker ps -qa); do docker inspect -f '{{.Name}} restarts={{.RestartCount}} exitcode={{.State.ExitCode}}' $c; done
/policy-on-failure-max restarts=0 exitcode=0
/policy-on-failure     restarts=0 exitcode=0
/policy-unless-stopped restarts=3 exitcode=0
/policy-always         restarts=3 exitcode=0
/policy-no             restarts=0 exitcode=0
```

| 컨테이너              | 35 초 후 상태 | 재시작 횟수 | 설명                        |
| --------------------- | ----------- | -------- | ------------------------------- |
| policy-no             | Exited (0)  | 0        | 재시작하지 않음              |
| policy-always         | **Up**      | **3**    | 종료 코드를 보지 않고 죽으면 즉시 살림 |
| policy-unless-stopped | **Up**      | **3**    | 위와 동일                    |
| policy-on-failure(:3) | Exited (0)  | **0**    | **종료 코드 0 = 정상 종료, 재시작 안 함** |
| policy-on-failure-max | Exited (0)  | **0**    | 위와 동일                    |

---

#### 2.3 docker 서비스 재시작 후 살아남는 것은 무엇인가

unless-stopped 와 always 의 진짜 차이는 dockerd 를 재시작할 때만 드러납니다

```bash
#### 상주 컨테이너 5 개를 다시 만든 뒤 그중 3 개를 수동 중지 ("서비스 재시작 전에 사람이 멈춘 상태" 재현)
root@docker02:~# docker stop policy-no policy-always policy-unless-stopped
policy-no
policy-always
policy-unless-stopped

root@docker02:~# docker ps -a --format '{{.Names}} {{.Status}}'
policy-on-failure-max Up 3 seconds          ← 수동으로 중지되지 않음
policy-on-failure Up 3 seconds              ← 수동으로 중지되지 않음
policy-unless-stopped Exited (0) 1 second ago
policy-always Exited (0) 1 second ago
policy-no Exited (0) 1 second ago

#### docker 서비스 재시작
root@docker02:~# systemctl restart docker
```

재시작 후

```
policy-on-failure-max Up 8 seconds      restarts=0
policy-on-failure     Up 8 seconds      restarts=0
policy-unless-stopped Exited (0) 27 seconds ago   ← 수동 중지되었으므로 다시 살리지 않음
policy-always         Up 8 seconds      restarts=0  ← 수동 중지되었어도 그대로 살아남
policy-no             Exited (0) 27 seconds ago
```

| 컨테이너              | 재시작 전 | dockerd 재시작 후 | 이유                    |
| --------------------- | --------- | --------------- | ------------------------- |
| policy-no             | 수동 stop | Exited      | `no` 는 자동으로 시작하지 않음 |
| policy-always         | 수동 stop | **Up**      | `always` 는 무조건 시작    |
| policy-unless-stopped | 수동 stop | Exited      | 수동 중지됨 → 이 상태를 기억 |
| policy-on-failure(:3) | 실행 중   | Up          | 정상 완료가 아닌 "중단" 으로 취급 |
| policy-on-failure-max | 실행 중   | Up          | 위와 동일                |

## 4. 컨테이너 종료 시 자동 삭제

```bash
root@docker02:~# docker run -d --name c1 --rm uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
044a33b69fca3265306c1a7c5f78a1dc6b4e7f397fff4444597a573ecf1f0809
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE                                 COMMAND                  CREATED         STATUS         PORTS     NAMES
044a33b69fca   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   8 seconds ago   Up 8 seconds   80/tcp    c1
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```
