---
title: "systemd 서비스 관리와 MySQL 멀티버전 배포"
date: 2026-10-03T17:11:00+08:00
draft: false
categories: ["MySQL"]
tags: ["MySQL", "systemd", "멀티버전 배포"]
summary: "systemd Unit 관리와 MySQL 5.6/5.7 멀티버전·다중 인스턴스 배포 실전: 두 가지 운영 데몬 구성, 아카이브 다운로드, 초기화, 인스턴스별 설정 파일 작성, 그리고 시작/중지 및 3개 서비스 상태 검증."
showToc: true
---

#### 01 - systemctl 데이터베이스 Service 파일 정리

##### 방안 1: 표준 운영 데몬 구성

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

##### 방안 2: 설정 파일 및 파일 핸들 제한 포함

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

수정 완료 후

```bash
[root@master local]#systemctl daemon-reload
[root@master local]#systemctl restart mysqld.service
[root@master local]#systemctl enable  mysqld.service
```



#### 02 - 멀티버전 MySQL (5.6 / 5.7) 설치 및 업그레이드 준비 실전

##### 1단계: 소프트웨어 아카이브 다운로드

```bash
# MySQL 5.7.40 바이너리 패키지
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz

# MySQL 5.6.48 바이너리 패키지
[root@master local]#wget https://downloads.mysql.com/archives/get/p/23/file/mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
```

##### 2단계: 압축 해제, 설치 및 심볼릭 링크 생성

```bash
# 5.7 버전 설치
[root@master local]#tar xf mysql-5.7.40-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.7.40-linux-glibc2.12-x86_64 mysql57
# 참고: 멀티버전 공존 디버깅 기간에는 전역 환경변수를 아직 설정하지 말고 명령 경로 충돌 방지

# 5.6 버전 설치
[root@master local]#tar xf mysql-5.6.48-linux-glibc2.12-x86_64.tar.gz
[root@master local]#ln -s mysql-5.6.48-linux-glibc2.12-x86_64 mysql56
# 참고: 당분간 전역 환경변수 설정하지 않음
```

##### 3단계: 데이터베이스 소프트웨어 초기화

* **MySQL 5.7 초기화 (데이터 디렉터리 3357):**

  ```bash
  [root@master local]#mkdir -p /data/3357/data
  [root@master local]#chown -R mysql.mysql /data/3357/data
  [root@master local]#/usr/local/mysql57/bin/mysqld --initialize-insecure --user=mysql --datadir=/data/3357/data --basedir=/usr/local/mysql57
  [root@master local]#echo $?
  0
  ```

* **MySQL 5.6 초기화 (데이터 디렉터리 3356):**

  ```bash
  [root@master local]#mkdir -p /data/3356/data
  [root@master local]#chown -R mysql.mysql /data/3356/data
  [root@master local]#/usr/local/mysql56/scripts/mysql_install_db --user=mysql --datadir=/data/3356/data --basedir=/usr/local/mysql56
  FATAL ERROR: please install the following Perl modules before executing /usr/local/mysql56/scripts/mysql_install_db:
  Data::Dumper
  # Perl 모듈 누락
  [root@master local]#yum install -y perl-Data-Dumper
  [root@master local]#/usr/local/mysql56/scripts/mysql_install_db --user=mysql --datadir=/data/3356/data --basedir=/usr/local/mysql56
  # 출력에 OK 두 개가 포함되는지 확인하고 종료 코드를 확인:
  [root@master local]#echo $?
  0
  ```

##### 4단계: 다중 인스턴스 전용 설정 파일 작성

* **MySQL 5.7 (인스턴스 3357) 설정**:

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

* **MySQL 5.6 (인스턴스 3356) 설정**:

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

##### 5단계: 실행, 시작 및 관리 검증

* **MySQL 5.7 서비스 시작/중지**:

  ```bash
  # 방식 1: 시작
  [root@master local]#cp /usr/local/mysql57/support-files/mysql.server /etc/init.d/mysqld57
  [root@master local]#chmod +x /etc/init.d/mysqld57
  [root@master local]#/etc/init.d/mysqld57 start
  [root@master local]#/etc/init.d/mysqld57 stop
  
  # 방식 2: 시작
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3357.service
  [root@master local]#systemctl enable mysqld3357.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3357.service to /usr/lib/systemd/system/mysqld3357.service.
  ```

* **MySQL 5.6 서비스 시작/중지**:

  ```bash
  # 방식 1: 시작
  [root@master local]#cp /usr/local/mysql56/support-files/mysql.server /etc/init.d/mysqld56
  [root@master local]#chmod +x /etc/init.d/mysqld56
  [root@master local]#/etc/init.d/mysqld56 start
  [root@master local]#/etc/init.d/mysqld56 stop
  
  # 방식 2: 시작
  [root@master local]#systemctl daemon-reload
  [root@master local]#systemctl start mysqld3356.service
  [root@master local]#systemctl enable mysqld3356.service
  Created symlink from /etc/systemd/system/multi-user.target.wants/mysqld3356.service to /usr/lib/systemd/system/mysqld3356.service.
  ```

세 서비스 상태 검증 (모두 running)

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
