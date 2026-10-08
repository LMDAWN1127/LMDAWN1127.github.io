---
title: "MySQL 版本升级实战与回退：5.6→5.7→8.0 就地升级、mysql-shell 检测与回退方案"
date: 2026-10-08T21:40:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "版本升级", "回退", "mysql-shell"]
summary: "从升级方法（本地 Inplace / 迁移 Mergeing）、升级规范与流程讲起，实战 5.6→5.7→8.0 就地升级：冷备、安全模式挂库启动、mysql_upgrade 升级授权表、正常重启验证；并用 mysql-shell 的 util.checkForServerUpgrade() 做 8.0 升级前检测；最后给出升级失败时的程序与数据回退步骤。"
---

## 数据库版本升级方法

### 方法一：本地升级 （Inplace）（本实验采用此方式）

单台服务器进行程序升级

```bash
11.0.1.101  mysql5.7 --> mysql8.0 (加载数据)  业务影响
```

### 方法二：迁移升级 （Mergeing）（后续实验操作）

两台服务器进行程序升级

```bash
11.0.1.101  mysql5.7  数据信息 迁移           业务影响-最小
11.0.1.102  mysql8.0  数据信息 恢复  测试业务  主从同步
```

## 数据库升级规范

- 数据库服务版本升级时，只支持在GA（General Availability）版本之间进行升级
- 数据库服务版本升级时，支持从数据库5.6到5.7再到8.0，跨版本升级，但是需要先将5.6升级到最新小版本，在进行跨版本升级
- 数据库服务版本升级时，需要提前考虑好版本回退的方案，最好升级前做好数据备份（特别是向8.0版本升级）
- 数据库服务版本升级时，制定的升级方案和升级步骤，需要尽可能降低数据库服务停机的时间

数据库服务官方参考资料：https://dev.mysql.com/doc/refman/8.0/en/upgrade-paths.html

## 数据库升级流程

- 数据库服务数据备份保存（可以采用热备和冷备两种方案，冷备是需要停止业务后备份，热备是无需停止业务备份）
- 数据库服务最新程序安装（最新版本数据库服务安装过程时，无需停止原有数据库旧版服务）
- 数据库服务原有程序关闭（网站显示维护页面）2个页面 提前通知  升级过程说明信息
- 数据库服务最新程序启动（加载原有程序数据实现挂库升级，并采用跳过授权表和跳过网络方式启动）
  采用安全模式启动新的数据库服务  --skip-grant-tables --skip-networking  加载旧版本数据信息
- 数据库服务升级数据结构（数据库服务升级程序后，还需要升级数据系统结构信息，因此升级时间和数据量无关）
- 数据库服务可以正常重启（数据库服务升级完毕后，确认数据库服务是可以正常完成重启操作）
- 数据库服务功能测试验证（反复核实验证与数据库服务相关的各项功能是否正常）
- 数据库服务升级工作完毕（取消网站维护页面，恢复正常网站线上运营业务）

## 数据库升级涉及两个方面

数据库程序升级：安装新的程序（安装新版数据库实例）    新的程序加载升级后的数据目录

数据库数据升级：数据目录结构升级/将授权表结构信息升级

## 数据库版本升级流程

### 环境准备：安装旧的数据库程序（详情见systemd 服务管理与MySQL 多版本部署）

#### 模拟创建数据

```bash
[root@master ~]#mysql -uroot -S /tmp/mysql3356.sock
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 1
Server version: 5.6.48 MySQL Community Server (GPL)

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> create database zlm;
Query OK, 1 row affected (0.00 sec)

mysql> create database lmy;
Query OK, 1 row affected (0.00 sec)

mysql> use zlm;
Database changed
mysql> create table t1 (id int,name char(10),age int);
Query OK, 0 rows affected (0.02 sec)

mysql> show tables;
+---------------+
| Tables_in_zlm |
+---------------+
| t1            |
+---------------+
1 row in set (0.00 sec)

mysql> insert into t1 values (1,'laoming',20),(2,'xiaoming',21),(3,'dawn',22);
Query OK, 3 rows affected (0.01 sec)
Records: 3  Duplicates: 0  Warnings: 0

mysql> SELECT * FROM t1;
+------+----------+------+
| id   | name     | age  |
+------+----------+------+
|    1 | laoming  |   20 |
|    2 | xiaoming |   21 |
|    3 | dawn     |   22 |
+------+----------+------+
3 rows in set (0.00 sec)

mysql>
```

### 5.6 -- 5.7

#### 步骤一：进行数据备份 （冷备）

```bash
[root@master ~]#systemctl stop mysqld3356
[root@master ~]#netstat -ntpl
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      989/sshd
tcp6       0      0 :::22                   :::*                    LISTEN      989/sshd
[root@master ~]#mkdir /backup/
[root@master ~]#cp -a /data/3356/data /backup/data_3356_bak
```

#### 步骤二：安全模式启动新版数据库服务

```bash
[root@master ~]#vim /etc/my3356.cnf
[mysql]
socket=/tmp/mysql3356.sock

[mysqld]
user=mysql
basedir=/usr/local/mysql57
datadir=/data/3356/data
socket=/tmp/mysql3356.sock
port=3356
pid-file=/run/mysqld3356/mysqld.pid

[root@master ~]#mkdir -p /run/mysqld3356
[root@master ~]#chown mysql:mysql /run/mysqld3356
[root@master ~]#/usr/local/mysql57/bin/mysqld_safe --defaults-file=/etc/my3356.cnf --skip-grant-tables --skip-networking &
```

数据信息没有升级前，授权表结构 5.6 mysql.user 信息

```bash
mysql> select * from mysql.user\G
*************************** 1. row ***************************
                  Host: localhost
                  User: root
              Password:
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
*************************** 2. row ***************************
                  Host: master
                  User: root
              Password:
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
*************************** 3. row ***************************
                  Host: 127.0.0.1
                  User: root
              Password:
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
*************************** 4. row ***************************
                  Host: ::1
                  User: root
              Password:
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
*************************** 5. row ***************************
                  Host: localhost
                  User:
              Password:
           Select_priv: N
           Insert_priv: N
           Update_priv: N
           Delete_priv: N
           Create_priv: N
             Drop_priv: N
           Reload_priv: N
         Shutdown_priv: N
          Process_priv: N
             File_priv: N
            Grant_priv: N
       References_priv: N
            Index_priv: N
            Alter_priv: N
          Show_db_priv: N
            Super_priv: N
 Create_tmp_table_priv: N
      Lock_tables_priv: N
          Execute_priv: N
       Repl_slave_priv: N
      Repl_client_priv: N
      Create_view_priv: N
        Show_view_priv: N
   Create_routine_priv: N
    Alter_routine_priv: N
      Create_user_priv: N
            Event_priv: N
          Trigger_priv: N
Create_tablespace_priv: N
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string: NULL
      password_expired: N
*************************** 6. row ***************************
                  Host: master
                  User:
              Password:
           Select_priv: N
           Insert_priv: N
           Update_priv: N
           Delete_priv: N
           Create_priv: N
             Drop_priv: N
           Reload_priv: N
         Shutdown_priv: N
          Process_priv: N
             File_priv: N
            Grant_priv: N
       References_priv: N
            Index_priv: N
            Alter_priv: N
          Show_db_priv: N
            Super_priv: N
 Create_tmp_table_priv: N
      Lock_tables_priv: N
          Execute_priv: N
       Repl_slave_priv: N
      Repl_client_priv: N
      Create_view_priv: N
        Show_view_priv: N
   Create_routine_priv: N
    Alter_routine_priv: N
      Create_user_priv: N
            Event_priv: N
          Trigger_priv: N
Create_tablespace_priv: N
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string: NULL
      password_expired: N
6 rows in set (0.00 sec)
```

#### 步骤三：进行数据目录和授权表结构信息升级

```bash
#修改授权表结构
[root@master ~]#/usr/local/mysql57/bin/mysql_upgrade -S /tmp/mysql3356.sock --force
```

数据信息已经升级后，授权表结构 5.7 mysql.user 信息

```bash
mysql> select * from mysql.user\G
*************************** 1. row ***************************
                  Host: localhost
                  User: root
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: N
*************************** 2. row ***************************
                  Host: master
                  User: root
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: N
*************************** 3. row ***************************
                  Host: 127.0.0.1
                  User: root
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: N
*************************** 4. row ***************************
                  Host: ::1
                  User: root
           Select_priv: Y
           Insert_priv: Y
           Update_priv: Y
           Delete_priv: Y
           Create_priv: Y
             Drop_priv: Y
           Reload_priv: Y
         Shutdown_priv: Y
          Process_priv: Y
             File_priv: Y
            Grant_priv: Y
       References_priv: Y
            Index_priv: Y
            Alter_priv: Y
          Show_db_priv: Y
            Super_priv: Y
 Create_tmp_table_priv: Y
      Lock_tables_priv: Y
          Execute_priv: Y
       Repl_slave_priv: Y
      Repl_client_priv: Y
      Create_view_priv: Y
        Show_view_priv: Y
   Create_routine_priv: Y
    Alter_routine_priv: Y
      Create_user_priv: Y
            Event_priv: Y
          Trigger_priv: Y
Create_tablespace_priv: Y
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string:
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: N
*************************** 5. row ***************************
                  Host: localhost
                  User:
           Select_priv: N
           Insert_priv: N
           Update_priv: N
           Delete_priv: N
           Create_priv: N
             Drop_priv: N
           Reload_priv: N
         Shutdown_priv: N
          Process_priv: N
             File_priv: N
            Grant_priv: N
       References_priv: N
            Index_priv: N
            Alter_priv: N
          Show_db_priv: N
            Super_priv: N
 Create_tmp_table_priv: N
      Lock_tables_priv: N
          Execute_priv: N
       Repl_slave_priv: N
      Repl_client_priv: N
      Create_view_priv: N
        Show_view_priv: N
   Create_routine_priv: N
    Alter_routine_priv: N
      Create_user_priv: N
            Event_priv: N
          Trigger_priv: N
Create_tablespace_priv: N
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string: NULL
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: N
*************************** 6. row ***************************
                  Host: master
                  User:
           Select_priv: N
           Insert_priv: N
           Update_priv: N
           Delete_priv: N
           Create_priv: N
             Drop_priv: N
           Reload_priv: N
         Shutdown_priv: N
          Process_priv: N
             File_priv: N
            Grant_priv: N
       References_priv: N
            Index_priv: N
            Alter_priv: N
          Show_db_priv: N
            Super_priv: N
 Create_tmp_table_priv: N
      Lock_tables_priv: N
          Execute_priv: N
       Repl_slave_priv: N
      Repl_client_priv: N
      Create_view_priv: N
        Show_view_priv: N
   Create_routine_priv: N
    Alter_routine_priv: N
      Create_user_priv: N
            Event_priv: N
          Trigger_priv: N
Create_tablespace_priv: N
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string: NULL
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: N
*************************** 7. row ***************************
                  Host: localhost
                  User: mysql.session
           Select_priv: N
           Insert_priv: N
           Update_priv: N
           Delete_priv: N
           Create_priv: N
             Drop_priv: N
           Reload_priv: N
         Shutdown_priv: N
          Process_priv: N
             File_priv: N
            Grant_priv: N
       References_priv: N
            Index_priv: N
            Alter_priv: N
          Show_db_priv: N
            Super_priv: Y
 Create_tmp_table_priv: N
      Lock_tables_priv: N
          Execute_priv: N
       Repl_slave_priv: N
      Repl_client_priv: N
      Create_view_priv: N
        Show_view_priv: N
   Create_routine_priv: N
    Alter_routine_priv: N
      Create_user_priv: N
            Event_priv: N
          Trigger_priv: N
Create_tablespace_priv: N
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string: *THISISNOTAVALIDPASSWORDTHATCANBEUSEDHERE
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: Y
*************************** 8. row ***************************
                  Host: localhost
                  User: mysql.sys
           Select_priv: N
           Insert_priv: N
           Update_priv: N
           Delete_priv: N
           Create_priv: N
             Drop_priv: N
           Reload_priv: N
         Shutdown_priv: N
          Process_priv: N
             File_priv: N
            Grant_priv: N
       References_priv: N
            Index_priv: N
            Alter_priv: N
          Show_db_priv: N
            Super_priv: N
 Create_tmp_table_priv: N
      Lock_tables_priv: N
          Execute_priv: N
       Repl_slave_priv: N
      Repl_client_priv: N
      Create_view_priv: N
        Show_view_priv: N
   Create_routine_priv: N
    Alter_routine_priv: N
      Create_user_priv: N
            Event_priv: N
          Trigger_priv: N
Create_tablespace_priv: N
              ssl_type:
            ssl_cipher: NULL
           x509_issuer: NULL
          x509_subject: NULL
         max_questions: 0
           max_updates: 0
       max_connections: 0
  max_user_connections: 0
                plugin: mysql_native_password
 authentication_string: *THISISNOTAVALIDPASSWORDTHATCANBEUSEDHERE
      password_expired: N
 password_last_changed: 2026-10-08 18:06:03
     password_lifetime: NULL
        account_locked: Y
8 rows in set (0.00 sec)
```

#### 步骤四：正常重新启动数据库服务

```bash
[root@master ~]#pkill mysql
[root@master ~]#vim /usr/lib/systemd/system/mysqld3356.service
[Unit]
Description=MySQL 5.6 Server (3356)
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/usr/local/mysql57/bin/mysqld --defaults-file=/etc/my3356.cnf
RuntimeDirectory=mysqld3356
LimitNOFILE=65536
Restart=on-failure

[Install]
WantedBy=multi-user.target
[root@master ~]#systemctl daemon-reload
[root@master ~]#systemctl start mysqld3356
```

### 5.7 -- 8.0

#### 步骤一：进行数据备份 （冷备）

```bash
[root@master ~]#systemctl stop mysqld3356
[root@master ~]#cp -a /data/3356/data /backup/data_3357_bak
```

#### 步骤二：安全模式启动新版数据库服务

```bash
[root@master ~]#vim /etc/my3356.cnf
[mysql]
socket=/tmp/mysql3356.sock

[mysqld]
user=mysql
basedir=/usr/local/mysql
datadir=/data/3356/data
socket=/tmp/mysql3356.sock
port=3356
pid-file=/run/mysqld3356/mysqld.pid

[root@master ~]#mkdir -p /run/mysqld3356 && chown mysql:mysql /run/mysqld3356
[root@master ~]#mysqld_safe --defaults-file=/etc/my.cnf  --skip-grant-tables --skip-networking &
```

#### 步骤三：正常重新启动数据库服务

```bash
[root@master ~]#pkill mysql
[root@master ~]#vim /usr/lib/systemd/system/mysqld3356.service
[Unit]
Description=MySQL 5.6 Server (3356)
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/etc/my3356.cnf
RuntimeDirectory=mysqld3356
LimitNOFILE=65536
Restart=on-failure

[Install]
WantedBy=multi-user.target

[root@master ~]#systemctl daemon-reload
[root@master ~]#systemctl start mysqld3356.service
```

## 5.7程序升级8.0 mysql-shell（函数功能可以检测数据库程序是否可以升级到8.0版本）

### 步骤一：下载安装mysql-shell软件工具

https://downloads.mysql.com/archives/shell/

```bash
[root@master ~]#cd /usr/local/
[root@master local]#tar xf mysql-shell-8.0.26-linux-glibc2.12-x86-64bit.tar.gz
[root@master local]#ln -s mysql-shell-8.0.26-linux-glibc2.12-x86-64bit mysqlsh

[root@master local]#vim /etc/profile
export PATH=$PATH:/usr/local/mysqlsh/bin
[root@master local]#. /etc/profile
```

### 步骤二：进行检测低版本数据库程序

```bash
# 准备5.7数据库服务环境
[root@master ~]#vim /usr/lib/systemd/system/mysqld3357.service
[Unit]
Description=MySQL 5.7 Server (3357)
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/usr/local/mysql57/bin/mysqld --defaults-file=/etc/my3357.cnf
RuntimeDirectory=mysqld3357
LimitNOFILE=65536
Restart=on-failure

[Install]
WantedBy=multi-user.target


[root@master ~]#vim /etc/my3357.cnf
[mysql]
socket=/tmp/mysql3357.sock

[mysqld]
user=mysql
basedir=/usr/local/mysql57
datadir=/data/3357/data
socket=/tmp/mysql3357.sock
port=3357
pid-file=/run/mysqld3357/mysqld.pid

[root@master ~]#systemctl start mysqld3357.service
[root@master ~]#mysql -uroot -S /tmp/mysql3357.sock
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 2
Server version: 5.7.40 MySQL Community Server (GPL)

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> create user root@'11.0.1.%' identified by '123456';
Query OK, 0 rows affected (0.02 sec)

mysql> grant all on *.* to root@'11.0.1.%';
Query OK, 0 rows affected (0.00 sec)

mysql> quit
Bye
[root@master ~]#mysqlsh root:123456@11.0.1.101:3357 -e "util.checkForServerUpgrade()"
```

执行以上命令，若没有error提示，表示可以实现版本升级 5.7.40 --> 8.0.26

## 数据库程序升级失败，进行程序回退

### 步骤一：关闭新版数据库服务程序

```bash
[root@master ~]#systemctl stop mysqld3356
```

### 步骤二：还原备份数据信息

5.6 - 5.7 备份56数据重新恢复到56程序的数据目录

```bash
[root@master ~]#\rm -rf /data/3356/data/*
[root@master ~]#cp -a /backup/data_3356_bak/* /data/3356/data/
```

### 步骤三：重新运行启动旧版本数据库服务

```bash
[root@master ~]#vim /etc/my3356.cnf
[mysql]
socket=/tmp/mysql3356.sock

[mysqld]
user=mysql
basedir=/usr/local/mysql56
datadir=/data/3356/data
socket=/tmp/mysql3356.sock
port=3356
pid-file=/run/mysqld3356/mysqld.pid

[root@master ~]#vim /usr/lib/systemd/system/mysqld3356.service
[Unit]
Description=MySQL 5.6 Server (3356)
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/usr/local/mysql56/bin/mysqld --defaults-file=/etc/my3356.cnf
RuntimeDirectory=mysqld3356
LimitNOFILE=65536
Restart=on-failure

[Install]
WantedBy=multi-user.target

[root@master ~]#systemctl daemon-reload
[root@master ~]#systemctl start mysqld3356
```

### 步骤四：检查旧版数据库服务状态

```bash
[root@master ~]#ps -ef|grep mysql
/mysql56/bin/mysqld --defaults-file=/etc/my3356.cnf
root       4117   1384  0 21:40 pts/0    00:00:00 grep --color=auto mysql
```
