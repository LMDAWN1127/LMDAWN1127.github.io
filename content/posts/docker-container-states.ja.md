---
title: "Docker 実戦：コンテナの状態を詳しく — Up / Exited / Created / Paused"
date: 2026-10-28T11:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker ps が表示する 4 つのコンテナ状態がどう発生するかを順に再現します — Up、Exited（終了コードの意味: 0=正常, 137=SIGKILL）、Created（作成済みだが未起動）、Paused（サービス提供を停止、再起動とは異なり状態の時間はリセットされない）。"
---

# Docker 実戦：コンテナの状態を詳しく — Up / Exited / Created / Paused

`docker ps` の出力する STATUS 列は、コンテナのライフサイクル状態そのものです。**Up**（実行中）、**Exited**（終了、括弧内は終了コード）、**Created**（作成済みだが未起動）、**Paused**（外部へのサービス提供を停止）の 4 つです。本記事ではこの 4 つの状態がどのように発生するかを順に再現します。

## 1. Up

コンテナが実行中であることを表します。

## 2. Exited

コンテナのプロセスが終了したことを表します。通常、終了コードが 0 なら正常終了、0 以外なら異常終了です。

例えば `sleep 3600` は 1 時間後にコンテナが終了することを意味しますが、1 時間前に終了すればコードは 0 以外になります。

```bash
root@docker01:~# docker run -d --name c1 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 10
aee6dd889ae1f028b1f477dce2b1725a3c03b4683f9cb4ef06ce62c44aa02e96
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND      CREATED         STATUS         PORTS     NAMES
aee6dd889ae1   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 10"   8 seconds ago   Up 7 seconds             c1
root@docker01:~# docker ps -l # 終了コードが0であることを確認
CONTAINER ID   IMAGE                                               COMMAND      CREATED          STATUS                     PORTS     NAMES
aee6dd889ae1   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 10"   18 seconds ago   Exited (0) 7 seconds ago             c1

root@docker01:~# docker run -d --name c3 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
f95bb6bea64926abf65662f844596b0cd240858f6e5ddcb1c4d2c7409c083885
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS         PORTS     NAMES
f95bb6bea649   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   2 minutes ago   Up 2 minutes             c3
root@docker01:~# docker inspect  -f "{{.State.Pid}}" c3
7158
root@docker01:~# kill -9 7158
root@docker01:~# docker ps -l # 終了コードが0でないことを確認
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS                        PORTS     NAMES
f95bb6bea649   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   4 minutes ago   Exited (137) 12 seconds ago             c3
```

## 3. Created

コンテナが作成されたがまだ起動していない状態です。`docker start` コマンドで起動する必要があります。`docker run` は `docker create` + `docker start` と等価です。

```bash
root@docker01:~# docker create --name c3 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
0d1f9b6be2ebe5ae3b26dcd760df11e916bcba6f741e0f6110cc7e56089b28ae
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS    PORTS     NAMES
0d1f9b6be2eb   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   5 seconds ago   Created             c3
root@docker01:~# docker start c3
c3
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND        CREATED          STATUS         PORTS     NAMES
0d1f9b6be2eb   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   26 seconds ago   Up 8 seconds             c3

root@docker01:~# docker run -d --name c4 -p 80:80 uhub.service.ucloud.cn/dawn/apps:v1
e19ebe79516214e59ea5b0197ee6ce760805eb9033b6acb433d83019b8403820
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                 COMMAND                  CREATED          STATUS          PORTS                               NAMES
e19ebe795162   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   52 seconds ago   Up 51 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   c4
```

## 4. Paused

コンテナは実行中ですが、この状態では外部へのサービス提供を停止します（仮想マシンがサスペンドされるのに似ています）。

コンテナを再起動すると状態の時間がリセットされますが、一時停止ではリセットされません。

```bash
root@docker01:~# docker container pause c4
c4
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                 COMMAND                  CREATED          STATUS                   PORTS                               NAMES
e99412feba6d   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   15 seconds ago   Up 15 seconds (Paused)   0.0.0.0:80->80/tcp, :::80->80/tcp   c4
root@docker01:~# docker restart c4
c4
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                 COMMAND                  CREATED              STATUS         PORTS                               NAMES
e99412feba6d   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   About a minute ago   Up 2 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   c4
```
