---
title: "Dockerfile 핵심 명령 실전: WORKDIR/EXPOSE/VOLUME, ENV/ARG, HEALTHCHECK, ENTRYPOINT"
date: 2026-10-28T21:41:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "4 개의 웹 게임으로 7 가지 핵심 Dockerfile 명령을 완전히 시연합니다. WORKDIR/EXPOSE/VOLUME 의 작업 디렉터리·포트 노출·영속화 효과, 빌드 시점과 실행 시점이 다른 ENV 와 ARG 의 차이와 덮어쓰기 방법, HEALTHCHECK 의 건강 상태 전이, 그리고 ENTRYPOINT 와 CMD 의 덮어쓰기 가능 여부 차이와 인수 전달 메커니즘."
---

# Dockerfile 핵심 명령 실전: WORKDIR/EXPOSE/VOLUME, ENV/ARG, HEALTHCHECK, ENTRYPOINT

이 실습에서는 4 개의 웹 게임으로 4 가지 Dockerfile 명령 그룹을 각각 시연합니다.

| 사례 | 게임                          | 핵심 명령                      | 이미지 태그                 |
| ---- | ----------------------------- | ------------------------------- | ---------------------------- |
| 1    | 성익 게임 플랫폼(pingtai)     | `WORKDIR` / `EXPOSE` / `VOLUME` | `dawn-games:v2.13`           |
| 2    | 식물 vs 좀비(zhiwu)           | `ENV` / `ARG` + 멀티 서비스 시작   | `dawn-games:v2.14` / `v2.15` |
| 3    | 인생 재시작 시뮬레이터(liferestart) | `HEALTHCHECK`          | `dawn-games:v2.15`           |
| 4    | 과일 자르기(qieshuiguo)       | `ENTRYPOINT`                    | `dawn-games:v2.16`           |

---

## 사례 1: WORKDIR / EXPOSE / VOLUME

### 1. 게임 코드 준비

이미지에서 "성익 게임 플랫폼" 코드를 추출해 패키징합니다:

```bash
root@docker01:~# mkdir -p /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/{code,config,scripts}

root@docker01:~# docker run --rm -v /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code:/out \
>   uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 \
>   sh -c 'cd /usr/local/nginx/html/pingtai && tar czf /out/dawn-pingtai.tar.gz .'

root@docker01:~# ls -lh /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code/
total 100M
-rw-r--r-- 1 root root 100M Oct 28 12:35 dawn-pingtai.tar.gz
```

### 2. Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# cat Dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*

ADD code/dawn-pingtai.tar.gz /usr/share/nginx/html/pingtai

COPY config/games.conf /etc/nginx/http.d/default.conf

# 작업 디렉터리 지정, 컨테이너 연결 시 자동 전환
WORKDIR /usr/share/nginx/html

# 노출할 포트 번호 지정
EXPOSE 80

# 컨테이너의 지정 디렉터리에 스토리지 볼륨 생성
VOLUME /usr/share/nginx/html

CMD ["nginx","-g","daemon off;"]
```

#### 세 명령의 역할

| 명령                             | 역할         | 설명                                       |
| ------------------------------- | ------------ | ------------------------------------------ |
| `WORKDIR /usr/share/nginx/html` | 작업 디렉터리 지정 | `docker exec` 로 컨테이너 진입 후 자동 `cd` |
| `EXPOSE 80`                     | 노출 포트 선언 | `docker run -P` 와 함께 임의 포트 자동 매핑 |
| `VOLUME /usr/share/nginx/html`  | 스토리지 볼륨 선언 | 익명 볼륨 자동 생성, 데이터 영속화 |

### 3. nginx 설정 작성

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/pingtai;
    server_name   game01.dawn.com;
}
```

### 4. 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# docker image build -t dawn-games:v2.13 .
...
Step 7/10 : WORKDIR /usr/share/nginx/html
 ---> c2beaad2ca7d
Step 8/10 : EXPOSE 80
 ---> adace459771f
Step 9/10 : VOLUME /usr/share/nginx/html
 ---> 58ae3b9289fe
Step 10/10 : CMD ["nginx","-g","daemon off;"]
 ---> c3489847ff85
Successfully built c3489847ff85
Successfully tagged dawn-games:v2.13
```

### 5. 컨테이너 시작 및 세 명령 검증

```bash
root@docker01:~# docker run -dP --name c1 dawn-games:v2.13
0aca37fa9cbcf91721dd2a28c5330bec8677c603cfdedab00e4d5398d67d7b7e

root@docker01:~# docker ps -l
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS         PORTS                                     NAMES
0aca37fa9cb1   dawn-games:v2.13   "nginx -g 'daemon of…"   3 seconds ago   Up 2 seconds   0.0.0.0:32770->80/tcp, :::32770->80/tcp   c1
```

**EXPOSE 검증(-P 가 임의 포트 32770 에 자동 매핑):**

```bash
root@docker01:~# docker inspect -f '{{json .Config.ExposedPorts}}' c1
{"80/tcp":{}}
```

**VOLUME 검증(익명 볼륨 위치):**

```bash
root@docker01:~# docker inspect -f "{{range .Mounts}}{{.Source}}{{end}}" c1
/var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data

root@docker01:~# ll /var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data
total 12
drwxr-xr-x 3 root root 4096 Oct 28 12:36 ./
drwx-----x 3 root root 4096 Oct 28 12:36 ../
drwxr-xr-x 7 root root 4096 Oct 28 12:36 pingtai/
```

**WORKDIR 검증(exec 진입 후 자동 디렉터리 전환):**

```bash
root@docker01:~# docker exec -it c1 sh
/usr/share/nginx/html # pwd
/usr/share/nginx/html
```

### 6. 접속 테스트

브라우저 접속：`http://11.0.1.121:32770/`

![image-20261028210809525](/images/docker-dockerfile-core-instructions/image-20261028210809525.png)

---

## 사례 2: ENV / ARG (멀티 서비스 시작)

### 1. Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat Dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

EXPOSE 80

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/*

# 컨테이너 실행 시 유효한 변수, 빌드와 실행 단계 모두에서 유효, 실행 시 -e 로 값 덮어쓰기
ENV dawn_USERNAME=root \
    dawn_PASSWORD=321

# 이미지 빌드 시 유효한 변수, 빌드 단계에서만 유효, 빌드 단계에서 "--build-arg" 옵션으로 값 덮어쓰기 가능.
ARG dawn_school=czu \
    dawn_class=computer01

RUN touch /dawn-${dawn_USERNAME} && \
    touch /dawn-${dawn_PASSWORD} && \
    touch /dawn-xixi-${dawn_school} && \
    touch /dawn-haha-${dawn_class}

ADD code/dawn-zhiwu.tar.gz /usr/share/nginx/html/zhiwu

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

# CMD ["nginx","-g","daemon off;"]
CMD ["/bin/sh","-x","/start.sh"]
# CMD ["tail","-f","/etc/hosts"]
```

### 2. 시작 스크립트 작성(멀티 서비스: sshd + nginx)

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat scripts/start.sh
#!/bin/sh

# init root password
if [ -n $dawn_USERNAME ];then {
    USERNAME=${dawn_USERNAME:-root}

    id ${USERNAME}

    if [ $? != 0 ];then {
       adduser ${USERNAME} -D
    }
    fi
}
fi

if [ -n $dawn_PASSWORD ];then {
   PASSWORD=${dawn_PASSWORD:-123}
}
fi

echo $USERNAME:$PASSWORD | chpasswd

# start sshd service
/usr/sbin/sshd

# start nginx service
nginx -g 'daemon off;'
```

### 3. nginx 설정 작성

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/zhiwu;
    server_name   game01.dawn.com;
}
```

### 4. 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker image build -t dawn-games:v2.14 .
...
(15/15) Installing openssh-server (9.7_p1-r5)
...
Step 8/14 : ENV dawn_USERNAME=root     dawn_PASSWORD=321
 ---> 33d0dcf85ef9
Step 9/14 : ARG dawn_school=czu     dawn_class=computer01
 ---> db9d23d02ad7
Step 10/14 : RUN touch /dawn-${dawn_USERNAME} && ...
 ---> 3f912a699263
Step 14/14 : CMD ["/bin/sh","-x","/start.sh"]
 ---> c2d92ddef381
Successfully tagged dawn-games:v2.14
```

### 5. 실행 시 ENV 덮어쓰기(-e 로 사용자 이름과 비밀번호 변경)

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG/scripts# docker run -dP --name c1 -e dawn_USERNAME=xixi -e dawn_PASSWORD=haha dawn-games:v2.14
2b6539639876439a33773c8292dae05f3d87018cd1b59d990541581780ba7c1b

root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker exec -it c1 sh
/usr/share/nginx/html # env
...
dawn_PASSWORD=haha
dawn_USERNAME=xixi
PWD=/usr/share/nginx/html
/usr/share/nginx/html #
```

**멀티 서비스 시작 검증(sshd + nginx 동시 실행):**

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker exec c1 ps aux | grep -E 'sshd|nginx'
   14 root      0:00 sshd: /usr/sbin/sshd [listener] 0 of 10-100 startups
   15 root      0:00 nginx: master process nginx -g daemon off;
   16 nginx     0:00 nginx: worker process
```

**접속 테스트:**

![image-20261028211748223](/images/docker-dockerfile-core-instructions/image-20261028211748223.png)

### 6. 빌드 시 ARG 덮어쓰기(--build-arg 로 인수 변경)

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker build -t dawn-games:v2.15 --build-arg dawn_school=THU --build-arg dawn_class=yaoban .
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker run --rm dawn-games:v2.15 sh -c 'ls /dawn-*'
/dawn-321
/dawn-haha-yaoban
/dawn-root
/dawn-xixi-THU
```

`/dawn-root`, `/dawn-321` -- `ENV` 에서(기본값, 덮어쓰기 안 됨)

`/dawn-xixi-THU` -- `ARG dawn_school` 에서(`--build-arg` 로 `THU` 덮어쓰기)

`/dawn-haha-yaoban` -- `ARG dawn_class` 에서(`--build-arg` 로 `yaoban` 덮어쓰기)

#### ENV 와 ARG 의 차이

| 비교 항목      | ENV                | ARG                        |
| ------------ | ------------------ | -------------------------- |
| 적용 단계      | 빌드 + 실행 단계    | 빌드 단계만                |
| 실행 시 덮어쓰기 | `docker run -e`    | 미지원                     |
| 빌드 시 덮어쓰기 | 미지원             | `docker build --build-arg` |
| 이미지에 기록 | 이미지 환경변수에 기록됨 | 안 됨(빌드 후 사라짐)      |

---

## 사례 3: HEALTHCHECK 상태 검사

### 1. Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# cat Dockerfile
FROM alpine:3.20.2
...
ADD code/dawn-liferestart.tar.gz /usr/share/nginx/html/liferestart

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

# 컨테이너 상태 검사에 사용. 컨테이너 내 서비스가 정상 동작하고 컨테이너에 상태 검사가 지정되어 있을 때,
# 정상 상태 외에도 건강 상태를 가진다.
# 상태는 처음에 "starting". 상태 검사를 통과할 때마다 "healthy" 가 된다.
# 연속 실패가 일정 횟수 누적되면 "unhealthy" 가 된다.
HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

CMD ["/bin/sh","-x","/start.sh"]
```

#### HEALTHCHECK 매개변수 상세

| 매개변수           | 기본값       | 의미                                   |
| -------------------- | ------ | ---------------------------------------- |
| `--interval=1s`      | 30s    | 컨테이너 시작 후 얼마마다 검사하는지    |
| `--timeout=1s`       | 30s    | 한 번 검사가 이 시간을 초과하면 실패로 간주 |
| `--start-period=10s` | 0s     | 검사 시작 지연 시간, 이 기간 실패는 재시도 횟수에 미포함 |
| `--retries=5`        | 3      | 연속 몇 회 실패하면 unhealthy 로 판정되는지 |

### 2. 이미지 빌드 및 컨테이너 시작

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker image build -t dawn-games:v2.15 .
...
Step 14/15 : HEALTHCHECK --interval=1s --timeout=1s --start-period=10s --retries=5 CMD curl -H "host: game01.dawn.com" 127.0.0.1
 ---> 19311a2ff5ea
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker run -dP --name c1 dawn-games:v2.15
8749a1d58d4226ca75dee7dc8df12cb5954ee68af7da87417a0ee287e0149e33
```

### 3. 건강 상태 변화 관찰

**시작 직후(starting):**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                            PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   1 second ago    Up Less than a second (health: starting)     c1
```

**10 초 대기 후(healthy):**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                   PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   18 seconds ago   Up 18 seconds (healthy)              c1
```

**상태 검사 상세 확인:**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker inspect --format '{{json .State.Health}}' c1
{"Status":"healthy","FailingStreak":0,"Log":[{"Start":"...","End":"...","ExitCode":0,"Output":"..."},...]}
```

 `Status` 가 `healthy` 이고 `FailingStreak`(연속 실패 횟수) 가 0 인 것을 볼 수 있고,
매번 헬스 체크의 `ExitCode` 는 모두 0 입니다(curl 이 게임 페이지에 성공적으로 접속).

---

## 사례 4: ENTRYPOINT 시작 명령 지정

### 1. Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# cat Dockerfile
FROM alpine:3.20.2
...
ADD code/dawn-qieshuiguo.tar.gz /usr/share/nginx/html/qieshuiguo

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

# CMD 명령은 컨테이너 시작 시 시작 명령을 지정해 덮어쓰기 가능
# CMD ["/bin/sh","-x","/start.sh"]

# 시작 명령으로 ENTRYPOINT 명령을 사용하면 덮어쓰기 불가.
# ENTRYPOINT 는 CMD 와 혼용 가능, 이때 CMD 는 ENTRYPOINT 에 인수로 전달됨
#ENTRYPOINT ["tail", "-f", "/etc/hosts"]
ENTRYPOINT ["/bin/sh","-x","/start.sh"]

#CMD ["tail -f /etc/hosts"]
#ENTRYPOINT ["/bin/sh","-c"]
```

### 2. 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image build -t dawn-games:v2.16 .
...
Step 15/15 : ENTRYPOINT ["/bin/sh","-x","/start.sh"]
 ---> fc30411c280a
Successfully tagged dawn-games:v2.16
```

### 3. 컨테이너 시작 및 검증

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run -dP --name c1 dawn-games:v2.16
5c638a6732c6573cd858241d44a016afcac2bc34d5b042b529a58bb7ec1d9824

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker inspect -f '{{json .Config.Entrypoint}}' c1
["/bin/sh","-x","/start.sh"]

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# curl -s http://127.0.0.1:32773/ | grep -o '<title>[^<]*</title>'
<title>과일 자르기</title>
```

### 4. ENTRYPOINT 와 CMD 의 차이

| 비교 항목            | CMD                          | ENTRYPOINT                   |
| ------------------------------ | ---------------------------- | ---------------------------- |
| `docker run` 명령줄로 덮어쓰기 가능 | 가능(명령 추가 시 덮어쓰기)   | 기본적으로 덮어쓰기 불가 |
| 덮어쓰기 방식        | `docker run` 뒤에 명령을 바로 붙임 | `--entrypoint` 로 강제 덮어쓰기 필요 |
| 혼용                 | ENTRYPOINT 의 인수로         | 메인 명령으로               |

**ENTRYPOINT 의 인수 전달 메커니즘 시연:**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run --rm --entrypoint echo dawn-games:v2.16 '이것은 ENTRYPOINT 가 받은 인수'
이것은 ENTRYPOINT 가 받은 인수
```

**이미지 기본 설정 확인:**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image inspect -f 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}' dawn-games:v2.16
Entrypoint=["/bin/sh","-x","/start.sh"] Cmd=null
```

 `CMD` 가 아닌 `ENTRYPOINT` 를 사용하므로 `Config.Cmd` 는 `null` 입니다.