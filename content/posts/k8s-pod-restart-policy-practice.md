---
title: "K8S Pod 重启策略实战全解：Always、OnFailure 与 Never 底层行为、退出码机制与 CrashLoopBackOff 剖析"
date: 2026-11-02T12:45:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "RestartPolicy", "Docker", "CrashLoopBackOff"]
showToc: true
summary: "深入实测 Kubernetes Pod 的三种重启策略（Always、OnFailure、Never）：通过 docker kill 模拟 137 异常退出与 sleep 自然退出（Exit Code 0），从容器重建、pause 容器生命周期、K8S RESTARTS 计数器以及 CrashLoopBackOff 退避机制全面剖析 Pod 重启底层原理，并实证未声明时的默认 Always 策略。"
---

# K8S Pod 重启策略实战全解：Always、OnFailure 与 Never 底层行为、退出码机制与 CrashLoopBackOff 剖析

---

## 一、创建三个不同重启策略的 Pod

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

三个 Pod 均 Running，always 在 worker01，never/onfailure 在 worker02

---

## 二、worker01：kill always 容器 → 自动重启

`docker kill` 发 SIGKILL，容器以 137（异常退出）死亡：

```bash
[root@worker01 ~]# docker ps -a | grep k8s_stress_restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Up 31 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

[root@worker01 ~]# docker kill d532dc696e8b
d532dc696e8b

# kill 后立刻查看：
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Exited (137) Less than a second ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   33 seconds ago   Up 32 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

# 稍等一会后再看：新容器 _1 已启动，pause 容器始终不变
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
b58dafbbce21   harbor:443/dawn/stress   "sleep 60"   21 seconds ago   Up 21 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_1
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   54 seconds ago   Exited (137) 22 seconds ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   55 seconds ago   Up 55 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
```

容器后缀 `_0` → `_1`，Always 策略下容器被杀立即重建。pause 容器没变——重启的是业务容器，Pod本身不变，IP 也不变

---

## 三、worker02：kill never / onfailure 容器 → 一生一死

never 和 onfailure 都被调度到了 worker02，在这里一并测试：

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

# 等待一会儿后：onfailure 新容器 _1 出现；never 毫无变化
[root@worker02 ~]# docker ps -a | grep restartpolicy-onfailure
ba1c3ce46595   harbor:443/dawn/stress   "sleep 120"   28 seconds ago       Up 28 seconds       k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_1
f0ca3d697734   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0
81593afdd017   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Up About a minute   k8s_POD_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0

[root@worker02 ~]# docker ps -a | grep restartpolicy-never
b4638a0d16f9   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
56c13aa84912   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Exited (0) 27 seconds ago   k8s_POD_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
```

**onfailure**：容器被 kill（137 异常退出）→ 新容器 `_1` 拉起 → 异常退出会重启

**never**：容器 `_0` 停在 Exited (137)，没有任何新容器，连 pause 容器都退出了 → 异常退出也不重启

---

## 四、master：K8s 层面的 RESTARTS 计数

```bash
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS    RESTARTS      AGE   IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      1/1     Running   1 (46s ago)   80s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error     0             80s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   1/1     Running   1 (44s ago)   80s   10.100.2.138   worker02   <none>           <none>
```

与 docker 层现象一一对应。describe 深挖退出详情：

```bash
# never：没重启过，终止信息在 State 里
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

# onfailure：重启过，上一次终止信息在 Last State 里
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

## 五、正常退出（Exit Code 0）时的三种表现

always 的 `sleep 60` 跑满 60s 会以 0 退出，onfailure 的 `sleep 120` 跑满 120s 也会以 0 退出

```bash
# always 已第 2 次重启（自然退出 0 → 照样重启），onfailure 跑满 120s 正常退出
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS             RESTARTS      AGE    IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      0/1     CrashLoopBackOff   2 (20s ago)   3m8s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error              0             3m8s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   0/1     Completed          1             3m8s   10.100.2.138   worker02   <none>           <none>

# always：上一次退出码是 0（Completed）——只要退出就重启，与退出码无关
[root@master pods]# kubectl get pod restartpolicy-always -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}{"  reason="}{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}'
0  reason=Completed

# onfailure：正常退出 0 → 不重启，Pod 进入 Completed（Succeeded）
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

| 策略      | 异常退出（137） | 正常退出（0）                                        |
| --------- | --------------- | ---------------------------------------------------- |
| Always    | 重启（第 1 次） | 照样重启（第 2 次，CrashLoopBackOff 是重启间隔退避） |
| OnFailure | 重启（第 1 次） | 不重启 → Completed                                   |
| Never     | 不重启 → Error  | 不重启 → Completed                                   |

顺带解释了 `CrashLoopBackOff`：Always 策略下容器反复短命退出，kubelet 按 10s→20s→40s…（上限 5min）退避后再次重启，属于 Always 的正常工作方式，不是故障

---

## 六、默认值 Always 实证

建一个不写 restartPolicy 的 Pod 验证：

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

不声明时 API Server 默认填充 `restartPolicy: Always`，实证成立