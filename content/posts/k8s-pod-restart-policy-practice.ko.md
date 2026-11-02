---
title: "K8S Pod 재시작 정책(RestartPolicy) 실전 분석: Always, OnFailure, Never 동작 차이와 종료 코드 및 CrashLoopBackOff 메커니즘"
date: 2026-11-02T12:45:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "RestartPolicy", "Docker", "CrashLoopBackOff"]
showToc: true
summary: "Kubernetes Pod 의 3가지 재시작 정책(Always, OnFailure, Never) 실전 검증: docker kill 을 통한 비정상 종료(137)와 정상 완료(0) 상황을 비교 테스트하고 컨테이너 재생성, pause 컨테이너 수명 주기, K8S RESTARTS 카운터 변화, CrashLoopBackOff 백오프 메커니즘 및 기본 Always 정책 검증까지 상세히 분석합니다."
---

# K8S Pod 재시작 정책(RestartPolicy) 실전 분석: Always, OnFailure, Never 동작 차이와 종료 코드 및 CrashLoopBackOff 메커니즘

---

## 1. 서로 다른 재시작 정책을 가진 3개의 Pod 생성

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

3개의 Pod 모두 Running 상태이며, always 는 worker01, never/onfailure 는 worker02 에 배치.

---

## 2. worker01: always 컨테이너 kill → 자동 재시작

`docker kill` 은 SIGKILL 을 전송하며, 컨테이너는 137(비정상 종료) 코드로 종료:

```bash
[root@worker01 ~]# docker ps -a | grep k8s_stress_restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Up 31 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

[root@worker01 ~]# docker kill d532dc696e8b
d532dc696e8b

# kill 직후 확인:
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Exited (137) Less than a second ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   33 seconds ago   Up 32 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

# 잠시 대기 후 재확인: 새 컨테이너 _1 실행됨, pause 컨테이너는 변경 없음
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
b58dafbbce21   harbor:443/dawn/stress   "sleep 60"   21 seconds ago   Up 21 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_1
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   54 seconds ago   Exited (137) 22 seconds ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   55 seconds ago   Up 55 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
```

컨테이너 접미사가 `_0` → `_1` 로 변경. Always 정책 하에서 강제 종료된 컨테이너는 즉시 재생성됩니다. pause 컨테이너는 그대로 유지됨—재시작되는 것은 애플리케이션 컨테이너뿐이며, Pod 자체와 IP 는 유지됩니다.

---

## 3. worker02: never / onfailure 컨테이너 kill → 삶과 죽음의 차이

never 와 onfailure 모두 worker02 에 스케줄링되었으므로 여기서 함께 테스트:

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

# 잠시 대기 후: onfailure 새 컨테이너 _1 실행; never 는 전혀 변화 없음
[root@worker02 ~]# docker ps -a | grep restartpolicy-onfailure
ba1c3ce46595   harbor:443/dawn/stress   "sleep 120"   28 seconds ago       Up 28 seconds       k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_1
f0ca3d697734   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0
81593afdd017   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Up About a minute   k8s_POD_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0

[root@worker02 ~]# docker ps -a | grep restartpolicy-never
b4638a0d16f9   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
56c13aa84912   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Exited (0) 27 seconds ago   k8s_POD_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
```

**onfailure**: 컨테이너가 kill(137 비정상 종료)됨 → 새 컨테이너 `_1` 기동 → 비정상 종료 시 재시작.

**never**: 컨테이너 `_0` 가 Exited (137) 상태로 정지, 새 컨테이너가 생성되지 않으며 pause 컨테이너마저 종료 → 비정상 종료 시에도 재시작하지 않음.

---

## 4. master: K8s 관점의 RESTARTS 카운터

```bash
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS    RESTARTS      AGE   IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      1/1     Running   1 (46s ago)   80s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error     0             80s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   1/1     Running   1 (44s ago)   80s   10.100.2.138   worker02   <none>           <none>
```

Docker 레벨의 현상과 정확히 일치. describe 명령으로 상세 종료 정보 확인:

```bash
# never: 재시작된 적 없음, 종료 정보는 State 에 보관
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

# onfailure: 재시작됨, 직전 종료 정보는 Last State 에 보관
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

## 5. 정상 종료(Exit Code 0) 시 세 가지 동작 차이

always 의 `sleep 60` 은 60초를 채우고 0으로 종료되며, onfailure 의 `sleep 120` 도 120초를 채우고 0으로 종료:

```bash
# always 2번째 재시작됨 (자연 종료 0 → 마찬가지로 재시작), onfailure 120초 경과 후 정상 종료
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS             RESTARTS      AGE    IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      0/1     CrashLoopBackOff   2 (20s ago)   3m8s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error              0             3m8s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   0/1     Completed          1             3m8s   10.100.2.138   worker02   <none>           <none>

# always: 직전 종료 코드는 0(Completed)——종료 코드와 관계없이 종료되면 무조건 재시작
[root@master pods]# kubectl get pod restartpolicy-always -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}{"  reason="}{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}'
0  reason=Completed

# onfailure: 정상 종료 0 → 재시작하지 않음, Pod 는 Completed(Succeeded) 상태로 전환
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

| 정책 | 비정상 종료 (137) | 정상 종료 (0) |
| --- | --- | --- |
| Always | 재시작 (1회차) | 마찬가지로 재시작 (2회차, CrashLoopBackOff 는 재시작 지연 백오프) |
| OnFailure | 재시작 (1회차) | 재시작 안 함 → Completed |
| Never | 재시작 안 함 → Error | 재시작 안 함 → Completed |

아울러 `CrashLoopBackOff` 의 동작 원리를 확인: Always 정책에서 컨테이너가 반복적으로 빠르게 종료될 때 kubelet 은 10s→20s→40s…(최대 5분) 간격으로 백오프 지연을 두고 재시작을 시도합니다. 이는 Always 정책의 정상적인 동작 메커니즘이며 장애가 아닙니다.

---

## 6. 기본값 Always 실증

restartPolicy 를 선언하지 않은 Pod 를 생성하여 검증:

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

명시적으로 선언하지 않을 경우 API Server 가 기본값으로 `restartPolicy: Always` 를 적용함을 실증 완료.
