---
title: "K8S 클러스터 운영 실전: kubectl 멀티 클러스터 Context 전환 및 kubeadm Worker 노드 동적 확장"
date: 2026-11-03T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "kubeadm", "kubectl", "Cluster"]
showToc: true
summary: "단일 kubeconfig 파일에 여러 context를 집약하여 복수의 Kubernetes 클러스터를 효율적으로 전환·관리하는 방법과, kubeadm Bootstrap Token 라이프사이클 관리 및 신규 Worker 노드의 안전한 동적 추가 절차를 실전 해설합니다."
---

# K8S 클러스터 운영 실전: kubectl 멀티 클러스터 Context 전환 및 kubeadm Worker 노드 동적 확장

---

## 1. kubectl을 활용한 멀티 Kubernetes 클러스터 관리

단일 클러스터 환경에서도 kubeconfig 내에 다른 이름의 클러스터, 사용자 및 컨텍스트(Context)를 구성함으로써 멀티 클러스터 시나리오를 효과적으로 시뮬레이션하고 운영 방식을 검증할 수 있습니다.

### 방식 1: 개별 kubeconfig 파일 사용

클러스터마다 독립된 kubeconfig 파일을 유지하고, `--kubeconfig` 플래그를 통해 명시적으로 대상을 전환하는 방식입니다.

#### 현재 클러스터 노드 확인

```bash
root@master:~# kubectl get nodes -o wide
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

#### kubeconfig 파일 확인

```bash
root@master:~# ll ~/.kube/config
-rw------- 1 root root 5638 Nov  3 16:24 /root/.kube/config
```

#### 다른 kubeconfig 파일을 통한 조회

```bash
root@master:~# kubectl get nodes -o wide --kubeconfig=config
NAME       STATUS   ROLES                  AGE    VERSION    INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION       CONTAINER-RUNTIME
master     Ready    control-plane,master   4d3h   v1.23.17   11.0.1.231    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker01   Ready    <none>                 4d3h   v1.23.17   11.0.1.232    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
worker02   Ready    <none>                 4d3h   v1.23.17   11.0.1.233    <none>        Ubuntu 22.04.5 LTS   5.15.0-202-generic   docker://27.0.3
```

---

### 방식 2: 동일한 kubeconfig 파일 통합 관리 (멀티 Context)

단일 kubeconfig 파일 내에 복수의 cluster, user, context를 통합하여 `kubectl config use-context` 명령으로 간편하게 전환하는 방식입니다.

#### 통합 kubeconfig 파일 생성

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

#### 통합된 kubeconfig 내용 확인

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

#### 컨텍스트(Context) 전환

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

## 2. Kubernetes 클러스터 확장 — kubeadm Token 관리

### 1. 임시 토큰 생성 (기본 24시간 유효)

```bash
root@master:~# kubeadm token create
d0lxwn.737ebshqp8dmso12
```

### 2. 토큰 목록 확인

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES                USAGES                   DESCRIPTION   EXTRA GROUPS
d0lxwn.737ebshqp8dmso12   23h         2026-11-04T08:26:54Z   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 3. 토큰 삭제

```bash
root@master:~# kubeadm token delete d0lxwn.737ebshqp8dmso12
bootstrap token "d0lxwn" deleted
root@master:~# kubeadm token list
```

### 4. 영구 토큰 생성 (TTL=0, 만료되지 않음)

```bash
root@master:~# kubeadm token create dawn00.abcdef1234567890 --ttl 0 --print-join-command
kubeadm join 11.0.1.231:6443 --token dawn00.abcdef1234567890 --discovery-token-ca-cert-hash sha256:53ed18fc23a188d30575ab08ca8dae49c101743d4a1459f61bde4194ee99d82a
```

```bash
root@master:~# kubeadm token list
TOKEN                     TTL         EXPIRES   USAGES                   DESCRIPTION   EXTRA GROUPS
dawn00.abcdef1234567890   <forever>   <never>   authentication,signing   <none>        system:bootstrappers:kubeadm:default-node-token
```

### 5. 토큰에 대응하는 Secret 오브젝트 확인

```bash
root@master:~# kubectl get secrets -n kube-system bootstrap-token-dawn00
NAME                     TYPE                            DATA   AGE
bootstrap-token-dawn00   bootstrap.kubernetes.io/token   5      0s
```

### 6. 신규 Worker 노드의 클러스터 조인

신규 노드에는 Docker, kubeadm, kubelet이 사전에 설치되어 있어야 합니다(설치 절차 생략).

신규 노드에서 join 명령어를 실행합니다:

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

### 7. 노드 조인 결과 검증

```bash
root@master:~# kubectl get nodes
NAME        STATUS   ROLES                  AGE     VERSION
master      Ready    control-plane,master   4d3h    v1.23.17
worker01    Ready    <none>                 4d3h    v1.23.17
worker02    Ready    <none>                 4d3h    v1.23.17
worker-new  Ready    <none>                 36s     v1.23.17
```
