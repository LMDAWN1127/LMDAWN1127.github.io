---
title: "K8S Service 프록시 모드 실전: iptables 3계층 체인 분석부터 커널 수준 IPVS 최적화까지"
date: 2026-11-01T19:20:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "kube-proxy", "iptables", "ipvs"]
showToc: true
summary: "Kubernetes Service 하위 트래픽 전달 메커니즘을 심층 분석하고 iptables와 IPVS의 성능 차이를 비교합니다. kube-dns를 예로 들어 iptables 3계층 체인의 확률적 트래픽 분산 메커니즘을 분해하며, 프로덕션 환경에서 kube-proxy를 IPVS 모드로 전환하는 전체 실전 작업 및 검증 절차를 제공합니다."
---

# K8S Service 프록시 모드 실전: iptables 3계층 체인 분석부터 커널 수준 IPVS 최적화까지

## Service 의 프록시 모드: iptables 와 ipvs

Service 의 하위 트래픽 전달은 각 노드의 **kube-proxy** 에 의해 구현되며, **iptables** 와 **ipvs** 의 두 가지 작동 모드가 있습니다.

### 1. 프로덕션 환경에서 ipvs 를 권장하는 이유

iptables 모드에는 두 가지 치명적인 약점이 있습니다:

1. **성능**: 각 규칙이 chain(체인)에 연결되어 규칙이 많아질수록 체인이 길어지며, 순차 탐색을 수행하므로 시간 복잡도는 **O(N)** 입니다. 클러스터 규모가 크고 Service 수가 많을 경우 전달 지연 시간이 크게 증가합니다.
2. **유지보수성**: 규칙이 자동으로 대량 생성되므로 문제가 발생했을 때 트러블슈팅과 추적이 매우 어렵습니다.

IPVS 는 커널 해시 테이블 조회를 기반으로 하여 시간 복잡도가 **O(1)** 이며, rr(라운드 로빈), wrr(가중치 라운드 로빈), sh(소스 해싱) 등 다양한 스케줄링 알고리즘을 기본 제공합니다.

### 2. 기본 프록시 모드 확인

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

기본값은 iptables 모드입니다.

### 3. 원리: kube-dns 를 예로 든 iptables 3계층 체인 분석

먼저 Service 와 Pod 의 매핑 관계를 확인합니다:

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

`10.200.0.10:53` 으로 향하는 트래픽은 커널 내에서 3계층 체인을 거치게 됩니다:

**1계층 KUBE-SERVICES (진입 매칭)**:

```bash
[root@master ~]# iptables-save | grep 10.200.0.10
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:metrics cluster IP" -m tcp --dport 9153 -j KUBE-SVC-JD5MR3NA4I4DYORP
-A KUBE-SERVICES -d 10.200.0.10/32 -p udp -m comment --comment "kube-system/kube-dns:dns cluster IP" -m udp --dport 53 -j KUBE-SVC-TCOU7JCQXEZGVUNU
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-SVC-ERIFXISQEP7F7OF4
```

**2계층 KUBE-SVC (확률적 트래픽 분산)**:

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SVC-ERIFXISQEP7F7OF4 '
-A KUBE-SVC-ERIFXISQEP7F7OF4 ! -s 10.100.0.0/16 -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-MARK-MASQ
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-Y2IVGQXMLZPHRU2B
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -j KUBE-SEP-55K34TL23KTTOOX5
```

두 개의 백엔드: 첫 번째 규칙은 50% 확률, 두 번째 규칙은 폴백(fallback)으로 작동하여 사실상 1:1 로드 밸런싱을 구현합니다.

**3계층 KUBE-SEP (실제 Pod 로 DNAT)**:

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SEP' | grep 10.100.0
-A KUBE-SEP-Y2IVGQXMLZPHRU2B -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.8:53
-A KUBE-SEP-55K34TL23KTTOOX5 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.9:53
```

**전체 트래픽 경로**:

```
10.200.0.10:53 접근
  → KUBE-SERVICES 에서 목적지 IP+포트 매칭
  → KUBE-SVC 에서 random 확률로 하나의 SEP 선택
  → KUBE-SEP 에서 DNAT 수행
  → 트래픽이 10.100.0.8:53 또는 10.100.0.9:53 (실제 Pod)에 도달
```

### 4. ipvs 전환 전체 실전

**① 모든 노드에 종속성 패키지 설치**

```bash
[root@master ~]# apt -y install conntrack ipvsadm
[root@worker01 ~]# apt -y install conntrack ipvsadm
[root@worker02 ~]# apt -y install conntrack ipvsadm
```

**② 커널 모듈 로드 스크립트 작성 (모든 노드)**

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

**③ 모듈 로드 및 확인**

```bash
[root@master ~]# chmod 755 /etc/sysconfig/modules/ipvs.modules && bash /etc/sysconfig/modules/ipvs.modules && lsmod | grep -e ip_vs -e nf_conntrack_ipv4
ip_vs_sh               16384  0
ip_vs_wrr              16384  0
ip_vs_rr               16384  0
ip_vs                 176128  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr
nf_conntrack          172032  6 xt_conntrack,nf_nat,xt_nat,nf_conntrack_netlink,xt_MASQUERADE,ip_vs
```

**④ kube-proxy ConfigMap 수정**

```bash
[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e 's/mode: ""/mode: "ipvs"/' | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl -n kube-system describe cm kube-proxy | egrep "mode|strictARP"
  strictARP: true
mode: "ipvs"
```

`strictARP: true` 는 MetalLB 등 LB 솔루션의 필수 사전 요건으로, 정확한 ARP 응답을 보장하여 IP 드리프트를 방지합니다.

**⑤ kube-proxy Pod 삭제하여 재생성 트리거 (일괄 삭제가 아닌 하나씩 삭제)**

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

**⑥ 정상 적용 검증**

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

iptables 의 "확률 체인"이 커널 내의 가상 서비스 테이블(VS/RS)로 변환되어 검색 시간 복잡도가 O(1) 로 최적화되었습니다.
