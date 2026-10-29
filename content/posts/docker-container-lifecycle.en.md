---
title: "Docker in Practice: Container Lifecycle Management - Start, Stop and Restart Policies"
date: 2026-10-26T14:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Walk through container lifecycle management: docker stop, start and restart plus custom startup commands, then the five restart policies - create five containers with different policies, kill them with kill -9 to compare restart counters, and see which ones come back after dockerd restarts."
---

# Docker in Practice: Container Lifecycle Management - Start, Stop and Restart Policies

## 1. Starting and stopping containers

### 1. Stop a container

```bash
root@docker02:~# docker stop  -t 0 es01   # you can stop a container by name; -t sets how long to wait before sending the kill signal. If stopping takes long, the default wait is 10s
es01
root@docker02:~# docker stop 31198819a488
```

### 2. Start a container

```bash
root@docker02:~# docker start es01
es01
root@docker02:~# docker start 31198819a488
```

### 3. Restart a container

  Stop first, then start. Every time a container is stopped, STATUS is counted again from zero

```bash
root@docker02:~# docker restart es01
```

The docker stop command calls docker kill under the hood, which kills the container process ID

```bash
root@docker02:~# docker start kibana es01
kibana
es01
root@docker02:~# docker kill kibana
```

Starting a container essentially starts a process ID on the host

```bash
root@docker02:~# ps -ef | grep java
dawn       16267   16248  0 08:55 ?        00:00:08 /usr/share/elasticsearch/jdk/bin/java -Xms4m -Xmx64m -XX:+UseSerialGC -Dcli.name=server -Dcli.script=/usr/share/elasticsearch/bin/elasticsearch -Dcli.libs=lib/tools/server-cli -Des.path.home=/usr/share/elasticsearch -Des.path.conf=/usr/share/elasticsearch/config -Des.distribution.type=docker -cp /usr/share/elasticsearch/lib/*:/usr/share/elasticsearch/lib/cli-launcher/* org.elasticsearch.launcher.CliToolLauncher
dawn       16325   16267  5 08:55 ?        00:02:52 /usr/share/elasticsearch/jdk/bin/java -Des.networkaddress.cache.ttl=60 -Des.networkaddress.cache.negative.ttl=10 -Djava.security.manager=allow -XX:+AlwaysPreTouch -Xss1m -Djava.awt.headless=true -Dfile.encoding=UTF-8 -Djna.nosys=true -XX:-OmitStackTraceInFastThrow -Dio.netty.noUnsafe=true -Dio.netty.noKeySetOptimization=true -Dio.netty.recycler.maxCapacityPerThread=0 -Dlog4j.shutdownHookEnabled=false -Dlog4j2.disable.jmx=true -Dlog4j2.formatMsgNoLookups=true -Djava.locale.providers=SPI,COMPAT --add-opens=java.base/java.io=org.elasticsearch.preallocate --add-opens=org.apache.lucene.core/org.apache.lucene.store=org.elasticsearch.vec --enable-native-access=org.elasticsearch.nativeaccess -Des.cgroups.hierarchy.override=/ -XX:ReplayDataFile=logs/replay_pid%p.log -Djava.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Djna.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Des.distribution.type=docker -XX:+UnlockDiagnosticVMOptions -XX:G1NumCollectionsKeepPinned=10000000 -XX:+UseG1GC -Djava.io.tmpdir=/tmp/elasticsearch-8824704605208172111 --add-modules=jdk.incubator.vector -XX:+HeapDumpOnOutOfMemoryError -XX:+ExitOnOutOfMemoryError -XX:HeapDumpPath=data -XX:ErrorFile=logs/hs_err_pid%p.log -Xlog:gc*,gc+age=trace,safepoint:file=logs/gc.log:utctime,level,pid,tags:filecount=32,filesize=64m -Xms1937m -Xmx1937m -XX:MaxDirectMemorySize=1016070144 -XX:G1HeapRegionSize=4m -XX:InitiatingHeapOccupancyPercent=30 -XX:G1ReservePercent=15 --module-path /usr/share/elasticsearch/lib --add-modules=jdk.net --add-modules=ALL-MODULE-PATH -m org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch
root       18095    1268  0 09:50 pts/0    00:00:00 grep --color=auto java
```

## 2. Specify a custom command when starting a container

### 1. Check the container startup command

```bash
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                       COMMAND                                       CREATED          STATUS          PORTS                                       NAMES
23d3c92b8ff878aa823714d9809fe576ee58ccf4f32c82d318883a58932c6182   uhub.service.ucloud.cn/dawn/kibana:8.14.3   "/bin/tini -- /usr/local/bin/kibana-docker"   59 minutes ago   Up 59 minutes   0.0.0.0:5601->5601/tcp, :::5601->5601/tcp   kibana
```

### 2. Start a container with a custom command

```bash
root@docker02:~# docker run -d -p 81:80 --name c1 uhub.service.ucloud.cn/dawn/nginx:1.30.4 sleep 120
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                      COMMAND                             CREATED         STATUS         PORTS                               NAMES
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.sh sleep 120"   7 seconds ago   Up 7 seconds   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
```

### 3. Create a container and attach to it

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

A container startup command can be changed at start time; once changed, it overrides the default startup command;

When the container startup command exits, the container is stopped too.

## 3. Container restart policies

### 1. Restart policies

| Policy              | Meaning                            | Exit code 0 (normal) | Non-zero (abnormal)   | After dockerd restarts               |
| ------------------ | ---------------------------------- | ---------------- | -------------------- | ------------------------------------- |
| `no`               | default, never restarts            | no restart           | no restart            | not started                          |
| `always`           | always restarts                    | **restart**          | restart               | **starts unconditionally** (even after a manual stop) |
| `on-failure[:max]` | restarts only on abnormal exit     | **no restart**       | restart (stalls at the cap) | depends on the last exit        |
| `unless-stopped`   | always restarts, but not after a manual stop | **restart** | restart | starts **only if never stopped by hand** |

### 2. Hands-on example

#### 2.1 Resident service (nginx), simulating an abnormal exit

Create 5 containers, each with a different policy, in one go

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

Use kill -9 to simulate the process being killed (abnormal exit)

```bash
#### take the main process PID of every running container and kill it hard on the host
root@docker02:~# docker ps -qa | xargs -r docker inspect -f '{{.State.Pid}}' | grep -v '^0$' | xargs -r kill -9
```

Kill 5 rounds in a row and check the status and restart counters after each round

```bash
root@docker02:~# for c in $(docker ps -qa); do docker inspect -f '{{.Name}} restarts={{.RestartCount}}' $c; done
```

|         |                      |               |                       |                                  |                       |
| ------- | -------------------- | ------------- | --------------------- | -------------------------------- | --------------------- |
| Round   | policy-no            | policy-always | policy-unless-stopped | policy-on-failure(:3)            | policy-on-failure-max |
| Initial | Up                   | Up            | Up                    | Up                               | Up                    |
| Round 1 | **Exited (137)** r=0 | Up r=1        | Up r=1                | Up r=1                           | Up r=1                |
| Round 2 | Exited (137)         | Up r=2        | Up r=2                | Up r=2                           | Up r=2                |
| Round 3 | Exited (137)         | Up r=3        | Up r=3                | Up r=3                           | Up r=3                |
| Round 4 | Exited (137)         | Up r=4        | Up r=4                | **Exited (137) r=3 (capped, stalled)** | Up r=4          |
| Round 5 | Exited (137)         | Up r=5        | Up r=5                | **Exited (137) r=3 (no more restarts)** | Up r=5        |

Key output:

```
===== Round 4: kill -9 =====
policy-on-failure-max Up 2 seconds
policy-on-failure Exited (137) 2 seconds ago      ← already restarted 3 times, hitting the on-failure:3 cap
policy-unless-stopped Up 2 seconds
policy-always Up 2 seconds
policy-no Exited (137) 12 seconds ago
-- restart counters --
/policy-on-failure-max restarts=4
/policy-on-failure restarts=3                     ← stuck at 3, no longer increasing
```

#### 2.2 Short-lived task (sleep 10), the program exits on its own

```bash
root@docker02:~# docker run -d --name policy-no --restart no uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-always --restart always uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-unless-stopped --restart unless-stopped uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure --restart on-failure:3 uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure-max --restart on-failure uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
```

Right after creation (sleep not expired) all of them are Up

```bash
policy-on-failure-max Up Less than a second
policy-on-failure Up Less than a second
policy-unless-stopped Up Less than a second
policy-always Up 1 second
policy-no Up 1 second
```

Check again after waiting 35 seconds (about 3 cycles)

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

| Container             | Status after 35s | Restarts | Note                           |
| --------------------- | ----------- | -------- | ------------------------------- |
| policy-no             | Exited (0)  | 0        | never restarts                  |
| policy-always         | **Up**      | **3**    | ignores the exit code, pulls it back every time |
| policy-unless-stopped | **Up**      | **3**    | same as above                   |
| policy-on-failure(:3) | Exited (0)  | **0**    | **exit code 0 = normal exit, no restart** |
| policy-on-failure-max | Exited (0)  | **0**    | same as above                   |

---

#### 2.3 Which ones survive a docker service restart

The real difference between unless-stopped and always only shows up when dockerd is restarted

```bash
#### after recreating the 5 resident containers, stop three of them by hand (simulating "stopped by hand before the service restart")
root@docker02:~# docker stop policy-no policy-always policy-unless-stopped
policy-no
policy-always
policy-unless-stopped

root@docker02:~# docker ps -a --format '{{.Names}} {{.Status}}'
policy-on-failure-max Up 3 seconds          ← not stopped by hand
policy-on-failure Up 3 seconds              ← not stopped by hand
policy-unless-stopped Exited (0) 1 second ago
policy-always Exited (0) 1 second ago
policy-no Exited (0) 1 second ago

#### restart the docker service
root@docker02:~# systemctl restart docker
```

After the restart

```
policy-on-failure-max Up 8 seconds      restarts=0
policy-on-failure     Up 8 seconds      restarts=0
policy-unless-stopped Exited (0) 27 seconds ago   ← stopped by hand, not brought back up
policy-always         Up 8 seconds      restarts=0  ← comes back up even though it was stopped by hand
policy-no             Exited (0) 27 seconds ago
```

| Container             | Before restart | After dockerd restarts | Reason                    |
| --------------------- | --------- | --------------- | ------------------------- |
| policy-no             | manual stop | Exited        | `no` never starts automatically |
| policy-always         | manual stop | **Up**        | `always` starts unconditionally |
| policy-unless-stopped | manual stop | Exited        | stopped by hand -> that state is remembered |
| policy-on-failure(:3) | running    | Up              | counts as "interrupted", not a normal finish |
| policy-on-failure-max | running    | Up              | same as above             |

## 4. Automatically remove a container when it exits

```bash
root@docker02:~# docker run -d --name c1 --rm uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
044a33b69fca3265306c1a7c5f78a1dc6b4e7f397fff4444597a573ecf1f0809
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE                                 COMMAND                  CREATED         STATUS         PORTS     NAMES
044a33b69fca   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   8 seconds ago   Up 8 seconds   80/tcp    c1
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```
