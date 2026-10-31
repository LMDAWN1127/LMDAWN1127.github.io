---
title: "K8S ReplicationController 宣言的更新の制限と実践：テンプレートを変更しても Pod が更新されない理由"
date: 2026-10-31T19:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事では、Kubernetes における ReplicationController (RC) の宣言的更新に対するサポート制限をハンズオンを通じて検証します。まず 3 レプリカの RC と ClusterIP サービスをデプロイして初期 v1 バージョンの稼働を確認します。次に YAML マニフェスト内のイメージタグを v2 に変更して kubectl apply を実行しますが、RC テンプレート自体は更新されるものの稼働中 Pod は v1 のまま再作成されません。最後に手動で Pod を削除して RC に新テンプレート (v2) による再作成をトリガーさせ、RC と Deployment の制御ループにおける根本的な違いを解説します。"
---

# K8S ReplicationController 宣言的更新の制限と実践：テンプレートを変更しても Pod が更新されない理由

Kubernetes において、`ReplicationController`（略称 RC）は指定された数の Pod レプリカが常に稼働し続けることを保証するために最初に導入されたコントローラーです。`kubectl apply` による宣言的管理を学び始めた際、RC の Pod テンプレート（イメージバージョンなど）を変更すれば Deployment のように自動でローリングアップデートされると誤解されがちです。

本記事では一連の検証実験を通じて、ReplicationController の宣言的更新の制限と Pod 再作成のメカニズムを詳しく解説します。

---

## 1. 環境準備と初期バージョン（v1）のデプロイ

### 1.1 マニフェストの作成

RC 設定ファイル `02-rc-xiuxian-update.yaml` を作成し、3 レプリカと対応する ClusterIP Service を定義します：

```bash
[root@master rc]# cat 02-rc-xiuxian-update.yaml 
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-xiuxian
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
        ports:
        - containerPort: 80
          name: xiuxian

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
  - port: 80
    name: xiuxian
```

### 1.2 リソース作成とステータス確認

`kubectl apply` でリソースを作成し、3 つの Pod がすべて Running 状態であることを確認します：

```bash
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian created
service/xiuxian-svc created
[root@master rc]# kubectl get pods,svc
NAME                   READY   STATUS    RESTARTS   AGE
pod/rc-xiuxian-7jm98   1/1     Running   0          8s
pod/rc-xiuxian-9nmsz   1/1     Running   0          8s
pod/rc-xiuxian-vkfp6   1/1     Running   0          8s

NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
service/kubernetes    ClusterIP   10.200.0.1       <none>        443/TCP   19h
service/xiuxian-svc   ClusterIP   10.200.40.21     <none>        80/TCP    8s
```

---

## 2. 初期バージョンのアクセス確認

Service の ClusterIP `10.200.40.21` に対して連続アクセスを実行します：

```bash
[root@master rc]# for i in 1 2 3 4 5 6; do curl -s http://10.200.40.21 | grep -oE '<h1[^>]*>[^<]*</h1>'; sleep 0.5; done
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
```

緑色の見出しである「凡人修仙传 v1」が返され、初期サービスが正常に稼働していることが確認できます。

---

## 3. RC のイメージバージョン変更と更新挙動の観察

### 3.1 マニフェスト変更と更新適用

イメージタグを `v1` から `v2` に変更し、再度 `kubectl apply` を実行します：

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"
      - image: harbor:443/dawn/apps:v1
[root@master rc]# sed -i 's|dawn/apps:v1|dawn/apps:v2|' 02-rc-xiuxian-update.yaml   # 設定変更
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian configured
service/xiuxian-svc unchanged
```

### 3.2 RC テンプレートと稼働中 Pod の確認

RC オブジェクトの yaml を確認すると、テンプレート自体は正常に更新されています：

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"   # RC のイメージテンプレートは変更成功
      - image: harbor:443/dawn/apps:v2
```

続いて稼働中の Pod を確認します：

```bash
[root@master rc]# kubectl get pods -o wide  # しかし古い Pod は自動削除・再作成されない
NAME               READY   STATUS    RESTARTS   AGE    IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-7jm98   1/1     Running   0          42s    10.100.2.57   worker02   <none>           <none>
rc-xiuxian-9nmsz   1/1     Running   0          42s    10.100.2.58   worker02   <none>           <none>
rc-xiuxian-vkfp6   1/1     Running   0          42s    10.100.1.60   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"  # 稼働中の Pod イメージは更新されていない
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
```

> **重要ポイント**：  
> `kubectl apply` は RC に対して `configured` を返し、RC 内部の Pod Template も確かに `v2` に更新されました。しかし**稼働中の Pod は再作成されず、以前の v1 イメージを実行し続けます**。  
> これが RC と Deployment の本質的な違いです。RC には Pod の仕様変更に対する自動更新機能（RollingUpdate）が備わっていません。

---

## 4. 手動で Pod を削除し、新テンプレートによる再作成をトリガー

### 4.1 古い Pod の削除

RC の責務は「レプリカ数の維持」（現在の希望数は 3）です。既存の Pod が削除されると、RC はレプリカ不足を検知し、**最新の Pod Template**（v2）に従って新しい Pod を起動します：

```bash
[root@master rc]# kubectl delete pods --all  # 古い Pod を手動削除
pod "rc-xiuxian-7jm98" deleted
pod "rc-xiuxian-9nmsz" deleted
pod "rc-xiuxian-vkfp6" deleted
```

### 4.2 新規作成された Pod とイメージの確認

```bash
[root@master rc]# kubectl get pods -o wide  # RC が自動的に新 Pod を作成
NAME               READY   STATUS    RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-8jtfd   1/1     Running   0          10s   10.100.2.59   worker02   <none>           <none>
rc-xiuxian-ff8cv   1/1     Running   0          10s   10.100.1.61   worker01   <none>           <none>
rc-xiuxian-mfqp9   1/1     Running   0          10s   10.100.1.62   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
```

### 4.3 サービスへのアクセス再テスト

```bash
[root@master rc]# for i in 1 2 3; do curl -s http://10.200.40.21 | grep -oE '<title>[^<]*</title>|<h1[^>]*>[^<]*</h1>'; done
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
```

タイトルが緑色（v1）から赤色（v2）へ切り替わり、新イメージが正常に反映されたことが確認できます。

---

## 5. まとめと本番環境での注意点

1. **RC の本質は「レプリカ数の維持」であり「バージョン管理」ではない**：  
   RC コントローラーの制御ループは、`selector` でマッチする Pod 数が `spec.replicas` と一致しているかのみを監視します。数が合っていれば健全とみなし、稼働中 Pod の設定差分は無視されます。
2. **本番環境で「全 Pod の一括削除」は危険**：  
   本実験では `kubectl delete pods --all` で新イメージを反映させましたが、本番環境ではダウンタイムが発生し、新イメージの起動失敗時にサービス全滅のリスクを伴います。
3. **Deployment への移行**：  
   RC は旧世代のリソースであり、現在は Deployment + ReplicaSet への置き換えが標準です。Deployment は宣言的更新、ローリングアップデート、カナリアリリース、即時ロールバック（`rollout undo`）をネイティブにサポートしています。
