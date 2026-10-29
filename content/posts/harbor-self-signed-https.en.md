---
title: "Harbor HTTPS Deployment with a Self-Signed Certificate"
date: 2026-10-29T20:57:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "This hands-on walkthrough configures Harbor with HTTPS using a self-signed certificate. We create the certificate directory, generate a self-signed certificate with openssl (domain harbor.dawn.com, SAN covering both DNS and IP 11.0.1.122), edit harbor.yml to enable HTTPS on port 443, and reinstall with install.sh. Finally we use ss and curl to confirm that port 80 is automatically redirected to 443 and the WebUI is accessible. Self-signed certificates require client trust; in production, use a certificate issued by an official CA to avoid warnings."
---

# Harbor HTTPS Deployment with a Self-Signed Certificate

## 1. Create the Certificate Directory

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# mkdir certs && cd certs
```

## 2. Generate the Self-Signed Certificate

```bash
root@docker02:/dawn/softwares/harbor/certs# openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout harbor.dawn.com.key -out harbor.dawn.com.crt \
  -subj '/CN=harbor.dawn.com' \
  -addext 'subjectAltName=DNS:harbor.dawn.com,IP:11.0.1.122'
root@docker02:/dawn/softwares/harbor/certs# ls -la
-rw-r--r-- 1 root root 1176 Oct 29 09:37 harbor.dawn.com.crt
-rw------- 1 root root 1704 Oct 29 09:37 harbor.dawn.com.key
```

## 3. Edit the Harbor Config to Enable HTTPS

```yaml
# must match your certificate domain name exactly
hostname: harbor.dawn.com

# configure the HTTPS certificate; the cert paths must be specified correctly
https:
  port: 443
  certificate: /dawn/softwares/harbor/certs/harbor.dawn.com.crt
  private_key: /dawn/softwares/harbor/certs/harbor.dawn.com.key
```

## 4. Reinstall Harbor

```bash
root@docker02:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
✔ ----Harbor has been installed and started successfully.----
```

## 5. Access the WebUI to Test and Verify

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

Harbor successfully switched from HTTP to HTTPS (port 80 is automatically redirected to 443). Self-signed certificates require client trust; in production, using a certificate issued by an official CA avoids the browser warning.