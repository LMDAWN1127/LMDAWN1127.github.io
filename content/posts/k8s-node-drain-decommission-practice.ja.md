---
title: "K8S ノードライフサイクルとクラスタ縮小実践解説：Node Cordon/Drain による安全な Pod 立ち退きとノード完全退役・安全削除手順"
date: 2026-11-02T21:35:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Node", "Drain", "Cordon", "ClusterOps"]
showToc: true
summary: "Kubernetes 本番クラスタにおけるノードの安全な縮小・退役手順を詳細に解説。kubectl drain / cordon を用いた DaemonSet 除外・安全な Pod 立ち退き（Eviction）、unschedulable テイントの付与と uncordon によるノード復旧、さらに kubelet 停止、kubeadm reset による環境初期化、データ消去およびマスターからの node リソース完全削除まで網羅。"
---

# K8S ノードライフサイクルとクラスタ縮小実践解説：Node Cordon/Drain による安全な Pod 立ち退きとノード完全退役・安全削除手順

---

## K8S クラスタ縮小・ノード退役フロー

1. 退役対象ノード上の Pod を他ノードへ退去（Evict）させる
2. 対象ノードの kubelet サービスを停止する
3. 対象ノードの環境をリセット（kubelet / kubeadm / docker をアンインストール）する
4. 重要データをバックアップし、情報漏洩を防ぐためディスクを消去する
5. master ノードから該当 node リソースを削除する

---

## 1. 立ち退き前のリソース状態確認

まず検証用 Pod 群を作成し、本番環境の負荷をシミュレートします：

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

5 つの Pod が worker01（3個）と worker02（2個）に分散配置されます

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

---

## 2. 立ち退き開始 —— kubectl drain

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

`--ignore-daemonsets` —— DaemonSet 管理の Pod（flannel / kube-proxy / speaker）をスキップ（これらは立ち退き対象外となります）

`--delete-emptydir-data` —— emptyDir ボリュームを使用している Pod を削除

---

## 3. 立ち退き後の Pod 状態確認

```bash
[root@master ~]# kubectl get pods -o wide | grep deploy-stress
deploy-stress-5cfb965cf9-69g64   1/1   Running   0   101s   10.100.1.38   worker01
deploy-stress-5cfb965cf9-7bh79   1/1   Running   0   101s   10.100.1.36   worker01
deploy-stress-5cfb965cf9-bmg9r   1/1   Running   0   89s    10.100.1.41   worker01
deploy-stress-5cfb965cf9-ft9zr   1/1   Running   0   48s    10.100.1.43   worker01
deploy-stress-5cfb965cf9-p6zcr   1/1   Running   0   48s    10.100.1.42   worker01
```

全 5 つの Pod が worker01 に移行 —— 元の worker02 にあった 2 つの Pod が退去・再スケジュールされ、新しい Pod（ft9zr, p6zcr）が古い Pod（kp2bh, wg6vd）に代わって起動しました。

立ち退き後は全 Pod が単一ノードに集中するため、当該ノードのリソースが不足すると一部の Pod が Pending になる可能性があります。本番環境では残存ノードに十分なリソース容量を確保してください。

---

## 4. ノード情報の確認

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                     ROLES                  AGE    VERSION
master     Ready                      control-plane,master   3d8h   v1.23.17
worker01   Ready                      <none>                 3d8h   v1.23.17
worker02   Ready,SchedulingDisabled   <none>                 3d8h   v1.23.17
```

worker02 が `SchedulingDisabled` に変化 —— drain により自動的に cordon が実行され、ノードにスケジュール不可フラグが付与されました

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

worker02 に自動的に `node.kubernetes.io/unschedulable:NoSchedule` テイントが付与され、`Unschedulable: true` となっています

---

## 5. ノードの復旧 —— kubectl uncordon

```bash
[root@master ~]# kubectl uncordon worker02
node/worker02 uncordoned

[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

`uncordon` により unschedulable テイントが解除され、ノードは通常のスケジュール可能状態に復帰します

---

## 6. 破壊的作業ステップ（完全退役）

### 6.1 退役ノードの kubelet 停止

```bash
[root@worker02 ~]# systemctl disable --now kubelet
Removed /etc/systemd/system/multi-user.target.wants/kubelet.service.
```

### 6.2 master 側で NotReady として認識

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                        ROLES                  AGE   VERSION
master     Ready                         control-plane,master   3d    v1.23.17
worker01   Ready                         <none>                 3d    v1.23.17
worker02   NotReady,SchedulingDisabled   <none>                 3d    v1.23.17
```

### 6.3 退役ノードで kubeadm reset を実行

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

`kubeadm reset` では CNI 設定（`/etc/cni/net.d`）、iptables ルール、および kubectl 設定ファイルは消去されないため、これらは手動でクリーンアップする必要があります

### 6.4 master から退役ノードを削除

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
