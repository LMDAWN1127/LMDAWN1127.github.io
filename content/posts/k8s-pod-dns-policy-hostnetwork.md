---
title: "K8S Pod DNS 策略与 hostNetwork 实战：dnsPolicy 对照实验"
date: 2026-10-31T16:21:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文用一组对照实验讲清 K8S Pod 的 dnsPolicy 与 hostNetwork 的关系。实验组把 Pod 设为 hostNetwork: true 并显式指定 dnsPolicy: ClusterFirstWithHostNet，进容器看 /etc/resolv.conf 指向集群 CoreDNS 且带 svc 搜索域，能解析 db-svc、kubernetes、kube-dns 等名称；对照组只开 hostNetwork、不改 dnsPolicy（默认 ClusterFirst），resolv.conf 变成节点自己的 DNS 且没有搜索域，db-svc 直接解析失败。结论：Pod 一旦使用宿主机网络，就必须把 dnsPolicy 改成 ClusterFirstWithHostNet。"
---

# K8S Pod DNS 策略与 hostNetwork 实战：dnsPolicy 对照实验

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
  # 若不指定，默认策略为"ClusterFirst"，
  # 如果使用了宿主机网络，建议修改，否则无法解析svc的名称
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

resolv.conf 指向 CoreDNS（10.200.0.10）且带 svc 搜索域，因此 SVC 名称可以解析：

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

### 2. 对照实验：不修改dnsPolicy的结果

```yaml
# 15-pods-xiuxian-hostNetwork-noDnsPolicy.yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostnetwork-nodnspolicy
  namespace: default
spec:
  hostNetwork: true          # 对照组：不修改 dnsPolicy（默认 ClusterFirst）
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- cat /etc/resolv.conf
nameserver 11.0.1.2          # 用的是节点自己的 DNS，不是 CoreDNS
search                       # 没有 svc 搜索域
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- ping -c 2 db-svc
ping: bad address 'db-svc'   # SVC 名称解析失败
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- getent hosts db-svc
（无输出）
```

`hostNetwork: true` 时，默认的 `ClusterFirst` 策略会让 Pod 沿用节点的 DNS 配置，导致 SVC 名称无法解析；`ClusterFirstWithHostNet` 则强制 Pod 仍走集群 CoreDNS。用了宿主机网络，就一定要改 DNS 策略。