---
title: "K8S 静态 Pod 机制实战全解：从 kubeadm 底层启动原理到控制面故障演练"
date: 2026-11-01T20:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "kubelet", "kubeadm", "StaticPod"]
showToc: true
summary: "深入剖析 Kubernetes 静态 Pod（Static Pod）工作机制与 kubelet 守护逻辑，揭秘 kubeadm 引导集群控制面四大组件的核心原理，通过自定义静态 Pod 实战自愈特性，并开展控制面 apiserver 故障注入与快速恢复演练。"
---

# K8S 静态 Pod 机制实战全解：从 kubeadm 底层启动原理到控制面故障演练

## 静态 Pod：kubeadm 的启动原理

### 1. 作用

静态 Pod 不经过 apiserver，把 Pod 清单放进 kubelet 识别的目录即可被拉起，kubeadm 部署的四大组件正是用这种方式实现。

### 2. kubelet 静态 Pod 目录

```bash
[root@master ~]# grep staticPodPath /var/lib/kubelet/config.yaml
staticPodPath: /etc/kubernetes/manifests

[root@master ~]# ll /etc/kubernetes/manifests/
total 24
drwxr-xr-x 2 root root 4096 Oct 30 12:54 ./
drwxr-xr-x 4 root root 4096 Oct 30 12:54 ../
-rw------- 1 root root 2274 Oct 30 12:54 etcd.yaml
-rw------- 1 root root 4020 Oct 30 12:54 kube-apiserver.yaml
-rw------- 1 root root 3546 Oct 30 12:54 kube-controller-manager.yaml
-rw------- 1 root root 1465 Oct 30 12:54 kube-scheduler.yaml
```

### 3. 自定义静态 Pod 案例

```bash
[root@master ~]# cat /dawn/manifests/pods/01-pods-xiuxian-single.yaml
```

```yaml
# 指定api的版本号
apiVersion: v1
# 指定资源的类型
kind: Pod
# 指定元数据信息
metadata:
  # 声明资源的名称
  name: xiuxian-v1
# 定义资源的期望状态
spec:
  # 指定Pod调度到哪个节点（静态Pod会忽略该字段，落在文件所在节点）
  nodeName: worker01
  # 指定Pod内的容器
  containers:
    # 指定容器的镜像
  - image: harbor:443/dawn/apps:v1
    # 指定容器的名称
    name: xiuxian
```

```bash
[root@master ~]# cp /dawn/manifests/pods/01-pods-xiuxian-single.yaml /etc/kubernetes/manifests/

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP           NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          7s    10.100.0.10  master      <none>           <none>
```

kubectl 删不掉，删了自动重建：

```bash
[root@master ~]# kubectl delete pod xiuxian-v1-master
pod "xiuxian-v1-master" deleted

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP           NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          3s    10.100.0.10  master      <none>           <none>
```

### 4. 多节点部署与删除

```bash
[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker01:/etc/kubernetes/manifests/

[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker02:/etc/kubernetes/manifests/

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE     IP            NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          2m46s   10.100.0.10   master      <none>           <none>
xiuxian-v1-worker01  1/1     Running   0          12s     10.100.1.137  worker01    <none>           <none>
xiuxian-v1-worker02  1/1     Running   0          4s      10.100.2.133  worker02    <none>           <none>
```

删除只需把每个节点上的文件都rm掉

### 5. 删除apiserver文件，集群崩溃演示

```bash
[root@master ~]# mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

[root@master ~]# kubectl get nodes
The connection to the server 11.0.1.231:6443 was refused - did you specify the right host or port?
```

```bash
[root@master ~]# mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

[root@master ~]# kubectl get nodes
NAME        STATUS   ROLES                  AGE       VERSION
master      Ready    control-plane,master   7d1h      v1.23.17
worker01    Ready    <none>                 7d1h      v1.23.17
worker02    Ready    <none>                 7d1h      v1.23.17
```

基于 kubeadm 方式部署的 K8S 集群一定要开机自启动 kubelet，启动后 kubelet 会自动加载静态 Pod 资源
