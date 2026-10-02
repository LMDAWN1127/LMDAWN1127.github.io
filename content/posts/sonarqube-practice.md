---
title: "SonarQube 实战：私有化部署、Token 配置与代码质量扫描"
date: 2026-10-02T14:12:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "SonarQube", "CI/CD"]
summary: "从 JDK8 + MySQL5.6 安装、SonarQube 解压与插件部署、普通用户启动，到 Web Token 配置与 sonar-scanner 客户端代码扫描的完整私有化实战。"
showToc: true
---

## 01. sonarQube简介

```bash
1. sonarQube基于java开发，需安装open JDK8版本
2. sonarQube需要依赖MySQL数据库，至少5.6版本以上
3. sonarQube的小型实例至少4G内存，大型实例需要16G内存
```

## 02. 部署服务

### 一.  安装运行环境JDK

```bash
[root@sonarqube ~]#ll
total 166040
-rw-r--r-- 1 root root 170023183 Oct  1 22:32 jdk-8u181-linux-x64.rpm
[root@sonarqube ~]#rpm -ivh jdk-8u181-linux-x64.rpm
warning: jdk-8u181-linux-x64.rpm: Header V3 RSA/SHA256 Signature, key ID ec551f03: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jdk1.8-2000:1.8.0_181-fcs        ################################# [100%]
Unpacking JAR files...
        tools.jar...
        plugin.jar...
        javaws.jar...
        deploy.jar...
        rt.jar...
        jsse.jar...
        charsets.jar...
        localedata.jar...
```

### 二. 安装数据库

```bash
# 1. 下载MySQL官方的Yum仓库配置文件
[root@sonarqube ~]#wget dev.mysql.com/get/mysql-community-release-el6-5.noarch.rpm
 
# 2. 安装MySQL源
[root@sonarqube ~]#rpm -ivh mysql-community-release-el6-5.noarch.rpm
Preparing...                          ################################# [100%]
Updating / installing...
   1:mysql-community-release-el6-5    ################################# [100%]
 
# 3. 安装MySQL服务器
[root@sonarqube ~]# yum install mysql-community-server -y
[root@sonarqube ~]#mysql --version
mysql  Ver 14.14 Distrib 5.6.51, for Linux (x86_64) using  EditLine wrapper

# 4. 启动MySQL服务
[root@sonarqube ~]#service mysqld start
Starting mysqld (via systemctl):
                                                           [  OK  ]
[root@sonarqube ~]#netstat -ntpl
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:25            0.0.0.0:*               LISTEN      1227/master
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1008/sshd
tcp6       0      0 ::1:25                  :::*                    LISTEN      1227/master
tcp6       0      0 :::3306                 :::*                    LISTEN      3113/mysqld
tcp6       0      0 :::22                   :::*                    LISTEN      1008/sshd

# 5. 设置密码
[root@sonarqube ~]# mysqladmin -uroot password 000000

# 6. 创建sonarqube库
[root@sonarqube ~]# mysql -uroot -p000000 -e "CREATE DATABASE sonarqube DEFAULT CHARACTER SET utf8;"

[root@sonarqube ~]#mysql -u root -p000000 -e "show databases"
Warning: Using a password on the command line interface can be insecure.
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sonarqube          |
+--------------------+
```

### 三. 安装sonarqubeqube

```bash
# 1. 上传soanrqube
[root@sonarqube ~]# cd /usr/local/
[root@sonarqube local]#ll sonarqube-7.0.zip
-rw-r--r-- 1 root root 155709573 Oct  1 22:50 sonarqube-7.0.zip

# 2. 解压到当前目录
[root@sonarqube local]#yum install -y unzip
[root@sonarqube local]# unzip sonarqube-7.0.zip
[root@sonarqube local]# ln -s sonarqube-7.0 sonarqube

# 3. 安装插件: 
删除默认的插件:
[root@sonarqube ~]# rm -rf /usr/local/sonarqube/extensions/plugins/*

上传插件:
[root@sonarqube ~]#ll sonar_plugins.tar.gz
-rw-r--r-- 1 root root 45106788 Oct  1 22:56 sonar_plugins.tar.gz
[root@sonarqube ~]#tar xf sonar_plugins.tar.gz -C /usr/local/sonarqube/extensions/plugins/
[root@sonarqube ~]#ll /usr/local/sonarqube/extensions/plugins/
total 4
drwxr-xr-x 2 1000 1000 4096 Oct 24  2019 plugins
[root@sonarqube ~]# cd /usr/local/sonarqube/extensions/plugins/
[root@sonarqube plugins]# mv plugins/* .
[root@sonarqube plugins]#rm -fr plugins/

# 4. 创建普通用户
[root@sonarqube ~]# useradd sonarqube

# 5. 授权代码属主属组为sonarqube
[root@sonarqube ~]# chown -R sonarqube.sonarqube /usr/local/sonarqube/
[root@sonarqube ~]# ll /usr/local/sonarqube/
total 12
drwxr-xr-x 8 sonarqube sonarqube  136 Feb  2  2018 bin
drwxr-xr-x 2 sonarqube sonarqube   50 May 15 15:09 conf
-rw-r--r-- 1 sonarqube sonarqube 7651 Feb  2  2018 COPYING
drwxr-xr-x 2 sonarqube sonarqube   24 Feb  2  2018 data
drwxr-xr-x 7 sonarqube sonarqube  150 Feb  2  2018 elasticsearch
drwxr-xr-x 4 sonarqube sonarqube   40 Feb  2  2018 extensions
drwxr-xr-x 9 sonarqube sonarqube  138 Feb  2  2018 lib
drwxr-xr-x 2 sonarqube sonarqube    6 Feb  2  2018 logs
drwxr-xr-x 2 sonarqube sonarqube   24 Feb  2  2018 temp
drwxr-xr-x 9 sonarqube sonarqube 4096 Feb  2  2018 web

# 6. 配置连接数据库

[root@sonarqube ~]#vim /usr/local/sonarqube/conf/sonar.properties
...
sonar.jdbc.username=root            # 数据库用户名
sonar.jdbc.password=000000      # 数据库密码

#----- Embedded Database (default)
# H2 embedded database server listening port, defaults to 9092
#sonarqube.embeddedDatabase.port=9092

#----- MySQL 5.6 or greater
# Only InnoDB storage engine is supported (not myISAM).
# Only the bundled driver is supported. It can not be changed.
sonar.jdbc.url=jdbc:mysql://localhost:3306/sonarqube?useUnicode=true&characterE
ncoding=utf8&rewriteBatchedStatements=true&useConfigs=maxPerformance&useSSL
=false          # 开启本地连接
...
```

### 四. 运行sonarqubeQube

```bash
sonarqubeQube服务启动不能使用root,必须使用普通用户运行
[root@sonarqube ~]# su - sonarqube -c "/usr/local/sonarqube/bin/linux-x86-64/sonar.sh start"
```

### 五. 配置远程访问token

启动后的端口为9000使用浏览器直接访问http://11.0.1.202:9000/about 用户名admin 密码admin 生成一个tokin,只显示一次记录好。

![image-20261002140038758](/images/image-20261002140038758.png)

![image-20261002140255442](/images/image-20261002140255442.png)

![image-20261002140411622](/images/image-20261002140411622.png)

![image-20261002140458573](/images/image-20261002140458573.png)

```bash
[root@jenkins ~]# sonar-scanner \
  -Dsonar.projectKey=html \
  -Dsonar.sources=. \
  -Dsonar.host.url=http://11.0.1.202:9000 \
  -Dsonar.login=a3bd8e829343edabbbc58fefe0d3e97fdb12268b
```

### 六. 客户端部署

客户端IP:11.0.1.201

```bash
# 1. 上传客户端
[root@jenkins ~]# cd /usr/local/
[root@jenkins ~]#ll sonar-scanner-cli-4.2.0.1873-linux.zip
-rw-r--r-- 1 root root 42397119 Oct  2 00:09 sonar-scanner-cli-4.2.0.1873-linux.zip

# 2. 解压做软链接
[root@jenkins local]#yum install -y unzip
[root@jenkins local]#unzip /root/sonar-scanner-cli-4.2.0.1873-linux.zip
[root@jenkins local]# ln -s sonar-scanner-4.2.0.1873-linux sonar

# 3. 设置PATH全局变量
[root@jenkins ~]# export PATH="$PATH:/usr/local/sonar/bin/"

# 4. 永久变量写入/etc/profile
[root@jenkins ~]# vim /etc/profile
..
export PATH="$PATH:/usr/local/sonarqube/bin/"

# 5. 客户端测试将代码扫描到服务器进行代码检测
将/var/lib/jenkins/workspace/test_job/目录下的blog代码推送到SonrQube测试
[root@jenkins ~]#cd /var/lib/jenkins/workspace/test_job/
[root@jenkins test_job]#ll
total 8
-rw-r--r-- 1 root root    7 Oct  1 20:32 a.txt
-rw-r--r-- 1 root root 3634 Oct  1 20:32 blog_state.txt
-rw-r--r-- 1 root root    0 Oct  1 21:12 c.txt
drwxr-xr-x 2 root root    6 Oct  1 20:32 myblog
drwxr-xr-x 2 root root    6 Oct  1 20:32 myblog-deploy
[root@jenkins test_job]#sonar-scanner \
  -Dsonar.projectKey=html \
  -Dsonar.sources=. \
  -Dsonar.host.url=http://11.0.1.202:9000 \
  -Dsonar.login=a3bd8e829343edabbbc58fefe0d3e97fdb12268b
```

执行成功:

![image-20261002140824559](/images/image-20261002140824559.png)

查看服务器: 上传成功

![image-20261002140853502](/images/image-20261002140853502.png)
