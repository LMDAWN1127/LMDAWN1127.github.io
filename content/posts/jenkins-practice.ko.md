---
title: "Jenkins 실전: 사설 배포, 플러그인 설치, GitLab 연동 CI"
date: 2026-10-01T21:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "CI/CD"]
summary: "Jenkins 을 사설로 배포하는 실전 가이드: JDK/GitLab RPM 설치, root 계정 실행, 오프라인 플러그인 설치, GitLab SSH 키 인증과 webhook 자동 빌드 연동."
showToc: true
---

## 01. Jenkins 소개

1. 공식 사이트: jenkins.io

2. Jenkins 은 오픈소스 프로젝트로, Java 기반의 지속적 통합(CI) 도구다. 반복 작업을 모니터링하고 개방적이고 사용하기 쉬운 소프트웨어 플랫폼을 제공하여 소프트웨어 CI를 가능하게 한다。

## 02. Jenkins 배포

```bash
I. 환경 준비
1、OS: CentOS 7.9
2、메모리: 실습 2G, 운영 최소 6G
3、방화벽 비활성화 및 SELinux 끄기
4、JDK17

II. JDK 설치
RPM 패키지를 업로드
[root@jenkins ~]#ll
total 178212
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm

[root@jenkins ~]#rpm -ivh jdk-17_linux-x64_bin.rpm
warning: jdk-17_linux-x64_bin.rpm: Header V3 RSA/SHA256 Signature, key ID ad986da3: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jdk-17-2000:17.0.11-7            ################################# [100%]

설치 성공 여부 확인:
[root@jenkins ~]# rpm -qa|grep jdk
jdk-17-17.0.11-7.x86_64

II. Jenkins 설치
Jenkins 패키지를 업로드
[root@jenkins ~]#ll
total 269432
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm
-rw-r--r-- 1 root root  93405530 Oct  1 19:06 jenkins-2.405-1.1.noarch.rpm
[root@jenkins ~]#rpm -ivh jenkins-2.405-1.1.noarch.rpm
warning: jenkins-2.405-1.1.noarch.rpm: Header V4 RSA/SHA512 Signature, key ID ef5975ca: NOKEY
Preparing...                          ################################# [100%]
Updating / installing...
   1:jenkins-2.405-1.1                ################################# [100%]

III. Jenkins 실행 사용자를 root 로 변경
1) 설정 파일의 실행 사용자 변경
[root@jenkins ~]# vim /etc/sysconfig/jenkins
...
JENKINS_USER="root"
...
2) 시작 설정의 사용자 변경
[root@jenkins ~]# vim /usr/lib/systemd/system/jenkins.service
...
User=root
Group=root
...
[root@jenkins ~]# systemctl daemon-reload

3) 폰트 설정 설치
[root@jenkins ~]# yum -y install fontconfig

IV. Jenkins 시작 및 부팅 시 자동 시작 설정
[root@jenkins ~]# systemctl start jenkins
[root@jenkins ~]# systemctl enable jenkins
```

## 03. Jenkins 로그인

![image-20261001192229088](/images/image-20261001192229088.png)

![](/images/img_p25_2_130.png)

![](/images/img_p26_1_133.png)

## 04. 비밀번호 변경

비밀번호 변경 후 재로그인, 사용자 이름은 admin

![](/images/img_p26_2_136.png)

![](/images/img_p27_1_140.png)

## 05. 플러그인 설치

```bash
1. 플러그인을 Jenkins 홈 디렉터리에 업로드
[root@jenkins ~]# cd /var/lib/jenkins/

[root@jenkins ~]#ll
total 576228
-rw-r--r-- 1 root root 182486159 Oct  1 19:04 jdk-17_linux-x64_bin.rpm
-rw-r--r-- 1 root root  93405530 Oct  1 19:06 jenkins-2.405-1.1.noarch.rpm
-rw-r--r-- 1 root root 314156543 Oct  1 19:30 jenkins_plu.tar.gz

2. 플러그인을 plugins 디렉터리에 압축 해제
[root@jenkins jenkins]#tar xf /root/jenkins_plu.tar.gz -C plugins/

3. Jenkins 재시작하여 적용
[root@jenkins ~]# systemctl restart jenkins
```

## 06. 프로젝트 생성

프리스타일 프로젝트를 만들고 pwd 를 실행하여 Jenkins 가 사용하는 기본 작업 디렉터리 확인

![](/images/img_p28_1_147.png)

![](/images/img_p28_2_148.png)

![](/images/img_p29_1_151.png)

![](/images/img_p29_2_153.png)

![](/images/img_p30_1_156.png)

![](/images/img_p30_2_158.png)

참고: Jenkins 가 프로젝트를 만들면 홈 /var/lib/jenkins/ 아래에 workspace 디렉터리를 자동으로 만들고, 그 안에 프로젝트 이름의 디렉터리를 생성한다.

이후 Jenkins 가 GitLab 에서 가져온 코드는 이 프로젝트 디렉터리에 저장된다.

```bash
[root@jenkins ~]#ls /var/lib/jenkins/workspace/
test_job
```

GitLab 과 Jenkins 연결

연결 전에는 연결 불가 메시지가 표시됨:

![image-20261001200618384](/images/image-20261001200618384.png)

```bash
# 키 인증(키리스) 설정
[root@jenkins ~]#ssh-keygen
Generating public/private rsa key pair.
Enter file in which to save the key (/root/.ssh/id_rsa): Created directory '/root/.ssh'.
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in /root/.ssh/id_rsa.
Your public key has been saved in /root/.ssh/id_rsa.pub.
The key fingerprint is:
SHA256:Rr4ouinx/cPqVxJsxju2Cjd1mhWmWSuKGOKG532uTvk root@jenkins
The key's randomart image is:
+---[RSA 2048]----+
|                 |
|                 |
|     o  =        |
|      *B o       |
|o    o=oS        |
|=o . +=O..       |
|o=+.Bo+=.        |
|oo.B.+*          |
| .=+BOE.         |
+----[SHA256]-----+

[root@jenkins ~]#cat .ssh/id_rsa.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC+kaj/NEwHKaIErMEClVYuG3JuWr9CD7XpuO5YZ6JftMmNdAPMrvS0mWqP4SDyT6/le0j1RGkA48GsirESfMqXKvzSSd5AuhIPmUADtGPNK6VSeiMKyoWgiNBFLn6RIOAcXI0MuZrYQMLJz+kOYr6kF9em/6MfFQrLkt9DzIlnR9b7CMLyDnPOZ8FG640DqqX0sZ8G+i2v41VX/c7RGIWAgEhJY+kiMS5cDxWlTf2k8hoZmh0VIa/G9AwnvbklyUiE4ACd9GtEJG5xXJzedn7q0/Ygfr26T29t+KST3SlyrXIaEbEC5WwIMymCEJDCPPCGzqLjsWa+4dbJhoEM1afV root@jenkins

# Jenkins 에 git 설치
[root@jenkins ~]#yum install -y git
```

GitLab 에 Jenkins 가 생성한 키 추가:

![image-20261001201613164](/images/image-20261001201613164.png)

Jenkins 에서 한 번 git clone 하여 최초 yes 입력 완료

```bash
[root@jenkins ~]#git clone git@11.0.1.200:dawn/blog.git
Cloning into 'blog'...
The authenticity of host '11.0.1.200 (11.0.1.200)' can't be established.
ECDSA key fingerprint is SHA256:Ldn1vBzBEFxynXs0qBNr0XzJ2lTx/0caMuK5yJtb+Zo.
ECDSA key fingerprint is MD5:3d:1d:28:3f:33:ec:ee:c1:69:83:af:14:a3:7f:79:ac.
Are you sure you want to continue connecting (yes/no)? yes
Warning: Permanently added '11.0.1.200' (ECDSA) to the list of known hosts.
remote: Enumerating objects: 20, done.
remote: Counting objects: 100% (9/9), done.
remote: Compressing objects: 100% (8/8), done.
remote: Total 20 (delta 0), reused 0 (delta 0), pack-reused 11
Receiving objects: 100% (20/20), done.
Resolving deltas: 100% (2/2), done.
```

이제 연결됨

![image-20261001202612887](/images/image-20261001202612887.png)

다시 빌드하여 풀 테스트

![image-20261001203243290](/images/image-20261001203243290.png)

풀 성공

![image-20261001203330173](/images/image-20261001203330173.png)

![image-20261001203429229](/images/image-20261001203429229.png)

웹훅 설정

웹훅을 설정하여 GitLab 코드를 Jenkins 가 자동으로 풀하고 빌드하도록 구성

![image-20261001205129263](/images/image-20261001205129263.png)

![image-20261001205637856](/images/image-20261001205637856.png)

![image-20261001205830316](/images/image-20261001205830316.png)

![image-20261001205317890](/images/image-20261001205317890.png)

![image-20261001210203745](/images/image-20261001210203745.png)

양쪽 저장 후 테스트

![image-20261001210523584](/images/image-20261001210523584.png)

프로젝트 수정 후 다시 푸시하여 테스트

```bash
[root@gitlab blog]#git branch
* master
[root@gitlab blog]#touch c.txt
[root@gitlab blog]#git add .
[root@gitlab blog]#git commit -m "test_v2"
[master 7b1f29e] test_v2
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 c.txt
[root@gitlab blog]#git pull origin master
remote: Enumerating objects: 17, done.
remote: Counting objects: 100% (9/9), done.
remote: Compressing objects: 100% (8/8), done.
remote: Total 17 (delta 0), reused 0 (delta 0), pack-reused 8
Unpacking objects: 100% (17/17), done.
From 11.0.1.200:dawn/blog
 * branch            master     -> FETCH_HEAD
Merge made by the 'recursive' strategy.
 a.txt | 1 +
 1 file changed, 1 insertion(+)
 create mode 100644 a.txt
[root@gitlab blog]#git push -u origin master
Counting objects: 7, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (4/4), done.
Writing objects: 100% (5/5), 469 bytes | 0 bytes/s, done.
Total 5 (delta 2), reused 0 (delta 0)
To git@11.0.1.200:dawn/blog.git
   47f606c..91e80a5  master -> master
Branch master set up to track remote branch master from origin.
```

자동 빌드 성공

![image-20261001212025538](/images/image-20261001212025538.png)
