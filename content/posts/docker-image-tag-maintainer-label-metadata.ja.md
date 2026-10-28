---
title: "Docker 実戦：MAINTAINER と LABEL でイメージにタグを付け、メタデータを確認する"
date: 2026-10-28T19:40:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "実際の dawn-games イメージを例に、Dockerfile に非推奨の MAINTAINER と公式推奨の LABEL で 作成者/学校/メールなどのメタデータを記録し、docker image inspect -f で .Author と .Config.Labels を 読み出して確認、さらに --network host でコンテナを起動してホストネットワーク経由でアクセスします。スクリーンショット付き。"
---

# Docker 実戦：MAINTAINER と LABEL でイメージにタグを付け、メタデータを確認する

イメージにタグを付けるのはリリースフローの基本です。実際の `dawn-games` イメージを例に、本記事では（すでに非推奨の）`MAINTAINER` 命令とより正統な `LABEL` 命令で Dockerfile に作成者や学校、メールなどのメタデータを書き込みます。ビルド後、`docker image inspect -f '{{.Author}}'` / `'{{.Config.Labels.xxx}}'` で各フィールドを読み出して確認し、さらに `--network host` でコンテナを直接起動しホストネットワーク経由でアクセスして検証します。（アクセス画面のスクリーンショット付き）

## イメージにタグを付ける

### 1. Dockerfile を書く

```dockerfile
FROM alpine:3.20.2

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/tanke

ADD code/dawn-tanke.tar.gz /usr/share/nginx/html/tanke

COPY config/games.conf /etc/nginx/http.d/default.conf

# 著作権、作成者情報、メール、会社の Web サイトなどを宣言。可読性が低いため非推奨。
MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

# 公式の推奨は MAINTAINER の代わりに LABEL 命令を使うこと
LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

CMD ["nginx","-g","daemon off;"]
```

### 2. nginx 設定ファイル

```json
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tanke;
    server_name   game01.dawn.com;
}
```

### 3. イメージをビルド

```bash
cd /dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS
docker image build -t dawn-games:v2.8 .
```

```bash
Sending build context to Docker daemon  1.622MB
Step 1/7 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 2/7 : RUN ... apk add nginx ... mkdir -pv /usr/share/nginx/html/tanke
 ---> 2a68b3185350
Step 3/7 : ADD code/dawn-tanke.tar.gz /usr/share/nginx/html/tanke
 ---> 9b1dba3f40f1
Step 4/7 : COPY config/games.conf /etc/nginx/http.d/default.conf
 ---> 58cf04d5506f
Step 5/7 : MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha
 ---> df0daa469d88
Step 6/7 : LABEL school=czu class=computer01 auther=dawn email=... office=...
 ---> 5dd0fd143c26
Step 7/7 : CMD ["nginx","-g","daemon off;"]
 ---> dbe04590110b
Successfully tagged dawn-games:v2.8
```

---

### 4. イメージのメタデータを確認

Author を確認（MAINTAINER が書き込む）

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Author}}' dawn-games:v2.8
dawn 123456@dawn.com www.dawn.com xixi haha
```

Labels の特定フィールドを確認

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Config.Labels.auther}}' dawn-games:v2.8
dawn
```

Labels 全体を確認（JSON 形式）

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-LABELS# docker image inspect -f '{{json .Config.Labels}}' dawn-games:v2.8
{"auther":"dawn","class":"computer01","email":"123456@dawn.com","office":"www.dawn.com","school":"czu"}
```

### 5. コンテナを起動してテスト

```bash
docker container run -d --name games --network host dawn-games:v2.8
```

`--network host` で起動すると、コンテナはホストの 80 ポートを直接使うためポートマッピングは不要です。

**ブラウザでアクセス**:

```
# ローカルの hosts に追加:
11.0.1.121  game01.dawn.com

# ブラウザ:
http://game01.dawn.com/
```

![image-20261028194608894](/images/docker-image-tag-maintainer-label-metadata-image-20261028194608894.png)
