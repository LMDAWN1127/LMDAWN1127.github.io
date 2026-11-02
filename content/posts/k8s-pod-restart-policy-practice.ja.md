---
title: "K8S Pod 再起動ポリシー実践解説：Always・OnFailure・Never の挙動差異、終了コードと CrashLoopBackOff の深層"
date: 2026-11-02T12:45:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "RestartPolicy", "Docker", "CrashLoopBackOff"]
showToc: true
summary: "Kubernetes における Pod 再起動ポリシー（Always、OnFailure、Never）の実機検証：docker kill による異常終了（137）および正常終了（0）の挙動を比較し、コンテナ再作成、pause コンテナの挙動、RESTARTS カウンタの推移、CrashLoopBackOff のバックオフ機構、デフォルト値（Always）の検証まで徹底解剖します。"
---

# K8S Pod 再起動ポリシー実践解説：Always・OnFailure・Never の挙動差異、終了コードと CrashLoopBackOff の深層

---

## 一、異なる再起動ポリシーを持つ 3 つの Pod を作成

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

3 つの Pod はすべて Running 状態。always は worker01、never / onfailure は worker02 に配置。

---

## 二、worker01：always コンテナを kill → 自動再起動

`docker kill` で SIGKILL を送信、コンテナは終了コード 137（異常終了）で停止：

```bash
[root@worker01 ~]# docker ps -a | grep k8s_stress_restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Up 31 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

[root@worker01 ~]# docker kill d532dc696e8b
d532dc696e8b

# kill 直後に確認：
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   32 seconds ago   Exited (137) Less than a second ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   33 seconds ago   Up 32 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0

# しばらく待ってから再確認：新コンテナ _1 が起動、pause コンテナは不変
[root@worker01 ~]# docker ps -a | grep restartpolicy-always
b58dafbbce21   harbor:443/dawn/stress   "sleep 60"   21 seconds ago   Up 21 seconds   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_1
d532dc696e8b   harbor:443/dawn/stress   "sleep 60"   54 seconds ago   Exited (137) 22 seconds ago   k8s_stress_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
53f9bd3bc685   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   55 seconds ago   Up 55 seconds   k8s_POD_restartpolicy-always_default_d4810c92-9c24-4d98-a0c0-3ef07f3ef5b8_0
```

コンテナのサフィックスが `_0` → `_1` に変化。Always ポリシーにより強制終了後ただちに再作成。pause コンテナは不変——再起動するのは業務コンテナのみであり、Pod 自体と IP アドレスは維持されます。

---

## 三、worker02：never / onfailure コンテナを kill → 生死の分岐

never と onfailure は共に worker02 にスケジュールされたため、ここで同時に検証：

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

# 少し待機後：onfailure の新コンテナ _1 が起動、never には一切変化なし
[root@worker02 ~]# docker ps -a | grep restartpolicy-onfailure
ba1c3ce46595   harbor:443/dawn/stress   "sleep 120"   28 seconds ago       Up 28 seconds       k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_1
f0ca3d697734   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0
81593afdd017   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Up About a minute   k8s_POD_restartpolicy-onfailure_default_cf636599-91f9-444d-ad5b-8434ba868df8_0

[root@worker02 ~]# docker ps -a | grep restartpolicy-never
b4638a0d16f9   harbor:443/dawn/stress   "sleep 120"   About a minute ago   Exited (137) 29 seconds ago   k8s_stress_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
56c13aa84912   registry.aliyuncs.com/google_containers/pause:3.6   "/pause"   About a minute ago   Exited (0) 27 seconds ago   k8s_POD_restartpolicy-never_default_8c5da659-8ffb-4e31-86a3-2ad2ee9c8235_0
```

**onfailure**：コンテナが kill（137 異常終了）→ 新コンテナ `_1` が起動 → 異常終了時は再起動。

**never**：コンテナ `_0` は Exited (137) のまま停止、新コンテナは作成されず、pause コンテナすら終了 → 異常終了時でも再起動しない。

---

## 四、master：K8s レベルでの RESTARTS カウンタ

```bash
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS    RESTARTS      AGE   IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      1/1     Running   1 (46s ago)   80s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error     0             80s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   1/1     Running   1 (44s ago)   80s   10.100.2.138   worker02   <none>           <none>
```

Docker 層の現象と完全に一致。describe コマンドで詳細な終了ステータスを確認：

```bash
# never：再起動履歴なし、終了情報は State 内に記録
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

# onfailure：再起動済み、直前の終了情報は Last State 内に記録
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

## 五、正常終了（Exit Code 0）時における 3 者挙動の差異

always の `sleep 60` は 60 秒経過後に終了コード 0 で完了し、onfailure の `sleep 120` も 120 秒経過後に終了コード 0 で完了：

```bash
# always は 2 回目の再起動（自然終了 0 → 同様に再起動）、onfailure は 120 秒満了で正常終了
[root@master pods]# kubectl get pods -o wide
NAME                      READY   STATUS             RESTARTS      AGE    IP             NODE       NOMINATED NODE   READINESS GATES
restartpolicy-always      0/1     CrashLoopBackOff   2 (20s ago)   3m8s   10.100.1.142   worker01   <none>           <none>
restartpolicy-never       0/1     Error              0             3m8s   10.100.2.137   worker02   <none>           <none>
restartpolicy-onfailure   0/1     Completed          1             3m8s   10.100.2.138   worker02   <none>           <none>

# always：直前の終了コードは 0（Completed）——終了コードに関係なく停止すれば必ず再起動
[root@master pods]# kubectl get pod restartpolicy-always -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}{"  reason="}{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}'
0  reason=Completed

# onfailure：正常終了 0 → 再起動せず、Pod は Completed（Succeeded）へ遷移
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

| ポリシー | 異常終了（137） | 正常終了（0） |
| --- | --- | --- |
| Always | 再起動（1 回目） | 同様に再起動（2 回目、CrashLoopBackOff は再起動間隔のバックオフ遅延） |
| OnFailure | 再起動（1 回目） | 再起動せず → Completed |
| Never | 再起動せず → Error | 再起動せず → Completed |

あわせて `CrashLoopBackOff` の仕組みを解明：Always ポリシーにおいてコンテナが短時間で繰り返し終了する場合、kubelet は 10s→20s→40s…（上限 5 分）とバックオフ遅延を設けて再起動を試行します。これは Always の正常な動作仕様であり、システム障害ではありません。

---

## 六、デフォルト値 Always の実証

restartPolicy を省略した Pod を作成して検証：

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

明示的に宣言しない場合、API Server が自動的に `restartPolicy: Always` を補完することが実証されました。
