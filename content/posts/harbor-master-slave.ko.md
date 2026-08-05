---
title: "Harbor 액티브-스탠바이 배포: 설치부터 HTTPS 및 복제까지"
date: 2026-08-04
categories: ["컨테이너 기술", "DevOps"]
tags: ["Harbor", "Docker", "이미지 레지스트리", "복제", "HTTPS"]
summary: "Harbor 엔터프라이즈 Docker 레지스트리의 액티브-스탠바이 아키텍처, HTTP/HTTPS 모드, 자체 서명 인증서, 크로스 호스트 복제를 완전히 다루는 배포 가이드입니다."
weight: 1
showToc: true
TocOpen: true
---

# Harbor 액티브-스탠바이 배포

## 환경 준비

**운영체제:** CentOS 8.4 64bit

**Harbor 버전:** harbor-offline-installer-v2.11.1.tgz

**Docker Compose:** docker-compose-linux-x86_64

| 역할 | 호스트명 | IP 주소 |
|------|----------|---------|
| 주 Harbor | Harbor01 | 192.168.8.161 |
| 스탠바이 Harbor | Harbor02 | 192.168.8.162 |
| Docker 호스트 | web01 | 192.168.8.188 |

Harbor는 VMware의 오픈소스 엔터프라이즈 Docker 레지스트리 프로젝트로, 공식 Docker Registry를 기반으로 관리 UI, 역할 기반 접근 제어(RBAC), AD/LDAP 통합, 감사 로그 등의 기업 기능을 추가했습니다. Harbor의 각 컴포넌트는 Docker 컨테이너로 구축되며, Docker Compose를 사용하여 배포됩니다.

---

## 파트 1: 주 Harbor 배포 (HTTP 모드, 인증서 없음)

> 이 방법은 내부 네트워크에 적합하며, SSL 인증서 없이 HTTP로 직접 Harbor에 접근합니다.

### 1. Docker 설치

```bash
# 기존 yum 저장소 파일 삭제
rm -rf /etc/yum.repos.d/*

# Alibaba Cloud 미러에서 yum 저장소 파일 다운로드
curl -o /etc/yum.repos.d/CentOS-Base.repo https://mirrors.aliyun.com/repo/Centos-8.repo

# Docker CE 설치
yum install -y yum-utils
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker 시작 및 부팅 시 자동 시작 설정
systemctl enable docker.service --now
```

### 2. Docker 미러 설정

```bash
vim /etc/docker/daemon.json
```

다음 내용 입력:

```json
{
  "registry-mirrors": [
    "https://37564ea7e7cc4824a5049fd666807c27.mirror.swr.myhuaweicloud.com"
  ],
  "insecure-registries": ["http://192.168.8.161"]
}
```

```bash
systemctl daemon-reload
systemctl restart docker.service
```

### 3. Docker Compose 및 Harbor 설치

```bash
# docker-compose 및 harbor 오프라인 패키지를 /data에 배치
ls /data
# docker-compose-linux-x86_64  harbor-offline-installer-v2.11.1.tgz

# docker-compose 설치
cp /data/docker-compose-linux-x86_64 /usr/local/bin/docker-compose
chmod a+x /usr/local/bin/docker-compose

# harbor 압축 해제
tar -zxvf /data/harbor-offline-installer-v2.11.1.tgz -C /usr/local/
```

### 4. Harbor 설정 수정

```bash
cd /usr/local/harbor/
cp harbor.yml.tmpl harbor.yml
vim harbor.yml
```

다음 핵심 설정 수정:

```yaml
hostname: 192.168.8.161

http:
  port: 80

# https 섹션 전체 주석 처리 (HTTP 모드에서는 인증서 불필요)
#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: Harbor12345

data_volume: /images
```

> 나머지 설정은 기본값으로 유지합니다.

### 5. 설치 실행

```bash
./install.sh
```

설치 후 브라우저에서 `http://192.168.8.161`에 접속하여 admin / Harbor12345로 로그인합니다.

![Harbor 로그인 화면](/images/harbor/image1.png)

### 6. 사용자 및 프로젝트 생성

Harbor Web UI에서 user1 생성:

![사용자 생성](/images/harbor/image2.png)

user1로 로그인:

![user1 로그인](/images/harbor/image3.png)

user1로 새 프로젝트(예: openssh) 생성:

![새 프로젝트](/images/harbor/image4.png)

### 7. 이미지 푸시 및 풀 테스트

Docker 호스트(web01)에서 작업:

```bash
# Harbor 로그인
docker login 192.168.8.161
Username: user1
Password:
# Login Succeeded

# 이미지 태깅
docker tag nginx:latest 192.168.8.161/openssh/nginx:latest

# Harbor에 푸시
docker push 192.168.8.161/openssh/nginx:latest
```

성공적으로 푸시된 후 Harbor에서 이미지 확인:

![이미지 업로드 성공](/images/harbor/image5.png)

```bash
# 로컬 이미지 삭제 후 다시 풀
docker image rm -f 192.168.8.161/openssh/nginx:latest
docker pull 192.168.8.161/openssh/nginx:latest
```

풀 후 Harbor에 다운로드 횟수 +1 표시:

![다운로드 횟수](/images/harbor/image6.png)

---

## 파트 2: 스탠바이 Harbor 배포

스탠바이 배포는 주 Harbor와 동일하며, hostname만 스탠바이 IP로 변경합니다.

```bash
vim /usr/local/harbor/harbor.yml
```

```yaml
hostname: 192.168.8.162
```

배포 후 `http://192.168.8.162`에 접속하여 user2 생성:

![스탠바이 로그인](/images/harbor/image7.png)

![user2 생성](/images/harbor/image8.png)

스탠바이 Harbor에 user2로 로그인:

![user2 로그인](/images/harbor/image9.png)

---

## 파트 3: 액티브-스탠바이 복제 설정

### 1. 주 Harbor에 복제 대상 생성

주 Harbor에 admin으로 로그인하여 **관리 → 레지스트리**로 이동하고 새 대상 생성:

![관리](/images/harbor/image10.png)

스탠바이 정보 입력:

- 엔드포인트 URL: `http://192.168.8.162`
- 접근 ID / 접근 키: user2 자격 증명

![새 대상](/images/harbor/image11.png)

![대상 상세](/images/harbor/image12.png)

생성 성공:

![대상 생성 완료](/images/harbor/image13.png)

### 2. 복제 정책 생성

**관리 → 복제**로 이동하여 새 복제 정책 생성:

![복제 관리](/images/harbor/image14.png)

- 대상 레지스트리: Harbor02 선택
- 모드: 이벤트 기반 (또는 다른 모드)

![정책 설정](/images/harbor/image15.png)

![동기화 성공](/images/harbor/image16.png)

### 3. 동기화 결과 확인

Docker 호스트에서 더 많은 이미지를 주 Harbor에 푸시:

```bash
docker tag httpd:2.4 192.168.8.161/openssh/httpd:2.4
docker push 192.168.8.161/openssh/httpd:2.4

docker tag mysql:5.7 192.168.8.161/openssh/mysql:5.7
docker push 192.168.8.161/openssh/mysql:5.7
```

주 Harbor 이미지 확인:

![주 Harbor 이미지](/images/harbor/image17.png)

스탠바이 이미지 확인 (자동 동기화됨):

![스탠바이 이미지](/images/harbor/image18.png)

스탠바이에 주 Harbor에서 동기화된 이미지가 표시되면 액티브-스탠바이 복제가 성공한 것입니다.

참고: 복제 설정 전에 이미 존재했던 이미지는 수동으로 동기화해야 합니다.

---

## 파트 4: HTTPS 활성화 (자체 서명 인증서)

> 프로덕션 환경이나 공인 네트워크 사용 시 HTTPS를 권장합니다. 다음은 자체 서명 인증서의 전체 워크플로우입니다.

### 1. CA 및 서버 인증서 생성

Harbor 서버에서 실행:

```bash
mkdir -p /data/cert && cd /data/cert

# CA 개인키 생성
openssl genrsa -out ca.key 4096

# CA 인증서 생성 (10년 유효)
openssl req -x509 -new -nodes -sha512 -days 3650 \
  -subj "/C=CN/CN=HarborRootCA" \
  -key ca.key \
  -out ca.crt

# 서버 개인키 생성
openssl genrsa -out harbor.key 4096

# 서버 인증서 요청 생성 (CN = Harbor IP 또는 도메인)
openssl req -sha512 -new \
  -subj "/C=CN/CN=192.168.8.161" \
  -key harbor.key \
  -out harbor.csr
```

### 2. 인증서 확장 정보 설정

SAN(Subject Alternative Name)이 포함된 `v3.ext` 파일 생성:

```bash
cat > v3.ext <<-EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
IP.1=192.168.8.161
EOF
```

> `IP.1`은 Harbor의 실제 접속 주소와 일치해야 합니다. 그렇지 않으면 Docker 클라이언트가 인증서 도메인 불일치 오류를 보고합니다.

### 3. 서버 인증서 서명

```bash
openssl x509 -req -sha512 -days 3650 \
  -extfile v3.ext \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -in harbor.csr \
  -out harbor.crt
```

### 4. Harbor 설정에서 HTTPS 활성화

```bash
vim /usr/local/harbor/harbor.yml
```

https 섹션의 주석을 해제하고 인증서 경로 업데이트:

```yaml
hostname: 192.168.8.161

https:
  port: 443
  certificate: /data/cert/harbor.crt
  private_key: /data/cert/harbor.key
```

> hostname은 `v3.ext`의 `IP.1`과 일치해야 합니다.

### 5. Harbor 재배포

```bash
cd /usr/local/harbor/
docker-compose down
./prepare
docker-compose up -d
```

> 주의: `docker-compose down -v`를 사용하지 마세요. `-v`는 네임드 볼륨을 삭제하여 Harbor 데이터베이스와 사용자 데이터가 손실됩니다.

배포 후 `https://192.168.8.161`로 접속합니다.

### 6. Docker 클라이언트 인증서 신뢰 설정

이미지를 푸시/풀해야 하는 모든 머신에서 실행:

```bash
# 인증서 디렉토리 생성 (이름은 Harbor IP 또는 도메인이어야 함)
mkdir -p /etc/docker/certs.d/192.168.8.161

# CA 인증서를 해당 디렉토리에 복사
# 방법 1: Harbor 서버에서 scp
scp root@192.168.8.161:/data/cert/ca.crt /etc/docker/certs.d/192.168.8.161/

# 방법 2: 수동으로 ca.crt 파일 내용 복사

# Docker 재시작
systemctl restart docker

# 로그인 테스트
docker login 192.168.8.161
# admin과 비밀번호 입력, "Login Succeeded" 표시되면 성공
```

---

## 파트 5: FAQ

**Q: HTTP 모드와 HTTPS 모드를 전환할 수 있나요?**

네. `harbor.yml`의 https 섹션을 수정한 후 `./install.sh`를 다시 실행하면 됩니다. HTTP에서 HTTPS로 전환하려면 인증서를 먼저 생성해야 하고, HTTPS에서 HTTP로 전환하려면 https 섹션을 주석 처리하면 됩니다.

**Q: Docker 클라이언트가 HTTPS Harbor 로그인 시 "x509: certificate relies on legacy Common Name field" 오류를 보고할 때**

이는 인증서에 SAN(Subject Alternative Name)이 없기 때문입니다. `v3.ext`에 `IP.1=<Harbor IP>`가 포함되어 있고 `-extfile v3.ext`로 서명했는지 확인하세요.

**Q: 복제 실패를 어떻게 해결하나요?**

주와 스탠바이 간의 네트워크 연결, 대상 레지스트리 자격 증명, 해당 사용자의 대상 프로젝트 쓰기 권한을 확인하세요.
