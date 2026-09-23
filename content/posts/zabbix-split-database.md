---
title: "拆分数据库"
date: 2026-09-23T16:00:00+08:00
draft: false
categories: ["Zabbix", "监控运维"]
tags: ["Zabbix", "数据库", "拆分", "高并发"]
summary: "面向 Zabbix 高并发场景，将数据库从 Zabbix 服务器拆分到独立 MariaDB 服务器（11.0.1.52）的操作步骤：建库授权、导出导入数据、修改 Web 与 Server 的数据库连接配置、重启服务。"
---

企业 zabbix 高并发场景使用

## 1. 准备一台数据库服务器 11.0.1.52 安装 MariaDB

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

## 2. 导出 Zabbix 服务器 zabbix 数据库、导入到新的数据库

```bash
[root@zabbix ~]# mysqldump -uroot -B zabbix > zabbix.sql
[root@zabbix ~]# cat zabbix.sql |mysql -h 172.16.1.52 -uzabbix -pzabbix zabbix
```

## 3. 配置 Web 连接数据库信息

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

## 4. 重启服务

```bash
[root@zabbix ~]# systemctl restart zabbix-server httpd
```
