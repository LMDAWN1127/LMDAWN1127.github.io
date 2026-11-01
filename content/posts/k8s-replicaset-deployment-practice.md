---
title: "K8S ReplicaSet 与 Deployment 控制器实战：副本控制、滚动更新与版本回滚机制"
date: 2026-11-01T11:28:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ReplicaSet", "Deployment"]
showToc: true
summary: "深入剖析 Kubernetes ReplicaSet 与 Deployment 控制器的实战操作，涵盖 matchLabels 与 matchExpressions 标签选择器（Pod 收养机制）、Recreate 与 RollingUpdate 滚动升级策略（maxSurge/maxUnavailable 深度剖析）以及声明式/响应式更新与历史版本回滚全流程实操。"
---

# K8S ReplicaSet 与 Deployment 控制器实战：副本控制、滚动更新与版本回滚机制

## 一、rs 控制器

### 1. 作用

可以实现 Pod 的副本控制，相比 rc 资源，其功能性更强且更加轻量级

### 2. 案例 1——rs 实现类似 rc 的功能

工作目录 `/dawn/manifests/rs/`

```bash
[root@master rs]# cat 01-rs-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian
spec:
  # 指定Pod的副本数量
  replicas: 3
  # 定义如何关联Pod
  selector:
    # 基于标签关联Pod
    matchLabels:
      apps: xiuxian
  # 定义Pod的模板
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

3 个 Pod 全部 Running，标签与模板一致。与 rc 相同，matchLabels 等值选择器完成了副本控制

### 3. 案例 2——rs 实现优于 rc 的功能（matchExpressions 收养）

#### 3.1 准备测试环境

先用 `kubectl run` 造 4 个裸 Pod 并打上不同标签

k8s v1.23 的 `kubectl run` 默认创建的是 Deployment 而不是 Pod，要加 `--restart=Never` 才会创建裸 Pod

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

#### 3.2 创建 rs 资源

```bash
[root@master rs]# cat 02-rs-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian-matchexpressions
spec:
  # 指定Pod的副本数量
  replicas: 5
  # 定义如何关联Pod
  selector:
    # 基于标签表达式关联Pod
    matchExpressions:
      # 代表的是标签的key
    - key: apps
      # 代表的是标签的value
      values:
      - v1
      - v2
      - v3
      # 指定key和value之间的关系:  In, NotIn, Exists and DoesNotExist
      #   In:
      #      key的值必须在value的列表之中。
      #   NotIn:
      #      和In相反。
      #   Exists:
      #      只要存在key即可，value任意，因此可以省略value字段。
      #   DoesNotExist:
      #      不存在指定的key，和Exists相反，因此可以省略value字段。
      operator: In
  # 定义Pod的模板
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

这就是 rs 优于 rc 的地方：RS 声明 5 个副本，但只新建了 2 个 Pod（`cdhjw`、`q8s66`）。因为 `matchExpressions` 的集合选择器 `apps In (v1,v2,v3)` 把已有的 xiuxian01/02/03 收养了——3 个旧 Pod + 2 个新 Pod = 5。而 xiuxian04 的标签是 `apps=v4`，不在 In 列表里，不会被收养。

收养行为用 ownerReferences 实证：

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

删除 RS 会级联删除被收养的 Pod（xiuxian01/02/03 随 RS 一起消失），而未被收养的 xiuxian04 成为"孤儿"需要单独删除：

```bash
[root@master rs]# kubectl delete -f 02-rs-xiuxian-matchExpressions.yaml && kubectl delete pod xiuxian04
replicaset.apps "rs-xiuxian-matchexpressions" deleted
pod "xiuxian04" deleted
```

## 二、deploy 控制器

### 1. 作用

用于部署服务，底层基于 rs 来控制 Pod 副本数量，并不会直接控制 Pod。相比于 rc 和 rs，deploy 支持声明式更新

### 2. 案例 1——基于 matchLabels 匹配

```bash
[root@master deploy]# cat 01-deploy-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian
spec:
  # 指定Pod的副本数量
  replicas: 3
  # 定义如何关联Pod
  selector:
    # 基于标签关联Pod
    matchLabels:
      apps: xiuxian
  # 定义Pod的模板
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

### 3. 案例 2——基于 matchExpressions 匹配

```bash
[root@master deploy]# cat 02-deloy-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deploy-xiuxian-matchexpressions
spec:
  # 指定Pod的副本数量
  replicas: 5
  # 定义如何关联Pod
  selector:
    # 基于标签表达式关联Pod
    matchExpressions:
      # 代表的是标签的key
    - key: apps
      # 代表的是标签的value
      values:
      - v1
      - v2
      - v3
      # 指定key和value之间的关系:  In, NotIn, Exists and DoesNotExist
      operator: In
  # 定义Pod的模板
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

### 4. 测试案例

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

**Deployment → ReplicaSet → Pod**。每个 Deployment 下自动生成一个 RS（名字带 pod-template-hash 后缀），Pod 名再带一层随机后缀。Deployment 不直接管 Pod，一切都通过 RS 中转

## 三、deployments 的 Recreate 升级策略

先清理上面的两个 Deployment（它们的选择器 `apps: xiuxian` 会和下面的 update 部署冲突，导致 Pod 被误收养），再应用 Recreate 策略：

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
  # 升级策略
  strategy:
    # 指定升级的类型,"Recreate" or "RollingUpdate"
    #   Recreate:
    #     代表的是删除所有旧的Pod，再去创建新的Pod，不推荐使用。
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
         # 指定镜像的拉取策略，有效值为: Always, Never, IfNotPresent
         #    Never:
         #      如果本地有镜像则尝试启动。
         #      如果本地没有镜像则不会去远程仓库拉取镜像。
         #    IfNotPresent:
         #      如果本地有镜像则尝试启动。
         #      如果本地没有镜像则去远程仓库拉取镜像。
         #    Always:
         #      如果本地有镜像，则会将本地的镜像和远程仓库的摘要信息进行对比，若一致则直接使用本地缓存镜像，若不一致则重新拉取。
         #      如果本地没有镜像，则直接从远程仓库拉取镜像。
         #
         # 默认策略会根据镜像的标签来定:
         #    如果你的tag是"latest"，则默认策略为"Always";
         #    若你的tag是非"latest"，则默认策略为"IfNotPresent"
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

Recreate 首次部署 3 个 v3 Pod。svc 按 yaml 里硬编码的 `clusterIP: 10.200.0.80` 固定了地址——在 Service 网段内指定一个空闲 IP，可以固定服务入口。

## 四、deployments 的 RollingUpdate 升级策略

同一个 Deployment 换用 RollingUpdate 策略：副本 3→5、镜像 v3→v2、`maxSurge: 2`、`maxUnavailable: 1`：

```bash
[root@master deploy]# cat 03-deploy-update-RollingUpdate.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian-update
spec:
  # 升级策略
  strategy:
    # 指定升级的类型,"Recreate" or "RollingUpdate"
    #   Recreate:
    #     代表的是删除所有旧的Pod，再去创建新的Pod，不推荐使用。
    #   RollingUpdate:
    #     代表滚动更新，会更新一部分Pod，逐步替换旧的Pod，默认就是这种类型。
    type: RollingUpdate
    # 定义滚动升级策略，前提是 "type: RollingUpdate"时该字段才有效。
    rollingUpdate:
      # 在升级的过程中，在原有副本数量基础之上，最多能够启动的Pod数量。
      # 该字段支持百分比和数字，若不指定，则默认为:"25%"。
      maxSurge: 2
      # 在升级过程中，在原有副本数量基础之上，不可用的副本数量。
      # 该字段支持百分比和数字，若不指定，则默认为:"25%"。
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

apply 之后立刻连续抓拍，滚动过程一目了然：

```bash
[root@master deploy]# kubectl apply -f 03-deploy-update-RollingUpdate.yaml
deployment.apps/deloy-xiuxian-update configured
service/xiuxian-svc-deploy unchanged
[root@master deploy]# kubectl get pods -o wide        # t0：新RS的Pod开始调度
NAME                                    READY   STATUS              RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-57969ff46-9gfzg    1/1     Running             0          17s   10.100.1.77   worker01
deloy-xiuxian-update-57969ff46-bfgf9    0/1     ContainerCreating   0          0s    <none>        worker02
deloy-xiuxian-update-57969ff46-fzmmj    1/1     Running             0          17s   10.100.1.78   worker01
deloy-xiuxian-update-57969ff46-zjmt2    0/1     ContainerCreating   0          0s    <none>        worker01
deloy-xiuxian-update-57969ff46-zkfp9    1/1     Running             0          17s   10.100.2.76   worker02
deloy-xiuxian-update-76dd8844b9-8p9pj   0/1     Pending             0          0s    <none>        <none>
deloy-xiuxian-update-76dd8844b9-cvhkc   0/1     Pending             0          0s    <none>        worker02
[root@master deploy]# kubectl get pods -o wide        # t+2s：新Pod起来，旧Pod开始退出
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
[root@master deploy]# kubectl get pods -o wide        # t+5s：旧Pod全部退出，5个新Pod就绪
NAME                                    READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-76dd8844b9-8p9pj   1/1     Running   0          5s    10.100.1.80   worker01
deloy-xiuxian-update-76dd8844b9-cvhkc   1/1     Running   0          5s    10.100.2.79   worker02
deloy-xiuxian-update-76dd8844b9-nf74j   1/1     Running   0          5s    10.100.2.78   worker02
deloy-xiuxian-update-76dd8844b9-tc9j4   1/1     Running   0          3s    10.100.1.81   worker01
deloy-xiuxian-update-76dd8844b9-xrr4n   1/1     Running   0          3s    10.100.2.80   worker02
```

**t0**：副本要从 3 扩到 5，旧 RS（`57969ff46`，v3）先补了 2 个 Pod（`bfgf9`、`zjmt2`）；同时新 RS（`76dd8844b9`，v2）的 Pod 开始 Pending——这就是 `maxSurge: 2`，最多超出期望副本数 2 个

**t+2s**：新旧共存，Pod 总数 7 个 = 期望 5 + surge 2，`maxSurge` 卡得死死的；旧 Pod 开始 `Terminating`，对应 `maxUnavailable: 1` 的滚动节奏

**t+5s**：旧 RS 的 Pod 全部退出，5 个新 Pod 全部 Running，滚动完成

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

旧 RS 缩到 0 但对象保留（revision 1 = Recreate 的 v3，revision 2 = RollingUpdate 的 v2）

## 五、deploy 实现响应式更新和回滚

清理 update 部署后，创建专门用于演示的 `deloy-xiuxian-update-strategy`（3 副本、v1、默认 RollingUpdate）：

```bash
[root@master deploy]# kubectl delete -f 03-deploy-update-RollingUpdate.yaml
deployment.apps "deloy-xiuxian-update" deleted
service "xiuxian-svc-deploy" deleted
[root@master deploy]# kubectl apply -f 04-deploy-xiuxian-update-strategy.yaml
deployment.apps/deloy-xiuxian-update-strategy created
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 1. 响应式更新应用

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

### 2. 查看应用发布的历史版本

```bash
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
3         <none>
```

历史版本从 2 开始、看不到 1——这不是命令出错，而是模板复用导致的 revision 重编号：第 3 次更新（改回 v1）的模板与 revision 1 完全一致，Deployment 直接复用了 revision 1 的 ReplicaSet（`65987b5db8`）并把它的 revision 号改写成 3，revision 1 从此"消失"

### 3. 查看当前应用的部署状态

```bash
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 4. 暂停更新

```bash
[root@master deploy]# kubectl rollout pause deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy paused
```

光暂停不直观，暂停期间再改一次镜像，才能看出 pause 真的"挂起"了更新——spec 已改成 v2，但 Pod 纹丝不动：

```bash
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v2
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl get pods -o wide
NAME                                             READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-strategy-65987b5db8-5smhl   1/1     Running   0          23s   10.100.2.84   worker02
deloy-xiuxian-update-strategy-65987b5db8-wcrn2   1/1     Running   0          24s   10.100.1.86   worker01
deloy-xiuxian-update-strategy-65987b5db8-wk2xd   1/1     Running   0          26s   10.100.2.83   worker02
$ echo -n 'spec镜像: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
spec镜像: harbor:443/dawn/apps:v2
```

spec 里已经是 v2，Pod 却还全是 v1 的 `65987b5db8`

### 5. 恢复更新

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

resume 之后被挂起的更新立即放行，滚动到 v2（新 RS `76dd8844b9`）。这个哈希和上面 update 部署的 v2 RS 是同一个——pod-template-hash 只由 Pod 模板内容决定，与属于哪个 Deployment 无关，模板相同的 RS 哈希必然相同

### 6. 回滚到上一个版本

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

每次 undo 都是把上一个版本的模板作为新 revision 重新部署（revision 号递增，旧号被复用顶掉），所以历史列表里的编号是跳跃的：2,4,5 → 2,5,6

### 7. 回滚到指定版本

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
[root@master deploy]# echo -n '最终镜像: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
最终镜像: harbor:443/dawn/apps:v3
```

revision 2 是 v3，回滚后当前镜像确实是 v3，实验闭环。此时若再查 `--revision=2` 的详情会报 `unable to find the specified revision`——因为 revision 2 的 RS 已被后续的 undo 复用并改号为 7 了（`kubectl rollout history --revision=7` 才能看到这份 v3 模板）
