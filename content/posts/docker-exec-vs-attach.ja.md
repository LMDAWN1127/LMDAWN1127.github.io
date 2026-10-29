---
title: "Docker 実戦：docker exec と docker attach の違い"
date: 2026-10-28T12:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker top でプロセスツリーを比較し、docker exec と docker attach の本質的な違いを確認します。exec はコンテナ内で新しいプロセスを生成し、attach はローカルの標準入出力を実行中のメインプロセスに接続するだけです。また、attach を終了せずに抜けるには ctrl+p の直後に ctrl+q を押す方法も紹介します。"
---

# Docker 実戦：docker exec と docker attach の違い

`docker exec` と `docker attach` はどちらもコンテナに入れますが、本質は全く異なります。**exec はコンテナ内で新しいプロセスを生成**し、コンテナのメインプロセスには影響しません。**attach は新しいプロセスを一切生成せず**、単にローカルの標準入力／標準出力／標準エラー出力をコンテナの実行中メインプロセスに接続するだけです。以下では `docker top` で両者のプロセスツリーの違いを観察します。

## 1. 環境の準備

```bash
root@docker01:~# docker run -itd --name c5 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1
d81eb31cf5173dcb1d777559af33157dcef5a0d3f61e81f17103f27595c71a20
root@docker01:~# docker run -d --name c6 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
c91146c125ff956871ff359d428174e48d350eb94e9b671578d51a5e855abfeb
```

## 2. コンテナのプロセス情報を確認

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root@docker01:~# docker top c6
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9784                9763                0                   04:35               ?                   00:00:00            sleep 3600
```

## 3. exec で c5 コンテナに接続

### テスト 1

**一つの端末:**

```bash
root@docker01:~# docker exec -it c5 sh
/usr/local/stress # ls
bin    share
/usr/local/stress # sleep 3600
```

**もう一つの端末:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                9887                9671                0                   04:36               pts/1               00:00:00            sh
root                10120               9887                0                   04:37               pts/1               00:00:00            sleep 3600
```

### テスト 2

**一つの端末:**

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

**もう一つの端末:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                10176               9671                0                   04:38               ?                   00:00:00            tail -f /etc/hosts
```

## 4. attach で c5 コンテナに接続

**一つの端末:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               1                   04:41               pts/0               00:00:00            /bin/sh
root@docker01:~# docker attach c5
/usr/local/stress # sleep 3600
```

**もう一つの端末:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               0                   04:41               pts/0               00:00:00            /bin/sh
root                10485               10411               0                   04:42               pts/0               00:00:00            sleep 3600
```

## 5. 本質的な違いとデタッチ方法

exec は本質的に実行中のコンテナ内で新しいプロセスを生成し、コンテナ内で実行したい任意のコマンドを実行します;

attach は本質的に新しいプロセスを生成せず、単にローカルの標準入力・標準出力・標準エラー出力を実行中のコンテナに接続するだけです;

attach でコンテナから抜けたいが端末を終了したくない場合は、「ctrl + p」を連続して押した後、「ctrl + q」を押すと、現在の端末を終了せずに抜けることができます。