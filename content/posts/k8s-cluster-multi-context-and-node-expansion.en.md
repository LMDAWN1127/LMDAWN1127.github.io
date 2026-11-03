---
title: "K8S Cluster Operations in Action: Seamless kubectl Multi-Cluster Context Switching & Dynamic kubeadm Worker Expansion"
date: 2026-11-03T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "kubeadm", "kubectl", "Cluster"]
showToc: true
summary: "Demonstrates managing multiple Kubernetes clusters via kubectl with single kubeconfig multi-context aggregation, alongside an in-depth guide to kubeadm Bootstrap Token lifecycle management for secure and dynamic worker node expansion."
---

# K8S Cluster Operations in Action: Seamless kubectl Multi-Cluster Context Switching & Dynamic kubeadm Worker Expansion

---

## 1. Managing Multiple Kubernetes Clusters via kubectl

In an environment with a single physical cluster, multi-cluster scenarios can be accurately modeled by provisioning distinct clusters, users, and contexts within kubeconfig to demonstrate configuration concepts and operational methodologies.

### Approach 1: Utilizing Distinct kubeconfig Files

Each cluster maintains an independent kubeconfig file, switched explicitly via the `--kubeconfig` CLI flag.

#### Inspect Current Cluster

```bash
root@master:~# kubectl get nodes -o wide
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

#### Inspect kubeconfig File

```bash
root@master:~# ll ~/.kube/config
-rw------- 1 root root 5638 Nov  3 16:24 /root/.kube/config
```

#### Operating via an Alternative kubeconfig File

```bash
root@master:~# kubectl get nodes -o wide --kubeconfig=config
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

---

### Approach 2: Aggregated kubeconfig (Multi-Context Architecture)

A single consolidated kubeconfig file incorporates multiple clusters, users, and contexts, enabling rapid switching via `kubectl config use-context`.

#### Constructing the Consolidated kubeconfig

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

#### Inspecting the Aggregated kubeconfig

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

#### Switching Contexts

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

## 2. Kubernetes Cluster Expansion — kubeadm Token Management

### 1. Generating Temporary Tokens (Default 24h TTL)

```bash
root@master:~# kubeadm token create
d0lxwn.737ebshqp8dmso12
```

### 2. Inspecting Token Inventory

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES                USAGES                   DESCRIPTION   EXTRA GROUPS
d0lxwn.737ebshqp8dmso12   23h         2026-11-04T08:26:54Z   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 3. Deleting Bootstrap Tokens

```bash
root@master:~# kubeadm token delete d0lxwn.737ebshqp8dmso12
bootstrap token "d0lxwn" deleted
root@master:~# kubeadm token list
```

### 4. Generating Permanent Tokens (TTL=0, Never Expires)

```bash
root@master:~# kubeadm token create dawn00.abcdef1234567890 --ttl 0 --print-join-command
kubeadm join 11.0.1.231:6443 --token dawn00.abcdef1234567890 --discovery-token-ca-cert-hash sha256:53ed18fc23a188d30575ab08ca8dae49c101743d4a1459f61bde4194ee99d82a
```

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES   USAGES                   DESCRIPTION   EXTRA GROUPS
dawn00.abcdef1234567890   <forever>   <never>   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 5. Inspecting the Token Secret Object

```bash
root@master:~# kubectl get secrets -n kube-system bootstrap-token-dawn00
NAME                     TYPE                            DATA   AGE
bootstrap-token-dawn00   bootstrap.kubernetes.io/token   5      0s
```

### 6. Joining a New Worker Node to the Cluster

The new node requires pre-installed Docker, kubeadm, and kubelet runtime dependencies (installation steps omitted).

Execute the join command on the new worker node:

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

### 7. Verifying Node Registration

```bash
root@master:~# kubectl get nodes
NAME        STATUS   ROLES                  AGE     VERSION
master      Ready    control-plane,master   4d3h    v1.23.17
worker01    Ready    <none>                 4d3h    v1.23.17
worker02    Ready    <none>                 4d3h    v1.23.17
worker-new  Ready    <none>                 36s     v1.23.17
```
