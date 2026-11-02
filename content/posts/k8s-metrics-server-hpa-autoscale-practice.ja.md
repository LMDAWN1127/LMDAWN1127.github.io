---
title: "K8S 自動スケーリング実践解説：Metrics-Server 監視基盤の構築と HPA 負荷テスト・水平自動伸縮の全手順"
date: 2026-11-02T21:10:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "MetricsServer", "HPA", "AutoScaling", "Monitoring"]
showToc: true
summary: "Kubernetes におけるリソース指標監視基盤の構築と水平オートスケーリングの全貌：公式 metrics-server マニフェストの本番向けパラメータ調整（セキュアポート、自己署名 TLS 証明書の信頼、収集間隔の最適化）と kubectl top の検証から、stress を用いた高負荷 CPU テスト、HPA の動的スケールアウト（2→6→10 レプリカ）とクールダウン縮小の検証、命令的および autoscaling/v2 宣言的 YAML の両手法まで徹底解説。"
---

# K8S 自動スケーリング実践解説：Metrics-Server 監視基盤の構築と HPA 負荷テスト・水平自動伸縮の全手順

---

## 一、metrics-server のデプロイと検証

### 1.1 概要

Metrics Server は kubelet からリソース指標を収集し、Metrics API 経由で apiserver に公開して HPA や VPA に提供します。`kubectl top` コマンドもこれに依存しています。

**参考リンク：**

- https://github.com/kubernetes-sigs/metrics-server
- https://github.com/kubernetes/kubernetes/tree/master/cluster/addons/metrics-server

### 1.2 インストール前

```bash
[root@master ~]# kubectl top node
error: Metrics API not available

[root@master ~]# kubectl top pods
error: Metrics API not available
```

### 1.3 イメージのインポート

```bash
[root@master ~]# docker pull registry.aliyuncs.com/google_containers/metrics-server:v0.6.3
d7f870112e68: Download complete
Digest: sha256:8839d0a5b2cb6f3977f81d3fccc874f05af0763fb4352250f7ce73c35d083d56
Status: Downloaded newer image

[root@master ~]# docker tag registry.aliyuncs.com/google_containers/metrics-server:v0.6.3   harbor:443/library/metrics-server:v0.6.3
[root@master ~]# docker push harbor:443/library/metrics-server:v0.6.3
```

### 1.4 公式マニフェストのダウンロード

```bash
[root@master ~]# wget https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/high-availability-1.21+.yaml
# 官方HA版
```

### 1.5 マニフェストの編集（本環境への適合）

公式マニフェストを当環境の v0.6.3 ＋ Harbor イメージに合わせて調整します：

```yaml
# Deployment 部分修改
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-server
  namespace: kube-system
spec:
  replicas: 1              # 2→1，小集群无需 HA
  template:
    spec:
      containers:
      - args:
        - --cert-dir=/tmp
        - --secure-port=4443           # 10250→4443（v0.6.3 默认值）
        - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
        - --metric-resolution=30s      # 15s→30s（采集间隔放宽）
        - --kubelet-insecure-tls       # 添加此行（kubelet 自签证书）
        # 删除 --kubelet-use-node-status-port（v0.7+ 才支持）
        image: harbor:443/library/metrics-server:v0.6.3
        ports:
        - containerPort: 4443          # 10250→4443，必须同步
```

### 1.6 アプリケーションの適用

```bash
[root@master ~]# kubectl apply -f high-availability-1.21+-dawn.yaml
serviceaccount/metrics-server created
clusterrole.rbac.authorization.k8s.io/system:aggregated-metrics-reader created
clusterrole.rbac.authorization.k8s.io/system:metrics-server created
rolebinding.rbac.authorization.k8s.io/metrics-server-auth-reader created
clusterrolebinding.rbac.authorization.k8s.io/metrics-server:system:auth-delegator created
clusterrolebinding.rbac.authorization.k8s.io/system:metrics-server created
service/metrics-server created
deployment.apps/metrics-server created
poddisruptionbudget.policy/metrics-server created
apiservice.apiregistration.k8s.io/v1beta1.metrics.k8s.io created
```

### 1.7 動作検証

```bash
[root@master ~]# kubectl -n kube-system get pods -l k8s-app=metrics-server -o wide
NAME                              READY   STATUS    RESTARTS   AGE   IP             NODE
metrics-server-595b44687d-xn6h8   1/1     Running   0          68s   10.100.2.236   worker02

[root@master ~]# kubectl top node
NAME       CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
master     230m         11%    2285Mi          80%
worker01   50m          2%     1489Mi          52%
worker02   49m          2%     1945Mi          68%

[root@master ~]# kubectl top pod -n kube-system
NAME                              CPU(cores)   MEMORY(bytes)
coredns-6d8c4cb4d-qkn74           6m           16Mi
coredns-6d8c4cb4d-vxxvm           4m           16Mi
etcd-master                       21m          71Mi
kube-apiserver-master             63m          688Mi
kube-controller-manager-master    39m          249Mi
kube-proxy-j7js7                  1m           23Mi
kube-proxy-lsxcn                  4m           25Mi
kube-proxy-mzbpc                  1m           22Mi
kube-scheduler-master             7m           27Mi
metrics-server-595b44687d-xn6h8   3m           14Mi
```

---

## 二、Pod 数の手動水平スケーリング

### 2.1 概要

- **水平スケーリング（スケールアウト）：** 同等スペックのノード（または Pod レプリカ）を増設
- **垂直スケーリング（スケールアップ）：** 既存ノードのハードウェアスペック（CPU/メモリ）を増強

### 2.2 実機演習

まず 5 レプリカの Deployment を作成：

```bash
[root@master ~]# kubectl create deploy deloy-xiuxian --image=harbor:443/dawn/apps:v2 --replicas=5
deployment.apps/deloy-xiuxian created

[root@master ~]# kubectl get pods -o wide | grep deloy-xiuxian
deloy-xiuxian-5fc6d4f655-4xt86   1/1   Running   9s    10.100.1.196   worker01
deloy-xiuxian-5fc6d4f655-9lm9t   1/1   Running   9s    10.100.2.238   worker02
deloy-xiuxian-5fc6d4f655-mhkj7   1/1   Running   9s    10.100.1.198   worker01
deloy-xiuxian-5fc6d4f655-pnkfn   1/1   Running   9s    10.100.1.197   worker01
deloy-xiuxian-5fc6d4f655-s8nbw   1/1   Running   9s    10.100.2.237   worker02
```

3 レプリカへ縮小（スケールイン）：

```bash
[root@master ~]# kubectl scale --replicas=3 deployment deloy-xiuxian
deployment.apps/deloy-xiuxian scaled

[root@master ~]# kubectl get pods -o wide | grep deloy-xiuxian
deloy-xiuxian-5fc6d4f655-9lm9t   1/1   Running   32s    10.100.2.238   worker02
deloy-xiuxian-5fc6d4f655-mhkj7   1/1   Running   32s    10.100.1.198   worker01
deloy-xiuxian-5fc6d4f655-s8nbw   1/1   Running   32s    10.100.2.237   worker02
```

5 レプリカへ再拡大（スケールアウト）：

```bash
[root@master ~]# kubectl scale --replicas=5 deployment deloy-xiuxian
deployment.apps/deloy-xiuxian scaled

[root@master ~]# kubectl get pods -o wide | grep deloy-xiuxian
deloy-xiuxian-5fc6d4f655-7pddw   1/1   Running   5s    10.100.1.200   worker01
deloy-xiuxian-5fc6d4f655-9lm9t   1/1   Running   38s   10.100.2.238   worker02
deloy-xiuxian-5fc6d4f655-mhkj7   1/1   Running   38s   10.100.1.198   worker01
deloy-xiuxian-5fc6d4f655-s8nbw   1/1   Running   38s   10.100.2.237   worker02
deloy-xiuxian-5fc6d4f655-w45pq   1/1   Running   5s    10.100.1.199   worker01
```

---

## 三、Pod 数の水平自動スケーリング（命令的・リアクティブ実装）

### 3.1 テスト環境の準備

```bash
[root@master ~]# kubectl create deploy deploy-stress --image=harbor:443/dawn/stress:1.0.4   --replicas=1 -- sleep 3600
deployment.apps/deploy-stress created

[root@master ~]# kubectl set resources deploy deploy-stress   --requests=cpu=200m,memory=100Mi --limits=cpu=500m,memory=200Mi

[root@master ~]# kubectl get pods -o wide | grep deploy-stress
deploy-stress-55644ffbd9-rbrng   1/1   Running   0   6s   10.100.2.239   worker02
```

### 3.2 自動スケーリングルールの命令的作成

```bash
[root@master ~]# kubectl get hpa
No resources found in default namespace.

[root@master ~]# kubectl autoscale deployment deploy-stress --cpu-percent=85 --min=2 --max=10
horizontalpodautoscaler.autoscaling/deploy-stress autoscaled

[root@master ~]# kubectl get hpa
NAME            REFERENCE                  TARGETS         MINPODS   MAXPODS   REPLICAS   AGE
deploy-stress   Deployment/deploy-stress   <unknown>/85%   2         10        0          3s

# metrics 采集完成后 HPA 自动扩容到 min=2
[root@master ~]# kubectl get pods -o wide | grep deploy-stress
deploy-stress-55644ffbd9-lx954   1/1   Running   21s   10.100.1.206   worker01
deploy-stress-55644ffbd9-rbrng   1/1   Running   62s   10.100.2.239   worker02
```

### 3.3 負荷テスト

2 つの Pod 内で stress コマンドを実行し CPU 負荷を生成：

```bash
[root@master ~]# kubectl exec deploy-stress-55644ffbd9-lx954 -- sh -c 'stress --cpu 2 --timeout 120s &'
[root@master ~]# kubectl exec deploy-stress-55644ffbd9-rbrng -- sh -c 'stress --cpu 2 --timeout 120s &'
stress: info: [13] dispatching hogs: 2 cpu, 0 io, 0 vm, 0 hdd
```

### 3.4 HPA の動的変化を観察

```bash
# 20 秒后：CPU 189%，副本 6
[root@master ~]# kubectl get hpa
NAME            REFERENCE                  TARGETS    MINPODS   MAXPODS   REPLICAS   AGE
deploy-stress   Deployment/deploy-stress   189%/85%   2         10        6          2m49s

[root@master ~]# kubectl top pod -l app=deploy-stress
NAME                             CPU(cores)   MEMORY(bytes)
deploy-stress-55644ffbd9-4dwkb   501m         0Mi
deploy-stress-55644ffbd9-4pvn7   471m         0Mi
deploy-stress-55644ffbd9-54z46   256m         0Mi
deploy-stress-55644ffbd9-fmzvz   44m          0Mi
deploy-stress-55644ffbd9-lx954   499m         0Mi
deploy-stress-55644ffbd9-rbrng   500m         0Mi

# 3 分 38 秒后：166%/85%，达到上限 10 副本
[root@master ~]# kubectl get hpa
NAME            REFERENCE                  TARGETS    MINPODS   MAXPODS   REPLICAS   AGE
deploy-stress   Deployment/deploy-stress   166%/85%   2         10        10         3m38s

[root@master ~]# kubectl get pods -l app=deploy-stress --no-headers | wc -l
10
```

### 3.5 負荷終了後の自動縮小

```bash
# stress 120s 到期后，CPU 迅速降回 0
[root@master ~]# kubectl get hpa
NAME            REFERENCE                  TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
deploy-stress   Deployment/deploy-stress   0%/85%    2         10        10         5m30s

# 缩容有 5 分钟稳定窗口，等待后自动回到 min=2
[root@master ~]# kubectl get hpa
NAME            REFERENCE                  TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
deploy-stress   Deployment/deploy-stress   0%/85%    2         10        2          10m
```

**HPA 伸縮の全タイムライン：**

| 時間 | TARGETS | REPLICAS |
| --- | --- | --- |
| 初期状態 | 0%/85% | 2（min） |
| +20s (stress 開始) | **189%/85%** | **6** |
| +40s | 166%/85% | 10（max 上限） |
| +5m (stress 終了) | 0%/85% | 10（クールダウン中） |
| +10m | 0%/85% | **2**（min へ復帰） |

---

## 四、HPA の宣言的作成

```yaml
# 02-hpa-deploy-stress.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: deploy-stress
  namespace: default
spec:
  maxReplicas: 10
  metrics:
  - resource:
      name: cpu
      target:
        averageUtilization: 85
        type: Utilization
    type: Resource
  minReplicas: 2
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: deploy-stress
```

```bash
[root@master ~]# kubectl apply -f 02-hpa-deploy-stress.yaml
horizontalpodautoscaler.autoscaling/deploy-stress created

[root@master ~]# kubectl get hpa
NAME            REFERENCE                  TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
deploy-stress   Deployment/deploy-stress   0%/85%    2         10        2          15s
```
