---
title: "K8S Resource Quota Management Practice: Deep Dive into ResourceQuota and LimitRange Constraints"
date: 2026-11-01T17:00:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ResourceQuota", "LimitRange"]
showToc: true
summary: "A deep dive into Kubernetes resource constraint mechanisms including Pod resources (requests/limits), namespace-level ResourceQuota, and container-level LimitRange, with hands-on validation using stress testing, compute quotas, and object count limits."
---

# K8S Resource Quota Management Practice: Deep Dive into ResourceQuota and LimitRange Constraints

## 1. Resource Constraints: resources

### 1. Desired Resources and Resource Limits of Containers

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

Pod successfully scheduled to worker01. `requests` declares the minimum guarantee during scheduling (Scheduler checks whether the node has 200m CPU + 300Mi memory), while `limits` is a hard ceiling (containers cannot exceed 500m CPU / 500Mi memory under any circumstances).

### 2. Test Command

Run stress as the container entrypoint command (2 cpu + 1 io + 2 vm, timeout 10s):

```bash
[root@master pods]# kubectl logs stress-resources --tail=5
stress: dbug: [1] <-- worker 7 signalled normally
stress: dbug: [1] <-- worker 10 signalled normally
stress: dbug: [1] <-- worker 8 signalled normally
stress: dbug: [1] <-- worker 9 signalled normally
stress: info: [1] successful run completed in 10s
```

Full log excerpt:

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

All 5 worker processes completed normally within 10 seconds, running under the constraint of limits=500m CPU / 500Mi memory without OOM. `requests` declares the minimum guarantee during scheduling, and `limits` is a hard ceiling.

## 2. Resource Constraints: ResourceQuota

### 1. Purpose

Limit namespace-level compute resources, storage resources, and resource quantities across multiple dimensions.

### 2. ResourceQuota Limiting CPU and Memory Compute Resources

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

pods-nginx's requests fall within the quota (0.5cpu < 1, 1Gi < 2Gi) and creation succeeded; pods-alpine's single pod `requests.cpu=1.5` exceeds the namespace total limit `requests.cpu=1` and was rejected directly. Current quota usage:

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

### 3. ResourceQuota Limiting Based on Object Counts

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

One Deployment (3 replicas) consumes 1 `count/deployments.apps` + 3 `pods` quota, all within limits.

When multiple quota resources exist, matching any one of them will trigger the limit. Quota operates at the namespace granularity and cannot target a specific Pod within a namespace.

## 3. Resource Constraints: LimitRange for Compute Resource Max and Min Limits

### 1. Purpose

Limit the maximum, minimum, and default resource requests for Pod containers.

### 2. Example Case

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

The two Pods were rejected respectively due to being below the minimum value (cpu 100m < 200m) and exceeding the maximum value (memory 5Gi > 4Gi). LimitRange is precise to the **individual container** level, providing finer granularity than ResourceQuota (namespace total).

## 4. Resource Constraints: LimitRange for Compute Resource Defaults

### 1. Writing the Resource Manifest

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

Comparison with LimitRange: Two additional columns, Default Request and Default Limit, are present. At this point, creating a Pod without resources under kube-public will automatically inject these three default values: cpu request=200m, cpu limit=1, memory request=500Mi, memory limit=2Gi.

## 5. Three Ways of Limiting Resources

| Method | Granularity | Applicable Scenario |
| --- | --- | --- |
| `resources` field inside Pod | Single container | Developers declare resource requirements on their own |
| ResourceQuota | Namespace total | Platform administrators restrict overall team resources |
| LimitRange | Single container | Enforce that each container does not exceed min/max values and set defaults |
