---
title: "Zabbix のインストールとデプロイ"
date: 2026-09-23T01:52:00+08:00
draft: false
categories: ["Zabbix", "監視・運用"]
tags: ["Zabbix", "監視", "CentOS7", "インストール"]
summary: "CentOS 7 に Zabbix 5.0 をインストールする手順を解説。リポジトリ設定、サーバー/エージェント/フロントエンドの導入、MariaDB 構築、スキーマのインポート、Web UI の中国語化とフォント設定まで。"
---

## 1. リポジトリを設定する

```bash
rpm -Uvh https://repo.zabbix.com/zabbix/5.0/rhel/7/x86_64/zabbix-release-5.0-1.el7.noarch.rpm
```

## 2. zabbix-server と zabbix-agent をインストールする

```bash
yum -y install zabbix-server-mysql zabbix-agent
```

## 3. SCL リポジトリをインストールする（バージョン競合の解決）

```bash
[root@zabbix ~]# yum -y install centos-release-scl
```

## 4. フロントエンドリポジトリを有効化する

```bash
[root@zabbix ~]# vim /etc/yum.repos.d/zabbix.repo
[zabbix-frontend]
...
enabled=1
...
```

## 5. CentOS-SCLo-scl.repo / CentOS-SCLo-scl-rh.repo の壊れた mirrorlist を Aliyun の baseurl に置き換える

```bash
[root@zabbix yum.repos.d]#vim CentOS-SCLo-scl-rh.repo
[centos-sclo-rh]
...
baseurl=https://mirrors.aliyun.com/centos/7/sclo/x86_64/rh
...
[root@zabbix yum.repos.d]#vim CentOS-SCLo-scl.repo
[centos-sclo-sclo]
...
baseurl=https://mirrors.aliyun.com/centos/7/sclo/x86_64/sclo
...
```

## 6. PHP/Apache フロントエンドをインストールする

```bash
[root@zabbix ~]# yum -y install zabbix-web-mysql-scl zabbix-apache-conf-scl
```

## 7. MariaDB データベースをインストールする

```bash
[root@zabbix ~]# yum -y install mariadb-server
データベースを起動します：
[root@zabbix ~]#systemctl enable mariadb --now
```

## 8. Zabbix データベースを作成する

```bash
[root@zabbix ~]#mysql -uroot
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 7
Server version: 5.5.68-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [(none)]> create database zabbix character set utf8 collate utf8_bin;
Query OK, 1 row affected (0.00 sec)

MariaDB [(none)]> create user zabbix@localhost identified by 'zabbix';
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> grant all privileges on zabbix.* to zabbix@localhost;
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> set global log_bin_trust_function_creators = 1;
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> quit
Bye
```

## 9. データベースを初期化する（Zabbix 起動前に必要なスキーマをインポート）

```bash
[root@zabbix ~]# zcat /usr/share/doc/zabbix-server-mysql*/create.sql.gz | mysql -uzabbix -p zabbix 
# zabbix のパスワードの入力を求められます
[root@zabbix ~]# mysql -uroot
MariaDB [(none)]> set global log_bin_trust_function_creators = 0;
quit
```

## 10. Zabbix のデータベース接続を設定する

```bash
[root@zabbix ~]# egrep ^DB /etc/zabbix/zabbix_server.conf
DBName=zabbix
DBUser=zabbix
DBPassword=zabbix   # コメントを外してパスワードを設定
```

## 11. タイムゾーンを設定する

```bash
[root@zabbix ~]# tail -1 /etc/opt/rh/rh-php72/php-fpm.d/zabbix.conf
php_value[date.timezone] = Asia/Shanghai
```

## 12. サービス（server、agent、httpd、php）を起動し、起動時有効化する

```bash
[root@zabbix ~]# systemctl enable zabbix-server zabbix-agent httpd rh-php72-php-fpm --now
```

## 13. Zabbix Web UI に 11.0.1.71/zabbix でアクセスする

![](/images/p4_img29.png)

## 14. Zabbix のインストール完了

![](/images/p4_img32.png)

![](/images/p5_img37.png)

![](/images/p5_img39.png)

## 15. 中国語表示に切り替え、フォントを再設定する

![](/images/p6_img44.png)

![](/images/p6_img45.png)

![](/images/p7_img49.png)

Windows のフォントを見つけて、Zabbix のフォントディレクトリにコピーします。

Windows フォントの保存場所：

![](/images/p7_img51.png)

いずれかのフォントをアップロードし、名前を変更します：

```bash
[root@zabbix ~]#cd /usr/share/zabbix/assets/fonts/
[root@zabbix fonts]#ls
graphfont.ttf  simhei.ttf  # アップロードしたフォント
[root@zabbix fonts]#rm -f graphfont.ttf  # 元のフォントを削除
[root@zabbix fonts]#ln -s /usr/share/zabbix/assets/fonts/simhei.ttf graphfont.ttf  # アップロードしたフォントにリンク
[root@zabbix fonts]#chmod 644 simhei.ttf
[root@zabbix fonts]#ll
total 9520
lrwxrwxrwx 1 root root      41 Sep 23 01:19 graphfont.ttf -> /usr/share/zabbix/assets/fonts/simhei.ttf
-rw-r--r-- 1 root root 9745792 Sep 23 01:18 simhei.ttf
```

![](/images/p8_img55.png)
