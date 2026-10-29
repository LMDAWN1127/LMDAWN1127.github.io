---
title: "Docker 実戦：Nginx ロードバランシングとコンテナトラフィック分散"
date: 2026-10-26T11:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "lb コンテナと web コンテナ 2 つを起動し、lb 上の Nginx default.conf を編集して web01/web02 にリバースプロキシし、lb に 10 回 curl してトラフィックが 2 つのバックエンド間で交互に振り分けられることを確認します。"
---

# Docker 実戦：Nginx ロードバランシングとコンテナトラフィック分散

## 1. コンテナ lb、web01、web02 を 3 つ起動

```bash
root@docker02:~# docker run -d --name web01 uhub.service.ucloud.cn/dawn/apps:v1
03f912ea4eb722403408e5a4ed7014398131ae3fc55bd411f572ac72ae656b05
root@docker02:~# docker run -d --name web02 uhub.service.ucloud.cn/dawn/apps:v1
9b54bfd5df24bb64f49f69f9dc417667602c9c244fdb2278faf7ade52f7ed605
root@docker02:~# docker run -d --name lb -p 88:80 uhub.service.ucloud.cn/dawn/apps:v1
36b2783a8f4c7f05bc7e012ea2fd00dfa7a2a5ec78d3bf5c078a3d772fc8dbae
```

## 2. lb の IP にアクセスし、web01 と web02 のテストページにプロキシ

```bash
root@docker02:~# docker exec -it web01 sh
/ # echo web01 > /usr/share/nginx/html/index.html
/ # ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:02
          inet addr:172.17.0.2  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:12 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1016 (1016.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

/ # exit
root@docker02:~# docker exec -it web02 sh
/ # echo web02 > /usr/share/nginx/html/index.html
/ # ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:03
          inet addr:172.17.0.3  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:11 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:866 (866.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

/ # exit
root@docker02:~# docker exec -it lb sh
/ # vi /etc/nginx/conf.d/default.conf
/ #
/ #
/ # nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
/ # nginx -s reload
2026/10/26 03:58:03 [notice] 42#42: signal process started
/ # exit
root@docker02:~# docker restart lb
lb
root@docker02:~# docker ps
CONTAINER ID   IMAGE                                 COMMAND                  CREATED         STATUS          PORTS                               NAMES
36b2783a8f4c   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   8 minutes ago   Up 10 seconds   0.0.0.0:88->80/tcp, :::88->80/tcp   lb
9b54bfd5df24   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes    80/tcp                              web02
03f912ea4eb7   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   9 minutes ago   Up 9 minutes    80/tcp                              web01
```

## 3. lb コンテナに 10 回アクセスした結果は以下の通り

```bash
root@docker02:~# for i in `seq 10`;do curl 11.0.1.122:88;done
web01
web02
web01
web02
web01
web02
web01
web02
web01
web02
```
