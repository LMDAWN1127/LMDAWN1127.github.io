---
title: "K8S Static Pod Lifecycle in Practice: From kubeadm Bootstrap Principles to Control Plane Fault Drills"
date: 2026-11-01T20:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "kubelet", "kubeadm", "StaticPod"]
showToc: true
summary: "A deep dive into the Kubernetes Static Pod working mechanism and kubelet daemon logic, uncovering how kubeadm bootstraps the four core control plane components, hands-on custom static Pod self-healing verification, and control plane apiserver fault injection and recovery drills."
---

# K8S Static Pod Lifecycle in Practice: From kubeadm Bootstrap Principles to Control Plane Fault Drills

## Static Pods: The Startup Principle Behind kubeadm

### 1. Purpose

Static Pods bypass the apiserver completely. Simply placing the Pod manifest into the directory recognized by kubelet will launch it. The four core control plane components deployed by kubeadm are implemented exactly in this manner.

### 2. kubelet Static Pod Directory

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

### 3. Custom Static Pod Example

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

kubectl cannot delete it; it automatically recreates upon deletion:

```bash
[root@master ~]# kubectl delete pod xiuxian-v1-master
pod "xiuxian-v1-master" deleted

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP           NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          3s    10.100.0.10  master      <none>           <none>
```

### 4. Multi-Node Deployment and Deletion

```bash
[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker01:/etc/kubernetes/manifests/

[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker02:/etc/kubernetes/manifests/

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE     IP            NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          2m46s   10.100.0.10   master      <none>           <none>
xiuxian-v1-worker01  1/1     Running   0          12s     10.100.1.137  worker01    <none>           <none>
xiuxian-v1-worker02  1/1     Running   0          4s      10.100.2.133  worker02    <none>           <none>
```

Deletion only requires removing the files on each individual node.

### 5. Deleting the apiserver File: Cluster Crash Demonstration

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

For K8S clusters deployed via kubeadm, kubelet must be set to start automatically on boot. Upon starting, kubelet will automatically load static Pod resources.
