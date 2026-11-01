---
title: "K8S ReplicaSet と Deployment コントローラー実践：レプリカ制御・ローリングアップデート・ロールバック機能"
date: 2026-11-01T11:28:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ReplicaSet", "Deployment"]
showToc: true
summary: "Kubernetes の ReplicaSet および Deployment コントローラーの実践検証。matchLabels と matchExpressions ラベルセレクターによる既存 Pod 養子縁組（Adoption）の仕組み、Recreate および RollingUpdate アップデート戦略（maxSurge と maxUnavailable の詳細検証）、そして宣言的・応答的なローリングアップデートと履歴バージョンへのロールバックを網羅。"
---

# K8S ReplicaSet と Deployment コントローラー実践：レプリカ制御・ローリングアップデート・ロールバック機能

## 一、rs コントローラー

### 1. 役割

Pod のレプリカ制御を実現します。ReplicationController（rc）リソースと比較して、より高機能かつ軽量です。

### 2. ケース 1——rs による rc 同等機能の実装

作業ディレクトリ `/dawn/manifests/rs/`

```bash
[root@master rs]# cat 01-rs-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian
spec:
  # Podのレプリカ数を指定
  replicas: 3
  # Podの関連付け方法を定義
  selector:
    # ラベルに基づいてPodを関連付け
    matchLabels:
      apps: xiuxian
  # Podテンプレートを定義
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

```bash
[root@master rs]# kubectl apply -f 01-rs-xiuxian-matchLabels.yaml
replicaset.apps/rs-xiuxian created
[root@master rs]# kubectl get rs -o wide
NAME         DESIRED   CURRENT   READY   AGE   CONTAINERS   IMAGES                    SELECTOR
rs-xiuxian   3         3         3       6s    c1           harbor:443/dawn/apps:v1   apps=xiuxian
[root@master rs]# kubectl get pods --show-labels
NAME               READY   STATUS    RESTARTS   AGE   LABELS
rs-xiuxian-gdq7b   1/1     Running   0          6s    apps=xiuxian,version=v1
rs-xiuxian-m9xqr   1/1     Running   0          6s    apps=xiuxian,version=v1
rs-xiuxian-rcdnr   1/1     Running   0          6s    apps=xiuxian,version=v1
```

3 基の Pod がすべて Running 状態となり、ラベルはテンプレートと一致しています。rc と同様、matchLabels 等値セレクターによってレプリカ制御が完了しました。

### 3. ケース 2——rs が rc より優れている機能（matchExpressions による養子縁組）

#### 3.1 テスト環境の準備

まず `kubectl run` で 4 基の素の Pod を作成し、それぞれ異なるラベルを付与します。

K8S v1.23 の `kubectl run` はデフォルトで Pod ではなく Deployment を作成するため、素の Pod を作成するには `--restart=Never` を付加する必要があります。

```bash
[root@master ~]# kubectl run xiuxian01 --image=harbor:443/dawn/apps:v1 --restart=Never
pod/xiuxian01 created
[root@master ~]# kubectl run xiuxian02 --image=harbor:443/dawn/apps:v2 --restart=Never
pod/xiuxian02 created
[root@master ~]# kubectl run xiuxian03 --image=harbor:443/dawn/apps:v3 --restart=Never
pod/xiuxian03 created
[root@master ~]# kubectl label pod xiuxian01 apps=v1
pod/xiuxian01 labeled
[root@master ~]# kubectl label pod xiuxian02 apps=v2
pod/xiuxian02 labeled
[root@master ~]# kubectl label pod xiuxian03 apps=v3
pod/xiuxian03 labeled
[root@master ~]# kubectl get pods --show-labels
NAME        READY   STATUS    RESTARTS   AGE   LABELS
xiuxian01   1/1     Running   0          9s    apps=v1,run=xiuxian01
xiuxian02   1/1     Running   0          8s    apps=v2,run=xiuxian02
xiuxian03   1/1     Running   0          8s    apps=v3,run=xiuxian03
[root@master ~]# kubectl run xiuxian04 --image=harbor:443/dawn/apps:v2 --restart=Never
pod/xiuxian04 created
[root@master ~]# kubectl label pod xiuxian04 apps=v4
pod/xiuxian04 labeled
[root@master ~]# kubectl get pods --show-labels
NAME        READY   STATUS    RESTARTS   AGE     LABELS
xiuxian01   1/1     Running   0          13s     apps=v1,run=xiuxian01
xiuxian02   1/1     Running   0          12s     apps=v2,run=xiuxian02
xiuxian03   1/1     Running   0          12s     apps=v3,run=xiuxian03
xiuxian04   1/1     Running   0          4s      apps=v4,run=xiuxian04
```

#### 3.2 rs リソースの作成

```bash
[root@master rs]# cat 02-rs-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian-matchexpressions
spec:
  # Podのレプリカ数を指定
  replicas: 5
  # Podの関連付け方法を定義
  selector:
    # ラベル式に基づいてPodを関連付け
    matchExpressions:
      # ラベルのkeyを表す
    - key: apps
      # ラベルのvalueを表す
      values:
      - v1
      - v2
      - v3
      # keyとvaluesの関係を指定: In, NotIn, Exists, DoesNotExist
      #   In:
      #      keyの値がvaluesリスト内に存在する必要がある。
      #   NotIn:
      #      Inの逆。
      #   Exists:
      #      keyが存在すれば値は任意（valueフィールド省略可能）。
      #   DoesNotExist:
      #      指定したkeyが存在しないこと（Existsの逆、valueフィールド省略可能）。
      operator: In
  # Podのテンプレートを定義
  template:
    metadata:
      labels:
        apps: v1
        school: czu
        class: computer01
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

```bash
[root@master rs]# kubectl apply -f 02-rs-xiuxian-matchExpressions.yaml
replicaset.apps/rs-xiuxian-matchexpressions created
[root@master rs]# kubectl get pods --show-labels
NAME                                READY   STATUS    RESTARTS   AGE     LABELS
rs-xiuxian-matchexpressions-cdhjw   1/1     Running   0          6s      apps=v1,class=computer01,school=czu
rs-xiuxian-matchexpressions-q8s66   1/1     Running   0          6s      apps=v1,class=computer01,school=czu
xiuxian01                           1/1     Running   0          27s     apps=v1,run=xiuxian01
xiuxian02                           1/1     Running   0          26s     apps=v2,run=xiuxian02
xiuxian03                           1/1     Running   0          26s     apps=v3,run=xiuxian03
xiuxian04                           1/1     Running   0          18s     apps=v4,run=xiuxian04
```

これが rs が rc より優れている点です：RS は 5 つのレプリカを宣言しましたが、新規作成された Pod は 2 基のみ（`cdhjw`、`q8s66`）です。`matchExpressions` の集合セレクター `apps In (v1,v2,v3)` によって既存の xiuxian01/02/03 が養子縁組（Adoption）されたためです（既存 3 基 + 新規 2 基 = 5）。一方、xiuxian04 のラベルは `apps=v4` であり In リストに含まれないため、養子縁組されません。

養子縁組の挙動は ownerReferences で実証されます：

```bash
[root@master rs]# kubectl get pod xiuxian01 -o jsonpath='{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}'
ReplicaSet/rs-xiuxian-matchexpressions
```

```bash
[root@master rs]# kubectl describe rs rs-xiuxian-matchexpressions | head -12
Name:         rs-xiuxian-matchexpressions
Namespace:    default
Selector:     apps in (v1,v2,v3)
Labels:       <none>
Annotations:  <none>
Replicas:     5 current / 5 desired
Pods Status:  5 Running / 0 Waiting / 0 Succeeded / 0 Failed
Pod Template:
  Labels:  apps=v1
           class=computer01
           school=czu
```

RS を削除すると、養子縁組された Pod もカスケード削除されます（xiuxian01/02/03 は RS と共に消滅）。一方、養子縁組されなかった xiuxian04 は「孤児」となり個別に削除する必要があります：

```bash
[root@master rs]# kubectl delete -f 02-rs-xiuxian-matchExpressions.yaml && kubectl delete pod xiuxian04
replicaset.apps "rs-xiuxian-matchexpressions" deleted
pod "xiuxian04" deleted
```

## 二、deploy コントローラー

### 1. 役割

サービスをデプロイするために使用され、内部的には rs を通じて Pod のレプリカ数を制御し、直接 Pod を制御することはありません。rc や rs と比較して、deploy は宣言的更新をサポートします。

### 2. ケース 1——matchLabels に基づくマッチング

```bash
[root@master deploy]# cat 01-deploy-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian
spec:
  # Podのレプリカ数を指定
  replicas: 3
  # Podの関連付け方法を定義
  selector:
    # ラベルに基づいてPodを関連付け
    matchLabels:
      apps: xiuxian
  # Podのテンプレートを定義
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2
```

### 3. ケース 2——matchExpressions に基づくマッチング

```bash
[root@master deploy]# cat 02-deloy-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deploy-xiuxian-matchexpressions
spec:
  # Podのレプリカ数を指定
  replicas: 5
  # Podの関連付け方法を定義
  selector:
    # ラベル式に基づいてPodを関連付け
    matchExpressions:
      # ラベルのkeyを表す
    - key: apps
      # ラベルのvalueを表す
      values:
      - v1
      - v2
      - v3
      # keyとvaluesの関係を指定: In, NotIn, Exists, DoesNotExist
      operator: In
  # Podのテンプレートを定義
  template:
    metadata:
      labels:
        apps: v1
        school: czu
        class: computer01
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

### 4. テスト検証

```bash
[root@master deploy]# kubectl apply -f 01-deploy-xiuxian-matchLabels.yaml
deployment.apps/deloy-xiuxian created
[root@master deploy]# kubectl apply -f 02-deloy-xiuxian-matchExpressions.yaml
deployment.apps/deploy-xiuxian-matchexpressions created
[root@master deploy]# kubectl get deploy,rs,pods
NAME                                              READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/deloy-xiuxian                     3/3     3            3           8s
deployment.apps/deploy-xiuxian-matchexpressions   5/5     5            5           8s

NAME                                                        DESIRED   CURRENT   READY   AGE
replicaset.apps/deloy-xiuxian-598b97f7f                     3         3         3       8s
replicaset.apps/deploy-xiuxian-matchexpressions-c89bdf6fc   5         5         5       8s

NAME                                                  READY   STATUS    RESTARTS   AGE
pod/deloy-xiuxian-598b97f7f-5s69q                     1/1     Running   0          8s
pod/deloy-xiuxian-598b97f7f-gg5lf                     1/1     Running   0          8s
pod/deloy-xiuxian-598b97f7f-npw2r                     1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-9xwnz   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-fch47   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-lj9ck   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-q5wbp   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-xbt7n   1/1     Running   0          8s
```

**Deployment → ReplicaSet → Pod**。各 Deployment の配下に RS が自動生成され（名前には pod-template-hash サフィックスが付与）、Pod 名にはさらにランダムなサフィックスが付加されます。Deployment は Pod を直接管理せず、すべて RS を経由して中継されます。

## 三、deployments の Recreate アップグレード戦略

まず上記の2つの Deployment をクリーンアップします（セレクター `apps: xiuxian` が後続の update デプロイと競合し、Pod が誤って養子縁組されるのを防ぐため）。その上で Recreate 戦略を適用します：

```bash
[root@master deploy]# kubectl delete -f 01-deploy-xiuxian-matchLabels.yaml -f 02-deloy-xiuxian-matchExpressions.yaml
deployment.apps "deloy-xiuxian" deleted
deployment.apps "deploy-xiuxian-matchexpressions" deleted
[root@master deploy]# cat 03-deploy-update-Recreate.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian-update
spec:
  # アップグレード戦略
  strategy:
    # アップグレードのタイプを指定。"Recreate" または "RollingUpdate"
    #   Recreate:
    #     すべての古いPodを削除してから新しいPodを作成する。推奨されません。
    type: Recreate
  replicas: 3
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v3
         # イメージプルポリシーの指定。有効値: Always, Never, IfNotPresent
         #    Never:
         #      ローカルにイメージがあれば起動を試みる。
         #      ローカルにイメージが無ければリモートリポジトリからプルしない。
         #    IfNotPresent:
         #      ローカルにイメージがあれば起動を試みる。
         #      ローカルにイメージが無ければリモートリポジトリからプルする。
         #    Always:
         #      ローカルにイメージがあっても、リモートリポジトリのダイジェスト情報と比較し、一致すればローカルキャッシュを使用、不一致なら再プルする。
         #      ローカルにイメージが無ければ、直接リモートリポジトリからプルする。
         #
         # デフォルトポリシーはイメージタグによって決定:
         #    タグが "latest" の場合、デフォルトポリシーは "Always";
         #    タグが "latest" 以外の場合、デフォルトポリシーは "IfNotPresent"
         imagePullPolicy: Always

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-deploy
spec:
  type: ClusterIP
  clusterIP: 10.200.0.80
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

```bash
[root@master deploy]# kubectl apply -f 03-deploy-update-Recreate.yaml
deployment.apps/deloy-xiuxian-update created
service/xiuxian-svc-deploy created
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 0 out of 3 new replicas have been updated...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 0 of 3 updated replicas are available...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 1 of 3 updated replicas are available...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 2 of 3 updated replicas are available...
deployment "deloy-xiuxian-update" successfully rolled out
[root@master deploy]# kubectl get pods -o wide
NAME                                   READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
deloy-xiuxian-update-57969ff46-9gfzg   1/1     Running   0          2s    10.100.1.77   worker01   <none>           <none>
deloy-xiuxian-update-57969ff46-fzmmj   1/1     Running   0          2s    10.100.1.78   worker01   <none>           <none>
deloy-xiuxian-update-57969ff46-zkfp9   1/1     Running   0          2s    10.100.2.76   worker02   <none>           <none>
[root@master deploy]# kubectl get svc xiuxian-svc-deploy
NAME                 TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc-deploy   ClusterIP   10.200.0.80   <none>        80/TCP    3s
```

Recreate によって初回に 3 基の v3 Pod がデプロイされました。svc は YAML 内でハードコードされた `clusterIP: 10.200.0.80` で固定アドレスを持ちます——Service ネットワークセグメント内の空き IP を指定することで、サービスのエントリポイントを固定できます。

## 四、deployments の RollingUpdate アップグレード戦略

同一の Deployment を RollingUpdate 戦略に変更：レプリカ数 3→5、イメージ v3→v2、`maxSurge: 2`、`maxUnavailable: 1`：

```bash
[root@master deploy]# cat 03-deploy-update-RollingUpdate.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian-update
spec:
  # アップグレード戦略
  strategy:
    # アップグレードのタイプを指定。"Recreate" または "RollingUpdate"
    #   Recreate:
    #     すべての古いPodを削除してから新しいPodを作成する。推奨されません。
    #   RollingUpdate:
    #     ローリングアップデートを表し、一部のPodを順次更新して古いPodを段階的に置き換える。デフォルトはこのタイプ。
    type: RollingUpdate
    # ローリングアップデート戦略を定義。"type: RollingUpdate" の場合のみ有効。
    rollingUpdate:
      # アップグレード中、希望レプリカ数を超えて起動できる最大Pod数。
      # パーセンテージおよび数値をサポート。指定しない場合のデフォルトは "25%"。
      maxSurge: 2
      # アップグレード中、利用不可にできる最大Pod数。
      # パーセンテージおよび数値をサポート。指定しない場合のデフォルトは "25%"。
      maxUnavailable: 1
  replicas: 5
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2
         imagePullPolicy: Always

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-deploy
spec:
  type: ClusterIP
  clusterIP: 10.200.0.80
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

apply 実行直後に連続スナップショットを取得すると、ローリングの推移が一目瞭然です：

```bash
[root@master deploy]# kubectl apply -f 03-deploy-update-RollingUpdate.yaml
deployment.apps/deloy-xiuxian-update configured
service/xiuxian-svc-deploy unchanged
[root@master deploy]# kubectl get pods -o wide        # t0：新RSのPodスケジューリング開始
NAME                                    READY   STATUS              RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-57969ff46-9gfzg    1/1     Running             0          17s   10.100.1.77   worker01
deloy-xiuxian-update-57969ff46-bfgf9    0/1     ContainerCreating   0          0s    <none>        worker02
deloy-xiuxian-update-57969ff46-fzmmj    1/1     Running             0          17s   10.100.1.78   worker01
deloy-xiuxian-update-57969ff46-zjmt2    0/1     ContainerCreating   0          0s    <none>        worker01
deloy-xiuxian-update-57969ff46-zkfp9    1/1     Running             0          17s   10.100.2.76   worker02
deloy-xiuxian-update-76dd8844b9-8p9pj   0/1     Pending             0          0s    <none>        <none>
deloy-xiuxian-update-76dd8844b9-cvhkc   0/1     Pending             0          0s    <none>        worker02
[root@master deploy]# kubectl get pods -o wide        # t+2s：新Pod起動、旧Pod終了開始
NAME                                    READY   STATUS              RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-57969ff46-9gfzg    1/1     Running             0          19s   10.100.1.77   worker01
deloy-xiuxian-update-57969ff46-bfgf9    0/1     Terminating         0          2s    <none>        worker02
deloy-xiuxian-update-57969ff46-fzmmj    1/1     Running             0          19s   10.100.1.78   worker01
deloy-xiuxian-update-57969ff46-zjmt2    0/1     Terminating         0          2s    10.100.1.79   worker01
deloy-xiuxian-update-57969ff46-zkfp9    1/1     Running             0          19s   10.100.2.76   worker02
deloy-xiuxian-update-76dd8844b9-8p9pj   1/1     Running             0          2s    10.100.1.80   worker01
deloy-xiuxian-update-76dd8844b9-cvhkc   0/1     ContainerCreating   0          2s    <none>        worker02
deloy-xiuxian-update-76dd8844b9-nf74j   0/1     ContainerCreating   0          2s    <none>        worker02
deloy-xiuxian-update-76dd8844b9-tc9j4   0/1     ContainerCreating   0          0s    <none>        worker01
[root@master deploy]# kubectl get pods -o wide        # t+5s：旧Pod全終了、新Pod5基レディ
NAME                                    READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-76dd8844b9-8p9pj   1/1     Running   0          5s    10.100.1.80   worker01
deloy-xiuxian-update-76dd8844b9-cvhkc   1/1     Running   0          5s    10.100.2.79   worker02
deloy-xiuxian-update-76dd8844b9-nf74j   1/1     Running   0          5s    10.100.2.78   worker02
deloy-xiuxian-update-76dd8844b9-tc9j4   1/1     Running   0          3s    10.100.1.81   worker01
deloy-xiuxian-update-76dd8844b9-xrr4n   1/1     Running   0          3s    10.100.2.80   worker02
```

**t0**：レプリカ数を 3 から 5 にスケールさせるため、旧 RS（`57969ff46`、v3）がまず 2 基の Pod（`bfgf9`、`zjmt2`）を補充します。同時に新 RS（`76dd8844b9`、v2）の Pod が Pending に入ります——これが `maxSurge: 2`（希望レプリカ数を最大 2 基超過可能）の動作です。

**t+2s**：新旧が共存し、Pod 総数は 7 基（希望 5 + surge 2）と `maxSurge` を厳密に維持。旧 Pod は `Terminating` に入り、`maxUnavailable: 1` のローリングリズムに沿って処理されます。

**t+5s**：旧 RS の Pod がすべて終了し、5 基の新 Pod がすべて Running となり、ローリングアップデートが完了しました。

```bash
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update
deployment "deloy-xiuxian-update" successfully rolled out
[root@master deploy]# kubectl get rs
NAME                              DESIRED   CURRENT   READY   AGE
deloy-xiuxian-update-57969ff46    0         0         0       38s
deloy-xiuxian-update-76dd8844b9   5         5         5       21s
[root@master deploy]# kubectl rollout history deploy deloy-xiuxian-update
deployment.apps/deloy-xiuxian-update
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
```

旧 RS はレプリカ数 0 に縮小されますがオブジェクト自体は保持されます（revision 1 = Recreate の v3、revision 2 = RollingUpdate の v2）。

## 五、deploy による応答的アップデートとロールバックの実装

update デプロイをクリーンアップ後、デモ専用の `deloy-xiuxian-update-strategy` を作成します（3 レプリカ、v1、デフォルトの RollingUpdate）：

```bash
[root@master deploy]# kubectl delete -f 03-deploy-update-RollingUpdate.yaml
deployment.apps "deloy-xiuxian-update" deleted
service "xiuxian-svc-deploy" deleted
[root@master deploy]# kubectl apply -f 04-deploy-xiuxian-update-strategy.yaml
deployment.apps/deloy-xiuxian-update-strategy created
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 1. 応答的アプリケーション更新

```bash
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v3
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v1
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 2. アプリケーションのリリース履歴バージョンの確認

```bash
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
3         <none>
```

履歴バージョンが 2 から始まり 1 が見当たらない現象——これはコマンドのエラーではなく、テンプレート再利用による revision の番号書き換えによるものです。3回目の更新（v1 に戻す）のテンプレートが revision 1 と完全に一致したため、Deployment は revision 1 の ReplicaSet（`65987b5db8`）を直接再利用し、その revision 番号を 3 に書き換えたため、revision 1 が消滅しました。

### 3. 現在のアプリケーションのデプロイ状態の確認

```bash
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 4. アップデートの一時停止

```bash
[root@master deploy]# kubectl rollout pause deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy paused
```

単に一時停止するだけでは分かりにくいため、一時停止中に再度イメージを変更することで、pause が実際に更新を「中断・保留」していることを確認します——spec はすでに v2 に変更されていますが、Pod は微動だにしません：

```bash
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v2
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl get pods -o wide
NAME                                             READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-strategy-65987b5db8-5smhl   1/1     Running   0          23s   10.100.2.84   worker02
deloy-xiuxian-update-strategy-65987b5db8-wcrn2   1/1     Running   0          24s   10.100.1.86   worker01
deloy-xiuxian-update-strategy-65987b5db8-wk2xd   1/1     Running   0          26s   10.100.2.83   worker02
$ echo -n 'specイメージ: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
specイメージ: harbor:443/dawn/apps:v2
```

spec はすでに v2 になっていますが、Pod は依然としてすべて v1 の `65987b5db8` です。

### 5. アップデートの再開

```bash
[root@master deploy]# kubectl rollout resume deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy resumed
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
Waiting for deployment "deloy-xiuxian-update-strategy" rollout to finish: 1 out of 3 new replicas have been updated...
...
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl get pods -o wide
NAME                                             READY   STATUS        RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-strategy-65987b5db8-wcrn2   1/1     Terminating   0          28s   10.100.1.86   worker01
deloy-xiuxian-update-strategy-76dd8844b9-7lc7s   1/1     Running       0          1s    10.100.2.86   worker02
deloy-xiuxian-update-strategy-76dd8844b9-qskbf   1/1     Running       0          4s    10.100.1.87   worker01
deloy-xiuxian-update-strategy-76dd8844b9-v469q   1/1     Running       0          3s    10.100.2.85   worker02
```

resume を実行すると保留されていた更新が直ちに再開され、v2（新 RS `76dd8844b9`）へとローリングします。このハッシュは上記の update デプロイにおける v2 RS と同一です——pod-template-hash は Pod テンプレートの内容のみによって決定され、所属する Deployment には依存しないため、同一テンプレートの RS ハッシュは必ず一致します。

### 6. 直前のバージョンへのロールバック

```bash
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
4         <none>
5         <none>
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
5         <none>
6         <none>
```

undo を実行するたびに、直前バージョンのテンプレートが新たな revision として再デプロイされます（revision 番号はインクリメントされ、古い番号は再利用されて上書きされます）。そのため、履歴リストの番号は連続せずスキップします：2,4,5 → 2,5,6。

### 7. 指定バージョンへのロールバック

```bash
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy --to-revision=2
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
5         <none>
6         <none>
7         <none>
[root@master deploy]# echo -n '最終イメージ: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
最终镜像: harbor:443/dawn/apps:v3
```

revision 2 は v3 であり、ロールバック後の現在のイメージは確かに v3 となり実験のループが完結しました。この時点で `--revision=2` の詳細を再度確認すると `unable to find the specified revision` と表示されます——revision 2 の RS は後続の undo によって再利用され 7 に番号変更されたためです（この v3 テンプレートを確認するには `kubectl rollout history --revision=7` が必要です）。
