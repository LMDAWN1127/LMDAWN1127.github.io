---
title: "Jenkins 実践：プライベート導入・プラグイン導入・GitLab 連携 CI"
date: 2026-10-01T21:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "CI/CD"]
summary: "Jenkins を自前で導入する実践手順：JDK/Jenkins の RPM インストール、root 起動、プラグインのオフライン導入、GitLab の SSH 鍵認証と webhook 自動ビルドの連携。"
showToc: true
---

## 01. Jenkins 概要

1. 公式サイト：jenkins.io

2. Jenkins はオープンソースのプロジェクトで、Java ベースの継続的インテグレーション（CI）ツールである。繰り返しの作業を監視し、オープンで使いやすいソフトウェアプラットフォームを提供し、ソフトウェアの CI を可能にする。

## 02. Jenkins のデプロイ

```bash
I. 環境準備
1、OS：CentOS 7.9
2、メモリ：実験用 2G、本番用 6G 以上
3、ファイアウォールを無効化し、SELinux を無効にする
4、JDK17

II. JDK をインストール
RPM パッケージをアップロード
[root@jenkins ~]#ll
total 178212
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm

[root@jenkins ~]#rpm -ivh jdk-17_linux-x64_bin.rpm
warning: jdk-17_linux-x64_bin.rpm: Header V3 RSA/SHA256 Signature, key ID ad986da3: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jdk-17-2000:17.0.11-7            ################################# [100%]

インストールが成功したか確認：
[root@jenkins ~]# rpm -qa|grep jdk
jdk-17-17.0.11-7.x86_64

II. Jenkins をインストール
Jenkins パッケージをアップロード
[root@jenkins ~]#ll
total 269432
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm
-rw-r--r-- 1 root root  93405530 Oct  1 19:06 jenkins-2.405-1.1.noarch.rpm
[root@jenkins ~]#rpm -ivh jenkins-2.405-1.1.noarch.rpm
warning: jenkins-2.405-1.1.noarch.rpm: Header V4 RSA/SHA512 Signature, key ID ef5975ca: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jenkins-2.405-1.1                ################################# [100%]

III. Jenkins の実行ユーザーを root に変更
1) 設定ファイルの実行ユーザーを変更
[root@jenkins ~]# vim /etc/sysconfig/jenkins
...
JENKINS_USER="root"
...
2) 起動設定のユーザーを変更
[root@jenkins ~]# vim /usr/lib/systemd/system/jenkins.service
...
User=root
Group=root
...
[root@jenkins ~]# systemctl daemon-reload

3) フォント設定をインストール
[root@jenkins ~]# yum -y install fontconfig

IV. Jenkins を起動し、起動時に有効化
[root@jenkins ~]# systemctl start jenkins
[root@jenkins ~]# systemctl enable jenkins
```

## 03. Jenkins へログイン

![image-20261001192229088](/images/image-20261001192229088.png)

![](/images/img_p25_2_130.png)

![](/images/img_p26_1_133.png)

## 04. パスワードを変更

パスワード変更後は再ログイン（ユーザー名は admin）

![](/images/img_p26_2_136.png)

![](/images/img_p27_1_140.png)

## 05. プラグインのインストール

```bash
1. プラグインを Jenkins のホームディレクトリにアップロード
[root@jenkins ~]# cd /var/lib/jenkins/

[root@jenkins ~]#ll
total 576228
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm
-rw-r--r-- 1 root root  93405530 Oct  1 19:06 jenkins-2.405-1.1.noarch.rpm
-rw-r--r-- 1 root root 314156543 Oct  1 19:30 jenkins_plu.tar.gz

2. プラグインを plugins ディレクトリに展開
[root@jenkins jenkins]#tar xf /root/jenkins_plu.tar.gz -C plugins/

3. Jenkins を再起動して反映
[root@jenkins ~]# systemctl restart jenkins
```

## 06. プロジェクトを作成

フリープロジェクトを作成し、pwd を実行して Jenkins が使用する既定の作業ディレクトリを確認

![](/images/img_p28_1_147.png)

![](/images/img_p28_2_148.png)

![](/images/img_p29_1_151.png)

![](/images/img_p29_2_153.png)

![](/images/img_p30_1_156.png)

![](/images/img_p30_2_158.png)

補足：Jenkins がプロジェクトを作成すると、ホーム /var/lib/jenkins/ 配下に workspace ディレクトリを自動作成し、その中にプロジェクト名のディレクトリを作成する。

以降、Jenkins が GitLab からプルしたコードはこのプロジェクトディレクトリ配下に格納される。

```bash
[root@jenkins ~]#ls /var/lib/jenkins/workspace/
test_job
```

GitLab と Jenkins を連携させる

連携前は接続できない旨が表示される：

![image-20261001200618384](/images/image-20261001200618384.png)

```bash
# 鍵認証（非対話）を設定
[root@jenkins ~]#ssh-keygen
Generating public/private rsa key pair.
Enter file in which to save the key (/root/.ssh/id_rsa): Created directory '/root/.ssh'.
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in /root/.ssh/id_rsa.
Your public key has been saved in /root/.ssh/id_rsa.pub.
The key fingerprint is:
SHA256:Rr4ouinx/cPqVxJsxju2Cjd1mhWmWSuKGOKG532uTvk root@jenkins
The key's randomart image is:
+---[RSA 2048]----+
|                 |
|                 |
|     o  =        |
|      *B o       |
|o    o=oS        |
|=o . +=O..       |
|o=+.Bo+=.        |
|oo.B.+*          |
| .=+BOE.         |
+----[SHA256]-----+

[root@jenkins ~]#cat .ssh/id_rsa.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC+kaj/NEwHKaIErMEClVYuG3JuWr9CD7XpuO5YZ6JftMmNdAPMrvS0mWqP4SDyT6/le0j1RGkA48GsirESfMqXKvzSSd5AuhIPmUADtGPNK6VSeiMKyoWgiNBFLn6RIOAcXI0MuZrYQMLJz+kOYr6kF9em/6MfFQrLkt9DzIlnR9b7CMLyDnPOZ8FG640DqqX0sZ8G+i2v41VX/c7RGIWAgEhJY+kiMS5cDxWlTf2k8hoZmh0VIa/G9AwnvbklyUiE4ACd9GtEJG5xXJzedn7q0/Ygfr26T29t+KST3SlyrXIaEbEC5WwIMymCEJDCPPCGzqLjsWa+4dbJhoEM1afV root@jenkins

# Jenkins に git をインストール
[root@jenkins ~]#yum install -y git
```

GitLab に Jenkins が生成した鍵を追加：

![image-20261001201613164](/images/image-20261001201613164.png)

Jenkins 上で一度 git clone し、初回の yes 入力を完了させる

```bash
[root@jenkins ~]#git clone git@11.0.1.200:dawn/blog.git
Cloning into 'blog'...
The authenticity of host '11.0.1.200 (11.0.1.200)' can't be established.
ECDSA key fingerprint is SHA256:Ldn1vBzBEFxynXs0qBNr0XzJ2lTx/0caMuK5yJtb+Zo.
ECDSA key fingerprint is MD5:3d:1d:28:3f:33:ec:ee:c1:69:83:af:14:a3:7f:79:ac.
Are you sure you want to continue connecting (yes/no)? yes
Warning: Permanently added '11.0.1.200' (ECDSA) to the list of known hosts.
remote: Enumerating objects: 20, done.
remote: Counting objects: 100% (9/9), done.
remote: Compressing objects: 100% (8/8), done.
remote: Total 20 (delta 0), reused 0 (delta 0), pack-reused 11
Receiving objects: 100% (20/20), done.
Resolving deltas: 100% (2/2), done.
```

これで接続できるようになる

![image-20261001202612887](/images/image-20261001202612887.png)

再度ビルドしてプルをテスト

![image-20261001203243290](/images/image-20261001203243290.png)

プル成功

![image-20261001203330173](/images/image-20261001203330173.png)

![image-20261001203429229](/images/image-20261001203429229.png)

Webhook を設定

Webhook を設定し、GitLab のコードを Jenkins が自動的にプルしてビルドするよう構成

![image-20261001205129263](/images/image-20261001205129263.png)

![image-20261001205637856](/images/image-20261001205637856.png)

![image-20261001205830316](/images/image-20261001205830316.png)

![image-20261001205317890](/images/image-20261001205317890.png)

![image-20261001210203745](/images/image-20261001210203745.png)

両方保存してテスト

![image-20261001210523584](/images/image-20261001210523584.png)

プロジェクトを修正して再度プッシュしてテスト

```bash
[root@gitlab blog]#git branch
* master
[root@gitlab blog]#touch c.txt
[root@gitlab blog]#git add .
[root@gitlab blog]#git commit -m "test_v2"
[master 7b1f29e] test_v2
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 c.txt
[root@gitlab blog]#git pull origin master
remote: Enumerating objects: 17, done.
remote: Counting objects: 100% (9/9), done.
remote: Compressing objects: 100% (8/8), done.
remote: Total 17 (delta 0), reused 0 (delta 0), pack-reused 8
Unpacking objects: 100% (17/17), done.
From 11.0.1.200:dawn/blog
 * branch            master     -> FETCH_HEAD
Merge made by the 'recursive' strategy.
 a.txt | 1 +
 1 file changed, 1 insertion(+)
 create mode 100644 a.txt
[root@gitlab blog]#git push -u origin master
Counting objects: 7, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (4/4), done.
Writing objects: 100% (5/5), 469 bytes | 0 bytes/s, done.
Total 5 (delta 2), reused 0 (delta 0)
To git@11.0.1.200:dawn/blog.git
   47f606c..91e80a5  master -> master
Branch master set up to track remote branch master from origin.
```

自動ビルド成功

![image-20261001212025538](/images/image-20261001212025538.png)
