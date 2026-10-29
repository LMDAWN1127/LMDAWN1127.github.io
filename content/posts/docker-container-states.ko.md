---
title: "Docker 실전: 컨테이너 상태 자세히 보기 — Up / Exited / Created / Paused"
date: 2026-10-28T11:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker ps 가 보여주는 4 가지 컨테이너 상태가 어떻게 발생하는지 하나씩 재현합니다 — Up, Exited(종료 코드 의미: 0=정상, 137=SIGKILL), Created(생성됨 but 미시작), Paused(대외 서비스 중단, 재시작과 달리 상태 시간이 초기화되지 않음)."
---

# Docker 실전: 컨테이너 상태 자세히 보기 — Up / Exited / Created / Paused

`docker ps`가 출력하는 STATUS 열은 컨테이너의 수명 주기 상태를 나타냅니다. **Up**(실행 중), **Exited**(종료됨, 괄호 안은 종료 코드), **Created**(생성되었으나 미시작), **Paused**(대외 서비스 중단)입니다. 이 글에서는 이 네 가지 상태가 어떻게 발생하는지 하나씩 재현합니다.

## 1. Up

컨테이너가 실행 중임을 나타냅니다.

## 2. Exited

컨테이너 프로세스가 종료되었음을 나타냅니다. 일반적으로 종료 코드가 0이면 정상 종료, 0이 아니면 비정상 종료입니다.

예를 들어 `sleep 3600`은 1시간 후 컨테이너가 종료됨을 의미하지만, 1시간이 되기 전에 종료되면 코드는 0이 아닙니다.

```bash
root@docker01:~# docker run -d --name c1 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 10
aee6dd889ae1f028b1f477dce2b1725a3c03b4683f9cb4ef06ce62c44aa02e96
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND      CREATED         STATUS         PORTS     NAMES
aee6dd889ae1   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 10"   8 seconds ago   Up 7 seconds             c1
root@docker01:~# docker ps -l # 종료 코드가 0임을 확인
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
root@docker01:~# docker ps -l # 종료 코드가 0이 아님을 확인
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS                        PORTS     NAMES
f95bb6bea649   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   4 minutes ago   Exited (137) 12 seconds ago             c3
```

## 3. Created

컨테이너가 생성되었으나 아직 시작되지 않은 상태입니다. `docker start` 명령으로 시작해야 합니다. `docker run`은 `docker create` + `docker start`와 같습니다.

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

컨테이너는 실행 중이지만 이 상태에서는 대외 서비스가 중단됩니다(가상 머신이 일시 정지되는 것과 비슷).

컨테이너를 재시작하면 상태 시간이 다시 초기화되지만, 일시 중지는 초기화되지 않습니다.

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
