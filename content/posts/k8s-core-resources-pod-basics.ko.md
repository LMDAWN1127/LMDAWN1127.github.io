---
title: "K8S 핵심 리소스 관리와 Pod 기초 실전: 매니페스트, 멀티 컨테이너 Pod, 라벨과 hostNetwork"
date: 2026-10-30T16:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 K8S 핵심 리소스 관리와 Pod 기초 작업을 체계적으로 정리한다. 먼저 자주 쓰는 리소스 약어 치트시트와 kubectl api-resources 로 클러스터 리소스를 훑어보고, 이어 일상 기본 점검（worker 노드 목록, master 컴포넌트, flannel 인터페이스, 각 노드의 cni0/flannel.1 가상 인터페이스）을 수행한다. 다음으로 단일 컨테이너 Pod 와 멀티 컨테이너 Pod 의 매니페스트 YAML 을 작성하고, kubectl create 와 apply 의 차이를 비교한 뒤 kubectl exec 로 특정 컨테이너에 들어간다. 또한 선언형 API 와 명령형 API 의 차이, 라벨의 추가/삭제/수정/조회와 라벨 기준 리소스 필터링 및 삭제, kubectl describe 로 상세 정보 확인을 다루고, 마지막으로 hostNetwork 모드로 Pod 가 호스트 네트워크를 공유하는 것을 시연한 뒤 실습 환경을 정리한다."
---

# K8S 핵심 리소스 관리와 Pod 기초 실전: 매니페스트, 멀티 컨테이너 Pod, 라벨과 hostNetwork

## 1. K8S 자주 쓰는 리소스 개요

K8S 에서 자주 쓰는 리소스 종류:

| 약어   | 전체 이름                     | 설명               |
| ------ | ------------------------ | ------------------ |
| po     | pods                     | 컨테이너 묶음, 최소 1개 |
| svc    | services                 | Pod 서비스 프록시       |
| deploy | deployments              | 무상태 서비스 배포     |
| ds     | daemonsets               | 노드당 하나의 Pod     |
| sts    | statefulsets             | 상태 유지 서비스         |
| rs     | replicasets              | 레플리카 컨트롤러（경량） |
| cm     | configmaps               | 설정 파일           |
| ns     | namespaces               | 리소스 격리           |
| hpa    | horizontalpodautoscalers | 수평 오토스케일링       |
| ing    | ingresses                | 7계층 프록시           |
| pv/pvc | persistentvolumes/claims | 영구 스토리지           |

### kubectl api-resources

```bash
[root@master ~]# kubectl api-resources | wc -l
57

[root@master ~]# kubectl api-resources
# 57 개 리소스 종류 출력（pods, services, deployments, daemonsets, ingresses, ...）
```

---

## 2. K8S 일상 기본 점검

### 1. worker 노드 목록 확인

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   148m   v1.23.17
worker01   Ready    <none>                 147m   v1.23.17
worker02   Ready    <none>                 147m   v1.23.17
```

### 2. master 컴포넌트 확인

```bash
[root@master ~]# kubectl get cs
Warning: v1 ComponentStatus is deprecated in v1.19+
NAME                 STATUS    MESSAGE                         ERROR
controller-manager   Healthy   ok
etcd-0               Healthy   {"health":"true","reason":""}
scheduler            Healthy   ok
```

### 3. flannel 인터페이스 확인

```bash
[root@master ~]# kubectl get pods -n kube-flannel -o wide
NAME                    READY   STATUS    RESTARTS   AGE    IP           NODE
kube-flannel-ds-8rmk2   1/1     Running   0          136m   11.0.1.233   worker02
kube-flannel-ds-n6wcv   1/1     Running   0          143m   11.0.1.232   worker01
kube-flannel-ds-tw8f6   1/1     Running   0          143m   11.0.1.231   master
```

### 4. 각 노드의 cni0 및 flannel.1 가상 인터페이스 확인

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

세 노드의 cni0 와 flannel.1 대역이 일치

---

## 3. Pod 리소스 매니페스트 작성과 생성/삭제

### 1. 리소스 디렉터리 생성

```bash
[root@master ~]# mkdir -pv /dawn/manifests/pods
[root@master ~]# cd /dawn/manifests/pods
```

### 2. 단일 컨테이너 Pod YAML 작성

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

### 3. kubectl create vs apply 비교

```bash
# create 로 리소스 생성
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

# 다시 create —— AlreadyExists 오류
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
Error from server (AlreadyExists): error when creating "01-pods-xiuxian-single.yaml": pods "xiuxian-v1" already exists

# apply —— 오류 없이 unchanged/configured 출력
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 configured

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 unchanged
```

운영 환경에서는 항상 `kubectl apply` 를 쓴다. 새 리소스는 `created`, 이미 있는 리소스는 변경 여부에 따라 `configured`/`unchanged` 로 표시된다.

### 4. Pod 목록 조회

```bash
[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       NOMINATED NODE   READINESS GATES
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   <none>           <none>
```

### 5. 리소스 삭제

```bash
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```

### 6. 다시 생성

```bash
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       ...
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   ...
```

---

## 4. 멀티 컨테이너 Pod 와 kubectl exec

### 1. alpine 이미지 준비

```bash
[root@master ~]# docker pull alpine:3.20.2
3.20.2: Pulling from library/alpine
Digest: sha256:0a4eaa0eecf5f8c050e5bba433f58c052be7587ee8af3e8b3910ef9ab5fbe9f5
Status: Downloaded newer image for alpine:3.20.2

[root@master ~]# docker tag alpine:3.20.2 harbor:443/dawn-linux/alpine:3.20.2
[root@master ~]# docker push harbor:443/dawn-linux/alpine:3.20.2
3.20.2: digest: sha256:eddacbc7e24bf8799a4ed3cdcfa50d4b88a323695ad80f317b6629883b2c2a78 size: 528
```

### 2. 멀티 컨테이너 Pod YAML

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

READY 가 `2/2` —— 두 컨테이너 모두 준비 완료.

### 3. kubectl exec 으로 컨테이너에서 명령 실행

```bash
# 단일 컨테이너 Pod, 바로 exec
[root@master pods]# kubectl exec xiuxian-v1 -- ifconfig
eth0      Link encap:Ethernet  HWaddr D2:D6:0C:13:89:D9
          inet addr:10.100.1.6  Bcast:10.100.1.255  Mask:255.255.255.0

# 멀티 컨테이너 Pod, -c 미지정 시 0 번째 컨테이너
[root@master pods]# kubectl exec xiuxian-v2 -- hostname -i
Defaulted container "xiuxian" out of: xiuxian, alpine
10.100.1.7

# 컨테이너 이름 지정
[root@master pods]# kubectl exec xiuxian-v2 -c alpine -- hostname -i
10.100.1.7
```

같은 Pod 안의 여러 컨테이너는 네트워크 네임스페이스를 공유하므로 IP 가 같다

---

## 5. 선언형 API vs 명령형 API

### 명령형으로 Pod 생성

```bash
[root@master pods]# kubectl run xixi --image=harbor:443/dawn/apps:v2
pod/xixi created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01
xiuxian-v2   2/2     Running   0          30s   10.100.1.7   worker01
xixi         1/1     Running   0          5s    10.100.2.4   worker02
```

### 선언형 조회 vs 명령형 조회

```bash
# 선언형: 매니페스트 파일로 필터링
[root@master pods]# kubectl get -f 01-pods-xiuxian-single.yaml -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01

# 명령형: 전체 조회
[root@master pods]# kubectl get pods -o wide --show-labels
NAME         READY   STATUS    ...  LABELS
xiuxian-v1   1/1     Running   ...  <none>
xiuxian-v2   2/2     Running   ...  <none>
xixi         1/1     Running   ...  run=xixi
```

---

## 6. 라벨 관리

### 1. 명령형으로 라벨 추가

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

### 2. 명령형으로 라벨 삭제（라벨 이름 뒤에 `-`）

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

### 3. 명령형으로 라벨 수정

```bash
[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml class=computer01 --overwrite
pod/xiuxian-v1 labeled
```

### 4. 명령형 라벨은 임시

```bash
# 삭제 후 재생성 —— 라벨 소실
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  <none>        ← 라벨이 사라졌다!
xixi         ...  run=xixi
```

### 5. 선언형 라벨（YAML 에 작성, 영구 적용）

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

### 6. 라벨로 리소스 필터링

```bash
# class 라벨이 있는 Pod
[root@master pods]# kubectl get pods -l class --show-labels
NAME             READY   STATUS    ...  LABELS
xiuxian-labels   2/2     Running   ...  class=computer01,school=czu

# class=computer01 정확 매칭
[root@master pods]# kubectl get pods -l class=computer01 --show-labels

# run 라벨
[root@master pods]# kubectl get pods -l run --show-labels
NAME   READY   STATUS    ...  LABELS
xixi   1/1     Running   ...  run=xixi
```

### 7. 라벨 기준 삭제

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

## 7. kubectl describe 로 리소스 상세 정보 확인

### 1. Pod 상세 정보 확인

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

### 2. 노드 상세 정보 확인

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

### 3. 라벨로 describe 필터링

```bash
[root@master pods]# kubectl describe pods -l run=xixi
Name:         xixi
...
```

---

## 8. hostNetwork 모드（Pod 가 호스트 네트워크 공유）

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

`hostNetwork: true` 인 Pod 의 IP 는 `11.0.1.232`（호스트 worker01 의 물리 IP）이고, 일반 Pod 의 IP 는 `10.100.1.x`（Pod 네트워크）이다.

```bash
# 호스트 IP 로 curl 하면 hostNetwork Pod 안의 nginx 에 접근 가능
[root@master pods]# curl -s 11.0.1.232 | head -5
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v1</title>
```

---

## 9. 환경 정리

```bash
[root@master pods]# kubectl delete pods --all
pod "xiuxian-hostnetwork" deleted
pod "xiuxian-v1" deleted
pod "xiuxian-v2" deleted
pod "xixi" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```
