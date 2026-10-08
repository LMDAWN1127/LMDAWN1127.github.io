---
title: "MySQL 多实例部署实战：单主机三实例规划、初始化与 systemd 托管"
date: 2026-10-08T14:15:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "多实例", "systemd", "部署"]
summary: "在同一台 master 主机上规划并部署 3 个 MySQL 8.0.26 实例（3307/3308/3309）：独立 my.cnf 与数据目录、initialize-insecure 初始化，命令启动与 systemd 服务托管两种方式，并用 ps / netstat / select @@port 完成验证。"
---

## 步骤一：架构环境规划

master 11.0.1.101 搭建3个数据库服务实例

```bash
mysql01  mysql-8.0.26  /data/3307/data   /data/3307/my.cnf   3307   /tmp/mysql3307.sock
mysql02  mysql-8.0.26  /data/3308/data   /data/3308/my.cnf   3308   /tmp/mysql3308.sock
mysql03  mysql-8.0.26  /data/3309/data   /data/3309/my.cnf   3309   /tmp/mysql3309.sock
```

## 步骤二：创建多实例环境

```bash
[root@master ~]#mkdir -p /data/33{07..09}/data
[root@master ~]#chown -R mysql.mysql /data
[root@master ~]#cat >/data/3307/my.cnf <<EOF
> [mysqld]
> mysqlx=0
> port=3307
> user=mysql
> basedir=/usr/local/mysql
> datadir=/data/3307/data
> socket=/tmp/mysql3307.sock
> EOF
[root@master ~]#cat >/data/3308/my.cnf <<EOF
> [mysqld]
> mysqlx=0
> port=3308
> user=mysql
> basedir=/usr/local/mysql
> datadir=/data/3308/data
> socket=/tmp/mysql3308.sock
> EOF
[root@master ~]#cat >/data/3309/my.cnf <<EOF
> [mysqld]
> mysqlx=0
> port=3309
> user=mysql
> basedir=/usr/local/mysql
> datadir=/data/3309/data
> socket=/tmp/mysql3309.sock
> EOF
```

## 步骤三：多实例初始化

```bash
[root@master ~]#mysqld --initialize-insecure --user=mysql --datadir=/data/3307/data  --basedir=/usr/local/mysql
[root@master ~]#mysqld --initialize-insecure --user=mysql --datadir=/data/3308/data  --basedir=/usr/local/mysql
[root@master ~]#mysqld --initialize-insecure --user=mysql --datadir=/data/3309/data  --basedir=/usr/local/mysql
```

## 步骤四：运行启动多实例

**命令启动：**

```bash
[root@master ~]#mysqld --defaults-file=/data/3307/my.cnf &
[1] 1821
[root@master ~]#mysqld --defaults-file=/data/3308/my.cnf &
[2] 1859
[root@master ~]#mysqld --defaults-file=/data/3309/my.cnf &
[3] 1897
```

**利用service文件启动：**

```bash
[root@master ~]#cat >/usr/lib/systemd/system/mysqld3307.service<<EOF
> [Unit]
> Description=MySQL Server
> Documentation=mysqld.service
> After=network.target
> After=syslog.target
>
> [Install]
> WantedBy=multi-user.target
>
> [Service]
> User=mysql
> Group=mysql
> ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/data/3307/my.cnf
> LimitNOFILE = 5000
> EOF
[root@master ~]#cat >/usr/lib/systemd/system/mysqld3308.service<<EOF
> [Unit]
> Description=MySQL Server
> Documentation=mysqld.service
> After=network.target
> After=syslog.target
>
> [Install]
> WantedBy=multi-user.target
>
> [Service]
> User=mysql
> Group=mysql
> ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/data/3308/my.cnf
> LimitNOFILE = 5000
> EOF
[root@master ~]#cat >/usr/lib/systemd/system/mysqld3309.service<<EOF
> [Unit]
> Description=MySQL Server
> Documentation=mysqld.service
> After=network.target
> After=syslog.target
>
> [Install]
> WantedBy=multi-user.target
>
> [Service]
> User=mysql
> Group=mysql
> ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/data/3309/my.cnf
> LimitNOFILE = 5000
> EOF

[root@master ~]#systemctl daemon-reload
[root@master ~]#systemctl start mysqld3307
[root@master ~]#systemctl start mysqld3308
[root@master ~]#systemctl start mysqld3309
```

## 步骤五：多实例环境验证

```bash
[root@master ~]#ps -ef|grep mysql
mysql      1821   1434  0 13:48 pts/0    00:00:02 mysqld --defaults-file=/data/3307/my.cnf
mysql      1859   1434  0 13:49 pts/0    00:00:02 mysqld --defaults-file=/data/3308/my.cnf
mysql      1897   1434  0 13:49 pts/0    00:00:02 mysqld --defaults-file=/data/3309/my.cnf

[root@master ~]#netstat -lntup|grep mysql
tcp6       0      0 :::3307                 :::*                    LISTEN      1821/mysqld
tcp6       0      0 :::3308                 :::*                    LISTEN      1859/mysqld
tcp6       0      0 :::3309                 :::*                    LISTEN      1897/mysqld

[root@master ~]#mysql -uroot -S /tmp/mysql3307.sock
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 8
Server version: 8.0.26 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> select @@port;
+--------+
| @@port |
+--------+
|   3307 |
+--------+
1 row in set (0.00 sec)

mysql> quit
Bye
[root@master ~]#mysql -uroot -S /tmp/mysql3308.sock
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 8
Server version: 8.0.26 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> select @@port;
+--------+
| @@port |
+--------+
|   3308 |
+--------+
1 row in set (0.00 sec)

mysql> quit
Bye
[root@master ~]#mysql -uroot -S /tmp/mysql3309.sock
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 8
Server version: 8.0.26 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> select @@port;
+--------+
| @@port |
+--------+
|   3309 |
+--------+
1 row in set (0.00 sec)

mysql> quit
Bye
```
