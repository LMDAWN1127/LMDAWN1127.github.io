---
title: "K8S Pod 端口暴露与 SVC 多端口映射实战：hostPort、多端口映射与 targetPort 名称匹配"
date: 2026-10-31T18:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文讲 K8S 里 Pod 端口暴露与 SVC 多端口映射两件事。前半段用 hostPort 把容器 80 端口直接映射到 Pod 所在节点的 8888，外部绕过 SVC 直达容器，Windows 上实测访问成功，并对比 hostPort 与 NodePort 的差异（hostPort 只在 Pod 所在节点生效、Pod 漂移地址跟着变；NodePort 在所有节点开同一端口、漂移不影响访问）；后半段写一个同时暴露 80/TCP 与 53/UDP 的 Pod，配套 SVC 做多端口映射，观察 PORT(S) 列与 describe 的 TargetPort/Endpoints，最后用 kubectl patch 把 targetPort 改成按端口名称匹配，验证即便容器端口号变化，只要名称不变 SVC 仍能自动跟踪。"
---

# K8S Pod 端口暴露与 SVC 多端口映射实战：hostPort、多端口映射与 targetPort 名称匹配

## 一、Pod 的端口暴露实现服务访问（hostPort）

### 1.1 编写资源清单

```bash
[root@master pods]# cat 15-pods-xiuxian-ports.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-ports
  namespace: default
spec:
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
    # 配置Pod的端口映射
    ports:
      # 指定暴露容器端口
    - containerPort: 80
      # 指定宿主机的IP地址
      hostIP: 0.0.0.0
      # 指定宿主机的端口号
      hostPort: 8888
      # 给端口起别名，要求唯一
      name: web
      # 指定容器端口的协议，有效值: UDP,TCP,SCTP，默认值为TCP
      protocol: TCP
    - containerPort: 53
      name: dns
      protocol: UDP
```

### 1.2 创建资源，查看调度到哪个节点

```bash
[root@master pods]# kubectl apply -f 15-pods-xiuxian-ports.yaml 
pod/xiuxian-ports created
[root@master pods]# kubectl get pods -o wide
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-ports   1/1     Running   0          9s    10.100.2.56   worker02   <none>           <none>
```

### 1.3 Windows 访问测试

![image-20261031164202786](/images/k8s-pod-ports-svc-multiport/image-20261031164202786.png)

hostPort生效，容器 80 端口被映射到worker02的 8888，外部直达容器，不经过 SVC



hostPort vs NodePort： hostPort 是容器端口到单节点端口的直接映射，只在 Pod 所在节点生效，Pod 漂移后地址跟着变；NodePort 是Service到所有节点同端口，Pod 漂移不影响访问。生产推荐走 SVC/NodePort，hostPort 适合调试。

---

## 二、SVC 的多端口映射

### 2.1 编写资源清单

```bash
[root@master pods]# cat 16-pods-xiuxian-ports-svc.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-ports-svc
  labels:
    apps: xiuxian
spec:
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
    ports:
    - containerPort: 80
      # 这个名称是用来标识服务的，可以是业务名称
      name: web
      protocol: TCP
    - containerPort: 53
      name: dns
      protocol: UDP

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    apps: xiuxian
  ports:
    # 建议svc的端口名称要和后端的端口名称保持一致。
  - port: 80
    # 指定的是Pod的端口名称，当Pod的containerPort修改，并不会响应关联。
    name: web
  - port: 53
    name: dns
    protocol: UDP
```

### 2.2 创建资源并观察

```bash
[root@master pods]# kubectl apply -f 16-pods-xiuxian-ports-svc.yaml 
pod/xiuxian-ports-svc created
service/xiuxian-svc created
[root@master pods]# 
[root@master pods]# kubectl get pods,svc -o wide
NAME                    READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
pod/xiuxian-ports-svc   1/1     Running   0          6s      10.100.1.59   worker01   <none>           <none>

NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)         AGE   SELECTOR
service/kubernetes    ClusterIP   10.200.0.1       <none>        443/TCP         19h   <none>
service/xiuxian-svc   ClusterIP   10.200.166.210   <none>        80/TCP,53/UDP   6s    apps=xiuxian
```

SVC 的`PORT(S)`列同时显示 `80/TCP,53/UDP`——多端口映射生效

```bash
[root@master pods]# kubectl describe svc xiuxian-svc
Name:              xiuxian-svc
Namespace:         default
Selector:          apps: xiuxian
Type:              ClusterIP
IP:                10.200.166.210
Port:              web  80/TCP
TargetPort:        80/TCP
Endpoints:         10.100.1.59:80
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.1.59:53
Session Affinity:  None
```

```bash
[root@master pods]# curl -s http://10.200.166.210 | grep -oE '<title>[^<]*</title>'
<title>DAWN apps v1</title>
```

### 2.3 targetPort 按名称匹配

`targetPort: web`（按名称而非数字匹配）。给 SVC 打个补丁演示：

```bash
[root@master pods]# kubectl patch svc xiuxian-svc --type='json' \
  -p '[{"op":"add","path":"/spec/ports/0/targetPort","value":"web"}]'
service/xiuxian-svc patched
[root@master pods]# kubectl describe svc xiuxian-svc | grep -E 'Port:|TargetPort:|Endpoints:'
Port:              web  80/TCP
TargetPort:        web/TCP          # 按名称匹配生效
Endpoints:         10.100.1.59:80
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.1.59:53
[root@master pods]# curl -s http://10.200.166.210 | grep -oE '<title>[^<]*</title>'
<title>DAWN apps v1</title>         # 访问不受影响
```

`targetPort: web` 按名称匹配，即使容器端口号变了，只要名称 `web` 不变，SVC 自动跟踪，端口名称解耦了容器端口号和 SVC 配置