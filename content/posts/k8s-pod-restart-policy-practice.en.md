---
title: "K8S Pod RestartPolicy in Action: Always, OnFailure, Never Behaviors, Exit Code Handling, and CrashLoopBackOff Demystified"
date: 2026-11-02T12:45:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "RestartPolicy", "Docker", "CrashLoopBackOff"]
showToc: true
summary: "An in-depth hands-on test of Kubernetes Pod restart policies (Always, OnFailure, Never): simulating exit code 137 terminations via docker kill and normal process completions (exit code 0). Deeply analyzes container replacement, pause container lifecycle, K8S RESTARTS counters, CrashLoopBackOff backoff mechanisms, and verifies the default Always behavior."
---

# K8S Pod RestartPolicy in Action: Always, OnFailure, Never Behaviors, Exit Code Handling, and CrashLoopBackOff Demystified

---

## 1. Creating Three Pods with Different Restart Policies

```bash
[root@master pods]# cat 19-pods-restartPolicy.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: restartpolicy-always
spec:
  # 指定容器的重启策略: Always, OnFailure, Never. Default to Always
  restartPolicy: Always
  containers:
  - image: harbor:443/dawn/stress:1.0.4
    name: stress
    command: ["sleep","60"]
    imagePullPolicy: Always

---

apiVersion: v1
kind: Pod
metadata:
  name: restartpolicy-onfailure
spec:
  # 指定容器的重启策略: Always, OnFailure, Never. Default to Always
  restartPolicy: OnFailure
  containers:
  - image: harbor:443/dawn/stress:1.0.4
    name: stress
    command: ["sleep","120"]
    imagePullPolicy: Always

---

apiVersion: v1
kind: Pod
metadata:
  name: restartpolicy-never
spec:
  # 指定容器的重启策略: Always, OnFailure, Never. Default to Always
  restartPolicy: Never
  containers:
  - image: harbor:443/dawn/stress:1.0.4
    name: stress
    command: ["sleep","120"]
    imagePullPolicy: Always
```

```bash
[root@master pods]# kubectl apply -f 19-pods-restartPolicy.yaml
pod/restartpolicy-always created
pod/restartpolicy-onfailure created
pod/restartpolicy-never created

[root@master pods]# kubectl wait --for=condition=Ready pod/restartpolicy-always --timeout=90s
pod/restartpolicy-always condition met
[root@master pods]# kubectl wait --for=condition=Ready pod/restartpolicy-onfailure --timeout=90s
pod/restartpolicy-onfailure condition met
[root@master pods]# kubectl wait --for=condition=Ready pod/restartpolicy-never --timeout=90s
pod/restartpolicy-never condition met

[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS    RESTARTS   AGE   IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      1/1     Running   0          8s    10.100.1.142   worker01   <none>           <none>
restartpolicy-never       1/1     Running   0          8s    10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   1/1     Running   0          8s    10.100.2.138   worker02   <none>           <none>
```

All three Pods are Running: always is scheduled on worker01, while never/onfailure are on worker02.

---

## 2. worker01: Killing Always Container → Automatic Restart

`docker kill` sends SIGKILL; the container terminates with exit code 137 (abnormal termination):

```bash
[root@worker01 ~]# docker ps -a | grep k8s_stress_restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Up 31 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

[root@worker01 ~]# docker kill d532dc696e8b
d532dc696e8b

# Inspect immediately after kill:
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Exited (137) Less than a second ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   33 seconds ago   Up 32 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

# Inspect after a short wait: new container _1 has started, pause container remains unchanged
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
b58dafbbce21   harbor:443/dawn/stress   "sleep 60"   21 seconds ago   Up 21 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_1
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   54 seconds ago   Exited (137) 22 seconds ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   55 seconds ago   Up 55 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
```

Container suffix changed from `_0` to `_1`. Under the Always policy, the killed container is immediately recreated. The pause container remains intact—the restart applies only to the application container; the Pod itself and its IP address remain unchanged.

---

## 3. worker02: Killing Never and OnFailure Containers → One Lives, One Dies

Both never and onfailure were scheduled onto worker02, so they are tested together here:

```bash
[root@worker02 ~]# docker ps -a | grep -E 'k8s_stress_restartpolicy-(never|onfailure)'
f0ca3d697734   harbor:443/dawn/stress   "sleep 120"   33 seconds ago   Up 32 seconds   k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0
b4638a0d16f9   harbor:443/dawn/stress   "sleep 120"   33 seconds ago   Up 32 seconds   k8s_stress_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0

[root@worker02 ~]# docker kill b4638a0d16f9 f0ca3d697734
b4638a0d16f9
f0ca3d697734

[root@worker02 ~]# docker ps -a | grep -E 'restartpolicy-(never|onfailure)'
f0ca3d697734   harbor:443/dawn/stress   "sleep 120"   33 seconds ago   Exited (137) Less than a second ago   k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0
b4638a0d16f9   harbor:443/dawn/stress   "sleep 120"   33 seconds ago   Exited (137) Less than a second ago   k8s_stress_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
81593afdd017   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   35 seconds ago   Up 34 seconds   k8s_POD_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0
56c13aa84912   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   35 seconds ago   Up 34 seconds   k8s_POD_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0

# After waiting a moment: onfailure new container _1 appears; never shows no change at all
[root@worker02 ~]# docker ps -a | grep restartpolicy-onfailure
ba1c3ce46595   harbor:443/dawn/stress   "sleep 120"   28 seconds ago       Up 28 seconds       k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_1
f0ca3d697734   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0
81593afdd017   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Up About a minute   k8s_POD_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0

[root@worker02 ~]# docker ps -a | grep restartpolicy-never
b4638a0d16f9   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
56c13aa84912   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Exited (0) 27 seconds ago   k8s_POD_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
```

**onfailure**: Container is killed (abnormal exit 137) → new container `_1` is spawned → restarts upon abnormal termination.

**never**: Container `_0` stays at Exited (137) with no new container created; even its pause container exits → never restarts, even on abnormal termination.

---

## 4. master: K8s-Level RESTARTS Counter

```bash
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS    RESTARTS      AGE   IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      1/1     Running   1 (46s ago)   80s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error     0             80s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   1/1     Running   1 (44s ago)   80s   10.100.2.138   worker02   <none>           <none>
```

Directly correlates with the phenomena observed at the Docker level. Digging into exit details using describe:

```bash
# never: never restarted; termination details reside in State
[root@master pods]# kubectl describe pod restartpolicy-never | grep -B2 -A8 'State:'
      sleep
      120
    State:          Terminated
      Reason:       Error
      Exit Code:    137
      Started:      Mon, 02 Nov 2026 11:07:31 +0800
      Finished:     Mon, 02 Nov 2026 11:08:04 +0800
    Ready:          False
    Restart Count:  0

# onfailure: has restarted; previous termination details reside in Last State
[root@master pods]# kubectl describe pod restartpolicy-onfailure | grep -A6 'Last State'
    Last State:     Terminated
      Reason:       Error
      Exit Code:    137
      Started:      Mon, 02 Nov 2026 11:07:31 +0800
      Finished:     Mon, 02 Nov 2026 11:08:04 +0800
    Ready:          True
    Restart Count:  1
```

---

## 5. Three Behaviors Under Normal Exit (Exit Code 0)

The `sleep 60` in always finishes its 60s and exits with code 0, and the `sleep 120` in onfailure finishes its 120s and also exits with code 0:

```bash
# always has restarted for the 2nd time (natural exit 0 → still restarts); onfailure exits normally after 120s
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS             RESTARTS      AGE    IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      0/1     CrashLoopBackOff   2 (20s ago)   3m8s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error              0             3m8s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   0/1     Completed          1             3m8s   10.100.2.138   worker02   <none>           <none>

# always: last exit code was 0 (Completed) - restarts whenever it terminates, regardless of exit code
[root@master pods]# kubectl get pod restartpolicy-always -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}{"  reason="}{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}'
0  reason=Completed

# onfailure: normal exit 0 → does not restart; Pod transitions to Completed (Succeeded)
[root@master pods]# kubectl get pod restartpolicy-onfailure -o jsonpath='{.status.phase}{" restarts="}{.status.containerStatuses[0].restartCount}{"\n"}'
Succeeded restarts=1

[root@master pods]# kubectl describe pod restartpolicy-onfailure | grep -A5 'State:'
    State:          Terminated
      Reason:       Completed
      Exit Code:    0
      Started:      Mon, 02 Nov 2026 11:08:05 +0800
      Finished:     Mon, 02 Nov 2026 11:10:05 +0800
    Ready:          False
```

| Policy | Abnormal Exit (137) | Normal Exit (0) |
| --- | --- | --- |
| Always | Restarts (1st time) | Still restarts (2nd time, CrashLoopBackOff represents restart backoff delay) |
| OnFailure | Restarts (1st time) | Does not restart → Completed |
| Never | Does not restart → Error | Does not restart → Completed |

This also explains `CrashLoopBackOff`: under the Always policy, when a container terminates repeatedly in short succession, kubelet exponentially backs off restarts (10s → 20s → 40s … capped at 5min). This is normal Always behavior, not a system failure.

---

## 6. Verifying the Default Always Value

Creating a Pod without specifying restartPolicy to verify:

```bash
[root@master pods]# cat 20-pods-default-restartPolicy.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: restartpolicy-default
spec:
  # 故意不写 restartPolicy，验证默认值
  containers:
  - image: harbor:443/dawn/stress:1.0.4
    name: stress
    command: ["sleep","3600"]
    imagePullPolicy: Always
```

```bash
[root@master pods]# kubectl apply -f 20-pods-default-restartPolicy.yaml
pod/restartpolicy-default created

[root@master pods]# kubectl wait --for=condition=Ready pod/restartpolicy-default --timeout=90s
pod/restartpolicy-default condition met

[root@master pods]# kubectl get pod restartpolicy-default -o jsonpath='{.spec.restartPolicy}{"\n"}'
Always

[root@master pods]# kubectl delete -f 20-pods-default-restartPolicy.yaml
pod "restartpolicy-default" deleted
```

When left undeclared, the API Server defaults to `restartPolicy: Always`. Empirical verification holds.
