---
title: "Dockerfile マルチステージビルド実戦"
date: 2026-10-29T12:24:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "マルチステージビルド（Multi-Stage Build）で Docker イメージをどうやって大幅に小さくするか実演します。第 1 部では 3 つの FROM ステージ（xixi/haha/最終）で v3.0 をビルドし、最初の 2 ステージが生成した 24MB/2048MB の大きなファイルは最終イメージに入らず、最終イメージは 2 つの小さなログだけを COPY します（7.8MB）。第 2 部では Golang を例に、ステージ 1 で Go SDK を用いて hello バイナリをコンパイルし、ステージ 2 で COPY --from=0 によってバイナリだけをコピーして v3.2 を 9.71MB に抑え、単一ステージの v3.1（259MB）と比較して、マルチステージビルドのスリムなイメージが完全に使えることを示します。"
---

# Dockerfile マルチステージビルド実戦

**実験目的**

1 つの Dockerfile 内で複数の `FROM` を使って複数のビルドステージを定義し、最終イメージには必要な成果物だけを残すことで、イメージサイズを大幅に削減し、ビルドツールチェーンを本番イメージに持ち込むのを避ける。

---

## 第 1 部：マルチステージビルドの基礎

### 1.1 Dockerfile の作成（3 ステージビルド）

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

# このステージは他の 2 つのステージからデータをコピーする
COPY --from=xixi /dawn-xixi/xixi.log /dawn-hehe
COPY --from=haha /dawn-haha/haha.log /dawn-hehe

ENTRYPOINT ["tail","-f","/etc/hosts"]
```

最初の 2 ステージはそれぞれ大きなファイル（24MB と 2048MB の `bigfile.txt`）を生成するが、最終ステージは 2 つの小さなログファイルだけを `COPY --from` するため、大きなファイルは最終イメージに入らない。

### 1.2 ビルドスクリプトの作成

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# cat build.sh
#!/bin/bash

docker image build -t dawn-games:v3.0 .
```

### 1.3 イメージのビルド

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

### 1.4 イメージサイズと内容の確認

**コンテナサイズの確認：**

```bash
root@docker01:/dawn/dockerfile/alpine/MultiStageConstruction# docker image ls dawn-games:v3.0
REPOSITORY      TAG       IMAGE ID       CREATED         SIZE
dawn-games   v3.0      469842a76b21   5 minutes ago   7.8MB
```

**コンテナ内容の確認：**

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

## 第 2 部：マルチステージビルド事例 — Golang バイナリ

Go SDK でバイナリをコンパイルするが、最終イメージにはバイナリだけを残し Go SDK は含めない。

### 2.1 Go SDK のダウンロード

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# wget https://studygolang.com/dl/golang/go1.22.5.linux-amd64.tar.gz
...
67250K .......... .......... 100%  95.7M=4.1s
-rw-r--r-- 1 root root 66M Jul  2  2024 go1.22.5.linux-amd64.tar.gz
```

### 2.2 Go プログラムの準備

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# cat hello.go
package main

import "fmt"

type School struct {
  Name string
  Office string
}

func (s *School)SayHi() {
  fmt.Printf("%sの会社の公式サイトは%s\n",s.Name, s.Office)
}

func main(){
  school := &School{}

  school.Name = "dawn"

  school.Office = "https://www.dawn.com"

  school.SayHi()
}
```

### 2.3 マルチステージ Dockerfile の作成

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

| ステージ                      | 役割     | 内容                                                    |
| ------------------------- | -------- | ------------------------------------------------------- |
| 第 1 ステージ（`FROM alpine`） | ビルド環境 | Go SDK を含み、`go build` を実行してバイナリ `/dawn/src/hello` を生成 |
| 第 2 ステージ（`FROM alpine`） | 実行環境 | `COPY --from=0` でコンパイル済みバイナリだけをコピー                   |

### 2.4 イメージのビルド

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

比較のため、単一ステージの Dockerfile でも v3.1 をビルドしている（Go SDK とコンパイルプロセスをすべてイメージ内に残す）。

### 2.5 イメージサイズの比較

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker image ls dawn-games:v3.1
REPOSITORY      TAG       IMAGE ID       CREATED          SIZE
dawn-games   v3.1      bc9f464b4814   20 seconds ago   259MB

root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker image ls dawn-games:v3.2
REPOSITORY      TAG       IMAGE ID       CREATED         SIZE
dawn-games   v3.2      0b3166a37142   39 seconds ago   9.71MB
```

### 2.6 テストと検証

```bash
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker run -d --name go dawn-games:v3.2
root@docker01:/dawn/dockerfile/alpine/multiStageGolang# docker exec -it go sh
/ # ls /
bin    dev    etc    hello  home   lib    media  mnt    opt    proc   root   run    sbin   srv    sys    tmp    usr    var
/ # ./hello
dawn の会社の公式サイトは https://www.dawn.com
/ #
```

コンテナには `hello` バイナリだけが存在し（Go SDK はなし）、`./hello` を実行すると正常に出力されるため、マルチステージビルドのスリムなイメージが完全に使えることがわかる。
