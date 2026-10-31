---
title: "Kubernetes ブルーグリーンデプロイとカナリアリリース実践：3つのデプロイ戦略の比較"
date: 2026-10-31T20:05:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "ReplicationController", "BlueGreen", "Canary"]
showToc: true
summary: "Kubernetes 環境におけるブルーグリーンデプロイ、カナリアリリース、A/B テストの 3 つのデプロイ戦略を徹底比較。デュアル ReplicationController と Service ラベルセレクターの切り替え（apps: xiuxian -> apps: green）によるゼロダウンタイム瞬時トラフィック切替の実践、およびデュアルラベル設計（業務ラベル school: czu とバージョンラベル apps: v1/v2）とレプリカ数調整による段階的なカナリアリリースの全検証手順を詳しく解説。"
---

# Kubernetes ブルーグリーンデプロイとカナリアリリース実践：3つのデプロイ戦略の比較

## 一、3つのデプロイ戦略の比較

| 戦略 | 特徴 | デメリット |
| --- | --- | --- |
| ブルーグリーンデプロイ | 2つの環境（ブルー・グリーン）を同時にデプロイするが、外部トラフィックを受け付けるのは片方のみ | 一方の環境がアイドル（空振り）状態になる |
| カナリアリリース（灰度） | 一度にすべてを置き換えるのではなく段階的に置換；一部のアプリケーションをアップグレードして検証し、新旧バージョンが一時的に共存したのち、最終的に新バージョンへ完全移行 | アップデート範囲のきめ細かい制御が困難 |
| A/B テスト | 特定のユーザーに新バージョンを案内・アクセスさせることが可能 | 専用コンポーネント（Istio など）の個別デプロイが必要 |

Kubernetes での3つの戦略の基本アプローチ：

**ブルーグリーン**：① コントローラーで blue バージョンを作成；② Service を blue バージョンの Pod に紐付け；③ コントローラーで green バージョンを作成；④ Service のラベルセレクターを green バージョンに変更。

**カナリア**：① コントローラーで旧バージョンを作成、2組のラベルを設定（`apps: v1` + `type: xiuxian`）、レプリカ数 3；② Service を共通業務ラベル（`type: xiuxian`）に紐付け；③ コントローラーで新バージョンを作成、同様に2組のラベル（`apps: v2` + `type: xiuxian`）、レプリカ数 1；④ 旧バージョンを 3→0、新バージョンを 1→3 へスケール。

**A/B**：ユーザー属性に応じたトラフィック振り分けに Istio 等のコンポーネントが必要。本環境では未デプロイのため比較のみ記載。

## 二、ブルーグリーンデプロイ実戦

作業ディレクトリ `/dawn/manifests/01-blue-green/`、合計 3 つのマニフェスト。

### 1. ブルーバージョンのデプロイ

```bash
[root@master 01-blue-green]# cat 01-blue-xiuxian-v1.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-blue
spec:
  replicas: 3
  selector:
    apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

```bash
[root@master 01-blue-green]# cat 02-svc-xiuxian.yaml
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
    targetPort: 80
[root@master 01-blue-green]# kubectl apply -f .
replicationcontroller/xiuxian-blue created
service/xiuxian-svc created
[root@master 01-blue-green]# kubectl get pods -l apps=xiuxian -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-blue-fh7v9   1/1     Running   0          23s   10.100.2.61   worker02   <none>           <none>
xiuxian-blue-phnjx   1/1     Running   0          24s   10.100.1.63   worker01   <none>           <none>
xiuxian-blue-pznkf   1/1     Running   0          23s   10.100.1.64   worker01   <none>           <none>
```

### 2. アクセステスト

```bash
[root@master 01-blue-green]# kubectl get svc xiuxian-svc
NAME          TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc   ClusterIP   10.200.250.148   <none>        80/TCP    4s
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

10 回のリクエストすべてが v1 にヒットし、ブルーバージョンがトラフィックを独占。

### 3. グリーンバージョンのデプロイ

```bash
[root@master 01-blue-green]# cat 03-green-xiuxian-v2.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-green
spec:
  replicas: 3
  selector:
    apps: green
  template:
    metadata:
      labels:
        apps: green
    spec:
      containers:
      - image: harbor:443/dawn/apps:v2
        name: xiuxian
```

```bash
[root@master 01-blue-green]# kubectl apply -f 03-green-xiuxian-v2.yaml
replicationcontroller/xiuxian-green created
[root@master 01-blue-green]# kubectl get pods -o wide -l apps=green
NAME                  READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-green-4xgc6   1/1     Running   0          8s    10.100.2.62   worker02   <none>           <none>
xiuxian-green-9cghm   1/1     Running   0          8s    10.100.1.65   worker01   <none>           <none>
xiuxian-green-bcbjs   1/1     Running   0          8s    10.100.2.63   worker02   <none>           <none>
```

この時点でブルーとグリーンの両方合わせて 6 つの Pod がすべて Running ですが、Service のセレクターは依然として `apps: xiuxian` のため、トラフィックはブルーバージョンにのみ流れます。ループアクセスで再確認：

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
      8 DAWN apps v1
```

8 回のリクエストすべてが依然として v1 です。グリーンバージョンは「デプロイ済みだがトラフィックは処理しない」状態にあります——これはブルーグリーンデプロイにおける「一方の環境がアイドル状態で空振りする」デメリットの端的な表れであり、同時にいつでも安全にロールバックできる理由でもあります。

### 4. バージョンの切り替え

Service のセレクターを変更し、ブルーをコメントアウトしてグリーンへ切り替えます：

```bash
[root@master 01-blue-green]# sed -i 's|^    apps: xiuxian|    # apps: xiuxian\n    apps: green|' 02-svc-xiuxian.yaml
[root@master 01-blue-green]# cat 02-svc-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    # apps: xiuxian
    apps: green
  ports:
  - port: 80
    targetPort: 80
[root@master 01-blue-green]# kubectl apply -f 02-svc-xiuxian.yaml
service/xiuxian-svc configured
[root@master 01-blue-green]# kubectl describe svc xiuxian-svc
Name:              xiuxian-svc
Namespace:         default
Labels:            <none>
Annotations:       <none>
Selector:          apps=green
Type:              ClusterIP
IP Family Policy:  SingleStack
IP Families:       IPv4
IP:                10.200.250.148
IPs:               10.200.250.148
Port:              <unset>  80/TCP
TargetPort:        80/TCP
Endpoints:         10.100.1.65:80,10.100.2.62:80,10.100.2.63:80
Session Affinity:  None
Events:            <none>
```

`Selector` が `apps=xiuxian` から `apps=green` に変更；

`Endpoints` が瞬時に 3 つのブルー Pod から 3 つのグリーン Pod へホットスワップ；

ClusterIP は 10.200.250.148 のまま不変——クライアント側には完全な透過性があり、設定変更は一切不要です。

ループアクセスで検証すると、トラフィックは完全にグリーンバージョンに切り替わっています：

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v2
```

10 回のリクエストすべてが v2 にヒットし、切り替えが完了しました。もし新バージョンに問題が生じた場合でも、Service のセレクターを `apps: xiuxian` に戻して再度 apply するだけで即座にロールバック可能です——ブルーの Pod はそのまま保持されています。

### 5. テスト環境の削除

```bash
[root@master 01-blue-green]# kubectl delete -f .
replicationcontroller "xiuxian-blue" deleted
service "xiuxian-svc" deleted
replicationcontroller "xiuxian-green" deleted
[root@master 01-blue-green]# kubectl get all
NAME                 TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/kubernetes   ClusterIP   10.200.0.1     <none>        443/TCP   22h
```

## 三、カナリアリリース実戦

作業ディレクトリ `/dawn/manifests/02-huidu/`、合計 3 つのマニフェスト。コア設計はデュアルラベルです：`apps: v1/v2` でバージョンを区別し、`school: czu` を共通業務ラベルとします。Service が `school: czu` を選択することで、新旧両バージョンの Pod が同時に Endpoints に登録され、レプリカ数の比率に応じてトラフィックが分散されます。

### 1. 旧バージョンのデプロイ

```bash
[root@master 02-huidu]# cat 01-old-xiuxian-v1.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-old
spec:
  replicas: 3
  selector:
    apps: v1
  template:
    metadata:
      labels:
        apps: v1
        school: czu
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

```bash
[root@master 02-huidu]# cat 02-svc-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    school: czu
  ports:
  - port: 80
    targetPort: 80
[root@master 02-huidu]# kubectl apply -f .
replicationcontroller/xiuxian-old created
service/xiuxian-svc created
[root@master 02-huidu]# kubectl get pods -l apps=v1 -o wide
NAME                READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-old-gd5lf   1/1     Running   0          8s    10.100.1.66   worker01   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          8s    10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          8s    10.100.2.64   worker02   <none>           <none>
[root@master 02-huidu]# kubectl get svc
NAME          TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
kubernetes    ClusterIP   10.200.0.1      <none>        443/TCP   3d
xiuxian-svc   ClusterIP   10.200.28.1     <none>        80/TCP    17s
```

### 2. アプリケーションのテスト

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

10 回のリクエストすべてが v1、旧バージョンが正常に稼働しています。

### 3. 新バージョンのデプロイ

```bash
[root@master 02-huidu]# cat 03-new-xiuxian-v2.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-new
spec:
  replicas: 1
  selector:
    apps: v2
  template:
    metadata:
      labels:
        apps: v2
        school: czu
    spec:
      containers:
      - image: harbor:443/dawn/apps:v2
        name: xiuxian
```

```bash
[root@master 02-huidu]# kubectl apply -f 03-new-xiuxian-v2.yaml
replicationcontroller/xiuxian-new created
[root@master 02-huidu]# kubectl get pods -o wide -l apps=v2
NAME                READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          8s    10.100.1.67   worker01   <none>           <none>
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          8s      10.100.1.67   worker01   <none>           <none>
xiuxian-old-gd5lf   1/1     Running   0          2m25s   10.100.1.66   worker01   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          2m25s   10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          2m25s   10.100.2.64   worker02   <none>           <none>
```

新バージョンが 1 レプリカでオンラインに。`-l school` で確認すると、4 つの Pod すべてに `school=czu` が付与されており、すべて Service のバックエンドに登録されています。

### 4. Pod アクセス状況の観察

この時点で新旧バージョンが共存する状態になります。8 秒間ループアクセスを実行：

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     20 DAWN apps v1
      6 DAWN apps v2
```

v1 が 20 回 + v2 が 6 回、約 23% のトラフィックが新バージョンに割り振られ、レプリカ比率（新 1 / 合計 4 = 25%）とほぼ一致します。

### 5. 新バージョンで段階的に旧バージョンを置換

旧バージョンのレプリカを 3→0、新バージョンを 1→3 へ、3 段階に分けて進行します。

**第1フェーズ：旧 3→2、新 1→2**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=2
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl scale rc xiuxian-new --replicas=2
replicationcontroller/xiuxian-new scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          117s    10.100.1.67   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          6s      10.100.2.66   worker02   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          4m14s   10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          4m14s   10.100.2.64   worker02   <none>           <none>
```

新旧 2:2 でトラフィックはほぼ半々。

**第2フェーズ：旧 2→1、新 2→3**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=1
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl scale rc xiuxian-new --replicas=3
replicationcontroller/xiuxian-new scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          2m44s   10.100.1.67   worker01   <none>           <none>
xiuxian-new-b97q2   1/1     Running   0          6s      10.100.1.68   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          53s     10.100.2.66   worker02   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          5m1s     10.100.2.65   worker02   <none>           <none>
```

新旧 1:3 で新バージョンが約 75% のトラフィックを処理。

**第3フェーズ：旧 1→0**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=0
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          3m47s   10.100.1.67   worker01   <none>           <none>
xiuxian-new-b97q2   1/1     Running   0          69s     10.100.1.68   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          116s    10.100.2.66   worker02   <none>           <none>
```

### 6. 実行結果の確認

クラスタ内はすべて v2 バージョンとなり、旧バージョンのレプリカ数は 0 に。

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     17 DAWN apps v2
[root@master 02-huidu]# kubectl get endpoints xiuxian-svc
NAME          ENDPOINTS                                      AGE
xiuxian-svc   10.100.1.67:80,10.100.1.68:80,10.100.2.66:80   7m32s
```

17 回のリクエストすべてが v2 となり、Endpoints には 3 つの新バージョン Pod のみが残され、カナリアリリースが完了しました。
