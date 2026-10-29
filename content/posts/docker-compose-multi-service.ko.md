---
title: "docker-compose 로 멀티 서비스 이미지 빌드 및 컨테이너 시작 사례"
date: 2026-10-29T13:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker-compose 사례를 통해 단일 YAML 파일로 두 HTML5 게임 서비스(doudizhu 와 motuo)의 이미지 빌드와 컨테이너 관리를 통합 오케스트레이션하는 방법을 보여준다. compose 파일(빌드 컨텍스트 + 각 서비스의 Dockerfile)과 nginx 가상 호스트, 시작 스크립트를 작성하고, docker-compose build 로 두 이미지를 한 번에 컴파일하며, up -d 로 백그라운드 시작, ps/stop/start/restart/down 으로 수명 주기를 관리한다. 그런 다음 고정 포트 + restart: always 와 임의 포트를 구성해 접속과 재시작 정책을 검증하고, 마지막에 자주 쓰는 명령 대조표를 제공한다."
---

# docker-compose 로 멀티 서비스 이미지 빌드 및 컨테이너 시작 사례

## 1. docker-compose 개요

docker-compose 는 컨테이너 그룹을 관리하는 도구이다. 하나의 YAML 파일(docker-compose.yaml)을 통해 여러 서비스(service)의 이미지 빌드, 포트 매핑, 네트워크, 재시작 정책, 의존 관계 등을 한 번에 선언하고, 이후 하나의 명령으로 빌드와 시작을 통합 오케스트레이션하여 수작업 개별 docker build / docker run 을 대체한다.

이 사례는 두 HTML5 게임(doudizhu 와 motuo)을 두 서비스로 삼아 docker-compose 의 완전한 사용법을 보여준다.

---

## 2. 실험 디렉터리 구조

```
/dawn/docker-compose/motuo-doudizhu/
├── docker-compose.yaml                 # compose 오케스트레이션 파일
└── dockerfile/                         # 빌드 컨텍스트 (context)
    ├── doudizhu.dockerfile             # doudizhu 서비스 이미지
    ├── motuo.dockerfile                # motuo 서비스 이미지
    ├── config/
    │   ├── doudizhu.conf               # doudizhu nginx 가상 호스트
    │   └── motuo.conf                  # motuo nginx 가상 호스트
    ├── code/
    │   ├── dawn-doudizhu.tar.gz        # doudizhu 게임 코드
    │   └── dawn-motuo.tar.gz           # motuo 게임 코드
    └── scripts/
        └── start.sh                    # 멀티 서비스 시작 스크립트 (sshd + nginx + 블록)
```

---

## 3. docker-compose 오케스트레이션 파일 작성

### 3.1 docker-compose.yaml

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# docker compose 버전 번호를 선언
version: '3.8'

# 자주 쓰는 서비스를 정의
services:
   # doudizhu 서비스
   doudizhu:
     # 이미지 이름을 지정
     image: dawn-games:doudizhu-v0.1
     # 빌드 정보를 지정
     build:
      # 컨텍스트를 선언, "docker image build -t <>:<> -f Dockerfile PATH" 와 동등, 여기서는 PATH 에 해당
      context: ./dockerfile
      #context: .
      # Dockerfile 이름을 선언 ("-f" 옵션과 동등)
      dockerfile: doudizhu.dockerfile

   # motuo 서비스
   motuo:
     image: dawn-games:motuo-v0.1
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

### 3.2 nginx 가상 호스트 설정

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/config/doudizhu.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/doudizhu;
    server_name   game01.dawn.com;
}

root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/config/motuo.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/motuo;
    server_name   game01.dawn.com;
}
```

### 3.3 motuo 서비스 Dockerfile

```dockerfile
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/motuo.dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/* && \
     ln -svf /dev/stderr  /var/log/nginx/error.log && \
     ln -svf /dev/stdout  /var/log/nginx/access.log

EXPOSE 80 22

ADD code/dawn-motuo.tar.gz /usr/share/nginx/html/motuo

COPY config/motuo.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 3.4 doudizhu 서비스 Dockerfile

```dockerfile
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/doudizhu.dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/* && \
     ln -svf /dev/stderr  /var/log/nginx/error.log && \
     ln -svf /dev/stdout  /var/log/nginx/access.log

EXPOSE 80 22

ADD code/dawn-doudizhu.tar.gz /usr/share/nginx/html/doudizhu

COPY config/doudizhu.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 3.5 멀티 서비스 시작 스크립트

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/scripts/start.sh
#!/bin/sh

# init root password
if [ -n $dawn_USERNAME ];then
    USERNAME=${dawn_USERNAME:-root}

    id ${USERNAME}

    if [ $? != 0 ];then
       adduser ${USERNAME} -D
    fi
fi

if [ -n "$1" ];then
   PASSWORD=$1
elif [ -n "$dawn_PASSWORD" ]; then
   PASSWORD=${dawn_PASSWORD}
else
   PASSWORD=123
fi

echo $USERNAME:$PASSWORD | chpasswd

# start sshd service
/usr/sbin/sshd

# start nginx service
# nginx -g 'daemon off;'
nginx

# block process
tail -f /etc/hosts
```

start.sh 로직: root 비밀번호 초기화 -> sshd 시작 -> nginx 시작 -> tail -f /etc/hosts 로 프로세스를 블록하여 컨테이너 시작 후 메인 프로세스가 종료되는 것을 방지.

---

## 4. docker-compose 기본 사용

### 4.1 이미지 빌드

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose build
[+] Building 0.3s (17/17) FINISHED                                                                                      docker:default
 => [doudizhu internal] load build definition from doudizhu.dockerfile                                                            0.0s
 => => transferring dockerfile: 982B                                                                                              0.0s
 => [motuo internal] load build definition from motuo.dockerfile                                                                  0.0s
 => => transferring dockerfile: 970B                                                                                              0.0s
 => [doudizhu internal] load .dockerignore                                                                                        0.0s
 => => transferring context: 2B                                                                                                   0.0s
 => [motuo internal] load .dockerignore                                                                                           0.0s
 => => transferring context: 2B                                                                                                   0.0s
 => [motuo internal] load metadata for docker.io/library/alpine:3.20.2                                                            0.0s
 => [motuo 1/6] FROM docker.io/library/alpine:3.20.2                                                                              0.0s
 => [doudizhu internal] load build context                                                                                        0.1s
 => => transferring context: 2.78MB                                                                                               0.1s
 => [motuo internal] load build context                                                                                           0.0s
 => => transferring context: 30.69kB                                                                                              0.0s
 => CACHED [doudizhu 2/6] WORKDIR /usr/share/nginx/html                                                                           0.0s
 => CACHED [doudizhu 3/6] RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories &&      apk  0.0s
 => CACHED [motuo 4/6] ADD code/dawn-motuo.tar.gz /usr/share/nginx/html/motuo                                                0.0s
 => CACHED [motuo 5/6] COPY config/motuo.conf /etc/nginx/http.d/default.conf                                                      0.0s
 => CACHED [motuo 6/6] COPY scripts/start.sh /                                                                                    0.0s
 => [doudizhu] exporting to image                                                                                                 0.0s
 => => exporting layers                                                                                                           0.0s
 => => writing image sha256:b703be2d566230da9a12bd84189822af07167d1b14371b0f2c3ccd60375e7edc                                      0.0s
 => => writing image sha256:fdffcfbc066ae122bd0f86fb8cc0cba608919f805fadfce48cee19a7cc0a623e                                      0.0s
 => => naming to docker.io/library/dawn-games:motuo-v0.1                                                                       0.0s
 => => naming to docker.io/library/dawn-games:doudizhu-v0.1                                                                    0.0s
 => CACHED [doudizhu 4/6] ADD code/dawn-doudizhu.tar.gz /usr/share/nginx/html/doudizhu                                       0.0s
 => CACHED [doudizhu 5/6] COPY config/doudizhu.conf /etc/nginx/http.d/default.conf                                                0.0s
 => CACHED [doudizhu 6/6] COPY scripts/start.sh /                                                                                 0.0s
```

빌드 결과: 한 번의 build 로 dawn-games:doudizhu-v0.1 과 dawn-games:motuo-v0.1 두 이미지를 동시에 생성한다. CACHED 는 반복 빌드 시 빌드 캐시가 히트했음을 의미하며 매우 빠르다.

### 4.2 백그라운드 컨테이너 생성 및 시작

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose up -d
[+] Building 0.0s (0/0)                                                                                                 docker:default
[+] Running 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.1s
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.1s
```

컨테이너 이름 규칙: <프로젝트 디렉터리 이름>-<서비스 이름>-<일련번호>, 즉 motuo-doudizhu-doudizhu-1 과 motuo-doudizhu-motuo-1.

### 4.3 컨테이너 상태 확인

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose ps
NAME                           IMAGE                         COMMAND                  SERVICE    CREATED              STATUS              PORTS
motuo-doudizhu-doudizhu-1   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   doudizhu   About a minute ago   Up About a minute   22/tcp, 80/tcp
motuo-doudizhu-motuo-1      dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   motuo      About a minute ago   Up About a minute   22/tcp, 80/tcp
```

### 4.4 모든 서비스 중지

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose stop -t 0
[+] Stopping 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Stopped                                                                                0.3s
 ✔ Container motuo-doudizhu-motuo-1     Stopped                                                                                0.3s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose ps
NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED          STATUS                        PORTS     NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   38 seconds ago   Exited (137) 27 seconds ago             motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   38 seconds ago   Exited (137) 27 seconds ago             motuo-doudizhu-motuo-1
```

### 4.5 모든 서비스 시작

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose start
[+] Running 2/2
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.6s
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.6s
root@docker01:/dawn/docker-compose/motuo-doudizhu#
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED          STATUS        PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   48 seconds ago   Up 1 second   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   48 seconds ago   Up 1 second   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
```

### 4.6 지정 서비스 재시작

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED              STATUS          PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   About a minute ago   Up 35 seconds   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   About a minute ago   Up 35 seconds   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose restart doudizhu
[+] Restarting 1/1
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                               10.5s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED              STATUS              PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   About a minute ago   Up 3 seconds        22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   About a minute ago   Up About a minute   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
```

지정한 서비스란 docker-compose.yaml 설정 파일에 정의된 서비스이며, restart doudizhu 는 doudizhu 서비스만 재시작하고 motuo 에는 영향이 없다.

### 4.7 모든 컨테이너 중지 및 삭제

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED         STATUS              PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   3 minutes ago   Up About a minute   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   3 minutes ago   Up 2 minutes        22/tcp, 80/tcp   motuo-doudizhu-motuo-1
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose down -t 0
[+] Running 3/3
 ✔ Container motuo-doudizhu-motuo-1     Removed                                                                                0.2s
 ✔ Container motuo-doudizhu-doudizhu-1  Removed                                                                                0.3s
 ✔ Network motuo-doudizhu_default       Removed                                                                                0.1s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

down 과 stop 의 차이: down 은 컨테이너를 중지하고 삭제하며, 동시에 compose 가 자동 생성한 네트워크(motuo-doudizhu_default)도 삭제한다.

---

## 5. docker-compose 포트 매핑과 재시작 정책 구현

docker-compose.yaml 을 수정하여 doudizhu 에는 고정 포트 + restart: always 를, motuo 에는 임의 포트를 설정한다:

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# docker compose 버전 번호를 선언
version: '3.8'

# 자주 쓰는 서비스를 정의
services:
   # doudizhu 서비스
   doudizhu:
     # 이미지 이름을 지정
     image: dawn-games:doudizhu-v0.1
     # 포트 매핑을 구성
     ports:
       - 2481:80
       - 2422:22
     # 재시작 정책을 구성
     restart: always
     # 빌드 정보를 지정
     build:
      # 컨텍스트를 선언, "docker image build -t <>:<> -f Dockerfile PATH" 와 동등, 여기서는 PATH 에 해당
      context: ./dockerfile
      #context: .
      # Dockerfile 이름을 선언 ("-f" 옵션과 동등)
      dockerfile: doudizhu.dockerfile

   # motuo 서비스
   motuo:
     image: dawn-games:motuo-v0.1
     # 호스트의 임의 포트를 컨테이너의 지정 포트에 매핑
     ports:
       - :80
       - :22
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

재시작하고 검증:

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose up -d
[+] Running 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.1s
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.1s

root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps
CONTAINER ID   IMAGE                      COMMAND                  CREATED         STATUS         PORTS                                      NAMES
xxxxxxxxxxxx   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   2 seconds ago   Up 2 seconds   0.0.0.0:2481->80/tcp, 0.0.0.0:2422->22/tcp   motuo-doudizhu-doudizhu-1
xxxxxxxxxxxx   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   2 seconds ago   Up 2 seconds   0.0.0.0:32769->80/tcp, 0.0.0.0:32768->22/tcp  motuo-doudizhu-motuo-1
```

접속 결과 검증:

```bash
# doudizhu: 고정 포트 2481, HTTP 200 반환
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:2481/
200

# motuo: 임의 포트 32769, HTTP 200 반환
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:32769/
200
```

재시작 정책 검증:

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-doudizhu-1
always
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-motuo-1
no
```

---

## 6. docker-compose 기본 명령

| 명령                                | 용도                                       |
| ----------------------------------- | ------------------------------------------ |
| `docker-compose build`              | yaml 의 build 설정에 따라 이미지 컴파일          |
| `docker-compose up -d`              | 백그라운드에서 모든 서비스 생성 및 시작 (필요 시 자동 build) |
| `docker-compose ps`                 | compose 가 관리하는 컨테이너 상태 확인                |
| `docker-compose stop [-t 0]`        | 서비스 중지 (컨테이너 유지)                       |
| `docker-compose start`              | 중지된 서비스 시작                           |
| `docker-compose restart [서비스 이름]`   | 모든 서비스 재시작, 또는 특정 서비스 지정               |
| `docker-compose down [-t 0]`        | 컨테이너와 네트워크 중지 및 삭제                       |
| `docker-compose logs [-f] [서비스 이름]` | 서비스 로그 확인                               |
