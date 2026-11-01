---
title: "K8S Service 类型全解与外部服务接入：MetalLB 落地、Endpoints 映射及 NodePort 范围定制"
date: 2026-11-01T20:00:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "MetalLB", "Endpoints", "ExternalName", "NodePort"]
showToc: true
summary: "全景解析 Kubernetes 四种 Service 类型应用场景，实战演练私有机房部署 MetalLB 赋予 LoadBalancer 外部虚拟 IP 与 NodePort 固定访问，对比 ExternalName 与手工 Endpoints 映射集群外部服务的技术选型，并深入定制 apiserver 静态 Pod 扩展 NodePort 端口范围。"
---

# K8S Service 类型全解与外部服务接入：MetalLB 落地、Endpoints 映射及 NodePort 范围定制

## 一、Service 的四种类型

| 类型             | 访问范围                 | 应用场景                             |
| ---------------- | ------------------------ | ------------------------------------ |
| **ClusterIP**    | 仅集群内部               | 微服务相互访问（默认类型）           |
| **NodePort**     | 集群外部（节点 IP:端口） | 自建机房/测试环境暴露服务            |
| **LoadBalancer** | 集群外部（虚拟 IP）      | 云环境对接 SLB，或自建机房用 MetalLB |
| **ExternalName** | 集群外部（CNAME 域名）   | 代理的服务不在集群内，而在集群外     |

---

## 二、MetalLB：让 LoadBalancer 落地自建机房

云厂商的 LoadBalancer 由云产品提供；自建机房没有这个产品，用 **MetalLB** 补齐——可以把它理解为“自建机房的 SLB”。

### 2.1 部署 MetalLB

```bash
[root@master 01-metallb]# wget https://raw.githubusercontent.com/metallb/metallb/v0.14.8/config/manifests/metallb-native.yaml

[root@master 01-metallb]# kubectl apply -f metallb-native.yaml
namespace/metallb-system created
customresourcedefinition.apiextensions.k8s.io/ipaddresspools.metallb.io created
deployment.apps/controller created
daemonset.apps/speaker created
...

[root@master 01-metallb]# kubectl get pods -n metallb-system  -o wide
NAME                          READY   STATUS    RESTARTS   AGE   IP             NODE        NOMINATED NODE   READINESS GATES
controller-6679f7f994-kjmxl   1/1     Running   0          65s   10.100.2.131   worker02   <none>           <none>
speaker-nq69j                 1/1     Running   0          65s   11.0.1.232     worker01   <none>           <none>
speaker-smwml                 1/1     Running   0          65s   11.0.1.231     master     <none>           <none>
speaker-t2xpc                 1/1     Running   0          65s   11.0.1.233     worker02   <none>           <none>
```

### 2.2 创建地址池与 L2 通告

```bash
[root@master 01-metallb]# cat 02-metallb-ip-pool.yaml
```

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: dawn-pool
  namespace: metallb-system
spec:
  addresses:
  # 为MetalLB分配的IP地址（节点同网段空闲IP）
  - 11.0.1.150-11.0.1.180

---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: dawn-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - dawn-pool
```

```bash
[root@master 01-metallb]# kubectl apply -f 02-metallb-ip-pool.yaml
ipaddresspool.metallb.io/dawn-pool created
l2advertisement.metallb.io/dawn-l2 created
```

### 2.3 部署 LoadBalancer 测试服务

```bash
[root@master 01-metallb]# cat 03-deploy-svc-xiuxian.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian
spec:
  replicas: 3
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2

---
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-clusterip
spec:
  type: LoadBalancer
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

```bash
[root@master 01-metallb]# kubectl apply -f 03-deploy-svc-xiuxian.yaml
deployment.apps/deloy-xiuxian created
service/xiuxian-svc-clusterip created

[root@master 01-metallb]# kubectl get svc
NAME                    TYPE           CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
kubernetes              ClusterIP      10.200.0.1     <none>        443/TCP        7d
xiuxian-svc-clusterip   LoadBalancer   10.200.82.73   11.0.1.150    80:30091/TCP   2m4s
```

EXTERNAL-IP 自动分到地址池第一个 IP，同时分配 NodePort

### 2.4 两种访问方式

```bash
# 方式一：基于 MetalLB 提供的地址池访问
[root@master ~]# curl -s http://11.0.1.150/ | head -6
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v2</title>

# 方式二：基于 NodePort 访问
[root@master ~]# curl -s http://11.0.1.232:30091/ | grep -o 'DAWN apps v[0-9]'
DAWN apps v2
[root@master ~]# curl -s http://11.0.1.233:30091/ | grep -o 'DAWN apps v[0-9]'
DAWN apps v2
```

### 2.5 自定义 EXTERNAL-IP 与固定 NodePort

**方式一：资源注解**

```bash
[root@master 01-metallb]# cat 04-svc-EXTERNAL-IP.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-lb-ip
  # 配置资源注解
  annotations:
    # IP地址范围必须在定义的IP地址池中，否则无法分配
    metallb.universe.tf/loadBalancerIPs: 11.0.1.155
spec:
  type: LoadBalancer
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30080
```

**方式二：loadBalancerIP 字段**

```bash
[root@master 01-metallb]# cat 05-svc-EXTERNAL-IP.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-lb-ip-2
spec:
  type: LoadBalancer
  loadBalancerIP: 11.0.1.160
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30090
```

```bash
[root@master 01-metallb]# kubectl apply -f 04-svc-EXTERNAL-IP.yaml
service/xiuxian-svc-lb-ip created

[root@master 01-metallb]# kubectl apply -f 05-svc-EXTERNAL-IP.yaml
service/xiuxian-svc-lb-ip-2 created

[root@master 01-metallb]# kubectl get svc
NAME                    TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
kubernetes              ClusterIP      10.200.0.1       <none>        443/TCP        7d
xiuxian-svc-clusterip   LoadBalancer   10.200.82.73     11.0.1.150    80:30091/TCP   12m
xiuxian-svc-lb-ip       LoadBalancer   10.200.194.230   11.0.1.155    80:30080/TCP   4m35s
xiuxian-svc-lb-ip-2     LoadBalancer   10.200.125.153   11.0.1.160    80:30090/TCP   3s
```

两种方式都拿到指定 IP，NodePort 固定成功

**参考链接：**https://metallb.universe.tf/usage/

---

## 三、ExternalName：映射集群外部的服务

```bash
[root@master svc]# cat 03-ExternerName.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: svc-cnblog
spec:
  # svc类型
  type: ExternalName
  # 指定外部域名
  externalName: www.cnblog.com
  # externalName: www.baidu.com
```

```bash
[root@master svc]# kubectl apply -f 03-ExternerName.yaml
service/svc-cnblog created

[root@master svc]# kubectl get svc
NAME                    TYPE           CLUSTER-IP      EXTERNAL-IP      PORT(S)        AGE
kubernetes              ClusterIP      10.200.0.1      <none>           443/TCP        7d
svc-cnblog              ExternalName   <none>          www.cnblog.com   <none>         3s
xiuxian-svc-clusterip   LoadBalancer   10.200.82.73    11.0.1.150       80:30091/TCP   40m

[root@master svc]# kubectl exec -it deloy-xiuxian-5d9475944b-5brqf -- sh
/ # ping svc-cnblog
PING svc-cnblog (198.20.0.36): 56 data bytes
64 bytes from 198.20.0.36: seq=0 ttl=127 time=1.053 ms
64 bytes from 198.20.0.36: seq=1 ttl=127 time=1.014 ms
^C
--- svc-cnblog ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 1.014/1.541/2.558 ms
/ #
```

1. Pod 内 ping `svc-cnblog` 即等于 ping 外部域名；

2. ExternalName 映射的服务必须在公网有解析或在 CoreDNS 组件中有解析记录；

3. 如果我们想要映射的 K8S 集群外部服务没有公网域名解析，则需要手动修改 CoreDNS 的记录解析。

---

## 四、Endpoints：另一种映射外部服务的方式

### 4.1 什么是 Endpoints

每个 Service 都有一个同名 Endpoints（ep）资源存储后端真实 IP 记录（ExternalName 类型除外），删除 svc 会自动删除同名 ep

### 4.2 手工 ep 把外部地址收编进集群

```bash
[root@master ep]# cat 01-ep-harbor.yaml
```

```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: dawn-harbor
# 定义ep资源的子集
subsets:
  # 指定服务的IP地址
- addresses:
    # 定义IP地址
  - ip: 11.0.1.250
  # 指定服务的端口
  ports:
    # 指的服务的端口号
  - port: 80
    name: http
  - port: 443
    name: https

---

apiVersion: v1
kind: Service
metadata:
  name: dawn-harbor
spec:
  type: ClusterIP
  ports:
  - port: 80
    name: http
  - port: 443
    name: https
```

```bash
[root@master ep]# kubectl apply -f 01-ep-harbor.yaml
endpoints/dawn-harbor created
service/dawn-harbor created

[root@master ep]# kubectl get -f 01-ep-harbor.yaml
NAME                         ENDPOINTS                      AGE
endpoints/dawn-harbor   11.0.1.250:80,11.0.1.250:443   3s

NAME                       TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
service/dawn-harbor   ClusterIP   10.200.99.146   <none>        80/TCP,443/TCP   3s

[root@master ep]# kubectl describe ep dawn-harbor
Name:         dawn-harbor
Namespace:    default
Subsets:
  Addresses:          11.0.1.250
  NotReadyAddresses:  <none>
  Ports:
    Name   Port  Protocol
    ----   ----  --------
    http   80    TCP
    https  443   TCP

[root@master ep]# kubectl describe svc dawn-harbor
Name:              dawn-harbor
Selector:          <none>
Type:              ClusterIP
IP:                10.200.99.146
Port:              http  80/TCP
TargetPort:        80/TCP
Endpoints:         11.0.1.250:80
Port:              https  443/TCP
TargetPort:        443/TCP
Endpoints:         11.0.1.250:443
```

svc 不写 Selector、ep 手工指定外部 IP，Pod 内即可通过 `https://dawn-harbor/` 访问集群外的 Harbor

```bash
[root@master ~]# kubectl exec -it $(kubectl get pods -l apps=xiuxian -o jsonpath='{.items[0].metadata.name}') -- curl -k https://dawn-harbor/
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8"/>
        <title>Harbor</title>
        <base href="/"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link rel="icon" type="image/x-icon" href="favicon.ico?v=2"/>
    <link rel="stylesheet" href="styles.778b44f8c96802aa.css"></head>
    <body>
        <harbor-app>
            <div class="spinner spinner-lg app-loading app-loading-fixed">
                Loading...
            </div>
        </harbor-app>
    <script src="runtime.fecb31573c19a80b.js" type="module"></script><script src="polyfills.d52770ae19691b1f.js" type="module"></script><script src="scripts.fc6b7827d4dcd875.js" defer></script><script src="main.6985c39c793f3a9f.js" type="module"></script></body>
</html>
```



**ExternalName vs Endpoints **：外部服务有域名、只换“名字”用 ExternalName；要指定具体 IP:端口、或外部服务无域名，用 Endpoints

---

## 五、修改 NodePort 的端口范围

### 5.1 默认范围 30000-32767

```bash
[root@master svc]# cat 02-nodePort-xiuxian.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-nodeport
spec:
  type: NodePort
  selector:
    school: czu
    apps: xiuxian
  ports:
  - port: 88
    targetPort: 80
    nodePort: 8080
```

```bash
[root@master svc]# kubectl apply -f 02-nodePort-xiuxian.yaml
The Service "xiuxian-svc-nodeport" is invalid: spec.ports[0].nodePort: Invalid value: 8080: provided port is not in the valid range. The range of valid ports is 30000-32767
```

### 5.2 修改 apiserver 启动参数

```bash
[root@master ~]# vim /etc/kubernetes/manifests/kube-apiserver.yaml
 ...
 spec:
  containers:
  - command:
    - kube-apiserver
    - --service-node-port-range=3000-50000  # 进行添加这一行
    ...
```

mv 出去再 mv 回来触发 apiserver 重启，然后重新 apply：

```bash
[root@master svc]# kubectl apply -f 02-nodePort-xiuxian.yaml
service/xiuxian-svc-nodeport created

[root@master svc]# kubectl get -f 02-nodePort-xiuxian.yaml
NAME                   TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)       AGE
xiuxian-svc-nodeport   NodePort   10.200.5.18    <none>        88:8080/TCP   5s
```

三节点 `http://节点IP:8080/` 均可访问

![image-20261101194537934](/images/k8s-service-types-metallb-endpoints-image-20261101194537934.png)

**参考链接：**https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-apiserver/
