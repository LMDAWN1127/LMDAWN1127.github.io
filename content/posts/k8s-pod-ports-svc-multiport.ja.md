---
title: "K8S Pod のポート公開と SVC のマルチポートマッピング実践：hostPort、マルチポートと targetPort の名前マッチング"
date: 2026-10-31T18:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は K8S の Pod ポート公開と SVC マルチポートマッピングの 2 つを扱う。前半は hostPort でコンテナの 80 番を Pod 配置ノードの 8888 に直接マッピングし、SVC を経由せず外部からコンテナへ直接届かせる。Windows からのアクセス検証が成功し、hostPort と NodePort を比較する（hostPort は Pod のいるノードでしか有効でなく漂移するとアドレスも変わる。NodePort は全ノードの同じポートを開く Service なので漂移しても影響しない）。後半は 80/TCP と 53/UDP を同時に公開する Pod を書き、SVC でマルチポートマッピングし、PORT(S) 列と describe の TargetPort/Endpoints を確認する。最後に kubectl patch で targetPort を名前マッチングに変更し、コンテナのポート番号が変わっても名前が同じなら SVC が追従し続けることを検証する。"
---

# K8S Pod のポート公開と SVC のマルチポートマッピング実践：hostPort、マルチポートと targetPort の名前マッチング

## 1. Pod のポート公開でサービスにアクセス（hostPort）

### 1.1 リソースマニフェストを作成

```bash
[root@master pods]# cat 15-pods-xiuxian-ports.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-ports
  namespace: default
spec:
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
    # Pod のポートマッピングを設定
    ports:
      # 公開するコンテナポートを指定
    - containerPort: 80
      # ホストの IP アドレスを指定
      hostIP: 0.0.0.0
      # ホストのポート番号を指定
      hostPort: 8888
      # ポートに別名を付ける。一意であること
      name: web
      # コンテナポートのプロトコルを指定。有効値: UDP,TCP,SCTP、既定値は TCP
      protocol: TCP
    - containerPort: 53
      name: dns
      protocol: UDP
```

### 1.2 リソースを作成し、どのノードに配置されたか確認

```bash
[root@master pods]# kubectl apply -f 15-pods-xiuxian-ports.yaml 
pod/xiuxian-ports created
[root@master pods]# kubectl get pods -o wide
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-ports   1/1     Running   0          9s    10.100.2.56   worker02   <none>           <none>
```

### 1.3 Windows からのアクセス検証

![image-20261031164202786](/images/k8s-pod-ports-svc-multiport/image-20261031164202786.png)

hostPort が有効。コンテナの 80 番が worker02 の 8888 にマッピングされ、外部から SVC を経由せずにコンテナへ直接届く



hostPort vs NodePort：hostPort はコンテナポートを単一ノードのポートへ直接マッピングするため、Pod が配置されたノードでしか有効でなく、Pod が漂移するとアドレスも変わる。NodePort は Service が全ノードの同じポートを開くため、Pod が漂移してもアクセスに影響しない。本番は SVC/NodePort を推奨し、hostPort はデバッグ向け。

---

## 2. SVC のマルチポートマッピング

### 2.1 リソースマニフェストを作成

```bash
[root@master pods]# cat 16-pods-xiuxian-ports-svc.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-ports-svc
  labels:
    apps: xiuxian
spec:
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
    ports:
    - containerPort: 80
      # この名前はサービスを識別するためのもの。業務名でもよい
      name: web
      protocol: TCP
    - containerPort: 53
      name: dns
      protocol: UDP

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    apps: xiuxian
  ports:
    # svc のポート名はバックエンドのポート名と揃えることを推奨。
  - port: 80
    # ここで指定するのは Pod のポート名。Pod の containerPort を変更しても連動しない。
    name: web
  - port: 53
    name: dns
    protocol: UDP
```

### 2.2 リソースを作成して観察

```bash
[root@master pods]# kubectl apply -f 16-pods-xiuxian-ports-svc.yaml 
pod/xiuxian-ports-svc created
service/xiuxian-svc created
[root@master pods]# 
[root@master pods]# kubectl get pods,svc -o wide
NAME                    READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
pod/xiuxian-ports-svc   1/1     Running   0          6s      10.100.1.59   worker01   <none>           <none>

NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)         AGE   SELECTOR
service/kubernetes    ClusterIP   10.200.0.1       <none>        443/TCP         19h   <none>
service/xiuxian-svc   ClusterIP   10.200.166.210   <none>        80/TCP,53/UDP   6s    apps=xiuxian
```

SVC の`PORT(S)`列に `80/TCP,53/UDP` が同時に表示される —— マルチポートマッピングが有効

```bash
[root@master pods]# kubectl describe svc xiuxian-svc
Name:              xiuxian-svc
Namespace:         default
Selector:          apps: xiuxian
Type:              ClusterIP
IP:                10.200.166.210
Port:              web  80/TCP
TargetPort:        80/TCP
Endpoints:         10.100.1.59:80
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.1.59:53
Session Affinity:  None
```

```bash
[root@master pods]# curl -s http://10.200.166.210 | grep -oE '<title>[^<]*</title>'
<title>DAWN apps v1</title>
```

### 2.3 targetPort を名前でマッチング

`targetPort: web`（番号ではなく名前でマッチング）。SVC にパッチを当てて実演する：

```bash
[root@master pods]# kubectl patch svc xiuxian-svc --type='json' \
  -p '[{"op":"add","path":"/spec/ports/0/targetPort","value":"web"}]'
service/xiuxian-svc patched
[root@master pods]# kubectl describe svc xiuxian-svc | grep -E 'Port:|TargetPort:|Endpoints:'
Port:              web  80/TCP
TargetPort:        web/TCP          # 名前でのマッチングが有効
Endpoints:         10.100.1.59:80
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.1.59:53
[root@master pods]# curl -s http://10.200.166.210 | grep -oE '<title>[^<]*</title>'
<title>DAWN apps v1</title>         # アクセスに影響なし
```

`targetPort: web` は名前でマッチングする。コンテナのポート番号が変わっても、名前 `web` が変わらなければ SVC は自動的に追従する。ポート名がコンテナのポート番号と SVC 設定を疎結合にしている