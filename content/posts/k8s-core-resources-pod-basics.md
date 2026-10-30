---
title: "K8S 核心资源管理与 Pod 基础实战：资源清单、多容器 Pod、标签与 hostNetwork"
date: 2026-10-30T16:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文系统梳理 K8S 核心资源管理与 Pod 基础操作。先给出常用资源类型缩写速查表并用 kubectl api-resources 概览集群资源；再做日常基础巡检（worker 节点列表、master 组件、flannel 网卡与各节点 cni0/flannel.1 虚拟网卡）；随后编写单容器与多容器 Pod 的资源清单 YAML，对比 kubectl create 与 apply 的差异，并用 kubectl exec 进入指定容器；接着讲声明式 API 与响应式 API 的区别、标签的增删改查与基于标签过滤/删除资源、kubectl describe 查看资源详情，最后演示 hostNetwork 模式让 Pod 共享宿主机网络，并清理实验环境。"
---

# K8S 核心资源管理与 Pod 基础实战：资源清单、多容器 Pod、标签与 hostNetwork

## 一、K8S 常用资源概览

K8S 常用资源类型：

| 缩写   | 全名                     | 说明               |
| ------ | ------------------------ | ------------------ |
| po     | pods                     | 一组容器，最少一个 |
| svc    | services                 | Pod 服务代理       |
| deploy | deployments              | 无状态服务部署     |
| ds     | daemonsets               | 每节点一个 Pod     |
| sts    | statefulsets             | 有状态服务         |
| rs     | replicasets              | 副本控制器（轻量） |
| cm     | configmaps               | 配置文件           |
| ns     | namespaces               | 资源隔离           |
| hpa    | horizontalpodautoscalers | 水平弹性伸缩       |
| ing    | ingresses                | 七层代理           |
| pv/pvc | persistentvolumes/claims | 持久存储           |

### kubectl api-resources

```bash
[root@master ~]# kubectl api-resources | wc -l
57

[root@master ~]# kubectl api-resources
# 输出 57 行资源类型（pods, services, deployments, daemonsets, ingresses, ...）
```

---

## 二、K8S 日常基础巡检

### 1. 检查 worker 节点列表

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   148m   v1.23.17
worker01   Ready    <none>                 147m   v1.23.17
worker02   Ready    <none>                 147m   v1.23.17
```

### 2. 检查 master 组件

```bash
[root@master ~]# kubectl get cs
Warning: v1 ComponentStatus is deprecated in v1.19+
NAME                 STATUS    MESSAGE                         ERROR
controller-manager   Healthy   ok
etcd-0               Healthy   {"health":"true","reason":""}
scheduler            Healthy   ok
```

### 3. 检查 flannel 网卡

```bash
[root@master ~]# kubectl get pods -n kube-flannel -o wide
NAME                    READY   STATUS    RESTARTS   AGE    IP           NODE
kube-flannel-ds-8rmk2   1/1     Running   0          136m   11.0.1.233   worker02
kube-flannel-ds-n6wcv   1/1     Running   0          143m   11.0.1.232   worker01
kube-flannel-ds-tw8f6   1/1     Running   0          143m   11.0.1.231   master
```

### 4. 检查各节点 cni0 和 flannel.1 虚拟网卡

```bash
[root@master ~]# ip addr show cni0 | grep 'inet '
    inet 10.100.0.1/24 brd 10.100.0.255 scope global cni0
[root@master ~]# ip addr show flannel.1 | grep 'inet '
    inet 10.100.0.0/32 scope global flannel.1

[root@worker01 ~]# ip addr show cni0 | grep 'inet '
    inet 10.100.1.1/24 brd 10.100.1.255 scope global cni0
[root@worker01 ~]# ip addr show flannel.1 | grep 'inet '
    inet 10.100.1.0/32 scope global flannel.1

[root@worker02 ~]# ip addr show cni0 | grep 'inet '
    inet 10.100.2.1/24 brd 10.100.2.255 scope global cni0
[root@worker02 ~]# ip addr show flannel.1 | grep 'inet '
    inet 10.100.2.0/32 scope global flannel.1
```

三个节点cni0与flannel.1网段一致

---

## 三、Pod 资源清单编写与创建/删除

### 1. 创建资源目录

```bash
[root@master ~]# mkdir -pv /dawn/manifests/pods
[root@master ~]# cd /dawn/manifests/pods
```

### 2. 编写单容器 Pod YAML

```bash
[root@master pods]# cat 01-pods-xiuxian-single.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v1
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

### 3. kubectl create vs apply 对比

```bash
# create 创建资源
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

# 再次 create —— 报错 AlreadyExists
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
Error from server (AlreadyExists): error when creating "01-pods-xiuxian-single.yaml": pods "xiuxian-v1" already exists

# apply —— 不报错，输出 unchanged/configured
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 configured

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 unchanged
```

生产环境统一用 `kubectl apply`，作用于新资源 `created`，已存在资源视变更与否给出 `configured`/`unchanged`。

### 4. 查看 Pod 列表

```bash
[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       NOMINATED NODE   READINESS GATES
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   <none>           <none>
```

### 5. 删除资源

```bash
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```

### 6. 重新创建

```bash
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       ...
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   ...
```

---

## 四、多容器 Pod 与 kubectl exec

### 1. alpine 镜像准备

```bash
[root@master ~]# docker pull alpine:3.20.2
3.20.2: Pulling from library/alpine
Digest: sha256:0a4eaa0eecf5f8c050e5bba433f58c052be7587ee8af3e8b3910ef9ab5fbe9f5
Status: Downloaded newer image for alpine:3.20.2

[root@master ~]# docker tag alpine:3.20.2 harbor:443/dawn-linux/alpine:3.20.2
[root@master ~]# docker push harbor:443/dawn-linux/alpine:3.20.2
3.20.2: digest: sha256:eddacbc7e24bf8799a4ed3cdcfa50d4b88a323695ad80f317b6629883b2c2a78 size: 528
```

### 2. 多容器 Pod YAML

```bash
[root@master pods]# cat 02-pods-xiuxian-alpine-multiple.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v2
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v2
    name: xiuxian
  - image: harbor:443/dawn-linux/alpine:3.20.2
    name: alpine
    stdin: true
```

```bash
[root@master pods]# kubectl apply -f 02-pods-xiuxian-alpine-multiple.yaml
pod/xiuxian-v2 created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01
xiuxian-v2   2/2     Running   0          8s    10.100.1.7   worker01
```

READY 显示 `2/2`——两个容器均已就绪。

### 3. kubectl exec 在容器中执行命令

```bash
# 单容器 Pod，直接 exec
[root@master pods]# kubectl exec xiuxian-v1 -- ifconfig
eth0      Link encap:Ethernet  HWaddr D2:D6:0C:13:89:D9
          inet addr:10.100.1.6  Bcast:10.100.1.255  Mask:255.255.255.0

# 多容器 Pod，不指定 -c 则默认第 0 个容器
[root@master pods]# kubectl exec xiuxian-v2 -- hostname -i
Defaulted container "xiuxian" out of: xiuxian, alpine
10.100.1.7

# 指定容器名称
[root@master pods]# kubectl exec xiuxian-v2 -c alpine -- hostname -i
10.100.1.7
```

同一个 Pod 内的多个容器共享网络名称空间，IP 相同

---

## 五、声明式 API vs 响应式 API

### 响应式创建 Pod

```bash
[root@master pods]# kubectl run xixi --image=harbor:443/dawn/apps:v2
pod/xixi created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01
xiuxian-v2   2/2     Running   0          30s   10.100.1.7   worker01
xixi         1/1     Running   0          5s    10.100.2.4   worker02
```

### 声明式查看 vs 响应式查看

```bash
# 声明式：通过资源清单文件过滤
[root@master pods]# kubectl get -f 01-pods-xiuxian-single.yaml -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01

# 响应式：全局查看
[root@master pods]# kubectl get pods -o wide --show-labels
NAME         READY   STATUS    ...  LABELS
xiuxian-v1   1/1     Running   ...  <none>
xiuxian-v2   2/2     Running   ...  <none>
xixi         1/1     Running   ...  run=xixi
```

---

## 六、标签管理

### 1. 响应式添加标签

```bash
[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml school=czu class=computer01
pod/xiuxian-v1 labeled

[root@master pods]# kubectl label pods xiuxian-v1 address=ShaHe
pod/xiuxian-v1 labeled

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  address=ShaHe,class=computer01,school=czu
xixi         ...  run=xixi
```

### 2. 响应式删除标签（标签名后加 `-`）

```bash
[root@master pods]# kubectl label pods xiuxian-v1 address-
pod/xiuxian-v1 unlabeled

[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml school-
pod/xiuxian-v1 unlabeled

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  class=computer01
xixi         ...  run=xixi
```

### 3. 响应式修改标签

```bash
[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml class=computer01 --overwrite
pod/xiuxian-v1 labeled
```

### 4. 响应式标签是临时的

```bash
# 删除后重建 —— 标签丢失
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  <none>        ← 标签没了！
xixi         ...  run=xixi
```

### 5. 声明式标签（写在 YAML 中，永久生效）

```bash
[root@master pods]# cat 03-pods-labels.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-labels
  labels:
    school: czu
    class: computer01
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v2
    name: xiuxian
  - image: harbor:443/dawn-linux/alpine:3.20.2
    name: alpine
    stdin: true
```

```bash
[root@master pods]# kubectl apply -f 03-pods-labels.yaml
pod/xiuxian-labels created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME             READY   STATUS    ...  LABELS
xiuxian-labels   2/2     Running   ...  class=computer01,school=czu
xiuxian-v1       1/1     Running   ...  <none>
xixi             1/1     Running   ...  run=xixi
```

### 6. 基于标签过滤资源

```bash
# 有 class 标签的 Pod
[root@master pods]# kubectl get pods -l class --show-labels
NAME             READY   STATUS    ...  LABELS
xiuxian-labels   2/2     Running   ...  class=computer01,school=czu

# 精确匹配 class=computer01
[root@master pods]# kubectl get pods -l class=computer01 --show-labels

# run 标签
[root@master pods]# kubectl get pods -l run --show-labels
NAME   READY   STATUS    ...  LABELS
xixi   1/1     Running   ...  run=xixi
```

### 7. 基于标签删除

```bash
[root@master pods]# kubectl delete pods -l class
pod "xiuxian-labels" deleted

[root@master pods]# kubectl get pods --show-labels
NAME         READY   STATUS    ...  LABELS
xiuxian-v1   1/1     Running   ...  <none>
xiuxian-v2   2/2     Running   ...  <none>
xixi         1/1     Running   ...  run=xixi
```

---

## 七、kubectl describe 查看资源详细信息

### 1. 查看 Pod 详细信息

```bash
[root@master pods]# kubectl describe pods xixi
Name:         xixi
Namespace:    default
Node:         worker02/11.0.1.233
Labels:       run=xixi
Status:       Running
IP:           10.100.2.4
Containers:
  xixi:
    Image:          harbor:443/dawn/apps:v2
    State:          Running
    Ready:          True
    Restart Count:  0
Events:
  Normal  Scheduled  90s   default-scheduler  Successfully assigned default/xixi to worker02
  Normal  Pulled     89s   kubelet            Container image "harbor:443/dawn/apps:v2" already present on machine
  Normal  Created    89s   kubelet            Created container xixi
  Normal  Started    89s   kubelet            Started container xixi
```

### 2. 查看节点详细信息

```bash
[root@master pods]# kubectl describe nodes master
Name:               master
Roles:              control-plane,master
Annotations:        flannel.alpha.coreos.com/public-ip: 11.0.1.231
                    flannel.alpha.coreos.com/backend-type: vxlan
Capacity:
  cpu:                2
  memory:             3969504Ki
  pods:               110
Conditions:
  NetworkUnavailable   False    FlannelIsUp    Flannel is running on this node
  MemoryPressure       False
  DiskPressure         False
  Ready                True
System Info:
  Kernel Version:     5.15.0-202-generic
  OS Image:           Ubuntu 22.04.3 LTS
  Container Runtime:  docker://27.0.3
  Kubelet Version:    v1.23.17
```

### 3. 基于标签过滤 describe

```bash
[root@master pods]# kubectl describe pods -l run=xixi
Name:         xixi
...
```

---

## 八、hostNetwork 模式（Pod 共享宿主机网络）

```bash
[root@master pods]# cat 04-pods-hostNetwork.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostnetwork
  labels:
    apps: xiuxian
    school: czu
    class: computer01
spec:
  hostNetwork: true
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl apply -f 04-pods-hostNetwork.yaml
pod/xiuxian-hostnetwork created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME                  READY   STATUS    RESTARTS   AGE   IP           NODE       LABELS
xiuxian-hostnetwork   1/1     Running   0          5s    11.0.1.232   worker01   apps=xiuxian,class=computer01,school=czu
xiuxian-v1            1/1     Running   0          62s   10.100.1.8   worker01   <none>
xiuxian-v2            2/2     Running   0          115s  10.100.1.7   worker01   <none>
```

`hostNetwork: true` 的 Pod IP 是 `11.0.1.232`（宿主机 worker01 的物理 IP），而普通 Pod 的 IP 是 `10.100.1.x`（Pod 网络）。

```bash
# curl 宿主机 IP 能访问到 hostNetwork Pod 内的 nginx
[root@master pods]# curl -s 11.0.1.232 | head -5
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v1</title>
```

---

## 九、清理环境

```bash
[root@master pods]# kubectl delete pods --all
pod "xiuxian-hostnetwork" deleted
pod "xiuxian-v1" deleted
pod "xiuxian-v2" deleted
pod "xixi" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```
