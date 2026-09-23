---
title: "Installing and Deploying Zabbix"
date: 2026-09-23T01:52:00+08:00
draft: false
categories: ["Zabbix", "Monitoring & Ops"]
tags: ["Zabbix", "monitoring", "CentOS7", "installation"]
summary: "Step-by-step guide to installing Zabbix 5.0 on CentOS 7 — configuring repositories, installing the server/agent/frontend, setting up MariaDB, importing the schema, and switching the web UI to Chinese with a custom font."
---

## 1. Configure the Repository

```bash
rpm -Uvh https://repo.zabbix.com/zabbix/5.0/rhel/7/x86_64/zabbix-release-5.0-1.el7.noarch.rpm
```

## 2. Install zabbix-server and zabbix-agent

```bash
yum -y install zabbix-server-mysql zabbix-agent
```

## 3. Install the SCL Repository (to Resolve Version Conflicts)

```bash
[root@zabbix ~]# yum -y install centos-release-scl
```

## 4. Enable the Frontend Repository

```bash
[root@zabbix ~]# vim /etc/yum.repos.d/zabbix.repo
[zabbix-frontend]
...
enabled=1
...
```

## 5. Replace the Broken mirrorlist in CentOS-SCLo-scl.repo and CentOS-SCLo-scl-rh.repo with Aliyun baseurls

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

## 6. Install the PHP/Apache Frontend

```bash
[root@zabbix ~]# yum -y install zabbix-web-mysql-scl zabbix-apache-conf-scl
```

## 7. Install the MariaDB Database

```bash
[root@zabbix ~]# yum -y install mariadb-server
Start the database:
[root@zabbix ~]#systemctl enable mariadb --now
```

## 8. Create the Zabbix Database

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

## 9. Initialize the Database (Import the Schema Required Before Zabbix Runs)

```bash
[root@zabbix ~]# zcat /usr/share/doc/zabbix-server-mysql*/create.sql.gz | mysql -uzabbix -p zabbix 
# You will be prompted for the zabbix password
[root@zabbix ~]# mysql -uroot
MariaDB [(none)]> set global log_bin_trust_function_creators = 0;
quit
```

## 10. Configure Zabbix's Database Connection

```bash
[root@zabbix ~]# egrep ^DB /etc/zabbix/zabbix_server.conf
DBName=zabbix
DBUser=zabbix
DBPassword=zabbix   # Uncomment and set the password
```

## 11. Set the Timezone

```bash
[root@zabbix ~]# tail -1 /etc/opt/rh/rh-php72/php-fpm.d/zabbix.conf
php_value[date.timezone] = Asia/Shanghai
```

## 12. Start Services (server, agent, httpd, php) and Enable on Boot

```bash
[root@zabbix ~]# systemctl enable zabbix-server zabbix-agent httpd rh-php72-php-fpm --now
```

## 13. Access the Zabbix Web UI at 11.0.1.71/zabbix

![](/images/p4_img29.png)

## 14. Zabbix Installation Complete

![](/images/p4_img32.png)

![](/images/p5_img37.png)

![](/images/p5_img39.png)

## 15. Switch to Chinese and Reconfigure the Font

![](/images/p6_img44.png)

![](/images/p6_img45.png)

![](/images/p7_img49.png)

Locate a Windows font and copy it into Zabbix's font directory.

Where Windows fonts are stored:

![](/images/p7_img51.png)

Upload one of the fonts, then rename it:

```bash
[root@zabbix ~]#cd /usr/share/zabbix/assets/fonts/
[root@zabbix fonts]#ls
graphfont.ttf  simhei.ttf  # the uploaded font
[root@zabbix fonts]#rm -f graphfont.ttf  # remove the original font
[root@zabbix fonts]#ln -s /usr/share/zabbix/assets/fonts/simhei.ttf graphfont.ttf  # link to the uploaded font
[root@zabbix fonts]#chmod 644 simhei.ttf
[root@zabbix fonts]#ll
total 9520
lrwxrwxrwx 1 root root      41 Sep 23 01:19 graphfont.ttf -> /usr/share/zabbix/assets/fonts/simhei.ttf
-rw-r--r-- 1 root root 9745792 Sep 23 01:18 simhei.ttf
```

![](/images/p8_img55.png)
