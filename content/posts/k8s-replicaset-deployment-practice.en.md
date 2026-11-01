---
title: "K8S ReplicaSet and Deployment Controllers in Practice: Replica Control, Rolling Updates, and Rollback Mechanisms"
date: 2026-11-01T11:28:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ReplicaSet", "Deployment"]
showToc: true
summary: "An in-depth hands-on guide to Kubernetes ReplicaSet and Deployment controllers, covering matchLabels and matchExpressions label selectors (Pod adoption mechanism), Recreate and RollingUpdate deployment strategies (detailed analysis of maxSurge and maxUnavailable), and declarative/imperative rollout management with multi-version rollbacks."
---

# K8S ReplicaSet and Deployment Controllers in Practice: Replica Control, Rolling Updates, and Rollback Mechanisms

## 1. ReplicaSet Controller

### 1. Purpose

Enables replica control for Pods. Compared to ReplicationController (rc) resources, it is more functional and lightweight.

### 2. Case 1: ReplicaSet Implementing Similar Functionality to ReplicationController

Working directory: `/dawn/manifests/rs/`

```bash
[root@master rs]# cat 01-rs-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian
spec:
  # Specify the number of Pod replicas
  replicas: 3
  # Define how to associate Pods
  selector:
    # Associate Pods based on labels
    matchLabels:
      apps: xiuxian
  # Define Pod template
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

```bash
[root@master rs]# kubectl apply -f 01-rs-xiuxian-matchLabels.yaml
replicaset.apps/rs-xiuxian created
[root@master rs]# kubectl get rs -o wide
NAME         DESIRED   CURRENT   READY   AGE   CONTAINERS   IMAGES                    SELECTOR
rs-xiuxian   3         3         3       6s    c1           harbor:443/dawn/apps:v1   apps=xiuxian
[root@master rs]# kubectl get pods --show-labels
NAME               READY   STATUS    RESTARTS   AGE   LABELS
rs-xiuxian-gdq7b   1/1     Running   0          6s    apps=xiuxian,version=v1
rs-xiuxian-m9xqr   1/1     Running   0          6s    apps=xiuxian,version=v1
rs-xiuxian-rcdnr   1/1     Running   0          6s    apps=xiuxian,version=v1
```

All 3 Pods are Running, with labels matching the template. Just like rc, the matchLabels equality-based selector completes replica control.

### 3. Case 2: ReplicaSet Superior to ReplicationController (matchExpressions Adoption)

#### 3.1 Prepare the Test Environment

First, create 4 bare Pods using `kubectl run` and assign different labels.

In K8S v1.23, `kubectl run` creates a Deployment by default instead of a Pod; adding `--restart=Never` is required to create a bare Pod.

```bash
[root@master ~]# kubectl run xiuxian01 --image=harbor:443/dawn/apps:v1 --restart=Never
pod/xiuxian01 created
[root@master ~]# kubectl run xiuxian02 --image=harbor:443/dawn/apps:v2 --restart=Never
pod/xiuxian02 created
[root@master ~]# kubectl run xiuxian03 --image=harbor:443/dawn/apps:v3 --restart=Never
pod/xiuxian03 created
[root@master ~]# kubectl label pod xiuxian01 apps=v1
pod/xiuxian01 labeled
[root@master ~]# kubectl label pod xiuxian02 apps=v2
pod/xiuxian02 labeled
[root@master ~]# kubectl label pod xiuxian03 apps=v3
pod/xiuxian03 labeled
[root@master ~]# kubectl get pods --show-labels
NAME        READY   STATUS    RESTARTS   AGE   LABELS
xiuxian01   1/1     Running   0          9s    apps=v1,run=xiuxian01
xiuxian02   1/1     Running   0          8s    apps=v2,run=xiuxian02
xiuxian03   1/1     Running   0          8s    apps=v3,run=xiuxian03
[root@master ~]# kubectl run xiuxian04 --image=harbor:443/dawn/apps:v2 --restart=Never
pod/xiuxian04 created
[root@master ~]# kubectl label pod xiuxian04 apps=v4
pod/xiuxian04 labeled
[root@master ~]# kubectl get pods --show-labels
NAME        READY   STATUS    RESTARTS   AGE     LABELS
xiuxian01   1/1     Running   0          13s     apps=v1,run=xiuxian01
xiuxian02   1/1     Running   0          12s     apps=v2,run=xiuxian02
xiuxian03   1/1     Running   0          12s     apps=v3,run=xiuxian03
xiuxian04   1/1     Running   0          4s      apps=v4,run=xiuxian04
```

#### 3.2 Create the ReplicaSet Resource

```bash
[root@master rs]# cat 02-rs-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian-matchexpressions
spec:
  # Specify the number of Pod replicas
  replicas: 5
  # Define how to associate Pods
  selector:
    # Associate Pods based on label expressions
    matchExpressions:
      # The label key
    - key: apps
      # The label values
      values:
      - v1
      - v2
      - v3
      # Specify the relationship between key and values: In, NotIn, Exists, and DoesNotExist
      #   In:
      #      The value of key must be in the list of values.
      #   NotIn:
      #      The opposite of In.
      #   Exists:
      #      Key exists, value is arbitrary; value field can be omitted.
      #   DoesNotExist:
      #      Key does not exist, opposite of Exists; value field can be omitted.
      operator: In
  # Define Pod template
  template:
    metadata:
      labels:
        apps: v1
        school: czu
        class: computer01
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

```bash
[root@master rs]# kubectl apply -f 02-rs-xiuxian-matchExpressions.yaml
replicaset.apps/rs-xiuxian-matchexpressions created
[root@master rs]# kubectl get pods --show-labels
NAME                                READY   STATUS    RESTARTS   AGE     LABELS
rs-xiuxian-matchexpressions-cdhjw   1/1     Running   0          6s      apps=v1,class=computer01,school=czu
rs-xiuxian-matchexpressions-q8s66   1/1     Running   0          6s      apps=v1,class=computer01,school=czu
xiuxian01                           1/1     Running   0          27s     apps=v1,run=xiuxian01
xiuxian02                           1/1     Running   0          26s     apps=v2,run=xiuxian02
xiuxian03                           1/1     Running   0          26s     apps=v3,run=xiuxian03
xiuxian04                           1/1     Running   0          18s     apps=v4,run=xiuxian04
```

This is where ReplicaSet outperforms ReplicationController: The RS declared 5 replicas, but only created 2 new Pods (`cdhjw`, `q8s66`). Because the set-based selector `matchExpressions` with `apps In (v1,v2,v3)` adopted the existing xiuxian01/02/03—3 old Pods + 2 new Pods = 5. Meanwhile, xiuxian04 has the label `apps=v4`, which is not in the In list, so it was not adopted.

The adoption behavior is confirmed via ownerReferences:

```bash
[root@master rs]# kubectl get pod xiuxian01 -o jsonpath='{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}'
ReplicaSet/rs-xiuxian-matchexpressions
```

```bash
[root@master rs]# kubectl describe rs rs-xiuxian-matchexpressions | head -12
Name:         rs-xiuxian-matchexpressions
Namespace:    default
Selector:     apps in (v1,v2,v3)
Labels:       <none>
Annotations:  <none>
Replicas:     5 current / 5 desired
Pods Status:  5 Running / 0 Waiting / 0 Succeeded / 0 Failed
Pod Template:
  Labels:  apps=v1
           class=computer01
           school=czu
```

Deleting the RS cascades to delete the adopted Pods (xiuxian01/02/03 disappear along with the RS), while unadopted xiuxian04 becomes an "orphan" and must be deleted separately:

```bash
[root@master rs]# kubectl delete -f 02-rs-xiuxian-matchExpressions.yaml && kubectl delete pod xiuxian04
replicaset.apps "rs-xiuxian-matchexpressions" deleted
pod "xiuxian04" deleted
```

## 2. Deployment Controller

### 1. Purpose

Used for deploying services. Under the hood, it controls Pod replica counts via ReplicaSets and does not directly control Pods. Compared to rc and rs, Deployment supports declarative updates.

### 2. Case 1: Matching Based on matchLabels

```bash
[root@master deploy]# cat 01-deploy-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian
spec:
  # Specify the number of Pod replicas
  replicas: 3
  # Define how to associate Pods
  selector:
    # Associate Pods based on labels
    matchLabels:
      apps: xiuxian
  # Define Pod template
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2
```

### 3. Case 2: Matching Based on matchExpressions

```bash
[root@master deploy]# cat 02-deloy-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deploy-xiuxian-matchexpressions
spec:
  # Specify the number of Pod replicas
  replicas: 5
  # Define how to associate Pods
  selector:
    # Associate Pods based on label expressions
    matchExpressions:
      # The label key
    - key: apps
      # The label values
      values:
      - v1
      - v2
      - v3
      # Specify the relationship between key and values: In, NotIn, Exists, and DoesNotExist
      operator: In
  # Define Pod template
  template:
    metadata:
      labels:
        apps: v1
        school: czu
        class: computer01
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

### 4. Test Case

```bash
[root@master deploy]# kubectl apply -f 01-deploy-xiuxian-matchLabels.yaml
deployment.apps/deloy-xiuxian created
[root@master deploy]# kubectl apply -f 02-deloy-xiuxian-matchExpressions.yaml
deployment.apps/deploy-xiuxian-matchexpressions created
[root@master deploy]# kubectl get deploy,rs,pods
NAME                                              READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/deloy-xiuxian                     3/3     3            3           8s
deployment.apps/deploy-xiuxian-matchexpressions   5/5     5            5           8s

NAME                                                        DESIRED   CURRENT   READY   AGE
replicaset.apps/deloy-xiuxian-598b97f7f                     3         3         3       8s
replicaset.apps/deploy-xiuxian-matchexpressions-c89bdf6fc   5         5         5       8s

NAME                                                  READY   STATUS    RESTARTS   AGE
pod/deloy-xiuxian-598b97f7f-5s69q                     1/1     Running   0          8s
pod/deloy-xiuxian-598b97f7f-gg5lf                     1/1     Running   0          8s
pod/deloy-xiuxian-598b97f7f-npw2r                     1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-9xwnz   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-fch47   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-lj9ck   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-q5wbp   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-xbt7n   1/1     Running   0          8s
```

**Deployment → ReplicaSet → Pod**. Each Deployment automatically generates a ReplicaSet (named with a pod-template-hash suffix), and Pod names append another random suffix. The Deployment does not manage Pods directly; everything is mediated through the ReplicaSet.

## 3. Deployments Recreate Upgrade Strategy

First clean up the two Deployments above (their selector `apps: xiuxian` would conflict with the update deployment below, causing Pods to be mistakenly adopted), then apply the Recreate strategy:

```bash
[root@master deploy]# kubectl delete -f 01-deploy-xiuxian-matchLabels.yaml -f 02-deloy-xiuxian-matchExpressions.yaml
deployment.apps "deloy-xiuxian" deleted
deployment.apps "deploy-xiuxian-matchexpressions" deleted
[root@master deploy]# cat 03-deploy-update-Recreate.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian-update
spec:
  # Upgrade strategy
  strategy:
    # Specify upgrade type, "Recreate" or "RollingUpdate"
    #   Recreate:
    #     Deletes all old Pods before creating new Pods; not recommended for production.
    type: Recreate
  replicas: 3
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v3
         # Specify image pull policy, valid values: Always, Never, IfNotPresent
         #    Never:
         #      Tries to start from local cache; never pulls from remote registry.
         #    IfNotPresent:
         #      Starts from local cache if present; otherwise pulls from remote registry.
         #    Always:
         #      Compares local image digest with remote registry; pulls if mismatch or missing.
         #
         # Default policy depends on tag:
         #    If tag is "latest", defaults to "Always";
         #    If tag is not "latest", defaults to "IfNotPresent"
         imagePullPolicy: Always

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-deploy
spec:
  type: ClusterIP
  clusterIP: 10.200.0.80
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

```bash
[root@master deploy]# kubectl apply -f 03-deploy-update-Recreate.yaml
deployment.apps/deloy-xiuxian-update created
service/xiuxian-svc-deploy created
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 0 out of 3 new replicas have been updated...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 0 of 3 updated replicas are available...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 1 of 3 updated replicas are available...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 2 of 3 updated replicas are available...
deployment "deloy-xiuxian-update" successfully rolled out
[root@master deploy]# kubectl get pods -o wide
NAME                                   READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
deloy-xiuxian-update-57969ff46-9gfzg   1/1     Running   0          2s    10.100.1.77   worker01   <none>           <none>
deloy-xiuxian-update-57969ff46-fzmmj   1/1     Running   0          2s    10.100.1.78   worker01   <none>           <none>
deloy-xiuxian-update-57969ff46-zkfp9   1/1     Running   0          2s    10.100.2.76   worker02   <none>           <none>
[root@master deploy]# kubectl get svc xiuxian-svc-deploy
NAME                 TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc-deploy   ClusterIP   10.200.0.80   <none>        80/TCP    3s
```

Recreate initially deploys 3 v3 Pods. The Service fixes its IP via hardcoded `clusterIP: 10.200.0.80` in the YAML—specifying an idle IP within the Service subnet allows fixing the service entrypoint.

## 4. Deployments RollingUpdate Upgrade Strategy

Switching the same Deployment to the RollingUpdate strategy: replicas 3→5, image v3→v2, `maxSurge: 2`, `maxUnavailable: 1`:

```bash
[root@master deploy]# cat 03-deploy-update-RollingUpdate.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian-update
spec:
  # Upgrade strategy
  strategy:
    # Specify upgrade type, "Recreate" or "RollingUpdate"
    #   Recreate:
    #     Deletes all old Pods before creating new Pods; not recommended.
    #   RollingUpdate:
    #     Rolling update; updates a subset of Pods, gradually replacing old Pods; default type.
    type: RollingUpdate
    # Define rolling update strategy; only valid when "type: RollingUpdate".
    rollingUpdate:
      # Maximum number of Pods that can be scheduled above the desired replica count during upgrade.
      # Supports percentages and numbers; defaults to "25%" if omitted.
      maxSurge: 2
      # Maximum number of unavailable Pods relative to desired replicas during upgrade.
      # Supports percentages and numbers; defaults to "25%" if omitted.
      maxUnavailable: 1
  replicas: 5
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2
         imagePullPolicy: Always

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-deploy
spec:
  type: ClusterIP
  clusterIP: 10.200.0.80
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

Immediately capturing continuous snapshots after applying makes the rolling process crystal clear:

```bash
[root@master deploy]# kubectl apply -f 03-deploy-update-RollingUpdate.yaml
deployment.apps/deloy-xiuxian-update configured
service/xiuxian-svc-deploy unchanged
[root@master deploy]# kubectl get pods -o wide        # t0: New RS Pods begin scheduling
NAME                                    READY   STATUS              RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-57969ff46-9gfzg    1/1     Running             0          17s   10.100.1.77   worker01
deloy-xiuxian-update-57969ff46-bfgf9    0/1     ContainerCreating   0          0s    <none>        worker02
deloy-xiuxian-update-57969ff46-fzmmj    1/1     Running             0          17s   10.100.1.78   worker01
deloy-xiuxian-update-57969ff46-zjmt2    0/1     ContainerCreating   0          0s    <none>        worker01
deloy-xiuxian-update-57969ff46-zkfp9    1/1     Running             0          17s   10.100.2.76   worker02
deloy-xiuxian-update-76dd8844b9-8p9pj   0/1     Pending             0          0s    <none>        <none>
deloy-xiuxian-update-76dd8844b9-cvhkc   0/1     Pending             0          0s    <none>        worker02
[root@master deploy]# kubectl get pods -o wide        # t+2s: New Pods up, old Pods begin terminating
NAME                                    READY   STATUS              RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-57969ff46-9gfzg    1/1     Running             0          19s   10.100.1.77   worker01
deloy-xiuxian-update-57969ff46-bfgf9    0/1     Terminating         0          2s    <none>        worker02
deloy-xiuxian-update-57969ff46-fzmmj    1/1     Running             0          19s   10.100.1.78   worker01
deloy-xiuxian-update-57969ff46-zjmt2    0/1     Terminating         0          2s    10.100.1.79   worker01
deloy-xiuxian-update-57969ff46-zkfp9    1/1     Running             0          19s   10.100.2.76   worker02
deloy-xiuxian-update-76dd8844b9-8p9pj   1/1     Running             0          2s    10.100.1.80   worker01
deloy-xiuxian-update-76dd8844b9-cvhkc   0/1     ContainerCreating   0          2s    <none>        worker02
deloy-xiuxian-update-76dd8844b9-nf74j   0/1     ContainerCreating   0          2s    <none>        worker02
deloy-xiuxian-update-76dd8844b9-tc9j4   0/1     ContainerCreating   0          0s    <none>        worker01
[root@master deploy]# kubectl get pods -o wide        # t+5s: Old Pods all exited, 5 new Pods ready
NAME                                    READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-76dd8844b9-8p9pj   1/1     Running   0          5s    10.100.1.80   worker01
deloy-xiuxian-update-76dd8844b9-cvhkc   1/1     Running   0          5s    10.100.2.79   worker02
deloy-xiuxian-update-76dd8844b9-nf74j   1/1     Running   0          5s    10.100.2.78   worker02
deloy-xiuxian-update-76dd8844b9-tc9j4   1/1     Running   0          3s    10.100.1.81   worker01
deloy-xiuxian-update-76dd8844b9-xrr4n   1/1     Running   0          3s    10.100.2.80   worker02
```

**t0**: Replicas scale from 3 to 5. The old RS (`57969ff46`, v3) first adds 2 Pods (`bfgf9`, `zjmt2`); at the same time, Pods from the new RS (`76dd8844b9`, v2) enter Pending—this is `maxSurge: 2`, allowing at most 2 Pods above the desired replica count.

**t+2s**: Old and new coexist. Total Pods = 7 (desired 5 + surge 2), strictly obeying `maxSurge`; old Pods start `Terminating`, corresponding to the pacing enforced by `maxUnavailable: 1`.

**t+5s**: All old RS Pods have terminated, and 5 new Pods are all Running. The rolling update is complete.

```bash
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update
deployment "deloy-xiuxian-update" successfully rolled out
[root@master deploy]# kubectl get rs
NAME                              DESIRED   CURRENT   READY   AGE
deloy-xiuxian-update-57969ff46    0         0         0       38s
deloy-xiuxian-update-76dd8844b9   5         5         5       21s
[root@master deploy]# kubectl rollout history deploy deloy-xiuxian-update
deployment.apps/deloy-xiuxian-update
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
```

The old RS is scaled down to 0 but the object is retained (revision 1 = v3 from Recreate, revision 2 = v2 from RollingUpdate).

## 5. Deployment Imperative Rollout and Rollback

After cleaning up the update deployment, create `deloy-xiuxian-update-strategy` specifically for demonstration (3 replicas, v1, default RollingUpdate):

```bash
[root@master deploy]# kubectl delete -f 03-deploy-update-RollingUpdate.yaml
deployment.apps "deloy-xiuxian-update" deleted
service "xiuxian-svc-deploy" deleted
[root@master deploy]# kubectl apply -f 04-deploy-xiuxian-update-strategy.yaml
deployment.apps/deloy-xiuxian-update-strategy created
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 1. Imperative Application Updates

```bash
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v3
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v1
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 2. Viewing Deployment Revision History

```bash
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
3         <none>
```

The history starts from 2 and 1 is missing—this is not an error, but revision renumbering caused by template reuse: The 3rd update (switching back to v1) had a template completely identical to revision 1, so Deployment directly reused revision 1's ReplicaSet (`65987b5db8`) and updated its revision number to 3, causing revision 1 to "disappear".

### 3. Checking Deployment Rollout Status

```bash
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 4. Pausing Rollout

```bash
[root@master deploy]# kubectl rollout pause deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy paused
```

Merely pausing is not intuitive; modifying the image while paused demonstrates that pause truly "suspends" the update—spec is updated to v2, yet Pods remain completely untouched:

```bash
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v2
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl get pods -o wide
NAME                                             READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-strategy-65987b5db8-5smhl   1/1     Running   0          23s   10.100.2.84   worker02
deloy-xiuxian-update-strategy-65987b5db8-wcrn2   1/1     Running   0          24s   10.100.1.86   worker01
deloy-xiuxian-update-strategy-65987b5db8-wk2xd   1/1     Running   0          26s   10.100.2.83   worker02
$ echo -n 'spec镜像: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
spec镜像: harbor:443/dawn/apps:v2
```

The spec already shows v2, yet the Pods are still all on v1's `65987b5db8`.

### 5. Resuming Rollout

```bash
[root@master deploy]# kubectl rollout resume deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy resumed
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
Waiting for deployment "deloy-xiuxian-update-strategy" rollout to finish: 1 out of 3 new replicas have been updated...
...
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl get pods -o wide
NAME                                             READY   STATUS        RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-strategy-65987b5db8-wcrn2   1/1     Terminating   0          28s   10.100.1.86   worker01
deloy-xiuxian-update-strategy-76dd8844b9-7lc7s   1/1     Running       0          1s    10.100.2.86   worker02
deloy-xiuxian-update-strategy-76dd8844b9-qskbf   1/1     Running       0          4s    10.100.1.87   worker01
deloy-xiuxian-update-strategy-76dd8844b9-v469q   1/1     Running       0          3s    10.100.2.85   worker02
```

After resume, the suspended rollout proceeds immediately, rolling out to v2 (new RS `76dd8844b9`). This hash is identical to the v2 RS in the earlier update deployment—pod-template-hash is determined solely by the Pod template content regardless of which Deployment owns it; identical templates inevitably produce the same RS hash.

### 6. Rollback to the Previous Revision

```bash
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
4         <none>
5         <none>
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
5         <none>
6         <none>
```

Each undo redeploys the previous version's template as a new revision (the revision number increments, while the old number is reused and overridden), causing the revision numbers in history to appear non-consecutive: 2,4,5 → 2,5,6.

### 7. Rollback to a Specific Revision

```bash
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy --to-revision=2
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
5         <none>
6         <none>
7         <none>
[root@master deploy]# echo -n '最终镜像: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
最终镜像: harbor:443/dawn/apps:v3
```

Revision 2 was v3, and after rollback the current image is indeed v3, completing the experimental loop. If you check `--revision=2` details now, it will report `unable to find the specified revision`—because revision 2's RS was reused and renumbered to 7 by subsequent undo operations (you must use `kubectl rollout history --revision=7` to view this v3 template).
