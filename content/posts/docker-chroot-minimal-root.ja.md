---
title: "Docker 実戦：chroot で最小コンテナルートを手作りしてコンテナの本質を理解する"
date: 2026-10-26T19:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker コマンドを使わず、chroot で最小コンテナルートをゼロから手作り (bash と動的ライブラリチェーンをコピー) し、ファイルシステム分離の「コンテナ感」を味わいます。さらに 2 つの独立ルートでプロセス/データが互いに見えないことを示し、最後に実コンテナの overlay2 merged ファイルシステムに chroot してファイルを直したりログを読んだりします。"
---

# Docker 実戦：chroot で最小コンテナルートを手作りしてコンテナの本質を理解する

この記事では Docker コマンドを並べるのではなく、もう一段下のレイヤーに降りて `chroot` で最小コンテナルートをゼロから手作りします (bash とその動的ライブラリ依存チェーンをコピー)。ファイルシステム分離という「コンテナ感」を直感的に味わうためです。さらに 2 つの独立したルートディレクトリでプロセス/データが互いに見えないことを示し、最後に実際の Docker コンテナの overlay2 merged ファイルシステムに直接 `chroot` してファイルを直したりログを読んだりします。

## 1. 作業ディレクトリを作成

```bash
root@docker02:~# mkdir -pv dawn-dawn/bin dawn-dawn/lib dawn-dawn/lib64
mkdir: created directory 'dawn-dawn/bin'
mkdir: created directory 'dawn-dawn/lib'
mkdir: created directory 'dawn-dawn/lib64'
```

## 2. bash とその依存環境をコピー

**まず bash が何に依存するかを見る**

```bash
root@docker02:~# ldd /bin/bash
	linux-vdso.so.1 (0x00007ffefd1f3000)
	libtinfo.so.6 => /lib/x86_64-linux-gnu/libtinfo.so.6 (0x00007ff773e35000)
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007ff773c0c000)
	/lib64/ld-linux-x86-64.so.2 (0x00007ff773fcf000)
```

ldd が出力するのは動的ライブラリの依存チェーンです。bash 自体は動きませんが、readline を呼ぶには libtinfo が、printf/malloc には libc が必要で、これらすべてを読み込むのが ld-linux (動的リンカ。カーネルが ELF を起動するとき最初に読み込むもので、これがないと bash すら起動できません) です。

**依存関係に従ってコピー**

```bash
root@docker02:~# cp /bin/bash dawn-dawn/bin/
root@docker02:~# cp /lib/x86_64-linux-gnu/libtinfo.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libc.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib64/ld-linux-x86-64.so.2 dawn-dawn/lib64/
```

## 3. ls とその依存環境をコピー (推移的依存含む)

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

libselinux はさらに libpcre2 や libc を引っ張ります - 依存は推移的で、一つでも漏らすと chroot 後に次のエラーになります:

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

## 4. ルートディレクトリを変更 (chroot)

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'for i in haha xixi; do echo $i; done'
haha
xixi
```

中に入ると、この bash から見た / は dawn-dawn/ になります

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'ls -l /'
total 12
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

ホストには数十のディレクトリがありますが、ここには 3 つしか残りません - これが「コンテナ感」の最も原初的な形です

## 5. 二重コンテナ分離デモ

環境を 1 つコピーして、2 つの独立したコンテナルートを得ます

```bash
root@docker02:~# cp -r dawn-dawn dawn-dawn01
```

**コンテナ 1** (端末 1): dawn-dawn に入り、「自分の /」にファイルを作ります

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'echo haha > /haha.txt; ls -l /'
total 16
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
-rw-r--r-- 1 0 0    5 Oct 26 09:09 haha.txt
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

**コンテナ 2** (端末 2): dawn-dawn01 に入り、同様に操作します

```bash
root@docker02:~# chroot dawn-dawn01/ /bin/bash -c 'echo xixi > /xixi.log; ls /'
bin
lib
lib64
xixi.log
```

**ホスト側からの検証** - 2 つの「コンテナ」は互いのデータが見えず、ホストのルートディレクトリからも見えません

```bash
root@docker02:~# ls /root/dawn-dawn/
bin  haha.txt  lib  lib64
root@docker02:~# ls /root/dawn-dawn01/
bin  lib  lib64  xixi.log
root@docker02:~# ls / | grep -E 'haha|xixi'
(出力なし)
```

## 6. Docker コンテナのファイルシステムに chroot する

chroot の出番はおもちゃのディレクトリだけではありません - 実際の Docker コンテナのファイルシステムに直接「潜り込め」ます。コンテナのルートはホストの /var/lib/docker/overlay2/<id>/merged です

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

コンテナが起動しない/シェルがない場合、ホストから chroot でその merged ディレクトリに入り、直接ファイルを直したりログを読んだりできます。