---
title: "K8S 노드 수명 주기와 클러스터 축소 실전 완벽 분석: Node Cordon/Drain 우아한 파드 퇴거와 노드 영구 폐기 절차"
date: 2026-11-02T21:35:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Node", "Drain", "Cordon", "ClusterOps"]
showToc: true
summary: "Kubernetes 프로덕션 클러스터의 안전한 노드 축소 및 폐기 워크플로 완벽 가이드. kubectl drain 및 cordon을 활용한 DaemonSet 필터링 기반 안전한 파드 퇴거(Evict), unschedulable 테인트 설정과 uncordon 노드 상태 복구, 나아가 kubelet 중지, kubeadm reset 환경 초기화, 데이터 완전 삭제 및 마스터에서의 node 리소스 최종 삭제 파괴적 단계까지 전 과정을 상세히 다룹니다."
---

# K8S 노드 수명 주기와 클러스터 축소 실전 완벽 분석: Node Cordon/Drain 우아한 파드 퇴거와 노드 영구 폐기 절차

---

## K8S 클러스터 노드 축소 절차

1. 퇴역시킬 노드의 Pod를 다른 노드로 퇴거(Evict)
2. 퇴역 노드의 kubelet 서비스 중지
3. 퇴역 노드 환경 초기화(kubelet / kubeadm / docker 삭제)
4. 중요 데이터 백업 후 데이터 유출 방지를 위한 디스크 초기화
5. master 노드에서 node 리소스 삭제

---

## 1. 퇴거 전 리소스 상태 확인

먼저 프로덕션 워크로드를 시뮬레이션하기 위해 다수의 Pod를 생성합니다:

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

5개의 Pod가 worker01(3개)과 worker02(2개)에 분산됩니다

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

---

## 2. 퇴거 시작 —— kubectl drain

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

`--ignore-daemonsets` —— DaemonSet 관리 Pod(flannel / kube-proxy / speaker) 건너뛰기(이들은 퇴거 영향 없음)

`--delete-emptydir-data` —— emptyDir 볼륨을 사용하는 Pod 삭제

---

## 3. 퇴거 후 Pod 상태 확인

```bash
[root@master ~]# kubectl get pods -o wide | grep deploy-stress
deploy-stress-5cfb965cf9-69g64   1/1   Running   0   101s   10.100.1.38   worker01
deploy-stress-5cfb965cf9-7bh79   1/1   Running   0   101s   10.100.1.36   worker01
deploy-stress-5cfb965cf9-bmg9r   1/1   Running   0   89s    10.100.1.41   worker01
deploy-stress-5cfb965cf9-ft9zr   1/1   Running   0   48s    10.100.1.43   worker01
deploy-stress-5cfb965cf9-p6zcr   1/1   Running   0   48s    10.100.1.42   worker01
```

5개의 Pod가 모두 worker01로 이전됨 —— 기존 worker02의 2개 Pod가 퇴거 및 재스케줄링되어 신규 Pod(ft9zr, p6zcr)가 구형 Pod(kp2bh, wg6vd)를 대체했습니다.

퇴거 후 모든 Pod가 단일 노드에 집중되므로 해당 노드의 리소스가 부족할 경우 일부 Pod가 Pending 상태가 될 수 있습니다. 운영 환경에서는 잔여 노드에 충분한 리소스 용량이 있는지 반드시 확인해야 합니다.

---

## 4. 노드 상태 정보 확인

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                     ROLES                  AGE    VERSION
master     Ready                      control-plane,master   3d8h   v1.23.17
worker01   Ready                      <none>                 3d8h   v1.23.17
worker02   Ready,SchedulingDisabled   <none>                 3d8h   v1.23.17
```

worker02가 `SchedulingDisabled` 상태로 변경됨 —— drain이 자동으로 cordon을 수행하여 노드에 스케줄링 불가 플래그를 설정함

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

worker02에 `node.kubernetes.io/unschedulable:NoSchedule` 테인트가 자동으로 추가되고 `Unschedulable: true`로 설정됨

---

## 5. 노드 복구 —— kubectl uncordon

```bash
[root@master ~]# kubectl uncordon worker02
node/worker02 uncordoned

[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   3d8h   v1.23.17
worker01   Ready    <none>                 3d8h   v1.23.17
worker02   Ready    <none>                 3d8h   v1.23.17
```

`uncordon`을 통해 unschedulable 테인트를 제거하고 노드를 정상적인 스케줄 가능 상태로 복구

---

## 6. 파괴적 단계(완전 폐기)

### 6.1 퇴역 대상 노드의 kubelet 중지

```bash
[root@worker02 ~]# systemctl disable --now kubelet
Removed /etc/systemd/system/multi-user.target.wants/kubelet.service.
```

### 6.2 master 측에서 NotReady 상태 확인

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS                        ROLES                  AGE   VERSION
master     Ready                         control-plane,master   3d    v1.23.17
worker01   Ready                         <none>                 3d    v1.23.17
worker02   NotReady,SchedulingDisabled   <none>                 3d    v1.23.17
```

### 6.3 퇴역 대상 노드에서 kubeadm reset 실행

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

`kubeadm reset`은 CNI 설정(`/etc/cni/net.d`), iptables 규칙 및 kubectl 설정 파일을 초기화하지 않으므로 수동으로 정리해야 합니다

### 6.4 master에서 퇴역 대상 노드 삭제

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
