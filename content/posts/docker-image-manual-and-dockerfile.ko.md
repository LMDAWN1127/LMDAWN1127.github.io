---
title: "Docker 실전: 수동 이미지 생성과 Dockerfile 자동 빌드"
date: 2026-10-28T14:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "CentOS·Ubuntu·Alpine 세 가지 베이스 이미지로 동일한 nginx 게임 이미지를 수동으로 만들고 docker commit 으로 커밋하며(크기 236MB / 215MB / 9.41MB), Dockerfile 로 같은 이미지를 자동 빌드한 뒤 수동 방식의 세 가지 단점을 정리합니다."
---

# Docker 실전: 수동으로 Docker 이미지를 만들고 Dockerfile 로 자동 빌드하기

Docker 이미지를 만드는 길은 두 가지입니다. **수동 방식**은 베이스 컨테이너를 띄우고 그 안에 서비스를 설치한 뒤 `docker commit` 으로 커밋하는 것이고, **Dockerfile 방식**은 전체 과정을 파일로 작성해 `docker build` 한 번에 완성합니다. 이 글에서는 먼저 CentOS·Ubuntu·Alpine 세 가지 베이스 이미지로 동일한 nginx 게임 이미지를 수동으로 만들고(크기도 함께 확인합니다. 236MB / 215MB / 9.41MB), 그다음 Dockerfile 로 다시 만들고, 마지막으로 수동 방식의 세 가지 단점을 정리합니다.

## 1. Docker 이미지를 수동으로 만들기

### 1.1 CentOS 환경에서 게임 이미지 만들기

1. 이미지 준비

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/centos:7.9.2009
```

2. CentOS 이미지 실행

```bash
root@docker01:~# docker run -it --name c1 uhub.service.ucloud.cn/dawn/centos:7.9.2009
[root@de8e7781da0e /]#
```

3. 컨테이너와 이미지 크기 확인

```bash
root@docker01:~# docker image ls uhub.service.ucloud.cn/dawn/centos
REPOSITORY                           TAG        IMAGE ID       CREATED       SIZE
uhub.service.ucloud.cn/dawn/centos   7.9.2009   eeb6ee3f44bd   5 years ago   204MB
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED          STATUS          PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   13 seconds ago   Up 12 seconds             c1        0B (virtual 204MB)
```

4. 서비스 설치 시작

```bash
[root@de8e7781da0e /]# cat > /etc/yum.repos.d/nginx.repo<<'EOF'
> [nginx-stable]
> name=nginx stable repo
> baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
> gpgcheck=1
> enabled=1
> gpgkey=https://nginx.org/keys/nginx_signing.key
> module_hotfixes=true
>
> [nginx-mainline]
> name=nginx mainline repo
> baseurl=http://nginx.org/packages/mainline/centos/$releasever/$basearch/
> gpgcheck=1
> enabled=0
> gpgkey=https://nginx.org/keys/nginx_signing.key
> module_hotfixes=true
> EOF
[root@de8e7781da0e /]# curl -s -o /etc/yum.repos.d/CentOS-Base.repo http://mirrors.aliyun.com/repo/Centos-7.repo
[root@de8e7781da0e /]# sed -i -e '/mirrors.cloud.aliyuncs.com/d' -e '/mirrors.aliyuncs.com/d' /etc/yum.repos.d/CentOS-Base.repo
[root@de8e7781da0e /]# yum -y install nginx
```

5. 컨테이너 크기 재확인

```bash
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED         STATUS         PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   4 minutes ago   Up 4 minutes             c1        265MB (virtual 469MB)
```

6. yum 최적화 수행

```bash
[root@de8e7781da0e /]# rm -rf /var/cache/
[root@de8e7781da0e /]# nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: [emerg] mkdir() "/var/cache/nginx/client_temp" failed (2: No such file or directory)
nginx: configuration file /etc/nginx/nginx.conf test failed
[root@de8e7781da0e /]# mkdir -pv /var/cache/nginx
mkdir: created directory '/var/cache'
mkdir: created directory '/var/cache/nginx'
[root@de8e7781da0e /]# nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

7. 컨테이너 크기 재확인

```bash
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED         STATUS         PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   6 minutes ago   Up 6 minutes             c1        32.2MB (virtual 236MB)
```

8. nginx 테스트 데이터 준비

8.1 원본 파일 내용 삭제

```bash
[root@de8e7781da0e /]# rm -f /usr/share/nginx/html/*
[root@de8e7781da0e /]# ls -l /usr/share/nginx/html
total 0
```

8.2 게임 코드 복사

```bash
# 1. 이미지 가져오기
docker pull uhub.service.ucloud.cn/dawn/dawn-games:v0.6

# 2. 임시 컨테이너 실행 + 이미지에서 bird 를 호스트로 복사
docker run -d --name tmp-games uhub.service.ucloud.cn/dawn/dawn-games:v0.6 tail -f /dev/null
docker cp tmp-games:/usr/local/nginx/html/bird /root/bird

# 3. 대상 컨테이너 c1 로 복사
docker cp /root/bird c1:/usr/share/nginx/html/

# 4. 임시 컨테이너 삭제
docker rm -f tmp-games
```

bird 코드는 테스트 코드이므로 "uhub.service.ucloud.cn/dawn/dawn-games:v0.6" 이미지에서 바로 복사할 수 있습니다

8.3 bird 소스 코드 준비

```bash
[root@de8e7781da0e /]# cd /usr/share/nginx/html/bird/
[root@de8e7781da0e bird]# ls
2000.png  21.js  icon.png  img  index.html  sound1.mp3
[root@de8e7781da0e bird]# mv * ../
[root@de8e7781da0e bird]# cd ..
[root@de8e7781da0e html]# rm -rf bird/
[root@de8e7781da0e html]# ll
total 144
-rw-r--r-- 1 root root 15329 Aug 31  2022 2000.png
-rw-r--r-- 1 root root 51562 Aug 31  2022 21.js
-rw-r--r-- 1 root root   254 Aug 31  2022 icon.png
drwxr-xr-x 2 root root  4096 Feb 23  2023 img
-rw-r--r-- 1 root root  3049 Aug 31  2022 index.html
-rw-r--r-- 1 root root 63008 Aug 31  2022 sound1.mp3
```

9. 이미지 커밋

9.1 c1 컨테이너를 이미지로 커밋

```bash
root@docker01:~# docker container commit c1 dawn-games:v0.1
sha256:69bd176b9a1c85bb4418dccc9cfe3063f47b877eb0628b7b2a5d96eda4f3b244
```

9.2 이미지 확인

```bash
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v0.1      69bd176b9a1c   45 seconds ago   236MB
```

10. 사용자 정의 이미지 실행

10.1 사용자 정의 명령 없이 실행

```bash
root@docker01:~# docker run -itd -p 80:80 --name game dawn-games:v0.1
a42c86886e83089c4ad72673d46eb8ac1d41ece7977cc1d307339d69749c7dab
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND       CREATED         STATUS         PORTS                               NAMES
a42c86886e83   dawn-games:v0.1   "/bin/bash"   8 seconds ago   Up 7 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   game
root@docker01:~# docker top game
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                15178               15154               0                   06:27               pts/0               00:00:00            /bin/bash
root@docker01:~# docker exec -it game sh
sh-4.2# nginx
sh-4.2#
```

10.2 시작 명령을 지정해 컨테이너 실행

```bash
root@docker01:~# docker run -itd -p 80:80 --name game dawn-games:v0.1 nginx -g 'daemon off;'
175bdc314d92dd911f2b0e4a8c8665d9b3415156deb5e52b8387aae52d14df3e
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS          PORTS                               NAMES
175bdc314d92   dawn-games:v0.1   "nginx -g 'daemon of…"   14 seconds ago   Up 13 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   game
```

10.3 새로운 시작 이미지를 한 번 더 커밋하면 끝

```bash
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED         STATUS         PORTS                               NAMES
175bdc314d92dd911f2b0e4a8c8665d9b3415156deb5e52b8387aae52d14df3e   dawn-games:v0.1   "nginx -g 'daemon off;'"   2 minutes ago   Up 2 minutes   0.0.0.0:80->80/tcp, :::80->80/tcp   game
root@docker01:~# docker commit game dawn-games:v0.2
sha256:dd4932b55d441d802585724172fb4fc47781200cc0f687c0fb607fe011999cbd
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v0.2      dd4932b55d44   14 seconds ago   236MB
dawn-games   v0.1      69bd176b9a1c   7 minutes ago    236MB
root@docker01:~# docker run -d -p 88:80 --name game02 dawn-games:v0.2
3e4e52204e0072fe2fdbd6c9590968100bcbad2304d2bdfa173a35e96dced3cd
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED         STATUS         PORTS                               NAMES
3e4e52204e0072fe2fdbd6c9590968100bcbad2304d2bdfa173a35e96dced3cd   dawn-games:v0.2   "nginx -g 'daemon off;'"   7 seconds ago   Up 6 seconds   0.0.0.0:88->80/tcp, :::88->80/tcp   game02
```

자식 이미지를 시작할 때 COMMAND(컨테이너 시작 명령)를 지정하지 않으면 부모 이미지의 시작 명령이 사용됩니다

### 1.2 Ubuntu 환경에서 게임 이미지 만들기

1. 이미지 가져오기

```bash
root@docker01:~# docker pull ubuntu:22.04
```

2. Ubuntu 이미지 실행

```bash
root@docker01:~# docker container run --name c1 -it ubuntu:22.04
root@cd4225a50f46:/#
```

3. 서비스 설치

```bash
root@cd4225a50f46:/# apt update
root@cd4225a50f46:/# apt -y install nginx
root@cd4225a50f46:/# rm -f /var/www/html/*
```

4. 테스트 코드 복사

```bash
root@docker01:~# docker cp  bird/ c1:/var/www/html/
Successfully copied 172kB to c1:/var/www/html/
```

5. 테스트 데이터 준비

```bash
root@cd4225a50f46:/# cd /var/www/html/bird/
root@cd4225a50f46:/var/www/html/bird# mv * ../
root@cd4225a50f46:/var/www/html/bird# cd ..
root@cd4225a50f46:/var/www/html# rm -rf bird/
root@cd4225a50f46:/var/www/html# ll
total 152
drwxr-xr-x 3 root root  4096 Oct 28 06:38 ./
drwxr-xr-x 3 root root  4096 Oct 28 06:36 ../
-rw-r--r-- 1 root root 15329 Aug 31  2022 2000.png
-rw-r--r-- 1 root root 51562 Aug 31  2022 21.js
-rw-r--r-- 1 root root   254 Aug 31  2022 icon.png
drwxr-xr-x 2 root root  4096 Feb 23  2023 img/
-rw-r--r-- 1 root root  3049 Aug 31  2022 index.html
-rw-r--r-- 1 root root 63008 Aug 31  2022 sound1.mp3
```

6. 이미지 커밋

```bash
root@docker01:~# docker commit c1 dawn-games:v1.0
sha256:b9468a21eb088f88c31b2f72b9889135662fad37a0c54d5782bf87426d901af4
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v1.0      b9468a21eb08   12 seconds ago   215MB
dawn-games   v0.2      dd4932b55d44   7 minutes ago    236MB
dawn-games   v0.1      69bd176b9a1c   14 minutes ago   236MB
```

7. 서비스 실행

```bash
root@docker01:~# docker run -d -p 81:80 --name game dawn-games:v1.0 nginx -g 'daemon off;'
9ab6168a04f68060b7e804c3b34684cc23d3ecc6c0a7622495ffad1d74ce3b9b
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS          PORTS                               NAMES
9ab6168a04f6   dawn-games:v1.0   "nginx -g 'daemon of…"   12 seconds ago   Up 11 seconds   0.0.0.0:81->80/tcp, :::81->80/tcp   game
```

8. 이미지 재커밋

```bash
root@docker01:~# docker commit game dawn-games:v1.1
sha256:405ca93633d6795d6b6efa2df521dfd229776647e452535123bacccf7537939a
root@docker01:~# docker run -d --name game2 -p 82:80 dawn-games:v1.1
08a61bc3faaa83c37b38d8507da811c601c7c5622fc82aec09f1f31d93433106
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                               NAMES
08a61bc3faaa   dawn-games:v1.1   "nginx -g 'daemon of…"   8 seconds ago   Up 7 seconds   0.0.0.0:82->80/tcp, :::82->80/tcp   game2
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v1.1      405ca93633d6   24 seconds ago   215MB
dawn-games   v1.0      b9468a21eb08   2 minutes ago    215MB
dawn-games   v0.2      dd4932b55d44   9 minutes ago    236MB
dawn-games   v0.1      69bd176b9a1c   16 minutes ago   236MB
```

Ubuntu 이미지로 각종 서비스를 만들면 CentOS 보다 공간을 더 절약할 수 있습니다

### 1.3 Alpine 환경에서 게임 이미지 만들기

1. 이미지 가져오기

```bash
root@docker01:~# docker pull alpine:3.20.2
```

2. 컨테이너를 실행해 서비스 설치

```bash
root@docker01:~# docker container run -it --name c1 alpine:3.20.2
/ # sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
/ # apk update
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community/x86_64/APKINDEX.tar.gz
v3.20.10-118-gcb3382a0eb8 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main]
v3.20.10-106-gcfb1a4769c3 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community]
OK: 24181 distinct packages available
/ # apk add nginx
(1/2) Installing pcre (8.45-r3)
(2/2) Installing nginx (1.26.3-r0)
Executing nginx-1.26.3-r0.pre-install
Executing nginx-1.26.3-r0.post-install
Executing busybox-1.36.1-r29.trigger
OK: 9 MiB in 16 packages
/ # nginx  -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
/ # du -sh /var/cache/
2.2M    /var/cache/
/ # rm -rf /var/cache/
/ # rm -f /usr/share/nginx/*
/ #
```

3. 테스트 코드 복사

```bash
root@docker01:~# docker cp bird c1:/usr/share/nginx/html
Successfully copied 172kB to c1:/usr/share/nginx/html
```

4. nginx 설정 파일 작성

```bash
/ # rm -f /etc/nginx/http.d/default.conf
/ # vi /etc/nginx/http.d/default.conf
server {
    listen 80;
    server_name _;

    location / {
        root /usr/share/nginx/html;
        index index.html;
    }
}

```

5. 설정 파일 문법 검사

```bash
/ # nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

6. 이미지 커밋

```bash
root@docker01:~# docker commit c1 dawn-games:v2.0
sha256:9f71529e87b1d0624cded19da5e939a22afe438583da169e76f8092d0c8e6047
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v2.0      9f71529e87b1   9 seconds ago    9.41MB
dawn-games   v1.1      405ca93633d6   15 minutes ago   215MB
dawn-games   v1.0      b9468a21eb08   17 minutes ago   215MB
dawn-games   v0.2      dd4932b55d44   24 minutes ago   236MB
dawn-games   v0.1      69bd176b9a1c   31 minutes ago   236MB
```

7. 컨테이너 실행

```bash
root@docker01:~# docker run -d -p 85:80 --name game dawn-games:v2.0 nginx -g 'daemon off;'
b9b3524f467b3e4895dccf96505d99862ace2641d720600ee51320a8050d20ef
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                               NAMES
b9b3524f467b   dawn-games:v2.0   "nginx -g 'daemon of…"   9 seconds ago   Up 8 seconds   0.0.0.0:85->80/tcp, :::85->80/tcp   game
```

8. 이미지 재커밋

```bash
root@docker01:~# docker commit game dawn-games:v2.1
sha256:db1ed8c3492a619b9618111fa8ba2d8c24450ddaa26a87e598e16f1d792b031f
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED              SIZE
dawn-games   v2.1      db1ed8c3492a   9 seconds ago        9.41MB
dawn-games   v2.0      9f71529e87b1   About a minute ago   9.41MB
dawn-games   v1.1      405ca93633d6   17 minutes ago       215MB
dawn-games   v1.0      b9468a21eb08   19 minutes ago       215MB
dawn-games   v0.2      dd4932b55d44   26 minutes ago       236MB
dawn-games   v0.1      69bd176b9a1c   33 minutes ago       236MB
root@docker01:~# docker run -d -p 86:80 --name game2 dawn-games:v2.1
8310670e0cc681911eb8f05bf6a83ca73ec7a6a46ace87ef333027249f629c9d
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED          STATUS          PORTS                               NAMES
8310670e0cc681911eb8f05bf6a83ca73ec7a6a46ace87ef333027249f629c9d   dawn-games:v2.1   "nginx -g 'daemon off;'"   12 seconds ago   Up 12 seconds   0.0.0.0:86->80/tcp, :::86->80/tcp   game2
```



### 1.4 수동 이미지 생성의 단점

1. 이미지 크기가 너무 커서 전송이 어렵다;

2. 이미지 수정이 복잡하다. 예를 들어 COMMAND 시작 명령을 바꾸려면 컨테이너를 실행하고 새 이미지를 커밋한 뒤 그 새 이미지로 다시 실행해야 한다;

3. 캐시 기능을 활용할 수 없어 명령을 한 줄씩 수동으로 실행해야 하며, Linux 가상머신을 다루는 것과 비슷하다.

## 2. Dockerfile 기반 자동 이미지 생성

### 2.1 작업 디렉터리로 이동

```bash
root@docker01:~# mkdir -pv /dawn/dockerfile && cd /dawn/dockerfile
mkdir: created directory '/dawn/dockerfile'
root@docker01:/dawn/dockerfile# mkdir alpine centos ubuntu
root@docker01:/dawn/dockerfile# ll
total 20
drwxr-xr-x 5 root root 4096 Oct 28 07:10 ./
drwxr-xr-x 4 root root 4096 Oct 28 07:10 ../
drwxr-xr-x 2 root root 4096 Oct 28 07:10 alpine/
drwxr-xr-x 2 root root 4096 Oct 28 07:10 centos/
drwxr-xr-x 2 root root 4096 Oct 28 07:10 ubuntu/
```

### 2.2 Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile# cd alpine/
root@docker01:/dawn/dockerfile/alpine# mkdir bird
root@docker01:/dawn/dockerfile/alpine# cd bird/
root@docker01:/dawn/dockerfile/alpine/bird# ll
total 8
drwxr-xr-x 2 root root 4096 Jul 24 04:06 ./
drwxr-xr-x 3 root root 4096 Jul 24 04:06 ../
root@docker01:/dawn/dockerfile/alpine/bird# cat Dockerfile
# 베이스 이미지 지정. 이후 모든 작업은 이 이미지 위에서 수행된다
FROM alpine:3.20.2

# 컨테이너에서 명령을 실행해 nginx 서비스 설치
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
      rm -rf /var/cache/ rm -f /usr/share/nginx/*

# 현재 디렉터리의 "dawn-bird.zip" 을 컨테이너의 / 디렉터리로 복사
#COPY dawn-bird.zip /
COPY dawn-bird.tar.gz /

# 컨테이너에서 지정 디렉터리로 프로그램 압축 해제
#RUN unzip /dawn-bird.zip -d  /usr/share/nginx/html  && \
#    rm -f /dawn-bird.zip
RUN mkdir -pv /usr/share/nginx/html  && \
    tar xf /dawn-bird.tar.gz -C /usr/share/nginx/html && \
    rm -f /dawn-bird.tar.gz

# 로컬 파일을 컨테이너의 지정 경로로 복사해 기존 파일 내용을 덮어씀
COPY bird.conf /etc/nginx/http.d/default.conf

# 컨테이너 시작 명령 지정
CMD ["nginx","-g","daemon off;"]
```

### 2.3 파일 패키징

```bash
root@docker01:~/bird# tar -czvf dawn-bird.tar.gz *
2000.png
21.js
icon.png
img/
img/bg1.jpg
img/s1.png
img/number1.png
img/number2.png
img/bg2.jpg
img/s2.png
index.html
sound1.mp3
root@docker01:~/bird# mv dawn-bird.tar.gz /dawn/dockerfile/alpine/bird/
```

### 2.4 테스트 파일 준비

```bash
root@docker01:/dawn/dockerfile/alpine/bird# cat bird.conf
server {
    listen 80;
    location / {
       root /usr/share/nginx/html;
       index index.html;
    }
}
```

### 2.5 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/bird# docker image build -t dawn-games:v2.3 .
```

### 2.6 이미지로 서비스 실행

```bash
root@docker01:/dawn/dockerfile/alpine/bird# docker run -d --name game -p 80:80 dawn-games:v2.3
b7e8cb9ef8f314ce52bfa245fcb4af6e6c5985a5de0db85ebe426802f1a60918
```

운영 환경에서는 파일을 tar 패키지로 묶을 것을 권장합니다. zip 은 압축 과정에서 파일이 손상될 수 있으며, 특히 이미지 파일에서 자주 발생합니다
