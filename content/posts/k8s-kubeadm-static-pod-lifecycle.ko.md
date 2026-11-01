---
title: "K8S 정적 Pod 메커니즘 실전 분석: kubeadm 부트스트랩 원리부터 컨트롤 플레인 장애 복구까지"
date: 2026-11-01T20:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "kubelet", "kubeadm", "StaticPod"]
showToc: true
summary: "Kubernetes 정적 Pod(Static Pod) 작동 메커니즘과 kubelet 데몬 로직을 심층 분석하고, kubeadm 이 컨트롤 플레인 4대 핵심 컴포넌트를 부트스트랩하는 원리를 파헤칩니다. 커스텀 정적 Pod 배포를 통한 자동 자가 치유 검증부터 apiserver 장애 주입 및 신속 복구 실전까지 다룹니다."
---

# K8S 정적 Pod 메커니즘 실전 분석: kubeadm 부트스트랩 원리부터 컨트롤 플레인 장애 복구까지

## 정적 Pod: kubeadm 의 기동 원리

### 1. 역할

정적 Pod 는 apiserver 를 거치지 않으며, Pod 매니페스트를 kubelet 이 인식하는 디렉터리에 넣기만 하면 직접 기동됩니다. kubeadm 으로 배포되는 4대 핵심 컴포넌트가 바로 이 방식으로 구현됩니다.

### 2. kubelet 정적 Pod 디렉터리

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

### 3. 커스텀 정적 Pod 사례

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

kubectl 로는 삭제되지 않으며, 삭제하더라도 즉시 자동 재성성됩니다:

```bash
[root@master ~]# kubectl delete pod xiuxian-v1-master
pod "xiuxian-v1-master" deleted

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP           NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          3s    10.100.0.10  master      <none>           <none>
```

### 4. 멀티 노드 배포 및 삭제

```bash
[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker01:/etc/kubernetes/manifests/

[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker02:/etc/kubernetes/manifests/

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE     IP            NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          2m46s   10.100.0.10   master      <none>           <none>
xiuxian-v1-worker01  1/1     Running   0          12s     10.100.1.137  worker01    <none>           <none>
xiuxian-v1-worker02  1/1     Running   0          4s      10.100.2.133  worker02    <none>           <none>
```

삭제 시에는 각 노드에서 해당 파일을 rm 하여 제거하기만 하면 됩니다.

### 5. apiserver 파일 삭제를 통한 클러스터 장애 시연

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

kubeadm 방식으로 배포된 K8S 클러스터에서는 반드시 kubelet 의 부팅 시 자동 실행 설정이 필수적이며, 시작 후 kubelet 이 정적 Pod 리소스를 자동으로 로드합니다.
