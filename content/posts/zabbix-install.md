---
title: "Zabbix 安装部署"
date: 2026-09-23T01:52:00+08:00
draft: false
categories: ["Zabbix", "监控运维"]
tags: ["Zabbix", "监控", "CentOS7", "安装部署"]
---

## 1.配置仓库

```bash
rpm -Uvh https://repo.zabbix.com/zabbix/5.0/rhel/7/x86_64/zabbix-release-5.0-1.el7.noarch.rpm
```

## 2.安装zabbix-server zabbix-agent

```bash
yum -y install zabbix-server-mysql zabbix-agent
```

## 3.安装scl源（解决版本冲突问题）

```bash
[root@zabbix ~]# yum -y install centos-release-scl
```

## 4.开启前端仓库

```bash
[root@zabbix ~]# vim /etc/yum.repos.d/zabbix.repo
[zabbix-frontend]
...
enabled=1
...
```

## 5.将CentOS-SCLo-scl.repo和CentOS-SCLo-scl-rh.repo失效的mirrorlist替换为阿里云的baseurl

```bash
[root@zabbix yum.repos.d]#vim CentOS-SCLo-scl-rh.repo
[centos-sclo-rh]
...
baseurl=https://mirrors.aliyun.com/centos/7/sclo/x86_64/rh
...
[root@zabbix yum.repos.d]#vim CentOS-SCLo-scl.repo
[centos-sclo-sclo]
...
baseurl=https://mirrors.aliyun.com/centos/7/sclo/x86_64/sclo
...
```

## 6.安装 php apache 前端

```bash
[root@zabbix ~]# yum -y install zabbix-web-mysql-scl zabbix-apache-conf-scl
```

## 7.安装mysql数据库

```bash
[root@zabbix ~]# yum -y install mariadb-server
启动数据库
[root@zabbix ~]#systemctl enable mariadb --now
```

## 8.创建zabbix库

```bash
[root@zabbix ~]#mysql -uroot
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 7
Server version: 5.5.68-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [(none)]> create database zabbix character set utf8 collate utf8_bin;
Query OK, 1 row affected (0.00 sec)

MariaDB [(none)]> create user zabbix@localhost identified by 'zabbix';
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> grant all privileges on zabbix.* to zabbix@localhost;
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> set global log_bin_trust_function_creators = 1;
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> quit
Bye
```

## 9.初始化数据(业务运行前需要依赖数据库中的一些数据表格 需要提前导入)

```bash
[root@zabbix ~]# zcat /usr/share/doc/zabbix-server-mysql*/create.sql.gz | mysql -uzabbix -p zabbix 
#需要输入zabbix密码
[root@zabbix ~]# mysql -uroot
MariaDB [(none)]> set global log_bin_trust_function_creators = 0;
quit
```

## 10.修改zabbix连接数据的信息

```bash
[root@zabbix ~]# egrep ^DB /etc/zabbix/zabbix_server.conf
DBName=zabbix
DBUser=zabbix
DBPassword=zabbix   # 将注释打开配置密码
```

## 11.修改时区

```bash
[root@zabbix ~]# tail -1 /etc/opt/rh/rh-php72/php-fpm.d/zabbix.conf
php_value[date.timezone] = Asia/Shanghai
```

## 12.启动服务 server agent httpd php 加入开机自启

```bash
[root@zabbix ~]# systemctl enable zabbix-server zabbix-agent httpd rh-php72-php-fpm --now
```

## 13.访问zabbix页面 11.0.1.71/zabbix

![](/images/p4_img29.png)

## 14.zabbix安装完成

![](/images/p4_img32.png)

![](/images/p5_img37.png)

![](/images/p5_img39.png)

## 15.调整为中文重新配置字体

![](/images/p6_img44.png)

![](/images/p6_img45.png)

![](/images/p7_img49.png)

查找windows字体复制到zabbix的字体目录下

windows字体位置

![](/images/p7_img51.png)

上传其中一个字体到并改名

```bash
[root@zabbix ~]#cd /usr/share/zabbix/assets/fonts/
[root@zabbix fonts]#ls
graphfont.ttf  simhei.ttf#上传的字体
[root@zabbix fonts]#rm -f graphfont.ttf #删除原来的字体
[root@zabbix fonts]#ln -s /usr/share/zabbix/assets/fonts/simhei.ttf graphfont.ttf #链接到上传的字体
[root@zabbix fonts]#chmod 644 simhei.ttf
[root@zabbix fonts]#ll
total 9520
lrwxrwxrwx 1 root root      41 Sep 23 01:19 graphfont.ttf -> /usr/share/zabbix/assets/fonts/simhei.ttf
-rw-r--r-- 1 root root 9745792 Sep 23 01:18 simhei.ttf
```

![](/images/p8_img55.png)
