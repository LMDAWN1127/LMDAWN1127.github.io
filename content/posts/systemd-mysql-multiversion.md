---
title: "systemd 服务管理与 MySQL 多版本部署"
date: 2026-10-03T17:11:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "systemd", "多版本部署"]
summary: "围绕 systemd Unit 文件管理与 MySQL 5.6/5.7 多版本、多实例部署实战，涵盖两种生产守护进程配置、归档包下载、初始化、专属配置文件编写，以及启动/停止与三服务状态验证。"
showToc: true
---

#### 1.整理 systemctl 数据库 Service 文件

##### 方案一：标准生产守护进程配置

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

##### 方案二：带配置文件与文件句柄限制配置

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

修改完成后

```bash
[root@master local]#systemctl daemon-reload
[root@master local]#systemctl restart mysqld.service
[root@master local]#systemctl enable  mysqld.service
```



#### 2.多版本 MySQL（5.6 / 5.7）安装与升级准备

##### 步骤一：下载软件归档包

```bash
# MySQL 5.7.40 二进制包
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz

# MySQL 5.6.48 二进制包
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
```

##### 步骤二：解压安装与创建软链接

```bash
# 安装 5.7 版本
[root@master local]#tar xf mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.7.40-linux-glibc2.12-x86_64 mysql57
# 注意：多版本共存调试期间，暂不配置全局环境变量，避免命令路径冲突

# 安装 5.6 版本
[root@master local]#tar xf mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.6.48-linux-glibc2.12-x86_64 mysql56
# 注意：暂不配置全局环境变量
```

##### 步骤三：编写多实例专属配置文件

* **MySQL 5.7（3357 实例）配置**：

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

* **MySQL 5.6（3356 实例）配置**：

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

##### 步骤四：初始化数据库软件

* **MySQL 5.6 初始化（数据目录 3356）**：

  ```bash
  [root@master local]#mkdir -p /data/3356/data
  [root@master local]#chown -R mysql.mysql /data/3356/data
  [root@master ~]#/usr/local/mysql56/scripts/mysql_install_db   --defaults-file=/etc/my3356.cnf   --user=mysql --basedir=/usr/local/mysql56 --datadir=/data/3356/data
  FATAL ERROR: please install the following Perl modules before executing /usr/local/mysql56/scripts/mysql_install_db:
  Data::Dumper
  # 缺少Perl模块
  [root@master local]#yum install -y perl-Data-Dumper
  [root@master local]#/usr/local/mysql56/scripts/mysql_install_db --user=mysql --datadir=/data/3356/data --basedir=/usr/local/mysql56
  # 观察输出信息中是否包含两个 OK，并确认退出状态码：
  [root@master local]#echo $?
  0
  ```

* **MySQL 5.7 初始化（数据目录 3357）**：

  ```bash
  [root@master local]#mkdir -p /data/3357/data
  [root@master local]#chown -R mysql.mysql /data/3357/data
  [root@master ~]#/usr/local/mysql57/bin/mysqld --defaults-file=/etc/my3357.cnf   --initialize-insecure --user=mysql --basedir=/usr/local/mysql57 --datadir=/data/3357/data
  [root@master local]#echo $?
  0
  ```

##### 步骤五：运行启动数据库服务

* **启动/停止 MySQL 5.7 服务**：

  ```bash
  # 第一种启动方式
  [root@master local]#cp /usr/local/mysql57/support-files/mysql.server /etc/init.d/mysqld57
  [root@master local]#chmod +x /etc/init.d/mysqld57
  [root@master local]#/etc/init.d/mysqld57 start
  [root@master local]#/etc/init.d/mysqld57 stop
  
  # 第二种启动方式
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3357.service
  [root@master local]#systemctl enable mysqld3357.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3357.service to /usr/lib/systemd/system/mysqld3357.service.
  ```

* **启动/停止 MySQL 5.6 服务**：

  ```bash
  # 第一种启动方式
  [root@master local]#cp /usr/local/mysql56/support-files/mysql.server /etc/init.d/mysqld56
  [root@master local]#chmod +x /etc/init.d/mysqld56
  [root@master local]#/etc/init.d/mysqld56 start
  [root@master local]#/etc/init.d/mysqld56 stop
  
  # 第二种启动方式
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3356.service
  [root@master local]#systemctl enable mysqld3356.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3356.service to /usr/lib/systemd/system/mysqld3356.service.
  ```

三个服务状态验证（全都running）

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

