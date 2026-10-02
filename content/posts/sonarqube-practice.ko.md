---
title: "SonarQube 실전: 사설 배포, 토큰 설정, 코드 품질 스캔"
date: 2026-10-02T14:12:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "SonarQube", "CI/CD"]
summary: "SonarQube 을 사설로 배포하는 실전 가이드: JDK8/MySQL5.6 설치, 플러그인 포함 압축 해제, 비 root 사용자 실행, 웹 토큰 설정, sonar-scanner 클라이언트 코드 스캔."
showToc: true
---

## 01. SonarQube 소개

```bash
1. SonarQube 은 Java 로 개발되었으며 Open JDK 8 이 필요
2. SonarQube 은 MySQL 데이터베이스에 의존하며 최소 5.6 이상
3. SonarQube 소규모 인스턴스는 최소 4G, 대규모 인스턴스는 16G 메모리 필요
```

## 02. 배포

### 1. JDK 실행 환경 설치

```bash
[root@sonarqube ~]#ll
total 166040
-rw-r--r-- 1 root root 170023183 Oct  1 22:32 jdk-8u181-linux-x64.rpm
[root@sonarqube ~]#rpm -ivh jdk-8u181-linux-x64.rpm
warning: jdk-8u181-linux-x64.rpm: Header V3 RSA/SHA256 Signature, key ID ec551f03: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jdk1.8-2000:1.8.0_181-fcs        ################################# [100%]
Unpacking JAR files...
        tools.jar...
        plugin.jar...
        javaws.jar...
        deploy.jar...
        rt.jar...
        jsse.jar...
        charsets.jar...
        localedata.jar...
```

### 2. 데이터베이스 설치

```bash
# 1. MySQL 공식 Yum 저장소 설정 파일 다운로드
[root@sonarqube ~]#wget dev.mysql.com/get/mysql-community-release-el6-5.noarch.rpm
 
# 2. MySQL 저장소 설치
[root@sonarqube ~]#rpm -ivh mysql-community-release-el6-5.noarch.rpm
Preparing...                          ################################# [100%]
Updating / installing...
   1:mysql-community-release-el6-5    ################################# [100%]
 
# 3. MySQL 서버 설치
[root@sonarqube ~]# yum install mysql-community-server -y
[root@sonarqube ~]#mysql --version
mysql  Ver 14.14 Distrib 5.6.51, for Linux (x86_64) using  EditLine wrapper

# 4. MySQL 서비스 시작
[root@sonarqube ~]#service mysqld start
Starting mysqld (via systemctl):
                                                           [  OK  ]
[root@sonarqube ~]#netstat -ntpl
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:25            0.0.0.0:*               LISTEN      1227/master
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1008/sshd
tcp6       0      0 ::1:25                  :::*                    LISTEN      1227/master
tcp6       0      0 :::3306                 :::*                    LISTEN      3113/mysqld
tcp6       0      0 :::22                   :::*                    LISTEN      1008/sshd

# 5. 비밀번호 설정
[root@sonarqube ~]# mysqladmin -uroot password 000000

# 6. sonarqube 데이터베이스 생성
[root@sonarqube ~]# mysql -uroot -p000000 -e "CREATE DATABASE sonarqube DEFAULT CHARACTER SET utf8;"

[root@sonarqube ~]#mysql -u root -p000000 -e "show databases"
Warning: Using a password on the command line interface can be insecure.
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sonarqube          |
+--------------------+
```

### 3. SonarQube 설치

```bash
# 1. SonarQube 패키지 업로드
[root@sonarqube ~]# cd /usr/local/
[root@sonarqube local]#ll sonarqube-7.0.zip
-rw-r--r-- 1 root root 155709573 Oct  1 22:50 sonarqube-7.0.zip

# 2. 현재 디렉터리에 압축 해제
[root@sonarqube local]#yum install -y unzip
[root@sonarqube local]# unzip sonarqube-7.0.zip
[root@sonarqube local]# ln -s sonarqube-7.0 sonarqube

# 3. 플러그인 설치: 
기본 플러그인 삭제:
[root@sonarqube ~]# rm -rf /usr/local/sonarqube/extensions/plugins/*

플러그인 업로드:
[root@sonarqube ~]#ll sonar_plugins.tar.gz
-rw-r--r-- 1 root root 45106788 Oct  1 22:56 sonar_plugins.tar.gz
[root@sonarqube ~]#tar xf sonar_plugins.tar.gz -C /usr/local/sonarqube/extensions/plugins/
[root@sonarqube ~]#ll /usr/local/sonarqube/extensions/plugins/
total 4
drwxr-xr-x 2 1000 1000 4096 Oct 24  2019 plugins
[root@sonarqube ~]# cd /usr/local/sonarqube/extensions/plugins/
[root@sonarqube plugins]# mv plugins/* .
[root@sonarqube plugins]#rm -fr plugins/

# 4. 일반 사용자 생성
[root@sonarqube ~]# useradd sonarqube

# 5. 코드 소유자를 sonarqube 로 변경
[root@sonarqube ~]# chown -R sonarqube.sonarqube /usr/local/sonarqube/
[root@sonarqube ~]# ll /usr/local/sonarqube/
total 12
drwxr-xr-x 8 sonarqube sonarqube  136 Feb  2  2018 bin
drwxr-xr-x 2 sonarqube sonarqube   50 May 15 15:09 conf
-rw-r--r-- 1 sonarqube sonarqube 7651 Feb  2  2018 COPYING
drwxr-xr-x 2 sonarqube sonarqube   24 Feb  2  2018 data
drwxr-xr-x 7 sonarqube sonarqube  150 Feb  2  2018 elasticsearch
drwxr-xr-x 4 sonarqube sonarqube   40 Feb  2  2018 extensions
drwxr-xr-x 9 sonarqube sonarqube  138 Feb  2  2018 lib
drwxr-xr-x 2 sonarqube sonarqube    6 Feb  2  2018 logs
drwxr-xr-x 2 sonarqube sonarqube   24 Feb  2  2018 temp
drwxr-xr-x 9 sonarqube sonarqube 4096 Feb  2  2018 web

# 6. 데이터베이스 연결 설정

[root@sonarqube ~]#vim /usr/local/sonarqube/conf/sonar.properties
...
sonar.jdbc.username=root            # 데이터베이스 사용자 이름
sonar.jdbc.password=000000      # 데이터베이스 비밀번호

#----- Embedded Database (default)
# H2 embedded database server listening port, defaults to 9092
#sonarqube.embeddedDatabase.port=9092

#----- MySQL 5.6 or greater
# Only InnoDB storage engine is supported (not myISAM).
# Only the bundled driver is supported. It can not be changed.
sonar.jdbc.url=jdbc:mysql://localhost:3306/sonarqube?useUnicode=true&characterE
ncoding=utf8&rewriteBatchedStatements=true&useConfigs=maxPerformance&useSSL
=false          # 로컬 연결 활성화
...
```

### 4. SonarQube 실행

```bash
SonarQube 은 root 로 시작할 수 없으며 반드시 일반 사용자로 실행해야 함
[root@sonarqube ~]# su - sonarqube -c "/usr/local/sonarqube/bin/linux-x86-64/sonar.sh start"
```

### 5. 원격 접속 토큰 설정

시작 후 포트는 9000 이며, 브라우저에서 http://11.0.1.202:9000/about 에 접속해 admin / admin 으로 로그인하고 토큰을 생성한다（한 번만 표시되므로 기록해 둘 것).

![image-20261002140038758](/images/image-20261002140038758.png)

![image-20261002140255442](/images/image-20261002140255442.png)

![image-20261002140411622](/images/image-20261002140411622.png)

![image-20261002140458573](/images/image-20261002140458573.png)

```bash
[root@jenkins ~]# sonar-scanner \
  -Dsonar.projectKey=html \
  -Dsonar.sources=. \
  -Dsonar.host.url=http://11.0.1.202:9000 \
  -Dsonar.login=a3bd8e829343edabbbc58fefe0d3e97fdb12268b
```

### 6. 클라이언트 배포

클라이언트 IP: 11.0.1.201

```bash
# 1. 클라이언트 업로드
[root@jenkins ~]# cd /usr/local/
[root@jenkins ~]#ll sonar-scanner-cli-4.2.0.1873-linux.zip
-rw-r--r-- 1 root root 42397119 Oct  2 00:09 sonar-scanner-cli-4.2.0.1873-linux.zip

# 2. 압축 해제 및 심볼릭 링크 생성
[root@jenkins local]#yum install -y unzip
[root@jenkins local]#unzip /root/sonar-scanner-cli-4.2.0.1873-linux.zip
[root@jenkins local]# ln -s sonar-scanner-4.2.0.1873-linux sonar

# 3. 전역 PATH 변수 설정
[root@jenkins ~]# export PATH="$PATH:/usr/local/sonar/bin/"

# 4. 변수를 /etc/profile 에 영구 저장
[root@jenkins ~]# vim /etc/profile
..
export PATH="$PATH:/usr/local/sonar/bin/"

# 5. 클라이언트에서 서버로 코드를 스캔해 분석 테스트
/var/lib/jenkins/workspace/test_job/ 디렉터리의 blog 코드를 SonarQube 에 푸시하여 테스트
[root@jenkins ~]#cd /var/lib/jenkins/workspace/test_job/
[root@jenkins test_job]#ll
total 8
-rw-r--r-- 1 root root    7 Oct  1 20:32 a.txt
-rw-r--r-- 1 root root 3634 Oct  1 20:32 blog_state.txt
-rw-r--r-- 1 root root    0 Oct  1 21:12 c.txt
drwxr-xr-x 2 root root    6 Oct  1 20:32 myblog
drwxr-xr-x 2 root root    6 Oct  1 20:32 myblog-deploy
[root@jenkins test_job]#sonar-scanner \
  -Dsonar.projectKey=html \
  -Dsonar.sources=. \
  -Dsonar.host.url=http://11.0.1.202:9000 \
  -Dsonar.login=a3bd8e829343edabbbc58fefe0d3e97fdb12268b
```

실행 성공:

![image-20261002140824559](/images/image-20261002140824559.png)

서버 확인: 업로드 성공

![image-20261002140853502](/images/image-20261002140853502.png)
