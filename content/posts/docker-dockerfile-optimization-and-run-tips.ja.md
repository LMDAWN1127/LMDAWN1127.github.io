---
title: "Docker 実戦：Dockerfile 最適化のコツとコンテナ起動テクニック"
date: 2026-10-28T19:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker の効率化コツをまとめます。ビルド側はイメージレイヤーキャッシュ(Using cache)と .dockerignore で 1GB のビルドコンテキストを約 1.6MB に削減、実行側は docker exec -w の作業 ディレクトリ指定、匿名ボリュームのホストパス(/var/lib/docker/volumes/<hash>/_data)、-p :80 のランダムポートマッピング(32768~60999)を解説。"
---

# Docker 実戦：Dockerfile 最適化のコツとコンテナ起動テクニック

Dockerfile を書いたりコンテナを起動したりする際、最も見落とされがちなのは「どうすれば速く、どうすれば小さく、どうすれば便利か」という点です。本記事では頻出する実用的なコツをまとめました。ビルド側ではイメージレイヤーのキャッシュ(Using cache)の仕組みと、`.dockerignore` で膨らんだビルドコンテキストを削る方法を解説し、実行側ではコンテナ入室後の作業ディレクトリを指定する `docker exec -w`、匿名ボリュームのホスト上の保存場所、そして `-p :80` のランダムポートマッピングを実演します。どれもすぐに使える効率化の手法です。

## Dockerfile 最適化のコツ

### コツ 1: イメージレイヤーのキャッシュ

再ビルド時、変更のないレイヤーはキャッシュにヒットします(`Using cache`):

```bash
docker image build -t dawn-games:v2.8 . 2>&1 | grep -E 'Step|Using cache'
```

```
Step 2/7 : RUN ... apk add nginx ...   <- 変更なし、キャッシュヒット
 ---> Using cache
 ---> 2a68b3185350
Step 3/7 : ADD code/dawn-tanke.tar.gz ...  <- tar パッケージ変更、再実行
 ---> 9b1dba3f40f1
```

Docker は各命令の実行結果をキャッシュし、命令の内容や依存レイヤーが変更された場合にのみ再実行します。そのため、あまり変更しない命令を上に、頻繁に変更する命令を下に配置すれば、キャッシュを最大限活用してビルドを高速化できます。

---

### コツ 2: .dockerignore でファイルを無視する

1. 大きなファイルを作る

```bash
cd /dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS
dd if=/dev/zero of=./bigfile bs=1M count=1024
```

2. .dockerignore なしでビルドする（ビルドコンテキストが膨張）

```bash
docker image build -t dawn-games:v2.12 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.075GB
```

このとき 1GB の bigfile が丸ごと Docker デーモンに送信され、時間と帯域を無駄にします。

3. .dockerignore を書く

```
big*
*.exe
*.txt
*.log
# config
```

| ルール | 効果 |
| --- | --- |
| \`big*\` | big で始まるファイルをすべて無視（例: bigfile） |
| \`*.exe\` / \`*.txt\` / \`*.log\` | 指定した拡張子を無視 |
| \`# config\` | コメント |

4. .dockerignore 適用後にビルドする（サイズ急減）

```bash
docker image build -t dawn-games:v2.13 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.623MB
```

### Dockerfile 最適化まとめ

**ビルド速度**

1. あまり変更しない命令を上に、頻繁に変更する命令を下に配置してキャッシュ効率を最大化;
2. ビルドに不要なファイルは `.dockerignore` で無視;
3. 国内ミラー（例: 清華ミラー）やローカルレジストリを使ってダウンロードを高速化;
4. 大きなパッケージはローカル/社内ファイルサーバーに置き、繰り返しダウンロードを回避.

**イメージサイズ**

1. キャッシュや不要なパッケージを削除（例: `rm -rf /var/cache/`）;
2. 不要なイメージレイヤーを減らすため命令を可能な限り統合（各命令は中間レイヤーを 1 つ生成、`docker image ls -a` で確認可能）;
3. より小さなベースイメージを使用（例: alpine、約 5MB）.

---

## コンテナ起動テクニック

### 1. コンテナ入室後の作業ディレクトリを指定

```bash
# exec -w はコンテナ入室後の作業ディレクトリを指定
root@docker01:~# docker exec -w /usr/share/nginx/html/tanke games pwd
/usr/share/nginx/html/tanke
```

### 2. 匿名ボリューム

```bash
# -v コンテナパス
root@docker01:~# docker run -d --name game -v /usr/share/nginx/html dawn-games:v2.8
1aa0eb13c9dbb5a35018543ed125ad855a53a7f6df27519447bd94b407b25f5e
# 匿名ボリュームのホスト上の場所を確認
root@docker01:~# docker inspect -f '{{range .Mounts}}{{.Source}}{{end}}' game
/var/lib/docker/volumes/d700421bb6aa4da3f55bf98a8700218471410adb6494805aae5d410c832a9c96/_data
```

匿名ボリュームは Docker がランダムなボリューム名を割り当て、`/var/lib/docker/volumes/<hash>/_data` に保存されます。ホストパスを指定したくないが永続化は必要な場面に適しています。

### 3. ランダムポートマッピング

```bash
# ランダムポートマッピング（-p :80 はホストポートを省略）
root@docker01:~# docker run -dp :80 --name c2-tanke dawn-games:v2.8
fa72c4ac0470a15e7b5c5e9143190ccb7c66f1db715aa0c886a3db4d533c8c4b
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                                     NAMES
fa72c4ac0470   dawn-games:v2.8   "nginx -g 'daemon of."   8 seconds ago   Up 7 seconds   0.0.0.0:32769->80/tcp, :::32769->80/tcp   c2-tanke
```

コロンの前のホストポートを省略すると、Docker が `32768~60999` の範囲からランダムなポートを割り当てます。
