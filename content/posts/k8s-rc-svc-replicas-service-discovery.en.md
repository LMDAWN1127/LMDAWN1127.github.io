---
title: "K8S Replica Control and Service Discovery in Practice: RC, ClusterIP and NodePort"
date: 2026-10-30T20:04:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article works through replica control and service discovery in K8S. A ReplicationController declares 3 replicas; we verify its self-healing (deleting a Pod is automatically replenished) and that deleting the RC cascades to clean up the Pods it manages. Then a ClusterIP Service gives the 3 Pods spread across two nodes a single fixed entry point; with each Pod's nginx returning its own Pod name, five consecutive requests reveal round-robin load balancing. Finally a NodePort Service exposes the workload on port 30080 of every node, reachable from outside the cluster and load balanced the same way."
---

# K8S Replica Control and Service Discovery in Practice: RC, ClusterIP and NodePort

---

## 1. RC (ReplicationController) — Keeping the Replica Count

If you declare that you want 3 Pods, the RC guarantees exactly 3 Pods are running at any moment. One missing and it is replenished automatically; one extra and it is killed automatically.

### 1.1 RC YAML

```yaml
# /dawn/manifests/rc/01-rc-xiuxian.yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-rc
spec:
  replicas: 3
  selector:
    apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        school: czu
        class: computer01
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

`spec.replicas: 3` — the desired replica count

`spec.selector.apps: xiuxian` — which Pods are managed, matched by label

### 1.2 Create the RC

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
replicationcontroller/xiuxian-rc created

[root@master ~]# kubectl get pods -o wide -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE
xiuxian-rc-zldnv 1/1   Running   0          41s   10.100.1.13   worker01
xiuxian-rc-p6fsm 1/1   Running   0          41s   10.100.2.5    worker02
xiuxian-rc-m6cbl 1/1   Running   0          41s   10.100.2.6    worker02
```

The RC created 3 Pods automatically, spread across different nodes (one on worker01, two on worker02).

### 1.3 RC Self-Healing

Delete a Pod manually and see whether the RC replenishes it:

```bash
[root@master ~]# kubectl delete pod xiuxian-rc-zldnv
pod "xiuxian-rc-zldnv" deleted

[root@master ~]# kubectl get pods -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   ...
xiuxian-rc-p6fsm 1/1   Running   0          60s   ...
xiuxian-rc-m6cbl 1/1   Running   0          60s   ...
xiuxian-rc-xxxxx 1/1   Running   0          2s    ...   ← a new Pod was added automatically
```

### 1.4 Deleting the RC Cleans Up Its Pods

```bash
[root@master ~]# kubectl delete rc xiuxian-rc
replicationcontroller "xiuxian-rc" deleted
# All Pods managed by the RC are deleted automatically
```

---

## 2. SVC ClusterIP — Internal Load Balancing

The 3 Pods are spread across 2 nodes with different IPs. The SVC provides a fixed ClusterIP and port, so the client only needs to remember one address, and the backend round-robins traffic to healthy Pods.

### 2.1 SVC YAML

```yaml
# /dawn/manifests/svc/01-clusterIP-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-clusterip
spec:
  type: ClusterIP
  selector:
    school: czu
    apps: xiuxian
  ports:
  - port: 88
    targetPort: 80
```

`type: ClusterIP` — internal IP, reachable only inside the cluster

`port: 88` — the port the SVC exposes

`targetPort: 80` — the container port on the backend Pod

`selector` — matches backend Pods by label (`school=czu, apps=xiuxian`)

### 2.2 Create the SVC and Recreate the RC

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
[root@master ~]# kubectl apply -f /dawn/manifests/svc/01-clusterIP-xiuxian.yaml

[root@master ~]# kubectl get svc xiuxian-svc-clusterip
NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc-clusterip   ClusterIP   10.200.142.177   <none>        88/TCP    2s
```

### 2.3 Verify Load Balancing

First make each Pod's nginx return its own Pod name so the distribution is easy to observe:

```bash
[root@master ~]# for pod in $(kubectl get pods -l apps=xiuxian -o name); do
  kubectl exec ${pod#pod/} -- sh -c "echo ${pod#pod/} > /usr/share/nginx/html/index.html"
done
```

Send 5 consecutive requests to the SVC's ClusterIP:

```bash
[root@master ~]# CLIP=$(kubectl get svc xiuxian-svc-clusterip -o jsonpath='{.spec.clusterIP}')
[root@master ~]# for i in 1 2 3 4 5; do curl -s $CLIP:88; done
xiuxian-rc-zldnv    ← the Pod on worker01
xiuxian-rc-zldnv
xiuxian-rc-p6fsm    ← the Pod on worker02
xiuxian-rc-m6cbl    ← the other Pod on worker02
xiuxian-rc-zldnv
```

 Requests were round-robined across the 3 backend Pods — SVC ClusterIP load balancing verified.

---

## 3. SVC NodePort — External Access

ClusterIP is only reachable inside the cluster, so external users cannot reach it. NodePort opens a fixed port (30000-32767) on every node and forwards traffic to the backend Pods, making the service reachable from outside.

```yaml
# /dawn/manifests/svc/02-nodePort-xiuxian.yaml
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
    nodePort: 30080
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/svc/02-nodePort-xiuxian.yaml
service/xiuxian-svc-nodeport created

[root@master ~]# kubectl get svc
NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
xiuxian-svc-clusterip   ClusterIP   10.200.142.177   <none>        88/TCP         56s
xiuxian-svc-nodeport    NodePort    10.200.12.142    <none>        88:30080/TCP   2s
```

`88:30080` — the SVC's internal port 88, mapped to port 30080 on all nodes.

External access test:

```bash
# Access through port 30080 on worker01
[root@master ~]# for i in 1 2 3 4 5; do curl -s 11.0.1.232:30080; done
xiuxian-rc-p6fsm
xiuxian-rc-m6cbl
xiuxian-rc-zldnv
xiuxian-rc-m6cbl
xiuxian-rc-p6fsm
```

NodePort external access works, and load balancing works the same way.