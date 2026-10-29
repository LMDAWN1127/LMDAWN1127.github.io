---
title: "Docker 実戦：OverlayFS のユニオンマウントとストレージドライバ解析"
date: 2026-10-26T21:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker のストレージドライバ OverlayFS の仕組み：lower/upper/work と LowerDir/Upperdir/MergedDir の三層（init 層を含む）と、読み書き層へのコピーオンライト。さらに手動の mount -t overlay で階層化と読み取り専用を実演し、最後に docker run でコンテナの土台が overlay2 であることを確認します。"
---

# Docker 実戦：OverlayFS のユニオンマウントとストレージドライバ解析

## 1. OverlayFS の概要

OverlayFS はスタック型のファイルシステムで、他のファイルシステム（ext4fs や xfs など）に依存しその上に構築されます。ディスク空間構造の分割には直接関与せず、元のファイルシステム内のファイルやディレクトリを「まとめて結合」するだけで、最終的に「結合」されたファイルを同一階層のディレクトリにあるかのようにユーザーへ見せます。これがユニオンマウント技術です。AUFS（1.12 より前の初期に使われていたストレージ技術）と比べ、OverlayFS はより高速で実装もシンプルです。

Linux カーネルが Docker に提供する OverlayFS ドライバには Overlay と Overlay2 の 2 種類があります。Overlay2 は Overlay を改良したもので、Inode の利用率の面で Overlay より効率的です。

ただし Overlay には環境要件があります:

(1) Docker バージョン 17.06.02 以上;

(2) ホストのファイルシステムは EXT4 または XFS 形式である必要があります。

OverlayFS の実装方式:

OverlayFS は lower ディレクトリ・upper ディレクトリ・work ディレクトリの 3 つのディレクトリで実現されます。

lower:

一般的に対応するのは読み取り専用のデータです。

upper:

読み書き操作が可能なディレクトリです。

work:

作業のベースとなるディレクトリで、マウント後に自動的に work サブディレクトリが作成されます（実際の検証では、手動でアンマウントしてもこのディレクトリは削除されませんでした）

このディレクトリは、一時的な結果や中間データを置くための作業ディレクトリとして主に使われます。

使用中の内容はユーザーには見えず、最後にユニオンマウントが完了してユーザーに提示される統一ビューが merged ディレクトリと呼ばれます。

OverlayFS の構造は 3 つの層に分かれます: LowerDir、Upperdir、MergedDir

### LowerDir (読み取り専用)

読み取り専用の image layer、実体は rootfs です。

Dockerfile でイメージをビルドするとき、Image Layer は多くの層に分かれるため、対応する lowerdir も多くなります（元イメージ）。

Lower には 2 つの層があります:

(1) システムの init

```bash
1. コンテナ起動後、既定では lower 層の内容は変更できませんが、ホスト名やドメイン名の解決先を変更したいという要求があるため、init 層のファイル（hostname, resolv.conf, hosts, mtab など）を追加してこの種の問題に対処します;
2. 変更内容は現在のコンテナにのみ有効で、docker commit でイメージとしてコミットするときに init 層はコミットされません;
3. init ファイルの保存先ディレクトリは /var/lib/docker/overlay2/<init_id>/diff
```

(2) コンテナのイメージ層

変更できないデータです。

### Upperdir (読み書き)

upperdir は lowerdir の上にある層で、読み書き層です。コンテナの起動時に作成され、コンテナへの変更はすべてこの層で行われます。たとえばコンテナ起動時に書き込まれるログファイルや、アプリケーションが書き込む一時ファイルなどです。

### MergedDir (表示)

merged ディレクトリはコンテナのマウントポイントであり、ユーザーの視点から見えるすべてのファイルはこの層から提示されます。

## 2. OverlayFS の実例

### 2.1 作業ディレクトリを作成

```bash
root@docker02:~# mkdir -pv /dawn/lower{0..2} /dawn/{uppper,work,merged}
mkdir: created directory '/dawn/lower0'
mkdir: created directory '/dawn/lower1'
mkdir: created directory '/dawn/lower2'
mkdir: created directory '/dawn/uppper'
mkdir: created directory '/dawn/work'
mkdir: created directory '/dawn/merged'
```

### 2.2 ファイルシステムをマウント

```bash
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,upperdir=/dawn/uppper,workdir=/dawn/work  /dawn/merged/
```

### 2.3 マウント情報を確認

```bash
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
```

### 2.4 lower 層に初期データを書き込む

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

### 2.5 upper 層に初期データを書き込む

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

### 2.6 merged ディレクトリにデータを書き込み、実際には upper 層に書き込まれることを確認

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

### 2.7 upperdir 層を指定せずに再マウント

```bash
root@docker02:~# umount /dawn/merged
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,workdir=/dawn/work  /dawn/merged/
```

### 2.8 書き込み層がないため、再度の書き込みが失敗する

```bash
root@docker02:~# cp /etc/os-release /dawn/merged/
cp: cannot create regular file '/dawn/merged/os-release': Read-only file system
```

## 3. Docker の内部で OverlayFS が使われている

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
root@docker02:~# docker exec c1 touch /haha.log  # 書き込み操作を実行
root@docker02:~# ls /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/diff  # 明らかに、データは読み書き層に書き込まれました
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
