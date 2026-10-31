---
title: "K8S Pod DNS 정책과 hostNetwork 실전: dnsPolicy 비교 실험"
date: 2026-10-31T16:21:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 대조 실험으로 K8S Pod 의 dnsPolicy 와 hostNetwork 관계를 설명한다. 실험군은 hostNetwork: true 와 함께 dnsPolicy: ClusterFirstWithHostNet 을 명시한다. 컨테이너 안 /etc/resolv.conf 는 클러스터 CoreDNS 를 가리키고 svc 검색 도메인도 있어 db-svc, kubernetes, kube-dns 가 모두 해석된다. 대조군은 hostNetwork 만 켜고 dnsPolicy 는 기본값 ClusterFirst 로 둔다. resolv.conf 가 노드 자신의 DNS 가 되고 검색 도메인도 없어 db-svc 해석이 실패한다. 결론: Pod 가 호스트 네트워크를 쓰면 dnsPolicy 를 반드시 ClusterFirstWithHostNet 으로 바꿔야 한다."
---

# K8S Pod DNS 정책과 hostNetwork 실전: dnsPolicy 비교 실험

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
  # 지정하지 않으면 기본 정책은 "ClusterFirst",
  # 호스트 네트워크를 쓴다면 변경을 권장. 그렇지 않으면 svc 이름을 해석할 수 없다
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

resolv.conf 가 CoreDNS（10.200.0.10）를 가리키고 svc 검색 도메인도 들어 있어 SVC 이름을 해석할 수 있다:

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

### 2. 대조 실험: dnsPolicy 를 바꾸지 않은 결과

```yaml
# 15-pods-xiuxian-hostNetwork-noDnsPolicy.yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostnetwork-nodnspolicy
  namespace: default
spec:
  hostNetwork: true          # 대조군: dnsPolicy 를 바꾸지 않음（기본 ClusterFirst）
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- cat /etc/resolv.conf
nameserver 11.0.1.2          # 노드 자신의 DNS 를 사용. CoreDNS 가 아니다
search                       # svc 검색 도메인 없음
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- ping -c 2 db-svc
ping: bad address 'db-svc'   # SVC 이름 해석 실패
[root@master pods]# kubectl exec xiuxian-hostnetwork-nodnspolicy -- getent hosts db-svc
（출력 없음）
```

`hostNetwork: true` 일 때 기본 `ClusterFirst` 정책은 Pod 가 노드의 DNS 설정을 그대로 물려받게 해 SVC 이름을 해석할 수 없다. `ClusterFirstWithHostNet` 은 Pod 가 클러스터 CoreDNS 를 계속 쓰도록 강제한다. 호스트 네트워크를 썼다면 반드시 DNS 정책을 바꿔야 한다.