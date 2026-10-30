---
title: "K8S Core Resource Management and Pod Basics in Practice: Manifests, Multi-Container Pods, Labels and hostNetwork"
date: 2026-10-30T16:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article walks through K8S core resource management and Pod basics. It starts with a cheat sheet of common resource short names and a kubectl api-resources overview, then covers routine health checks (worker node list, master components, the flannel interface and the cni0/flannel.1 virtual interfaces on each node). Next it writes single-container and multi-container Pod manifests, compares kubectl create with apply, and uses kubectl exec to enter a specific container. It then explains the difference between the declarative and imperative APIs, label create/read/update/delete plus filtering and deleting resources by label, and kubectl describe for resource details. Finally it demonstrates hostNetwork mode so a Pod shares the host network, and cleans up the lab environment."
---

# K8S Core Resource Management and Pod Basics in Practice: Manifests, Multi-Container Pods, Labels and hostNetwork

## 1. Overview of Common K8S Resources

Common K8S resource types:

| Short   | Full name                     | Description               |
| ------ | ------------------------ | ------------------ |
| po     | pods                     | A group of containers, at least one |
| svc    | services                 | Pod service proxy       |
| deploy | deployments              | Stateless service deployment     |
| ds     | daemonsets               | One Pod per node     |
| sts    | statefulsets             | Stateful service         |
| rs     | replicasets              | Replica controller (lightweight) |
| cm     | configmaps               | Configuration files           |
| ns     | namespaces               | Resource isolation           |
| hpa    | horizontalpodautoscalers | Horizontal autoscaling       |
| ing    | ingresses                | Layer-7 proxy           |
| pv/pvc | persistentvolumes/claims | Persistent storage           |

### kubectl api-resources

```bash
[root@master ~]# kubectl api-resources | wc -l
57

[root@master ~]# kubectl api-resources
# Output: 57 resource types (pods, services, deployments, daemonsets, ingresses, ...)
```

---

## 2. Routine K8S Health Checks

### 1. Check the Worker Node List

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   148m   v1.23.17
worker01   Ready    <none>                 147m   v1.23.17
worker02   Ready    <none>                 147m   v1.23.17
```

### 2. Check the master Components

```bash
[root@master ~]# kubectl get cs
Warning: v1 ComponentStatus is deprecated in v1.19+
NAME                 STATUS    MESSAGE                         ERROR
controller-manager   Healthy   ok
etcd-0               Healthy   {"health":"true","reason":""}
scheduler            Healthy   ok
```

### 3. Check the flannel Interface

```bash
[root@master ~]# kubectl get pods -n kube-flannel -o wide
NAME                    READY   STATUS    RESTARTS   AGE    IP           NODE
kube-flannel-ds-8rmk2   1/1     Running   0          136m   11.0.1.233   worker02
kube-flannel-ds-n6wcv   1/1     Running   0          143m   11.0.1.232   worker01
kube-flannel-ds-tw8f6   1/1     Running   0          143m   11.0.1.231   master
```

### 4. Check the cni0 and flannel.1 Virtual Interfaces on Each Node

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

The cni0 and flannel.1 subnets match across all three nodes

---

## 3. Writing Pod Manifests, Creating and Deleting

### 1. Create the Resource Directory

```bash
[root@master ~]# mkdir -pv /dawn/manifests/pods
[root@master ~]# cd /dawn/manifests/pods
```

### 2. Write a Single-Container Pod YAML

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

### 3. kubectl create vs apply Compared

```bash
# create: create the resource
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

# create again -- error AlreadyExists
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
Error from server (AlreadyExists): error when creating "01-pods-xiuxian-single.yaml": pods "xiuxian-v1" already exists

# apply -- no error, prints unchanged/configured
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 configured

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 unchanged
```

In production always use `kubectl apply`: a new resource reports `created`, while an existing one reports `configured`/`unchanged` depending on whether anything changed.

### 4. List Pods

```bash
[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       NOMINATED NODE   READINESS GATES
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   <none>           <none>
```

### 5. Delete Resources

```bash
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```

### 6. Recreate

```bash
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       ...
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   ...
```

---

## 4. Multi-Container Pods and kubectl exec

### 1. Preparing the alpine Image

```bash
[root@master ~]# docker pull alpine:3.20.2
3.20.2: Pulling from library/alpine
Digest: sha256:0a4eaa0eecf5f8c050e5bba433f58c052be7587ee8af3e8b3910ef9ab5fbe9f5
Status: Downloaded newer image for alpine:3.20.2

[root@master ~]# docker tag alpine:3.20.2 harbor:443/dawn-linux/alpine:3.20.2
[root@master ~]# docker push harbor:443/dawn-linux/alpine:3.20.2
3.20.2: digest: sha256:eddacbc7e24bf8799a4ed3cdcfa50d4b88a323695ad80f317b6629883b2c2a78 size: 528
```

### 2. Multi-Container Pod YAML

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

READY shows `2/2` — both containers are ready.

### 3. Running Commands Inside a Container with kubectl exec

```bash
# Single-container Pod, exec directly
[root@master pods]# kubectl exec xiuxian-v1 -- ifconfig
eth0      Link encap:Ethernet  HWaddr D2:D6:0C:13:89:D9
          inet addr:10.100.1.6  Bcast:10.100.1.255  Mask:255.255.255.0

# Multi-container Pod, without -c it defaults to container 0
[root@master pods]# kubectl exec xiuxian-v2 -- hostname -i
Defaulted container "xiuxian" out of: xiuxian, alpine
10.100.1.7

# Specify the container name
[root@master pods]# kubectl exec xiuxian-v2 -c alpine -- hostname -i
10.100.1.7
```

Containers in the same Pod share the network namespace, so they have the same IP

---

## 5. Declarative API vs Imperative API

### Creating a Pod Imperatively

```bash
[root@master pods]# kubectl run xixi --image=harbor:443/dawn/apps:v2
pod/xixi created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01
xiuxian-v2   2/2     Running   0          30s   10.100.1.7   worker01
xixi         1/1     Running   0          5s    10.100.2.4   worker02
```

### Declarative vs Imperative Queries

```bash
# Declarative: filter through the manifest file
[root@master pods]# kubectl get -f 01-pods-xiuxian-single.yaml -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01

# Imperative: view globally
[root@master pods]# kubectl get pods -o wide --show-labels
NAME         READY   STATUS    ...  LABELS
xiuxian-v1   1/1     Running   ...  <none>
xiuxian-v2   2/2     Running   ...  <none>
xixi         1/1     Running   ...  run=xixi
```

---

## 6. Label Management

### 1. Adding Labels Imperatively

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

### 2. Removing Labels Imperatively (append `-` to the label name)

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

### 3. Modifying Labels Imperatively

```bash
[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml class=computer01 --overwrite
pod/xiuxian-v1 labeled
```

### 4. Imperative Labels Are Temporary

```bash
# Delete and recreate -- labels are lost
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  <none>        ← labels are gone!
xixi         ...  run=xixi
```

### 5. Declarative Labels (declared in YAML, permanent)

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

### 6. Filtering Resources by Label

```bash
# Pods that have the class label
[root@master pods]# kubectl get pods -l class --show-labels
NAME             READY   STATUS    ...  LABELS
xiuxian-labels   2/2     Running   ...  class=computer01,school=czu

# Exact match on class=computer01
[root@master pods]# kubectl get pods -l class=computer01 --show-labels

# run label
[root@master pods]# kubectl get pods -l run --show-labels
NAME   READY   STATUS    ...  LABELS
xixi   1/1     Running   ...  run=xixi
```

### 7. Deleting by Label

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

## 7. Inspecting Resource Details with kubectl describe

### 1. Pod Details

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

### 2. Node Details

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

### 3. Filtering describe by Label

```bash
[root@master pods]# kubectl describe pods -l run=xixi
Name:         xixi
...
```

---

## 8. hostNetwork Mode (Pod Shares the Host Network)

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

With `hostNetwork: true` the Pod IP is `11.0.1.232` (the physical IP of host worker01), while a normal Pod gets `10.100.1.x` (the Pod network).

```bash
# curling the host IP reaches nginx inside the hostNetwork Pod
[root@master pods]# curl -s 11.0.1.232 | head -5
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v1</title>
```

---

## 9. Cleaning Up

```bash
[root@master pods]# kubectl delete pods --all
pod "xiuxian-hostnetwork" deleted
pod "xiuxian-v1" deleted
pod "xiuxian-v2" deleted
pod "xixi" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```
