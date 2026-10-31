---
title: "K8S ReplicationController Declarative Update Limitations: Why Pods Do Not Auto-Update on Template Changes"
date: 2026-10-31T19:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article demonstrates the limitations of ReplicationController (RC) regarding declarative updates in Kubernetes through hands-on experimentation. We first deploy a 3-replica RC with a ClusterIP Service to verify the initial v1 release. Next, we update the container image to v2 in the YAML manifest and apply it via kubectl apply: although the RC template updates successfully, running Pods remain unchanged on v1. Finally, we manually delete the Pods to trigger the RC to recreate them using the new v2 template, and thoroughly analyze the underlying control loop differences between RC and Deployment."
---

# K8S ReplicationController Declarative Update Limitations: Why Pods Do Not Auto-Update on Template Changes

In Kubernetes, the `ReplicationController` (RC) was the original controller designed to ensure that a specified number of Pod replicas remain running at all times. Many newcomers assume that updating the RC pod template (such as changing an image tag) and running `kubectl apply` will automatically trigger a rolling update similar to a Deployment.

Through a complete set of verification steps, this article explores the declarative update limitations of ReplicationController and how Pod recreation works under the hood.

---

## 1. Prepare the Environment and Deploy Version 1 (v1)

### 1.1 Write the Manifest

Create the RC manifest file `02-rc-xiuxian-update.yaml`, declaring 3 replicas and an accompanying ClusterIP Service:

```bash
[root@master rc]# cat 02-rc-xiuxian-update.yaml 
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-xiuxian
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
        ports:
        - containerPort: 80
          name: xiuxian

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
  - port: 80
    name: xiuxian
```

### 1.2 Create Resources and Verify Status

Apply the manifest using `kubectl apply` and ensure all 3 Pods reach the Running state:

```bash
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian created
service/xiuxian-svc created
[root@master rc]# kubectl get pods,svc
NAME                   READY   STATUS    RESTARTS   AGE
pod/rc-xiuxian-7jm98   1/1     Running   0          8s
pod/rc-xiuxian-9nmsz   1/1     Running   0          8s
pod/rc-xiuxian-vkfp6   1/1     Running   0          8s

NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
service/kubernetes    ClusterIP   10.200.0.1       <none>        443/TCP   19h
service/xiuxian-svc   ClusterIP   10.200.40.21     <none>        80/TCP    8s
```

---

## 2. Access Test for the Initial Version

Run consecutive requests against the Service's ClusterIP `10.200.40.21`:

```bash
[root@master rc]# for i in 1 2 3 4 5 6; do curl -s http://10.200.40.21 | grep -oE '<h1[^>]*>[^<]*</h1>'; sleep 0.5; done
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
```

All responses return the green header 凡人修仙传 v1, confirming that the initial version is functioning properly.

---

## 3. Modify the RC Image Version and Observe Update Behavior

### 3.1 Modify the Manifest and Apply the Changes

Change the image tag from `v1` to `v2` and re-apply using `kubectl apply`:

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"
      - image: harbor:443/dawn/apps:v1
[root@master rc]# sed -i 's|dawn/apps:v1|dawn/apps:v2|' 02-rc-xiuxian-update.yaml   # Modify configuration
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian configured
service/xiuxian-svc unchanged
```

### 3.2 Inspect the RC Template vs. Running Pods

Check the RC object YAML to confirm that the template was updated:

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"   # RC image template updated successfully
      - image: harbor:443/dawn/apps:v2
```

Now inspect the running Pods:

```bash
[root@master rc]# kubectl get pods -o wide  # Old Pods are NOT automatically deleted or updated
NAME               READY   STATUS    RESTARTS   AGE    IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-7jm98   1/1     Running   0          42s    10.100.2.57   worker02   <none>           <none>
rc-xiuxian-9nmsz   1/1     Running   0          42s    10.100.2.58   worker02   <none>           <none>
rc-xiuxian-vkfp6   1/1     Running   0          42s    10.100.1.60   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"  # Images of running Pods remain unchanged
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
```

> **Key Takeaway**:  
> `kubectl apply` returned `configured` for the RC, and the Pod Template within the RC indeed updated to `v2`. However, **running Pods were not recreated and continue to serve the v1 image**.  
> This is a fundamental difference between an RC and a Deployment: ReplicationControllers do not actively reconcile differences in existing Pod specifications and lack built-in rolling update capabilities.

---

## 4. Manually Delete Pods to Trigger Template Recreation

### 4.1 Delete Existing Pods

Because the RC's primary responsibility is maintaining replica count (currently desired: 3), destroying existing Pods prompts the RC to detect a replica shortage and spawn new Pods using the **latest Pod Template** (v2):

```bash
[root@master rc]# kubectl delete pods --all  # Manually delete old Pods
pod "rc-xiuxian-7jm98" deleted
pod "rc-xiuxian-9nmsz" deleted
pod "rc-xiuxian-vkfp6" deleted
```

### 4.2 Observe Newly Created Pods and Image Versions

```bash
[root@master rc]# kubectl get pods -o wide  # RC automatically creates new Pods
NAME               READY   STATUS    RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-8jtfd   1/1     Running   0          10s   10.100.2.59   worker02   <none>           <none>
rc-xiuxian-ff8cv   1/1     Running   0          10s   10.100.1.61   worker01   <none>           <none>
rc-xiuxian-mfqp9   1/1     Running   0          10s   10.100.1.62   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
```

### 4.3 Verify Service Access Again

```bash
[root@master rc]# for i in 1 2 3; do curl -s http://10.200.40.21 | grep -oE '<title>[^<]*</title>|<h1[^>]*>[^<]*</h1>'; done
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
```

The response switches from the green title (v1) to the red title (v2), proving that the new image is now live.

---

## 5. Summary and Production Insights

1. **RC Focuses on Replica Count, Not Configuration Drift**:  
   The reconciliation loop of an RC only compares the count of Pods matching its `selector` against `spec.replicas`. If the numbers match, the RC considers the state healthy and never checks whether running Pod images or environments match the template.
2. **Deleting All Pods at Once Is Dangerous in Production**:  
   While `kubectl delete pods --all` worked in this lab environment, it should never be performed in production:
   - It causes immediate and total downtime;
   - If the new image fails to pull (`ImagePullBackOff`) or crashes on startup, the entire service goes down without fallback.
3. **Use Deployments Instead**:  
   ReplicationControllers are a legacy primitive superseded by Deployments and ReplicaSets. Deployments provide native declarative rolling updates, canary rollouts, `maxUnavailable` rate limiting, rollout pausing, and instantaneous rollbacks (`rollout undo`).
