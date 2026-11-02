---
title: "K8S Pod スケジューリング実践全解：指向性スケジューリング、ノード・Pod 軟硬親和性と Taints・Tolerations の深層"
date: 2026-11-02T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Scheduler", "NodeAffinity", "PodAffinity", "Taints", "Tolerations", "Pod"]
showToc: true
summary: "Kubernetes における Pod スケジューリング戦略と基盤メカニズムを徹底解説：nodeName によるスケジューラバイパスやネットワークポート競合の回避策、Taints（NoSchedule・PreferNoSchedule・NoExecute）と精密・全容認 Tolerations の実機検証、NodeAffinity 軟硬親和性の重み付けフォールバック、カスタムトポロジー dc に基づく PodAffinity 同居配置と PodAntiAffinity 高可用排他分散の実践まで網羅。"
---

# K8S Pod スケジューリング実践全解：指向性スケジューリング、ノード・Pod 軟硬親和性と Taints・Tolerations の深層

---

## 一、Pod スケジューリング

### 1.1 nodeName —— スケジューラのバイパス

```yaml
# 直接指定节点，调度器完全不参与
spec:
  nodeName: worker01
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

**リスク：** スケジューラによるすべての保護機構（リソース空き容量チェック、Pod 上限数、汚点容認など）をバイパスします。レプリカコントローラと `nodeName` を組み合わせると Pod ストームを引き起こす危険性があります（後述）。

### 1.2 hostNetwork

```yaml
spec:
  hostNetwork: true           # Pod使用宿主机网络栈，IP=节点IP
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

2C/3G クラスタ上で 5 レプリカを展開した実機結果：

```bash
[root@master ~]# kubectl get pods -l apps=xiuxian | grep scheduler-hostnetwork
scheduler-hostnetwork-599fc8dd56-qkphn   1/1   Running            0   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-2vjsj   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-kptnl   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-hvpqf   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-xtm6n   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
```

1 つが Running、4 つが CrashLoopBackOff —— nginx エラー：`bind() to [::]:80 failed (98: Address in use)`。同一ノードにおいて `hostNetwork` のポート 80 は 1 つの Pod しか占有できません。

### 1.3 hostPort

```yaml
spec:
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
    ports:
    - containerPort: 80
      hostPort: 8080             # 同节点不能两个Pod绑同端口
```

5 レプリカ：2 つが Running（各ノードの hostPort 8080 を 1 つずつ占有）＋ 3 つが Pending（同一ノードでのポート競合または利用可能ポートを持つノードの枯渇）。

### 1.4 resources

```yaml
spec:
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
    resources:
      requests:                  # 决定可调度性
        cpu: 0.5
        memory: 200Mi
      limits:                    # 可超售
        cpu: 4
        memory: 8Gi
```

5 レプリカがそれぞれ 0.5 CPU を要求。2 コアの worker01（CPU requests の約 80% を消費）上では 3〜4 個でスケジューリング上限に到達。`limits` はスケジューリング計算には関与しません。

---

## 二、汚点（Taints）

ノードに対して設定する制約機構。構文：`key[=value]:effect`。

### 2.1 3 つの effect

| effect | 新規 Pod スケジューリング | 既存 Pod | 削除コマンド |
| --- | --- | --- | --- |
| **NoSchedule** | 禁止 | 影響なし | `kubectl taint node N key-` |
| **PreferNoSchedule** | 可能な限り回避 | 影響なし | `kubectl taint node N key=val:PreferNoSchedule-` |
| **NoExecute** | 禁止 | 即時退避（Evict） | `kubectl taint node N key=val:NoExecute-` |

### 2.2 現在の汚点を確認

```bash
[root@master ~]# kubectl describe nodes | grep Taints
Taints:             node-role.kubernetes.io/master:NoSchedule
Taints:             <none>
Taints:             <none>
```

master にはデフォルトで NoSchedule が付与されています（通常の Pod が master に配置されない理由）。

### 2.3 NoSchedule 汚点の付与

```bash
[root@master ~]# kubectl get pods -o wide | grep scheduler-resources
scheduler-resources-requests-...-229dr   1/1   Running   14m   10.100.2.40   worker02
scheduler-resources-requests-...-fhv2v   1/1   Running   14m   10.100.1.77   worker01
# 5个Pod分布在两worker

[root@master ~]# kubectl taint node worker02 school=dawn:NoSchedule
node/worker02 tainted

[root@master ~]# kubectl describe nodes | grep Taints
Taints:   node-role.kubernetes.io/master:NoSchedule
Taints:   <none>
Taints:   school=dawn:NoSchedule                    # worker02 新增

[root@master ~]# kubectl get pods -o wide | grep scheduler-resources
# 已有的worker02 Pod不受影响（NoSchedule不驱逐旧Pod）
```

新規 Pod のテスト（Deployment scheduler-taints、replicas: 5）：

```bash
[root@master ~]# kubectl apply -f 05-scheduler-taints.yaml
deployment.apps/scheduler-taints created

[root@master ~]# kubectl get pods -o wide | grep scheduler-taints-
scheduler-taints-...-bs8kn   1/1   Running   8s   10.100.1.79   worker01
scheduler-taints-...-lxv7m   1/1   Running   8s   10.100.1.82   worker01
scheduler-taints-...-mtl4x   1/1   Running   8s   10.100.1.81   worker01
scheduler-taints-...-wsbfk   1/1   Running   8s   10.100.1.83   worker01
scheduler-taints-...-xnrxg   1/1   Running   8s   10.100.1.80   worker01
```

すべて worker01 に配置 —— worker02 は NoSchedule により新規 Pod の配置を拒絶します。

### 2.4 汚点の削除

```bash
[root@master ~]# kubectl taint node worker02 school-
node/worker02 untainted
```

### 2.5 汚点の変更

```bash
[root@master ~]# kubectl taint node worker02 school=dawn:NoSchedule
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule --overwrite
node/worker02 modified
# 同 key + 同 effect = 同一污点，改 value 需 --overwrite
```

### 2.6 単一ノードへの複数汚点設定

```bash
[root@master ~]# kubectl taint node worker02 school=dawn:PreferNoSchedule
node/worker02 tainted
[root@master ~]# kubectl taint node worker02 class=dawn:PreferNoSchedule
node/worker02 tainted

[root@master ~]# kubectl describe nodes | grep Taints -A 2 | grep worker02 -A 2
Taints:   school=yitiantian:NoSchedule
          class=dawn:PreferNoSchedule
          school=dawn:PreferNoSchedule
```

effect が異なれば、key と value が同一でも異なる汚点として共存します。

effect が同一で value のみを変更する場合は、同一汚点とみなされるため `--overwrite` が必要です。

```bash
# 验证：同 key=school 但不同 value → 同污点，--overwrite 改值
[root@master ~]# kubectl taint node worker02 school=dark:PreferNoSchedule --overwrite
node/worker02 modified

# 验证：同 key=class，但 effect 不同 → 不同污点，无需 overwrite
[root@master ~]# kubectl taint node worker02 class=dawn:NoSchedule
node/worker02 tainted

# worker02 当前污点：
Taints:   class=dawn:NoSchedule
          school=yitiantian:NoSchedule
          class=dawn:PreferNoSchedule
          school=dark:PreferNoSchedule
```

### 2.7 PreferNoSchedule の検証

汚点を整理し、PreferNoSchedule のみにします：

```bash
[root@master ~]# kubectl taint node worker02 class-                    # 删除所有 class 污点
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule-  # 精确删除
[root@master ~]# kubectl describe nodes | grep Taints -A 2
# worker02 只剩 school=dark:PreferNoSchedule
```

大レプリカ Deployment を作成（replicas: 8, resources requests 0.5cpu/200Mi）：

```bash
[root@master ~]# kubectl apply -f 06-scheduler-PreferNoSchedule.yaml
deployment.apps/scheduler-taints-prefernoschedule created

# 8 个 Pod：worker01(4) + master(2) + worker02(2)
# worker02 仍有 Pod —— PreferNoSchedule 是软污点，资源紧时仍可调度
```

### 2.8 NoExecute の検証

汚点をクリアし、5 レプリカを展開：

```bash
[root@master ~]# kubectl describe nodes | grep Taints
# all <none> (除 master)

[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml
deployment.apps/scheduler-taints-noschedule-noexecute created

# 5 Pod: 3 on worker01 + 2 on worker02
```

NoExecute を付与：

```bash
[root@master ~]# kubectl taint node worker01 school=dawn:NoExecute
node/worker01 tainted

# worker01 上 3 个 Pod 立即被驱逐，全部重调度到 worker02
[root@master ~]# kubectl get pods -o wide | grep noschedule-noexecute
# 全部 5 个 Pod 现在都在 worker02
```

10 レプリカにスケール —— すべて worker02 に配置（worker01 には新規 Pod が配置されない）：

```bash
[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml  # replicas: 10
deployment.apps/scheduler-taints-noschedule-noexecute configured
# 10/10 Pod 全部在 worker02
```

NoExecute は非常に強力で、新規 Pod を拒絶するだけでなく、既存の Pod も即座に強制退避させます。原則として特別な理由がない限り NoSchedule の使用を推奨します。

---

## 三、汚点容認（Tolerations）

### 3.1 明示的な精密容認

環境：master(NoSchedule)、worker01(school=dawn:NoExecute)、worker02(class=dawn:NoSchedule ＋ school=yitiantain:PreferNoSchedule)

```yaml
# /dawn/manifests/scheduler/07-scheduler-tolerations.yaml
spec:
  template:
    spec:
      tolerations:
      - key: class
        value: dawn
        effect: NoSchedule                   # 容忍 worker02
      - key: school
        value: yitiantain
        effect: PreferNoSchedule             # 容忍 worker02
      - key: school
        value: dawn
        effect: NoExecute                    # 容忍 worker01
      - key: node-role.kubernetes.io/master
        effect: NoSchedule                   # 容忍 master
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/07-scheduler-tolerations.yaml
deployment.apps/scheduler-tolerations created

[root@master ~]# kubectl get pods -o wide | grep scheduler-tolerations
scheduler-tolerations-...-2xjxc   1/1   Running   29s   10.100.2.65    worker02
scheduler-tolerations-...-cwjg9   1/1   Running   29s   10.100.1.110   worker01
scheduler-tolerations-...-gdtrw   1/1   Running   29s   10.100.1.111   worker01
scheduler-tolerations-...-hj86k   1/1   Running   29s   10.100.2.64    worker02
scheduler-tolerations-...-rnpn9   1/1   Running   29s   10.100.0.10    master
```

5 つの Pod が master ＋ worker01 ＋ worker02 の全ノードに分散 —— 各ノードの汚点に対応する toleration が正しく定義されています。

### 3.2 operator: Exists —— すべての汚点を無条件容認

```yaml
# /dawn/manifests/scheduler/08-scheduler-tolerations-ignore-taints.yaml
spec:
  template:
    spec:
      tolerations:
      - operator: Exists    # 不写 key/value，无视一切污点
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/08-scheduler-tolerations-ignore-taints.yaml
deployment.apps/scheduler-tolerations-ignore-taints created

[root@master ~]# kubectl get pods -o wide | grep ignore-taints
scheduler-tolerations-ignore-taints-...-cqfpq   1/1   Running   7s   10.100.1.114   worker01
scheduler-tolerations-ignore-taints-...-plwwk   1/1   Running   7s   10.100.1.115   worker01
scheduler-tolerations-ignore-taints-...-qjwfd   1/1   Running   7s   10.100.2.69    worker02
scheduler-tolerations-ignore-taints-...-qkvw6   1/1   Running   7s   10.100.0.12    master
scheduler-tolerations-ignore-taints-...-v7f4f   1/1   Running   7s   10.100.2.68    worker02
```

5 つの Pod が 3 ノードすべてに配置 —— ノードにどのような汚点が存在していても完全に容認されます。

---

## 四、nodeSelector —— ノードラベルに基づく静的スケジューリング

### 4.1 ラベルの設定

全ノードに `school=dawn` を付与後、worker01 からラベルを削除し「ラベル付きノードへのみ配置」をシミュレート：

```bash
[root@master ~]# kubectl label nodes --all school=dawn
node/master labeled
node/worker01 labeled
node/worker02 labeled

[root@master ~]# kubectl label nodes worker01 school-
node/worker01 unlabeled

[root@master ~]# kubectl get nodes -l school=dawn --show-labels | awk '{print $1, $5}'
master school=dawn
worker02 school=dawn
```

現在の汚点環境（master には NoSchedule があるため、Pod 側に tolerations が必要）：

```bash
[root@master ~]# kubectl describe nodes | grep Taints -A 1
Taints:             node-role.kubernetes.io/master:NoSchedule    # master
Taints:             <none>                                       # worker01
Taints:             <none>                                       # worker02
```

### 4.2 nodeSelector DaemonSet のデプロイ

```yaml
# /dawn/manifests/scheduler/09-scheduler-nodeSelector.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: scheduler-nodeselector
spec:
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule              # 容忍 master 污点
      nodeSelector:
        school: dawn               # 只调度到有此标签的节点
      containers:
      - name: xiuxian
        image: harbor:443/dawn/apps:v1
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/09-scheduler-nodeSelector.yaml
daemonset.apps/scheduler-nodeselector created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide | grep scheduler-nodeselector
scheduler-nodeselector-f8mlw   1/1   Running   0   18s   10.100.0.18    master
scheduler-nodeselector-wcsnw   1/1   Running   0   18s   10.100.2.226   worker02
```

**結論：** master と worker02 にそれぞれ 1 つずつ Pod が配置（`school=dawn` ラベル保持）、worker01 には Pod なし（ラベル削除済み）。DaemonSet の tolerations により master にも正常配置されます。

---

## 五、nodeAffinity 硬限制 —— requiredDuringSchedulingIgnoredDuringExecution

### 5.1 nodeSelector と同等の単一値 In マッチ

```yaml
# /dawn/manifests/scheduler/10-scheduler-nodeAffinity.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: scheduler-nodeaffinity
spec:
  selector:
    matchLabels:
      apps: xiuxian
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: school
                values:
                - "dawn"
                operator: In                # In / NotIn / Exists / DoesNotExist / Gt / Lt
      containers:
      - name: xiuxian
        image: harbor:443/dawn/apps:v1
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/10-scheduler-nodeAffinity.yaml
daemonset.apps/scheduler-nodeaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide | grep scheduler-nodeaffinity
scheduler-nodeaffinity-2bfq9   1/1   Running   0   5s   10.100.0.19    master
scheduler-nodeaffinity-bzdgk   1/1   Running   0   5s   10.100.2.227   worker02
```

**結論：** nodeSelector と完全に一致した結果 —— 単一値の `In` 演算子は nodeSelector のイコール一致と等価です。nodeAffinity の利点は豊富な演算子（NotIn/Exists/Gt/Lt）および軟制限のサポートにあります。

### 5.2 複数値 In マッチ（同一 key に対する複数 value）

まず worker02 のラベルを `dawn` から `dark` に変更：

```bash
[root@master ~]# kubectl label nodes worker02 school=dark --overwrite
node/worker02 labeled

# 当前标签分布
master:   school=dawn
worker01: 无 school 标签
worker02: school=dark
```

Deployment の作成（replicas: 5, In ["dawn", "dark"]）：

```yaml
# /dawn/manifests/scheduler/11-scheduler-deploy-nodeAffinity.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduler-deploy-nodeaffinity
spec:
  replicas: 5
  selector:
    matchLabels:
      apps: xiuxian
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: school
                values:
                - "dawn"
                - "dark"
                operator: In
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/11-scheduler-deploy-nodeAffinity.yaml
deployment.apps/scheduler-deploy-nodeaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep deploy-nodeaffinity
scheduler-deploy-nodeaffinity-5f98fb44b5-cmwd2   1/1   Running   8s    10.100.2.228   worker02
scheduler-deploy-nodeaffinity-5f98fb44b5-pf72t   1/1   Running   8s    10.100.2.230   worker02
scheduler-deploy-nodeaffinity-5f98fb44b5-t5nps   1/1   Running   8s    10.100.0.21    master
scheduler-deploy-nodeaffinity-5f98fb44b5-vpnxx   1/1   Running   8s    10.100.0.20    master
scheduler-deploy-nodeaffinity-5f98fb44b5-wkct5   1/1   Running   8s    10.100.2.229   worker02
```

**結論：** 5 つの Pod がラベル値に応じて分散 —— master に 2 つ（dawn）＋ worker02 に 3 つ（dark）。複数値 In は「OR」論理として機能します。

---

## 六、nodeAffinity 軟制限 —— preferredDuringSchedulingIgnoredDuringExecution

### 6.1 硬制限 vs 軟制限

| 硬制限 (required) | 軟制限 (preferred) |
| --- | --- |
| 条件不一致 → Pod は永続的に Pending | 条件不一致 → 他のノードへ自動フォールバック |
| nodeSelector も硬制限に属する | nodeAffinity のみサポート |
| 必須要件（GPU、データ局所性など）に最適 | 「推奨するが強制ではない」要件に最適 |

### 6.2 ラベル不一致時のフォールバック動作

まず `school` ラベルをすべて消去：

```bash
[root@master ~]# kubectl label nodes --all school-
node/master unlabeled
node/worker01 not labeled
node/worker02 unlabeled
```

preferred を設定した Deployment を作成（replicas: 4, weight 10 ＋ 40）：

```yaml
# /dawn/manifests/scheduler/12-scheduler-deploy-preferred-nodeAffinity.yaml
spec:
  replicas: 4
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - preference:
              matchExpressions:
              - key: school
                values: ["dawn"]
                operator: In
            weight: 10
          - preference:
              matchExpressions:
              - key: school
                values: ["dark"]
                operator: In
            weight: 40
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
        resources:
          requests: {cpu: 0.5, memory: 200Mi}
          limits: {cpu: 4, memory: 8Gi}
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/12-scheduler-deploy-preferred-nodeAffinity.yaml
deployment.apps/scheduler-deploy-nodeaffinity-preferred created

# 无标签 → 自动 fallback 到全部节点
[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep preferred
scheduler-deploy-nodeaffinity-preferred-...-bwht9   1/1   Running   6s   10.100.1.103   worker01
scheduler-deploy-nodeaffinity-preferred-...-nqfkv   1/1   Running   6s   10.100.0.22    master
scheduler-deploy-nodeaffinity-preferred-...-tm9sp   1/1   Running   6s   10.100.2.231   worker02
scheduler-deploy-nodeaffinity-preferred-...-vt7nf   1/1   Running   6s   10.100.1.102   worker01
```

4 つの Pod が全 3 ノードに分散 —— 軟制限条件に合致しない場合、利用可能な任意ノードへ自動フォールバックします。

### 6.3 ラベル設定後の重み付け分散検証

```bash
[root@master ~]# kubectl label nodes worker01 school=dawn
[root@master ~]# kubectl label nodes master school=yitiantian
[root@master ~]# kubectl label nodes worker02 school=dark

[root@master ~]# kubectl scale deploy scheduler-deploy-nodeaffinity-preferred --replicas=8
deployment.apps/scheduler-deploy-nodeaffinity-preferred scaled

# 结果分布
# worker02: 3 Pods  → weight=40 (dark)
# worker01: 3 Pods  → weight=10 (dawn)
# master:   2 Pods  → yitiantian 不在偏好列表，但 fallback 仍可调度
```

**結論：** weight=40 の `dark` が最も多くの Pod を引き寄せます。`yitiantian` はいずれの優先リストにも含まれていませんが、フォールバックにより Pod が配置されます。本番環境のユースケース：同一 AZ 優先配置、異 AZ フォールバック。

---

## 七、podAffinity —— Pod 親和性（同一トポロジーへの近接配置）

### 7.1 動作原理

`podAffinity` はノードではなく Pod 同士の関係性を定義します。`topologyKey` でトポロジー範囲を指定：`kubernetes.io/hostname` = ノード単位、`topology.kubernetes.io/zone` = AZ 単位、カスタムラベル（`dc` など）も使用可能。

### 7.2 dc ラベルの付与

```bash
[root@master ~]# kubectl label nodes master dc=jiuxianqiao
[root@master ~]# kubectl label nodes worker01 dc=lugu
[root@master ~]# kubectl label nodes worker02 dc=zhaowei

[root@master ~]# kubectl get nodes -l dc --show-labels --no-headers | awk '{print $1, $5}'
master dc=jiuxianqiao
worker01 dc=lugu
worker02 dc=zhaowei
```

### 7.3 podAffinity Deployment の作成

```yaml
# /dawn/manifests/scheduler/13-scheduler-podAffinity.yaml
spec:
  replicas: 5
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - topologyKey: dc
            labelSelector:
              matchLabels:
                apps: xiuxian          # Pod 必须与 apps=xiuxian 的"老朋友"在同 dc
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
        resources:
          requests: {cpu: 0.5, memory: 200Mi}
          limits: {cpu: 4, memory: 8Gi}
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/13-scheduler-podAffinity.yaml
deployment.apps/scheduler-podaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep scheduler-podaffinity
scheduler-podaffinity-677cf58498-ng47c   1/1   Running   2m   10.100.1.109   worker01(lugu)
scheduler-podaffinity-677cf58498-pg2s2   1/1   Running   2m   10.100.2.234   worker02(zhaowei)
scheduler-podaffinity-677cf58498-svks4   1/1   Running   2m   10.100.2.235   worker02(zhaowei)
```

---

## 八、podAntiAffinity —— Pod 反親和性（トポロジー分散による耐障害性向上）

### 8.1 動作原理

`podAntiAffinity` は `podAffinity` の逆で、指定ラベルを持つ Pod と同一トポロジー内に同居することを拒否します。代表的なユースケース：高可用構成 —— 同一アプリケーションのレプリカを単一マシン、ラック、可用区に集中させない。

### 8.2 反親和 Deployment の作成

```yaml
# /dawn/manifests/scheduler/14-scheduler-podAntiAffinity.yaml
spec:
  replicas: 5
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - topologyKey: dc
            labelSelector:
              matchExpressions:
              - key: apps
                values: ["xiuxian"]
                operator: In
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
        resources:
          requests: {cpu: 0.5, memory: 200Mi}
          limits: {cpu: 4, memory: 8Gi}
```

### 8.3 実行結果

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/14-scheduler-podAntiAffinity.yaml
deployment.apps/scheduler-podantiaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep scheduler-podantiaffinity
scheduler-podantiaffinity-848c88bf5-2tfvx   0/1   Pending   0   42s   <none>   <none>
scheduler-podantiaffinity-848c88bf5-dmwsm   0/1   Pending   0   42s   <none>   <none>
scheduler-podantiaffinity-848c88bf5-lh2rl   1/1   Running   0   42s   10.100.0.24   master(jiuxianqiao)
scheduler-podantiaffinity-848c88bf5-lhk5m   0/1   Pending   0   42s   <none>   <none>
scheduler-podantiaffinity-848c88bf5-rfb96   0/1   Pending   0   42s   <none>   <none>
```

詳細なスケジューリングイベント：

```bash
[root@master ~]# kubectl describe pod scheduler-podantiaffinity-848c88bf5-2tfvx | grep Events -A 5
Events:
  Warning  FailedScheduling  42s   default-scheduler
           0/3 nodes available: 2 didn't match pod anti-affinity rules, 1 Insufficient cpu.
  Warning  FailedScheduling  23s   default-scheduler
           0/3 nodes available: 3 node(s) didn't match pod anti-affinity rules.
```

**段階的な要因分析：**

1. 1 つ目の Pod は master（jiuxianqiao）に配置 —— この dc にはまだ `xiuxian` Pod が存在しないため成功。
2. 既存の `ds-xiuxian` が worker01（lugu）と worker02（zhaowei）に配置済み → 反親和ルールによりこの 2 つの dc が除外。
3. 2 つ目以降の Pod にとって 3 つの dc すべてに `xiuxian` が存在 → `3 node(s) didn't match pod anti-affinity rules` → すべて Pending。

**結論：** `podAntiAffinity.requiredDuringScheduling...` は各 `dc` トポロジー内に `apps=xiuxian` Pod が最大 1 つしか存在しないことを強制します。既存の `ds-xiuxian` により、5 つのレプリカは 1 つの Running ＋ 4 つの Pending に制限されます。

---

## 九、スケジューリング戦略選定マトリクス

| ユースケース | 推奨戦略 | 主要設定パラメータ |
| --- | --- | --- |
| 特定ラベルのノードへ必須配置 | nodeSelector | `nodeSelector: {gpu: "nvidia"}` |
| 複数条件でのノード選定・除外 | nodeAffinity required | `operator: In/NotIn` |
| 優先するが必須ではない柔軟配置 | nodeAffinity preferred | `weight: 1-100` |
| 同一アプリ・関連 Pod の近接集約 | podAffinity required | `topologyKey` + `matchLabels` |
| 同一アプリ Pod の分散配置（高可用） | podAntiAffinity required | `topologyKey` + `matchExpressions` |
| ノードへの新規 Pod 配置拒絶 | Taint: NoSchedule | `kubectl taint node N key=val:NoSchedule` |
| ノードからの全 Pod 即時退避 | Taint: NoExecute | `kubectl taint node N key=val:NoExecute` |
| すべてのノード汚点を無条件容認 | Toleration: Exists | `operator: Exists` |
