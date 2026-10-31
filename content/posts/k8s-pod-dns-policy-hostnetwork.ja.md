---
title: "K8S Pod の DNS ポリシーと hostNetwork 実践：dnsPolicy の比較実験"
date: 2026-10-31T16:21:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は比較実験で K8S Pod の dnsPolicy と hostNetwork の関係を説明する。実験群は hostNetwork: true に加えて dnsPolicy: ClusterFirstWithHostNet を明示指定する。コンテナ内の /etc/resolv.conf はクラスタの CoreDNS を指し svc の検索ドメインも持つため、db-svc、kubernetes、kube-dns はいずれも名前解決できる。対照群は hostNetwork だけを有効にし dnsPolicy は既定の ClusterFirst のまま。resolv.conf はノード自身の DNS になり検索ドメインもなく、db-svc は解決に失敗する。結論：Pod がホストネットワークを使うなら、dnsPolicy は必ず ClusterFirstWithHostNet に変更する。"
---

# K8S Pod の DNS ポリシーと hostNetwork 実践：dnsPolicy の比較実験

### 1. hostNetwork + ClusterFirstWithHostNet

```bash
[root@master pods]# cat 14-pods-xiuxian-hostNetwork-dnsPolicy.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostnetwork-dnspolicy
  namespace: default
spec:
  # 指定しない場合の既定ポリシーは "ClusterFirst"。
  # ホストネットワークを使う場合は変更を推奨。さもないと svc の名前が解決できない
  dnsPolicy: "ClusterFirstWithHostNet"
  hostNetwork: true
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl apply -f 14-pods-xiuxian-hostNetwork-dnsPolicy.yaml 
pod/xiuxian-hostnetwork-dnspolicy created
[root@master pods]# kubectl get pods -o wide 
NAME                            READY   STATUS    RESTARTS   AGE     IP            NODE        NOMINATED NODE   READINESS GATES
xiuxian-hostnetwork-dnspolicy   1/1     Running   0          6s      11.0.1.232    worker01   <none>           <none>
```

```bash
[root@master pods]# kubectl exec xiuxian-hostnetwork-dnspolicy -- cat /etc/resolv.conf
nameserver 10.200.0.10
search default.svc.dawn.com svc.dawn.com dawn.com 
options ndots:5
```

resolv.conf は CoreDNS（10.200.0.10）を指し、svc の検索ドメインも入っているため、SVC 名が解決できる：

```bash
[root@master pods]# kubectl exec xiuxian-hostnetwork-dnspolicy -- ping -c 3 db-svc 
PING db-svc (10.200.74.120): 56 data bytes
--- db-svc ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss 
[root@master pods]# kubectl exec xiuxian-hostnetwork-dnspolicy -- ping -c 3 kubernetes
PING kubernetes (10.200.0.1): 56 data bytes
--- kubernetes ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
[root@master pods]# kubectl exec xiuxian-hostnetwork-dnspolicy -- ping -c 3 kube-dns.kube-system
PING kube-dns.kube-system (10.200.0.10): 56 data bytes
--- kube-dns.kube-system ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
[root@master pods]# kubectl exec xiuxian-hostnetwork-dnspolicy -- ping -c 3 kube-dns.kube-system.svc.dawn.com
PING kube-dns.kube-system.svc.dawn.com (10.200.0.10): 56 data bytes
--- kube-dns.kube-system.svc.dawn.com ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
```

### 2. 比較実験：dnsPolicy を変更しない場合の結果

```yaml
# 15-pods-xiuxian-hostNetwork-noDnsPolicy.yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostnetwork-nodnspolicy
  namespace: default
spec:
  hostNetwork: true          # 対照群：dnsPolicy を変更しない（既定の ClusterFirst）
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- cat /etc/resolv.conf
nameserver 11.0.1.2          # ノード自身の DNS を使っている。CoreDNS ではない
search                       # svc の検索ドメインがない
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- ping -c 2 db-svc
ping: bad address 'db-svc'   # SVC 名の解決に失敗
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- getent hosts db-svc
（出力なし）
```

`hostNetwork: true` のとき、既定の `ClusterFirst` ポリシーでは Pod がノードの DNS 設定を引き継ぐため SVC 名が解決できない。`ClusterFirstWithHostNet` なら Pod はクラスタの CoreDNS を使い続ける。ホストネットワークを使うなら、必ず DNS ポリシーを変更すること。