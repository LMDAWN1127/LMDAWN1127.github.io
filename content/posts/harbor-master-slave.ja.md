---
title: "Harbor アクティブスタンバイデプロイ：インストールからHTTPS・レプリケーションまで"
date: 2026-08-04
categories: ["コンテナ技術", "DevOps"]
tags: ["Harbor", "Docker", "イメージレジストリ", "レプリケーション", "HTTPS"]
summary: "HarborエンタープライズDockerレジストリのアクティブスタンバイアーキテクチャ、HTTP/HTTPSモード、自己署名証明書、クロスホストレプリケーションを完全にカバーするデプロイガイドです。"
weight: 1
---

# Harbor アクティブスタンバイデプロイ

## 環境準備

**OS:** CentOS 8.4 64bit

**Harbor バージョン:** harbor-offline-installer-v2.11.1.tgz

**Docker Compose:** docker-compose-linux-x86_64

| 役割 | ホスト名 | IP アドレス |
|------|----------|------------|
| プライマリ Harbor | Harbor01 | 192.168.8.161 |
| スタンバイ Harbor | Harbor02 | 192.168.8.162 |
| Docker ホスト | web01 | 192.168.8.188 |

HarborはVMwareのオープンソースエンタープライズDockerレジストリプロジェクトで、公式Docker Registryをベースに、管理UI、ロールベースのアクセス制御（RBAC）、AD/LDAP統合、監査ログなどのエンタープライズ機能を追加しています。Harborの各コンポーネントはDockerコンテナとして構築され、Docker Composeを使用してデプロイされます。

---

## パート1：プライマリHarborデプロイ（HTTPモード、証明書なし）

> この方法は社内ネットワーク向けで、SSL証明書なしでHTTPで直接Harborにアクセスします。

### 1. Dockerインストール

```bash
# 既存のyumリポジトリファイルを削除
rm -rf /etc/yum.repos.d/*

# Alibaba Cloudミラーからyumリポジトリファイルをダウンロード
curl -o /etc/yum.repos.d/CentOS-Base.repo https://mirrors.aliyun.com/repo/Centos-8.repo

# Docker CEインストール
yum install -y yum-utils
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker起動とブート時自動起動設定
systemctl enable docker.service --now
```

### 2. Dockerミラー設定

```bash
vim /etc/docker/daemon.json
```

以下の内容を入力：

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

### 3. Docker ComposeとHarborインストール

```bash
# docker-composeとharborオフラインパッケージを/dataに配置
ls /data
# docker-compose-linux-x86_64  harbor-offline-installer-v2.11.1.tgz

# docker-composeインストール
cp /data/docker-compose-linux-x86_64 /usr/local/bin/docker-compose
chmod a+x /usr/local/bin/docker-compose

# harbor展開
tar -zxvf /data/harbor-offline-installer-v2.11.1.tgz -C /usr/local/
```

### 4. Harbor設定変更

```bash
cd /usr/local/harbor/
cp harbor.yml.tmpl harbor.yml
vim harbor.yml
```

主要設定を変更：

```yaml
hostname: 192.168.8.161

http:
  port: 80

# httpsセクション全体をコメントアウト（HTTPモードでは証明書不要）
#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: Harbor12345

data_volume: /images
```

> 他の設定はデフォルトのままにします。

### 5. インストール実行

```bash
./install.sh
```

インストール後、ブラウザで `http://192.168.8.161` にアクセスし、admin / Harbor12345でログイン。

![Harborログイン画面](/images/harbor/image1.png)

### 6. ユーザーとプロジェクトの作成

Harbor Web UIでuser1を作成：

![ユーザー作成](/images/harbor/image2.png)

user1でログイン：

![user1ログイン](/images/harbor/image3.png)

user1として新しいプロジェクト（例：openssh）を作成：

![新規プロジェクト](/images/harbor/image4.png)

### 7. イメージのプッシュとプルテスト

Dockerホスト（web01）で作業：

```bash
# Harborにログイン
docker login 192.168.8.161
Username: user1
Password:
# Login Succeeded

# イメージにタグ付け
docker tag nginx:latest 192.168.8.161/openssh/nginx:latest

# Harborにプッシュ
docker push 192.168.8.161/openssh/nginx:latest
```

プッシュ成功後、Harborでイメージを確認：

![イメージアップロード成功](/images/harbor/image5.png)

```bash
# ローカルイメージを削除して再度プル
docker image rm -f 192.168.8.161/openssh/nginx:latest
docker pull 192.168.8.161/openssh/nginx:latest
```

プル後、Harborにダウンロード回数+1が表示：

![ダウンロード回数](/images/harbor/image6.png)

---

## パート2：スタンバイHarborデプロイ

スタンバイのデプロイはプライマリと同一で、hostnameをスタンバイのIPに変更するだけです。

```bash
vim /usr/local/harbor/harbor.yml
```

```yaml
hostname: 192.168.8.162
```

デプロイ後、`http://192.168.8.162` にアクセスしてuser2を作成：

![スタンバイログイン](/images/harbor/image7.png)

![user2作成](/images/harbor/image8.png)

スタンバイHarborにuser2でログイン：

![user2ログイン](/images/harbor/image9.png)

---

## パート3：アクティブスタンバイレプリケーション設定

### 1. プライマリにレプリケーションターゲットを作成

プライマリHarborにadminでログインし、**管理 → レジストリ**に移動して新しいターゲットを作成：

![管理](/images/harbor/image10.png)

スタンバイ情報を入力：

- エンドポイントURL：`http://192.168.8.162`
- アクセスID / アクセスキー：user2の資格情報

![新規ターゲット](/images/harbor/image11.png)

![ターゲット詳細](/images/harbor/image12.png)

作成成功：

![ターゲット作成完了](/images/harbor/image13.png)

### 2. レプリケーションポリシー作成

**管理 → レプリケーション**に移動して新しいポリシーを作成：

![レプリケーション管理](/images/harbor/image14.png)

- 宛先レジストリ：Harbor02を選択
- モード：イベント駆動（または他のモード）

![ポリシー設定](/images/harbor/image15.png)

![同期成功](/images/harbor/image16.png)

### 3. 同期結果の確認

Dockerホストからプライマリにさらにイメージをプッシュ：

```bash
docker tag httpd:2.4 192.168.8.161/openssh/httpd:2.4
docker push 192.168.8.161/openssh/httpd:2.4

docker tag mysql:5.7 192.168.8.161/openssh/mysql:5.7
docker push 192.168.8.161/openssh/mysql:5.7
```

プライマリイメージを確認：

![プライマリイメージ](/images/harbor/image17.png)

スタンバイイメージを確認（自動同期済み）：

![スタンバイイメージ](/images/harbor/image18.png)

スタンバイにプライマリから同期されたイメージが表示されれば、アクティブスタンバイレプリケーションが成功しています。

注意：レプリケーション設定前にすでに存在していたイメージは手動で同期する必要があります。

---

## パート4：HTTPS有効化（自己署名証明書）

> 本番環境やパブリックネットワークではHTTPSを推奨します。以下は自己署名証明書の完全なワークフローです。

### 1. CAとサーバー証明書の生成

Harborサーバーで実行：

```bash
mkdir -p /data/cert && cd /data/cert

# CA秘密鍵生成
openssl genrsa -out ca.key 4096

# CA証明書生成（10年有効）
openssl req -x509 -new -nodes -sha512 -days 3650 \
  -subj "/C=CN/CN=HarborRootCA" \
  -key ca.key \
  -out ca.crt

# サーバー秘密鍵生成
openssl genrsa -out harbor.key 4096

# サーバー証明書リクエスト生成（CN = Harbor IPまたはドメイン）
openssl req -sha512 -new \
  -subj "/C=CN/CN=192.168.8.161" \
  -key harbor.key \
  -out harbor.csr
```

### 2. 証明書拡張情報設定

SAN（Subject Alternative Name）を含む `v3.ext` ファイルを作成：

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

> `IP.1` はHarborの実際のアクセスアドレスと一致する必要があります。一致しない場合、Dockerクライアントが証明書ドメイン不一致エラーを報告します。

### 3. サーバー証明書に署名

```bash
openssl x509 -req -sha512 -days 3650 \
  -extfile v3.ext \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -in harbor.csr \
  -out harbor.crt
```

### 4. Harbor設定でHTTPS有効化

```bash
vim /usr/local/harbor/harbor.yml
```

httpsセクションのコメントを外し、証明書パスを更新：

```yaml
hostname: 192.168.8.161

https:
  port: 443
  certificate: /data/cert/harbor.crt
  private_key: /data/cert/harbor.key
```

> hostnameは `v3.ext` の `IP.1` と一致する必要があります。

### 5. Harbor再デプロイ

```bash
cd /usr/local/harbor/
docker-compose down
./prepare
docker-compose up -d
```

> 注意：`docker-compose down -v` を使用しないでください。`-v` は名前付きボリュームを削除し、Harborデータベースとユーザーデータが失われます。

デプロイ後、`https://192.168.8.161` でアクセス。

### 6. Dockerクライアントの証明書信頼設定

イメージのプッシュ/プルが必要なすべてのマシンで実行：

```bash
# 証明書ディレクトリ作成（名前はHarbor IPまたはドメイン）
mkdir -p /etc/docker/certs.d/192.168.8.161

# CA証明書をそのディレクトリにコピー
# 方法1：Harborサーバーからscp
scp root@192.168.8.161:/data/cert/ca.crt /etc/docker/certs.d/192.168.8.161/

# 方法2：手動でca.crtファイルの内容をコピー

# Docker再起動
systemctl restart docker

# ログインテスト
docker login 192.168.8.161
# adminとパスワードを入力、"Login Succeeded"が表示されれば成功
```

---

## パート5：FAQ

**Q：HTTPモードとHTTPSモードを切り替えられますか？**

はい。`harbor.yml` のhttpsセクションを変更後、`./install.sh` を再実行してください。HTTPからHTTPSへの切り替えには証明書の事前生成が必要です。HTTPSからHTTPへの切り替えにはhttpsセクションをコメントアウトしてください。

**Q：DockerクライアントがHTTPS Harborへのログイン時に「x509: certificate relies on legacy Common Name field」エラーを報告する場合**

証明書にSAN（Subject Alternative Name）が含まれていないためです。`v3.ext` に `IP.1=<Harbor IP>` が含まれており、`-extfile v3.ext` で署名していることを確認してください。

**Q：レプリケーション失敗のトラブルシューティング方法は？**

プライマリとスタンバイ間のネットワーク接続、ターゲットレジストリの資格情報、対象ユーザーのターゲットプロジェクトへの書き込み権限を確認してください。
