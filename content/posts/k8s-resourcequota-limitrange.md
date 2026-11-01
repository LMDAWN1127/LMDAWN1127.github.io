---
title: "K8S 资源配额管理实战：ResourceQuota 与 LimitRange 约束深度解析"
date: 2026-11-01T17:00:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ResourceQuota", "LimitRange"]
showToc: true
summary: "深入剖析 Kubernetes 中 Pod resources（requests/limits）、命名空间级 ResourceQuota 与容器级 LimitRange 的三种资源约束机制，结合 stress 压测、计算资源限额与对象数量限制开展实战验证。"
---

# K8S 资源配额管理实战：ResourceQuota 与 LimitRange 约束深度解析

## 一、资源限制之 resources

### 1. 容器的期望资源和资源上限

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

Pod 成功调度到 worker01。`requests` 声明了调度时的最低保障（Schedule 检查节点是否有 200m CPU + 300Mi 内存），`limits` 是硬上限（容器无论如何不能超过 500m CPU / 500Mi 内存）

### 2. 测试命令

将 stress 作为容器入口命令运行（2 cpu + 1 io + 2 vm, timeout 10s）：

```bash
[root@master pods]# kubectl logs stress-resources --tail=5
stress: dbug: [1] <-- worker 7 signalled normally
stress: dbug: [1] <-- worker 10 signalled normally
stress: dbug: [1] <-- worker 8 signalled normally
stress: dbug: [1] <-- worker 9 signalled normally
stress: info: [1] successful run completed in 10s
```

完整日志截取：

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

10 秒内 5 个 worker 进程正常完成，跑在 limits=500m CPU / 500Mi 内存的约束下无 OOM。`requests` 声明了调度时的最低保障，`limits` 是硬上限

## 二、资源限制之 ResourceQuota

### 1. 作用

限制名称空间的计算资源、存储资源、资源数量等维度做资源限制

### 2. ResourceQuota 实现 cpu 和 memory 的计算资源限制

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

pods-nginx 的 requests 在配额内（0.5cpu < 1, 1Gi < 2Gi），创建成功；pods-alpine 单 pod 的 `requests.cpu=1.5` 就超过了命名空间总量限制 `requests.cpu=1`，直接被拒。quota 当前用量：

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

### 3. ResourceQuota 实现基于对象数量进行限制

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

一个 Deployment（3 副本）占用 1 个 `count/deployments.apps` + 3 个 `pods` 额度，均在配额内。

多个 quota 资源只要满足其中任意一个都会被限制，quota 基于名称空间的粒度进行限制，无法做到一个名称空间下针对某个 Pod 进行限制。

## 三、资源限制之 LimitRange 实现计算资源最大、最小限制

### 1. 作用

限制 Pod 容器的申请资源的最大值、最小值和默认值

### 2. 案例

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

两个 Pod 分别因为低于最小值（cpu 100m < 200m）和超过最大值（memory 5Gi > 4Gi）被拒绝。LimitRange 精确到**单个容器**级别，比 ResourceQuota（命名空间总量）颗粒度更细

## 四、资源限制之 LimitRange 实现计算资源默认值

### 1. 编写资源清单

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

与LimitRange对比：多了 Default Request 和 Default Limit 两列。此时在 kube-public 下创建不带 resources 的 Pod，会自动注入这三个默认值：cpu request=200m、cpu limit=1、memory request=500Mi、memory limit=2Gi

## 五、限制资源的三种方式

| 方式                    | 粒度         | 适用场景                              |
| ----------------------- | ------------ | ------------------------------------- |
| Pod 内 `resources` 字段 | 单个容器     | 开发者自行申明资源需求                |
| ResourceQuota           | 命名空间总量 | 平台管理员限制团队总资源              |
| LimitRange              | 单个容器     | 强制每个容器不超最大/最小值，设默认值 |
