---
title: "K8S Pod 调度全景实战：定向调度、节点/Pod 软硬亲和性与污点容忍（Taints & Tolerations）深度剖析"
date: 2026-11-02T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Scheduler", "NodeAffinity", "PodAffinity", "Taints", "Tolerations", "Pod"]
showToc: true
summary: "全景剖析 Kubernetes Pod 调度策略与底层运作机制：涵盖 nodeName 绕过调度器与网络端口冲突避坑、Taints（NoSchedule/PreferNoSchedule/NoExecute）与精确/全局容忍深度实测、NodeAffinity 软硬亲和性权重降级 fallback，以及基于自定义拓扑域 dc 的 PodAffinity 就近部署与 PodAntiAffinity 高可用互斥打散实操。"
---

# K8S Pod 调度全景实战：定向调度、节点/Pod 软硬亲和性与污点容忍（Taints & Tolerations）深度剖析

---

## 一、Pod 调度

### 1.1 nodeName——绕过调度器

```yaml
# 直接指定节点，调度器完全不参与
spec:
  nodeName: worker01
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

**危险：** 绕过调度器的全部保护（资源检查、Pod 上限、污点容忍），副本控制器 + nodeName 的组合尤其容易引发 Pod 风暴（见后）

### 1.2 hostNetwork

```yaml
spec:
  hostNetwork: true           # Pod使用宿主机网络栈，IP=节点IP
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

5 个 replicas 在 2C/3G 集群上的实际结果：

```bash
[root@master ~]# kubectl get pods -l apps=xiuxian | grep scheduler-hostnetwork
scheduler-hostnetwork-599fc8dd56-qkphn   1/1   Running            0   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-2vjsj   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-kptnl   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-hvpqf   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-xtm6n   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
```

1 个 Running + 4 个 CrashLoopBackOff——nginx `bind() to [::]:80 failed (98: Address in use)`。同一节点上 `hostNetwork` 的 80 端口只能被一个 Pod 占用

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

5 个 replicas：2 个 Running（各占一个节点的 hostPort 8080）+ 3 个 Pending（同节点端口冲突或调度到无可用端口的节点）

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

5 个 replicas 各请求 0.5 CPU。在 2C 的 worker01（承载 ~80% CPU requests）上，3-4 个后就达到调度上限。`limits` 不参与调度计算

---

## 二、污点（Taints）

污点作用于节点，语法：`key[=value]:effect`。

### 2.1 三种 effect

| effect               | 新 Pod 调度 | 已有 Pod | 删除命令                                         |
| -------------------- | ----------- | -------- | ------------------------------------------------ |
| **NoSchedule**       | 禁止        | 受影响   | `kubectl taint node N key-`                      |
| **PreferNoSchedule** | 尽量避开    | 不受影响 | `kubectl taint node N key=val:PreferNoSchedule-` |
| **NoExecute**        | 禁止        | 立刻驱逐 | `kubectl taint node N key=val:NoExecute-`        |

### 2.2 查看当前污点

```bash
[root@master ~]# kubectl describe nodes | grep Taints
Taints:             node-role.kubernetes.io/master:NoSchedule
Taints:             <none>
Taints:             <none>
```

master 自带 NoSchedule（这就是为什么普通 Pod 不在 master 上）

### 2.3 打污点NoSchedule

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

测试新 Pod（Deployment scheduler-taints, replicas: 5）：

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

全部落在 worker01——worker02 被 NoSchedule 拒绝调度新 Pod

### 2.4 删除污点

```bash
[root@master ~]# kubectl taint node worker02 school-
node/worker02 untainted
```

### 2.5 污点的修改

```bash
[root@master ~]# kubectl taint node worker02 school=dawn:NoSchedule
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule --overwrite
node/worker02 modified
# 同 key + 同 effect = 同一污点，改 value 需 --overwrite
```

### 2.6 一个节点可以打多个污点

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

只要 effect 不同，key 和 value 相同也属于不同的污点

只要 effect 相同，value 不同属于同一污点，修改需要 `--overwrite`

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

### 2.7 测试 PreferNoSchedule

清理污点，只留一个 PreferNoSchedule：

```bash
[root@master ~]# kubectl taint node worker02 class-                    # 删除所有 class 污点
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule-  # 精确删除
[root@master ~]# kubectl describe nodes | grep Taints -A 2
# worker02 只剩 school=dark:PreferNoSchedule
```

创建大副本 Deployment（replicas: 8, resources requests 0.5cpu/200Mi）：

```bash
[root@master ~]# kubectl apply -f 06-scheduler-PreferNoSchedule.yaml
deployment.apps/scheduler-taints-prefernoschedule created

# 8 个 Pod：worker01(4) + master(2) + worker02(2)
# worker02 仍有 Pod —— PreferNoSchedule 是软污点，资源紧时仍可调度
```

### 2.8 测试 NoExecute

先清污点，部署 5 副本：

```bash
[root@master ~]# kubectl describe nodes | grep Taints
# all <none> (除 master)

[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml
deployment.apps/scheduler-taints-noschedule-noexecute created

# 5 Pod: 3 on worker01 + 2 on worker02
```

打 NoExecute：

```bash
[root@master ~]# kubectl taint node worker01 school=dawn:NoExecute
node/worker01 tainted

# worker01 上 3 个 Pod 立即被驱逐，全部重调度到 worker02
[root@master ~]# kubectl get pods -o wide | grep noschedule-noexecute
# 全部 5 个 Pod 现在都在 worker02
```

扩到 10 副本——全部在 worker02（新 Pod 不上 worker01）：

```bash
[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml  # replicas: 10
deployment.apps/scheduler-taints-noschedule-noexecute configured
# 10/10 Pod 全部在 worker02
```

NoExecute 比较霸道，不仅拒绝新 Pod，还会立即驱逐已有 Pod。如非必要，尽量使用 NoSchedule

---

## 三、污点容忍（Tolerations）

### 3.1 精确容忍

环境：master(NoSchedule)、worker01(school=dawn:NoExecute)、worker02(class=dawn:NoSchedule + school=yitiantain:PreferNoSchedule)

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

5 个 Pod 分布在 master + worker01 + worker02——每个节点的污点都有对应的容忍条目

### 3.2 operator: Exists——无视全部污点

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

5 个 Pod 通杀三节点——无论节点上有什么污点，一概容忍

## 四、nodeSelector —— 基于节点标签的静态调度

### 4.1 打标签

给所有节点打 `school=dawn`，然后去掉 worker01 的标签，模拟"只调度到有标签的节点"：

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

当前污点环境（master 自带 NoSchedule，Pod 需要容忍才能调度上去）：

```bash
[root@master ~]# kubectl describe nodes | grep Taints -A 1
Taints:             node-role.kubernetes.io/master:NoSchedule    # master
Taints:             <none>                                       # worker01
Taints:             <none>                                       # worker02
```

### 4.2 部署 nodeSelector DaemonSet

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

**结论：** master + worker02 各一个 Pod（有 `school=dawn` 标签），worker01 无 Pod（标签已被移除）。DaemonSet 的 tolerations 让 Pod 能上 master 节点

---

## 五、nodeAffinity 硬限制 —— requiredDuringSchedulingIgnoredDuringExecution

### 5.1 等效于 nodeSelector 的单值 In 匹配

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

**结论：** 结果与 nodeSelector 完全一致——In 运算符等价于 nodeSelector 的等于匹配。nodeAffinity 的优势在于支持更多运算符（NotIn/Exists/Gt/Lt）和软限制。

### 5.2 多值 In 匹配（同一个 key 对应多个 value）

先把 worker02 标签从 `dawn` 改为 `dark`：

```bash
[root@master ~]# kubectl label nodes worker02 school=dark --overwrite
node/worker02 labeled

# 当前标签分布
master:   school=dawn
worker01: 无 school 标签
worker02: school=dark
```

创建 Deployment（replicas: 5, In ["dawn", "dark"]）：

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

**结论：** 5 个 Pod 按标签值分发——2 在 master（dawn）+ 3 在 worker02（dark），多值 In = "OR" 语义。

---

## 六、nodeAffinity 软限制 —— preferredDuringSchedulingIgnoredDuringExecution

### 6.1 硬限制 vs 软限制

| 硬限制 (required)                    | 软限制 (preferred)               |
| ------------------------------------ | -------------------------------- |
| 条件不满足 → Pod 永远 Pending        | 条件不满足 → fallback 到其他节点 |
| nodeSelector 也属于硬限制            | 只有 nodeAffinity 支持           |
| 适合必须满足的场景（GPU/数据本地性） | 适合"最好这样但不强制"           |

### 6.2 无标签时 fallback

先把 `school` 标签清空：

```bash
[root@master ~]# kubectl label nodes --all school-
node/master unlabeled
node/worker01 not labeled
node/worker02 unlabeled
```

创建带 preferred 的 Deployment（replicas: 4, weight 10 + 40）：

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

4 个 Pod 散落在三节点——软限制条件不匹配时自动 fallback 到任意可用节点。

### 6.3 打标签后验证权重分布

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

**结论：** weight=40 的 dark 吸引最多 Pod；yitiantian 虽不在任何偏好列表中，仍可调度（软限制 fallback）。生产环境中正向用例：优先同 AZ 部署，跨 AZ 做 fallback。

---

## 七、podAffinity —— Pod 亲和性（就近部署）

### 7.1 原理

podAffinity 不关心 Pod→Node，关心 Pod→Pod。`topologyKey` 定义拓扑域：`kubernetes.io/hostname` = 节点级，`topology.kubernetes.io/zone` = 可用区级，自定义标签如 `dc` 也行。

### 7.2 打 dc 标签

```bash
[root@master ~]# kubectl label nodes master dc=jiuxianqiao
[root@master ~]# kubectl label nodes worker01 dc=lugu
[root@master ~]# kubectl label nodes worker02 dc=zhaowei

[root@master ~]# kubectl get nodes -l dc --show-labels --no-headers | awk '{print $1, $5}'
master dc=jiuxianqiao
worker01 dc=lugu
worker02 dc=zhaowei
```

### 7.3 创建 podAffinity Deployment

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

## 八、podAntiAffinity —— Pod 反亲和性（跨拓扑域打散）

### 8.1 原理

podAntiAffinity 是 podAffinity 的反面：不要和含特定标签的 Pod 在同一拓扑域。经典场景：高可用部署——同一应用不要全堆在一台机器 / 一个机架 / 一个可用区。

### 8.2 创建反亲和 Deployment

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

### 8.3 执行结果

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

调度事件详解：

```bash
[root@master ~]# kubectl describe pod scheduler-podantiaffinity-848c88bf5-2tfvx | grep Events -A 5
Events:
  Warning  FailedScheduling  42s   default-scheduler
           0/3 nodes available: 2 didn't match pod anti-affinity rules, 1 Insufficient cpu.
  Warning  FailedScheduling  23s   default-scheduler
           0/3 nodes available: 3 node(s) didn't match pod anti-affinity rules.
```

**逐步分析：**

1. 第一个 Pod 入 master（jiuxianqiao）——该 dc 还没有 xiuxian Pod
2. ds-xiuxian 占了 worker01(lugu) 和 worker02(zhaowei) → 反亲和直接排除这两个 dc
3. 第二个 Pod 发现三个 dc 全有 xiuxian Pod → `3 node(s) didn't match pod anti-affinity rules` → 全部 Pending

**结论：** `podAntiAffinity.requiredDuringScheduling...` 保证每个 `dc` 拓扑域最多一个 `apps=xiuxian` Pod。5 个 replicas 被已有 ds-xiuxian 限制为 1 个 Running + 4 个 Pending。

## 九、调度策略选型

| 场景              | 策略                     | 关键参数                                  |
| ----------------- | ------------------------ | ----------------------------------------- |
| 必须去某标签节点  | nodeSelector             | `nodeSelector: {gpu: "nvidia"}`           |
| 多条件选/排除节点 | nodeAffinity required    | `operator: In/NotIn`                      |
| 优先但不强制      | nodeAffinity preferred   | `weight: 1-100`                           |
| 同应用 Pod 聚集   | podAffinity required     | `topologyKey` + `matchLabels`             |
| 同应用 Pod 打散   | podAntiAffinity required | `topologyKey` + `matchExpressions`        |
| 节点禁止新 Pod    | Taint: NoSchedule        | `kubectl taint node N key=val:NoSchedule` |
| 节点驱逐所有 Pod  | Taint: NoExecute         | `kubectl taint node N key=val:NoExecute`  |
| Pod 通杀所有污点  | Toleration: Exists       | `operator: Exists`                        |
