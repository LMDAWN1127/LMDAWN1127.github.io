---
title: "K8S Node Lifecycle and Cluster Shrinking in Action: Graceful Pod Eviction with Cordon/Drain and Node Decommissioning"
date: 2026-11-02T21:35:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Node", "Drain", "Cordon", "ClusterOps"]
showToc: true
summary: "A comprehensive walkthrough of graceful node shrinking and decommissioning in production Kubernetes clusters. Covers workload eviction using kubectl drain and cordon with DaemonSet filtering, unschedulable taints, uncordon node recovery, as well as destructive node decommission steps including kubelet stoppage, kubeadm reset environment clearing, disk wiping, and node deletion from master."
---

# K8S Node Lifecycle and Cluster Shrinking in Action: Graceful Pod Eviction with Cordon/Drain and Node Decommissioning

---

## K8S Cluster Shrink / Decommission Workflow

1. Evict Pods from the target node to other nodes
2. Stop the kubelet service on the decommissioned node
3. Reset the decommissioned node environment (uninstall kubelet / kubeadm / docker)
4. Back up critical data and wipe disks to prevent data leakage
5. Delete the node resource from the master node

---

## 1. Inspecting Resource Status Before Eviction

First, create a batch of Pods to simulate production workload:

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

5 Pods distributed across worker01 (3 pods) and worker02 (2 pods)

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

---

## 2. Initiating Eviction — kubectl drain

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

`--ignore-daemonsets` —— Skip DaemonSet Pods (flannel / kube-proxy / speaker), which are not affected by eviction

`--delete-emptydir-data` —— Delete Pods utilizing emptyDir volumes

---

## 3. Inspecting Pod Status After Eviction

```bash
[root@master ~]# kubectl get pods -o wide | grep deploy-stress
deploy-stress-5cfb965cf9-69g64   1/1   Running   0   101s   10.100.1.38   worker01
deploy-stress-5cfb965cf9-7bh79   1/1   Running   0   101s   10.100.1.36   worker01
deploy-stress-5cfb965cf9-bmg9r   1/1   Running   0   89s    10.100.1.41   worker01
deploy-stress-5cfb965cf9-ft9zr   1/1   Running   0   48s    10.100.1.43   worker01
deploy-stress-5cfb965cf9-p6zcr   1/1   Running   0   48s    10.100.1.42   worker01
```

All 5 Pods migrated to worker01 — the two original Pods on worker02 were evicted and rescheduled, with new Pods (ft9zr, p6zcr) replacing the old Pods (kp2bh, wg6vd).

After eviction, all Pods are consolidated on a single node. If this node has insufficient resources, some Pods will enter Pending status. Production environments must ensure remaining nodes have adequate capacity.

---

## 4. Inspecting Node Status

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                     ROLES                  AGE    VERSION
master     Ready                      control-plane,master   3d8h   v1.23.17
worker01   Ready                      <none>                 3d8h   v1.23.17
worker02   Ready,SchedulingDisabled   <none>                 3d8h   v1.23.17
```

worker02 changed to `SchedulingDisabled` — drain automatically executed cordon, marking the node as unschedulable

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

worker02 was automatically tainted with `node.kubernetes.io/unschedulable:NoSchedule`, with `Unschedulable: true`

---

## 5. Restoring Node — kubectl uncordon

```bash
[root@master ~]# kubectl uncordon worker02
node/worker02 uncordoned

[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

`uncordon` removes the unschedulable taint, restoring the node to normal schedulable status

---

## 6. Destructive Steps

### 6.1 Stop kubelet on the Decommissioned Node

```bash
[root@worker02 ~]# systemctl disable --now kubelet
Removed /etc/systemd/system/multi-user.target.wants/kubelet.service.
```

### 6.2 Master Marks Node as NotReady

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                        ROLES                  AGE   VERSION
master     Ready                         control-plane,master   3d    v1.23.17
worker01   Ready                         <none>                 3d    v1.23.17
worker02   NotReady,SchedulingDisabled   <none>                 3d    v1.23.17
```

### 6.3 Execute kubeadm reset on the Decommissioned Node

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

`kubeadm reset` does not clean CNI configuration (`/etc/cni/net.d`), iptables rules, and kubectl configuration files; these must be cleaned manually

### 6.4 Master Removes the Decommissioned Node

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
