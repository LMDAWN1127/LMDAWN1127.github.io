---
title: "MySQL 数据库基础管理：用户·权限·连接与初始化配置"
date: 2026-10-14T10:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "MySQL", "数据库", "用户管理", "权限管理"]
showToc: true
summary: "围绕 MySQL 数据库服务的基础管理展开：用户的创建/查询/改密/删除/锁定，权限的授予与回收及 Role 角色，内置客户端/DBeaver/程序三种连接方式，以及源码编译、my.cnf、启动传参三种初始化配置，并对比 MySQL 5.7 与 8.0 的用户管理差异。"
---

## 一.数据库服务用户管理

### 1. 创建数据库用户
用户信息由两部分组成：`'用户名'@'主机域/白名单'`
* **用户名**：用户字符串标识；
* **主机域（白名单）**：限制允许从哪些客户端 IP 或主机连接该用户。连接主机的客户端 IP 必须符合白名单，否则拒绝握手。

主机域白名单的编写形式：

| 类型 | 示例 | 覆盖范围与说明 |
| :--- | :--- | :--- |
| **本地限定** | `root@localhost` | 仅允许本机通过本地 Socket 连接登录 |
| **单机限定** | `root@'11.0.1.101'` | 仅允许指定的某台 IP 主机访问 |
| **网段（掩码形式）** | `root@'11.0.1.0/255.255.255.0'` | 允许 `11.0.1.1 ~ 11.0.1.254` 网段访问。注意：VLSM 子网掩码需长格式指明 |
| **网段（通配符形式）** | `root@'11.0.1.%'` | 匹配该 C 段所有地址 |
| **大网段** | `root@'11.0.%'` | 匹配 `11.0.0.1 ~ 11.0.255.254` 整个 B 段 |
| **部分 IP 通配** | `root@'11.0.1.5%'` | 匹配 `11.0.1.50 ~ 11.0.1.59` |
| **任意主机** | `root@'%'` | 允许所有外部网络主机访问 |

```bash
mysql> create user dawn@'11.0.1.%' identified by '123456';
Query OK, 0 rows affected (0.03 sec)
```

---

### 2. 查询数据库用户信息
```bash
-- 查询所有用户、主机域及加密认证串
mysql> SELECT user, host, authentication_string FROM mysql.user;
+------------------+-----------+------------------------------------------------------------------------+
| user             | host      | authentication_string                                                  |
+------------------+-----------+------------------------------------------------------------------------+
| dawn             | 11.0.1.%  | $A$005$Oe@d?4  6UQC
h%/XEVaaydjHRpm98F7Zj0Yxrpgf0oz09INWeSa2l.AN7 |
| mysql.infoschema | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.session    | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.sys        | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| root             | localhost | $A$005$iqraslXlVV;\_   z_@dB52NA2pwaK37yFR1GffitWH9mHsG.mAT36BqSDhzQL0wA |
+------------------+-----------+------------------------------------------------------------------------+
5 rows in set (0.00 sec)

-- 查看当前登录会话的用户信息
mysql> SELECT user();
+----------------+
| user()         |
+----------------+
| root@localhost |
+----------------+
1 row in set (0.00 sec)
```

---

### 3. 修改数据库用户密码
```bash
mysql> ALTER USER 'dawn'@'11.0.1.%' IDENTIFIED BY '000000';
Query OK, 0 rows affected (0.00 sec)

mysql> SELECT user, host, authentication_string FROM mysql.user;
+------------------+-----------+------------------------------------------------------------------------+
| user             | host      | authentication_string                                                  |
+------------------+-----------+------------------------------------------------------------------------+
| dawn             | 11.0.1.%  | $A$005$        -4w8;QNe]R"D`S/SUP8EwHTypF11Yu0sZCn.3tVzPbHrnEdFFm7WlZOjWEQ8 |
| mysql.infoschema | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.session    | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.sys        | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| root             | localhost | $A$005$iqraslXlVV;\_   z_@dB52NA2pwaK37yFR1GffitWH9mHsG.mAT36BqSDhzQL0wA |
+------------------+-----------+------------------------------------------------------------------------+
5 rows in set (0.00 sec)
```

---

### 4. 删除数据库用户信息
> **生产规范**：在生产环境中严禁随意直接物理删除用户，建议对不再使用的用户进行**账号锁定（Lock）**。

```bash
mysql> SELECT user, host, authentication_string FROM mysql.user;
+------------------+-----------+------------------------------------------------------------------------+
| user             | host      | authentication_string                                                  |
+------------------+-----------+------------------------------------------------------------------------+
| dawn             | 11.0.1.%  | $A$005$        -4w8;QNe]R"D`S/SUP8EwHTypF11Yu0sZCn.3tVzPbHrnEdFFm7WlZOjWEQ8 |
| mysql.infoschema | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.session    | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.sys        | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| root             | localhost | $A$005$iqraslXlVV;\_   z_@dB52NA2pwaK37yFR1GffitWH9mHsG.mAT36BqSDhzQL0wA |
+------------------+-----------+------------------------------------------------------------------------+
5 rows in set (0.00 sec)

mysql> DROP USER 'dawn'@'11.0.1.%';
Query OK, 0 rows affected (0.00 sec)

mysql> SELECT user, host, authentication_string FROM mysql.user;
+------------------+-----------+------------------------------------------------------------------------+
| user             | host      | authentication_string                                                  |
+------------------+-----------+------------------------------------------------------------------------+
| mysql.infoschema | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.session    | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| mysql.sys        | localhost | $A$005$THISISACOMBINATIONOFINVALIDSALTANDPASSWORDTHATMUSTNEVERBRBEUSED |
| root             | localhost | $A$005$iqraslXlVV;\_   z_@dB52NA2pwaK37yFR1GffitWH9mHsG.mAT36BqSDhzQL0wA |
+------------------+-----------+------------------------------------------------------------------------+
4 rows in set (0.00 sec)
```

---

### 5. 锁定与解锁数据库用户
```bash
-- 1. 锁定用户
mysql> ALTER USER 'dawn'@'11.0.1.%' ACCOUNT LOCK;
Query OK, 0 rows affected (0.00 sec)

-- 2. 检查锁定状态（account_locked 列：Y 表示锁定，N 表示正常）
mysql> SELECT user, host, account_locked FROM mysql.user;
+------------------+-----------+----------------+
| user             | host      | account_locked |
+------------------+-----------+----------------+
| dawn             | 11.0.1.%  | Y              |
| mysql.infoschema | localhost | Y              |
| mysql.session    | localhost | Y              |
| mysql.sys        | localhost | Y              |
| root             | localhost | N              |
+------------------+-----------+----------------+
5 rows in set (0.00 sec)

-- 被锁定后登录测试，将报错拒绝访问：
[root@master ~]#mysql -h 11.0.1.101 -P 3306 -u dawn -p
Enter password:
ERROR 3118 (HY000): Access denied for user 'dawn'@'master'. Account is locked.

-- 3. 解锁用户
[root@master ~]#mysql -uroot -p123456
mysql: [Warning] Using a password on the command line interface can be insecure.
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 11
Server version: 8.0.26 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> ALTER USER 'dawn'@'11.0.1.%' ACCOUNT UNLOCK;
Query OK, 0 rows affected (0.00 sec)

mysql> exit
Bye
[root@master ~]#mysql -h 11.0.1.101 -P 3306 -u dawn -p
Enter password:
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 12
Server version: 8.0.26 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.
```

---

### 6. MySQL 5.7 与 8.0 用户管理核心特性区别

#### 区别一：创建与授权语法解耦
* **MySQL 5.7 及早期版本**：一条 `GRANT` 命令可同时隐式完成用户创建、密码设置与权限授予：
  ```sql
  GRANT ALL ON *.* TO 'dawn'@'11.0.1.%' IDENTIFIED BY '123456';
  ```
* **MySQL 8.0**：系统字典全部改为 InnoDB 引擎管理，权限更严格，**必须先 `CREATE USER` 创建用户，再执行 `GRANT` 授权**；`GRANT` 命令废弃了 `IDENTIFIED BY` 子句：
  
  ```sql
  CREATE USER 'dawn'@'11.0.1.%' IDENTIFIED BY '123456';
  GRANT ALL ON *.* TO 'dawn'@'11.0.1.%';
  ```

#### 区别二：默认密码加密插件变更
* **早期版本（5.7）**：默认使用 `mysql_native_password`，兼容性好；
* **新版本（8.0+）**：默认采用 `caching_sha2_password`，安全性更高，但会导致旧版客户端软件（如旧版 Navicat、旧驱动）报错无法登录。

**应对方案**：
* **方案一**：将用户或全局加密插件调整回 `mysql_native_password` 进行向下兼容：
  
  ```sql
  -- 方法 1：新建用户时指定兼容插件
  CREATE USER 'dawn'@'11.0.1.%' IDENTIFIED WITH mysql_native_password BY '123456';
  
  -- 方法 2：修改已有用户的加密插件
  ALTER USER 'dawn'@'11.0.1.%' IDENTIFIED WITH mysql_native_password BY '123456';
  ```
  ```ini
  # 方法 3：修改 /etc/my.cnf 全局默认配置
  [mysqld]
  default_authentication_plugin=mysql_native_password
  ```
* **方案二**：升级应用系统的数据库连接驱动版本，全面支持 `caching_sha2_password`。

---

## 二. 数据库服务权限管理

### 1. 核心权限与系统视图
查看数据库支持的所有权限类型：
```sql
SHOW PRIVILEGES;
```

| 序号 | 输出列名 | 解释说明 |
| :---: | :--- | :--- |
| **01** | `Privilege` | 授权权限名称（如 SELECT, INSERT 等） |
| **02** | `Context` | 权限作用的资源范围级别（Databases, Tables, Columns 等） |
| **03** | `Comment` | 对该权限实际功能的描述说明 |

核心关键权限详解：

| 序号 | 权限名称 | 授权资源 | 解释说明 |
| :---: | :--- | :--- | :--- |
| **01** | **Select** | Tables | 查询数据表中的数据 |
| **02** | **Insert** | Tables | 插入/写入新数据 |
| **03** | **Update** | Tables | 修改已存在的数据 |
| **04** | **Delete** | Tables | 删除数据记录 |
| **05** | **Alter** | Tables | 修改表结构（添加/修改字段、索引属性等） |
| **06** | **Index** | Tables | 创建或删除索引 |
| **07** | **Create** | Databases, Tables | 创建新数据库或数据表 |
| **08** | **Drop** | Databases, Tables | 删除数据库或数据表（高危操作） |

> **注**：`ALL PRIVILEGES` 拥有除 `GRANT OPTION`（给其他用户赋权能力）之外的所有权限；普通管理员切忌赋予 `WITH GRANT OPTION`。

权限在元数据表中的存储层级：

| 序号 | 授权表名称 | 存储范围与级别 |
| :---: | :--- | :--- |
| **01** | `mysql.user` | 用户全局级别权限（`*.*`），最高作用域 |
| **02** | `mysql.db` | 数据库级别权限（`db.*`） |
| **03** | `mysql.tables_priv` | 数据表级别权限（`db.table`） |
| **04** | `mysql.columns_priv`| 字段列级别权限（细粒度） |

---

### 2. 用户授权与权限回收实战

```sql
-- 授权基本语法：
-- GRANT 权限列表 ON 作用范围 TO '用户'@'主机域';

-- 1. 全局授权（*.*）
GRANT ALL ON *.* TO 'dawn'@'11.0.1.%';

-- 2. 库级授权（dawn.*）
GRANT SELECT, INSERT, UPDATE, DELETE ON dawn.* TO 'dawn'@'11.0.1.%';

-- 3. 表级授权（dawn.t1）
GRANT SELECT ON dawn.t1 TO 'dawn'@'11.0.1.%';

-- 4. 查看指定用户的权限
SHOW GRANTS FOR 'dawn'@'11.0.1.%';

-- 5. 回收权限
REVOKE DELETE ON *.* FROM 'dawn'@'11.0.1.%';
```

用户常规授权实战（最小权限原则）：

```bash
-- 业务场景对应权限：
-- 浏览页面 -> SELECT
-- 发表内容 -> INSERT
-- 修改内容 -> UPDATE
-- 删除内容 -> DELETE

-- 创建独立业务库并按最小权限赋权
mysql> CREATE DATABASE dawn;
Query OK, 1 row affected (0.00 sec)
mysql> USE dawn;
Database changed
mysql> CREATE TABLE t1 (
    ->   id INT PRIMARY KEY AUTO_INCREMENT,
    ->   name VARCHAR(50)
    -> );
Query OK, 0 rows affected (0.03 sec)
mysql> create user dawn@'11.0.1.%' identified by '123456';
Query OK, 0 rows affected (0.01 sec)
mysql> GRANT SELECT, INSERT, UPDATE, DELETE ON dawn.* TO 'dawn'@'11.0.1.%';
Query OK, 0 rows affected (0.00 sec)
```

---

### 3. MySQL 8.0 新特性：Role（角色）管理

8.0 引入了角色（Role）机制，允许将一组常用权限打包为一个逻辑角色实体，批量赋予多个用户，极大简化了用户权限维护成本。

```sql
-- 1. 创建角色（可创建读写角色与只读角色）
mysql> CREATE ROLE 'dawn_rw', 'dawn_r';
Query OK, 0 rows affected (0.00 sec)

-- 2. 为角色分配权限
mysql> GRANT SELECT ON dawn.* TO 'dawn_r';
Query OK, 0 rows affected (0.00 sec)

mysql> GRANT SELECT, UPDATE, INSERT, DELETE ON dawn.* TO 'dawn_rw';
Query OK, 0 rows affected (0.00 sec)

-- 3. 创建测试用户并将角色赋予用户
mysql> CREATE USER 'user01'@'%' IDENTIFIED BY '123456';
Query OK, 0 rows affected (0.00 sec)
mysql> CREATE USER 'user02'@'%' IDENTIFIED BY '123456';
Query OK, 0 rows affected (0.01 sec)

mysql> GRANT 'dawn_r' TO 'user01'@'%';
Query OK, 0 rows affected (0.00 sec)
mysql> GRANT 'dawn_rw' TO 'user02'@'%';
Query OK, 0 rows affected (0.00 sec)

-- 4. 激活角色
-- 方式一：管理员指定默认生效角色
mysql> SET DEFAULT ROLE ALL TO 'user01'@'%';
Query OK, 0 rows affected (0.00 sec)
mysql> SET DEFAULT ROLE ALL TO 'user02'@'%';
Query OK, 0 rows affected (0.00 sec)

-- 方式二：全局配置自动激活角色（登录时生效）
SET GLOBAL activate_all_roles_on_login = ON;

-- 5. 验证角色与权限拦截
-- 以 user01 登录后查看激活角色：
mysql> SELECT CURRENT_USER(), CURRENT_ROLE();
+----------------+----------------+
| CURRENT_USER() | CURRENT_ROLE() |
+----------------+----------------+
| user01@%       | `dawn_r`@`%`   |
+----------------+----------------+
1 row in set (0.00 sec)
-- 此时 user01 执行 INSERT 操作将被严格拦截：
mysql> USE dawn;
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Database changed
mysql> SHOW TABLES;
+----------------+
| Tables_in_dawn |
+----------------+
| t1             |
+----------------+
1 row in set (0.00 sec)

mysql> SELECT * FROM t1;
Empty set (0.00 sec)

mysql> INSERT INTO t1 VALUES (1);
ERROR 1142 (42000): INSERT command denied to user 'user01'@'master' for table 't1'
```

---

## 三. 数据库服务连接管理

### 方式一：内置客户端命令行连接
1. **本地 Socket 方式连接**：
   
   仅适用于本机访问，通过本地 Unix Domain Socket 文件（如 `/tmp/mysql.sock`）直接通信，速度极快；
   
   命令：`mysql -uroot -p123456 -S /tmp/mysql.sock`
2. **TCP/IP 网络方式连接**：
   
   适用于远程或跨主机访问，需显式指明 `-h` IP 与 `-P` 端口；
   
   命令：`mysql -uroot -p123456 -h 11.0.1.101 -P 3306`

---

### 方式二：远程图形化工具管理（DBeaver）

利用DBeaver等远程管理客户端，可视化操作与维护数据库对象。

DBeaver基础管理流程：

1. **新建 MySQL 连接与连接测试**：
   输入主机 IP、端口、用户名与密码，点击测试连接确保网络互通。

![image-20261014130537342](/images/mysql-database-basic-management-image-20261014130537342.png)

![image-20261013213153955](/images/mysql-database-basic-management-image-20261013213153955.png)

```bash
这个 Public Key Retrieval is not allowed 错误是 DBeaver 连接 MySQL 8.0+ 时很常见的问题，通常是因为 MySQL 8.0 默认使用了 caching_sha2_password 认证插件，而 JDBC 驱动出于安全考虑，默认禁止从服务器获取公钥。

解决方案：在 DBeaver 中修改驱动属性
最直接的方法是修改 DBeaver 的驱动属性，在连接配置中允许公钥检索。
打开连接设置：在 DBeaver 左侧的“数据库导航器”中，右键点击你的 dawn 连接，选择 “编辑连接”。
进入驱动属性：在弹出的设置窗口中，切换到 “驱动属性” 选项卡。
添加属性：在属性列表中，右键选择 “添加新属性”，或直接在下方空白处双击添加。
设置参数：添加以下两个属性：
属性名：allowPublicKeyRetrieval，值：true。
属性名：useSSL，值：false（如果你的网络环境可信，这是为了快速连接；如果生产环境需要加密，请保持 true 并配置好 SSL 证书）。
保存并测试：点击 “确定” 保存设置，然后再次点击 “测试连接”，应该就能成功了。

备选方案：修改 MySQL 用户认证方式
如果不想在客户端修改参数，也可以从服务端入手，将用户的认证插件改为 mysql_native_password。
ALTER USER 'dawn'@'11.0.1.%' IDENTIFIED WITH mysql_native_password BY '123456';
FLUSH PRIVILEGES;
执行后，DBeaver 端可以不用修改 allowPublicKeyRetrieval 属性，直接连接即可。

# 安全提示
开启 allowPublicKeyRetrieval=true 会存在中间人攻击（MITM）的风险，因为客户端会通过不安全的连接向服务器索取公钥。因此，该设置仅建议在受信任的本地或内网开发环境中使用。在生产环境中，更安全的做法是配置 SSL/TLS 加密连接，或者使用 mysql_native_password 认证插件。
```

```bash
mysql> CREATE USER 'root'@'11.0.1.%' IDENTIFIED BY '123456';
Query OK, 0 rows affected (0.00 sec)

mysql> GRANT ALL PRIVILEGES ON *.* TO 'root'@'11.0.1.%' WITH GRANT OPTION;
Query OK, 0 rows affected (0.02 sec)

mysql> FLUSH PRIVILEGES;
Query OK, 0 rows affected (0.00 sec)

mysql> exit
Bye
[root@master ~]#mysql -uroot -p
Enter password:
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 15
Server version: 8.0.26 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> SELECT user, host FROM mysql.user WHERE user='root';
+------+-----------+
| user | host      |
+------+-----------+
| root | 11.0.1.%  |
| root | localhost |
+------+-----------+
2 rows in set (0.00 sec)
```

![image-20261014130933058](/images/mysql-database-basic-management-image-20261014130933058.png)

2. **图形化界面与创建数据库**：
   选择连接，右键新建数据库，指定数据库名称、字符集（推荐 `utf8mb4`）与排序规则（`utf8mb4_general_ci` 或 `utf8mb4_bin`）。

![image-20261014131149854](/images/mysql-database-basic-management-image-20261014131149854.png)

3. **创建数据表与表结构设计**：
   设置字段名、数据类型、长度、是否为主键、自增属性等。

![image-20261014132822642](/images/mysql-database-basic-management-image-20261014132822642.png)

4. **插入与维护数据项**：

![image-20261014134427458](/images/mysql-database-basic-management-image-20261014134427458.png)

---

### 方式三：程序代码连接数据库

应用程序通过特定编程语言的数据库驱动接口与 MySQL 服务端通信。

| 序号 | 开发语言 | 常见连接数据库驱动程序 |
| :---: | :--- | :--- |
| **01** | **Python** | `pymysql`、`mysql-connector-python` |
| **02** | **Go (Golang)** | `go-sql-driver/mysql` |
| **03** | **Java** | `mysql-connector-java` (JAR 包 / JDBC) |
| **04** | **PHP** | `mysqli`、`pdo_mysql` |

> 驱动官方下载地址：https://dev.mysql.com/downloads/

![程序代码连接数据库驱动程序架构](Day01-数据库课程教案_images/page_23_30.png)

![数据库服务连接管理方式逻辑图](Day01-数据库课程教案_images/page_23_31.png)

---

## 四. 数据库服务初始配置

### 初始化配置方式一：源码编译时指定参数
在源码编译阶段通过 CMake 参数对数据库功能进行深度固化定制：
```bash
# 源码依赖准备
yum -y install wget cmake gcc gcc-c++ ncurses ncurses-devel libaio-devel openssl openssl-devel

# 下载与解压带 boost 的源码包
tar zxf mysql-boost-8.0.12.tar.gz -C /usr/local/

# CMake 编译参数配置
cd /usr/local/src/mysql-8.0.12
cmake . -DCMAKE_INSTALL_PREFIX=/usr/local/mysql8.0 -DMYSQL_DATADIR=/usr/local/mysql/data -DDOWNLOAD_BOOST=1 -DWITH_BOOST=/usr/local/mysql-8.0.12/ -DSYSCONFDIR=/etc -DWITH_INNOBASE_STORAGE_ENGINE=1 -DWITH_PARTITION_STORAGE_ENGINE=1 -DWITH_FEDERATED_STORAGE_ENGINE=1 -DWITH_BLACKHOLE_STORAGE_ENGINE=1 -DWITH_MYISAM_STORAGE_ENGINE=1 -DWITH_EMBEDDED_SERVER=1 -DENABLE_DTRACE=0 -DENABLED_LOCAL_INFILE=1 -DDEFAULT_CHARSET=utf8mb4

make -j$(nproc) && make install
```

---

### 初始化配置方式二：编写与修改 `/etc/my.cnf` 配置文件

配置文件读取加载顺序：

通过 `mysqld --help --verbose | grep my.cnf` 可查看配置文件的搜索顺序：
```text
/etc/my.cnf -> /etc/mysql/my.cnf -> /usr/local/mysql/etc/my.cnf -> ~/.my.cnf
```
> 注：若同一参数在多个配置文件中出现，**后加载的配置会覆盖先加载的配置**。若启动时使用 `--defaults-file=/path/to/my.cnf`，则只加载该指定文件。

配置文件结构规范：

* **带 `[]` 部分**：配置标签区（Group），区分服务端与客户端生效作用域：
  * 服务端标签：`[mysqld]`、`[mysqld_safe]`、`[server]`
  * 客户端标签：`[mysql]`、`[mysqldump]`、`[client]`（只影响本地客户端连接）
* **不带 `[]` 部分**：具体键值对参数（`key=value`）

核心常用配置参数详解：

| 标签 | 参数配置项 | 解释说明 |
| :--- | :--- | :--- |
| `[mysqld]` | `user=mysql` | 守护进程的系统运行用户 |
| `[mysqld]` | `basedir=/usr/local/mysql` | MySQL 软件程序根目录 |
| `[mysqld]` | `datadir=/data/3306/data` | 数据文件持久化存放路径 |
| `[mysqld]` | `server_id=6` | 数据库实例全局唯一标识节点编号（主从复制集群必须唯一） |
| `[mysqld]` | `port=3306` | 服务端监听网络端口 |
| `[mysqld]` | `socket=/tmp/mysql.sock` | 本地通信 Unix Socket 文件路径 |
| `[mysqld]` | `default_authentication_plugin=mysql_native_password` | 指定默认认证插件（用于向下兼容旧客户端） |
| `[mysql]` | `socket=/tmp/mysql.sock` | 本地客户端连接使用的 Socket 文件路径 |

---

### 初始化配置方式三：启动命令行传参
启动命令所附带的参数（如 `mysqld_safe --skip-grant-tables --skip-networking &`）具备最高优先级，会直接覆盖配置文件中的预设值。
