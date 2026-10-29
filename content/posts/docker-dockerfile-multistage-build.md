---
title: "Dockerfile 多阶段构建镜像实战"
date: 2026-10-29T12:24:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "通过多阶段构建（Multi-Stage Build）演示如何大幅减小 Docker 镜像体积：第一部分用三个 FROM 阶段（xixi/haha/最终）构建 v3.0，前两个阶段生成的 24MB/2048MB 大文件不进入最终镜像，最终只 COPY 两个小日志（7.8MB）；第二部分以 Golang 为例，第一阶段用 Go SDK 编译出 hello 二进制，第二阶段只 COPY --from=0 拷贝二进制，v3.2 仅 9.71MB，对比单阶段 v3.1 的 259MB，证明多阶段构建的精简镜像完全可用。"
---

# Dockerfile 多阶段构建镜像实战

**实验目的**

在一个 Dockerfile 里用多个 `FROM` 定义多个构建阶段，最终镜像只保留需要的产物，从而大幅减小镜像体积、避免把编译工具链带入生产镜像。

---

## 第一部分：多阶段构建基础

### 1.1 编写 Dockerfile（三阶段构建）

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

# 本阶段从其他2个阶段拷贝数据
COPY --from=xixi /dawn-xixi/xixi.log /dawn-hehe
COPY --from=haha /dawn-haha/haha.log /dawn-hehe

ENTRYPOINT ["tail","-f","/etc/hosts"]
```

前两个阶段各生成了大文件（24MB 和 2048MB 的 `bigfile.txt`），但最终阶段只 `COPY --from` 了两个小日志文件，大文件不会进入最终镜像。

### 1.2 编写构建脚本

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# cat build.sh
#!/bin/bash

docker image build -t dawn-games:v3.0 .
```

### 1.3 构建镜像

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

### 1.4 验证镜像大小与内容

**验证容器大小：**

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# docker image ls dawn-games:v3.0
REPOSITORY      TAG       IMAGE ID       CREATED         SIZE
dawn-games   v3.0      469842a76b21   5 minutes ago   7.8MB
```

**验证容器内容：**

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

## 第二部分：多阶段构建案例之Golang二进制程序

用 Go SDK 编译出二进制，但最终镜像只保留二进制，不含 Go SDK。

### 2.1 下载 Go SDK

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# wget https://studygolang.com/dl/golang/go1.22.5.linux-amd64.tar.gz
...
67250K .......... .......... 100%  95.7M=4.1s
-rw-r--r-- 1 root root 66M Jul  2  2024 go1.22.5.linux-amd64.tar.gz
```

### 2.2 准备 Go 程序

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# cat hello.go
package main

import "fmt"

type School struct {
  Name string
  Office string
}

func (s *School)SayHi() {
  fmt.Printf("%s的公司官网是%s\n",s.Name, s.Office)
}

func main(){
  school := &School{}

  school.Name = "dawn"

  school.Office = "https://www.dawn.com"

  school.SayHi()
}
```

### 2.3 编写多阶段 Dockerfile

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

| 阶段                      | 作用     | 内容                                                    |
| ------------------------- | -------- | ------------------------------------------------------- |
| 第一阶段（`FROM alpine`） | 编译环境 | 含 Go SDK，执行 `go build` 生成二进制 `/dawn/src/hello` |
| 第二阶段（`FROM alpine`） | 运行环境 | 只 `COPY --from=0` 拷贝编译好的二进制                   |

### 2.4 构建镜像

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

为对比，另外用单阶段 Dockerfile 构建了 v3.1（把 Go SDK 和编译过程全部留在镜像里）。

### 2.5 对比镜像大小

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker image ls dawn-games:v3.1
REPOSITORY      TAG       IMAGE ID       CREATED          SIZE
dawn-games   v3.1      bc9f464b4814   20 seconds ago   259MB

root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker image ls dawn-games:v3.2
REPOSITORY      TAG       IMAGE ID       CREATED         SIZE
dawn-games   v3.2      0b3166a37142   39 seconds ago   9.71MB
```

### 2.6 测试验证

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker run -d --name go dawn-games:v3.2
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker exec -it go sh
/ # ls /
bin    dev    etc    hello  home   lib    media  mnt    opt    proc   root   run    sbin   srv    sys    tmp    usr    var
/ # ./hello
dawn的公司官网是https://www.dawn.com
/ #
```

容器里只有 `hello` 二进制（没有 Go SDK），运行 `./hello` 正常输出，说明多阶段构建的精简镜像完全可用。
