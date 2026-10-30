---
title: "K8S トラブルシューティング三種の神器実践：kubectl explain、cp、logs"
date: 2026-10-30T19:44:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は K8S の日常トラブルシューティングで最もよく使う 3 つのコマンドをまとめた。まず実行すると即座に終了する troubleshooting 用テストイメージをビルドし、次に kubectl explain で API Server の OpenAPI Schema を直接読んでフィールドの所属を調べる（ネットワーク不要）。続いて Pod 定義の command + args でイメージのデフォルト CMD を上書きし、一度きりで終了するコンテナを常駐させ exec で調査できるようにする。最後に kubectl cp でホストと Pod 間を双方向にファイルコピーし（設定を入れ、ログを出す）、Pod 異常時に最初に見るべき kubectl logs —— CrashLoopBackOff はこれで特定する。"
---

# K8S トラブルシューティング三種の神器実践：kubectl explain、cp、logs

---

## 1. 準備：troubleshooting 用テストイメージをビルド

```bash
[root@master ~]# mkdir -p /dawn/dockerfile/troubleshooting
[root@master ~]# cat > /dawn/dockerfile/troubleshooting/Dockerfile << 'EOF'
FROM harbor:443/dawn-linux/alpine:3.20.2
RUN mkdir /dawn-xixi
CMD ["ls","-l","/dawn-xixi"]
EOF

[root@master ~]# cd /dawn/dockerfile/troubleshooting
[root@master ~]# docker build -t harbor:443/dawn-troubleshooting/dawn-xixi:v0.1 .
Successfully built f8e96cb77a91

[root@master ~]# docker push harbor:443/dawn-troubleshooting/dawn-xixi:v0.1
v0.1: digest: sha256:43ed7f4b... size: 734
```

このイメージのデフォルト CMD は `ls -l /dawn-xixi` —— 実行すると即座に終了するコマンド。後で Pod 定義でこれを上書きし、コンテナを動かし続ける。

---

## 2. kubectl explain —— K8S 組み込みのドキュメント

`kubectl explain` はネットワークを使わず、API Server 内のリソースの OpenAPI Schema を直接読む：

```bash
[root@master ~]# kubectl explain pods
KIND:     Pod
VERSION:  v1
DESCRIPTION:
     Pod is a collection of containers that can run on a host.

[root@master ~]# kubectl explain pods.metadata
KIND:     Pod
VERSION:  v1
RESOURCE: metadata <Object>
DESCRIPTION:
     Standard object's metadata.
```

実際のトラブルシューティングで、例えば `volumeMounts` が `containers` の下か `spec` の下か忘れた場合、この方法で確認できる：

```bash
[root@master ~]# kubectl explain pods.spec.containers.volumeMounts
```

---

## 3. Troubleshooting Pod

### 3.1 CMD を上書き

先ほどビルドした `dawn-xixi:v0.1` イメージはデフォルトで `ls -l /dawn-xixi` を実行し、終わると終了する —— コンテナは `Completed` になり、`exec` で入って調査できない。

Pod 定義の `command` + `args` で `tail -f /etc/hosts` に上書きし、コンテナを動かし続ける：

```yaml
# 05-pods-Troubleshooting.yaml
apiVersion: v1
kind: Pod
metadata:
  name: www.dawn.com-dawn-002
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn-troubleshooting/dawn-xixi:v0.1
    name: mylinux
    command:
    - tail
    - -f
    args:
    - /etc/hosts
```

```bash
[root@master pods]# kubectl apply -f 05-pods-Troubleshooting.yaml
pod/www.dawn.com-dawn-002 created

[root@master pods]# kubectl get pods -o wide
NAME                       READY   STATUS    RESTARTS   AGE   IP            NODE
www.dawn.com-dawn-002   1/1     Running   0          5s    10.100.1.10   worker01
```

### 3.2 kubectl cp（ファイルコピー）

```bash
# ホスト → Pod
[root@master pods]# kubectl cp /etc/os-release www.dawn.com-dawn-002:/os-release
[root@master pods]# kubectl exec www.dawn.com-dawn-002 -- ls -l /os-release
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 /os-release -> ../usr/lib/os-release

# Pod → ホスト
[root@master pods]# kubectl cp www.dawn.com-dawn-002:/dawn-xixi/ ./xixi_tmp
[root@master pods]# ls -la ./xixi_tmp/
total 8
drwxr-xr-x 2 root root 4096 Oct 30 16:48 .
drwxr-xr-x 3 root root 4096 Oct 30 16:48 ..
```

ホストの設定ファイルをコンテナにコピーし、コンテナのログを外にコピーして解析する —— 双方向のチャネル。

### 3.3 kubectl logs（ログ確認）

```bash
[root@master pods]# kubectl logs www.dawn.com-dawn-002
# Kubernetes-managed hosts file.
127.0.0.1	localhost
::1	localhost ip6-localhost ip6-loopback
fe00::0	ip6-localnet
fe00::0	ip6-mcastprefix
```

Pod が落ちたらまず見るのは `kubectl logs` —— CrashLoopBackOff はこれで特定する。