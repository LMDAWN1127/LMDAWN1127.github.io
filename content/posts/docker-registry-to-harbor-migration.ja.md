---
title: "docker registry から Harbor へのイメージ移行と双 Harbor 間同期の実践"
date: 2026-10-29T20:04:45+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本実践では docker registry のイメージを Harbor へ移行し、2 つの Harbor 間でイメージを同期する。第 1 部は Harbor の pull レプリケーションルールを使って registry 内の `dawn-games/**` イメージをローカルの Harbor プロジェクトに同期する。第 2 部は docker01 と docker02 の両ノードに Harbor を展開し、Harbor→Harbor の pull モードレプリケーションルールを設定して双 Harbor イメージ同期を実現し、最後にクライアントの daemon.json を修正して検証する。"
---

# docker registry から Harbor へのイメージ移行と双 Harbor 間同期の実践

## 1. docker registry から Harbor レジストリへのイメージ移行

### 1. docker registry でのテストイメージ準備

```bash
root@docker01:~# docker tag dawn-games:motuo-v0.1 11.0.1.121:5000/dawn-games/motuo:v0.1
root@docker01:~# docker push 11.0.1.121:5000/dawn-games/motuo:v0.1
The push refers to repository [11.0.1.121:5000/dawn-games/motuo]
v0.1: digest: sha256:7d82ead138ecd7aac243397261c10db595d4dfec4768c810747de3d92fed52d3 size: 1569

root@docker01:~# docker push 11.0.1.121:5000/dawn-games/doudizhu:v0.1
The push refers to repository [11.0.1.121:5000/dawn-games/doudizhu]
71fd8b81ea67: Mounted from dawn-games/motuo
v0.1: digest: sha256:adabbc8e7ea0bc5858223c414832e3fdd21bffb4a78ece88c6b67895b0eec9a0 size: 1571

root@docker01:~# docker push 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
The push refers to repository [11.0.1.121:5000/dawn-db/mysql]
...
8.4.1-oracle: digest: sha256:ed172c8a1e69201bdf4aa92521781f8c50ebc57a1ed1bbaff51de7232d81fb45 size: 2411
```

### 2. WebUI へのアクセスとテスト検証

ブラウザで `http://11.0.1.121:5000/v2/_catalog` を開くと、次の応答が返る：

```json
{"repositories":["dawn-db/mysql","dawn-games/doudizhu","dawn-games/motuo"]}
```

![image-20261029183043727](/images/docker-registry-to-harbor-migration/image-20261029183043727.png)

### 3. ターゲットの作成

![image-20261029190918435](/images/docker-registry-to-harbor-migration/image-20261029190918435.png)

### 4. レプリケーションルールの作成

pull モードのレプリケーションルールを作成し、registry からローカルの `dawn-games` プロジェクトへ `dawn-games/**` を同期する

![image-20261029191121516](/images/docker-registry-to-harbor-migration/image-20261029191121516.png)

### 5. 手動トリガとプル成功の検証

![image-20261029191158194](/images/docker-registry-to-harbor-migration/image-20261029191158194.png)

同期完了後、dawn-games プロジェクト配下のイメージはプライベートプロジェクトに設定され、プルにはログインが必要になる。

### 6. イメージレジストリを公開に設定

![image-20261029192604436](/images/docker-registry-to-harbor-migration/image-20261029192604436.png)

---

## 2. Harbor のイメージ同期（双 Harbor）

### 1. docker01 ノードでの Harbor レジストリ新規作成

**1.1 パッケージのコピー**

```bash
root@docker02:~# scp harbor-offline-installer-v2.7.4.tgz 11.0.1.121:~
```

**1.2 パッケージの展開**

```bash
root@docker01:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
```

**1.3 設定ファイルの生成**

```bash
root@docker01:~# cd /dawn/softwares/harbor/
root@docker01:/dawn/softwares/harbor# cp harbor.yml{.tmpl,}
```

**1.4 Harbor 設定ファイルの修正**

```yaml
hostname: 11.0.1.121

#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: 1

data_volume: /dawn/data/harbor
```

**1.5 Harbor のインストール**

```bash
root@docker01:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
✔ ----Harbor has been installed and started successfully.----

root@docker01:/dawn/softwares/harbor# docker ps --format '{{.Names}} {{.Status}}'
nginx Up (healthy)
harbor-core Up (healthy)
harbor-db Up (healthy)
redis Up (healthy)
harbor-portal Up (healthy)
registry Up (healthy)
registryctl Up (healthy)
chartmuseum Up (healthy)
harbor-jobservice Up (healthy)
harbor-log Up (healthy)
```

### 2. docker02 ノードでの Harbor レジストリ新規作成

docker02 には既に Harbor がデプロイされている（hostname `harbor.dawn.com`）。ここではこれを再利用する。

### 3. docker02 ノードでのレプリケーションルール作成（Harbor → Harbor、pull モード）

まず docker02 の Harbor で docker01 Harbor を指す registry endpoint を作成する：

![image-20261029195149633](/images/docker-registry-to-harbor-migration/image-20261029195149633.png)

次に docker01-harbor から `dawn-linux/**` を同期する pull レプリケーションルールを作成する：

![image-20261029195222043](/images/docker-registry-to-harbor-migration/image-20261029195222043.png)

### 4. クライアント設定ファイルの修正

```bash
root@docker02:~# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com", "11.0.1.121"]
}
root@docker02:~# systemctl restart docker
```

docker02 ホストにも Harbor がデプロイされており、docker の再起動に伴いローカルの Harbor コンテナも停止するため、`cd /dawn/softwares/harbor && docker-compose up -d` で復旧する必要がある。

### 5. レプリケーションの手動トリガ

![image-20261029195251514](/images/docker-registry-to-harbor-migration/image-20261029195251514.png)