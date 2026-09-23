---
title: "Zabbix データベースの分割"
date: 2026-09-23T16:00:00+08:00
draft: false
categories: ["Zabbix", "監視・運用"]
tags: ["Zabbix", "データベース", "分割", "高負荷"]
summary: "企業の Zabbix 高負荷シナリオ向け — Zabbix サーバーから専用の MariaDB サーバー (11.0.1.52) へデータベースを分割します。データベース作成と権限付与、データのエクスポート/インポート、Web UI と Server のデータベース接続設定の変更、そしてサービスの再起動まで。"
---

企業の Zabbix 高負荷シナリオでの使用を想定しています。

## 1. 独立したデータベースサーバー (11.0.1.52) を用意し MariaDB をインストールする

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

## 2. Zabbix サーバーから zabbix データベースをエクスポートし、新しいデータベースへインポートする

```bash
[root@zabbix ~]# mysqldump -uroot -B zabbix > zabbix.sql
[root@zabbix ~]# cat zabbix.sql |mysql -h 172.16.1.52 -uzabbix -pzabbix zabbix
```

## 3. Web UI のデータベース接続を設定する

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

## 4. サービスを再起動する

```bash
[root@zabbix ~]# systemctl restart zabbix-server httpd
```
