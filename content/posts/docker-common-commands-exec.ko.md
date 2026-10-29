---
title: "Docker 실전: 자주 쓰는 컨테이너 명령과 exec 작업"
date: 2026-10-23T15:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "매일 쓰는 컨테이너 명령(목록/삭제/이름 변경, -f/--since/--until 로그 추적, docker cp 파일 복사)과 docker exec 로 실행 중인 컨테이너 내부에서 명령을 실행하는 방법을 다룹니다. 대상 명령이 이미지에 존재해야 한다는 주의점도 포함합니다."
---

# Docker 실전: 자주 쓰는 컨테이너 명령과 exec 작업

## 1. 자주 쓰는 docker 명령

실행 중인 컨테이너 목록 보기

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

모든 컨테이너 목록 보기

```bash
root@docker02:~# docker ps -a
root@docker02:~# docker container ls -a
root@docker02:~# docker container ps -a
```

모든 컨테이너의 ID 보기

```bash
root@docker02:~# docker container ls -a -q
```

멈춘 컨테이너 삭제

```bash
root@docker02:~# docker container rm c3
```

실행 중인 컨테이너 삭제

```bash
root@docker02:~# docker container rm -f c1
c1
# 또는
root@docker02:~# docker container stop c1
c1
root@docker02:~# docker container rm c1
```

모든 컨테이너 삭제

```bash
root@docker02:~# docker container rm -f `docker ps -qa`
```

컨테이너 이름 변경

```bash
root@docker02:~# docker container rename c3 c4
```

컨테이너 로그 실시간 보기

```bash
root@docker02:~# docker container logs -f   c1
root@docker02:~# docker container logs -f  --until 20m c1
root@docker02:~# docker container logs -f  --since 20m c1
```

  관련 매개변수:

  -f:

  로그를 실시간으로 보기

  --since 20m:

  최근 20분 이내에 생성된 로그 보기

  --until 20m:

  20분 이전에 생성된 로그 보기

가장 최근에 생성된 컨테이너 보기

```bash
root@docker02:~# docker ps -l
```

호스트와 컨테이너 간 데이터 복사

  컨테이너에서 호스트로 파일 복사:

```bash
root@docker02:~# docker container cp c1:/docker-entrypoint.sh /root/
```

  호스트에서 컨테이너로 파일 복사:

```bash
root@docker02:~# docker cp install-docker.sh c1:/
```

## 2. 실행 중인 컨테이너 내부에서 명령 실행

1. IP 주소 보기

```bash
root@docker02:~# docker exec c1 hostname -I
172.17.0.2
```

2. 셸로 컨테이너에 연결

```bash
root@docker02:~# docker exec -it c1 sh
# ls
bin   dev                  docker-entrypoint.sh  home  lib64  mnt  proc  run   srv  tmp  var
boot  docker-entrypoint.d  etc                   lib   media  opt  root  sbin  sys  usr
#
```

3. exec로 명령을 실행할 때는 해당 컨테이너에 그 명령이 실제로 있는지 확인

```bash
root@docker02:~# docker exec -it c1 ifconfig
OCI runtime exec failed: exec failed: unable to start container process: exec: "ifconfig": executable file not found in $PATH: unknown
```
