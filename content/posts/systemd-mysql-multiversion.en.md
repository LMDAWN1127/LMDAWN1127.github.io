---
title: "systemd Service Management & Multi-version MySQL Deployment"
date: 2026-10-03T17:11:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "systemd", "Multi-version Deploy"]
summary: "A hands-on guide to systemd Unit management and multi-version (5.6/5.7), multi-instance MySQL deployment: two production daemon configs, archive download, initialization, per-instance config files, and start/stop plus three-service status verification."
showToc: true
---

#### 01 - Organize the systemctl database Service files

##### Option 1: Standard production daemon configuration

```ini
[Unit]
Description=MySQL Server
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/usr/local/mysql/bin/mysqld --daemonize --pid-file=/var/run/mysqld/mysqld.pid
ExecReload=/bin/kill -HUP $MAINPID
PIDFile=/var/run/mysqld/mysqld.pid
PrivateTmp=true
RuntimeDirectory=mysqld

[Install]
WantedBy=multi-user.target
```

##### Option 2: With config file and file-handle limits

```bash
[Unit]
Description=MySQL Server
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/etc/my.cnf
RuntimeDirectory=mysqld
LimitNOFILE=65536
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

After the modification

```bash
[root@master local]#systemctl daemon-reload
[root@master local]#systemctl restart mysqld.service
[root@master local]#systemctl enable  mysqld.service
```



#### 02 - Multi-version MySQL (5.6 / 5.7) install & upgrade-prep practice

##### Step 1: Download the software archives

```bash
# MySQL 5.7.40 binary package
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz

# MySQL 5.6.48 binary package
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
```

##### Step 2: Extract, install, and create symlinks

```bash
# install version 5.7
[root@master local]#tar xf mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.7.40-linux-glibc2.12-x86_64 mysql57
# Note: during multi-version coexistence debugging, do not set the global env var yet to avoid command-path conflicts

# install version 5.6
[root@master local]#tar xf mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.6.48-linux-glibc2.12-x86_64 mysql56
# Note: do not configure the global env var for now
```

##### Step 3: Initialize the database software

* **MySQL 5.7 initialization (data directory 3357)**:

  ```bash
  [root@master local]#mkdir -p /data/3357/data
  [root@master local]#chown -R mysql.mysql /data/3357/data
  [root@master local]#/usr/local/mysql57/bin/mysqld --initialize-insecure --user=mysql --datadir=/data/3357/data --basedir=/usr/local/mysql57
  [root@master local]#echo $?
  0
  ```

* **MySQL 5.6 initialization (data directory 3356)**:

  ```bash
  [root@master local]#mkdir -p /data/3356/data
  [root@master local]#chown -R mysql.mysql /data/3356/data
  [root@master local]#/usr/local/mysql56/scripts/mysql_install_db --user=mysql --datadir=/data/3356/data --basedir=/usr/local/mysql56
  FATAL ERROR: please install the following Perl modules before executing /usr/local/mysql56/scripts/mysql_install_db:
  Data::Dumper
  # missing Perl module
  [root@master local]#yum install -y perl-Data-Dumper
  [root@master local]#/usr/local/mysql56/scripts/mysql_install_db --user=mysql --datadir=/data/3356/data --basedir=/usr/local/mysql56
  # check whether the output contains two OKs and confirm the exit code:
  [root@master local]#echo $?
  0
  ```

##### Step 4: Write the multi-instance dedicated config files

* **MySQL 5.7 (instance 3357) configuration**:

  ```bash
  [root@master local]#vim /etc/my3357.cnf
  [mysql]
  socket=/tmp/mysql3357.sock
  
  [mysqld]
  user=mysql
  basedir=/usr/local/mysql57
  datadir=/data/3357/data
  socket=/tmp/mysql3357.sock
  port=3357
  pid-file=/run/mysqld3357/mysqld.pid
  
  [root@master local]#vim /usr/lib/systemd/system/mysqld3357.service
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
  ```

* **MySQL 5.6 (instance 3356) configuration**:

  ```ini
  [root@master local]#vim /etc/my3356.cnf
  [mysql]
  socket=/tmp/mysql3356.sock
  
  [mysqld]
  user=mysql
  basedir=/usr/local/mysql56
  datadir=/data/3356/data
  socket=/tmp/mysql3356.sock
  port=3356
  pid-file=/run/mysqld3356/mysqld.pid
  
  [root@master local]#vim /usr/lib/systemd/system/mysqld3356.service
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
  ```

##### Step 5: Run, start, and verify management

* **Start/Stop the MySQL 5.7 service**:

  ```bash
  # Method 1: start
  [root@master local]#cp /usr/local/mysql57/support-files/mysql.server /etc/init.d/mysqld57
  [root@master local]#chmod +x /etc/init.d/mysqld57
  [root@master local]#/etc/init.d/mysqld57 start
  [root@master local]#/etc/init.d/mysqld57 stop
  
  # Method 2: start
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3357.service
  [root@master local]#systemctl enable mysqld3357.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3357.service to /usr/lib/systemd/system/mysqld3357.service.
  ```

* **Start/Stop the MySQL 5.6 service**:

  ```bash
  # Method 1: start
  [root@master local]#cp /usr/local/mysql56/support-files/mysql.server /etc/init.d/mysqld56
  [root@master local]#chmod +x /etc/init.d/mysqld56
  [root@master local]#/etc/init.d/mysqld56 start
  [root@master local]#/etc/init.d/mysqld56 stop
  
  # Method 2: start
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3356.service
  [root@master local]#systemctl enable mysqld3356.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3356.service to /usr/lib/systemd/system/mysqld3356.service.
  ```

Verify the status of the three services (all running)

```bash
[root@master local]#for svc in mysqld mysqld3356 mysqld3357; do
>   a=$(systemctl show -p ActiveState "$svc" | cut -d= -f2)
>   s=$(systemctl show -p SubState   "$svc" | cut -d= -f2)
>   echo "$svc: $a ($s)"
> done
mysqld: active (running)
mysqld3356: active (running)
mysqld3357: active (running)
```
