---
title: "K8S リソースクォータ管理実践：ResourceQuota と LimitRange の制約を徹底解説"
date: 2026-11-01T17:00:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ResourceQuota", "LimitRange"]
showToc: true
summary: "Kubernetes における Pod の resources（requests/limits）、名前空間レベルの ResourceQuota、およびコンテナレベルの LimitRange という3つのリソース制約メカニズムを解説し、stress 負荷テスト、計算リソース制限、オブジェクト数制限による実践検証を行います。"
---

# K8S リソースクォータ管理実践：ResourceQuota と LimitRange の制約を徹底解説

## 一、リソース制限：resources

### 1. コンテナの期待リソースとリソース上限

```bash
[root@master pods]# cat 18-pods-resources.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: stress-resources
spec:
  containers:
  - image: harbor:443/dawn/stress:1.0.4
    name: stress
    stdin: true
    imagePullPolicy: IfNotPresent
    # 配置容器的资源限制
    resources:
      # 定义容器运行节点时期望的资源，如果节点不满足期望，则Pod无法完成调度
      # 当调度到成功后，并不会立即使用期望的资源，但若真使用资源时，可以超过期望资源
      requests:
        # 单位换算: 1core = 1000m
        cpu: 200m
        # 内存限制为4Gi，若节点不满足期望资源则不会调度到该节点
        #memory: 4Gi
        memory: 300Mi
      # 配置资源的使用上限，若不配置，则默认使用worker节点的所有资源
      limits:
        cpu: 0.5  # 等效于500m
        memory: 500Mi
```

```bash
[root@master pods]# kubectl apply -f 18-pods-resources.yaml
pod/stress-resources created
[root@master pods]# kubectl describe pod stress-resources | grep -A8 'Limits\|Requests'
    Limits:
      cpu:     500m
      memory:  500Mi
    Requests:
      cpu:        200m
      memory:     300Mi
```

Pod は正常に worker01 にスケジュールされました。`requests` はスケジューリング時の最低保証を宣言し（Scheduler はノードに 200m CPU + 300Mi メモリが存在するか確認）、`limits` はハード上限となります（コンテナはいかなる場合でも 500m CPU / 500Mi メモリを超過できません）。

### 2. テストコマンド

stress をコンテナのエントリポイントコマンドとして実行します（2 cpu + 1 io + 2 vm, timeout 10s）：

```bash
[root@master pods]# kubectl logs stress-resources --tail=5
stress: dbug: [1] <-- worker 7 signalled normally
stress: dbug: [1] <-- worker 10 signalled normally
stress: dbug: [1] <-- worker 8 signalled normally
stress: dbug: [1] <-- worker 9 signalled normally
stress: info: [1] successful run completed in 10s
```

完全なログ抜粋：

```
stress: info: [1] dispatching hogs: 2 cpu, 1 io, 2 vm, 0 hdd
stress: dbug: [1] using backoff sleep of 15000us
stress: dbug: [1] setting timeout to 10s
stress: dbug: [1] --> hogcpu worker 2 [7] forked
stress: dbug: [1] --> hogio worker 1 [8] forked
stress: dbug: [1] --> hogvm worker 2 [9] forked
stress: dbug: [1] --> hogcpu worker 1 [10] forked
stress: dbug: [1] --> hogvm worker 1 [11] forked
stress: dbug: [11] allocating 67108864 bytes ...
stress: dbug: [11] touching bytes in strides of 4096 bytes ...
...
stress: dbug: [1] <-- worker 7 signalled normally
stress: info: [1] successful run completed in 10s
```

10秒以内に5つの worker プロセスが正常に完了し、limits=500m CPU / 500Mi メモリの制約下で OOM が発生することなく実行されました。`requests` はスケジューリング時の最低保証を宣言し、`limits` はハード上限となります。

## 二、リソース制限：ResourceQuota

### 1. 役割

名前空間の計算リソース、ストレージリソース、リソース数などの次元でリソースを制限します。

### 2. ResourceQuota による CPU とメモリの計算リソース制限

```bash
[root@master 01-compute-resources]# cat 01-compute-resources.yaml
```

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-resources
  namespace: kube-public
spec:
  hard:
    requests.cpu: "1"
    limits.cpu: "2"
    requests.memory: 2Gi
    limits.memory: 3Gi
```

```bash
[root@master 01-compute-resources]# cat 02-pods.yaml
apiVersion: v1
kind: Pod
metadata:
  name: pods-nginx
  namespace: kube-public
spec:
  containers:
  - name: web
    image: harbor:443/dawn/apps:v1
    resources:
      requests:
        cpu: 0.5
        memory: 1Gi
      limits:
        cpu: 1
        memory: 2Gi
[root@master 01-compute-resources]# cat 03-pods.yaml
apiVersion: v1
kind: Pod
metadata:
  name: pods-alpine
  namespace: kube-public
spec:
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
    resources:
      requests:
        cpu: 1.5
        memory: 2Gi
      limits:
        cpu: 2
        memory: 4Gi
```

```bash
[root@master 01-compute-resources]# kubectl apply -f 01-compute-resources.yaml
resourcequota/compute-resources created
[root@master 01-compute-resources]# kubectl apply -f 02-pods.yaml
pod/pods-nginx created            # requests 0.5cpu+1Gi没超quota
[root@master 01-compute-resources]# kubectl apply -f 03-pods.yaml
Error from server (Forbidden): error when creating "03-pods.yaml":
pods "pods-alpine" is forbidden: exceeded quota: compute-resources,
  requested: limits.cpu=2,limits.memory=4Gi,requests.cpu=1500m,requests.memory=2Gi,
  used: limits.cpu=1,limits.memory=2Gi,requests.cpu=500m,requests.memory=1Gi,
  limited: limits.cpu=2,limits.memory=3Gi,requests.cpu=1,requests.memory=2Gi
```

pods-nginx の requests はクォータ内に収まっており（0.5cpu < 1, 1Gi < 2Gi）、作成に成功しました。一方、pods-alpine は単一 Pod の `requests.cpu=1.5` だけで名前空間全体の制限 `requests.cpu=1` を超過したため、直ちに拒絶されました。クォータの現在の使用状況：

```bash
[root@master 01-compute-resources]# kubectl describe quota compute-resources -n kube-public
Name:            compute-resources
Namespace:       kube-public
Resource         Used  Hard
--------         ----  ----
limits.cpu       1     2
limits.memory    2Gi   3Gi
requests.cpu     500m  1
requests.memory  1Gi   2Gi
```

### 3. ResourceQuota によるオブジェクト数に基づく制限

```bash
[root@master 02-object-counts]# cat 01-object-counts.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: object-counts
  namespace: kube-public
spec:
 hard:
   pods: "10"
   count/deployments.apps: "3"
   count/services: "3"
[root@master 02-object-counts]# cat 02-deploy-xiuxian.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian
  namespace: kube-public
spec:
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
         image: harbor:443/dawn/apps:v2
```

```bash
[root@master 02-object-counts]# kubectl apply -f 01-object-counts.yaml
resourcequota/object-counts created
[root@master 02-object-counts]# kubectl apply -f 02-deploy-xiuxian.yaml
deployment.apps/deloy-xiuxian created
[root@master 02-object-counts]# kubectl describe quota object-counts -n kube-public
Name:                   object-counts
Namespace:              kube-public
Resource                Used  Hard
--------                ----  ----
count/deployments.apps  1     3
count/services          0     3
pods                    3     10
```

1つの Deployment（3レプリカ）が 1 つの `count/deployments.apps` と 3 つの `pods` の枠を消費し、いずれもクォータ内に収まっています。

複数のクォータリソースが存在する場合、そのいずれか1つでも満たすと制限されます。クォータは名前空間の粒度で制限されるため、名前空間内の特定の Pod だけを対象にして制限することはできません。

## 三、リソース制限：LimitRange による計算リソースの最大・最小制限

### 1. 役割

Pod コンテナが申請するリソースの最大値、最小値、およびデフォルト値を制限します。

### 2. 実例

```bash
[root@master 01-max-min]# cat 01-cpu-memory-min-max.yaml
```

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: cpu-memory-min-max
  namespace: kube-public
spec:
  limits:
  - max:
      cpu: 2
      memory: 4Gi
    min:
      cpu: 200m
      memory: 100Mi
    type: Container
```

```bash
[root@master 01-max-min]# cat 02-pods.yaml (requests.cpu=0.1 < min 200m → 被拒)
apiVersion: v1
kind: Pod
metadata:
  name: pods-nginx
  namespace: kube-public
spec:
  containers:
  - name: web
    image: harbor:443/dawn/apps:v1
    resources:
      requests:
        cpu: 0.1       # 100m < 200m 最小值
        memory: 1Gi
      limits:
        cpu: 1
        memory: 2Gi
[root@master 01-max-min]# cat 03-pods.yaml (memory.limit=5Gi > max 4Gi → 被拒)
apiVersion: v1
kind: Pod
metadata:
  name: pods-nginx-02
  namespace: kube-public
spec:
  containers:
  - name: web
    image: harbor:443/dawn/apps:v1
    resources:
      requests:
        cpu: 0.5
        memory: 1Gi
      limits:
        cpu: 1
        memory: 5Gi      # 5Gi > 4Gi 最大值
```

```bash
[root@master 01-max-min]# kubectl apply -f 01-cpu-memory-min-max.yaml
limitrange/cpu-memory-min-max created
[root@master 01-max-min]# kubectl apply -f 02-pods.yaml
Error from server (Forbidden): pods "pods-nginx" is forbidden:
  minimum cpu usage per Container is 200m, but request is 100m
[root@master 01-max-min]# kubectl apply -f 03-pods.yaml
Error from server (Forbidden): pods "pods-nginx-02" is forbidden:
  maximum memory usage per Container is 4Gi, but limit is 5Gi
[root@master 01-max-min]# kubectl describe limits cpu-memory-min-max -n kube-public
Name:       cpu-memory-min-max
Namespace:  kube-public
Type        Resource  Min    Max  Default Request  Default Limit  Max Limit/Request Ratio
----        --------  ---    ---  ---------------  -------------  -----------------------
Container   memory    100Mi  4Gi  4Gi              4Gi            -
Container   cpu       200m   2    2                2              -
```

2つの Pod はそれぞれ最小値未満（cpu 100m < 200m）および最大値超過（memory 5Gi > 4Gi）のために拒絶されました。LimitRange は**単一コンテナ**レベルに正確に対応し、ResourceQuota（名前空間の総量）よりも細かい粒度で管理します。

## 四、リソース制限：LimitRange による計算リソースのデフォルト値

### 1. リソースマニフェストの作成

```bash
[root@master 02-cpu-memory-default]# cat 01-cpu-memory-default.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: cpu-memory-min-max-default
  namespace: kube-public
spec:
  limits:
  - max:
      cpu: 2
      memory: 4Gi
    min:
      cpu: 200m
      memory: 100Mi
    type: Container
    # 设置默认值的Request
    defaultRequest:
      cpu: 200m
      memory: 500Mi
    # 设置默认值的Limit
    default:
      cpu: 1
      memory: 2Gi
```

```bash
[root@master 02-cpu-memory-default]# kubectl apply -f 01-cpu-memory-default.yaml
limitrange/cpu-memory-min-max-default created
[root@master 02-cpu-memory-default]# kubectl describe limits cpu-memory-min-max-default -n kube-public
Name:       cpu-memory-min-max-default
Namespace:  kube-public
Type        Resource  Min    Max  Default Request  Default Limit  Max Limit/Request Ratio
----        --------  ---    ---  ---------------  -------------  -----------------------
Container   cpu       200m   2    200m             1              -
Container   memory    100Mi  4Gi  500Mi            2Gi            -
```

LimitRange との比較：Default Request と Default Limit の2列が追加されています。この状態で kube-public 内で resources を指定しない Pod を作成すると、これら3つのデフォルト値（cpu request=200m、cpu limit=1、memory request=500Mi、memory limit=2Gi）が自動的に注入されます。

## 五、リソースを制限する3つの方法

| 方式 | 粒度 | 適用シナリオ |
| --- | --- | --- |
| Pod 内の `resources` フィールド | 単一コンテナ | 開発者が自らリソース要求を宣言する |
| ResourceQuota | 名前空間の総量 | プラットフォーム管理者がチーム全体の総リソースを制限する |
| LimitRange | 単一コンテナ | 各コンテナが最大/最小値を超えないよう強制し、デフォルト値を設定する |
