---
title: "Docker 実戦：イメージ移行 - save/load でのオフライン転送とタグ付け"
date: 2026-10-23T15:24:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker save でイメージをエクスポートし、SSH 経由でオフライン転送、md5sum で整合性を検証してから docker load でインポートし直してタグを付けます。save/load で IMAGE ID が維持されること、複数イメージの一括エクスポート、2 つのインポート形式、イメージの一括削除方法を解説します。"
---

# Docker 実戦：イメージ移行 - save/load でのオフライン転送とタグ付け

## イメージのローカル移行とタグ付け

1. イメージのエクスポート（docker02）

```bash
# docker save の 2 つの書き方は等価: -o <ファイル> と > リダイレクト
root@docker02:~# docker save -o /tmp/nginx-1304.tar uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker02:~# ls -lh /tmp/nginx-1304.tar
-rw------- 1 root root 158M Oct 23 06:20 nginx-1304.tar
root@docker02:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

2. ローカル移行（docker02 → docker01）

まず SSH 公開鍵の相互信頼を設定する

```bash
root@docker02:~# ssh-keygen
root@docker02:~# ssh-copy-id 11.0.1.121
```

docker02 から scp で転送

```bash
root@docker02:~# scp /tmp/nginx-1304.tar 11.0.1.121:/tmp/
```

docker01 で整合性を検証（ソース側の md5 と一致）

```bash
root@docker01:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

3. イメージのインポート（docker01）

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
Loaded image: uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker01:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
```

IMAGE ID `886dbea595a1` は docker02 上のソースイメージと完全に一致します - save/load 移行はイメージ自体を変更しません

4. タグを付ける

```bash
root@docker01:~# docker tag uhub.service.ucloud.cn/dawn/nginx:1.30.4 dawn/nginx:v1.30.4
root@docker01:~# docker images dawn/nginx
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
dawn/nginx   v1.30.4   886dbea595a1   2 months ago   161MB
```

5. 動作確認

```bash
root@docker01:~# docker run -d -p 85:80 --name web-test dawn/nginx:v1.30.4
461a06c0feb9cfbd23e5f49148a49de247d2aeb9ab3986a1c2d662ce412d084d
root@docker01:~# docker ps
NAMES      IMAGE                STATUS         PORTS
web-test   dawn/nginx:v1.30.4   Up 2 seconds   0.0.0.0:85->80/tcp, :::85->80/tcp
root@docker01:~# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:85/
HTTP 200
```



6. 複数のイメージを一度にエクスポート

```bash
root@docker02:~# docker save $(docker images --format '{{.Repository}}:{{.Tag}}') > all-images.tar
```

7. イメージをインポートする 2 つの方法

  方法 1:

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
```

  方法 2:

```bash
root@docker01:~# docker image load < /tmp/nginx-1304.tar
```

方法 2 でプロンプトがあまり出ない理由は、すでにインポート済みだからです。同じ効果を見るには、いったん削除してからインポートしてください。

8. イメージを一括削除する方法

  方法 1:

```bash
root@docker01:~# docker image rm `docker image ls -q`
```

  方法 2:

```bash
root@docker01:~# docker rmi `docker image ls -q`
```
