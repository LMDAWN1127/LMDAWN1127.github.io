---
title: "K8Sクラスタ運用実践：kubectlによるマルチクラスタContext切り替えとkubeadm Workerノード動的拡張"
date: 2026-11-03T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "kubeadm", "kubectl", "Cluster"]
showToc: true
summary: "単一のkubeconfigに複数のcontextを集約して複数のKubernetesクラスタを効率的に切り替え・管理する手法と、kubeadm Bootstrap Tokenのライフサイクル管理、新規Workerノードの安全な動的追加手順を実戦解説します。"
---

# K8Sクラスタ運用実践：kubectlによるマルチクラスタContext切り替えとkubeadm Workerノード動的拡張

---

## 一、kubectlによる複数Kubernetesクラスタの管理

単一の物理クラスタ環境においても、kubeconfig内で異なるクラスタ名、ユーザー名、コンテキスト（Context）を定義することでマルチクラスタ環境を忠実にシミュレートし、操作手法を実証できます。

### 方式1：個別のkubeconfigファイルを使用

クラスタごとに独立したkubeconfigファイルを保持し、`--kubeconfig` オプションで切り替える方式です。

#### 現在のクラスタノードを確認

```bash
root@master:~# kubectl get nodes -o wide
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

#### kubeconfig ファイルの確認

```bash
root@master:~# ll ~/.kube/config
-rw------- 1 root root 5638 Nov  3 16:24 /root/.kube/config
```

#### 別のkubeconfigファイルを用いた操作

```bash
root@master:~# kubectl get nodes -o wide --kubeconfig=config
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

---

### 方式2：同一kubeconfigファイルに集約（マルチContext管理）

単一のkubeconfigファイル内に複数のcluster、user、contextを定義し、`kubectl config use-context` により高速に切り替える方式です。

#### 統合kubeconfigファイルの作成

```bash
root@master:~# cp /etc/kubernetes/admin.conf /root/multi-cluster-config
root@master:~# kubectl config set-cluster dawn-k8s --server=https://11.0.1.231:6443 --kubeconfig=/root/multi-cluster-config
Cluster "dawn-k8s" set.
root@master:~#
root@master:~# kubectl config set-context haha --cluster=kubernetes --user=kubernetes-admin --kubeconfig=/root/multi-cluster-config
Context "haha" created.
root@master:~# kubectl config set-context xixi --cluster=dawn-k8s --user=kube-admin --kubeconfig=/root/multi-cluster-config
Context "xixi" created.
root@master:~# kubectl config use-context haha --kubeconfig=/root/multi-cluster-config
Switched to context "haha".
```

#### 統合されたkubeconfigの確認

```bash
root@master:~# kubectl config view --kubeconfig=multi-cluster-config
apiVersion: v1
clusters:
- cluster:
    server: https://11.0.1.231:6443
  name: dawn-k8s
- cluster:
    certificate-authority-data: DATA+OMITTED
    server: https://11.0.1.231:6443
  name: kubernetes
contexts:
- context:
    cluster: kubernetes
    user: kubernetes-admin
  name: haha
- context:
    cluster: dawn-k8s
    user: kube-admin
  name: xixi
current-context: haha
kind: Config
preferences: {}
users:
- name: kubernetes-admin
  user:
    client-certificate-data: REDACTED
    client-key-data: REDACTED
```

#### コンテキスト（Context）の切り替え

```bash
root@master:~# kubectl config use-context xixi --kubeconfig=multi-cluster-config
Switched to context "xixi".
root@master:~#
root@master:~# kubectl config view --kubeconfig=multi-cluster-config
...
current-context: xixi
...
```

---

## 二、Kubernetesクラスタの拡張 — kubeadm Token 管理

### 1. 一時Tokenの作成（デフォルト24時間有効）

```bash
root@master:~# kubeadm token create
d0lxwn.737ebshqp8dmso12
```

### 2. Token一覧の確認

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES                USAGES                   DESCRIPTION   EXTRA GROUPS
d0lxwn.737ebshqp8dmso12   23h         2026-11-04T08:26:54Z   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 3. Tokenの削除

```bash
root@master:~# kubeadm token delete d0lxwn.737ebshqp8dmso12
bootstrap token "d0lxwn" deleted
root@master:~# kubeadm token list
```

### 4. 永久Tokenの作成（TTL=0、無期限）

```bash
root@master:~# kubeadm token create dawn00.abcdef1234567890 --ttl 0 --print-join-command
kubeadm join 11.0.1.231:6443 --token dawn00.abcdef1234567890 --discovery-token-ca-cert-hash sha256:53ed18fc23a188d30575ab08ca8dae49c101743d4a1459f61bde4194ee99d82a
```

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES   USAGES                   DESCRIPTION   EXTRA GROUPS
dawn00.abcdef1234567890   <forever>   <never>   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 5. Tokenに対応するSecretリソースの確認

```bash
root@master:~# kubectl get secrets -n kube-system bootstrap-token-dawn00
NAME                     TYPE                            DATA   AGE
bootstrap-token-dawn00   bootstrap.kubernetes.io/token   5      0s
```

### 6. 新規Workerノードのクラスタ参加

新規ノードには事前にDocker、kubeadm、kubeletを導入しておく必要があります（インストール手順は省略）。

新規ノード上でjoinコマンドを実行します：

```bash
root@worker-new:~# kubeadm join 11.0.1.231:6443 --token dawn00.abcdef1234567890 --discovery-token-ca-cert-hash sha256:53ed18fc23a188d30575ab08ca8dae49c101743d4a1459f61bde4194ee99d82a
[preflight] Running pre-flight checks
[preflight] Reading configuration from the cluster...
[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"
[kubelet-start] Writing kubelet environment file with flags to file "/var/lib/kubelet/kubeadm-flags.env"
[kubelet-start] Starting the kubelet
[kubelet-start] Waiting for the kubelet to perform the TLS Bootstrap...

This node has joined the cluster:
* Certificate signing request was sent to apiserver and a response was received.
* The Kubelet was informed of the new secure connection details.

Run 'kubectl get nodes' on the control-plane to see this node join the cluster.
```

### 7. ノード追加の検証

```bash
root@master:~# kubectl get nodes
NAME        STATUS   ROLES                  AGE     VERSION
master      Ready    control-plane,master   4d3h    v1.23.17
worker01    Ready    <none>                 4d3h    v1.23.17
worker02    Ready    <none>                 4d3h    v1.23.17
worker-new  Ready    <none>                 36s     v1.23.17
```
