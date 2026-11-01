---
title: "K8S 静的 Pod メカニズム実践解説：kubeadm 起動原理からコントロールプレーン障害演習まで"
date: 2026-11-01T20:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Pod", "kubelet", "kubeadm", "StaticPod"]
showToc: true
summary: "Kubernetes の静的 Pod（Static Pod）の動作メカニズムと kubelet のデーモンロジックを深掘りし、kubeadm がコントロールプレーン主要4コンポーネントをブートストラップする原理を解明。カスタム静的 Pod による自己修復特性の検証から、apiserver 障害注入と復旧演習まで実践解説します。"
---

# K8S 静的 Pod メカニズム実践解説：kubeadm 起動原理からコントロールプレーン障害演習まで

## 静的 Pod：kubeadm の起動原理

### 1. 役割

静的 Pod は apiserver を経由せず、Pod マニフェストを kubelet が認識するディレクトリに配置するだけで直接起動されます。kubeadm でデプロイされる4大コンポーネントはこの方式によって実現されています。

### 2. kubelet の静的 Pod ディレクトリ

```bash
[root@master ~]# grep staticPodPath /var/lib/kubelet/config.yaml
staticPodPath: /etc/kubernetes/manifests

[root@master ~]# ll /etc/kubernetes/manifests/
total 24
drwxr-xr-x 2 root root 4096 Oct 30 12:54 ./
drwxr-xr-x 4 root root 4096 Oct 30 12:54 ../
-rw------- 1 root root 2274 Oct 30 12:54 etcd.yaml
-rw------- 1 root root 4020 Oct 30 12:54 kube-apiserver.yaml
-rw------- 1 root root 3546 Oct 30 12:54 kube-controller-manager.yaml
-rw------- 1 root root 1465 Oct 30 12:54 kube-scheduler.yaml
```

### 3. カスタム静的 Pod の実践事例

```bash
[root@master ~]# cat /dawn/manifests/pods/01-pods-xiuxian-single.yaml
```

```yaml
# 指定api的版本号
apiVersion: v1
# 指定资源的类型
kind: Pod
# 指定元数据信息
metadata:
  # 声明资源的名称
  name: xiuxian-v1
# 定义资源的期望状态
spec:
  # 指定Pod调度到哪个节点（静态Pod会忽略该字段，落在文件所在节点）
  nodeName: worker01
  # 指定Pod内的容器
  containers:
    # 指定容器的镜像
  - image: harbor:443/dawn/apps:v1
    # 指定容器的名称
    name: xiuxian
```

```bash
[root@master ~]# cp /dawn/manifests/pods/01-pods-xiuxian-single.yaml /etc/kubernetes/manifests/

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP           NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          7s    10.100.0.10  master      <none>           <none>
```

kubectl からは削除できず、削除しても自動的に再作成されます：

```bash
[root@master ~]# kubectl delete pod xiuxian-v1-master
pod "xiuxian-v1-master" deleted

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP           NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          3s    10.100.0.10  master      <none>           <none>
```

### 4. マルチノード展開と削除

```bash
[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker01:/etc/kubernetes/manifests/

[root@master ~]# scp /dawn/manifests/pods/01-pods-xiuxian-single.yaml worker02:/etc/kubernetes/manifests/

[root@master ~]# kubectl get pods -o wide
NAME                 READY   STATUS    RESTARTS   AGE     IP            NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1-master    1/1     Running   0          2m46s   10.100.0.10   master      <none>           <none>
xiuxian-v1-worker01  1/1     Running   0          12s     10.100.1.137  worker01    <none>           <none>
xiuxian-v1-worker02  1/1     Running   0          4s      10.100.2.133  worker02    <none>           <none>
```

削除は各ノード上のファイルを rm して取り除くだけです。

### 5. apiserver ファイルの削除によるクラスタ障害の実演

```bash
[root@master ~]# mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

[root@master ~]# kubectl get nodes
The connection to the server 11.0.1.231:6443 was refused - did you specify the right host or port?
```

```bash
[root@master ~]# mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

[root@master ~]# kubectl get nodes
NAME        STATUS   ROLES                  AGE       VERSION
master      Ready    control-plane,master   7d1h      v1.23.17
worker01    Ready    <none>                 7d1h      v1.23.17
worker02    Ready    <none>                 7d1h      v1.23.17
```

kubeadm 方式でデプロイされた K8S クラスタでは、kubelet のOS自動起動が必須です。起動時に kubelet が静的 Pod リソースを自動的にロードします。
