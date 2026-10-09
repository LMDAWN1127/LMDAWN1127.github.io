---
title: "Jenkins + GitLab 打通实现 CI/CD 自动部署"
date: 2026-10-09T16:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "GitLab", "CI/CD", "自动部署"]
showToc: true
summary: "手把手实现 Jenkins 拉取 GitLab 代码、经 SSH 推送至 Web 服务器、并配置 GitLab Webhook 触发全自动部署的完整 CI/CD 流程。"
---

## 01.  Jenkins拉取gitlab代码

### 一. gitlab创建仓库上传game代码

![image-20261002155542377](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002155542377.png)

### 二. Jenkins创建项目

1.创建项目

![image-20261002155749185](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002155749185.png)

2.配置连接的gitlab项目地址（这里没有报错是因为之前测试的时候做过免密钥了）

![image-20261002160535060](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002160535060.png)

3.Jenkins服务器生成密钥对

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
```

4.将公钥拷贝到gitlab页面的SSH秘钥验证页面

![image-20261001201613164](/images/jenkins-gitlab-cicd-auto-deploy-image-20261001201613164.png)

执行完成后还需要在jenkins服务器中执行一次克隆命令输入一次yes（这里没有提示是因为之前做测试的时候输过了）

```bash
[root@jenkins ~]#git clone git@11.0.1.200:dawn/game.git
Cloning into 'game'...
remote: Enumerating objects: 98, done.
remote: Counting objects: 100% (98/98), done.
remote: Compressing objects: 100% (96/96), done.
remote: Total 98 (delta 3), reused 0 (delta 0), pack-reused 0
Receiving objects: 100% (98/98), 7.35 MiB | 4.49 MiB/s, done.
Resolving deltas: 100% (3/3), done.
```

5.在查看jenkins的项目配置(如果还是看到报错提示,点击保存退出后在重新进入到项目)

![image-20261002160216599](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002160216599.png)

完成后点击立即构建:

![image-20261002160742032](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002160742032.png)

拉取成功

![image-20261002161215181](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002161215181.png)

查看项目目录下是否拉取game代码成功

```bash
[root@jenkins ~]#ll /var/lib/jenkins/workspace/game_job/
total 48
-rw-r--r-- 1 root root 28032 Oct  2 16:11 bgm.mp3
drwxr-xr-x 2 root root    23 Oct  2 16:11 css
drwxr-xr-x 2 root root    23 Oct  2 16:11 images
-rw-r--r-- 1 root root  8956 Oct  2 16:11 index.html
drwxr-xr-x 2 root root  213 Oct  2 16:11 js
drwxr-xr-x 2 root root  4096 Oct  2 16:11 roms
-rw-r--r-- 1 root root  811 Oct  2 16:11 shuoming.html
```

## 02. Jenkins推送代码到web

将拉取到的代码推送到web服务器的Nginx站点目录运行

```bash
1.创建web01服务器
2.安装Nginx服务
3.配置Nginx server
[root@web01 conf.d]# cat default.conf 
server {
    listen       80 default_server;
    server_name  _;
    location / {
        root   /code/html;
        index  index.html index.htm;
    }
}

4.jenkins和web服务器做免秘钥
[root@jenkins ~]# ssh-copy-id -i .ssh/id_rsa.pub 11.0.1.7
```

jenkins项目中使用shell命令做打包推送动作

![image-20261002161931887](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002161931887.png)

```bash
Shell脚本:
DATE=$(date +%Y-%m-%d-%H-%M-%S)
CODE_DIR="./"
WEB_DIR="/code"

get_code_tar(){
        cd $CODE_DIR && tar zcf /opt/web-$DATE.tar.gz ./*
}

scp_code_web(){
        scp /opt/web-$DATE.tar.gz 11.0.1.7:$WEB_DIR
}

code_tarxf(){
        ssh 11.0.1.7 "cd $WEB_DIR &&mkdir web-$DATE && tar xf web-$DATE.tar.gz -C web-$DATE"

}

ln_html(){
         ssh 11.0.1.7 "cd $WEB_DIR && rm -rf html && ln -s web-$DATE html"
}

main(){

        get_code_tar;
        scp_code_web;
        code_tarxf;
        ln_html;
}
main
```

保存点击立即构建:

浏览器访问web服务器显示成功

![image-20261002164346077](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002164346077.png)

## 03. 配置web-hook

1.开启触发器

![image-20261002164542351](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002164542351.png)

生成token并保存

![image-20261002164616451](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002164616451.png)

2.复制Token配置到Gitlab

![image-20261002164712017](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002164712017.png)



![image-20261002165039994](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002165039994.png)

![image-20261002165237909](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002165237909.png)

![image-20261002165732318](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002165732318.png)

配置完成

测试: 修改代码推送到gitlab仓库的游戏项目中,会自动触发Jenkins拉取代码并将拉取到的修改后的代码推送到web服务器

修改前：

![image-20261002165404518](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002165404518.png)

```bash
[root@gitlab game]#vim index.html
....
                    ['魂斗罗v2', 'roms/Contra1(U)30.nes'],
...
[root@gitlab game]#git commit -am "v2"
[main ce12479] v2
 1 file changed, 2 insertions(+), 2 deletions(-)
[root@gitlab game]#git push -u origin main
Counting objects: 5, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 275 bytes | 0 bytes/s, done.
Total 3 (delta 2), reused 0 (delta 0)
To git@11.0.1.200:dawn/game.git
   0385f69..ce12479  main -> main
Branch main set up to track remote branch main from origin
```

修改后：

![image-20261002170210794](/images/jenkins-gitlab-cicd-auto-deploy-image-20261002170210794.png)
