---
title: "Harbor 자체 서명 인증서 HTTPS 배포 실전"
date: 2026-10-29T20:57:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "이 실습에서는 자체 서명 인증서를 사용한 HTTPS 로 Harbor 를 구성한다. 인증서 디렉토리를 만들고, openssl 로 자체 서명 인증서（도메인 harbor.dawn.com, SAN 에 DNS 와 IP 11.0.1.122 포함）를 생성하며, harbor.yml 을 수정해 443 포트 HTTPS 를 활성화하고 install.sh 로 재설치한다. 마지막으로 ss 와 curl 로 80 포트가 자동으로 443 으로 리다이렉트되고 WebUI 에 접속 가능함을 확인한다. 자체 서명 인증서는 클라이언트 신뢰가 필요하며, 프로덕션 환경에서는 공식 CA 가 발급한 인증서를 사용해 경고를 피해야 한다."
---

# Harbor 자체 서명 인증서 HTTPS 배포 실전

## 1. 인증서 디렉토리 생성

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# mkdir certs && cd certs
```

## 2. 자체 서명 인증서 생성

```bash
root@docker02:/dawn/softwares/harbor/certs# openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout harbor.dawn.com.key -out harbor.dawn.com.crt \
  -subj '/CN=harbor.dawn.com' \
  -addext 'subjectAltName=DNS:harbor.dawn.com,IP:11.0.1.122'
root@docker02:/dawn/softwares/harbor/certs# ls -la
-rw-r--r-- 1 root root 1176 Oct 29 09:37 harbor.dawn.com.crt
-rw------- 1 root root 1704 Oct 29 09:37 harbor.dawn.com.key
```

## 3. Harbor 설정 파일 수정하여 HTTPS 활성화

```yaml
# 인증서 도메인 이름과 정확히 일치해야 함
hostname: harbor.dawn.com

# HTTPS 인증서 설정, 인증서 경로를 정확히 지정해야 함
https:
  port: 443
  certificate: /dawn/softwares/harbor/certs/harbor.dawn.com.crt
  private_key: /dawn/softwares/harbor/certs/harbor.dawn.com.key
```

## 4. Harbor 재설치

```bash
root@docker02:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
✔ ----Harbor has been installed and started successfully.----
```

## 5. WebUI 접속 테스트 검증

```bash
root@docker02:~# ss -lnt | grep -E ':80 |:443 '
LISTEN 0 4096 0.0.0.0:80  0.0.0.0:*
LISTEN 0 4096 0.0.0.0:443 0.0.0.0:*

root@docker02:~# curl -sk -o /dev/null -w '%{http_code}\n' https://harbor.dawn.com/
200
root@docker02:~# curl -sk -o /dev/null -w '%{http_code}\n' https://11.0.1.122/
200
```

![image-20261029205721699](/images/harbor-self-signed-https/image-20261029205721699.png)

Harbor 가 HTTP 에서 HTTPS 로 성공적으로 전환되었습니다(80 포트는 자동으로 443 으로 리다이렉트됨). 자체 서명 인증서는 클라이언트 신뢰가 필요하며, 프로덕션 환경에서는 공식 CA 가 발급한 인증서를 사용하면 경고를 피할 수 있습니다.