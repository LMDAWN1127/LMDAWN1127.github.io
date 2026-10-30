---
title: "K8S レプリカ制御とサービスディスカバリ実践：RC、ClusterIP と NodePort"
date: 2026-10-30T20:04:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は K8S のレプリカ制御とサービスディスカバリを実践する。ReplicationController でレプリカ 3 を宣言し、自己修復（Pod を削除すると自動で補われる）と、RC 削除時に管理下の Pod が連鎖的に削除されることを検証する。続いて ClusterIP タイプの Service で、2 ノードに分散した 3 つの Pod に単一の固定エントリを与え、各 Pod の nginx に自分の Pod 名を返させて 5 回連続リクエストすることでラウンドロビンのロードバランスを確認する。最後に NodePort タイプで全ノードの 30080 ポートに公開し、クラスタ外からアクセスして同様にロードバランスされることを確かめる。"
---

# K8S レプリカ制御とサービスディスカバリ実践：RC、ClusterIP と NodePort

---

## 1. RC（ReplicationController）—— レプリカ数の維持

3 つの Pod を宣言すれば、RC はどの瞬間もちょうど 3 つの Pod が動いていることを保証する。 1 つ足りなければ自動で補い、多ければ自動で削除する。

### 1.1 RC YAML

```yaml
# /dawn/manifests/rc/01-rc-xiuxian.yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-rc
spec:
  replicas: 3
  selector:
    apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        school: czu
        class: computer01
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

`spec.replicas: 3` —— 期待するレプリカ数

`spec.selector.apps: xiuxian` —— ラベルで管理対象の Pod をマッチング

### 1.2 RC を作成

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
replicationcontroller/xiuxian-rc created

[root@master ~]# kubectl get pods -o wide -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE
xiuxian-rc-zldnv 1/1   Running   0          41s   10.100.1.13   worker01
xiuxian-rc-p6fsm 1/1   Running   0          41s   10.100.2.5    worker02
xiuxian-rc-m6cbl 1/1   Running   0          41s   10.100.2.6    worker02
```

RC は 3 つの Pod を自動生成し、異なるノードに分散させた（worker01 に 1 つ、worker02 に 2 つ）。

### 1.3 RC の自己修復

Pod を 1 つ手動で削除し、RC が自動で補うかを確認する：

```bash
[root@master ~]# kubectl delete pod xiuxian-rc-zldnv
pod "xiuxian-rc-zldnv" deleted

[root@master ~]# kubectl get pods -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   ...
xiuxian-rc-p6fsm 1/1   Running   0          60s   ...
xiuxian-rc-m6cbl 1/1   Running   0          60s   ...
xiuxian-rc-xxxxx 1/1   Running   0          2s    ...   ← 新しい Pod が自動的に補われた
```

### 1.4 RC を削除すると Pod も自動削除

```bash
[root@master ~]# kubectl delete rc xiuxian-rc
replicationcontroller "xiuxian-rc" deleted
# RC が管理する Pod はすべて自動削除される
```

---

## 2. SVC ClusterIP —— 内部のロードバランス

3 つの Pod は 2 ノードに分散し、IP はそれぞれ異なる。SVC は固定の ClusterIP とポートを提供するため、クライアントは 1 つのアドレスだけ覚えればよく、バックエンドは健全な Pod へ自動でラウンドロビン配送する。

### 2.1 SVC YAML

```yaml
# /dawn/manifests/svc/01-clusterIP-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-clusterip
spec:
  type: ClusterIP
  selector:
    school: czu
    apps: xiuxian
  ports:
  - port: 88
    targetPort: 80
```

`type: ClusterIP` —— 内部 IP、クラスタ内からのみアクセス可能

`port: 88` —— SVC が公開するポート

`targetPort: 80` —— バックエンド Pod のコンテナポート

`selector` —— ラベルでバックエンド Pod をマッチング（`school=czu, apps=xiuxian`）

### 2.2 SVC を作成して RC を再作成

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
[root@master ~]# kubectl apply -f /dawn/manifests/svc/01-clusterIP-xiuxian.yaml

[root@master ~]# kubectl get svc xiuxian-svc-clusterip
NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc-clusterip   ClusterIP   10.200.142.177   <none>        88/TCP    2s
```

### 2.3 ロードバランスを検証

まず各 Pod の nginx が自分の Pod 名を返すようにして、配送結果を観察しやすくする：

```bash
[root@master ~]# for pod in $(kubectl get pods -l apps=xiuxian -o name); do
  kubectl exec ${pod#pod/} -- sh -c "echo ${pod#pod/} > /usr/share/nginx/html/index.html"
done
```

SVC の ClusterIP に 5 回連続でリクエストする：

```bash
[root@master ~]# CLIP=$(kubectl get svc xiuxian-svc-clusterip -o jsonpath='{.spec.clusterIP}')
[root@master ~]# for i in 1 2 3 4 5; do curl -s $CLIP:88; done
xiuxian-rc-zldnv    ← worker01 上の Pod
xiuxian-rc-zldnv
xiuxian-rc-p6fsm    ← worker02 上の Pod
xiuxian-rc-m6cbl    ← worker02 上のもう 1 つの Pod
xiuxian-rc-zldnv
```

 リクエストは 3 つのバックエンド Pod にラウンドロビンで配送された —— SVC ClusterIP のロードバランスを検証できた。

---

## 3. SVC NodePort —— 外部からのアクセス

ClusterIP はクラスタ内部からしかアクセスできず、外部ユーザーには届かない。NodePort は各ノードで固定ポート（30000-32767）を開放し、バックエンド Pod へ自動転送することで外部からのアクセスを可能にする。

```yaml
# /dawn/manifests/svc/02-nodePort-xiuxian.yaml
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
    nodePort: 30080
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/svc/02-nodePort-xiuxian.yaml
service/xiuxian-svc-nodeport created

[root@master ~]# kubectl get svc
NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
xiuxian-svc-clusterip   ClusterIP   10.200.142.177   <none>        88/TCP         56s
xiuxian-svc-nodeport    NodePort    10.200.12.142    <none>        88:30080/TCP   2s
```

`88:30080` —— SVC 内部の 88 ポートが、全ノードの 30080 ポートにマッピングされる。

外部アクセス検証：

```bash
# worker01 の 30080 ポート経由でアクセス
[root@master ~]# for i in 1 2 3 4 5; do curl -s 11.0.1.232:30080; done
xiuxian-rc-p6fsm
xiuxian-rc-m6cbl
xiuxian-rc-zldnv
xiuxian-rc-m6cbl
xiuxian-rc-p6fsm
```

NodePort の外部アクセスは成功し、同様にロードバランスも実現できた。