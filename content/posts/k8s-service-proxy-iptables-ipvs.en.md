---
title: "K8S Service Proxy Mode in Practice: Deep Dive from iptables Three-Tier Chains to Kernel IPVS Tuning"
date: 2026-11-01T19:20:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "kube-proxy", "iptables", "ipvs"]
showToc: true
summary: "A deep dive into Kubernetes Service underlying traffic forwarding mechanisms, comparing the performance differences between iptables and IPVS, deconstructing the iptables three-tier chain probabilistic traffic distribution using kube-dns, and providing a complete hands-on guide to switching kube-proxy to IPVS mode in production."
---

# K8S Service Proxy Mode in Practice: Deep Dive from iptables Three-Tier Chains to Kernel IPVS Tuning

## Service Proxy Modes: iptables and ipvs

Underlying traffic forwarding for Kubernetes Services is implemented by **kube-proxy** on each node, which operates in two primary modes: **iptables** and **ipvs**.

### 1. Reasons to Recommend ipvs in Production

The iptables mode has two major drawbacks:

1. **Performance**: Each rule is attached to a chain. As the number of rules increases, the chain length grows, and evaluation traverses sequentially with an **O(N)** time complexity. In large-scale clusters with many Services, forwarding latency increases significantly.
2. **Maintainability**: Rules are auto-generated in massive quantities, making troubleshooting and inspection difficult when issues arise.

IPVS is based on kernel hash table lookups with an **O(1)** time complexity, and natively supports multiple scheduling algorithms such as rr (round-robin), wrr (weighted round-robin), and sh (source hashing).

### 2. Checking the Default Proxy Mode

```bash
[root@master ~]# kubectl get pods -n kube-system -l k8s-app=kube-proxy
NAME               READY   STATUS    RESTARTS        AGE
kube-proxy-c46br   1/1     Running   1 (6d21h ago)   6d22h
kube-proxy-lnxt2   1/1     Running   1 (6d21h ago)   6d22h
kube-proxy-r66sd   1/1     Running   1 (6d21h ago)   6d22h
```

```bash
[root@master ~]# kubectl -n kube-system logs kube-proxy-c46br | grep -iE 'proxier|mode'
I1101 02:45:06.865991       1 server_others.go:572] "Unknown proxy mode, assuming iptables proxy" proxyMode=""
I1101 02:45:06.938892       1 server_others.go:206] "Using iptables Proxier"
```

The default is iptables mode.

### 3. Principles: Deconstructing the iptables Three-Tier Chains Using kube-dns

First, check the mapping between the Service and Pods:

```bash
[root@master ~]# kubectl get pods -n kube-system -l k8s-app=kube-dns --show-labels -o wide
NAME                      READY   STATUS   RESTARTS   AGE     IP           NODE      LABELS
coredns-6d8c4cb4d-qkn74   1/1     Running  0          2d4h    10.100.0.8   master    k8s-app=kube-dns,pod-template-hash=6d8c4cb4d
coredns-6d8c4cb4d-vxxvm   1/1     Running  0          2d4h    10.100.0.9   master    k8s-app=kube-dns,pod-template-hash=6d8c4cb4d

[root@master ~]# kubectl -n kube-system describe svc kube-dns
Name:              kube-dns
Selector:          k8s-app=kube-dns
Type:              ClusterIP
IP:                10.200.0.10
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.0.8:53,10.100.0.9:53
Port:              dns-tcp  53/TCP
TargetPort:        53/TCP
Endpoints:         10.100.0.8:53,10.100.0.9:53
```

Traffic targeting `10.200.0.10:53` traverses three tiers of chains in the kernel:

**Tier 1: KUBE-SERVICES (Entry Matching)**:

```bash
[root@master ~]# iptables-save | grep 10.200.0.10
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:metrics cluster IP" -m tcp --dport 9153 -j KUBE-SVC-JD5MR3NA4I4DYORP
-A KUBE-SERVICES -d 10.200.0.10/32 -p udp -m comment --comment "kube-system/kube-dns:dns cluster IP" -m udp --dport 53 -j KUBE-SVC-TCOU7JCQXEZGVUNU
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-SVC-ERIFXISQEP7F7OF4
```

**Tier 2: KUBE-SVC (Probabilistic Traffic Distribution)**:

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SVC-ERIFXISQEP7F7OF4 '
-A KUBE-SVC-ERIFXISQEP7F7OF4 ! -s 10.100.0.0/16 -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-MARK-MASQ
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-Y2IVGQXMLZPHRU2B
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -j KUBE-SEP-55K34TL23KTTOOX5
```

Two backends: the first rule has a 50% probability, and the second serves as the fallback—effectively achieving 1:1 load balancing.

**Tier 3: KUBE-SEP (DNAT to Real Pod)**:

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SEP' | grep 10.100.0
-A KUBE-SEP-Y2IVGQXMLZPHRU2B -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.8:53
-A KUBE-SEP-55K34TL23KTTOOX5 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.9:53
```

**Complete Data Path**:

```
Access 10.200.0.10:53
  → KUBE-SERVICES matches destination IP + port
  → KUBE-SVC selects a SEP based on random probability
  → KUBE-SEP performs DNAT
  → Traffic arrives at 10.100.0.8:53 or 10.100.0.9:53 (Real Pod)
```

### 4. Complete Hands-on Practice: Switching to ipvs

**① Install dependencies on all nodes**

```bash
[root@master ~]# apt -y install conntrack ipvsadm
[root@worker01 ~]# apt -y install conntrack ipvsadm
[root@worker02 ~]# apt -y install conntrack ipvsadm
```

**② Write kernel module loading script (all nodes)**

```bash
[root@master ~]# mkdir -pv /etc/sysconfig/modules
mkdir: created directory '/etc/sysconfig/modules'

[root@master ~]# cat > /etc/sysconfig/modules/ipvs.modules <<EOF
#!/bin/bash

modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- ip_conntrack
EOF
```

**③ Load and verify modules**

```bash
[root@master ~]# chmod 755 /etc/sysconfig/modules/ipvs.modules && bash /etc/sysconfig/modules/ipvs.modules && lsmod | grep -e ip_vs -e nf_conntrack_ipv4
ip_vs_sh               16384  0
ip_vs_wrr              16384  0
ip_vs_rr               16384  0
ip_vs                 176128  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr
nf_conntrack          172032  6 xt_conntrack,nf_nat,xt_nat,nf_conntrack_netlink,xt_MASQUERADE,ip_vs
```

**④ Modify kube-proxy ConfigMap**

```bash
[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e 's/mode: ""/mode: "ipvs"/' | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl -n kube-system describe cm kube-proxy | egrep "mode|strictARP"
  strictARP: true
mode: "ipvs"
```

`strictARP: true` is a prerequisite for LB solutions like MetalLB, ensuring precise ARP responses and preventing IP drift.

**⑤ Delete kube-proxy Pods to trigger recreation (delete one by one, not all at once)**

```bash
[root@master ~]# kubectl get pods -n kube-system -l  k8s-app=kube-proxy -o jsonpath="{.items[*].metadata.name}" | xargs -n1 kubectl -n kube-system delete pod
pod "kube-proxy-c46br" deleted
pod "kube-proxy-lnxt2" deleted
pod "kube-proxy-r66sd" deleted

[root@master ~]# kubectl get pods -n kube-system -l  k8s-app=kube-proxy
NAME               READY   STATUS    RESTARTS   AGE
kube-proxy-j7js7   1/1     Running   0          5s
kube-proxy-lsxcn   1/1     Running   0          12s
kube-proxy-mzbpc   1/1     Running   0          18s
```

**⑥ Verify changes took effect**

```bash
[root@master ~]# kubectl -n kube-system logs kube-proxy-mzbpc | grep -iE 'proxier|scheduler'
I1101 09:10:07.098284       1 server_others.go:269] "Using ipvs Proxier"
I1101 09:10:07.104478       1 proxier.go:435] "IPVS scheduler not specified, use rr by default"

[root@master ~]# ipvsadm -ln | grep 10.200.0.10 -A 2
TCP  10.200.0.10:53 rr
  -> 10.100.0.8:53                Masq    1      0          0
  -> 10.100.0.9:53                Masq    1      0          0
TCP  10.200.0.10:9153 rr
  -> 10.100.0.8:9153              Masq    1      0          0
  -> 10.100.0.9:9153              Masq    1      0          0
UDP  10.200.0.10:53 rr
  -> 10.100.0.8:53                Masq    1      0          0
  -> 10.100.0.9:53                Masq    1      0          0
```

The iptables "probabilistic chains" have been converted into virtual service tables (VS/RS) in the kernel, achieving O(1) lookup.
