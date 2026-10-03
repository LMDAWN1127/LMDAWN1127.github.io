---
title: "MySQL 실전: 바이너리 설치, 시작/중지, 비밀번호 관리"
date: 2026-10-03T14:53:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "데이터베이스", "바이너리 설치"]
summary: "MySQL 8.0 운영 실전: 공식 바이너리 패키지 설치, OS 준비, 초기화, 설정 파일, 다양한 시작/중지 방법, 그리고 비밀번호 설정/변경/분실 시 재설정."
showToc: true
---

## 01 - 데이터베이스 서비스 설치 및 배포

### 1.1 데이터베이스 서버 패키지 다운로드

공식 다운로드 주소 (역사 보관 바이너리 설치 패키지):

```bash
# 저장 디렉터리
[root@master ~]#cd /usr/local/
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

설치 패키지 정보 확인
```bash
[root@master local]#ll mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
-rw-r--r-- 1 root root 914806904 Jul  2  2021 mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
```

---

### 1.2 바이너리 패키지로 데이터베이스 서버 설치

#### 1단계: 운영체제 환경 준비

##### 1. 네트워크 주소 확인
```bash
[root@master local]#ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000
    link/ether 00:0c:29:4b:b7:38 brd ff:ff:ff:ff:ff:ff
    inet 11.0.1.101/24 brd 11.0.1.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet6 fe80::20c:29ff:fe4b:b738/64 scope link
       valid_lft forever preferred_lft forever
```

##### 2. 호스트명 해석 설정
```bash
[root@master local]#vim /etc/hosts
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
11.0.1.101 master
```

##### 3. 시스템 방화벽 비활성화
```bash
[root@master local]#systemctl disable firewalld --now
```

##### 4. SELinux 비활성화
```bash
[root@master local]#sed -i 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
# 재부팅 적용
[root@master local]#reboot
[root@master local]#getenforce
Disabled
```

##### 5. 데이터베이스 설치 시 충돌 방지
```bash
# 시스템에 기본 포함된 mariadb가 있는지 확인
[root@master local]#rpm -qa | grep mariadb
mariadb-libs-5.5.68-1.el7.x86_64

# 시스템 기본 데이터베이스 패키지 제거
[root@master local]#yum remove -y mariadb-libs
```

##### 6. 데이터베이스 의존 소프트웨어 설치 (누락 시 초기화 오류)
```bash
[root@master local]#yum install -y libaio-devel
```

---

#### 2단계: 데이터베이스 소프트웨어 설치

##### 1. 패키지 압축 해제 및 심볼릭 링크 생성 (버전 관리 용이)
```bash
[root@master local]#tar xf mysql-8.0.26-linux-glibc2.12-x86_64.tar.xz
[root@master local]#ln -s mysql-8.0.26-linux-glibc2.12-x86_64 mysql
```

##### 2. 시스템 전역 환경변수 설정
```bash
[root@master local]#vim /etc/profile
# 파일 끝에 추가
export PATH=$PATH:/usr/local/mysql/bin
# 설정 적용
[root@master local]#source /etc/profile
```

##### 3. 설치 버전 확인
```bash
[root@master local]#mysql -V
mysql  Ver 8.0.26 for Linux on x86_64 (MySQL Community Server - GPL)
```

---

#### 3단계: 소프트웨어 초기화

MySQL 의 핵심 디렉터리 두 개:
* **프로그램 디렉터리**: `/usr/local/mysql`
* **데이터 디렉터리**: `/data/3306/data` (실제 데이터 저장)

##### 1. 전용 실행 사용자 생성 (시스템 로그인 불필요)
```bash
[root@master local]#useradd mysql -M -s /sbin/nologin
```

##### 2. 데이터 저장 디렉터리 생성 및 권한 부여
```bash
[root@master local]#mkdir /data/3306/data -p
[root@master local]#chown mysql.mysql /data/3306/data
```

##### 3. 데이터 디렉터리 초기화 실행
```bash
# 존재할 수 있는 간섭 설정 파일 제거
[root@master local]#rm -f /etc/my.cnf

# 비밀번호 없이 초기화 실행 (초기화 후 관리자 비밀번호 없음)
[root@master local]#mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
```

---

#### 4단계: 데이터베이스 서비스 설정 파일 작성

`/etc/my.cnf` 생성 및 편집:
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
> 참고: 설정 파일의 `basedir` 및 `datadir` 경로는 실제 환경에 맞게 조정해야 함.

---

#### 5단계: 데이터베이스 서비스 시작

##### 1. 공식 서비스 관리 스크립트로 시작
```bash
[root@master local]#cp /usr/local/mysql/support-files/mysql.server /etc/init.d/mysqld
[root@master local]#/etc/init.d/mysqld start
Starting MySQL.Logging to '/data/3306/data/master.err'.
. SUCCESS!
# 정상적으로 데이터베이스에 접속하면 시작 성공
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

##### 2. 명령줄에서 직접 시작
* **`mysqld` 명령으로 시작**:
  ```bash
  /usr/local/mysql/bin/mysqld --basedir=/usr/local/mysql --datadir=/data/3306/data --user=mysql --socket=/tmp/mysql.sock &
  ```
* **`mysqld_safe` 안전 데몬으로 시작**:
  ```bash
  /usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data &
  ```

##### 3. systemctl / service 로 시작
* **방법 1**: 전용 Systemd Unit 파일 작성 (`/etc/systemd/system/mysqld.service`)
* **방법 2**: `/etc/init.d/` 디렉터리의 서비스 스크립트를 직접 활성화 및 호출:
  ```bash
  systemctl enable mysqld
  service mysqld start
  # 또는
  systemctl start mysqld
  ```

---

### 1.3 보충 지식

#### 1. 초기화 방법 두 가지 비교

* **방법 1: 비보안 초기화 (`--initialize-insecure`)**
  ```bash
  mysqld --initialize-insecure --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * 특징: DB 관리자에게 비밀번호가 없어 바로 비밀번호 없이 로그인 가능하며, 테스트나 스크립트 초기화에 편리.

* **방법 2: 보안 초기화 (`--initialize`)**
  ```bash
  mysqld --initialize --user=mysql --datadir=/data/3306/data --basedir=/usr/local/mysql
  ```
  * 특징: DB 관리자에게 무작위 임시 비밀번호가 생성되어 로그에 출력되며, 최초 로그인에 사용.
  * **주의**: 임시 비밀번호는 최초 로그인 전용이며, 로그인 후 반드시 새 비밀번호로 재설정해야 하며 변경 전에는 다른 작업을 실행할 수 없음:
    ```sql
    ALTER USER root@'localhost' IDENTIFIED BY '123456';
    ```

#### 2. 데이터베이스 시작 실패 표준 해결 절차

* **1단계: 시스템 기본 환경 확인**
  * SELinux 가 완전히 비활성화되었는지 확인;
  * 포트 `3306` 이 점유되지 않았는지, 다른 충돌하는 데이터베이스 서비스 프로세스가 있는지 확인.
* **2단계: 오류 로그 조사 및 분석**
  * 전형적인 오류: `Starting MySQL. ERROR! ... PID file ...`
  * 오류 로그 상세 확인:
    ```bash
    cat /data/3306/data/master.err
    # 로그 오류 예시:
    # 2024-06-14T09:15:36.120048Z 1 [ERROR] [MY-012271] [InnoDB] The innodb_system data file 'ibdata1' must be writable
    ```
* **3단계: 오류 로그가 없을 때 조사 방법**
  * 설정 파일 `/etc/my.cnf` 확인:
    1. 설정 파일 경로와 파일 이름이 올바른지 확인;
    2. 설정 파일 내부 파라미터 구문 및 경로 설정이 올바른지 확인.

---

## 02 - 데이터베이스 서비스 시작 및 중지

데이터베이스 서비스를 시작하고 중지하는 방법은 여러 가지이며, 일반적인 방법을 아래에 정리함:

| 번호 | 시작 방법 | 해당 중지 방법 | 설명 및 권장 |
| :---: | :--- | :--- | :--- |
| **01** | `mysqld &` | `kill` / `pkill` / `killall` | 비권장; **`kill -9` 사용 엄금** |
| **02** | `mysqld_safe &` | `kill` / `pkill` / `killall` | 직접 kill 비권장 |
| **03** | `mysql.server start` | `mysql.server stop` | 공식 기본 제어 스크립트 |
| **04** | `service mysqld start` | `service mysqld stop` | **권장** (고전 서비스 관리) |
| **05** | `systemctl start mysqld` | `systemctl stop mysqld` | **권장** (현대 Linux 표준) |
| **06** | 클라이언트/관리 명령 | `mysqladmin -uroot -p비밀번호 shutdown` | 관리자가 원격 또는 로컬 명령줄에서 정상 종료 |
| **07** | SQL 세션 내 종료 | 터미널에서 `shutdown;` 실행 | 관리자 권한 필요 |

---

## 03 - 데이터베이스 서비스 비밀번호 관리

### 1. 비밀번호가 없을 때 설정

* **방법 1: 명령줄 이용**
  ```bash
  [root@master local]#mysqladmin -uroot password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **방법 2: SQL 문 이용**
  
  ```sql
  mysql> ALTER USER root@'localhost' IDENTIFIED BY '000000';
  Query OK, 0 rows affected (0.02 sec)
  ```

---

### 2. 기존 비밀번호 변경

* **방법 1: 명령줄 이용**
  ```bash
  [root@master local]#mysqladmin -uroot -p000000 password '123456'
  mysqladmin: [Warning] Using a password on the command line interface can be insecure.
  Warning: Since password will be sent to server in plain text, use ssl connection to ensure password safety.
  ```
* **방법 2: SQL 문 이용**
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

### 3. 비밀번호를 잊어버린 경우 (비밀번호 재설정)

#### 비밀번호 재설정 실전 절차

* **1단계: 데이터베이스 서비스 중지**
  
  ```sql
  mysql> shutdown;
  ```
  또는 시스템 터미널에서 실행:
  ```bash
  [root@master local]#service mysqld stop
  Shutting down MySQL.. SUCCESS!
  # 또는
  pkill mysqld
  ```
  
* **2단계: 안전 모드로 시작 (권한 테이블 로드 건너뛰기로 비밀번호 없이 로그인)**
  ```bash
  [root@master local]#/usr/local/mysql/bin/mysqld_safe --datadir=/data/3306/data --skip-grant-tables --skip-networking &
  [1] 2658
  ```
  *설명*: `--skip-networking` 은 네트워크 수신을 비활성화하여 비밀번호 없는 동안 다른 네트워크 클라이언트의 개입을 방지함.
  
* **3단계: 비밀번호 없이 로그인 후 재설정**
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
  MySQL 터미널에서 순서대로 실행:
  ```sql
  -- 1. 권한 테이블 리플러시 (메모리와 디스크의 권한 테이블 동기화)
  -- 작용1: 메모리의 권한 테이블 정보를 디스크에 동기화 기록
  -- 작용2: 디스크의 권한 테이블 정보를 메모리로 재로드
  FLUSH PRIVILEGES;
  
  -- 2. 비밀번호 재설정
  ALTER USER root@'localhost' IDENTIFIED BY '123456';
  ```
  > **주의**: `FLUSH PRIVILEGES;` 를 실행하지 않고 `ALTER USER` 를 바로 실행하면 시스템이 오류를 발생:
  > ```text
  > ERROR 1290 (HY000): The MySQL server is running with the --skip-grant-tables option so it cannot execute this statement
  > ```
  
* **4단계: 데이터베이스 서비스 정상 재시작**
  ```bash
  # 임시 안전 모드 프로세스 종료
  [root@master local]#pkill mysqld
  
  # 데이터베이스 서비스 정상 시작
  [root@master local]#/etc/init.d/mysqld start
  Starting MySQL.. SUCCESS!
  # 또는 service mysqld start
  ```
  
* **5단계: 새 비밀번호로 로그인 검증**
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
