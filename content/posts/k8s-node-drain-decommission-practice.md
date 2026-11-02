---
title: "K8S 节点生命周期与集群缩容实战：Node Cordon/Drain 优雅驱逐与节点退役下线全流程"
date: 2026-11-02T21:35:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Node", "Drain", "Cordon", "ClusterOps"]
showToc: true
summary: "深入讲解 Kubernetes 生产集群节点安全缩容与下线退役全流程，涵盖利用 kubectl drain 与 cordon 优雅驱逐业务负载与 DaemonSet 过滤、unschedulable 污点标记与 uncordon 节点状态恢复机制，以及停止 kubelet、kubeadm reset 环境重置、数据擦除和 master 彻底删除 node 资源的破坏性下线实操。"
---

# K8S 节点生命周期与集群缩容实战：Node Cordon/Drain 优雅驱逐与节点退役下线全流程

---

## K8S 集群缩容流程

1. 将要下线节点的 Pod 驱逐到其他节点
2. 停止被下线节点的 kubelet 服务
3. 重置被下线节点环境（卸载 kubelet / kubeadm / docker）
4. 备份重要数据，擦除磁盘防数据泄露
5. master 节点删除 node 资源

---

## 一、驱逐前查看资源状态

先创建一批 Pod 模拟生产负载：

```bash
[root@master ~]# kubectl create deploy deploy-stress --image=harbor:443/dawn/stress:1.0.4 \
  --replicas=5 -- sleep 3600
deployment.apps/deploy-stress created

[root@master ~]# kubectl set resources deploy deploy-stress \
  --requests=cpu=100m,memory=100Mi --limits=cpu=500m,memory=200Mi

[root@master ~]# kubectl get pods -o wide | grep deploy-stress
deploy-stress-5cfb965cf9-69g64   1/1   Running   0   37s   10.100.1.38    worker01
deploy-stress-5cfb965cf9-7bh79   1/1   Running   0   37s   10.100.1.36    worker01
deploy-stress-5cfb965cf9-bmg9r   1/1   Running   0   25s   10.100.1.41    worker01
deploy-stress-5cfb965cf9-kp2bh   1/1   Running   0   37s   10.100.2.246   worker02
deploy-stress-5cfb965cf9-wg6vd   1/1   Running   0   27s   10.100.2.247   worker02
```

5 个 Pod 分布在 worker01（3 个）和 worker02（2 个）

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

---

## 二、开始驱逐 —— kubectl drain

```bash
[root@master ~]# kubectl drain worker02 --ignore-daemonsets --delete-emptydir-data
node/worker02 cordoned
WARNING: ignoring DaemonSet-managed Pods:
  kube-flannel/kube-flannel-ds-8rmk2,
  kube-system/kube-proxy-lsxcn,
  metallb-system/speaker-dkhfx
evicting pod metallb-system/controller-6679f7f994-dvfjd
evicting pod default/deploy-stress-5cfb965cf9-kp2bh
evicting pod default/deploy-stress-5cfb965cf9-wg6vd
pod/controller-6679f7f994-dvfjd evicted
pod/deploy-stress-5cfb965cf9-kp2bh evicted
pod/deploy-stress-5cfb965cf9-wg6vd evicted
node/worker02 drained
```

`--ignore-daemonsets` —— 跳过 DaemonSet Pod（flannel / kube-proxy / speaker），它们不受驱逐影响

`--delete-emptydir-data` —— 删除使用 emptyDir 卷的 Pod

---

## 三、驱逐后查看 Pod 状态

```bash
[root@master ~]# kubectl get pods -o wide | grep deploy-stress
deploy-stress-5cfb965cf9-69g64   1/1   Running   0   101s   10.100.1.38   worker01
deploy-stress-5cfb965cf9-7bh79   1/1   Running   0   101s   10.100.1.36   worker01
deploy-stress-5cfb965cf9-bmg9r   1/1   Running   0   89s    10.100.1.41   worker01
deploy-stress-5cfb965cf9-ft9zr   1/1   Running   0   48s    10.100.1.43   worker01
deploy-stress-5cfb965cf9-p6zcr   1/1   Running   0   48s    10.100.1.42   worker01
```

全部 5 个 Pod 迁到 worker01——原来的 worker02 的两个 Pod 被驱逐并重新调度，新 Pod（ft9zr、p6zcr）替代了旧 Pod（kp2bh、wg6vd）。

驱逐后所有 Pod 集中在单节点，若该节点资源不足会出现部分 Pod Pending。生产环境需确保剩余节点有足够容量。

---

## 四、查看节点信息

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                     ROLES                  AGE    VERSION
master     Ready                      control-plane,master   3d8h   v1.23.17
worker01   Ready                      <none>                 3d8h   v1.23.17
worker02   Ready,SchedulingDisabled   <none>                 3d8h   v1.23.17
```

worker02 变为 `SchedulingDisabled`——drain 自动执行了 cordon，给节点打上不可调度标记

```bash
[root@master ~]# kubectl describe nodes | grep -E "Taints|Unschedulable"
Taints:             node-role.kubernetes.io/master:NoSchedule
Unschedulable:      false
---
Taints:             <none>
Unschedulable:      false
---
Taints:             node.kubernetes.io/unschedulable:NoSchedule
Unschedulable:      true                              # worker02
```

worker02 被自动添加 `node.kubernetes.io/unschedulable:NoSchedule` 污点，`Unschedulable: true`

---

## 五、恢复节点 —— kubectl uncordon

```bash
[root@master ~]# kubectl uncordon worker02
node/worker02 uncordoned

[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

`uncordon` 移除 unschedulable 污点，节点恢复正常可调度状态

---

## 六、破坏性步骤

### 6.1 停止被下线节点 kubelet

```bash
[root@worker02 ~]# systemctl disable --now kubelet
Removed /etc/systemd/system/multi-user.target.wants/kubelet.service.
```

### 6.2 master 端标记为 NotReady

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                        ROLES                  AGE   VERSION
master     Ready                         control-plane,master   3d    v1.23.17
worker01   Ready                         <none>                 3d    v1.23.17
worker02   NotReady,SchedulingDisabled   <none>                 3d    v1.23.17
```

### 6.3 被下线节点 kubeadm reset

```bash
[root@worker02 ~]# kubeadm reset -f
[preflight] Running pre-flight checks
[reset] No etcd config found. Assuming external etcd
[reset] Stopping the kubelet service
[reset] Unmounting mounted directories in "/var/lib/kubelet"
[reset] Deleting contents of config directories: [/etc/kubernetes/manifests /etc/kubernetes/pki]
[reset] Deleting files: [/etc/kubernetes/admin.conf /etc/kubernetes/kubelet.conf ...]
[reset] Deleting contents of stateful directories: [/var/lib/kubelet /var/lib/dockershim /var/run/kubernetes /var/lib/cni]

[root@worker02 ~]# ls /var/lib/kubelet
# 空目录——环境已完全重置

[root@worker02 ~]# init 0
# 关机后重新安装操作系统，避免数据泄露
```

`kubeadm reset` 不清 CNI 配置（`/etc/cni/net.d`）、iptables 规则和 kubectl 配置文件，这些需手动清理

### 6.4 master 移除被下线节点

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                        ROLES    AGE   VERSION
master     Ready                         master   3d    v1.23.17
worker01   Ready                         <none>   3d    v1.23.17
worker02   NotReady,SchedulingDisabled   <none>   3d    v1.23.17

[root@master ~]# kubectl delete nodes worker02
node "worker02" deleted

[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES    AGE   VERSION
master     Ready    master   3d    v1.23.17
worker01   Ready    <none>   3d    v1.23.17
```
