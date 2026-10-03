---
title: "systemd サービス管理と MySQL マルチバージョン導入"
date: 2026-10-03T17:11:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "systemd", "マルチバージョン導入"]
summary: "systemd Unit 管理と MySQL 5.6/5.7 のマルチバージョン・マルチインスタンス導入実戦：2 種類の本番デーモン設定、アーカイブ入手、初期化、インスタンス別設定ファイル作成、および起動/停止と 3 サービス状態確認。"
showToc: true
---

#### 01 - systemctl データベース Service ファイルの整理

##### 方案1：標準本番デーモン設定

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

##### 方案2：設定ファイルとファイルハンドル制限付き

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

修正完了後

```bash
[root@master local]#systemctl daemon-reload
[root@master local]#systemctl restart mysqld.service
[root@master local]#systemctl enable  mysqld.service
```



#### 02 - マルチバージョン MySQL（5.6 / 5.7）インストールとアップグレード準備実戦

##### 手順1：ソフトウェアアーカイブのダウンロード

```bash
# MySQL 5.7.40 バイナリパッケージ
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz

# MySQL 5.6.48 バイナリパッケージ
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
```

##### 手順2：展開・インストールとシンボリックリンク作成

```bash
# 5.7 のインストール
[root@master local]#tar xf mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.7.40-linux-glibc2.12-x86_64 mysql57
# 注意：マルチバージョン共存デバッグ中はグローバル環境変数を設定せず、コマンドパスの衝突を回避

# 5.6 のインストール
[root@master local]#tar xf mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.6.48-linux-glibc2.12-x86_64 mysql56
# 注意：今のところグローバル環境変数は設定しない
```

##### 手順3：データベースソフトウェアの初期化

* **MySQL 5.7 初期化（データディレクトリ 3357）**:

  ```bash
  [root@master local]#mkdir -p /data/3357/data
  [root@master local]#chown -R mysql.mysql /data/3357/data
  [root@master local]#/usr/local/mysql57/bin/mysqld --initialize-insecure --user=mysql --datadir=/data/3357/data --basedir=/usr/local/mysql57
  [root@master local]#echo $?
  0
  ```

* **MySQL 5.6 初期化（データディレクトリ 3356）**:

  ```bash
  [root@master local]#mkdir -p /data/3356/data
  [root@master local]#chown -R mysql.mysql /data/3356/data
  [root@master local]#/usr/local/mysql56/scripts/mysql_install_db --user=mysql --datadir=/data/3356/data --basedir=/usr/local/mysql56
  FATAL ERROR: please install the following Perl modules before executing /usr/local/mysql56/scripts/mysql_install_db:
  Data::Dumper
  # Perl モジュール不足
  [root@master local]#yum install -y perl-Data-Dumper
  [root@master local]#/usr/local/mysql56/scripts/mysql_install_db --user=mysql --datadir=/data/3356/data --basedir=/usr/local/mysql56
  # 出力に 2 つの OK が含まれるか確認し、終了コードを確認：
  [root@master local]#echo $?
  0
  ```

##### 手順4：マルチインスタンス専用設定ファイルの作成

* **MySQL 5.7（インスタンス 3357）設定**:

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

* **MySQL 5.6（インスタンス 3356）設定**:

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

##### 手順5：起動・管理の実行検証

* **MySQL 5.7 サービスの起動/停止**:

  ```bash
  # 方式1：起動
  [root@master local]#cp /usr/local/mysql57/support-files/mysql.server /etc/init.d/mysqld57
  [root@master local]#chmod +x /etc/init.d/mysqld57
  [root@master local]#/etc/init.d/mysqld57 start
  [root@master local]#/etc/init.d/mysqld57 stop
  
  # 方式2：起動
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3357.service
  [root@master local]#systemctl enable mysqld3357.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3357.service to /usr/lib/systemd/system/mysqld3357.service.
  ```

* **MySQL 5.6 サービスの起動/停止**:

  ```bash
  # 方式1：起動
  [root@master local]#cp /usr/local/mysql56/support-files/mysql.server /etc/init.d/mysqld56
  [root@master local]#chmod +x /etc/init.d/mysqld56
  [root@master local]#/etc/init.d/mysqld56 start
  [root@master local]#/etc/init.d/mysqld56 stop
  
  # 方式2：起動
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3356.service
  [root@master local]#systemctl enable mysqld3356.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3356.service to /usr/lib/systemd/system/mysqld3356.service.
  ```

3 つのサービスの状態確認（すべて running）

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
