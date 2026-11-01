---
title: "K8S Service 代理模式实战：从 iptables 三层链到内核级 IPVS 调优"
date: 2026-11-01T19:20:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "kube-proxy", "iptables", "ipvs"]
showToc: true
summary: "深入剖析 Kubernetes Service 底层流量转发机制，对比 iptables 与 IPVS 的性能差异，通过 kube-dns 拆解 iptables 三层链概率分流机制，并提供生产环境 kube-proxy 切换为 IPVS 模式的完整实操与验证流程。"
---

# K8S Service 代理模式实战：从 iptables 三层链到内核级 IPVS 调优

## Service 的代理模式：iptables 与 ipvs

Service 的底层流量转发由每个节点上的 **kube-proxy** 实现，它有两种工作模式：**iptables** 和 **ipvs**。

### 1. 生产环境推荐ipvs的原因

iptables 模式有两个硬伤：

1. **性能**：每条规则挂在 chain（链）里，规则越多链越长，匹配时顺序遍历，时间复杂度 O(N)。集群规模大、Service 数量多时，转发延迟明显上升；
2. **可维护性**：规则全自动生成、体量巨大，出问题难以排查。

IPVS 基于内核哈希表查找，时间复杂度 O(1)，且自带 rr（轮询）/wrr（加权轮询）/sh（源哈希）等多种调度算法。

### 2. 查看默认代理模式

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

默认即 iptables 模式

### 3. 原理：以 kube-dns 为例拆解 iptables 三层链

先看 Service 与 Pod 的对应关系：

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

访问 `10.200.0.10:53` 的流量，在内核里经过三层链：

**第一层 KUBE-SERVICES（入口匹配）**：

```bash
[root@master ~]# iptables-save | grep 10.200.0.10
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:metrics cluster IP" -m tcp --dport 9153 -j KUBE-SVC-JD5MR3NA4I4DYORP
-A KUBE-SERVICES -d 10.200.0.10/32 -p udp -m comment --comment "kube-system/kube-dns:dns cluster IP" -m udp --dport 53 -j KUBE-SVC-TCOU7JCQXEZGVUNU
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-SVC-ERIFXISQEP7F7OF4
```

**第二层 KUBE-SVC（概率分流）**：

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SVC-ERIFXISQEP7F7OF4 '
-A KUBE-SVC-ERIFXISQEP7F7OF4 ! -s 10.100.0.0/16 -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-MARK-MASQ
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-Y2IVGQXMLZPHRU2B
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -j KUBE-SEP-55K34TL23KTTOOX5
```

两个后端：第一条 50% 概率，第二条兜底——等效 1:1 负载均衡

**第三层 KUBE-SEP（DNAT 到真实 Pod）**：

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SEP' | grep 10.100.0
-A KUBE-SEP-Y2IVGQXMLZPHRU2B -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.8:53
-A KUBE-SEP-55K34TL23KTTOOX5 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.9:53
```

**完整链路**：

```
访问 10.200.0.10:53
  → KUBE-SERVICES 按目的 IP+端口命中
  → KUBE-SVC 按 random 概率选中一个 SEP
  → KUBE-SEP 执行 DNAT
  → 流量抵达 10.100.0.8:53 或 10.100.0.9:53（真实 Pod）
```

### 4. 切换 ipvs 完整实操

**① 所有节点安装依赖**

```bash
[root@master ~]# apt -y install conntrack ipvsadm
[root@worker01 ~]# apt -y install conntrack ipvsadm
[root@worker02 ~]# apt -y install conntrack ipvsadm
```

**② 编写内核模块加载脚本（所有节点）**

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

**③ 加载并验证**

```bash
[root@master ~]# chmod 755 /etc/sysconfig/modules/ipvs.modules && bash /etc/sysconfig/modules/ipvs.modules && lsmod | grep -e ip_vs -e nf_conntrack_ipv4
ip_vs_sh               16384  0
ip_vs_wrr              16384  0
ip_vs_rr               16384  0
ip_vs                 176128  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr
nf_conntrack          172032  6 xt_conntrack,nf_nat,xt_nat,nf_conntrack_netlink,xt_MASQUERADE,ip_vs
```

**④ 修改 kube-proxy 配置**

```bash
[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e 's/mode: ""/mode: "ipvs"/' | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl -n kube-system describe cm kube-proxy | egrep "mode|strictARP"
  strictARP: true
mode: "ipvs"
```

`strictARP: true` 是 MetalLB 等 LB 方案的前置要求，保证 ARP 应答精确，防止 IP 漂移

**⑤ 删除 kube-proxy Pod 触发重建（逐个删，不要批量）**

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

**⑥ 验证生效**

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

iptables 的“概率链”变成了内核里的虚拟服务表（VS/RS），查找 O(1)
