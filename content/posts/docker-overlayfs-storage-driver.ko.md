---
title: "Docker 실전: OverlayFS 유니온 마운트와 스토리지 드라이버 분석"
date: 2026-10-26T21:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 스토리지 드라이버 OverlayFS 의 원리: lower/upper/work 디렉터리와 LowerDir/Upperdir/MergedDir 3계층(init 계층 포함), 읽기-쓰기 계층으로의 쓰기 시 복사. 그리고 mount -t overlay 로 계층화와 읽기 전용을 직접 시연하고, 마지막으로 docker run 으로 컨테이너 하부가 overlay2 임을 확인합니다."
---

# Docker 실전: OverlayFS 유니온 마운트와 스토리지 드라이버 분석

## 1. OverlayFS 개요

OverlayFS 는 스택형 파일시스템으로, 다른 파일시스템(ext4fs 나 xfs 등)에 의존해 그 위에 구축됩니다. 디스크 공간 구조의 분할에는 직접 관여하지 않고, 기존 파일시스템의 파일이나 디렉터리를 "하나로 합치기"만 해서, 최종적으로 "합쳐진" 파일이 같은 수준의 디렉터리에 있는 것처럼 사용자에게 보여 줍니다. 이것이 유니온 마운트 기술이며, AUFS(1.12 이전 초기에 사용된 스토리지 기술)와 비교해 OverlayFS 가 더 빠르고 구현도 단순합니다.

Linux 커널이 Docker 에 제공하는 OverlayFS 드라이버는 Overlay 와 Overlay2 두 가지입니다. Overlay2 는 Overlay 를 개선한 것으로, Inode 활용률 측면에서 Overlay 보다 효율적입니다.

하지만 Overlay 에는 환경 요구사항이 있습니다:

(1) Docker 버전 17.06.02 이상;

(2) 호스트 파일시스템은 EXT4 또는 XFS 형식이어야 합니다.

OverlayFS 구현 방식:

OverlayFS 는 lower 디렉터리·upper 디렉터리·work 디렉터리 세 개의 디렉터리로 구현됩니다.

lower:

일반적으로 읽기 전용 데이터에 대응합니다.

upper:

읽기/쓰기 작업이 가능한 디렉터리입니다.

work:

작업의 기본 디렉터리이며, 마운트 후에 자동으로 work 하위 디렉터리가 생성됩니다(실제 테스트에서는 수동으로 언마운트해도 이 디렉터리는 삭제되지 않았습니다)

이 디렉터리는 주로 임시 결과나 중간 데이터를 보관하는 작업 디렉터리입니다.

사용 중에는 그 내용이 사용자에게 보이지 않으며, 유니온 마운트가 완료되어 사용자에게 보여지는 통합 뷰를 merged 디렉터리라고 합니다.

OverlayFS 구조는 LowerDir·Upperdir·MergedDir 세 개의 계층으로 나뉩니다:

### LowerDir (읽기 전용)

읽기 전용 image layer 이며, 사실상 rootfs 입니다.

Dockerfile 로 이미지를 빌드할 때 Image Layer 는 여러 계층으로 나뉠 수 있으므로, 대응하는 lowerdir 도 많아집니다(원본 이미지).

Lower 는 두 개의 계층으로 구성됩니다:

(1) 시스템의 init

```bash
1. 컨테이너가 시작된 후 기본적으로 lower 계층의 내용은 수정할 수 없지만, 호스트 이름과 도메인 주소를 변경해야 하는 요구가 있으므로 init 계층의 파일(hostname, resolv.conf, hosts, mtab 등)을 추가해 이 문제를 해결합니다;
2. 수정된 내용은 현재 컨테이너에만 적용되며, docker commit 으로 이미지를 커밋할 때 init 계층은 커밋되지 않습니다;
3. init 파일이 저장되는 디렉터리는 /var/lib/docker/overlay2/<init_id>/diff
```

(2) 컨테이너의 이미지 계층

수정할 수 없는 데이터입니다.

### Upperdir (읽기-쓰기)

upperdir 는 lowerdir 위의 계층이며 읽기-쓰기 계층입니다. 컨테이너가 시작될 때 생성되고, 컨테이너에 대한 모든 변경은 이 계층에서 이루어집니다. 예를 들어 컨테이너가 시작될 때 기록되는 로그 파일이나 애플리케이션이 기록하는 임시 파일 등입니다.

### MergedDir (표시)

merged 디렉터리는 컨테이너의 마운트 지점이며, 사용자 관점에서 보이는 모든 파일은 이 계층에서 표시됩니다.

## 2. OverlayFS 실습

### 2.1 작업 디렉터리 생성

```bash
root@docker02:~# mkdir -pv /dawn/lower{0..2} /dawn/{uppper,work,merged}
mkdir: created directory '/dawn/lower0'
mkdir: created directory '/dawn/lower1'
mkdir: created directory '/dawn/lower2'
mkdir: created directory '/dawn/uppper'
mkdir: created directory '/dawn/work'
mkdir: created directory '/dawn/merged'
```

### 2.2 파일시스템 마운트

```bash
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,upperdir=/dawn/uppper,workdir=/dawn/work  /dawn/merged/
```

### 2.3 마운트 정보 확인

```bash
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
```

### 2.4 lower 계층에 초기 데이터 쓰기

```bash
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:48 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/lower1:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/lower2:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/merged:
total 8
drwxr-xr-x 1 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
root@docker02:~# cp /etc/hosts /dawn/lower0/
root@docker02:~# cp /etc/issue /dawn/lower1/
root@docker02:~# cp /etc/resolv.conf /dawn/lower2/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:48 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 20
drwxr-xr-x 1 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.5 upper 계층에 초기 데이터 쓰기

```bash
root@docker02:~# cp /etc/hostname /dawn/uppper/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:49 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 24
drwxr-xr-x 1 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.6 merged 디렉터리에 데이터를 쓰고 실제로는 upper 계층에 기록되는지 확인

```bash
root@docker02:~# cp /etc/fstab /dawn/merged/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:49 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 28
drwxr-xr-x 1 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  657 Oct 26 12:49 fstab
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 16
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  657 Oct 26 12:49 fstab
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.7 upperdir 계층 없이 다시 마운트

```bash
root@docker02:~# umount /dawn/merged
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,workdir=/dawn/work  /dawn/merged/
```

### 2.8 쓰기 계층이 없어 다시 쓰기 시도가 실패함

```bash
root@docker02:~# cp /etc/os-release /dawn/merged/
cp: cannot create regular file '/dawn/merged/os-release': Read-only file system
```

## 3. Docker 내부에서 OverlayFS 사용 확인

```bash
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
root@docker02:~# docker run -d --name c1 uhub.service.ucloud.cn/dawn/apps:v1
d751a64952e703e04b3ca48bb4e4a757d9cf561ae2fb7883956e9c097c793569
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
overlay          48G   12G   34G  26% /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged
root@docker02:~# docker inspect -f "{{.GraphDriver.Data.MergedDir}}" c1
/var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged
root@docker02:~# docker inspect -f "{{.GraphDriver.Data.UpperDir}}" c1
/var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/diff
root@docker02:~# docker exec c1 touch /haha.log  # 쓰기 작업 수행
root@docker02:~# ls /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/diff  # 분명히 데이터가 읽기-쓰기 계층에 기록되었습니다
etc  haha.log  run  var
root@docker02:~# ls /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged/
bin  docker-entrypoint.d   etc       home  media  opt   root  sbin  sys  usr
dev  docker-entrypoint.sh  haha.log  lib   mnt    proc  run   srv   tmp  var
root@docker02:~# chroot /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged /bin/sh
/ # ls /
bin                   haha.log              opt                   srv
dev                   home                  proc                  sys
docker-entrypoint.d   lib                   root                  tmp
docker-entrypoint.sh  media                 run                   usr
etc                   mnt                   sbin                  var
/ #
```
