---
title: "K8S Pod Port Exposure and SVC Multi-Port Mapping in Practice: hostPort, Multi-Port Mapping and targetPort Name Matching"
date: 2026-10-31T18:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article covers two things in K8S: exposing Pod ports and mapping multiple ports on a SVC. The first half uses hostPort to map container port 80 straight to 8888 on the node hosting the Pod, so external traffic reaches the container without going through a SVC; the access test from Windows succeeds, and hostPort is compared against NodePort (hostPort only works on the Pod's node and its address follows the Pod when it moves, while NodePort is a Service that opens the same port on every node so movement does not affect access). The second half writes a Pod exposing both 80/TCP and 53/UDP, maps both through a SVC, inspects the PORT(S) column and the describe TargetPort/Endpoints, and finally patches targetPort to match by port name, verifying that the SVC keeps tracking the endpoint as long as the name is unchanged even if the container port number changes."
---

# K8S Pod Port Exposure and SVC Multi-Port Mapping in Practice: hostPort, Multi-Port Mapping and targetPort Name Matching

## 1. Exposing Pod Ports for Service Access (hostPort)

### 1.1 Write the Manifest

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
    # Configure the Pod port mapping
    ports:
      # The container port to expose
    - containerPort: 80
      # The host IP address
      hostIP: 0.0.0.0
      # The host port number
      hostPort: 8888
      # Give the port an alias, which must be unique
      name: web
      # The protocol of the container port; valid values: UDP,TCP,SCTP, defaults to TCP
      protocol: TCP
    - containerPort: 53
      name: dns
      protocol: UDP
```

### 1.2 Create the Resource and See Which Node It Lands On

```bash
[root@master pods]# kubectl apply -f 15-pods-xiuxian-ports.yaml 
pod/xiuxian-ports created
[root@master pods]# kubectl get pods -o wide
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-ports   1/1     Running   0          9s    10.100.2.56   worker02   <none>           <none>
```

### 1.3 Access Test from Windows

![image-20261031164202786](/images/k8s-pod-ports-svc-multiport/image-20261031164202786.png)

hostPort works: container port 80 is mapped to 8888 on worker02, so external traffic reaches the container directly without going through a SVC



hostPort vs NodePort: hostPort maps a container port straight to a port on a single node, so it only works on the node where the Pod runs and the address changes when the Pod moves; NodePort is a Service that opens the same port on every node, so Pod movement does not affect access. Production should use SVC/NodePort; hostPort is for debugging.

---

## 2. Multi-Port Mapping on a SVC

### 2.1 Write the Manifest

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
      # This name identifies the service; it can be the business name
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
    # It is recommended to keep the svc port name consistent with the backend port name.
  - port: 80
    # This refers to the Pod's port name; changing the Pod's containerPort does not propagate.
    name: web
  - port: 53
    name: dns
    protocol: UDP
```

### 2.2 Create the Resources and Observe

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

The SVC's `PORT(S)` column shows `80/TCP,53/UDP` at the same time — multi-port mapping works

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

### 2.3 Matching targetPort by Name

`targetPort: web` (matched by name rather than by number). Patch the SVC to demonstrate:

```bash
[root@master pods]# kubectl patch svc xiuxian-svc --type='json' \
  -p '[{"op":"add","path":"/spec/ports/0/targetPort","value":"web"}]'
service/xiuxian-svc patched
[root@master pods]# kubectl describe svc xiuxian-svc | grep -E 'Port:|TargetPort:|Endpoints:'
Port:              web  80/TCP
TargetPort:        web/TCP          # Matching by name works
Endpoints:         10.100.1.59:80
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.1.59:53
[root@master pods]# curl -s http://10.200.166.210 | grep -oE '<title>[^<]*</title>'
<title>DAWN apps v1</title>         # Access is unaffected
```

`targetPort: web` matches by name: even if the container port number changes, as long as the name `web` stays the same the SVC keeps tracking it — port names decouple the container port number from the SVC config