---
title: "Docker 実戦：コンテナライフサイクル管理——起動・停止・再起動ポリシー"
date: 2026-10-26T14:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker stop・start・restart と起動時のコマンド指定、そして 5 つの再起動ポリシーを扱います。ポリシーの異なる 5 つのコンテナを作り、kill -9 で強制終了させて再起動回数を比較し、dockerd 再起動後に復活するコンテナを確認します。"
---

# Docker 実戦：コンテナライフサイクル管理——起動・停止・再起動ポリシー

## 1. コンテナの起動と停止

### 1. コンテナを停止

```bash
root@docker02:~# docker stop  -t 0 es01   # コンテナ名を指定して停止できます。-t は kill シグナルを送るまでの待ち時間です。停止に時間がかかる場合、既定の待ち時間は 10s です
es01
root@docker02:~# docker stop 31198819a488
```

### 2. コンテナを起動

```bash
root@docker02:~# docker start es01
es01
root@docker02:~# docker start 31198819a488
```

### 3. コンテナを再起動

  まず停止し、その後に起動します。コンテナを停止するたびに STATUS は再カウントされます

```bash
root@docker02:~# docker restart es01
```

docker stop コマンドは本質的に docker kill を呼び出し、コンテナのプロセス ID を kill します

```bash
root@docker02:~# docker start kibana es01
kibana
es01
root@docker02:~# docker kill kibana
```

コンテナの起動は本質的にはホスト上で 1 つのプロセス ID を起動することです

```bash
root@docker02:~# ps -ef | grep java
dawn       16267   16248  0 08:55 ?        00:00:08 /usr/share/elasticsearch/jdk/bin/java -Xms4m -Xmx64m -XX:+UseSerialGC -Dcli.name=server -Dcli.script=/usr/share/elasticsearch/bin/elasticsearch -Dcli.libs=lib/tools/server-cli -Des.path.home=/usr/share/elasticsearch -Des.path.conf=/usr/share/elasticsearch/config -Des.distribution.type=docker -cp /usr/share/elasticsearch/lib/*:/usr/share/elasticsearch/lib/cli-launcher/* org.elasticsearch.launcher.CliToolLauncher
dawn       16325   16267  5 08:55 ?        00:02:52 /usr/share/elasticsearch/jdk/bin/java -Des.networkaddress.cache.ttl=60 -Des.networkaddress.cache.negative.ttl=10 -Djava.security.manager=allow -XX:+AlwaysPreTouch -Xss1m -Djava.awt.headless=true -Dfile.encoding=UTF-8 -Djna.nosys=true -XX:-OmitStackTraceInFastThrow -Dio.netty.noUnsafe=true -Dio.netty.noKeySetOptimization=true -Dio.netty.recycler.maxCapacityPerThread=0 -Dlog4j.shutdownHookEnabled=false -Dlog4j2.disable.jmx=true -Dlog4j2.formatMsgNoLookups=true -Djava.locale.providers=SPI,COMPAT --add-opens=java.base/java.io=org.elasticsearch.preallocate --add-opens=org.apache.lucene.core/org.apache.lucene.store=org.elasticsearch.vec --enable-native-access=org.elasticsearch.nativeaccess -Des.cgroups.hierarchy.override=/ -XX:ReplayDataFile=logs/replay_pid%p.log -Djava.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Djna.library.path=/usr/share/elasticsearch/lib/platform/linux-x64:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib -Des.distribution.type=docker -XX:+UnlockDiagnosticVMOptions -XX:G1NumCollectionsKeepPinned=10000000 -XX:+UseG1GC -Djava.io.tmpdir=/tmp/elasticsearch-8824704605208172111 --add-modules=jdk.incubator.vector -XX:+HeapDumpOnOutOfMemoryError -XX:+ExitOnOutOfMemoryError -XX:HeapDumpPath=data -XX:ErrorFile=logs/hs_err_pid%p.log -Xlog:gc*,gc+age=trace,safepoint:file=logs/gc.log:utctime,level,pid,tags:filecount=32,filesize=64m -Xms1937m -Xmx1937m -XX:MaxDirectMemorySize=1016070144 -XX:G1HeapRegionSize=4m -XX:InitiatingHeapOccupancyPercent=30 -XX:G1ReservePercent=15 --module-path /usr/share/elasticsearch/lib --add-modules=jdk.net --add-modules=ALL-MODULE-PATH -m org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch
root       18095    1268  0 09:50 pts/0    00:00:00 grep --color=auto java
```

## 2. コンテナ起動時に任意コマンドを指定

### 1.コンテナの起動コマンドを確認

```bash
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                       COMMAND                                       CREATED          STATUS          PORTS                                       NAMES
23d3c92b8ff878aa823714d9809fe576ee58ccf4f32c82d318883a58932c6182   uhub.service.ucloud.cn/dawn/kibana:8.14.3   "/bin/tini -- /usr/local/bin/kibana-docker"   59 minutes ago   Up 59 minutes   0.0.0.0:5601->5601/tcp, :::5601->5601/tcp   kibana
```

### 2.コンテナを任意コマンドで起動

```bash
root@docker02:~# docker run -d -p 81:80 --name c1 uhub.service.ucloud.cn/dawn/nginx:1.30.4 sleep 120
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85
root@docker02:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE                                      COMMAND                             CREATED         STATUS         PORTS                               NAMES
3c32a25bdbd8b38e9040b4e195c28ccaf4d118b5edb4a723e8b1940a4d5d4e85   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.sh sleep 120"   7 seconds ago   Up 7 seconds   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
```

### 3.コンテナを作成して接続

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

コンテナは起動時に起動コマンドを変更でき、変更すると既定の起動コマンドは上書きされます;

コンテナの起動コマンドが終了すると、コンテナも停止します。

## 3. コンテナの再起動ポリシー

### 1.再起動ポリシー

| ポリシー            | 意味                               | 終了コード 0 (正常) | 0 以外 (異常)        | dockerd 再起動後                      |
| ------------------ | ---------------------------------- | ---------------- | -------------------- | ------------------------------------- |
| `no`               | 既定、再起動しない                 | 再起動しない     | 再起動しない          | 起動しない                            |
| `always`           | 常に再起動                         | **再起動**      | 再起動                | **無条件で起動** (手動 stop 後でも)   |
| `on-failure[:max]` | 異常終了時のみ再起動               | **再起動しない** | 再起動 (上限到達で停止) | 前回の終了状況による                |
| `unless-stopped`   | 常に再起動するが、手動停止後は自動で引き上げない | **再起動** | 再起動 | **手動で stop していない場合のみ** 起動 |

### 2.実践ケース

#### 2.1 常駐サービス (nginx)、異常終了を再現

ポリシーの異なる 5 つのコンテナを一括で作成

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

kill -9 でプロセスが強制 kill された状態 (異常終了) を再現

```bash
#### 実行中コンテナのメインプロセス PID を取得し、ホスト側で強制 kill
root@docker02:~# docker ps -qa | xargs -r docker inspect -f '{{.State.Pid}}' | grep -v '^0$' | xargs -r kill -9
```

5 ラウンド連続で kill し、各ラウンド終了後に状態と再起動回数を確認

```bash
root@docker02:~# for c in $(docker ps -qa); do docker inspect -f '{{.Name}} restarts={{.RestartCount}}' $c; done
```

|         |                      |               |                       |                                  |                       |
| ------- | -------------------- | ------------- | --------------------- | -------------------------------- | --------------------- |
| ラウンド | policy-no            | policy-always | policy-unless-stopped | policy-on-failure(:3)            | policy-on-failure-max |
| 初期     | Up                   | Up            | Up                    | Up                               | Up                    |
| 1 ラウンド | **Exited (137)** r=0 | Up r=1      | Up r=1                | Up r=1                           | Up r=1                |
| 2 ラウンド | Exited (137)        | Up r=2        | Up r=2                | Up r=2                           | Up r=2                |
| 3 ラウンド | Exited (137)        | Up r=3        | Up r=3                | Up r=3                           | Up r=3                |
| 4 ラウンド | Exited (137)        | Up r=4        | Up r=4                | **Exited (137) r=3 (上限到達で停止)** | Up r=4          |
| 5 ラウンド | Exited (137)        | Up r=5        | Up r=5                | **Exited (137) r=3 (それ以上再起動しない)** | Up r=5      |

主な出力:

```
===== 4 ラウンド目の kill -9 =====
policy-on-failure-max Up 2 seconds
policy-on-failure Exited (137) 2 seconds ago      ← すでに 3 回再起動し、on-failure:3 の上限に到達
policy-unless-stopped Up 2 seconds
policy-always Up 2 seconds
policy-no Exited (137) 12 seconds ago
-- 再起動回数 --
/policy-on-failure-max restarts=4
/policy-on-failure restarts=3                     ← 3 で止まり、それ以上増えない
```

#### 2.2 短期タスク (sleep 10)、プログラムが自ら終了

```bash
root@docker02:~# docker run -d --name policy-no --restart no uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-always --restart always uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-unless-stopped --restart unless-stopped uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure --restart on-failure:3 uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
root@docker02:~# docker run -d --name policy-on-failure-max --restart on-failure uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
```

作成直後 (sleep が未了) はすべて Up

```bash
policy-on-failure-max Up Less than a second
policy-on-failure Up Less than a second
policy-unless-stopped Up Less than a second
policy-always Up 1 second
policy-no Up 1 second
```

35 秒 (約 3 周期) 待ってから再確認

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

| コンテナ              | 35 秒後の状態 | 再起動回数 | 説明                          |
| --------------------- | ----------- | -------- | ------------------------------- |
| policy-no             | Exited (0)  | 0        | 再起動しない                    |
| policy-always         | **Up**      | **3**    | 終了コードを見ず、死んだら即復活  |
| policy-unless-stopped | **Up**      | **3**    | 同上                            |
| policy-on-failure(:3) | Exited (0)  | **0**    | **終了コード 0 = 正常終了、再起動しない** |
| policy-on-failure-max | Exited (0)  | **0**    | 同上                            |

---

#### 2.3 docker サービス再起動後に生き残るのはどれか

unless-stopped と always の本当の違いは dockerd を再起動したときにしか現れません

```bash
#### 5 つの常駐コンテナを再作成後、うち 3 つを手動で停止 (「サービス再起動前に人手で止められた」状態を再現)
root@docker02:~# docker stop policy-no policy-always policy-unless-stopped
policy-no
policy-always
policy-unless-stopped

root@docker02:~# docker ps -a --format '{{.Names}} {{.Status}}'
policy-on-failure-max Up 3 seconds          ← 手動では停止されていない
policy-on-failure Up 3 seconds              ← 手動では停止されていない
policy-unless-stopped Exited (0) 1 second ago
policy-always Exited (0) 1 second ago
policy-no Exited (0) 1 second ago

#### docker サービスを再起動
root@docker02:~# systemctl restart docker
```

再起動後

```
policy-on-failure-max Up 8 seconds      restarts=0
policy-on-failure     Up 8 seconds      restarts=0
policy-unless-stopped Exited (0) 27 seconds ago   ← 手動で停止済みなので引き上げない
policy-always         Up 8 seconds      restarts=0  ← 手動で停止されていてもそのまま起動
policy-no             Exited (0) 27 seconds ago
```

| コンテナ              | 再起動前  | dockerd 再起動後 | 理由                    |
| --------------------- | --------- | --------------- | ------------------------- |
| policy-no             | 手動 stop | Exited        | `no` は自動起動しない      |
| policy-always         | 手動 stop | **Up**        | `always` は無条件で起動    |
| policy-unless-stopped | 手動 stop | Exited        | 手動停止済み → この状態を記憶 |
| policy-on-failure(:3) | 稼働中    | Up            | 正常完了ではなく「中断」扱い |
| policy-on-failure-max | 稼働中    | Up            | 同上                      |

## 4. コンテナ終了時の自動削除

```bash
root@docker02:~# docker run -d --name c1 --rm uhub.service.ucloud.cn/dawn/apps:v1 sleep 10
044a33b69fca3265306c1a7c5f78a1dc6b4e7f397fff4444597a573ecf1f0809
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE                                 COMMAND                  CREATED         STATUS         PORTS     NAMES
044a33b69fca   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   8 seconds ago   Up 8 seconds   80/tcp    c1
root@docker02:~# docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```
