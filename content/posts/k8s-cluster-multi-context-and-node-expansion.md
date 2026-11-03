---
title: "K8S 集群运维实战：kubectl 多集群 Context 灵活切换与 kubeadm Worker 节点动态扩容"
date: 2026-11-03T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "kubeadm", "kubectl", "Cluster"]
showToc: true
summary: "演示使用 kubectl 通过单一 kubeconfig 多 context 聚合切换管理多套 Kubernetes 集群，并深入讲解 kubeadm Bootstrap Token 管理机制，实战完成新 Worker 节点的安全加入与在线扩容。"
---

# K8S 集群运维实战：kubectl 多集群 Context 灵活切换与 kubeadm Worker 节点动态扩容

---

## 一、使用 kubectl 管理多套 K8S 集群

本实验只有一个集群，通过创建不同名称的 cluster/user/context 模拟多集群场景，演示概念和操作方法

### 方案一：使用不同的 kubeconfig 文件

不同集群使用独立的 kubeconfig 文件，通过 `--kubeconfig` 选项切换

#### 查看当前集群

```bash
root@master:~# kubectl get nodes -o wide
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

#### 查看 kubeconfig 文件

```bash
root@master:~# ll ~/.kube/config
-rw------- 1 root root 5638 Nov  3 16:24 /root/.kube/config
```

#### 使用另一个 kubeconfig 文件

```bash
root@master:~# kubectl get nodes -o wide --kubeconfig=config
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

---

### 方案二：使用相同的 kubeconfig 文件（多 context）

一个 kubeconfig 文件包含多个 cluster、user 和 context，通过 `kubectl config use-context` 切换

#### 创建合并的 kubeconfig（含两个集群/上下文）

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

#### 查看合并后的 kubeconfig

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

#### 切换 context

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

## 二、K8S 集群扩容 — kubeadm token 管理

### 1. 创建临时 token（默认 24h 有效）

```bash
root@master:~# kubeadm token create
d0lxwn.737ebshqp8dmso12
```

### 2. 查看 token 列表

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES                USAGES                   DESCRIPTION   EXTRA GROUPS
d0lxwn.737ebshqp8dmso12   23h         2026-11-04T08:26:54Z   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 3. 删除 token

```bash
root@master:~# kubeadm token delete d0lxwn.737ebshqp8dmso12
bootstrap token "d0lxwn" deleted
root@master:~# kubeadm token list
```

### 4. 创建永久 token（TTL=0，永不过期）

```bash
root@master:~# kubeadm token create dawn00.abcdef1234567890 --ttl 0 --print-join-command
kubeadm join 11.0.1.231:6443 --token dawn00.abcdef1234567890 --discovery-token-ca-cert-hash sha256:53ed18fc23a188d30575ab08ca8dae49c101743d4a1459f61bde4194ee99d82a
```

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES   USAGES                   DESCRIPTION   EXTRA GROUPS
dawn00.abcdef1234567890   <forever>   <never>   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 5. 查看 token 对应的 Secret

```bash
root@master:~# kubectl get secrets -n kube-system bootstrap-token-dawn00
NAME                     TYPE                            DATA   AGE
bootstrap-token-dawn00   bootstrap.kubernetes.io/token   5      0s
```

### 6. Worker 节点加入集群

新节点需要预先安装 Docker、kubeadm、kubelet（安装步骤略）

在新节点上执行 join 命令：

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

### 7. 验证节点加入

```bash
root@master:~# kubectl get nodes
NAME        STATUS   ROLES                  AGE     VERSION
master      Ready    control-plane,master   4d3h    v1.23.17
worker01    Ready    <none>                 4d3h    v1.23.17
worker02    Ready    <none>                 4d3h    v1.23.17
worker-new  Ready    <none>                 36s     v1.23.17
```
