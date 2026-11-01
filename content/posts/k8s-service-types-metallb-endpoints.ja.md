---
title: "K8S Service タイプ全解と外部サービス連携：MetalLB 導入・Endpoints マッピング・NodePort ポート範囲カスタマイズ"
date: 2026-11-01T20:00:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "MetalLB", "Endpoints", "ExternalName", "NodePort"]
showToc: true
summary: "Kubernetes における4つの Service タイプの適用シナリオを体系的に解説。オンプレミス環境での MetalLB 導入による LoadBalancer 仮想 IP 付与と NodePort 固定運用の実践、ExternalName と手動 Endpoints による外部サービス連携の使い分け、さらに apiserver 静的 Pod パラメータのカスタマイズによる NodePort ポート範囲拡張手順を詳解します。"
---

# K8S Service タイプ全解と外部サービス連携：MetalLB 導入・Endpoints マッピング・NodePort ポート範囲カスタマイズ

## 1. Service の4つのタイプ

| タイプ | アクセス範囲 | 適用シナリオ |
| ---------------- | ------------------------ | ------------------------------------ |
| **ClusterIP**    | クラスタ内部のみ | マイクロサービス間通信（デフォルト） |
| **NodePort**     | クラスタ外部（ノード IP:ポート） | 自社データセンター / テスト環境でのサービス公開 |
| **LoadBalancer** | クラスタ外部（仮想 IP） | クラウド SLB との連携、またはオンプレミスでの MetalLB 利用 |
| **ExternalName** | クラスタ外部（CNAME ドメイン） | プロキシ対象サービスがクラスタ外に存在する場合 |

---

## 2. MetalLB：オンプレミス環境で LoadBalancer を実現

クラウド事業者の LoadBalancer はマネージドサービスとして提供されますが、自社データセンターにはこのサービスがありません。**MetalLB** を導入することでこれを補完し、「オンプレミス版 SLB」として機能させます。

### 2.1 MetalLB のデプロイ

```bash
[root@master 01-metallb]# wget https://raw.githubusercontent.com/metallb/metallb/v0.14.8/config/manifests/metallb-native.yaml

[root@master 01-metallb]# kubectl apply -f metallb-native.yaml
namespace/metallb-system created
customresourcedefinition.apiextensions.k8s.io/ipaddresspools.metallb.io created
deployment.apps/controller created
daemonset.apps/speaker created
...

[root@master 01-metallb]# kubectl get pods -n metallb-system  -o wide
NAME                          READY   STATUS    RESTARTS   AGE   IP             NODE        NOMINATED NODE   READINESS GATES
controller-6679f7f994-kjmxl   1/1     Running   0          65s   10.100.2.131   worker02   <none>           <none>
speaker-nq69j                 1/1     Running   0          65s   11.0.1.232     worker01   <none>           <none>
speaker-smwml                 1/1     Running   0          65s   11.0.1.231     master     <none>           <none>
speaker-t2xpc                 1/1     Running   0          65s   11.0.1.233     worker02   <none>           <none>
```

### 2.2 アドレスプールと L2 広告の作成

```bash
[root@master 01-metallb]# cat 02-metallb-ip-pool.yaml
```

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: dawn-pool
  namespace: metallb-system
spec:
  addresses:
  # 为MetalLB分配的IP地址（节点同网段空闲IP）
  - 11.0.1.150-11.0.1.180

---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: dawn-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - dawn-pool
```

```bash
[root@master 01-metallb]# kubectl apply -f 02-metallb-ip-pool.yaml
ipaddresspool.metallb.io/dawn-pool created
l2advertisement.metallb.io/dawn-l2 created
```

### 2.3 LoadBalancer テストサービスのデプロイ

```bash
[root@master 01-metallb]# cat 03-deploy-svc-xiuxian.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian
spec:
  replicas: 3
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2

---
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-clusterip
spec:
  type: LoadBalancer
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

```bash
[root@master 01-metallb]# kubectl apply -f 03-deploy-svc-xiuxian.yaml
deployment.apps/deloy-xiuxian created
service/xiuxian-svc-clusterip created

[root@master 01-metallb]# kubectl get svc
NAME                    TYPE           CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
kubernetes              ClusterIP      10.200.0.1     <none>        443/TCP        7d
xiuxian-svc-clusterip   LoadBalancer   10.200.82.73   11.0.1.150    80:30091/TCP   2m4s
```

EXTERNAL-IP にアドレスプールの最初の IP が自動割り当てされ、同時に NodePort も割り当てられます。

### 2.4 2種類のエンドポイントアクセス検証

```bash
# 方式一：基于 MetalLB 提供的地址池访问
[root@master ~]# curl -s http://11.0.1.150/ | head -6
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v2</title>

# 方式二：基于 NodePort 访问
[root@master ~]# curl -s http://11.0.1.232:30091/ | grep -o 'DAWN apps v[0-9]'
DAWN apps v2
[root@master ~]# curl -s http://11.0.1.233:30091/ | grep -o 'DAWN apps v[0-9]'
DAWN apps v2
```

### 2.5 EXTERNAL-IP のカスタマイズと NodePort の固定

**方法1：リソースアノテーション（Annotations）**

```bash
[root@master 01-metallb]# cat 04-svc-EXTERNAL-IP.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-lb-ip
  # 配置资源注解
  annotations:
    # IP地址范围必须在定义的IP地址池中，否则无法分配
    metallb.universe.tf/loadBalancerIPs: 11.0.1.155
spec:
  type: LoadBalancer
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30080
```

**方法2：loadBalancerIP フィールド**

```bash
[root@master 01-metallb]# cat 05-svc-EXTERNAL-IP.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-lb-ip-2
spec:
  type: LoadBalancer
  loadBalancerIP: 11.0.1.160
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30090
```

```bash
[root@master 01-metallb]# kubectl apply -f 04-svc-EXTERNAL-IP.yaml
service/xiuxian-svc-lb-ip created

[root@master 01-metallb]# kubectl apply -f 05-svc-EXTERNAL-IP.yaml
service/xiuxian-svc-lb-ip-2 created

[root@master 01-metallb]# kubectl get svc
NAME                    TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
kubernetes              ClusterIP      10.200.0.1       <none>        443/TCP        7d
xiuxian-svc-clusterip   LoadBalancer   10.200.82.73     11.0.1.150    80:30091/TCP   12m
xiuxian-svc-lb-ip       LoadBalancer   10.200.194.230   11.0.1.155    80:30080/TCP   4m35s
xiuxian-svc-lb-ip-2     LoadBalancer   10.200.125.153   11.0.1.160    80:30090/TCP   3s
```

いずれの方法でも指定した IP を正常に取得でき、NodePort の固定に成功しました。

**参考リンク：**https://metallb.universe.tf/usage/

---

## 3. ExternalName：クラスタ外部サービスのドメインマッピング

```bash
[root@master svc]# cat 03-ExternerName.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: svc-cnblog
spec:
  # svc类型
  type: ExternalName
  # 指定外部域名
  externalName: www.cnblog.com
  # externalName: www.baidu.com
```

```bash
[root@master svc]# kubectl apply -f 03-ExternerName.yaml
service/svc-cnblog created

[root@master svc]# kubectl get svc
NAME                    TYPE           CLUSTER-IP      EXTERNAL-IP      PORT(S)        AGE
kubernetes              ClusterIP      10.200.0.1      <none>           443/TCP        7d
svc-cnblog              ExternalName   <none>          www.cnblog.com   <none>         3s
xiuxian-svc-clusterip   LoadBalancer   10.200.82.73    11.0.1.150       80:30091/TCP   40m

[root@master svc]# kubectl exec -it deloy-xiuxian-5d9475944b-5brqf -- sh
/ # ping svc-cnblog
PING svc-cnblog (198.20.0.36): 56 data bytes
64 bytes from 198.20.0.36: seq=0 ttl=127 time=1.053 ms
64 bytes from 198.20.0.36: seq=1 ttl=127 time=1.014 ms
^C
--- svc-cnblog ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 1.014/1.541/2.558 ms
/ #
```

1. Pod 内で `svc-cnblog` に ping を送信することは、外部ドメインに ping を送信することと同等です。

2. ExternalName でマップするサービスは、パブリック DNS または CoreDNS コンポーネント内に名前解決レコードが存在する必要があります。

3. マッピング対象の外部サービスにパブリック DNS 解決がない場合は、CoreDNS のレコード解決を手動で追記する必要があります。

---

## 4. Endpoints：外部サービスをマッピングするもう一つの手法

### 4.1 Endpoints とは

各 Service は、バックエンドの実際の IP レコードを保持する同名の Endpoints（ep）リソースを保有します（ExternalName タイプを除く）。svc を削除すると同名の ep も自動的に削除されます。

### 4.2 手動 ep によりクラスタ外のサービスを統合

```bash
[root@master ep]# cat 01-ep-harbor.yaml
```

```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: dawn-harbor
# 定义ep资源的子集
subsets:
  # 指定服务的IP地址
- addresses:
    # 定义IP地址
  - ip: 11.0.1.250
  # 指定服务的端口
  ports:
    # 指的服务的端口号
  - port: 80
    name: http
  - port: 443
    name: https

---

apiVersion: v1
kind: Service
metadata:
  name: dawn-harbor
spec:
  type: ClusterIP
  ports:
  - port: 80
    name: http
  - port: 443
    name: https
```

```bash
[root@master ep]# kubectl apply -f 01-ep-harbor.yaml
endpoints/dawn-harbor created
service/dawn-harbor created

[root@master ep]# kubectl get -f 01-ep-harbor.yaml
NAME                         ENDPOINTS                      AGE
endpoints/dawn-harbor   11.0.1.250:80,11.0.1.250:443   3s

NAME                       TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
service/dawn-harbor   ClusterIP   10.200.99.146   <none>        80/TCP,443/TCP   3s

[root@master ep]# kubectl describe ep dawn-harbor
Name:         dawn-harbor
Namespace:    default
Subsets:
  Addresses:          11.0.1.250
  NotReadyAddresses:  <none>
  Ports:
    Name   Port  Protocol
    ----   ----  --------
    http   80    TCP
    https  443   TCP

[root@master ep]# kubectl describe svc dawn-harbor
Name:              dawn-harbor
Selector:          <none>
Type:              ClusterIP
IP:                10.200.99.146
Port:              http  80/TCP
TargetPort:        80/TCP
Endpoints:         11.0.1.250:80
Port:              https  443/TCP
TargetPort:        443/TCP
Endpoints:         11.0.1.250:443
```

svc に Selector を記述せず、ep 側に手動で外部 IP を指定することで、Pod 内から `https://dawn-harbor/` 経由でクラスタ外の Harbor へ安全にアクセスできます。

```bash
[root@master ~]# kubectl exec -it $(kubectl get pods -l apps=xiuxian -o jsonpath='{.items[0].metadata.name}') -- curl -k https://dawn-harbor/
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8"/>
        <title>Harbor</title>
        <base href="/"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link rel="icon" type="image/x-icon" href="favicon.ico?v=2"/>
    <link rel="stylesheet" href="styles.778b44f8c96802aa.css"></head>
    <body>
        <harbor-app>
            <div class="spinner spinner-lg app-loading app-loading-fixed">
                Loading...
            </div>
        </harbor-app>
    <script src="runtime.fecb31573c19a80b.js" type="module"></script><script src="polyfills.d52770ae19691b1f.js" type="module"></script><script src="scripts.fc6b7827d4dcd875.js" defer></script><script src="main.6985c39c793f3a9f.js" type="module"></script></body>
</html>
```



**ExternalName vs Endpoints**：外部サービスに既存のドメインがあり、名前のエイリアス化のみを行う場合は ExternalName を使用します。具体的な IP:ポート を指定する場合や、外部サービスにドメインがない場合は Endpoints を使用します。

---

## 5. NodePort のポート範囲の変更

### 5.1 デフォルト範囲 30000-32767

```bash
[root@master svc]# cat 02-nodePort-xiuxian.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-nodeport
spec:
  type: NodePort
  selector:
    school: czu
    apps: xiuxian
  ports:
  - port: 88
    targetPort: 80
    nodePort: 8080
```

```bash
[root@master svc]# kubectl apply -f 02-nodePort-xiuxian.yaml
The Service "xiuxian-svc-nodeport" is invalid: spec.ports[0].nodePort: Invalid value: 8080: provided port is not in the valid range. The range of valid ports is 30000-32767
```

### 5.2 apiserver 起動パラメータの修正

```bash
[root@master ~]# vim /etc/kubernetes/manifests/kube-apiserver.yaml
 ...
 spec:
  containers:
  - command:
    - kube-apiserver
    - --service-node-port-range=3000-50000  # 进行添加这一行
    ...
```

マニフェストファイルを一度退避させて戻すことで apiserver の再起動をトリガーし、再度 apply を実行します：

```bash
[root@master svc]# kubectl apply -f 02-nodePort-xiuxian.yaml
service/xiuxian-svc-nodeport created

[root@master svc]# kubectl get -f 02-nodePort-xiuxian.yaml
NAME                   TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)       AGE
xiuxian-svc-nodeport   NodePort   10.200.5.18    <none>        88:8080/TCP   5s
```

3つのノードすべての `http://ノードIP:8080/` からアクセス可能になります。

![image-20261101194537934](/images/k8s-service-types-metallb-endpoints-image-20261101194537934.png)

**参考リンク：**https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-apiserver/
