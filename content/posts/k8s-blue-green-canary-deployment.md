---
title: "K8S 蓝绿部署与金丝雀发布实战：三种发布方案对比"
date: 2026-10-31T20:05:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "ReplicationController", "BlueGreen", "Canary"]
showToc: true
summary: "深入对比 Kubernetes 环境下蓝绿部署、金丝雀发布与 A/B 测试三种发布方案。详细记录基于双 ReplicationController 控制器与 Service 标签选择器热切换（apps: xiuxian -> apps: green）实现零感知瞬时切流的蓝绿部署实战；以及通过多标签设计（业务标签 school: czu 与版本标签 apps: v1/v2）配合副本数阶梯调节实现渐进替换的灰度金丝雀发布测试全流程。"
---

# K8S 蓝绿部署与金丝雀发布实战：三种发布方案对比

## 一、三种发布方案对比

| 方案               | 特点                                                         | 缺点                                 |
| ------------------ | ------------------------------------------------------------ | ------------------------------------ |
| 蓝绿部署           | 同时部署两套（蓝、绿）环境，但仅有一套环境对外提供服务       | 有一套环境空跑                       |
| 灰度发布（金丝雀） | 逐步替换，不会一次性全部替换；升级部分应用进行测试，新旧版本短期共存，最终新版本全量替换旧版本 | 无法细粒度控制更新的范围             |
| A/B 测试           | 可以让部分用户访问新版本                                     | 需要单独部署组件实现（如借助 istio） |

K8S 实现三种方案的核心思路：

**蓝绿**：① 基于控制器创建 blue 版本；② svc 关联 blue 版本的 Pod；③ 基于控制器创建 green 版本；④ 修改 svc 的标签选择器为 green 版本

**金丝雀**：① 基于控制器创建旧版本应用，设 2 套标签（`apps: v1` + `type: xiuxian`），副本 3；② svc 关联公共业务标签（`type: xiuxian`）；③ 基于控制器创建新版本应用，同样 2 套标签（`apps: v2` + `type: xiuxian`），副本 1；④ 旧版本副本 3→0，新版本副本 1→3

**A/B**：需 istio 等组件按用户特征分流，本环境未部署，仅作方案对比

## 二、蓝绿部署实战

工作目录 `/dawn/manifests/01-blue-green/`，共 3 个 manifest

### 1. 部署蓝版本

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

### 2. 访问测试

```bash
[root@master 01-blue-green]# kubectl get svc xiuxian-svc
NAME          TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc   ClusterIP   10.200.250.148   <none>        80/TCP    4s
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

10 次请求全部命中 v1，蓝版本独占流量

### 3. 部署绿版本

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

此时蓝绿两套共 6 个 Pod 全部 Running，但 svc 选择器仍是 `apps: xiuxian`，流量依然只走蓝版本，再循环验证一次：

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
      8 DAWN apps v1
```

8 次请求仍全部是 v1，绿版本处于"已部署但不服务"状态——这正是蓝绿部署"一套环境空跑"缺点的直观体现，也是它可以随时安全回切的原因

### 4. 切换版本

修改 svc 的选择器，把蓝色注释掉、换成绿色：

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

`Selector` 从 `apps=xiuxian` 变为 `apps=green`；

`Endpoints` 瞬间从 3 个蓝 Pod 热替换为 3 个绿 Pod；

ClusterIP 保持 10.200.250.148 不变——对访问方零感知，无需改任何配置。

循环验证，流量已全部切换到绿版本：

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v2
```

10 次请求全部命中 v2，切换完成。若新版本有问题，只需把 svc 选择器改回 `apps: xiuxian` 再 apply 一次即可回滚——蓝 Pod 一直还在

### 5. 删除测试环境

```bash
[root@master 01-blue-green]# kubectl delete -f .
replicationcontroller "xiuxian-blue" deleted
service "xiuxian-svc" deleted
replicationcontroller "xiuxian-green" deleted
[root@master 01-blue-green]# kubectl get all
NAME                 TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/kubernetes   ClusterIP   10.200.0.1     <none>        443/TCP   22h
```

## 三、金丝雀发布实战

工作目录 `/dawn/manifests/02-huidu/`，共 3 个 manifest。核心设计是双标签：`apps: v1/v2` 区分版本，`school: czu` 是公共业务标签，svc 按 `school: czu` 选择，新旧版本的 Pod 会同时进入 Endpoints，按副本比例分流

### 1. 部署旧版本

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

### 2. 测试应用

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

10 次请求全部 v1，旧版本正常工作

### 3. 部署新版本

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

新版本 1 副本上线，`-l school` 能看到 4 个 Pod 全部挂着 `school=czu`，都在 svc 后端

### 4. 观察 Pod 访问情况

此时出现新版本和旧版本共存的现象。循环访问 8 秒：

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     20 DAWN apps v1
      6 DAWN apps v2
```

20 次 v1 + 6 次 v2，约 23% 的流量打到新版本，与副本比例 1 新 / 4 总（25%）基本吻合

### 5. 使用新版本逐渐替换旧版本

旧版本副本 3→0，新版本 1→3，分三轮进行

**第一轮：旧 3→2，新 1→2**

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

新旧 2:2，流量约各半

**第二轮：旧 2→1，新 2→3**

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

新旧 1:3，新版本承担约 75% 流量

**第三轮：旧 1→0**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=0
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          3m47s   10.100.1.67   worker01   <none>           <none>
xiuxian-new-b97q2   1/1     Running   0          69s     10.100.1.68   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          116s    10.100.2.66   worker02   <none>           <none>
[root@master 02-huidu]# kubectl get rc
NAME          DESIRED   CURRENT   READY   AGE
xiuxian-new   3         3         3       3m47s
xiuxian-old   0         0         0       6m4s
```

### 6. 观察数据结果

集群中出现的都是 v2 版本，旧版本副本归零

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     17 DAWN apps v2
[root@master 02-huidu]# kubectl get endpoints xiuxian-svc
NAME          ENDPOINTS                                      AGE
xiuxian-svc   10.100.1.67:80,10.100.1.68:80,10.100.2.66:80   7m32s
```

17 次请求全部 v2，Endpoints 仅剩 3 个新版本 Pod，金丝雀发布完成
