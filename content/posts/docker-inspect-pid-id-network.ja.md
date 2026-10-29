---
title: "Docker 実戦：inspect でコンテナの PID・ID・ネットワーク情報を確認"
date: 2026-10-26T13:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker container inspect -f と Go テンプレートを使って、コンテナの PID・ID・IP アドレス・ゲートウェイ・MAC アドレスを取り出します。"
---

# Docker 実戦：inspect でコンテナの PID・ID・ネットワーク情報を確認

## 1. コンテナのプロセス ID（PID）を確認

```bash
root@docker02:~# docker container inspect -f "{{ .State.Pid }}" c1
4800
```

## 2. コンテナ ID を確認

```bash
root@docker02:~# docker container inspect -f "{{ .Id }}" c1
ece223aa9840347b908016a8b665f68ac87185aceea0a8ab3ccd508de90c12b5
```

## 3. IP アドレス情報を確認

```bash
root@docker02:~# docker container inspect -f "{{ .NetworkSettings.IPAddress }}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ .NetworkSettings.Networks.bridge.IPAddress }}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .IPAddress }}{{end}}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .Gateway }}{{end}}" c1
172.17.0.1
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .MacAddress }}{{end}}" c1
02:42:ac:11:00:05
```

## 4. 直近で作成されたコンテナの IP アドレスを確認

```bash
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" `docker container ps -lq`
172.17.0.5
```
