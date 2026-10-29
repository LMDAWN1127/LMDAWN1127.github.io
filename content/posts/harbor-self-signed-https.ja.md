---
title: "Harbor 自己署名証明書による HTTPS デプロイ実践"
date: 2026-10-29T20:57:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本実践では自己署名証明書を用いた HTTPS で Harbor を構成する。証明書ディレクトリを作成し、openssl で自己署名証明書（ドメイン harbor.dawn.com、SAN に DNS と IP 11.0.1.122 を含む）を生成、harbor.yml を編集して 443 ポートの HTTPS を有効化、install.sh で再インストールする。最後に ss と curl で 80 ポートが自動的に 443 へリダイレクトされ WebUI にアクセスできることを確認する。自己署名証明書はクライアント側の信頼が必要で、本番環境では公式 CA が発行した証明書を使用して警告を回避すべきである。"
---

# Harbor 自己署名証明書による HTTPS デプロイ実践

## 1. 証明書ディレクトリの作成

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# mkdir certs && cd certs
```

## 2. 自己署名証明書の生成

```bash
root@docker02:/dawn/softwares/harbor/certs# openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout harbor.dawn.com.key -out harbor.dawn.com.crt \
  -subj '/CN=harbor.dawn.com' \
  -addext 'subjectAltName=DNS:harbor.dawn.com,IP:11.0.1.122'
root@docker02:/dawn/softwares/harbor/certs# ls -la
-rw-r--r-- 1 root root 1176 Oct 29 09:37 harbor.dawn.com.crt
-rw------- 1 root root 1704 Oct 29 09:37 harbor.dawn.com.key
```

## 3. Harbor 設定ファイルを編集して HTTPS を有効化

```yaml
# 証明書のドメイン名と完全に一致させる
hostname: harbor.dawn.com

# HTTPS 証明書を設定します。証明書パスを正しく指定してください
https:
  port: 443
  certificate: /dawn/softwares/harbor/certs/harbor.dawn.com.crt
  private_key: /dawn/softwares/harbor/certs/harbor.dawn.com.key
```

## 4. Harbor の再インストール

```bash
root@docker02:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
✔ ----Harbor has been installed and started successfully.----
```

## 5. WebUI にアクセスしてテスト検証

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

Harbor は HTTP から HTTPS へ正常に切り替わりました（80 ポートは自動的に 443 へリダイレクトされます）。自己署名証明書はクライアント側の信頼が必要です。本番環境では公式 CA が発行した証明書を使用すれば警告を回避できます。