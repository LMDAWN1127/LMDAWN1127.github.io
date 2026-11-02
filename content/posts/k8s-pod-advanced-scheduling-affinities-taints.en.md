---
title: "K8S Pod Scheduling in Action: Direct Scheduling, Node/Pod Affinities, and Taints & Tolerations Demystified"
date: 2026-11-02T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Scheduler", "NodeAffinity", "PodAffinity", "Taints", "Tolerations", "Pod"]
showToc: true
summary: "An in-depth guide to Kubernetes Pod scheduling strategies and underlying mechanics: covering nodeName scheduler bypass and network port collision troubleshooting, comprehensive testing of Taints (NoSchedule/PreferNoSchedule/NoExecute) with exact and wildcard tolerations, NodeAffinity hard/soft constraints with weight fallback, and hands-on PodAffinity co-location alongside PodAntiAffinity cross-topology mutual exclusion."
---

# K8S Pod Scheduling in Action: Direct Scheduling, Node/Pod Affinities, and Taints & Tolerations Demystified

---

## 1. Pod Scheduling

### 1.1 nodeName — Bypassing the Scheduler

```yaml
# 直接指定节点，调度器完全不参与
spec:
  nodeName: worker01
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

**Risk:** Bypasses all protections of the scheduler (resource checks, Pod quotas, taint tolerations). Combining replica controllers with `nodeName` is particularly prone to triggering Pod storms (see below).

### 1.2 hostNetwork

```yaml
spec:
  hostNetwork: true           # Pod使用宿主机网络栈，IP=节点IP
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

Actual outcome with 5 replicas on a 2C/3G cluster:

```bash
[root@master ~]# kubectl get pods -l apps=xiuxian | grep scheduler-hostnetwork
scheduler-hostnetwork-599fc8dd56-qkphn   1/1   Running            0   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-2vjsj   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-kptnl   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-hvpqf   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-xtm6n   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
```

1 Running + 4 CrashLoopBackOff — nginx error: `bind() to [::]:80 failed (98: Address in use)`. On the same node, port 80 under `hostNetwork` can only be bound by a single Pod.

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

5 replicas: 2 Running (each occupying hostPort 8080 on a separate node) + 3 Pending (port conflict on the same node or scheduled to a node without available ports).

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

5 replicas each requesting 0.5 CPU. On worker01 (2C, carrying ~80% CPU requests), scheduling reaches its limit after 3-4 Pods. `limits` do not participate in scheduling calculations.

---

## 2. Taints

Taints are applied to nodes using the syntax: `key[=value]:effect`.

### 2.1 Three Types of Effects

| Effect | New Pod Scheduling | Existing Pods | Removal Command |
| --- | --- | --- | --- |
| **NoSchedule** | Prohibited | Not affected | `kubectl taint node N key-` |
| **PreferNoSchedule** | Avoid if possible | Not affected | `kubectl taint node N key=val:PreferNoSchedule-` |
| **NoExecute** | Prohibited | Evicted immediately | `kubectl taint node N key=val:NoExecute-` |

### 2.2 Inspecting Current Taints

```bash
[root@master ~]# kubectl describe nodes | grep Taints
Taints:             node-role.kubernetes.io/master:NoSchedule
Taints:             <none>
Taints:             <none>
```

master comes with `NoSchedule` by default (this is why ordinary Pods are not scheduled onto master).

### 2.3 Applying NoSchedule Taint

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

Testing new Pods (Deployment scheduler-taints, replicas: 5):

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

All scheduled onto worker01 — worker02 rejects new Pods due to NoSchedule.

### 2.4 Deleting Taints

```bash
[root@master ~]# kubectl taint node worker02 school-
node/worker02 untainted
```

### 2.5 Modifying Taints

```bash
[root@master ~]# kubectl taint node worker02 school=dawn:NoSchedule
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule --overwrite
node/worker02 modified
# 同 key + 同 effect = 同一污点，改 value 需 --overwrite
```

### 2.6 A Single Node Can Have Multiple Taints

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

As long as effects differ, identical keys and values represent different taints.

When effects are identical, differing values represent the same taint, and modifications require `--overwrite`.

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

### 2.7 Testing PreferNoSchedule

Cleaning up taints, leaving only PreferNoSchedule:

```bash
[root@master ~]# kubectl taint node worker02 class-                    # 删除所有 class 污点
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule-  # 精确删除
[root@master ~]# kubectl describe nodes | grep Taints -A 2
# worker02 只剩 school=dark:PreferNoSchedule
```

Creating large-replica Deployment (replicas: 8, resource requests 0.5cpu/200Mi):

```bash
[root@master ~]# kubectl apply -f 06-scheduler-PreferNoSchedule.yaml
deployment.apps/scheduler-taints-prefernoschedule created

# 8 个 Pod：worker01(4) + master(2) + worker02(2)
# worker02 仍有 Pod —— PreferNoSchedule 是软污点，资源紧时仍可调度
```

### 2.8 Testing NoExecute

First clear taints, then deploy 5 replicas:

```bash
[root@master ~]# kubectl describe nodes | grep Taints
# all <none> (除 master)

[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml
deployment.apps/scheduler-taints-noschedule-noexecute created

# 5 Pod: 3 on worker01 + 2 on worker02
```

Applying NoExecute:

```bash
[root@master ~]# kubectl taint node worker01 school=dawn:NoExecute
node/worker01 tainted

# worker01 上 3 个 Pod 立即被驱逐，全部重调度到 worker02
[root@master ~]# kubectl get pods -o wide | grep noschedule-noexecute
# 全部 5 个 Pod 现在都在 worker02
```

Scaling to 10 replicas — all on worker02 (new Pods cannot land on worker01):

```bash
[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml  # replicas: 10
deployment.apps/scheduler-taints-noschedule-noexecute configured
# 10/10 Pod 全部在 worker02
```

NoExecute is aggressive: it not only rejects new Pods, but immediately evicts existing Pods. Unless strictly necessary, prefer using NoSchedule.

---

## 3. Tolerations

### 3.1 Exact Toleration

Environment: master(NoSchedule), worker01(school=dawn:NoExecute), worker02(class=dawn:NoSchedule + school=yitiantain:PreferNoSchedule)

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

5 Pods distributed across master + worker01 + worker02 — each node taint has a corresponding toleration entry.

### 3.2 operator: Exists — Ignoring All Taints

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

5 Pods freely span all three nodes — regardless of what taints exist on the nodes, they are universally tolerated.

---

## 4. nodeSelector — Static Scheduling Based on Node Labels

### 4.1 Labeling Nodes

Assign `school=dawn` to all nodes, then remove the label from worker01, simulating "scheduling only to labeled nodes":

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

Current taint environment (master has NoSchedule; Pods must tolerate it to be scheduled there):

```bash
[root@master ~]# kubectl describe nodes | grep Taints -A 1
Taints:             node-role.kubernetes.io/master:NoSchedule    # master
Taints:             <none>                                       # worker01
Taints:             <none>                                       # worker02
```

### 4.2 Deploying nodeSelector DaemonSet

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

**Conclusion:** Exactly one Pod each on master and worker02 (carrying the `school=dawn` label), and zero Pods on worker01 (label removed). The DaemonSet's tolerations allow Pods onto the master node.

---

## 5. nodeAffinity Hard Constraints — requiredDuringSchedulingIgnoredDuringExecution

### 5.1 Single-Value In Matching (Equivalent to nodeSelector)

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

**Conclusion:** Results match nodeSelector exactly — the `In` operator with a single value equates to nodeSelector's equality check. The advantage of nodeAffinity lies in its richer operators (NotIn/Exists/Gt/Lt) and soft constraints.

### 5.2 Multi-Value In Matching (Same Key with Multiple Values)

First change worker02's label from `dawn` to `dark`:

```bash
[root@master ~]# kubectl label nodes worker02 school=dark --overwrite
node/worker02 labeled

# 当前标签分布
master:   school=dawn
worker01: 无 school 标签
worker02: school=dark
```

Creating Deployment (replicas: 5, In ["dawn", "dark"]):

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

**Conclusion:** 5 Pods distributed across matching label values — 2 on master (dawn) + 3 on worker02 (dark). Multi-value In delivers "OR" semantics.

---

## 6. nodeAffinity Soft Constraints — preferredDuringSchedulingIgnoredDuringExecution

### 6.1 Hard vs Soft Constraints

| Hard Constraints (required) | Soft Constraints (preferred) |
| --- | --- |
| Condition unmet → Pod stays Pending indefinitely | Condition unmet → Fallback to other available nodes |
| nodeSelector is also a hard constraint | Supported only by nodeAffinity |
| Suitable for mandatory requirements (GPU, data locality) | Suitable for "preferred but not required" |

### 6.2 Fallback when Labels Do Not Match

First, clear the `school` label:

```bash
[root@master ~]# kubectl label nodes --all school-
node/master unlabeled
node/worker01 not labeled
node/worker02 unlabeled
```

Creating Deployment with preferred constraints (replicas: 4, weights 10 + 40):

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

4 Pods distributed across all three nodes — when soft constraint conditions fail to match, Pods automatically fall back to any available node.

### 6.3 Verifying Weight Distribution After Labeling

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

**Conclusion:** `dark` with weight=40 attracts the most Pods; while `yitiantian` is not in any preference list, it still accommodates Pods via soft-constraint fallback. Production use case: prefer same-AZ deployment, fall back across AZs.

---

## 7. podAffinity — Pod Affinity (Co-location Deployment)

### 7.1 Principles

`podAffinity` focuses on Pod-to-Pod relationships rather than Pod-to-Node. `topologyKey` defines the topology domain: `kubernetes.io/hostname` = node-level, `topology.kubernetes.io/zone` = AZ-level, or custom labels like `dc`.

### 7.2 Labeling Nodes with dc

```bash
[root@master ~]# kubectl label nodes master dc=jiuxianqiao
[root@master ~]# kubectl label nodes worker01 dc=lugu
[root@master ~]# kubectl label nodes worker02 dc=zhaowei

[root@master ~]# kubectl get nodes -l dc --show-labels --no-headers | awk '{print $1, $5}'
master dc=jiuxianqiao
worker01 dc=lugu
worker02 dc=zhaowei
```

### 7.3 Creating podAffinity Deployment

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

## 8. podAntiAffinity — Pod Anti-Affinity (Cross-Topology Distribution)

### 8.1 Principles

`podAntiAffinity` is the inverse of `podAffinity`: avoid co-locating with Pods bearing specific labels in the same topology domain. Classic scenario: high availability — avoid stacking all replicas on one machine, rack, or availability zone.

### 8.2 Creating Anti-Affinity Deployment

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

### 8.3 Execution Results

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

Detailed scheduling events:

```bash
[root@master ~]# kubectl describe pod scheduler-podantiaffinity-848c88bf5-2tfvx | grep Events -A 5
Events:
  Warning  FailedScheduling  42s   default-scheduler
           0/3 nodes available: 2 didn't match pod anti-affinity rules, 1 Insufficient cpu.
  Warning  FailedScheduling  23s   default-scheduler
           0/3 nodes available: 3 node(s) didn't match pod anti-affinity rules.
```

**Step-by-step analysis:**

1. The 1st Pod lands on master (jiuxianqiao) — this dc has no `xiuxian` Pod yet.
2. `ds-xiuxian` already occupies worker01 (lugu) and worker02 (zhaowei) → anti-affinity excludes these two dcs immediately.
3. The 2nd Pod finds all three dcs occupied by `xiuxian` Pods → `3 node(s) didn't match pod anti-affinity rules` → all remaining Pods stay Pending.

**Conclusion:** `podAntiAffinity.requiredDuringScheduling...` ensures each `dc` topology domain hosts at most one `apps=xiuxian` Pod. Across 5 replicas, existing `ds-xiuxian` Pods restrict placement to 1 Running + 4 Pending.

---

## 9. Scheduling Strategy Selection Matrix

| Scenario | Strategy | Key Parameters |
| --- | --- | --- |
| Must schedule to specific labeled node | nodeSelector | `nodeSelector: {gpu: "nvidia"}` |
| Multi-condition selection or node exclusion | nodeAffinity required | `operator: In/NotIn` |
| Preferred but not mandatory | nodeAffinity preferred | `weight: 1-100` |
| Co-locate Pods of related apps | podAffinity required | `topologyKey` + `matchLabels` |
| Disperse Pods of same app (HA) | podAntiAffinity required | `topologyKey` + `matchExpressions` |
| Reject new Pods on node | Taint: NoSchedule | `kubectl taint node N key=val:NoSchedule` |
| Evict all Pods from node | Taint: NoExecute | `kubectl taint node N key=val:NoExecute` |
| Universal bypass of all taints | Toleration: Exists | `operator: Exists` |
