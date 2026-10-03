---
title: "MySQL in Practice: Binary Installation, Start/Stop, and Password Management"
date: 2026-10-03T14:53:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "Database", "Binary Install"]
summary: "A complete MySQL 8.0 operations guide: installing from the official binary package, OS prep, initialization, config file, multiple start/stop methods, plus password set/change and forgot-password reset."
showToc: true
---

## 01 - Database Service Installation and Deployment

### 1.1 Download the database server package

Official download address (historical archived binary packages):

```bash
# storage directory
[root@master ~]#cd /usr/local/
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

Check the package information
```bash
[root@master local]#ll mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
-rw-r--r-- 1 root root 914806904 Jul  2  2021 mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

---

### 1.2 Install the database server from a binary package

#### Step 1: Prepare the OS environment

##### 1. Confirm the network address
```bash
[root@master local]#ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000
    link/ether 00:0c:29:4b:b7:38 brd ff:ff:ff:ff:ff:ff
    inet 11.0.1.101/24 brd 11.0.1.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet6 fe80::20c:29ff:fe4b:b738/64 scope link
       valid_lft forever preferred_lft forever
```

##### 2. Configure hostname resolution
```bash
[root@master local]#vim /etc/hosts
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
11.0.1.101 master
```

##### 3. Disable the system firewall
```bash
[root@master local]#systemctl disable firewalld --now
```

##### 4. Disable SELinux
```bash
[root@master local]#sed -i 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
# reboot to take effect
[root@master local]#reboot
[root@master local]#getenforce
Disabled
```

##### 5. Avoid conflicts during database installation
```bash
# check whether a bundled mariadb is present on the system
[root@master local]#rpm -qa | grep mariadb
mariadb-libs-5.5.68-1.el7.x86_64

# uninstall the bundled database packages
[root@master local]#yum remove -y mariadb-libs
```

##### 6. Install DB dependency packages (missing ones cause init errors)
```bash
[root@master local]#yum install -y libaio-devel
```

---

#### Step 2: Install the database software

##### 1. Extract the package and create a symlink (for easier version management)
```bash
[root@master local]#tar xf mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
[root@master local]#ln -s mysql-8.0.26-linux-glibc2.12-x86_64 mysql
```

##### 2. Configure the system-wide environment variable
```bash
[root@master local]#vim /etc/profile
# append at the end of the file
export PATH=$PATH:/usr/local/mysql/bin
# apply the configuration
[root@master local]#source /etc/profile
```

##### 3. Verify the installed version
```bash
[root@master local]#mysql -V
mysql  Ver 8.0.26 for Linux on x86_64 (MySQL Community Server - GPL)
```

---

#### Step 3: Initialize the software

MySQL has two core directories:
* **Program directory**: `/usr/local/mysql`
* **Data directory**: `/data/3306/data` (stores the actual data)

##### 1. Create a dedicated runtime user (no system login needed)
```bash
[root@master local]#useradd mysql -M -s /sbin/nologin
```

##### 2. Create the data directory and set ownership
```bash
[root@master local]#mkdir /data/3306/data -p
[root@master local]#chown mysql.mysql /data/3306/data
```

##### 3. Initialize the data directory
```bash
# remove any interfering config files that may exist
[root@master local]#rm -f /etc/my.cnf

# run passwordless initialization (admin has no password afterward)
[root@master local]#mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
```

---

#### Step 4: Write the database service config file

Create and edit `/etc/my.cnf`:
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
> Note: the `basedir` and `datadir` paths in the config must be adjusted to your actual environment.

---

#### Step 5: Start the database service

##### 1. Start with the official service management script
```bash
[root@master local]#cp /usr/local/mysql/support-files/mysql.server /etc/init.d/mysqld
[root@master local]#/etc/init.d/mysqld start
Starting MySQL.Logging to '/data/3306/data/master.err'.
. SUCCESS!
# being able to enter the database normally indicates a successful start
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

##### 2. Start directly from the command line
* **Start with the `mysqld` command**:
  ```bash
  /usr/local/mysql/bin/mysqld --basedir=/usr/local/mysql --datadir=/data/3306/data --user=mysql --socket=/tmp/mysql.sock &
  ```
* **Start with the `mysqld_safe` safe daemon**:
  ```bash
  /usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data &
  ```

##### 3. Start with systemctl / service
* **Method 1**: write a dedicated Systemd unit file (`/etc/systemd/system/mysqld.service`)
* **Method 2**: directly enable and invoke the service script under `/etc/init.d/`:
  ```bash
  systemctl enable mysqld
  service mysqld start
  # or
  systemctl start mysqld
  ```

---

### 1.3 Supplementary knowledge

#### 1. Comparing the two initialization methods

* **Method 1: insecure initialization (`--initialize-insecure`)**
  ```bash
  mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * Characteristic: the DB admin has no password and can log in directly without one, convenient for testing or scripted initialization.

* **Method 2: secure initialization (`--initialize`)**
  ```bash
  mysqld --initialize --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * Characteristic: the DB admin gets a random temporary password printed in the log, used for the first login.
  * **Caution**: the temporary password is only for the first login; after logging in you must reset a new password, and no other operations can run before changing it:
    ```sql
    ALTER USER root@'localhost' IDENTIFIED BY '123456';
    ```

#### 2. Standard troubleshooting flow for startup failures

* **Step 1: Confirm the basic system environment**
  * Check whether SELinux is fully disabled;
  * Check whether port `3306` is occupied and whether other conflicting DB service processes exist.
* **Step 2: Investigate and analyze the error log**
  * Typical error: `Starting MySQL. ERROR! The server quit without updating PID file (/data/3306/data/master.pid).`
  * Inspect the error log details:
    ```bash
    cat /data/3306/data/master.err
    # example log error:
    # 2024-06-14T09:15:36.120048Z 1 [ERROR] [MY-012271] [InnoDB] The innodb_system data file 'ibdata1' must be writable
    ```
* **Step 3: How to troubleshoot when there is no error log**
  * Check the config file `/etc/my.cnf`:
    1. Confirm whether the config file path and filename are correct;
    2. Confirm whether the internal parameter syntax and path configuration are correct.

---

## 02 - Starting and stopping the database service

There are several ways to start and stop the database service; the common ones are summarized below:

| No. | Start method | Corresponding stop method | Notes & suggestions |
| :---: | :--- | :--- | :--- |
| **01** | `mysqld &` | `kill` / `pkill` / `killall` | Not recommended; **never use `kill -9`** |
| **02** | `mysqld_safe &` | `kill` / `pkill` / `killall` | Direct kill not recommended |
| **03** | `mysql.server start` | `mysql.server stop` | Official native control script |
| **04** | `service mysqld start` | `service mysqld stop` | **Recommended** (classic service management) |
| **05** | `systemctl start mysqld` | `systemctl stop mysqld` | **Recommended** (modern Linux standard) |
| **06** | Client/admin command | `mysqladmin -uroot -p<password> shutdown` | Graceful shutdown via admin remotely or locally |
| **07** | Shut down within an SQL session | Enter the terminal and run `shutdown;` | Requires admin privileges |

---

## 03 - Database service password management

### 1. Set a password when none exists

* **Method 1: using the command line**
  ```bash
  [root@master local]#mysqladmin -uroot password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **Method 2: using an SQL statement**
  
  ```sql
  mysql> ALTER USER root@'localhost' IDENTIFIED BY '000000';
  Query OK, 0 rows affected (0.02 sec)
  ```

---

### 2. Change the password when one already exists

* **Method 1: using the command line**
  ```bash
  [root@master local]#mysqladmin -uroot -p000000 password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **Method 2: using an SQL statement**
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

### 3. Forgot the password (password reset)

#### Practical password reset procedure

* **Step 1: Stop the database service**
  
  ```sql
  mysql> shutdown;
  ```
  Or run in the system terminal:
  ```bash
  [root@master local]#service mysqld stop
  Shutting down MySQL.. SUCCESS!
  # or
  pkill mysqld
  ```
  
* **Step 2: Start the database in safe mode (skip the grant tables to enable passwordless login)**
  ```bash
  [root@master local]#/usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data --skip-grant-tables --skip-networking &
  [1] 2658
  ```
  *Note*: `--skip-networking` disables network listening to prevent other network clients from intervening during the passwordless period.
  
* **Step 3: Log in without a password and reset it**
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
  Run the following in the MySQL terminal in order:
  ```sql
  -- 1. Flush the privilege tables (sync in-memory and on-disk grant tables)
  -- Effect 1: write the in-memory grant table info to disk
  -- Effect 2: reload the on-disk grant table info into memory
  FLUSH PRIVILEGES;
  
  -- 2. Reset the password
  ALTER USER root@'localhost' IDENTIFIED BY '123456';
  ```
  > **Note**: if you run `ALTER USER` directly without `FLUSH PRIVILEGES;`, the system throws an error:
  > ```text
  > ERROR 1290 (HY000): The MySQL server is running with the --skip-grant-tables option so it cannot execute this statement
  > ```
  
* **Step 4: Restart the database service normally**
  ```bash
  # terminate the temporary safe-mode process
  [root@master local]#pkill mysqld
  
  # start the database service normally
  [root@master local]#/etc/init.d/mysqld start
  Starting MySQL.. SUCCESS!
  # or service mysqld start
  ```
  
* **Step 5: Verify login with the new password**
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
