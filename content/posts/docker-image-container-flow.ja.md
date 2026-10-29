---
title: "Docker 実戦：イメージ取得からコンテナ起動までの全体フロー"
date: 2026-10-26T10:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker の三大コアオブジェクト、イメージレジストリ・イメージ・コンテナを順にたどります。ローカルのレジストリ一覧を確認し、リモートレジストリからイメージを取得し、コンテナを起動してアクセステストまで行います。"
---

# Docker 実戦：イメージ取得からコンテナ起動までの全体フロー

イメージ・コンテナ・イメージレジストリは Docker の三大コアオブジェクトです。レジストリはイメージの保存と配布を担い、イメージはレジストリから取得する読み取り専用のテンプレート、コンテナはイメージの実行インスタンスです。以下では「イメージレジストリ → イメージ → コンテナ」の順に、レジストリの確認とイメージの取得から、コンテナの起動とアクセス確認までの全体フローをたどります。

## イメージレジストリ

イメージレジストリはイメージの保存と配布の中心です。ローカルにあるレジストリの一覧を確認したり、リモートレジストリからイメージをローカルに取得したりできます。

### 1. ローカルのイメージレジストリ一覧を確認

```bash
root@docker02:~# docker image ls
REPOSITORY   TAG       IMAGE ID   CREATED   SIZE
```

## イメージ

イメージはレジストリから取得する読み取り専用のテンプレートで、それ自体は変更できません。更新するには再ビルドするか新しいバージョンを取得するしかありません。

### 2. リモートレジストリからイメージをダウンロード

```bash
root@docker02:~# docker pull uhub.service.ucloud.cn/dawn/nginx:1.30.4
1.30.4: Pulling from dawn/nginx
26c307b5e35a: Pull complete
7be390ba6238: Pull complete
d84ae7b21412: Pull complete
c0df8d325117: Pull complete
b8b80b9bc028: Pull complete
f5de6e85ac74: Pull complete
5a4222b844e8: Pull complete
Digest: sha256:9e4b33ead4c69e9845e53a1f175d0aa70a6cea62425b5d08957ba7eee5dc9b1d
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/nginx:1.30.4
uhub.service.ucloud.cn/dawn/nginx:1.30.4

root@docker02:~# docker image ls
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
```

フィールド説明:

- **REPOSITORY**: どのリポジトリからダウンロードされたか。
- **TAG**: 一般的に対応するバージョン。
- **IMAGE ID**: イメージの一意識別子。変更できません。
- **CREATED**: イメージの作成日時。
- **SIZE**: イメージのサイズ。

## コンテナ

コンテナはイメージの実行インスタンスで、イメージをもとに起動します。以下ではコンテナの起動と一覧確認、さらにコンテナ実行時のイメージ自動取得とアクセステストを実演します。

### 3. コンテナを起動

```bash
root@docker02:~# docker run -d -p 88:80 886dbea595a1
5053b48e3161bb34793f9f7b095f53bc878b7b4efef639a6edbb77bd3207e9a4
```

パラメータ説明:

- **-d**: コンテナをバックグラウンドで実行。
- **-p**: ポートマッピング「ホスト側ポート:コンテナ側ポート」を指定

### 4. 実行中のコンテナを確認

```bash
root@docker02:~# docker container ls
CONTAINER ID   IMAGE          COMMAND                  CREATED              STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   About a minute ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
root@docker02:~# docker container ps
CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   2 minutes ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
```

### 5. コンテナ実行時にローカルにイメージがない場合はリモートレジストリから自動取得します。リモートにイメージが存在しない場合は取得に失敗します (TAG を指定しない場合は既定で latest)

```bash
root@docker02:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
root@docker02:~# docker run -d -p 99:80 uhub.service.ucloud.cn/dawn/nginx:latest
Unable to find image 'uhub.service.ucloud.cn/dawn/nginx:latest' locally
latest: Pulling from dawn/nginx
062e450697fa: Pull complete
82454cdbf456: Pull complete
3c7ab7949321: Pull complete
cacfcdd01f30: Pull complete
b6698f04e005: Pull complete
2bedaf25031a: Pull complete
d26f27cc8c41: Pull complete
Digest: sha256:db4f612f385437d11eb26620a4f1d7efb3ff44e1296a3c21540b30454e6e2bf3
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/nginx:latest
8b9fd82e4e01fd8d2130ec1f3719e1dc15f878acfc2f6d8780be1ac9575d2779
root@docker02:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
uhub.service.ucloud.cn/dawn/nginx   latest    4e5db4761e0f   3 months ago   161MB
root@docker02:~# docker container ps
CONTAINER ID   IMAGE                                      COMMAND                  CREATED          STATUS          PORTS                               NAMES
8b9fd82e4e01   uhub.service.ucloud.cn/dawn/nginx:latest   "/docker-entrypoint.…"   38 seconds ago   Up 38 seconds   0.0.0.0:99->80/tcp, :::99->80/tcp   practical_elion
5053b48e3161   886dbea595a1                               "/docker-entrypoint.…"   5 minutes ago   Up 5 minutes    0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver

root@docker02:~# docker run -d -p 66:80 uhub.service.ucloud.cn/dawn/nginx:v6
Unable to find image 'uhub.service.ucloud.cn/dawn/nginx:v6' locally
docker: Error response from daemon: manifest for uhub.service.ucloud.cn/dawn/nginx:v6 not found: manifest unknown: manifest unknown.
See 'docker run --help'.
```

フィールド説明:

- **CONTAINER ID**: コンテナの ID。一意の識別子で変更できません。
- **IMAGE**: どのイメージから起動したか。
- **COMMAND**: コンテナ起動時に実行されるサービス。
- **CREATED**: コンテナの作成日時。
- **STATUS**: コンテナの状態。
- **PORTS**: コンテナのポートマッピング。
- **NAMES**: コンテナ名。作成時に指定でき、後から変更もできますが、名前は一意でなければなりません。

### 6. アクセステスト

  http://11.0.1.122:88/

![image-20261023131501886](/images/docker-image-container-flow-image-20261023131501886.png)

  http://11.0.1.122:99/

![image-20261023132022374](/images/docker-image-container-flow-image-20261023132022374.png)
