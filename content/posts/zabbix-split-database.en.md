---
title: "Splitting the Zabbix Database"
date: 2026-09-23T16:00:00+08:00
draft: false
categories: ["Zabbix", "Monitoring & Ops"]
tags: ["Zabbix", "database", "split", "high-concurrency"]
summary: "For high-concurrency enterprise Zabbix scenarios — move the database off the Zabbix server onto a dedicated MariaDB server (11.0.1.52): create the database and grant privileges, export and import the data, update the Web UI and Server database connection settings, then restart the services."
---

For high-concurrency scenarios in enterprise Zabbix deployments.

## 1. Prepare a Standalone Database Server (11.0.1.52) and Install MariaDB

```bash
[root@db02 ~]#yum -y install mariadb-server
[root@db02 ~]#systemctl enable mariadb --now
[root@db02 ~]#mysql
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 2
Server version: 5.5.68-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [(none)]> create database zabbix character set utf8 collate utf8_bin;
Query OK, 1 row affected (0.02 sec)

MariaDB [(none)]> create user 'zabbix'@'%' identified by 'zabbix';
Query OK, 0 rows affected (0.10 sec)

MariaDB [(none)]> grant all privileges on zabbix.* to 'zabbix'@'%';
Query OK, 0 rows affected (0.00 sec)
```

## 2. Export the Zabbix Database from the Zabbix Server and Import It into the New Database

```bash
[root@zabbix ~]# mysqldump -uroot -B zabbix > zabbix.sql
[root@zabbix ~]# cat zabbix.sql |mysql -h 172.16.1.52 -uzabbix -pzabbix zabbix
```

## 3. Configure the Web UI's Database Connection

```bash
[root@zabbix ~]# systemctl stop mariadb
[root@zabbix ~]# cat /etc/zabbix/web/zabbix.conf.php 
<?php
// Zabbix GUI configuration file.
global $DB;
$DB['TYPE']     = 'MYSQL';
$DB['SERVER']   = '172.16.1.52';
$DB['PORT']     = '0';
$DB['DATABASE'] = 'zabbix';
$DB['USER']     = 'zabbix';
$DB['PASSWORD'] = 'zabbix';
[root@zabbix ~]# grep ^DB /etc/zabbix/zabbix_server.conf 
DBHost=172.16.1.52
DBName=zabbix
DBUser=zabbix
DBPassword=zabbix
```

## 4. Restart the Services

```bash
[root@zabbix ~]# systemctl restart zabbix-server httpd
```
