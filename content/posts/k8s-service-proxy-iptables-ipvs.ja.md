---
title: "K8S Service プロキシモード実践：iptables 3層チェーンからカーネルレベル IPVS への移行と最適化"
date: 2026-11-01T19:20:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "kube-proxy", "iptables", "ipvs"]
showToc: true
summary: "Kubernetes Service の基盤となるトラフィック転送メカニズムを深掘りし、iptables と IPVS のパフォーマンス差を比較。kube-dns を例に iptables の3層チェーンによる確率的分散メカニズムを解剖し、本番環境で kube-proxy を IPVS モードへ切り替える完全な実践手順と検証フローを解説します。"
---

# K8S Service プロキシモード実践：iptables 3層チェーンからカーネルレベル IPVS への移行と最適化

## Service のプロキシモード：iptables と ipvs

Service の下位トラフィック転送は各ノード上の **kube-proxy** によって実現され、**iptables** と **ipvs** の2つの動作モードがあります。

### 1. 本番環境で ipvs が推奨される理由

iptables モードには2つの決定的な欠点があります：

1. **パフォーマンス**：各ルールが chain（チェーン）にぶら下がり、ルールが増えるほどチェーンが長くなり、順次走査されるため時間計算量は **O(N)** になります。クラスタ規模が大きく Service の数が多い場合、転送レイテンシが顕著に増加します。
2. **保守性**：ルールが全自動で大量に生成されるため、トラブル発生時の調査・解析が極めて困難です。

IPVS はカーネルのハッシュテーブル検索に基づいており、時間計算量は **O(1)** です。さらに rr（ラウンドロビン）、wrr（重み付けラウンドロビン）、sh（ソースハッシュ）など多様なスケジューリングアルゴリズムを標準で備えています。

### 2. デフォルトのプロキシモードを確認

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

デフォルトは iptables モードです。

### 3. 原理：kube-dns を例に iptables の3層チェーンを解剖

まず Service と Pod の対応関係を確認します：

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

`10.200.0.10:53` へアクセスするトラフィックは、カーネル内で以下の3層チェーンを経由します：

**第1層 KUBE-SERVICES（エントリーマッチング）**：

```bash
[root@master ~]# iptables-save | grep 10.200.0.10
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:metrics cluster IP" -m tcp --dport 9153 -j KUBE-SVC-JD5MR3NA4I4DYORP
-A KUBE-SERVICES -d 10.200.0.10/32 -p udp -m comment --comment "kube-system/kube-dns:dns cluster IP" -m udp --dport 53 -j KUBE-SVC-TCOU7JCQXEZGVUNU
-A KUBE-SERVICES -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-SVC-ERIFXISQEP7F7OF4
```

**第2層 KUBE-SVC（確率的分流）**：

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SVC-ERIFXISQEP7F7OF4 '
-A KUBE-SVC-ERIFXISQEP7F7OF4 ! -s 10.100.0.0/16 -d 10.200.0.10/32 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp cluster IP" -m tcp --dport 53 -j KUBE-MARK-MASQ
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-Y2IVGQXMLZPHRU2B
-A KUBE-SVC-ERIFXISQEP7F7OF4 -m comment --comment "kube-system/kube-dns:dns-tcp" -j KUBE-SEP-55K34TL23KTTOOX5
```

2つのバックエンド：1行目が 50% の確率、2行目がフォールバックとなり、実質的に 1:1 の負荷分散を実現します。

**第3層 KUBE-SEP（実際の Pod への DNAT）**：

```bash
[root@master ~]# iptables-save | grep -E '^-A KUBE-SEP' | grep 10.100.0
-A KUBE-SEP-Y2IVGQXMLZPHRU2B -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.8:53
-A KUBE-SEP-55K34TL23KTTOOX5 -p tcp -m comment --comment "kube-system/kube-dns:dns-tcp" -m tcp -j DNAT --to-destination 10.100.0.9:53
```

**完全なトラフィック経路**：

```
10.200.0.10:53 にアクセス
  → KUBE-SERVICES で宛先 IP+ポートがマッチ
  → KUBE-SVC で random 確率により1つの SEP を選択
  → KUBE-SEP が DNAT を実行
  → トラフィックが 10.100.0.8:53 または 10.100.0.9:53（実際の Pod）に到達
```

### 4. ipvs への切り替え完全実践

**① 全ノードで依存パッケージをインストール**

```bash
[root@master ~]# apt -y install conntrack ipvsadm
[root@worker01 ~]# apt -y install conntrack ipvsadm
[root@worker02 ~]# apt -y install conntrack ipvsadm
```

**② カーネルモジュールロードスクリプトの作成（全ノード）**

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

**③ モジュールのロードと確認**

```bash
[root@master ~]# chmod 755 /etc/sysconfig/modules/ipvs.modules && bash /etc/sysconfig/modules/ipvs.modules && lsmod | grep -e ip_vs -e nf_conntrack_ipv4
ip_vs_sh               16384  0
ip_vs_wrr              16384  0
ip_vs_rr               16384  0
ip_vs                 176128  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr
nf_conntrack          172032  6 xt_conntrack,nf_nat,xt_nat,nf_conntrack_netlink,xt_MASQUERADE,ip_vs
```

**④ kube-proxy の ConfigMap を編集**

```bash
[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e 's/mode: ""/mode: "ipvs"/' | kubectl apply -f - -n kube-system
configmap/kube-proxy configured

[root@master ~]# kubectl -n kube-system describe cm kube-proxy | egrep "mode|strictARP"
  strictARP: true
mode: "ipvs"
```

`strictARP: true` は MetalLB などの LB ソリューションに必須の前置条件であり、正確な ARP 応答を保証して IP ドリフトを防止します。

**⑤ kube-proxy Pod を削除して再作成をトリガー（一括ではなく1つずつ削除）**

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

**⑥ 正常稼働の検証**

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

iptables の「確率チェーン」がカーネル内の仮想サービス一覧（VS/RS）へと変換され、検索計算量は O(1) に最適化されました。
