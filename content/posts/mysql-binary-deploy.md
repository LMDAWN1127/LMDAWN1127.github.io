---
title: "MySQL 实战：二进制安装部署、启动关闭与密码管理"
date: 2026-10-03T14:53:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "数据库", "二进制安装"]
summary: "从官方二进制包安装 MySQL 8.0，涵盖系统环境准备、初始化、配置文件编写、多种启动/关闭方式，以及密码设置、修改与忘记密码重置的完整运维实战。"
showToc: true
---

## 01-数据库服务安装部署

### 1.1 数据库服务程序下载

官方下载地址（历史归档二进制安装包）：

```bash
# 存放目录
[root@master ~]#cd /usr/local/
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

查看安装包信息
```bash
[root@master local]#ll mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
-rw-r--r-- 1 root root 914806904 Jul  2  2021 mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

---

### 1.2 二进制方式安装数据库服务

#### 步骤一：操作系统环境准备

##### 1. 确认网络地址
```bash
[root@master local]#ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000
    link/ether 00:0c:29:4b:b7:38 brd ff:ff:ff:ff:ff:ff
    inet 11.0.1.101/24 brd 11.0.1.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet6 fe80::20c:29ff:fe4b:b738/64 scope link
       valid_lft forever preferred_lft forever
```

##### 2. 配置主机名解析
```bash
[root@master local]#vim /etc/hosts
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
11.0.1.101 master
```

##### 3. 关闭系统防火墙
```bash
[root@master local]#systemctl disable firewalld --now
```

##### 4. 关闭 SELinux
```bash
[root@master local]#sed -i 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
# 重启生效
[root@master local]#reboot
[root@master local]#getenforce
Disabled
```

##### 5. 避免数据库服务安装产生冲突
```bash
# 查看系统中是否存在自带的 mariadb 数据库程序
[root@master local]#rpm -qa | grep mariadb
mariadb-libs-5.5.68-1.el7.x86_64

# 将系统自带的数据库程序包卸载
[root@master local]#yum remove -y mariadb-libs
```

##### 6. 安装数据库程序依赖软件（缺少会导致初始化报错）
```bash
[root@master local]#yum install -y libaio-devel
```

---

#### 步骤二：安装数据库软件程序

##### 1. 解压安装包并创建软链接（便于后续版本管理）
```bash
[root@master local]#tar xf mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
[root@master local]#ln -s mysql-8.0.26-linux-glibc2.12-x86_64 mysql
```

##### 2. 配置系统全局环境变量
```bash
[root@master local]#vim /etc/profile
# 在文件末尾添加
export PATH=$PATH:/usr/local/mysql/bin
# 生效配置
[root@master local]#source /etc/profile
```

##### 3. 验证安装版本
```bash
[root@master local]#mysql -V
mysql  Ver 8.0.26 for Linux on x86_64 (MySQL Community Server - GPL)
```

---

#### 步骤三：进行软件程序初始化操作

MySQL两个核心目录：
* **程序目录**：`/usr/local/mysql`
* **数据目录**：`/data/3306/data`（存储实际数据信息）

##### 1. 创建专用运行用户（无需系统登录权限）
```bash
[root@master local]#useradd mysql -M -s /sbin/nologin
```

##### 2. 创建数据存储目录并授权
```bash
[root@master local]#mkdir /data/3306/data -p
[root@master local]#chown mysql.mysql /data/3306/data
```

##### 3. 执行数据目录初始化
```bash
# 清理可能存在的干扰配置文件
[root@master local]#rm -f /etc/my.cnf

# 执行无密码初始化（初始化后管理员无密码）
[root@master local]#mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
```

---

#### 步骤四：编写数据库服务配置文件

创建并编辑 `/etc/my.cnf`：
```ini
[root@master local]#cat > /etc/my.cnf << 'eof'
> [mysql]
> socket=/tmp/mysql.sock
>
> [mysqld]
> user=mysql
> basedir=/usr/local/mysql
> datadir=/data/3306/data
> socket=/tmp/mysql.sock
> eof
```
> 注：配置文件中 `basedir` 与 `datadir` 路径需结合自己实际环境进行调整。

---

#### 步骤五：启动数据库服务程序

##### 1. 利用官方服务管理脚本启动
```bash
[root@master local]#cp /usr/local/mysql/support-files/mysql.server /etc/init.d/mysqld
[root@master local]#/etc/init.d/mysqld start
Starting MySQL.Logging to '/data/3306/data/master.err'.
. SUCCESS!
# 能够正常进入数据库说明启动成功
[root@master local]#mysql -uroot
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 8
Server version: 8.0.26 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql>
```

##### 2. 利用命令行直接启动
* **通过 `mysqld` 命令启动**：
  ```bash
  /usr/local/mysql/bin/mysqld --basedir=/usr/local/mysql --datadir=/data/3306/data --user=mysql --socket=/tmp/mysql.sock &
  ```
* **通过 `mysqld_safe` 安全守护进程启动**：
  ```bash
  /usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data &
  ```

##### 3. 利用 systemctl / service 启动
* **方式一**：编写专属的 Systemd Unit 文件（`/etc/systemd/system/mysqld.service`）
* **方式二**：直接激活并调用 `/etc/init.d/` 目录下的服务脚本：
  ```bash
  systemctl enable mysqld
  service mysqld start
  # 或
  systemctl start mysqld
  ```

---

### 1.3 补充知识介绍

#### 1. 初始化操作的两种方式对比

* **方式一：不安全初始化（`--initialize-insecure`）**
  ```bash
  mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * 特点：数据库管理员没有密码，可以直接免密登录数据库，便于测试或脚本初始化。

* **方式二：安全初始化（`--initialize`）**
  ```bash
  mysqld --initialize --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * 特点：数据库管理员会生成随机临时密码，打印在日志中，用于首次登录数据库。
  * **注意事项**：临时密码只能用于首次登录数据库；登录成功后必须重新设置新密码，在修改密码前无法执行其他操作：
    ```sql
    ALTER USER root@'localhost' IDENTIFIED BY '123456';
    ```

#### 2. 数据库启动失败排错标准流程

* **步骤一：确认系统基础环境**
  * 检查 SELinux 是否已彻底关闭；
  * 检查端口 `3306` 是否被占用，是否存在其他冲突的数据库服务进程。
* **步骤二：排查与分析错误日志**
  * 典型报错：`Starting MySQL. ERROR! The server quit without updating PID file (/data/3306/data/master.pid).`
  * 查看错误日志明细：
    ```bash
    cat /data/3306/data/master.err
    # 日志错误示例:
    # 2024-06-14T09:15:36.120048Z 1 [ERROR] [MY-012271] [InnoDB] The innodb_system data file 'ibdata1' must be writable
    ```
* **步骤三：没有错误日志时的排查方法**
  * 检查配置文件 `/etc/my.cnf`：
    1. 确认配置文件所在路径与文件命名是否正确；
    2. 确认配置文件内部参数语法及路径配置是否正确。

---

## 02-数据库服务启动关闭

有多种方式可以启动与关闭数据库服务，常见方式汇总如下：

| 序号 | 启动方式 | 对应关闭方式 | 说明与建议 |
| :---: | :--- | :--- | :--- |
| **01** | `mysqld &` | `kill` / `pkill` / `killall` | 不建议；**严禁使用 `kill -9`** |
| **02** | `mysqld_safe &` | `kill` / `pkill` / `killall` | 不建议直接 kill |
| **03** | `mysql.server start` | `mysql.server stop` | 官方原生控制脚本 |
| **04** | `service mysqld start` | `service mysqld stop` | **建议使用**（经典服务管理） |
| **05** | `systemctl start mysqld` | `systemctl stop mysqld` | **建议使用**（现代 Linux 标准） |
| **06** | 客户端/管理命令 | `mysqladmin -uroot -p密码 shutdown` | 管理员远程或本地命令行优雅关闭 |
| **07** | SQL 会话内关闭 | 进入终端执行 `shutdown;` | 需管理员权限 |

---

## 03-数据库服务密码管理

### 1. 没有密码时设置密码

* **方式一：利用命令行操作**
  ```bash
  [root@master local]#mysqladmin -uroot password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **方式二：利用 SQL 语句操作**
  
  ```sql
  mysql> ALTER USER root@'localhost' IDENTIFIED BY '000000';
  Query OK, 0 rows affected (0.02 sec)
  ```

---

### 2. 已有密码时修改密码

* **方式一：利用命令行操作**
  ```bash
  [root@master local]#mysqladmin -uroot -p000000 password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **方式二：利用 SQL 语句操作**
  ```bash
  [root@master local]#mysql -uroot -p123456
  mysql: [Warning] Using a password on the command line interface can be insecure.
  Welcome to the MySQL monitor.  Commands end with ; or \g.
  Your MySQL connection id is 14
  Server version: 8.0.26 MySQL Community Server - GPL
  
  Copyright (c) 2000, 2021, Oracle and/or its affiliates.
  
  Oracle is a registered trademark of Oracle Corporation and/or its
  affiliates. Other names may be trademarks of their respective
  owners.
  
  Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.
  
  mysql> ALTER USER root@'localhost' IDENTIFIED BY '123456';
  Query OK, 0 rows affected (0.00 sec)
  
  mysql>
  ```

---

### 3. 已有密码但是忘记密码（密码重置）

#### 重置密码实操流程

* **步骤一：关闭数据库服务**
  
  ```sql
  mysql> shutdown;
  ```
  或在系统终端执行：
  ```bash
  [root@master local]#service mysqld stop
  Shutting down MySQL.. SUCCESS!
  # 或
  pkill mysqld
  ```
  
* **步骤二：采用安全模式启动数据库（跳过授权表加载，实现免密登录）**
  ```bash
  [root@master local]#/usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data --skip-grant-tables --skip-networking &
  [1] 2658
  ```
  *说明*：`--skip-networking` 用于禁用网络监听，防止在免密期间其他网络客户端介入。
  
* **步骤三：免密登录并重置密码**
  ```bash
  [root@master local]#mysql
  Welcome to the MySQL monitor.  Commands end with ; or \g.
  Your MySQL connection id is 7
  Server version: 8.0.26 MySQL Community Server - GPL
  
  Copyright (c) 2000, 2021, Oracle and/or its affiliates.
  
  Oracle is a registered trademark of Oracle Corporation and/or its
  affiliates. Other names may be trademarks of their respective
  owners.
  
  Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.
  
  mysql> FLUSH PRIVILEGES;
  Query OK, 0 rows affected (0.01 sec)
  
  mysql> ALTER USER root@'localhost' IDENTIFIED BY '123456';
  Query OK, 0 rows affected (0.00 sec)
  
  mysql>
  ```
  在 MySQL 终端中依次执行：
  ```sql
  -- 1. 刷新权限表（同步内存与磁盘中的授权表数据）
  -- 作用一：将内存中授权表信息同步写入磁盘
  -- 作用二：将磁盘中授权表信息重新加载到内存
  FLUSH PRIVILEGES;
  
  -- 2. 重置密码
  ALTER USER root@'localhost' IDENTIFIED BY '123456';
  ```
  > **注意**：若未执行 `FLUSH PRIVILEGES;` 直接执行 `ALTER USER`，系统会抛出报错：
  > ```text
  > ERROR 1290 (HY000): The MySQL server is running with the --skip-grant-tables option so it cannot execute this statement
  > ```
  
* **步骤四：重新正常启动数据库服务**
  ```bash
  # 终止临时安全模式进程
  [root@master local]#pkill mysqld
  
  # 正常启动数据库服务
  [root@master local]#/etc/init.d/mysqld start
  Starting MySQL.. SUCCESS!
  # 或 service mysqld start
  ```
  
* **步骤五：使用新密码进行登录访问验证**
  ```bash
  [root@master local]#mysql -uroot -p123456
  mysql: [Warning] Using a password on the command line interface can be insecure.
  Welcome to the MySQL monitor.  Commands end with ; or \g.
  Your MySQL connection id is 8
  Server version: 8.0.26 MySQL Community Server - GPL
  
  Copyright (c) 2000, 2021, Oracle and/or its affiliates.
  
  Oracle is a registered trademark of Oracle Corporation and/or its
  affiliates. Other names may be trademarks of their respective
  owners.
  
  Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.
  
  mysql>
  ```
