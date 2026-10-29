---
title: "Harbor 基于自签名证书的 HTTPS 部署实战"
date: 2026-10-29T20:57:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本文实战演示为 Harbor 配置基于自签名证书的 HTTPS 访问。依次创建证书目录、用 openssl 生成自签名证书（域名 harbor.dawn.com，SAN 同时包含 DNS 与 IP 11.0.1.122）、修改 harbor.yml 启用 443 端口 HTTPS、重新执行 install.sh 安装，最后通过 ss 与 curl 验证 80 端口已自动重定向到 443、WebUI 可正常访问。自签名证书需客户端信任，生产环境建议改用官方 CA 签发的证书以避免告警。"
---

# Harbor 基于自签名证书的 HTTPS 部署实战

## 1. 创建存放证书目录

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# mkdir certs && cd certs
```

## 2. 生成自签名证书

```bash
root@docker02:/dawn/softwares/harbor/certs# openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout harbor.dawn.com.key -out harbor.dawn.com.crt \
  -subj '/CN=harbor.dawn.com' \
  -addext 'subjectAltName=DNS:harbor.dawn.com,IP:11.0.1.122'
root@docker02:/dawn/softwares/harbor/certs# ls -la
-rw-r--r-- 1 root root 1176 Oct 29 09:37 harbor.dawn.com.crt
-rw------- 1 root root 1704 Oct 29 09:37 harbor.dawn.com.key
```

## 3. 修改 harbor 配置文件启用 https

```yaml
# 指定和你的证书域名要完全相同
hostname: harbor.dawn.com

# 配置 https 证书，要求证书路径指定正确
https:
  port: 443
  certificate: /dawn/softwares/harbor/certs/harbor.dawn.com.crt
  private_key: /dawn/softwares/harbor/certs/harbor.dawn.com.key
```

## 4. 重新安装 harbor

```bash
root@docker02:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
✔ ----Harbor has been installed and started successfully.----
```

## 5. 访问 WebUI 测试验证

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

harbor 成功从 HTTP 切换到 HTTPS（80 端口自动重定向到 443），自签名证书需客户端信任，生产环境使用官方 CA 签发的证书即可避免告警