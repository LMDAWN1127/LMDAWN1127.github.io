---
title: "K8S 리소스 쿼터 관리 실전: ResourceQuota 및 LimitRange 제약 심층 분석"
date: 2026-11-01T17:00:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ResourceQuota", "LimitRange"]
showToc: true
summary: "Kubernetes에서 Pod의 resources(requests/limits), 네임스페이스 수준의 ResourceQuota 및 컨테이너 수준의 LimitRange 3가지 리소스 제약 메커니즘을 심층 분석하고, stress 부하 테스트, 컴퓨팅 리소스 제한 및 객체 수 제한 실전 검증을 다룹니다."
---

# K8S 리소스 쿼터 관리 실전: ResourceQuota 및 LimitRange 제약 심층 분석

## 一、리소스 제한: resources

### 1. 컨테이너의 기대 리소스와 리소스 상한

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

Pod가 worker01에 성공적으로 스케줄링되었습니다. `requests`는 스케줄링 시 최소 보장(Scheduler가 노드에 200m CPU + 300Mi 메모리가 있는지 확인)을 선언하며, `limits`는 하드 상한(컨테이너는 어떠한 경우에도 500m CPU / 500Mi 메모리를 초과할 수 없음)입니다.

### 2. 테스트 명령어

stress를 컨테이너 엔트리포인트 명령어로 실행(2 cpu + 1 io + 2 vm, timeout 10s):

```bash
[root@master pods]# kubectl logs stress-resources --tail=5
stress: dbug: [1] <-- worker 7 signalled normally
stress: dbug: [1] <-- worker 10 signalled normally
stress: dbug: [1] <-- worker 8 signalled normally
stress: dbug: [1] <-- worker 9 signalled normally
stress: info: [1] successful run completed in 10s
```

전체 로그 발췌:

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

10초 이내에 5개의 worker 프로세스가 정상 완료되었으며, limits=500m CPU / 500Mi 메모리 제약 하에서 OOM 없이 실행되었습니다. `requests`는 스케줄링 시 최소 보장을 선언하고, `limits`는 하드 상한입니다.

## 二、리소스 제한: ResourceQuota

### 1. 역할

네임스페이스의 컴퓨팅 리소스, 스토리지 리소스, 리소스 수량 등 다양한 차원에서 리소스를 제한합니다.

### 2. ResourceQuota를 통한 CPU 및 메모리 컴퓨팅 리소스 제한

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

pods-nginx의 requests는 쿼터 범위 내에 있어(0.5cpu < 1, 1Gi < 2Gi) 성공적으로 생성되었습니다. 반면 pods-alpine은 단일 Pod의 `requests.cpu=1.5`만으로도 네임스페이스 총량 제한인 `requests.cpu=1`을 초과하여 즉시 거부되었습니다. 쿼터의 현재 사용량:

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

### 3. ResourceQuota를 통한 객체 수량 기반 제한

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

하나의 Deployment(3 복제본)가 1개의 `count/deployments.apps` + 3개의 `pods` 할당량을 소비하며 모두 쿼터 내에 있습니다.

여러 개의 쿼터 리소스가 있는 경우 그중 어느 하나라도 충족되면 제한되며, 쿼터는 네임스페이스 단위의 세분성을 기반으로 제한하므로 네임스페이스 내 특정 Pod만을 대상으로 제한할 수는 없습니다.

## 三、리소스 제한: LimitRange를 통한 컴퓨팅 리소스 최대/최소 제한

### 1. 역할

Pod 컨테이너의 신청 리소스에 대한 최댓값, 최솟값 및 기본값을 제한합니다.

### 2. 실전 사례

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

두 Pod는 각각 최솟값 미달(cpu 100m < 200m) 및 최댓값 초과(memory 5Gi > 4Gi)로 인해 거부되었습니다. LimitRange는 **단일 컨테이너** 수준까지 정확하게 지정되므로 ResourceQuota(네임스페이스 총량)보다 세분성이 더 정밀합니다.

## 四、리소스 제한: LimitRange를 통한 컴퓨팅 리소스 기본값 구현

### 1. 리소스 매니페스트 작성

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

LimitRange와의 비교: Default Request 및 Default Limit 두 개의 열이 추가되었습니다. 이 시점에서 kube-public 네임스페이스 아래에 resources가 없는 Pod를 생성하면 다음 3개의 기본값(cpu request=200m, cpu limit=1, memory request=500Mi, memory limit=2Gi)이 자동으로 주입됩니다.

## 五、리소스를 제한하는 세 가지 방법

| 방식 | 세분성 | 적용 시나리오 |
| --- | --- | --- |
| Pod 내부 `resources` 필드 | 단일 컨테이너 | 개발자가 직접 리소스 요구 사항을 선언 |
| ResourceQuota | 네임스페이스 총량 | 플랫폼 관리자가 팀 전체 리소스를 제한 |
| LimitRange | 단일 컨테이너 | 각 컨테이너가 최대/최솟값을 초과하지 않도록 강제하고 기본값 설정 |
