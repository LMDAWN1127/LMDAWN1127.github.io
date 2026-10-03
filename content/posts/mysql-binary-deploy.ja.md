---
title: "MySQL 実践：バイナリインストール・起動停止・パスワード管理"
date: 2026-10-03T14:53:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "データベース", "バイナリインストール"]
summary: "MySQL 8.0 の運用実戦：公式バイナリパッケージからのインストール、OS 準備、初期化、設定ファイル、複数の起動/停止方法、およびパスワード設定・変更・リセット。"
showToc: true
---

## 01 - データベースサービスのインストールとデプロイ

### 1.1 データベースサーバーパッケージのダウンロード

公式ダウンロード先（過去のアーカイブバイナリパッケージ）：

```bash
# 格納ディレクトリ
[root@master ~]#cd /usr/local/
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

パッケージ情報を確認
```bash
[root@master local]#ll mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
-rw-r--r-- 1 root root 914806904 Jul  2  2021 mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

---

### 1.2 バイナリパッケージからのデータベースサーバーインストール

#### 手順1：OS 環境の準備

##### 1. ネットワークアドレスの確認
```bash
[root@master local]#ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000
    link/ether 00:0c:29:4b:b7:38 brd ff:ff:ff:ff:ff:ff
    inet 11.0.1.101/24 brd 11.0.1.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet6 fe80::20c:29ff:fe4b:b738/64 scope link
       valid_lft forever preferred_lft forever
```

##### 2. ホスト名解決の設定
```bash
[root@master local]#vim /etc/hosts
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
11.0.1.101 master
```

##### 3. システムファイアウォールを無効化
```bash
[root@master local]#systemctl disable firewalld --now
```

##### 4. SELinux を無効化
```bash
[root@master local]#sed -i 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
# 再起動で反映
[root@master local]#reboot
[root@master local]#getenforce
Disabled
```

##### 5. データベースインストール時の競合を回避
```bash
# システムに標準搭載の mariadb が存在するか確認
[root@master local]#rpm -qa | grep mariadb
mariadb-libs-5.5.68-1.el7.x86_64

# システム標準のデータベースパッケージをアンインストール
[root@master local]#yum remove -y mariadb-libs
```

##### 6. データベース依存ソフトをインストール（欠けると初期化エラー）
```bash
[root@master local]#yum install -y libaio-devel
```

---

#### 手順2：データベースソフトウェアのインストール

##### 1. パッケージを展開しシンボリックリンクを作成（バージョン管理用）
```bash
[root@master local]#tar xf mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
[root@master local]#ln -s mysql-8.0.26-linux-glibc2.12-x86_64 mysql
```

##### 2. システム全体の環境変数を設定
```bash
[root@master local]#vim /etc/profile
# ファイル末尾に追加
export PATH=$PATH:/usr/local/mysql/bin
# 設定を反映
[root@master local]#source /etc/profile
```

##### 3. インストールバージョンを確認
```bash
[root@master local]#mysql -V
mysql  Ver 8.0.26 for Linux on x86_64 (MySQL Community Server - GPL)
```

---

#### 手順3：ソフトウェアの初期化

MySQL には2つのコアディレクトリがある：
* **プログラムディレクトリ**: `/usr/local/mysql`
* **データディレクトリ**: `/data/3306/data`（実際のデータを格納）

##### 1. 専用実行ユーザーを作成（システムログイン不要）
```bash
[root@master local]#useradd mysql -M -s /sbin/nologin
```

##### 2. データディレクトリを作成し権限を設定
```bash
[root@master local]#mkdir /data/3306/data -p
[root@master local]#chown mysql.mysql /data/3306/data
```

##### 3. データディレクトリを初期化
```bash
# 存在する可能性のある干渉設定ファイルを削除
[root@master local]#rm -f /etc/my.cnf

# パスワードなし初期化を実行（初期化後管理者はパスワードなし）
[root@master local]#mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
```

---

#### 手順4：データベースサービス設定ファイルの作成

`/etc/my.cnf` を作成・編集：
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
> 注: 設定ファイル内の `basedir` と `datadir` のパスは実際の環境に合わせて調整する。

---

#### 手順5：データベースサービスの起動

##### 1. 公式サービス管理スクリプトで起動
```bash
[root@master local]#cp /usr/local/mysql/support-files/mysql.server /etc/init.d/mysqld
[root@master local]#/etc/init.d/mysqld start
Starting MySQL.Logging to '/data/3306/data/master.err'.
. SUCCESS!
# 正常にデータベースに入れれば起動成功
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

##### 2. コマンドラインから直接起動
* **`mysqld` コマンドで起動**:
  ```bash
  /usr/local/mysql/bin/mysqld --basedir=/usr/local/mysql --datadir=/data/3306/data --user=mysql --socket=/tmp/mysql.sock &
  ```
* **`mysqld_safe` セーフデーモンで起動**:
  ```bash
  /usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data &
  ```

##### 3. systemctl / service で起動
* **方法1**: 専用の Systemd Unit ファイルを作成 (`/etc/systemd/system/mysqld.service`)
* **方法2**: `/etc/init.d/` 配下のサービススクリプトを直接有効化・呼び出し：
  ```bash
  systemctl enable mysqld
  service mysqld start
  # または
  systemctl start mysqld
  ```

---

### 1.3 補足知識

#### 1. 初期化の2つの方法の比較

* **方法1：非セキュア初期化 (`--initialize-insecure`)**
  ```bash
  mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * 特徴: データベース管理者にパスワードがなく、そのままパスワードなしでログインでき、テストやスクリプト初期化に便利。

* **方法2：セキュア初期化 (`--initialize`)**
  ```bash
  mysqld --initialize --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * 特徴: データベース管理者にランダムな一時パスワードが生成され、ログに出力され、初回ログインに使用する。
  * **注意**: 一時パスワードは初回ログイン専用。ログイン後は必ず新しいパスワードを再設定する必要があり、変更前は他の操作を実行できない：
    ```sql
    ALTER USER root@'localhost' IDENTIFIED BY '123456';
    ```

#### 2. 起動失敗の標準トラブルシューティング手順

* **手順1：システム基本環境の確認**
  * SELinux が完全に無効化されているか確認；
  * ポート `3306` が占有されていないか、他の競合するデータベースサービスプロセスが存在しないか確認。
* **手順2：エラーログの調査と分析**
  * 典型的なエラー: `Starting MySQL. ERROR! ... PID file ...`
  * エラーログの詳細を確認：
    ```bash
    cat /data/3306/data/master.err
    # ログエラー例:
    # 2024-06-14T09:15:36.120048Z 1 [ERROR] [MY-012271] [InnoDB] The innodb_system data file 'ibdata1' must be writable
    ```
* **手順3：エラーログがない場合の調査方法**
  * 設定ファイル `/etc/my.cnf` を確認：
    1. 設定ファイルのパスとファイル名が正しいか確認；
    2. 設定ファイル内のパラメータ構文とパス設定が正しいか確認。

---

## 02 - データベースサービスの起動と停止

データベースサービスを起動・停止する方法は複数あり、一般的なものを以下にまとめる：

| 番号 | 起動方法 | 対応する停止方法 | 説明と推奨 |
| :---: | :--- | :--- | :--- |
| **01** | `mysqld &` | `kill` / `pkill` / `killall` | 非推奨；**`kill -9` の使用は厳禁** |
| **02** | `mysqld_safe &` | `kill` / `pkill` / `killall` | 直接 kill は非推奨 |
| **03** | `mysql.server start` | `mysql.server stop` | 公式ネイティブ制御スクリプト |
| **04** | `service mysqld start` | `service mysqld stop` | **推奨**（古典的サービス管理） |
| **05** | `systemctl start mysqld` | `systemctl stop mysqld` | **推奨**（現代 Linux 標準） |
| **06** | クライアント/管理コマンド | `mysqladmin -uroot -pパスワード shutdown` | 管理者がリモート/ローカル命令行から優雅に停止 |
| **07** | SQL セッション内での停止 | 端末で `shutdown;` を実行 | 管理者権限が必要 |

---

## 03 - データベースサービスのパスワード管理

### 1. パスワードがない場合の設定

* **方法1：コマンドライン操作**
  ```bash
  [root@master local]#mysqladmin -uroot password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **方法2：SQL 文の操作**
  
  ```sql
  mysql> ALTER USER root@'localhost' IDENTIFIED BY '000000';
  Query OK, 0 rows affected (0.02 sec)
  ```

---

### 2. 既存パスワードの変更

* **方法1：コマンドライン操作**
  ```bash
  [root@master local]#mysqladmin -uroot -p000000 password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **方法2：SQL 文の操作**
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

### 3. パスワードを忘れた場合（リセット）

#### パスワードリセットの実践手順

* **手順1：データベースサービスを停止**
  
  ```sql
  mysql> shutdown;
  ```
  またはシステム端末で実行：
  ```bash
  [root@master local]#service mysqld stop
  Shutting down MySQL.. SUCCESS!
  # または
  pkill mysqld
  ```
  
* **手順2：セーフモードで起動（権限テーブル読み込みをスキップし、パスワードなしログインを実現）**
  ```bash
  [root@master local]#/usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data --skip-grant-tables --skip-networking &
  [1] 2658
  ```
  *説明*: `--skip-networking` はネットワークリスニングを無効にし、パスワードなし期間中に他のネットワーククライアントが介入するのを防ぐ。
  
* **手順3：パスワードなしでログインし、リセット**
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
  MySQL ターミナルで順に実行：
  ```sql
  -- 1. 権限テーブルをフラッシュ（メモリとディスクの権限テーブルを同期）
  -- 作用1：メモリ上の権限テーブル情報をディスクに同期書き込み
  -- 作用2：ディスク上の権限テーブル情報をメモリに再読み込み
  FLUSH PRIVILEGES;
  
  -- 2. パスワードをリセット
  ALTER USER root@'localhost' IDENTIFIED BY '123456';
  ```
  > **注意**: `FLUSH PRIVILEGES;` を実行せずに `ALTER USER` を直接実行すると、システムがエラーをスローする：
  > ```text
  > ERROR 1290 (HY000): The MySQL server is running with the --skip-grant-tables option so it cannot execute this statement
  > ```
  
* **手順4：データベースサービスを正常に再起動**
  ```bash
  # 一時セーフモードプロセスを終了
  [root@master local]#pkill mysqld
  
  # データベースサービスを正常に起動
  [root@master local]#/etc/init.d/mysqld start
  Starting MySQL.. SUCCESS!
  # または service mysqld start
  ```
  
* **手順5：新しいパスワードでログイン検証**
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
