---
title: "K8S ReplicationController 声明式更新局限实战：为什么改了 RC 模板 Pod 却不更新？"
date: 2026-10-31T19:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "RC 资源不支持声明式更新实战记录：通过修改 RC 的 Pod 镜像模板，观察 kubectl apply 后运行中的 Pod 并不更新的现象，验证必须手动删除旧 Pod 才能触发新模板拉起，并指出生产环境中直接删除所有 Pod 的风险。"
---

# K8S ReplicationController 声明式更新局限实战：为什么改了 RC 模板 Pod 却不更新？

### 1. 准备环境

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

### 2. 访问测试

```bash
[root@master rc]# for i in 1 2 3 4 5 6; do curl -s http://10.200.40.21 | grep -oE '<h1[^>]*>[^<]*</h1>'; sleep 0.5; done
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
```

### 3. 修改 RC 的镜像名称

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"
      - image: harbor:443/dawn/apps:v1
[root@master rc]# sed -i 's|dawn/apps:v1|dawn/apps:v2|' 02-rc-xiuxian-update.yaml   # 修改配置
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian configured
service/xiuxian-svc unchanged
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"   # rc的镜像模板已经修改成功了
      - image: harbor:443/dawn/apps:v2
[root@master rc]# kubectl get pods -o wide  # 但是并不会自动删除旧的Pod
NAME               READY   STATUS    RESTARTS   AGE    IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-7jm98   1/1     Running   0          42s    10.100.2.57   worker02   <none>           <none>
rc-xiuxian-9nmsz   1/1     Running   0          42s    10.100.2.58   worker02   <none>           <none>
rc-xiuxian-vkfp6   1/1     Running   0          42s    10.100.1.60   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"  # 镜像是没有更新的
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
```

`kubectl apply` 对 RC 返回 `configured`，RC 的 template 已更新为 v2，但已在运行的 Pod 不会被重建，仍在用 v1。这就是 RC 与 Deployment 的核心区别（RC 无滚动更新）。

### 4. 手动删除 Pod，触发新模板重建

```bash
[root@master rc]# kubectl delete pods --all  # 手动删除旧的Pod
pod "rc-xiuxian-7jm98" deleted
pod "rc-xiuxian-9nmsz" deleted
pod "rc-xiuxian-vkfp6" deleted
[root@master rc]# kubectl get pods -o wide  # 会自动创建新的Pod，而新的Pod使用的镜像是新的镜像版本
NAME               READY   STATUS    RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-8jtfd   1/1     Running   0          10s   10.100.2.59   worker02   <none>           <none>
rc-xiuxian-ff8cv   1/1     Running   0          10s   10.100.1.61   worker01   <none>           <none>
rc-xiuxian-mfqp9   1/1     Running   0          10s   10.100.1.62   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
[root@master rc]# for i in 1 2 3; do curl -s http://10.200.40.21 | grep -oE '<title>[^<]*</title>|<h1[^>]*>[^<]*</h1>'; done
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
```

页面从"绿色标题的 v1"变成"红色标题的 v2"，新镜像生效



注：

1. rc资源不支持声明式更新，因为需要手动删除Pod后，才能使用新的模板;

2. 上面直接删除所有的Pod方法不可取，尽管此案例中是成功的，但是可能会出现新的镜像无法启动，无法拉取镜像或者启动后有bug的情况