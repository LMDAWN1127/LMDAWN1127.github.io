---
title: "K8S Pod DNS Policy and hostNetwork in Practice: A dnsPolicy Comparison"
date: 2026-10-31T16:21:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article uses a control experiment to explain how a K8S Pod's dnsPolicy interacts with hostNetwork. The test Pod sets hostNetwork: true and explicitly sets dnsPolicy: ClusterFirstWithHostNet; inside the container /etc/resolv.conf points at the cluster CoreDNS and carries the svc search domains, so db-svc, kubernetes and kube-dns all resolve. The control Pod only enables hostNetwork and leaves dnsPolicy at its ClusterFirst default; resolv.conf becomes the node's own DNS with no search domains, and db-svc fails to resolve outright. Conclusion: once a Pod uses the host network, you must set dnsPolicy to ClusterFirstWithHostNet."
---

# K8S Pod DNS Policy and hostNetwork in Practice: A dnsPolicy Comparison

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
  # If not specified the default policy is "ClusterFirst",
  # If you use the host network, change it, otherwise svc names cannot be resolved
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

resolv.conf points at CoreDNS (10.200.0.10) and carries the svc search domains, so SVC names resolve:

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

### 2. Control Experiment: Leaving dnsPolicy Untouched

```yaml
# 15-pods-xiuxian-hostNetwork-noDnsPolicy.yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostnetwork-nodnspolicy
  namespace: default
spec:
  hostNetwork: true          # Control group: dnsPolicy left untouched (default ClusterFirst)
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- cat /etc/resolv.conf
nameserver 11.0.1.2          # This is the node's own DNS, not CoreDNS
search                       # No svc search domains
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- ping -c 2 db-svc
ping: bad address 'db-svc'   # SVC name resolution failed
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- getent hosts db-svc
(no output)
```

With `hostNetwork: true`, the default `ClusterFirst` policy makes the Pod inherit the node's DNS config, so SVC names cannot be resolved; `ClusterFirstWithHostNet` forces the Pod to keep using the cluster CoreDNS. If you use the host network, you must change the DNS policy.