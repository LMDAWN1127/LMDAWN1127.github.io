---
title: "Jenkins 实战：私有化部署、插件安装与 GitLab 联动 CI"
date: 2026-10-01T21:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "CI/CD"]
summary: "从 RPM 安装 JDK 与 Jenkins、改为 root 启动、插件离线安装，到打通 GitLab SSH 免密与 webhook 自动构建的完整 Jenkins 私有化实战。"
showToc: true
---

## 01. Jenkins简介

1. 官网 jenkins.io

2. Jenkins是一个开源软件项目，是基于Java开发的一种持续集成工具，用于监控持续重复的工作，旨在提供一个开放易用的软件平台，使软件的持续集成变成可能。

## 02. Jenkins部署

```bash
一.环境准备
1、CentOS7.9
2、内存：实验（2G）生产（至少6G）
3、禁用防火墙，关闭selinux
4、JDK17

二.安装JDK
上传rpm包
[root@jenkins ~]#ll
total 178212
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm

[root@jenkins ~]#rpm -ivh jdk-17_linux-x64_bin.rpm
warning: jdk-17_linux-x64_bin.rpm: Header V3 RSA/SHA256 Signature, key ID ad986da3: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jdk-17-2000:17.0.11-7            ################################# [100%]

查看是否安装成功:
[root@jenkins ~]# rpm -qa|grep jdk
jdk-17-17.0.11-7.x86_64

二.安装jenkins
上传jenkins包
[root@jenkins ~]#ll
total 269432
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm
-rw-r--r-- 1 root root  93405530 Oct  1 19:06 jenkins-2.405-1.1.noarch.rpm
[root@jenkins ~]#rpm -ivh jenkins-2.405-1.1.noarch.rpm
warning: jenkins-2.405-1.1.noarch.rpm: Header V4 RSA/SHA512 Signature, key ID ef5975ca: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jenkins-2.405-1.1                ################################# [100%]

三.修改Jenkins启动用户为root
1)修改配置文件的启动用户
[root@jenkins ~]# vim /etc/sysconfig/jenkins
...
JENKINS_USER="root"
...
2)修改启动配置的用户
[root@jenkins ~]# vim /usr/lib/systemd/system/jenkins.service
...
User=root
Group=root
...
[root@jenkins ~]# systemctl daemon-reload

3)安装字体配置
[root@jenkins ~]# yum -y install fontconfig

四.启动Jenkins并加入开机自动启动
[root@jenkins ~]# systemctl start jenkins
[root@jenkins ~]# systemctl enable jenkins
```

## 03. 登陆Jenkins

![image-20261001192229088](/images/image-20261001192229088.png)

![](/images/img_p25_2_130.png)

![](/images/img_p26_1_133.png)

## 04. 修改密码

修改完密码后会重新登陆,用户名为admin

![](/images/img_p26_2_136.png)

![](/images/img_p27_1_140.png)

## 05. 插件安装

```bash
1.上传插件到jenkins家目录
[root@jenkins ~]# cd /var/lib/jenkins/

[root@jenkins ~]#ll
total 576228
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm
-rw-r--r-- 1 root root  93405530 Oct  1 19:06 jenkins-2.405-1.1.noarch.rpm
-rw-r--r-- 1 root root 314156543 Oct  1 19:30 jenkins_plu.tar.gz

2.将插件解压到plugins目录中
[root@jenkins jenkins]#tar xf /root/jenkins_plu.tar.gz -C plugins/

3.重启Jenkins生效
[root@jenkins ~]# systemctl restart jenkins
```

## 06. 创建项目

创建一个自由风格项目,执行pwd命令,查看使用jenkins运行默认的路径所在位置

![](/images/img_p28_1_147.png)

![](/images/img_p28_2_148.png)

![](/images/img_p29_1_151.png)

![](/images/img_p29_2_153.png)

![](/images/img_p30_1_156.png)

![](/images/img_p30_2_158.png)

说明: 使用jenkins创建完项目后,系统会自动在jenkins的家目录/var/lib/jenkins/下创建一个workspace项目目录，并且在此目录下创建以项目名称命名的目录。

后续jenkins拉取gitlab的代码就是存储在此项目目录下。

```bash
[root@jenkins ~]#ls /var/lib/jenkins/workspace/
test_job
```

将gitlab与jenkins打通

没打通前提示无法连接：

![image-20261001200618384](/images/image-20261001200618384.png)

```bash
#配置免密钥
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

#jenkins安装git
[root@jenkins ~]#yum install -y git
```

在gitlab中添加jenkins生成的密钥：

![image-20261001201613164](/images/image-20261001201613164.png)

需要在jenkins上git clone一下，完成一次yes输入

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

然后就可以连接了

![image-20261001202612887](/images/image-20261001202612887.png)

再次构建一次测试拉取

![image-20261001203243290](/images/image-20261001203243290.png)

拉取成功

![image-20261001203330173](/images/image-20261001203330173.png)

![image-20261001203429229](/images/image-20261001203429229.png)

配置webhook

通过配置webhook触发jenkins自动拉取gitlab的代码,自动构建完成测试

![image-20261001205129263](/images/image-20261001205129263.png)

![image-20261001205637856](/images/image-20261001205637856.png)

![image-20261001205830316](/images/image-20261001205830316.png)

![image-20261001205317890](/images/image-20261001205317890.png)

![image-20261001210203745](/images/image-20261001210203745.png)

两边保存后测试

![image-20261001210523584](/images/image-20261001210523584.png)

项目修改后重新推送测试

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

自动构建成功

![image-20261001212025538](/images/image-20261001212025538.png)
