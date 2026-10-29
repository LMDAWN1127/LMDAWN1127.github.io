---
title: "Docker 실전: chroot 로 최소 컨테이너 루트를 직접 만들어 컨테이너 본질 이해하기"
date: 2026-10-26T19:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 명령 없이 chroot 로 최소 컨테이너 루트를 처음부터 직접 만듭니다 (bash 와 동적 라이브러리 체인 복사). 파일시스템 격리의 '컨테이너 감각' 을 느끼고, 두 독립 루트로 프로세스/데이터가 서로 보이지 않음을 보이며, 마지막으로 실제 컨테이너의 overlay2 merged 파일시스템에 chroot 해서 파일을 고치고 로그를 읽습니다."
---

# Docker 실전: chroot 로 최소 컨테이너 루트를 직접 만들어 컨테이너 본질 이해하기

이 글은 Docker 명령을 나열하는 대신 한 단계 더 낮은 레이어로 내려가 `chroot` 로 최소 컨테이너 루트를 처음부터 직접 만듭니다 (bash 와 동적 라이브러리 종속성 체인을 복사). 파일시스템 격리라는 '컨테이너 감각' 을 직관적으로 느껴보기 위함입니다. 그리고 두 개의 독립된 루트 디렉터리로 프로세스/데이터가 서로 보이지 않음을 보이고, 마지막으로 실제 Docker 컨테이너의 overlay2 merged 파일시스템에 직접 `chroot` 해서 파일을 고치고 로그를 읽습니다.

## 1. 작업 디렉터리 생성

```bash
root@docker02:~# mkdir -pv dawn-dawn/bin dawn-dawn/lib dawn-dawn/lib64
mkdir: created directory 'dawn-dawn/bin'
mkdir: created directory 'dawn-dawn/lib'
mkdir: created directory 'dawn-dawn/lib64'
```

## 2. bash 와 그 종속 환경 복사

**먼저 bash 가 무엇에 종속되는지 확인**

```bash
root@docker02:~# ldd /bin/bash
	linux-vdso.so.1 (0x00007ffefd1f3000)
	libtinfo.so.6 => /lib/x86_64-linux-gnu/libtinfo.so.6 (0x00007ff773e35000)
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007ff773c0c000)
	/lib64/ld-linux-x86-64.so.2 (0x00007ff773fcf000)
```

ldd 가 출력하는 것은 동적 라이브러리 종속성 체인입니다. bash 자신은 움직이지 않지만 readline 을 호출하려면 libtinfo 가, printf/malloc 에는 libc 가 필요하고, 이 모든 것을 로드하는 것은 ld-linux (동적 링커로, 커널이 ELF 를 시작할 때 가장 먼저 로드하는 것이며 이것이 없으면 bash 조차 시작할 수 없습니다) 입니다.

**종속성에 맞춰 복사**

```bash
root@docker02:~# cp /bin/bash dawn-dawn/bin/
root@docker02:~# cp /lib/x86_64-linux-gnu/libtinfo.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libc.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib64/ld-linux-x86-64.so.2 dawn-dawn/lib64/
```

## 3. ls 와 그 종속 환경 복사 (전이 종속 포함)

```bash
root@docker02:~# cp /usr/bin/ls dawn-dawn/bin/
root@docker02:~# ldd dawn-dawn/bin/ls
	linux-vdso.so.1
	libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
	libpcre2-8.so.0 => /lib/x86_64-linux-gnu/libpcre2-8.so.0
	libdl.so.2 => /lib/x86_64-linux-gnu/libdl.so.2
	libpthread.so.0 => /lib/x86_64-linux-gnu/libpthread.so.0
	/lib64/ld-linux-x86-64.so.2
```

libselinux 는 또 libpcre2 와 libc 를 끌고 옵니다 - 종속성은 전이되므로 하나라도 빠지면 chroot 후 다음 오류가 발생합니다:

```bash
bash: /usr/bin/ls: error while loading shared libraries: libselinux.so.1: cannot open shared object file
```

```bash
root@docker02:~# cp /lib/x86_64-linux-gnu/libselinux.so.1 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libpcre2-8.so.0 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libdl.so.2 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libpthread.so.0 dawn-dawn/lib/
root@docker02:~# cp -f /lib64/ld-linux-x86-64.so.2 dawn-dawn/lib64/
```

## 4. 루트 디렉터리 변경 (chroot)

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'for i in haha xixi; do echo $i; done'
haha
xixi
```

들어가면 이 bash 가 보는 / 는 dawn-dawn/ 가 됩니다

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'ls -l /'
total 12
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

호스트에는 수십 개의 디렉터리가 있지만 여기에는 3 개만 남습니다 - 이것이 '컨테이너 감각' 의 가장 원초적인 형태입니다

## 5. 이중 컨테이너 격리 데모

환경을 한 부 복사하여 두 개의 독립된 컨테이너 루트를 얻습니다

```bash
root@docker02:~# cp -r dawn-dawn dawn-dawn01
```

**컨테이너 1** (터미널 1): dawn-dawn 에 들어가 '자신의 /' 에 파일을 만듭니다

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'echo haha > /haha.txt; ls -l /'
total 16
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
-rw-r--r-- 1 0 0    5 Oct 26 09:09 haha.txt
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

**컨테이너 2** (터미널 2): dawn-dawn01 에 들어가 동일하게 조작합니다

```bash
root@docker02:~# chroot dawn-dawn01/ /bin/bash -c 'echo xixi > /xixi.log; ls /'
bin
lib
lib64
xixi.log
```

**호스트 관점 검증** - 두 '컨테이너' 는 서로의 데이터를 볼 수 없으며, 호스트 루트 디렉터리에서도 보이지 않습니다

```bash
root@docker02:~# ls /root/dawn-dawn/
bin  haha.txt  lib  lib64
root@docker02:~# ls /root/dawn-dawn01/
bin  lib  lib64  xixi.log
root@docker02:~# ls / | grep -E 'haha|xixi'
(출력 없음)
```

## 6. Docker 컨테이너 파일시스템에 chroot

chroot 의 쓰임은 장난감 디렉터리에만 있는 것이 아닙니다 - 실제 Docker 컨테이너의 파일시스템에 직접 '파고들' 수 있습니다. 컨테이너의 루트는 호스트의 /var/lib/docker/overlay2/<id>/merged 입니다

```bash
root@docker02:~# docker run -d --name c-chroot uhub.service.ucloud.cn/dawn/apps:v1
root@docker02:~# docker exec c-chroot touch /haha.log
root@docker02:~# docker inspect -f '{{.GraphDriver.Data.MergedDir}}' c-chroot
/var/lib/docker/overlay2/dfe2e54e4db540e275ceac6f8a74a5c4cbd56554e47989effe6e588298dba3bf/merged
root@docker02:~# chroot /var/lib/docker/overlay2/dfe2e54e4db540e275ceac6f8a74a5c4cbd56554e47989effe6e588298dba3bf/merged /bin/sh -c 'ls -l /haha.log; ls / | head -8'
-rw-r--r--    1 root     root             0 Oct 26 09:10 /haha.log
bin
dev
docker-entrypoint.d
docker-entrypoint.sh
etc
haha.log
home
lib
```

컨테이너가 안 뜨거나 셸이 없을 때, 호스트에서 chroot 로 그 merged 디렉터리에 들어가 파일을 직접 고치고 로그를 읽을 수 있습니다.