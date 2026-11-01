---
title: "K8S Service Types and External Traffic Access: MetalLB Practice, Endpoints Mapping, and NodePort Range Customization"
date: 2026-11-01T20:00:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "MetalLB", "Endpoints", "ExternalName", "NodePort"]
showToc: true
summary: "A comprehensive overview of Kubernetes four Service types and use cases, hands-on practice deploying MetalLB in on-premise clusters for LoadBalancer virtual IPs and fixed NodePorts, comparison between ExternalName and manual Endpoints for routing external services, and customizing apiserver static Pod parameters to extend the NodePort port range."
---

# K8S Service Types and External Traffic Access: MetalLB Practice, Endpoints Mapping, and NodePort Range Customization

## 1. Four Types of Services

| Type | Access Scope | Use Case |
| ---------------- | ------------------------ | ------------------------------------ |
| **ClusterIP**    | Cluster internal only    | Inter-microservice communication (Default type) |
| **NodePort**     | External to cluster (Node IP:Port) | Exposing services in on-premise datacenter / test environments |
| **LoadBalancer** | External to cluster (Virtual IP) | Integrating cloud SLB, or using MetalLB in on-premise datacenters |
| **ExternalName** | External to cluster (CNAME domain) | Proxied service is outside the cluster, not inside |

---

## 2. MetalLB: Bringing LoadBalancer to On-Premise Clusters

LoadBalancers from cloud providers are backed by cloud products; on-premise datacenters lack this capability, and **MetalLB** fills the gap—it can be understood as "SLB for self-hosted datacenters".

### 2.1 Deploying MetalLB

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

### 2.2 Creating Address Pool and L2 Advertisement

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

### 2.3 Deploying LoadBalancer Test Service

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

EXTERNAL-IP is automatically assigned the first IP from the address pool, along with an allocated NodePort.

### 2.4 Two Access Methods

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

### 2.5 Customizing EXTERNAL-IP and Fixed NodePort

**Method 1: Resource Annotations**

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

**Method 2: loadBalancerIP Field**

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

Both methods successfully obtain the designated IP, and the NodePort is successfully fixed.

**Reference Link:** https://metallb.universe.tf/usage/

---

## 3. ExternalName: Mapping Services Outside the Cluster

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

1. Pinging `svc-cnblog` inside a Pod is equivalent to pinging the external domain;

2. Services mapped via ExternalName must have public DNS resolution or resolution records configured in the CoreDNS component;

3. If an external service outside the K8S cluster lacks public domain name resolution, CoreDNS record resolution must be modified manually.

---

## 4. Endpoints: Another Approach to Map External Services

### 4.1 What are Endpoints

Each Service has a corresponding Endpoints (ep) resource of the same name storing real backend IP records (except for ExternalName type). Deleting an svc automatically deletes the ep with the same name.

### 4.2 Manually Creating ep to Integrate External Addresses into the Cluster

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

By defining an svc without a Selector and manually specifying external IPs in the ep, Pods can access external Harbor via `https://dawn-harbor/`.

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



**ExternalName vs Endpoints**: Use ExternalName when external services have a domain name and only require alias redirection; use Endpoints when specific IP:Port combinations must be designated, or when external services have no domain name.

---

## 5. Modifying the NodePort Port Range

### 5.1 Default Range 30000-32767

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

### 5.2 Modifying apiserver Startup Parameters

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

Move the file out and back in to trigger an apiserver restart, then apply again:

```bash
[root@master svc]# kubectl apply -f 02-nodePort-xiuxian.yaml
service/xiuxian-svc-nodeport created

[root@master svc]# kubectl get -f 02-nodePort-xiuxian.yaml
NAME                   TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)       AGE
xiuxian-svc-nodeport   NodePort   10.200.5.18    <none>        88:8080/TCP   5s
```

All three nodes are accessible via `http://NodeIP:8080/`.

![image-20261101194537934](/images/k8s-service-types-metallb-endpoints-image-20261101194537934.png)

**Reference Link:** https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-apiserver/
