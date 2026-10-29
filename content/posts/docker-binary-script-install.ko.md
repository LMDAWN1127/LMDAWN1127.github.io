---
title: "Docker 실전: 바이너리 배포와 원클릭 스크립트 배포"
date: 2026-10-23T12:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 를 세 가지 방법으로 설치합니다. apt 패키지 관리자, 공식 정적 바이너리 (다운로드/압축해제/복사/시작), 그리고 자동화 스크립트 (설치 및 제거). 바이너리 설치를 깔끔하게 제거하는 방법도 다룹니다."
---

# Docker 실전: 바이너리 배포와 원클릭 스크립트 배포

## 1. 패키지 관리자로 Docker 설치

Ubuntu 를 예로 들어, apt 패키지 관리자로 설치하는 것이 가장 간단하며 한 줄 명령으로 끝납니다:

```bash
root@docker01:~# apt update && apt install -y docker.io
```

이 방식으로 설치되는 버전은 Ubuntu 저장소에 의해 결정되며 빠른 검증에 적합합니다. 최신 또는 특정 버전을 설치하려면 Docker 공식 문서를 따라 저장소를 추가해 docker-ce 를 설치하거나, 아래 바이너리 배포 방식을 사용하세요.

  참고 링크:

  https://docs.docker.com/engine/install/ubuntu/

## 2. 바이너리로 Docker 환경 배포

1. 패키지 다운로드

```bash
root@docker01:~# wget https://download.docker.com/linux/static/stable/x86_64/docker-27.0.3.tgz
```

2. 패키지 압축 해제

```bash
root@docker01:~# tar xf docker-27.0.3.tgz
```

3. PATH 로 복사

```bash
root@docker01:~# cp docker/* /usr/bin/
```

4. Docker 시작

```bash
root@docker01:~# dockerd
```

5. Docker 버전 확인

```bash
root@docker01:~# docker version
Client:
 Version:           27.0.3
 API version:       1.46
 Go version:        go1.21.11
 Git commit:        7d4bcd8
 Built:             Sat Jun 29 00:01:25 2024
 OS/Arch:           linux/amd64
 Context:           default

Server: Docker Engine - Community
 Engine:
  Version:          27.0.3
  API version:      1.46 (minimum version 1.24)
  Go version:       go1.21.11
  Git commit:       662f78c
  Built:            Sat Jun 29 00:03:05 2024
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v1.7.18
  GitCommit:        ae71819c4f5e67bb4d5ae76a6b735f29cc25774e
 runc:
  Version:          1.1.13
  GitCommit:        v1.1.13-0-g58aa920
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

## 3. 바이너리 Docker 환경 제거

> 주의: 아래 제거 명령은 현재 디렉터리의 docker 폴더를 순회하며 /usr/bin 의 관련 파일을 삭제합니다. 실행 전에 docker-27.0.3.tgz 를 풀 때 생성된 docker 디렉터리로 먼저 들어가세요.

1. Docker 서비스 중지

```bash
root@docker01:~# pkill dockerd
```

  서비스 중지 후 버전을 다시 확인하면 다음 메시지가 나타납니다:

  Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?

2. Docker 관련 프로그램 제거

```bash
root@docker01:~# for i in `ls docker`;do rm -f /usr/bin/$i ;done
```

3. 검증

```bash
root@docker01:~# docker
-bash: /usr/bin/docker: No such file or directory
```

## 4. 스크립트로 Docker 환경 배포 또는 제거

디렉터리 생성

```bash
root@docker01:~# mkdir -pv /dawn/softwares
```

패키지 다운로드

Alist 파일 서버(https://www.dawncloud.top/dawn) 에서 자동 설치 패키지 dawn-autoinstall-docker-docker-compose.tar.gz (약 158MB) 를 다운로드합니다. 아래 그림과 같습니다:

![image-20261023111049752](/images/docker-binary-script-install-image-20261023111049752.png)

패키지 압축 해제

```bash
root@docker01:~# cd /dawn/softwares/
root@docker01:/dawn/softwares# tar xf dawn-autoinstall-docker-docker-compose.tar.gz
```

Docker 설치

```bash
root@docker01:/dawn/softwares# ./install-docker.sh i
```

Docker 버전 확인

```bash
root@docker01:/dawn/softwares# docker version
Client:
 Version:           27.0.3
 API version:       1.46
 Go version:        go1.21.11
 Git commit:        7d4bcd8
 Built:             Sat Jun 29 00:01:25 2024
 OS/Arch:           linux/amd64
 Context:           default

Server: Docker Engine - Community
 Engine:
  Version:          27.0.3
  API version:      1.46 (minimum version 1.24)
  Go version:       go1.21.11
  Git commit:       662f78c
  Built:            Sat Jun 29 00:03:05 2024
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v1.7.18
  GitCommit:        ae71819c4f5e67bb4d5ae76a6b735f29cc25774e
 runc:
  Version:          1.1.13
  GitCommit:        v1.1.13-0-g58aa920
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

Docker 제거

```bash
root@docker01:/dawn/softwares# ./install-docker.sh r
```
