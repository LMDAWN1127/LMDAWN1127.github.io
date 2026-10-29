---
title: "Docker 実戦：コンテナのよく使うコマンドと exec 操作"
date: 2026-10-23T15:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "日常的によく使うコンテナコマンド（一覧/削除/名前変更、-f/--since/--until でのログ追跡、docker cp でのファイルコピー）と、docker exec を使った実行中コンテナ内でのコマンド実行を解説。対象コマンドがイメージに存在する必要があるという注意点も。"
---

# Docker 実戦：コンテナのよく使うコマンドと exec 操作

## 1. よく使う docker コマンド

実行中のコンテナ一覧を表示

```bash
root@docker02:~# docker container ps
CONTAINER ID   IMAGE                                      COMMAND                  CREATED         STATUS         PORTS                               NAMES
ff10508a36b1   uhub.service.ucloud.cn/dawn/nginx:latest   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:82->80/tcp, :::82->80/tcp   c2
53efc7e7cfcb   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
root@docker02:~# docker ps
CONTAINER ID   IMAGE                                      COMMAND                  CREATED         STATUS         PORTS                               NAMES
ff10508a36b1   uhub.service.ucloud.cn/dawn/nginx:latest   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:82->80/tcp, :::82->80/tcp   c2
53efc7e7cfcb   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
```

すべてのコンテナ一覧を表示

```bash
root@docker02:~# docker ps -a
root@docker02:~# docker container ls -a
root@docker02:~# docker container ps -a
```

すべてのコンテナの ID を表示

```bash
root@docker02:~# docker container ls -a -q
```

停止中のコンテナを削除

```bash
root@docker02:~# docker container rm c3
```

実行中のコンテナを削除

```bash
root@docker02:~# docker container rm -f c1
c1
# または
root@docker02:~# docker container stop c1
c1
root@docker02:~# docker container rm c1
```

すべてのコンテナを削除

```bash
root@docker02:~# docker container rm -f `docker ps -qa`
```

コンテナの名前を変更

```bash
root@docker02:~# docker container rename c3 c4
```

コンテナのログをリアルタイムで表示

```bash
root@docker02:~# docker container logs -f   c1
root@docker02:~# docker container logs -f  --until 20m c1
root@docker02:~# docker container logs -f  --since 20m c1
```

  関連するパラメータ:

  -f:

  ログをリアルタイムで表示

  --since 20m:

  直近 20 分以内に生成されたログを表示

  --until 20m:

  20 分前より前に生成されたログを表示

最後に作成されたコンテナを表示

```bash
root@docker02:~# docker ps -l
```

ホストとコンテナ間でデータをコピー

  コンテナからホストへファイルをコピー:

```bash
root@docker02:~# docker container cp c1:/docker-entrypoint.sh /root/
```

  ホストからコンテナへファイルをコピー:

```bash
root@docker02:~# docker cp install-docker.sh c1:/
```

## 2. 実行中のコンテナ内でコマンドを実行

1. IP アドレスを表示

```bash
root@docker02:~# docker exec c1 hostname -I
172.17.0.2
```

2. シェルでコンテナに接続

```bash
root@docker02:~# docker exec -it c1 sh
# ls
bin   dev                  docker-entrypoint.sh  home  lib64  mnt  proc  run   srv  tmp  var
boot  docker-entrypoint.d  etc                   lib   media  opt  root  sbin  sys  usr
#
```

3. exec でコマンドを実行する際は、そのコンテナに当該コマンドが存在することを確認

```bash
root@docker02:~# docker exec -it c1 ifconfig
OCI runtime exec failed: exec failed: unable to start container process: exec: "ifconfig": executable file not found in $PATH: unknown
```
