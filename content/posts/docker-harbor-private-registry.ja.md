---
title: "プライベートイメージレジストリ実践：docker registry と VMware Harbor"
date: 2026-10-29T15:09:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "2 つのプライベートイメージレジストリをゼロから構築する。まず軽量な docker registry でイメージの展開・プッシュ・プル・削除（メタデータの手動削除 + GC によるストレージ回収を含む）を完了し、次にエンタープライズグレードの VMware Harbor（HTTP モード）を展開する。hosts 解決、insecure-registries 設定、プロジェクト作成、3 つの docker login 方式、イメージのプッシュ/プル/削除の全フローを示し、最後にサイズ・展開・WebUI・プロジェクト管理・削除・適用シナリオの違いを対照表でまとめる。"
---

# プライベートイメージレジストリ実践：docker registry と VMware Harbor

**実験目的**: docker registry 軽量プライベートレジストリと VMware Harbor エンタープライズプライベートレジストリの展開・プッシュ・プル・削除の全フローを習得する。

---

## 1. プライベートイメージレジストリの利点

1. イメージのプルが高速;
2. ユーザーがイメージを取得しやすい;
3. 安全、内部利用。

## 2. プライベートレジストリの解決策

| ソリューション                          | 説明                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| **公式レジストリ**                  | Docker Hub、国内では遮断され、プロキシが必要                               |
| **docker registry**（非推奨） | Docker 公式のオープンソースイメージレジストリ。起動時約 20MB と非常に軽量だが、使い方がやや複雑で管理しにくい |
| **VMware Harbor**（企業推奨） | docker registry をベースに二次開発され、harbor リポジトリがオープンソース化された            |
| **サードパーティレジストリ**                | Alibaba Cloud、Huawei Cloud、各種クラウドプラットフォームなど                                 |

---

## 第 1 部: docker registry 環境の構築とイメージのプッシュ

### 1.1 docker registry の展開

```bash
root@docker01:~# docker run -dp 5000:5000 --restart=always --name dawn-registry -v /var/lib/registry registry
Unable to find image 'registry:latest' locally
latest: Pulling from library/registry
7b229517ed22: Pull complete
9cf9c5d068e4: Pull complete
30513d5b3b2d: Pull complete
7a0bafd2eac6: Pull complete
b6d795448ea0: Pull complete
Digest: sha256:d4032d4cc323c1731c707931ecada07a53076eac38e3b61ae57533f170f2c6c3
Status: Downloaded newer image for registry:latest
ec44574ca8f2ce62f9a701bafb9641c3b65b2b7ed28c631f3d49651a25b8c67c

root@docker01:~# docker ps --filter name=dawn-registry --format '{{.Names}} {{.Status}} {{.Ports}}'
dawn-registry Up 0.0.0.0:5000->5000/tcp, :::5000->5000/tcp
```

### 1.2 WebUI へのアクセス

```
http://11.0.1.121:5000/v2/_catalog
```

初期の応答（まだイメージなし）:

```json
{"repositories":[]}
```

### 1.3 クライアントの安全でないレジストリ設定

docker はデフォルトで https プロトコルを使用するが、プライベートレジストリは http であるため、docker に http プロトコルを信頼させるには `insecure-registries` を設定する必要がある。

```bash
root@docker02:~# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000"]
}
root@docker02:~# systemctl restart docker
root@docker02:~# docker info | grep "Insecure Registries" -A 3
 Insecure Registries:
  11.0.1.121:5000
  127.0.0.0/8
```

### 1.4 イメージにタグ付け

```bash
root@docker02:~# docker tag mysql:8.4.1-oracle 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
root@docker02:~# docker images | grep dawn-db
11.0.1.121:5000/dawn-db/mysql    8.4.1-oracle   da8f2a99cf39   2 years ago   583MB
```

### 1.5 イメージをプライベートレジストリにプッシュ

```bash
root@docker02:~# docker push 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
The push refers to repository [11.0.1.121:5000/dawn-db/mysql]
2f75bcd245fd: Pushed
3ea6a92c9182: Pushed
2606c15a4838: Pushed
987e49e8d588: Pushed
fde3e91c5c9e: Pushed
...
8.4.1-oracle: digest: sha256:03a538f365c14f3ed9354f678707525a027f00720c134376a3c78cdcbf844344 size: 2411
```

### 1.6 WebUI を再度確認

```
http://11.0.1.121:5000/v2/_catalog
```

この時点で確認できる:

```json
{"repositories":["dawn-db/mysql"]}
```

イメージのアップロード成功を示す。

---

## 第 2 部: docker registry からのイメージプル

### 2.1 プライベートレジストリのアドレス設定

```bash
root@docker01:~/haha# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000"]
}
root@docker01:~/haha# systemctl restart docker
root@docker01:~/haha# docker info | grep "Insecure Registries" -A 3
 Insecure Registries:
  11.0.1.121:5000
  127.0.0.0/8
```

### 2.2 イメージをプル

```bash
root@docker01:~/haha# docker pull 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
8.4.1-oracle: Pulling from dawn-db/mysql
Digest: sha256:03a538f365c14f3ed9354f678707525a027f00720c134376a3c78cdcbf844344
Status: Downloaded newer image for 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle

root@docker01:~/haha# docker image ls 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
REPOSITORY                           TAG            IMAGE ID       CREATED        SIZE
11.0.1.121:5000/dawn-db/mysql        8.4.1-oracle   da8f2a99cf39   2 years ago    583MB
```

**registry の欠点**: プルする際、ユーザーがイメージ名を知らなければ、イメージが何という名前でどこにあるかまったく分からず、使い勝手が悪い。これが後で Harbor を導入する理由でもある。

---

## 第 3 部: docker registry のイメージ削除

### 3.1 イメージのメタデータ削除

```bash
root@docker01:~/haha# docker exec -it dawn-registry sh
/ # cd /var/lib/registry/docker/registry/v2/
/var/lib/registry/docker/registry/v2 # ls -l
total 8
drwxr-xr-x    3 root     root          4096 Oct 29 05:52 blobs
drwxr-xr-x    3 root     root          4096 Oct 29 05:52 repositories
/var/lib/registry/docker/registry/v2 # du -sh *
161.8M  blobs
164.0K  repositories
/var/lib/registry/docker/registry/v2 # ls repositories/
dawn-db
/var/lib/registry/docker/registry/v2 # rm -rf repositories/dawn-db/
/var/lib/registry/docker/registry/v2 # ls repositories/
/var/lib/registry/docker/registry/v2 # du -sh *
161.8M  blobs
4.0K   repositories
```

`repositories/` 配下のメタデータを削除しても、`blobs`（イメージの実データ層）は削除されず、領域はまだ解放されない。

### 3.2 ストレージを回収するためイメージデータをクリーンアップ

```bash
/var/lib/registry/docker/registry/v2 # registry garbage-collect /etc/distribution/config.yml
0 blobs marked, 12 blobs and 0 manifests eligible for deletion
blob eligible for deletion: sha256:eafccfd1ea14e7a7cc14a17f7e177399149b675253070b5149a41068b6989f1e
INFO[0000] Deleting blob: /docker/registry/v2/blobs/sha256/ea/eafccfd1ea14...
/var/lib/registry/docker/registry/v2 # du -sh *
52.0K  blobs
4.0K   repositories
```

`garbage-collect` を実行すると、`blobs` が 161.8M から 52.0K に減り、ストレージ領域が正常に回収された。

イメージの削除は面倒である。まずメタデータを手動で削除し、その後 GC を実行してデータを回収するという 2 段階の操作になり、これも registry が管理しにくい一例である。

---

## 第 4 部: Harbor の HTTP 展開事例

### 4.1 Harbor をダウンロード

```bash
root@docker02:~# ls -lh harbor-offline-installer-v2.7.4.tgz
-rw-r--r-- 1 root root 721M Oct 29 05:59 harbor-offline-installer-v2.7.4.tgz
```

### 4.2 パッケージを展開

```bash
root@docker02:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
root@docker02:~# ls /dawn/softwares/harbor/
common.sh  harbor.v2.7.4.tar.gz  harbor.yml.tmpl  install.sh  LICENSE  prepare
```

### 4.3 データディレクトリの準備

```bash
root@docker02:~# mkdir -pv /dawn/data/harbor
mkdir: created directory '/dawn/data'
mkdir: created directory '/dawn/data/harbor'
```

### 4.4 設定ファイルの準備

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# cp harbor.yml.tmpl harbor.yml
root@docker02:/dawn/softwares/harbor# vim harbor.yml
...
# Harbor サーバーのアドレスを指定
hostname: harbor.dawn.com

# https 機能をコメントアウト
#https:
#  # https port for harbor, default is 443
#  port: 443
#  # The path of cert and key files for nginx
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

# Harbor 管理者ユーザーのパスワードを変更
harbor_admin_password: 1

# データ保存ディレクトリを指定
data_volume: /dawn/data/harbor
```

### 4.5 Harbor のインストール開始

```bash
root@docker02:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
Loaded image: goharbor/trivy-adapter-photon:v2.7.4
Loaded image: goharbor/prepare:v2.7.4
Loaded image: goharbor/harbor-core:v2.7.4
Loaded image: goharbor/registry-photon:v2.7.4
Loaded image: goharbor/notary-server-photon:v2.7.4
Loaded image: goharbor/nginx-photon:v2.7.4
Loaded image: goharbor/notary-signer-photon:v2.7.4
Loaded image: goharbor/chartmuseum-photon:v2.7.4
Loaded image: goharbor/harbor-portal:v2.7.4
Loaded image: goharbor/harbor-log:v2.7.4
Loaded image: goharbor/harbor-db:v2.7.4
Loaded image: goharbor/harbor-exporter:v2.7.4

[Step 3]: preparing environment ...
[Step 4]: preparing harbor configs ...
Generated configuration file: /config/portal/nginx.conf
...
[Step 5]: starting Harbor ...
 Network harbor_harbor  Creating
 ...
 ✔ ----Harbor has been installed and started successfully.----
```

install.sh のインストール処理は順に以下を完了する:

1. docker と docker-compose がインストールされているか確認;
2. Harbor が必要とするイメージを取り込む（`docker load`）;
3. docker-compose.yaml と common ディレクトリを準備（`prepare` スクリプト）;
4. docker-compose を起動。

### 4.6 WebUI へのアクセス

http://11.0.1.122/harbor/projects

![image-20261029144827534](/images/docker-harbor-private-registry/image-20261029144827534.png)

インストール完了後、検証:

```bash
root@docker02:/dawn/softwares/harbor# docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
nginx               Up (health: starting)    0.0.0.0:80->8080/tcp
harbor-jobservice   Up (health: starting)
harbor-core         Up (health: starting)
harbor-db           Up (health: starting)
redis               Up (health: starting)
harbor-portal       Up (health: starting)
registry            Up (health: starting)
registryctl         Up (health: starting)
chartmuseum         Up (health: starting)
harbor-log          Up (health: starting)    127.0.0.1:1514->10514/tcp
```

Harbor は 10 個のコンテナで構成される。nginx（ポータルリバースプロキシ）、harbor-core（コア）、harbor-db（PostgreSQL データベース）、redis（キャッシュ）、harbor-portal（フロントエンド UI）、registry（イメージレジストリ）、registryctl、chartmuseum、jobservice、harbor-log（ログ）。

---

## 第 5 部: Harbor へのイメージプッシュ

### 5.1 ローカル hosts ファイルの名前解決を追加

```bash
root@docker01:~# echo 11.0.1.122 harbor.dawn.com >> /etc/hosts
root@docker01:~# grep harbor /etc/hosts
11.0.1.122 harbor.dawn.com
```

### 5.2 イメージの HTTP モードを追加

```bash
root@docker01:~# vim /etc/docker/daemon.json
{
  "registry-mirrors": [
      "https://docker.m.daocloud.io"
  ],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
```

### 5.3 Docker サービスを再起動

```bash
root@docker01:~# systemctl restart docker
root@docker01:~# docker info | grep "Insecure Registries" -A 4
 Insecure Registries:
  11.0.1.121:5000
  harbor.dawn.com
  127.0.0.0/8
```

### 5.4 Harbor レジストリで新規プロジェクト作成

WebUI で新規プロジェクト `dawn-games` を作成:

![image-20261029145115418](/images/docker-harbor-private-registry/image-20261029145115418.png)

### 5.5 テストイメージにタグ付け

```bash
root@docker01:~# docker tag dawn-games:v2.16 harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
root@docker01:~# docker images | grep 'dawn-games/dawn-games'
harbor.dawn.com/dawn-games/dawn-games   motuo-v0.1   fc30411c280a   17 hours ago   17.8MB
```

### 5.6 Harbor レジストリにログイン

3 つのログイン方式:

```bash
# 方式 1: 対話型ログイン
root@docker01:~# docker login harbor.dawn.com
Username: admin
Password:
Login Succeeded

# 方式 2: -p パラメータでのログイン（非安全と警告）
root@docker01:~# docker login -u admin -p 1 harbor.dawn.com
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded

# 方式 3: --password-stdin での安全なログイン（推奨）
root@docker01:~# echo 1 | docker login -u admin --password-stdin harbor.dawn.com
Login Succeeded
```

ログイン後、パスワードはローカルに保存される。使い終わったらログアウト:

```bash
root@docker01:~# more /root/.docker/config.json
{
    "auths": {
        "harbor.dawn.com": {
            "auth": "YWRtaW46MQ=="
        }
    }
}

# 復号すると平文のユーザー名とパスワードが見える
root@docker01:~# echo YWRtaW46MQ== | base64 -d | more
admin:1
```

### 5.7 イメージをプライベートレジストリにプッシュ

```bash
root@docker01:~# docker push harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
The push refers to repository [harbor.dawn.com/dawn-games/dawn-games]
c051b9573618: Pushed
d71c57700c5d: Pushed
1912927f1150: Pushed
74cacacc6bfe: Pushed
78561cef0761: Pushed
motuo-v0.1: digest: sha256:96e5e4e6d2745d53695d5afe62f39ccdbaa1b546ca24824cda36d6e9a2e583a9 size: 1778
```

### 5.8 WebUI を表示

http://harbor.dawn.com/harbor/projects/2/repositories/dawn-games

![image-20261029150418021](/images/docker-harbor-private-registry/image-20261029150418021.png)

この時点で `dawn-games` プロジェクト配下にリポジトリ `dawn-games/dawn-games` があり、その中に `motuo-v0.1` イメージが含まれている。

### 5.9 ログアウト

```bash
root@docker01:~# docker logout harbor.dawn.com
Removing login credentials for harbor.dawn.com

root@docker01:~# more /root/.docker/config.json
{
    "auths": {}
}
```

---

## 第 6 部: Harbor からのイメージプル

### 6.1 hosts の名前解決を設定

```bash
root@docker02:/dawn/softwares/harbor# echo "11.0.1.122 harbor.dawn.com" >> /etc/hosts
```

### 6.2 Docker の安全でないレジストリを設定

```bash
root@docker02:/dawn/softwares/harbor# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
root@docker02:/dawn/softwares/harbor# systemctl restart docker
```

### 6.3 イメージをプル

（このプロジェクト `dawn-games` は既に public に設定されており、ログインせずにプルできる）

```bash
root@docker02:/dawn/softwares/harbor# docker pull harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
motuo-v0.1: Pulling from dawn-games/dawn-games
c6a83fedfae6: Pull complete
9f5c3ad3fbc9: Pull complete
c44cfb6f2bc3: Pull complete
ac2ad8f66d49: Pull complete
0a45d138de7a: Pull complete
bdbb7eaafb83: Pull complete
0095e166c007: Pull complete
Digest: sha256:96e5e4e6d2745d53695d5afe62f39ccdbaa1b546ca24824cda36d6e9a2e583a9
Status: Downloaded newer image for harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1

root@docker02:/dawn/softwares/harbor# docker images | grep 'dawn-games/dawn-games'
harbor.dawn.com/dawn-games/dawn-games   motuo-v0.1   fc30411c280a   17 hours ago   17.8MB
```

---

## 第 7 部: Harbor のイメージ削除

![image-20261029150928929](/images/docker-harbor-private-registry/image-20261029150928929.png)

イメージの削除は Harbor の WebUI で操作するだけでよい（可視化され直感的）。これは registry と比べた Harbor の大きな利点であり、手動でのメタデータ削除 + GC という 2 段階操作が不要になる。

---

## 第 8 部: registry と Harbor の対比

| 比較項目   | docker registry           | VMware Harbor              |
| -------- | ------------------------- | -------------------------- |
| サイズ     | 約 20MB, 軽量              | 720MB インストーラ, 重い           |
| 展開     | 単一コンテナ `docker run`       | 10 コンテナ + docker-compose |
| WebUI    | なし（JSON API のみ）       | 完全な可視化 WebUI           |
| プロジェクト管理 | なし                        | プロジェクト・ユーザー・ロール・クォータをサポート |
| イメージ削除 | メタデータ手動削除 + GC（2 段階） | WebUI ワンクリック削除             |
| 適用シナリオ | 単純な社内一時利用          | エンタープライズ本番環境             |
