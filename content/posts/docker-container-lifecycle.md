---
title: "Docker 实战：容器生命周期管理——启动、停止与重启策略"
date: 2026-10-26T14:20:00+08:00
slug: docker-container-lifecycle
tags: ["Docker"]
categories: ["Docker"]
draft: false
---

# Docker 实战：容器生命周期管理——启动、停止与重启策略

## 1. 容器启动和停止

### 1. 停止容器

```bash
root@docker02:~# docker stop  -t 0 es01   # 可以指定容器的名称停止，-t表示指定等待多久后开始发送kill指令。如果停止服务较长，默认等待10s
es01
root@docker02:~# docker stop 31198819a488
```

### 2. 启动容器

```bash
root@docker02:~# docker start es01
es01
root@docker02:~# docker start 31198819a488
```

### 3. 重启容器

  先停止，在启动。只要停止容器就会重新对STATUS进行重新计数

```bash
root@docker02:~# docker restart es01
```

docker stop命令本质是调用的是docker kill表示杀死容器的进程ID

```bash
root@docker02:~# docker start kibana es01
kibana
es01
root@docker02:~# docker kill kibana
```

容器启动本质上是在宿主机上启动了一个进程ID

```bash
root@docker02:~# ps -ef | grep java
dawn       16267   16248  0 08:55 ?        00:00:08 /usr/share/elasticsearch/jdk/bin/java -Xms4m -Xmx64m -XX:+UseSerialGC -Dcli.name=server -Dcli.script=/usr/share/elasticsearch/bin/elasticsearch -Dcli.libs=lib/tools/server-cli -Des.path.home=/usr/share/elasticsearch -Des.path.conf=/usr/share/elasticsearch/config -Des.distribution.type=docker -cp /usr/share/elasticsearch/lib/*:/usr/share/elasticsearch/lib/cli-launcher/* org.elasticsearch.launcher.CliToolLauncher
dawn       16325   16267  5 08:55 ?        00:02:52 /usr/share/elasticsearch/jdk/bin/java -Des.networkaddress.cache.ttl=60 -Des.networkaddress.cache.negative.ttl=10 -Djava.security.manager=allow -XX:+AlwaysPreTouch -Xss1m -Djava.awt.headless=true -Dfile.encoding=UTF-8 -Djna.nosys=true -XX:-OmitStackTraceInFastThrow -Dio.netty.noUnsafe=true -Dio.netty.noKeySetOptimization=true -Dio.netty.recycler.maxCapacityPerThread=0 -Dlog4j.shutdownHookEnabled=false -Dlog4j2.disable.jmx=true -Dlog4j2.formatMsgNoLookups=true -Djava.locale.providers=SPI,COMPAT --add-opens=java.base/java.io=org.elasticsearch.preallocate --add-opens=org.apache.lucene.core/org.apache.lucene.store=org.elasticsearch.vec --enable-native-access=org.elasticsearch.nativeaccess -Des.cgroups.hierarchy.override=/ -XX:ReplayDataFile=logs/replay_pid%p.log -Djava.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Djna.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Des.distribution.type=docker -XX:+UnlockDiagnosticVMOptions -XX:G1NumCollectionsKeepPinned=10000000 -XX:+UseG1GC -Djava.io.tmpdir=/tmp/elasticsearch-8824704605208172111 --add-modules=jdk.incubator.vector -XX:+HeapDumpOnOutOfMemoryError -XX:+ExitOnOutOfMemoryError -XX:HeapDumpPath=data -XX:ErrorFile=logs/hs_err_pid%p.log -Xlog:gc*,gc+age=trace,safepoint:file=logs/gc.log:utctime,level,pid,tags:filecount=32,filesize=64m -Xms1937m -Xmx1937m -XX:MaxDirectMemorySize=1016070144 -XX:G1HeapRegionSize=4m -XX:InitiatingHeapOccupancyPercent=30 -XX:G1ReservePercent=15 --module-path /usr/share/elasticsearch/lib --add-modules=jdk.net --add-modules=ALL-MODULE-PATH -m org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch
root       18095    1268  0 09:50 pts/0    00:00:00 grep --color=auto java
```

## 2. 容器启动时指定自定义命令

### 1.查看容器的启动命令

```bash
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                       COMMAND                                       CREATED          STATUS          PORTS                                       NAMES
23d3c92b8ff878aa823714d9809fe576ee58ccf4f32c82d318883a58932c6182   uhub.service.ucloud.cn/dawn/kibana:8.14.3   "/bin/tini -- /usr/local/bin/kibana-docker"   59 minutes ago   Up 59 minutes   0.0.0.0:5601->5601/tcp, :::5601->5601/tcp   kibana
```

### 2.启动容器自定义命令

```bash
root@docker02:~# docker run -d -p 81:80 --name c1 uhub.service.ucloud.cn/dawn/nginx:1.30.4 sleep 120
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                      COMMAND                             CREATED         STATUS         PORTS                               NAMES
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.sh sleep 120"   7 seconds ago   Up 7 seconds   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
```

### 3.创建并连接容器

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

容器在启动时，可以修改容器的启动命令，当修改了启动命令后，会覆盖掉默认的启动命令;

容器的启动命令退出时，容器也会被停止。

## 3. 容器的重启策略

### 1.重启策略

| 策略               | 含义                               | 退出码 0（正常） | 非 0（异常）         | dockerd 重启后                        |
| ------------------ | ---------------------------------- | ---------------- | -------------------- | ------------------------------------- |
| `no`               | 默认，从不重启                     | 不重启           | 不重启               | 不启动                                |
| `always`           | 总是重启                           | **重启**         | 重启                 | **无条件启动**（哪怕之前被手动 stop） |
| `on-failure[:max]` | 仅异常退出才重启                   | **不重启**       | 重启（达上限后停摆） | 视上次退出情况                        |
| `unless-stopped`   | 总是重启，但手动停过就不再自动拉起 | **重启**         | 重启                 | 仅当**没被手动 stop 过**才启动        |

### 2.实战案例

#### 2.1 常驻服务（nginx），模拟异常退出

一次性创建 5 个策略各不相同的容器

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

用 kill -9 模拟进程被强杀（异常退出）

```bash
#### 取出所有运行中容器的主进程 PID，在宿主机上强杀
root@docker02:~# docker ps -qa | xargs -r docker inspect -f '{{.State.Pid}}' | grep -v '^0$' | xargs -r kill -9
```

连杀 5 轮，每轮结束后看状态与重启计数

```bash
root@docker02:~# for c in $(docker ps -qa); do docker inspect -f '{{.Name}} restarts={{.RestartCount}}' $c; done
```

|         |                      |               |                       |                                  |                       |
| ------- | -------------------- | ------------- | --------------------- | -------------------------------- | --------------------- |
| 轮次    | policy-no            | policy-always | policy-unless-stopped | policy-on-failure(:3)            | policy-on-failure-max |
| 初始    | Up                   | Up            | Up                    | Up                               | Up                    |
| 第 1 轮 | **Exited (137)** r=0 | Up r=1        | Up r=1                | Up r=1                           | Up r=1                |
| 第 2 轮 | Exited (137)         | Up r=2        | Up r=2                | Up r=2                           | Up r=2                |
| 第 3 轮 | Exited (137)         | Up r=3        | Up r=3                | Up r=3                           | Up r=3                |
| 第 4 轮 | Exited (137)         | Up r=4        | Up r=4                | **Exited (137) r=3（到顶停摆）** | Up r=4                |
| 第 5 轮 | Exited (137)         | Up r=5        | Up r=5                | **Exited (137) r=3（不再重启）** | Up r=5                |

关键输出：

```
===== 第 4 轮 kill -9 =====
policy-on-failure-max Up 2 seconds
policy-on-failure Exited (137) 2 seconds ago      ← 已重启 3 次，达到 on-failure:3 上限
policy-unless-stopped Up 2 seconds
policy-always Up 2 seconds
policy-no Exited (137) 12 seconds ago
-- 重启计数 --
/policy-on-failure-max restarts=4
/policy-on-failure restarts=3                     ← 停在 3，不再增长
```

#### 2.2 短期任务（sleep 10），程序主动退出

```bash
root@docker02:~# docker run -d --name policy-no --restart no uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-always --restart always uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-unless-stopped --restart unless-stopped uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure --restart on-failure:3 uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure-max --restart on-failure uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
```

刚创建时（sleep 未到期）全部 Up

```bash
policy-on-failure-max Up Less than a second
policy-on-failure Up Less than a second
policy-unless-stopped Up Less than a second
policy-always Up 1 second
policy-no Up 1 second
```

等待 35 秒（约 3 个周期）后再看

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

| 容器                  | 35 秒后状态 | 重启次数 | 说明                            |
| --------------------- | ----------- | -------- | ------------------------------- |
| policy-no             | Exited (0)  | 0        | 从不重启                        |
| policy-always         | **Up**      | **3**    | 不看退出码，死了就拉            |
| policy-unless-stopped | **Up**      | **3**    | 同上                            |
| policy-on-failure(:3) | Exited (0)  | **0**    | **退出码 0 = 正常退出，不重启** |
| policy-on-failure-max | Exited (0)  | **0**    | 同上                            |

---

#### 2.3 重启 docker 服务后谁会活过来

unless-stopped与 always的真正区别只有在重启 dockerd 时才看得出来

```bash
#### 重建 5 个常驻容器后，手动停掉其中三个（模拟"重启服务前被人为停下"）
root@docker02:~# docker stop policy-no policy-always policy-unless-stopped
policy-no
policy-always
policy-unless-stopped

root@docker02:~# docker ps -a --format '{{.Names}} {{.Status}}'
policy-on-failure-max Up 3 seconds          ← 没被手动停
policy-on-failure Up 3 seconds              ← 没被手动停
policy-unless-stopped Exited (0) 1 second ago
policy-always Exited (0) 1 second ago
policy-no Exited (0) 1 second ago

#### 重启 docker 服务
root@docker02:~# systemctl restart docker
```

重启后

```
policy-on-failure-max Up 8 seconds      restarts=0
policy-on-failure     Up 8 seconds      restarts=0
policy-unless-stopped Exited (0) 27 seconds ago   ← 手动停过，不再拉起
policy-always         Up 8 seconds      restarts=0  ← 手动停过也照样起来
policy-no             Exited (0) 27 seconds ago
```

| 容器                  | 重启前    | 重启 dockerd 后 | 原因                      |
| --------------------- | --------- | --------------- | ------------------------- |
| policy-no             | 手动 stop | Exited          | `no` 从不自动启动         |
| policy-always         | 手动 stop | **Up**          | `always` 无条件启动       |
| policy-unless-stopped | 手动 stop | Exited          | 被手动停过 → 记住这个状态 |
| policy-on-failure(:3) | 运行中    | Up              | 属于"被中断"而非正常完成  |
| policy-on-failure-max | 运行中    | Up              | 同上                      |

## 4. 容器退出时自动删除容器

```bash
root@docker02:~# docker run -d --name c1 --rm uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
044a33b69fca3265306c1a7c5f78a1dc6b4e7f397fff4444597a573ecf1f0809
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE                                 COMMAND                  CREATED         STATUS         PORTS     NAMES
044a33b69fca   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   8 seconds ago   Up 8 seconds   80/tcp    c1
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```
