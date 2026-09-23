---
title: "Zabbix 데이터베이스 분리"
date: 2026-09-23T16:00:00+08:00
draft: false
categories: ["Zabbix", "모니터링・운영"]
tags: ["Zabbix", "데이터베이스", "분리", "고부하"]
summary: "기업 Zabbix 고부하 시나리오용 — Zabbix 서버의 데이터베이스를 전용 MariaDB 서버(11.0.1.52)로 분리합니다. 데이터베이스 생성 및 권한 부여, 데이터 내보내기/가져오기, Web UI와 Server의 데이터베이스 연결 설정 변경, 그리고 서비스 재시작까지 다룹니다."
---

기업 Zabbix 고부하 시나리오에서 사용합니다.

## 1. 독립 데이터베이스 서버(11.0.1.52) 준비 및 MariaDB 설치

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

## 2. Zabbix 서버에서 zabbix 데이터베이스를 내보내 새 데이터베이스로 가져오기

```bash
[root@zabbix ~]# mysqldump -uroot -B zabbix > zabbix.sql
[root@zabbix ~]# cat zabbix.sql |mysql -h 172.16.1.52 -uzabbix -pzabbix zabbix
```

## 3. Web UI의 데이터베이스 연결 설정

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

## 4. 서비스 재시작

```bash
[root@zabbix ~]# systemctl restart zabbix-server httpd
```
