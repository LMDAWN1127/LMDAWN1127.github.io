---
title: "Kubernetes Blue-Green and Canary Deployment in Practice: Comparison of Three Deployment Strategies"
date: 2026-10-31T20:05:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "ReplicationController", "BlueGreen", "Canary"]
showToc: true
summary: "In-depth comparison of Blue-Green deployment, Canary release, and A/B testing in Kubernetes. Step-by-step hands-on guide demonstrating instant zero-downtime traffic switching via dual ReplicationControllers and Service label selector swapping (apps: xiuxian -> apps: green), as well as phased progressive traffic shifting via dual-label design (business label school: czu and version label apps: v1/v2) and replica scaling."
---

# Kubernetes Blue-Green and Canary Deployment in Practice: Comparison of Three Deployment Strategies

## 1. Comparison of Three Deployment Strategies

| Strategy | Features | Drawbacks |
| --- | --- | --- |
| Blue-Green Deployment | Two environments (blue and green) deployed simultaneously, but only one serves traffic | One environment idles without traffic |
| Canary Release (Gray) | Incremental replacement instead of all at once; upgrade a subset of apps for testing, short-term coexistence of old and new versions, eventually replacing all old versions | Cannot finely control the scope of the update |
| A/B Testing | Allows specific users to access the new version | Requires deploying separate components (e.g., Istio) |

Core concepts for implementing the three strategies in Kubernetes:

**Blue-Green**: ① Create blue version using a controller; ② Associate Service with blue version Pods; ③ Create green version using a controller; ④ Update Service label selector to green version.

**Canary**: ① Create old version with 2 sets of labels (`apps: v1` + `type: xiuxian`), replicas 3; ② Associate Service with shared business label (`type: xiuxian`); ③ Create new version with same 2 sets of labels (`apps: v2` + `type: xiuxian`), replicas 1; ④ Scale old version replicas 3→0, scale new version replicas 1→3.

**A/B**: Requires Istio or similar components for traffic routing by user characteristics; not deployed in this environment, included for conceptual comparison only.

## 2. Blue-Green Deployment Hands-on

Working directory `/dawn/manifests/01-blue-green/`, with 3 manifests in total.

### 1. Deploy Blue Version

```bash
[root@master 01-blue-green]# cat 01-blue-xiuxian-v1.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-blue
spec:
  replicas: 3
  selector:
    apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

```bash
[root@master 01-blue-green]# cat 02-svc-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
[root@master 01-blue-green]# kubectl apply -f .
replicationcontroller/xiuxian-blue created
service/xiuxian-svc created
[root@master 01-blue-green]# kubectl get pods -l apps=xiuxian -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-blue-fh7v9   1/1     Running   0          23s   10.100.2.61   worker02   <none>           <none>
xiuxian-blue-phnjx   1/1     Running   0          24s   10.100.1.63   worker01   <none>           <none>
xiuxian-blue-pznkf   1/1     Running   0          23s   10.100.1.64   worker01   <none>           <none>
```

### 2. Access Verification

```bash
[root@master 01-blue-green]# kubectl get svc xiuxian-svc
NAME          TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc   ClusterIP   10.200.250.148   <none>        80/TCP    4s
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

All 10 requests hit v1; blue version exclusively handles traffic.

### 3. Deploy Green Version

```bash
[root@master 01-blue-green]# cat 03-green-xiuxian-v2.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-green
spec:
  replicas: 3
  selector:
    apps: green
  template:
    metadata:
      labels:
        apps: green
    spec:
      containers:
      - image: harbor:443/dawn/apps:v2
        name: xiuxian
```

```bash
[root@master 01-blue-green]# kubectl apply -f 03-green-xiuxian-v2.yaml
replicationcontroller/xiuxian-green created
[root@master 01-blue-green]# kubectl get pods -o wide -l apps=green
NAME                  READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-green-4xgc6   1/1     Running   0          8s    10.100.2.62   worker02   <none>           <none>
xiuxian-green-9cghm   1/1     Running   0          8s    10.100.1.65   worker01   <none>           <none>
xiuxian-green-bcbjs   1/1     Running   0          8s    10.100.2.63   worker02   <none>           <none>
```

At this point, all 6 Pods across both blue and green environments are Running, but the Service selector is still `apps: xiuxian`, so traffic continues to go exclusively to the blue version. Verifying again with a loop:

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
      8 DAWN apps v1
```

All 8 requests still hit v1; the green version is in a "deployed but not serving" state. This directly illustrates the "idle running environment" drawback of blue-green deployment, which is also the exact reason it allows instantaneous and safe rollbacks at any time.

### 4. Switch Versions

Modify the Service selector by commenting out blue and switching to green:

```bash
[root@master 01-blue-green]# sed -i 's|^    apps: xiuxian|    # apps: xiuxian\n    apps: green|' 02-svc-xiuxian.yaml
[root@master 01-blue-green]# cat 02-svc-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    # apps: xiuxian
    apps: green
  ports:
  - port: 80
    targetPort: 80
[root@master 01-blue-green]# kubectl apply -f 02-svc-xiuxian.yaml
service/xiuxian-svc configured
[root@master 01-blue-green]# kubectl describe svc xiuxian-svc
Name:              xiuxian-svc
Namespace:         default
Labels:            <none>
Annotations:       <none>
Selector:          apps=green
Type:              ClusterIP
IP Family Policy:  SingleStack
IP Families:       IPv4
IP:                10.200.250.148
IPs:               10.200.250.148
Port:              <unset>  80/TCP
TargetPort:        80/TCP
Endpoints:         10.100.1.65:80,10.100.2.62:80,10.100.2.63:80
Session Affinity:  None
Events:            <none>
```

`Selector` changed from `apps=xiuxian` to `apps=green`;

`Endpoints` were instantly hot-swapped from 3 blue Pods to 3 green Pods;

ClusterIP remains unchanged at 10.200.250.148—completely transparent to clients with zero configuration changes required.

Verifying in a loop, all traffic has switched to the green version:

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v2
```

All 10 requests hit v2; the switchover is complete. If issues arise in the new version, rolling back is as simple as reverting the Service selector back to `apps: xiuxian` and applying again—the blue Pods remain intact.

### 5. Clean Up Test Environment

```bash
[root@master 01-blue-green]# kubectl delete -f .
replicationcontroller "xiuxian-blue" deleted
service "xiuxian-svc" deleted
replicationcontroller "xiuxian-green" deleted
[root@master 01-blue-green]# kubectl get all
NAME                 TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/kubernetes   ClusterIP   10.200.0.1     <none>        443/TCP   22h
```

## 3. Canary Deployment Hands-on

Working directory `/dawn/manifests/02-huidu/`, with 3 manifests in total. The core design uses dual labels: `apps: v1/v2` distinguishes versions, while `school: czu` is a shared business label. The Service selects on `school: czu`, allowing both old and new Pods to enter the Endpoints pool simultaneously and balance traffic proportionally based on replica counts.

### 1. Deploy Old Version

```bash
[root@master 02-huidu]# cat 01-old-xiuxian-v1.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-old
spec:
  replicas: 3
  selector:
    apps: v1
  template:
    metadata:
      labels:
        apps: v1
        school: czu
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

```bash
[root@master 02-huidu]# cat 02-svc-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    school: czu
  ports:
  - port: 80
    targetPort: 80
[root@master 02-huidu]# kubectl apply -f .
replicationcontroller/xiuxian-old created
service/xiuxian-svc created
[root@master 02-huidu]# kubectl get pods -l apps=v1 -o wide
NAME                READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-old-gd5lf   1/1     Running   0          8s    10.100.1.66   worker01   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          8s    10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          8s    10.100.2.64   worker02   <none>           <none>
[root@master 02-huidu]# kubectl get svc
NAME          TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
kubernetes    ClusterIP   10.200.0.1      <none>        443/TCP   3d
xiuxian-svc   ClusterIP   10.200.28.1     <none>        80/TCP    17s
```

### 2. Test Application

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

All 10 requests hit v1; the old version is operating normally.

### 3. Deploy New Version

```bash
[root@master 02-huidu]# cat 03-new-xiuxian-v2.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-new
spec:
  replicas: 1
  selector:
    apps: v2
  template:
    metadata:
      labels:
        apps: v2
        school: czu
    spec:
      containers:
      - image: harbor:443/dawn/apps:v2
        name: xiuxian
```

```bash
[root@master 02-huidu]# kubectl apply -f 03-new-xiuxian-v2.yaml
replicationcontroller/xiuxian-new created
[root@master 02-huidu]# kubectl get pods -o wide -l apps=v2
NAME                READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          8s    10.100.1.67   worker01   <none>           <none>
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          8s      10.100.1.67   worker01   <none>           <none>
xiuxian-old-gd5lf   1/1     Running   0          2m25s   10.100.1.66   worker01   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          2m25s   10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          2m25s   10.100.2.64   worker02   <none>           <none>
```

New version is online with 1 replica. Using `-l school` shows all 4 Pods carrying `school=czu`, all functioning as backends for the Service.

### 4. Observe Pod Traffic Distribution

At this stage, new and old versions coexist. Accessing in a loop for 8 seconds:

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     20 DAWN apps v1
      6 DAWN apps v2
```

20 requests to v1 + 6 requests to v2; roughly 23% of traffic hit the new version, closely matching the replica proportion of 1 new / 4 total (25%).

### 5. Gradually Replace Old Version with New Version

Scale old version replicas from 3 to 0 and new version from 1 to 3 across three stages.

**Round 1: Old 3→2, New 1→2**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=2
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl scale rc xiuxian-new --replicas=2
replicationcontroller/xiuxian-new scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          117s    10.100.1.67   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          6s      10.100.2.66   worker02   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          4m14s   10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          4m14s   10.100.2.64   worker02   <none>           <none>
```

Ratio of old to new is 2:2; traffic is split roughly equally.

**Round 2: Old 2→1, New 2→3**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=1
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl scale rc xiuxian-new --replicas=3
replicationcontroller/xiuxian-new scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          2m44s   10.100.1.67   worker01   <none>           <none>
xiuxian-new-b97q2   1/1     Running   0          6s      10.100.1.68   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          53s     10.100.2.66   worker02   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          5m1s     10.100.2.65   worker02   <none>           <none>
```

Ratio of old to new is 1:3; new version takes approximately 75% of traffic.

**Round 3: Old 1→0**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=0
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          3m47s   10.100.1.67   worker01   <none>           <none>
xiuxian-new-b97q2   1/1     Running   0          69s     10.100.1.68   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          116s    10.100.2.66   worker02   <none>           <none>
[root@master 02-huidu]# kubectl get rc
NAME          DESIRED   CURRENT   READY   AGE
xiuxian-new   3         3         3       3m47s
xiuxian-old   0         0         0       6m4s
```

### 6. Verify Final Results

Only v2 versions exist in the cluster; old version replicas are scaled to zero.

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     17 DAWN apps v2
[root@master 02-huidu]# kubectl get endpoints xiuxian-svc
NAME          ENDPOINTS                                      AGE
xiuxian-svc   10.100.1.67:80,10.100.1.68:80,10.100.2.66:80   7m32s
```

All 17 requests hit v2, Endpoints only contain the 3 new version Pods, and the canary release is complete.
