---
title: "Docker 실전: docker exec 와 docker attach 의 차이"
date: 2026-10-28T12:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker top 으로 프로세스 트리를 비교하여 docker exec 와 docker attach 의 본질적 차이를 확인합니다. exec 는 컨테이너 내부에 새 프로세스를 생성하고, attach 는 로컬의 표준 입출력을 실행 중인 메인 프로세스에 연결할 뿐입니다. 또한 attach 를 컨테이너를 종료하지 않고 빠져나오는 방법(ctrl+p 후 ctrl+q)도 다룹니다."
---

# Docker 실전: docker exec 와 docker attach 의 차이

`docker exec` 와 `docker attach` 는 모두 컨테이너에 들어갈 수 있지만 본질이 완전히 다릅니다. **exec 는 컨테이너 내부에 새 프로세스를 생성**하며 컨테이너의 메인 프로세스에는 영향이 없습니다. **attach 는 새 프로세스를 전혀 생성하지 않고**, 단순히 로컬의 표준 입력/표준 출력/표준 오류 출력을 컨테이너의 실행 중인 메인 프로세스에 연결할 뿐입니다. 아래에서 `docker top` 으로 두 방식의 프로세스 트리 차이를 관찰합니다.

## 1. 환경 준비

```bash
root@docker01:~# docker run -itd --name c5 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1
d81eb31cf5173dcb1d777559af33157dcef5a0d3f61e81f17103f27595c71a20
root@docker01:~# docker run -d --name c6 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
c91146c125ff956871ff359d428174e48d350eb94e9b671578d51a5e855abfeb
```

## 2. 컨테이너 프로세스 정보 확인

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root@docker01:~# docker top c6
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9784                9763                0                   04:35               ?                   00:00:00            sleep 3600
```

## 3. exec 로 c5 컨테이너에 연결

### 테스트 1

**한 터미널:**

```bash
root@docker01:~# docker exec -it c5 sh
/usr/local/stress # ls
bin    share
/usr/local/stress # sleep 3600
```

**다른 터미널:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                9887                9671                0                   04:36               pts/1               00:00:00            sh
root                10120               9887                0                   04:37               pts/1               00:00:00            sleep 3600
```

### 테스트 2

**한 터미널:**

```bash
root@docker01:~# docker exec c5 tail -f /etc/hosts
127.0.0.1       localhost
::1     localhost ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
172.17.0.2      d81eb31cf517
```

**다른 터미널:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                10176               9671                0                   04:38               ?                   00:00:00            tail -f /etc/hosts
```

## 4. attach 로 c5 컨테이너에 연결

**한 터미널:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               1                   04:41               pts/0               00:00:00            /bin/sh
root@docker01:~# docker attach c5
/usr/local/stress # sleep 3600
```

**다른 터미널:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               0                   04:41               pts/0               00:00:00            /bin/sh
root                10485               10411               0                   04:42               pts/0               00:00:00            sleep 3600
```

## 5. 본질적 차이와 분리 방법

exec 는 본질적으로 실행 중인 컨테이너 내부에서 새 프로세스를 생성하여, 컨테이너 안에서 원하는 어떤 명령이든 실행합니다;

attach 는 본질적으로 새 프로세스를 생성하지 않고, 단순히 로컬의 표준 입력·표준 출력·표준 오류 출력을 실행 중인 컨테이너에 연결할 뿐입니다;

attach 에서 컨테이너를 종료하지 않고 빠져나오려면 "ctrl + p" 를 연속해 누른 뒤 "ctrl + q" 를 누르면 현재 터미널을 종료하지 않고 빠져나올 수 있습니다.