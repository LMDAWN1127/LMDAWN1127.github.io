---
title: "SonarQube in Practice: Self-hosted Deployment, Token Setup, and Code Quality Scanning"
date: 2026-10-02T14:12:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "SonarQube", "CI/CD"]
summary: "A complete hands-on SonarQube self-hosting guide: JDK 8 and MySQL 5.6 setup, extracting SonarQube with plugins, running as a non-root user, web token configuration, and scanning code with the sonar-scanner client."
showToc: true
---

## 01. SonarQube Introduction

```bash
1. SonarQube is developed in Java and requires Open JDK 8
2. SonarQube depends on a MySQL database, at least version 5.6
3. A small SonarQube instance needs at least 4G of memory; a large instance needs 16G
```

## 02. Deployment

### 1. Install the JDK runtime

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

### 2. Install the database

```bash
# 1. Download the official MySQL Yum repository config file
[root@sonarqube ~]#wget dev.mysql.com/get/mysql-community-release-el6-5.noarch.rpm
 
# 2. Install the MySQL repository
[root@sonarqube ~]#rpm -ivh mysql-community-release-el6-5.noarch.rpm
Preparing...                          ################################# [100%]
Updating / installing...
   1:mysql-community-release-el6-5    ################################# [100%]
 
# 3. Install the MySQL server
[root@sonarqube ~]# yum install mysql-community-server -y
[root@sonarqube ~]#mysql --version
mysql  Ver 14.14 Distrib 5.6.51, for Linux (x86_64) using  EditLine wrapper

# 4. Start the MySQL service
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

# 5. Set the password
[root@sonarqube ~]# mysqladmin -uroot password 000000

# 6. Create the sonarqube database
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

### 3. Install SonarQube

```bash
# 1. Upload the SonarQube package
[root@sonarqube ~]# cd /usr/local/
[root@sonarqube local]#ll sonarqube-7.0.zip
-rw-r--r-- 1 root root 155709573 Oct  1 22:50 sonarqube-7.0.zip

# 2. Extract into the current directory
[root@sonarqube local]#yum install -y unzip
[root@sonarqube local]# unzip sonarqube-7.0.zip
[root@sonarqube local]# ln -s sonarqube-7.0 sonarqube

# 3. Install plugins: 
Remove the default plugins:
[root@sonarqube ~]# rm -rf /usr/local/sonarqube/extensions/plugins/*

Upload the plugins:
[root@sonarqube ~]#ll sonar_plugins.tar.gz
-rw-r--r-- 1 root root 45106788 Oct  1 22:56 sonar_plugins.tar.gz
[root@sonarqube ~]#tar xf sonar_plugins.tar.gz -C /usr/local/sonarqube/extensions/plugins/
[root@sonarqube ~]#ll /usr/local/sonarqube/extensions/plugins/
total 4
drwxr-xr-x 2 1000 1000 4096 Oct 24  2019 plugins
[root@sonarqube ~]# cd /usr/local/sonarqube/extensions/plugins/
[root@sonarqube plugins]# mv plugins/* .
[root@sonarqube plugins]#rm -fr plugins/

# 4. Create a normal user
[root@sonarqube ~]# useradd sonarqube

# 5. Change ownership of the code to user/group sonarqube
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

# 6. Configure the database connection

[root@sonarqube ~]#vim /usr/local/sonarqube/conf/sonar.properties
...
sonar.jdbc.username=root            # database username
sonar.jdbc.password=000000      # database password

#----- Embedded Database (default)
# H2 embedded database server listening port, defaults to 9092
#sonarqube.embeddedDatabase.port=9092

#----- MySQL 5.6 or greater
# Only InnoDB storage engine is supported (not myISAM).
# Only the bundled driver is supported. It can not be changed.
sonar.jdbc.url=jdbc:mysql://localhost:3306/sonarqube?useUnicode=true&characterE
ncoding=utf8&rewriteBatchedStatements=true&useConfigs=maxPerformance&useSSL
=false          # enable local connection
...
```

### 4. Run SonarQube

```bash
SonarQube cannot be started as root; it must run as a normal user
[root@sonarqube ~]# su - sonarqube -c "/usr/local/sonarqube/bin/linux-x86-64/sonar.sh start"
```

### 5. Configure the remote access token

After startup the port is 9000; open http://11.0.1.202:9000/about in a browser, log in as admin / admin, and generate a token — it is shown only once, so record it.

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

### 6. Client deployment

Client IP: 11.0.1.201

```bash
# 1. Upload the client
[root@jenkins ~]# cd /usr/local/
[root@jenkins ~]#ll sonar-scanner-cli-4.2.0.1873-linux.zip
-rw-r--r-- 1 root root 42397119 Oct  2 00:09 sonar-scanner-cli-4.2.0.1873-linux.zip

# 2. Extract and create a symlink
[root@jenkins local]#yum install -y unzip
[root@jenkins local]#unzip /root/sonar-scanner-cli-4.2.0.1873-linux.zip
[root@jenkins local]# ln -s sonar-scanner-4.2.0.1873-linux sonar

# 3. Set the global PATH variable
[root@jenkins ~]# export PATH="$PATH:/usr/local/sonar/bin/"

# 4. Persist the variable in /etc/profile
[root@jenkins ~]# vim /etc/profile
..
export PATH="$PATH:/usr/local/sonar/bin/"

# 5. Test the client by scanning code to the server for analysis
Push the blog code under /var/lib/jenkins/workspace/test_job/ to SonarQube for testing
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

Execution succeeded:

![image-20261002140824559](/images/image-20261002140824559.png)

Check the server: upload succeeded

![image-20261002140853502](/images/image-20261002140853502.png)
