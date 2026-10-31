---
title: "K8S ReplicationController 声明式更新局限实战：为什么改了 RC 模板 Pod 却不更新？"
date: 2026-10-31T19:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文通过实战验证 K8S 中 ReplicationController (RC) 对声明式更新的支持局限。首先部署 3 副本的 RC 与 ClusterIP Service，访问验证 v1 版本；接着修改 YAML 中的镜像版本为 v2 并执行 kubectl apply，观察到 RC 本身配置已更新为 v2，但运行中的 Pod 镜像与页面并未发生变化；随后手动删除 Pod 触发 RC 按照新模板重建出 v2 Pod；最后深入总结 RC 不支持滚动更新的底层控制机制，对比 RC 与 Deployment 在发布更新上的核心区别。"
---

# K8S ReplicationController 声明式更新局限实战：为什么改了 RC 模板 Pod 却不更新？

在 Kubernetes 中，`ReplicationController`（简称 RC）是最早用于确保指定数量 Pod 副本稳定运行的控制器。很多初学者在掌握了 `kubectl apply` 声明式管理后，常误以为修改 RC 的 Pod 模板（例如更新镜像版本）就会像 Deployment 一样自动触发滚动更新。

本文通过一套完整的验证实验，带你深入理解 RC 的声明式更新局限与 Pod 重建机制。

---

## 一、准备环境并部署初始版本（v1）

### 1.1 编写资源清单

编写 RC 配置文件 `02-rc-xiuxian-update.yaml`，声明 3 个副本以及配套的 ClusterIP Service：

```bash
[root@master rc]# cat 02-rc-xiuxian-update.yaml 
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-xiuxian
spec:
  replicas: 3
  selector:
    apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        school: czu
        class: computer01
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
        ports:
        - containerPort: 80
          name: xiuxian

---

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
    name: xiuxian
```

### 1.2 创建资源并检查状态

执行 `kubectl apply` 创建 RC 与 Service，并确认 3 个 Pod 均已处于 Running 状态：

```bash
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian created
service/xiuxian-svc created
[root@master rc]# kubectl get pods,svc
NAME                   READY   STATUS    RESTARTS   AGE
pod/rc-xiuxian-7jm98   1/1     Running   0          8s
pod/rc-xiuxian-9nmsz   1/1     Running   0          8s
pod/rc-xiuxian-vkfp6   1/1     Running   0          8s

NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
service/kubernetes    ClusterIP   10.200.0.1       <none>        443/TCP   19h
service/xiuxian-svc   ClusterIP   10.200.40.21     <none>        80/TCP    8s
```

---

## 二、初始版本访问测试

通过 Service 的 ClusterIP `10.200.40.21` 进行连续访问测试：

```bash
[root@master rc]# for i in 1 2 3 4 5 6; do curl -s http://10.200.40.21 | grep -oE '<h1[^>]*>[^<]*</h1>'; sleep 0.5; done
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
```

请求均返回绿色标题的“凡人修仙传 v1”，说明初始服务运行正常。

---

## 三、修改 RC 镜像版本并观察更新行为

### 3.1 修改清单文件并应用更新

将镜像标签从 `v1` 修改为 `v2`，再次执行 `kubectl apply`：

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"
      - image: harbor:443/dawn/apps:v1
[root@master rc]# sed -i 's|dawn/apps:v1|dawn/apps:v2|' 02-rc-xiuxian-update.yaml   # 修改配置
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian configured
service/xiuxian-svc unchanged
```

### 3.2 检查 RC 模板与实际运行中的 Pod

检查 RC 对象的 yaml，确认模板已经更新成功：

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"   # RC 的镜像模板已经修改成功
      - image: harbor:443/dawn/apps:v2
```

接着检查运行中的 Pod：

```bash
[root@master rc]# kubectl get pods -o wide  # 但是并不会自动删除或更新旧的 Pod
NAME               READY   STATUS    RESTARTS   AGE    IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-7jm98   1/1     Running   0          42s    10.100.2.57   worker02   <none>           <none>
rc-xiuxian-9nmsz   1/1     Running   0          42s    10.100.2.58   worker02   <none>           <none>
rc-xiuxian-vkfp6   1/1     Running   0          42s    10.100.1.60   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"  # 实际运行的 Pod 镜像仍未更新
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
```

> **核心现象分析**：  
> `kubectl apply` 对 RC 返回了 `configured`，RC 内部维护的 Pod Template 也确实已变更为 `v2`。但**已在运行的 Pod 并没有被重建，仍然跑着 v1 镜像**。  
> 这是 RC 与 Deployment 的本质区别：RC 缺乏针对 Pod 声明式规格变更的主动协调机制，不支持滚动更新（RollingUpdate）。

---

## 四、手动删除 Pod，触发新模板重建

### 4.1 删除旧 Pod

因为 RC 只负责维持副本数量（当前期望副本为 3），当现有 Pod 被销毁后，RC 发现运行副本不足，就会依照**最新的 Pod Template**（v2）拉起新的 Pod：

```bash
[root@master rc]# kubectl delete pods --all  # 手动删除旧的 Pod
pod "rc-xiuxian-7jm98" deleted
pod "rc-xiuxian-9nmsz" deleted
pod "rc-xiuxian-vkfp6" deleted
```

### 4.2 观察新拉起的 Pod 与镜像版本

```bash
[root@master rc]# kubectl get pods -o wide  # RC 自动拉起新 Pod
NAME               READY   STATUS    RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-8jtfd   1/1     Running   0          10s   10.100.2.59   worker02   <none>           <none>
rc-xiuxian-ff8cv   1/1     Running   0          10s   10.100.1.61   worker01   <none>           <none>
rc-xiuxian-mfqp9   1/1     Running   0          10s   10.100.1.62   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
```

### 4.3 再次访问验证

```bash
[root@master rc]# for i in 1 2 3; do curl -s http://10.200.40.21 | grep -oE '<title>[^<]*</title>|<h1[^>]*>[^<]*</h1>'; done
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
```

页面从原来的“绿色标题 v1”成功变成“红色标题 v2”，新镜像正式生效。

---

## 五、深入总结与生产反思

1. **RC 的核心职责是“副本保持”，而非“版本管理”**：  
   RC 控制器的工作循环仅比较 `selector` 匹配到的 Pod 数量与 `spec.replicas` 是否相等。如果当前数量吻合，RC 就认为状态健康，根本不会去比对 Pod 的镜像或环境配置与 Template 是否一致。只有在 Pod 销毁、副本不足时，才会使用当前的 Template 生成新 Pod。
2. **“直接删除全部 Pod” 在生产环境中极其危险**：  
   虽然本实验中通过 `kubectl delete pods --all` 成功触发了新镜像上线，但生产环境严禁这样操作：
   - 会导致瞬时服务完全中断（Downtime）；
   - 如果新镜像存在构建缺陷、启动崩溃或无法拉取（`ImagePullBackOff`），将直接导致整个集群服务不可用。
3. **拥抱 Deployment**：  
   RC 属于早期控制器，早已被 `Deployment` + `ReplicaSet` 完全替代。Deployment 不仅支持声明式更新，还原生提供滚动更新（RollingUpdate）、金丝雀发布、最大不可用比例（`maxUnavailable`）、发布暂停与一键回滚（`rollout undo`）等高级生命周期管理能力。
