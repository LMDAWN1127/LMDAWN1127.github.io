---
title: "Dockerfile 멀티 스테이지 빌드 실전"
date: 2026-10-29T12:24:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "멀티 스테이지 빌드(Multi-Stage Build)로 Docker 이미지 크기를 어떻게 크게 줄이는지 시연한다. 1부에서는 3개의 FROM 스테이지(xixi/haha/최종)로 v3.0 을 빌드하며, 처음 두 스테이지가 만든 24MB/2048MB 큰 파일은 최종 이미지에 들어가지 않고 최종 이미지는 작은 로그 2개만 COPY 한다(7.8MB). 2부에서는 Golang 을 예로, 스테이지 1에서 Go SDK 로 hello 바이너리를 컴파일하고 스테이지 2에서 COPY --from=0 으로 바이너리만 복사해 v3.2 를 9.71MB 로 줄이며, 단일 스테이지 v3.1(259MB) 과 비교해 멀티 스테이지 빌드의 슬림한 이미지가 완전히 쓸 수 있음을 보인다."
---

# Dockerfile 멀티 스테이지 빌드 실전

**실험 목적**

하나의 Dockerfile 에서 여러 `FROM` 으로 여러 빌드 스테이지를 정의하고, 최종 이미지에는 필요한 산출물만 남겨 이미지 크기를 크게 줄이고 빌드 도구체인이 프로덕션 이미지에 들어가는 것을 막는다.

---

## 1부: 멀티 스테이지 빌드 기초

### 1.1 Dockerfile 작성 (3단계 빌드)

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# cat Dockerfile
FROM alpine:3.20.2 AS xixi

RUN mkdir /dawn-xixi && \
    dd if=/dev/zero of=/dawn-xixi/bigfile.txt count=024 bs=1M && \
    echo "xixi ~" > /dawn-xixi/xixi.log

FROM alpine:3.20.2 AS haha

RUN mkdir /dawn-haha && \
    dd if=/dev/zero of=/dawn-haha/bigfile.txt count=2048 bs=1M && \
    echo "haha ~ "> /dawn-haha/haha.log

FROM alpine:3.20.2

MAINTAINER dawn

LABEL school=czu \
      class=computer01 \
      offic=www.dawn.com

RUN mkdir /dawn-hehe

# 이 스테이지는 다른 두 스테이지로부터 데이터를 복사한다
COPY --from=xixi /dawn-xixi/xixi.log /dawn-hehe
COPY --from=haha /dawn-haha/haha.log /dawn-hehe

ENTRYPOINT ["tail","-f","/etc/hosts"]
```

처음 두 스테이지는 각각 큰 파일(24MB 및 2048MB 의 `bigfile.txt`)을 생성하지만, 최종 스테이지는 작은 로그 2개만 `COPY --from` 하므로 큰 파일은 최종 이미지에 들어가지 않는다.

### 1.2 빌드 스크립트 작성

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# cat build.sh
#!/bin/bash

docker image build -t dawn-games:v3.0 .
```

### 1.3 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# ./build.sh
Sending build context to Docker daemon  3.584kB
Step 1/11 : FROM alpine:3.20.2 AS xixi
 ---> 324bc02ae123
Step 2/11 : RUN mkdir /dawn-xixi && dd ... count=024 bs=1M && echo "xixi ~" > /dawn-xixi/xixi.log
 ---> 70e43027bb68
Step 3/11 : FROM alpine:3.20.2 AS haha
 ---> 324bc02ae123
Step 4/11 : RUN mkdir /dawn-haha && dd ... count=2048 bs=1M && echo "haha ~ "> /dawn-haha/haha.log
 ---> 75b9e1182ed1
Step 5/11 : FROM alpine:3.20.2
 ---> 324bc02ae123
...
Step 9/11 : COPY --from=xixi /dawn-xixi/xixi.log /dawn-hehe
 ---> ff55e6ecbe07
Step 10/11 : COPY --from=haha /dawn-haha/haha.log /dawn-hehe
 ---> 97c98bb4ede2
Step 11/11 : ENTRYPOINT ["tail","-f","/etc/hosts"]
 ---> 469842a76b21
Successfully built 469842a76b21
Successfully tagged dawn-games:v3.0
```

### 1.4 이미지 크기 및 내용 확인

**컨테이너 크기 확인:**

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# docker image ls dawn-games:v3.0
REPOSITORY      TAG       IMAGE ID       CREATED         SIZE
dawn-games   v3.0      469842a76b21   5 minutes ago   7.8MB
```

**컨테이너 내용 확인:**

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# docker run -d --name ms-c2 dawn-games:v3.0
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# docker exec ms-c2 ls -la /dawn-hehe/
total 16
drwxr-xr-x    1 root     root          4096 Oct 29 04:24 .
drwxr-xr-x    1 root     root          4096 Oct 29 04:24 ..
-rw-r--r--    1 root     root             8 Oct 29 04:24 haha.log
-rw-r--r--    1 root     root             7 Oct 29 04:24 xixi.log
```

---

## 2부: 멀티 스테이지 빌드 사례 — Golang 바이너리

Go SDK 로 바이너리를 컴파일하지만 최종 이미지에는 바이너리만 남기고 Go SDK 는 포함하지 않는다.

### 2.1 Go SDK 다운로드

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# wget https://studygolang.com/dl/golang/go1.22.5.linux-amd64.tar.gz
...
67250K .......... .......... 100%  95.7M=4.1s
-rw-r--r-- 1 root root 66M Jul  2  2024 go1.22.5.linux-amd64.tar.gz
```

### 2.2 Go 프로그램 준비

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# cat hello.go
package main

import "fmt"

type School struct {
  Name string
  Office string
}

func (s *School)SayHi() {
  fmt.Printf("%s의 회사 웹사이트는 %s\n",s.Name, s.Office)
}

func main(){
  school := &School{}

  school.Name = "dawn"

  school.Office = "https://www.dawn.com"

  school.SayHi()
}
```

### 2.3 멀티 스테이지 Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# cat Dockerfile
FROM alpine:3.20.2

ADD go1.22.5.linux-amd64.tar.gz /dawn/softwares

RUN ln -svf /dawn/softwares/go/bin/* /usr/local/bin/ && \
    mkdir /dawn/code

COPY hello.go /dawn/code

RUN go build -o /dawn/src/hello /dawn/code/hello.go

FROM alpine:3.20.2

MAINTAINER dawn

LABEL auther=dawn \
      school=czu \
      class=computer01 \
      office=www.dawn.com

COPY --from=0 /dawn/src/hello /

CMD ["tail","-f","/etc/hosts"]
```

| 스테이지                      | 역할     | 내용                                                    |
| ------------------------- | -------- | ------------------------------------------------------- |
| 첫 번째 스테이지（`FROM alpine`） | 빌드 환경 | Go SDK 를 포함하고 `go build` 로 바이너리 `/dawn/src/hello` 생성 |
| 두 번째 스테이지（`FROM alpine`） | 런타임 환경 | 오직 `COPY --from=0` 으로 컴파일된 바이너리만 복사                   |

### 2.4 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker image build -t dawn-games:v3.2 .
Sending build context to Docker daemon  68.98MB
Step 1/10 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 2/10 : ADD go1.22.5.linux-amd64.tar.gz /dawn/softwares
 ---> f6763999bdc8
Step 3/10 : RUN ln -svf /dawn/softwares/go/bin/* /usr/local/bin/ && mkdir /dawn/code
 ---> c475f3c3448e
Step 4/10 : COPY hello.go /dawn/code
 ---> 210c29f71df8
Step 5/10 : RUN go build -o /dawn/src/hello /dawn/code/hello.go
 ---> 9f27764a3368
Step 6/10 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 7/10 : MAINTAINER dawn
 ---> 075f5a77797f
Step 8/10 : LABEL auther=dawn school=czu class=computer01 office=www.dawn.com
 ---> 7ecc72f2524b
Step 9/10 : COPY --from=0 /dawn/src/hello /
 ---> 968499cbfb26
Step 10/10 : CMD ["tail","-f","/etc/hosts"]
 ---> 6085282e9e9b
Successfully built 6085282e9e9b
Successfully tagged dawn-games:v3.2
```

비교를 위해 단일 스테이지 Dockerfile 로도 v3.1 을 빌드했다(Go SDK 와 컴파일 과정을 이미지 안에 모두 남김).

### 2.5 이미지 크기 비교

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker image ls dawn-games:v3.1
REPOSITORY      TAG       IMAGE ID       CREATED          SIZE
dawn-games   v3.1      bc9f464b4814   20 seconds ago   259MB

root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker image ls dawn-games:v3.2
REPOSITORY      TAG       IMAGE ID       CREATED         SIZE
dawn-games   v3.2      0b3166a37142   39 seconds ago   9.71MB
```

### 2.6 테스트 및 검증

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker run -d --name go dawn-games:v3.2
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker exec -it go sh
/ # ls /
bin    dev    etc    hello  home   lib    media  mnt    opt    proc   root   run    sbin   srv    sys    tmp    usr    var
/ # ./hello
dawn 의 회사 웹사이트는 https://www.dawn.com
/ #
```

컨테이너에는 `hello` 바이너리만 있고(Go SDK 없음), `./hello` 를 실행하면 정상 출력되므로 멀티 스테이지 빌드의 슬림한 이미지가 완전히 쓸 수 있음을 보인다.
