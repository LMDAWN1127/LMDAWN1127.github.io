---
title: "GitLab 实战：私有化部署、SSH 免密与代码仓库管理"
date: 2026-10-01T17:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "GitLab", "CI/CD"]
summary: "从 RPM 安装、组件构成、常用命令到 Web 配置、SSH 免密与多账号协作的完整 GitLab 私有化部署实战。"
showToc: true
---

## 01. gitlab相关网站

1. 官网：https://about.gitlab.com/

2. 国内镜像：https://mirrors.tuna.tsinghua.edu.cn/gitlab-ce/yum/

## 02.gitlab部署

```bash
一.环境准备
1、系统：CentOS7.9
2、内存：实验（4G）生产（至少8G）
3、禁用防火墙，关闭selinux

二.下载gitlab的rpm包
[root@gitlab ~]# wget https://mirrors.tuna.tsinghua.edu.cn/gitlab-ce/yum/el7/gitlab-ce-16.9.8-ce.0.el7.x86_64.rpm

三.安装gitlab
# 安装过程中提示需要安装依赖
[root@gitlab ~]# rpm -ivh gitlab-ce-16.9.8-ce.0.el7.x86_64.rpm 
warning: gitlab-ce-16.9.8-ce.0.el7.x86_64.rpm: Header V4 RSA/SHA1 Signature, key ID f27eab47: NOKEY
error: Failed dependencies:
    policycoreutils-python is needed by gitlab-ce-16.9.8-ce.0.el7.x86_64
# 安装依赖
[root@gitlab ~]# yum -y install policycoreutils-python
# 安装完依赖继续安装gitlab
[root@gitlab ~]# rpm -ivh gitlab-ce-16.9.8-ce.0.el7.x86_64.rpm 
warning: gitlab-ce-16.9.8-ce.0.el7.x86_64.rpm: Header V4 RSA/SHA1 Signature, key ID f27eab47: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:gitlab-ce-16.9.8-ce.0.el7        ################################# [100%]

四.启动前配置访问域名或IP
[root@gitlab ~]#  vim /etc/gitlab/gitlab.rb
...
external_url 'http://11.0.1.200'
...
配置完成后执行命令:
[root@gitlab ~]# gitlab-ctl reconfigure
```

## 03. gitlab组件

```bash
nginx：           静态web服务器
gitlab-workhorse: 轻量级的反向代理服务器
logrotate：       日志文件管理工具
postgresql：      数据库
redis：           缓存数据库
sidekiq：         用于在后台执行队列任务（异步执行）。（Ruby）
unicorn：An HTTP server for Rack applications，gitlab Rails应用是托管在这个服务器上面的。（Ruby Web Server,主要使用Ruby编写）
```

## 04. gitlab常用命令

```bash
gitlab-ctl start                # 启动gitlab  在执行gitlab-ctl reconfigure 服务默认已经启动
gitlab-ctl status               # 查看目前gitlab所有服务运维状态
gitlab-ctl stop                 # 停止gitlab服务
gitlab-ctl stop nginx           # 单独停止某个服务
gitlab-ctl tail                 # 查看所有服务的日志
```

## 05. gitlab页面配置

登陆gitlab: 11.0.1.200

### 一. 登陆密码

执行gitlab-ctl reconfigure完成后会提示密码存放的位置:

![](/images/img_p7_1_33.png)

![](/images/img_p8_1_40.png)

![](/images/img_p8_2_41.png)

### 二. 配置页面显示为中文

![](/images/img_p8_3_43.png)

![](/images/img_p9_1_47.png)

### 三. 修改默认密码

![](/images/img_p10_1_52.png)

### 四. 开启钩子本地网络请求

![](/images/img_p10_2_54.png)

![](/images/img_p11_1_58.png)

![](/images/img_p11_2_59.png)

## 06. gitlab实战

### 一. 创建组

![](/images/img_p12_1_65.png)

![](/images/img_p13_1_70.png)

### 二. 基于组创建项目

![](/images/img_p14_1_76.png)

![](/images/img_p14_2_78.png)

![](/images/img_p15_1_81.png)

至此第一个代码仓库就创建完成了,不过里面是空的。接下来上传代码

### 三. 将代码提交到项目中存储

项目创建完成后,需要将blog代码上传到此项目

服务器和代码仓库连接方式有两种

第一种: 基于用户名和密码的方式连接

第二种: 基于SSH免秘钥方式

我们使用基于免秘钥方式: 方便+安全性高

1.生成密钥对(在这是直接使用的gitlab服务器)

```bash
[root@gitlab ~]#ssh-keygen
Generating public/private rsa key pair.
Enter file in which to save the key (/root/.ssh/id_rsa):
Created directory '/root/.ssh'.
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in /root/.ssh/id_rsa.
Your public key has been saved in /root/.ssh/id_rsa.pub.
The key fingerprint is:
SHA256:j3FozajJdufxM0ZRtgPa2ZNSwWKvo8bvxbMJl8F5V3M root@gitlab
The key's randomart image is:
+---[RSA 2048]----+
|             ... |
|            + =  |
|           + X +E|
|         =. =.B.+|
|        S +  ++oo|
|     . + =  +. +.|
|      = o.+o..*  |
|     . . o+o++ + |
|         ..++oo  |
+----[SHA256]-----+

查看秘钥对:
[root@gitlab ~]# ll .ssh/
total 8
-rw------- 1 root root 1679 May 14 15:02 id_rsa         # 私钥
-rw-r--r-- 1 root root  393 May 14 15:02 id_rsa.pub     # 公钥
[root@gitlab ~]#cat .ssh/id_rsa.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDJGpCKL64eidZ3I/nAVNCNJwD8yeDqelZP0GUTwlcp6IdKaZ7wUOIRDCtGn5r+YnOCKNwMhUNzb3VCOSVLDVIE0x53dPrCMK4OKLmZ6OtTYFBveGOZWWwdYyGQITx2eP7zOSBxeW3AnEWcya/UZdiZrYXA/d29DWjMjCt5QAxOit0EWSir1Z4i2MkTPuljOmjk6A55XAoem0WJRdg/d8KKIiCdcGrj4adYq2kNJ8oYH/9QcnpASUW/ANhzrALnLIX2WaH/p0T3gisLvk2KDUe3rVKD3XaKDlyLgWIViQFm3Me6L2e4taRFiu3VdsbfFfzjDevfDtLaqKLOqPtaczlF root@gitlab
```

2.将生成的公钥粘贴到gitlab页面的SSH秘钥管理页面

![](/images/img_p16_1_88.png)

![](/images/img_p17_1_91.png)

![](/images/img_p17_2_93.png)

至此就完成了服务器和gitlab页面之间的SSH免秘钥,接下来将代码推送到blog项目中

推送代码的方式有两种:

1.将空的仓库克隆到本地,然后将代码拷贝到仓库中,然后提交到远程仓库gitlab

进入到项目中找到项目的链接地址

![](/images/img_p18_1_96.png)

```bash
1.复制链接执行
[root@gitlab ~]#git clone git@11.0.1.200:dawn/blog.git
Cloning into 'blog'...
The authenticity of host '11.0.1.200 (11.0.1.200)' can't be established.
ECDSA key fingerprint is SHA256:Ldn1vBzBEFxynXs0qBNr0XzJ2lTx/0caMuK5yJtb+Zo.
ECDSA key fingerprint is MD5:3d:1d:28:3f:33:ec:ee:c1:69:83:af:14:a3:7f:79:ac.
Are you sure you want to continue connecting (yes/no)? yes
Warning: Permanently added '11.0.1.200' (ECDSA) to the list of known hosts.
warning: remote HEAD refers to nonexistent ref, unable to checkout.

2.查看将blog仓库下载到了本地
[root@gitlab ~]#ll
total 1176964
drwxr-xr-x 3 root root         18 Oct  1 14:43 blog
-rw-r--r-- 1 root root   84579612 Oct  1 14:35 blog_backup_20261001-1435.tar.gz
drwxr-xr-x 3 root root         18 Sep 30 19:14 dawn
-rw-r--r-- 1 root root 1120627456 Sep 30 23:12 gitlab-ce-16.9.8-ce.0.el7.x86_64.rpm

3.进入blog目录
[root@gitlab ~]#cd blog/

4.解压代码:
[root@gitlab blog]#tar xf /root/blog_backup_20261001-1435.tar.gz -C .

5.将代码提交到本地仓库
[root@gitlab blog]#git add .
[root@gitlab blog]#git commit -m "DAWN’s Blog"
[master (root-commit) 5af4246] DAWN’s Blog
 3 files changed, 112 insertions(+)
 create mode 100644 blog_state.txt
 create mode 160000 myblog
 create mode 160000 myblog-deploy

6.将代码提交到远程仓库gitlab的blog仓库中
因为我们是直接克隆的gitlab的仓库下载到本地的所以目录中默认已经有了远程仓库blog的项目地址
查看远程仓库:
[root@gitlab blog]#git remote -v
origin  git@11.0.1.200:dawn/blog.git (fetch)
origin  git@11.0.1.200:dawn/blog.git (push)

将本地的master推送到远程仓库origin
[root@gitlab blog]#git push -u origin master
Counting objects: 3, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 1.23 KiB | 0 bytes/s, done.
Total 3 (delta 0), reused 0 (delta 0)
To git@11.0.1.200:dawn/blog.git
 * [new branch]      master -> master
Branch master set up to track remote branch master from origin.
```

查看blog项目,代码上传成功

![](/images/img_p19_1_100.png)

2.将本地git仓库推送到远程仓库gitlab

```bash
1.配置一个本地仓库
[root@gitlab ~]#mkdir dawn
[root@gitlab ~]#cd dawn
2.初始化仓库
[root@gitlab dawn]#git init
3.上传代码
[root@gitlab dawn]#touch a.txt
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "test_v1"
[master (root-commit) 815c600] test_v1
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 a.txt

4.设置gitlab的blog仓库为本地的远程仓库
[root@gitlab dawn]#git remote add origin git@11.0.1.200:dawn/blog.git
5.将本地仓库的内容提交到远程仓库（由于远程仓库 origin 里已经有内容了，直接推送报错，在这里需要保留远程内容，所以先拉取合并再推送）
[root@gitlab dawn]#git pull origin master
warning: no common commits
remote: Enumerating objects: 3, done.
remote: Counting objects: 100% (3/3), done.
remote: Compressing objects: 100% (3/3), done.
remote: Total 3 (delta 0), reused 0 (delta 0), pack-reused 0
Unpacking objects: 100% (3/3), done.
From 11.0.1.200:dawn/blog
 * branch            master     -> FETCH_HEAD
Merge made by the 'recursive' strategy.
 blog_state.txt | 110 ++++++++++++++++++++++++++++++++++++
 myblog         |   1 +
 myblog-deploy  |   1 +
 3 files changed, 112 insertions(+)
 create mode 100644 blog_state.txt
 create mode 160000 myblog
 create mode 160000 myblog-deploy
[root@gitlab dawn]#git push -u origin master
Counting objects: 6, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (3/3), done.
Writing objects: 100% (5/5), 462 bytes | 0 bytes/s, done.
Total 5 (delta 1), reused 0 (delta 0)
To git@11.0.1.200:dawn/blog.git
   5af4246..0242e0a  master -> master
Branch master set up to track remote branch master from origin.
```

3.创建普通账号dev

![](/images/img_p20_1_103.png)

创建完成后修改dev密码-别退出，点击用户界面的编辑

![](/images/img_p21_1_107.png)

完成后使用dev登录gitlab(第一次登录需要修改密码)

4.将dev用户添加到dawn组

![](/images/img_p21_2_109.png)

![](/images/img_p22_1_113.png)

5.dev的服务器端生成秘钥对

```bash
[root@lb01 ~]#ssh-keygen
```

6.将生成的公钥复制到dev账号下的ssh-key页面中

![](/images/img_p22_2_114.png)

7.克隆代码到11.0.1.5 dev

```bash
[root@lb01 ~]#git clone git@11.0.1.200:dawn/blog.git
Cloning into 'blog'...
The authenticity of host '11.0.1.200 (11.0.1.200)' can't be established.
ECDSA key fingerprint is SHA256:Ldn1vBzBEFxynXs0qBNr0XzJ2lTx/0caMuK5yJtb+Zo.
ECDSA key fingerprint is MD5:3d:1d:28:3f:33:ec:ee:c1:69:83:af:14:a3:7f:79:ac.
Are you sure you want to continue connecting (yes/no)? yes
Warning: Permanently added '11.0.1.200' (ECDSA) to the list of known hosts.
remote: Enumerating objects: 8, done.
remote: Counting objects: 100% (8/8), done.
remote: Compressing objects: 100% (6/6), done.
remote: Total 8 (delta 1), reused 0 (delta 0), pack-reused 0
Receiving objects: 100% (8/8), done.
Resolving deltas: 100% (1/1), done.
```

8.修改并上传代码到远程仓库

```bash
设置11.0.1.5的使用者
[root@lb01 blog]#git config --global user.email "dev@mail.com"
[root@lb01 blog]#git config --global user.name "dev"
[root@lb01 blog]#vim a.txt
123
[root@lb01 blog]#git commit -am "123"
提交到远程仓库
[root@lb01 blog]#git push -u origin master
Counting objects: 5, done.
Compressing objects: 100% (2/2), done.
Writing objects: 100% (3/3), 257 bytes | 0 bytes/s, done.
Total 3 (delta 1), reused 0 (delta 0)
remote: GitLab: You are not allowed to push code to protected branches on this project.To git@11.0.1.200:dawn/blog.git
 ! [remote rejected] master -> master (pre-receive hook declined)
error: failed to push some refs to 'git@11.0.1.200:dawn/blog.git'
# 不允许推送到master分支

推送到其他分支:
1.创建dev分支
[root@lb01 blog]#git branch dev
[root@lb01 blog]#git branch
  dev
* master

2.推送dev分支到远程仓库
[root@lb01 blog]#git push -u origin dev
```

合并请求

1.在dev账号发起合并请求

![image-20261001164354907](/images/image-20261001164354907.png)

![image-20261001164554108](/images/image-20261001164554108.png)

![image-20261001173144541](/images/image-20261001173144541.png)

2.在root账号中同意合并并删除源dev分支

![image-20261001173026169](/images/image-20261001173026169.png)

3.在web服务器下载代码

```bash
[root@web01 ~]#git clone http://11.0.1.200/dawn/blog.git
输入用户名和密码
```
