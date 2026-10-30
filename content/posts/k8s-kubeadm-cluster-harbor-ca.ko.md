---
title: "K8S kubeadm 클러스터 구축 실전: 자체 CA Harbor 와 Flannel CNI"
date: 2026-10-30T14:51:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 실습 가이드는 K8S kubeadm 클러스터（v1.23.17, master 1 + worker 2, 총 3 노드）를 처음부터 구축한다. 먼저 harbor 노드에 Docker 를 설치하고 Harbor 이미지 레지스트리를 배포한다（자체 CA 가 HTTPS 인증서를 발급하고, harbor.yml 에서 443 을 활성화）. 다음으로 세 K8S 노드에 Docker 를 설치하고, /etc/hosts 와 Docker 클라이언트 인증서를 구성해 Harbor 에 대한 docker login 을 검증한다. 이어 노드 환경을 준비하고（swap 비활성화, product_uuid 확인, iptables 브리지 통신 및 Aliyun apt 저장소 설정, kubeadm/kubelet/kubectl 설치）, master 에서 kubeadm init, kubeconfig 구성, worker 노드 join 을 수행한 뒤, 마지막으로 Flannel CNI 플러그인을 배포해 세 노드를 모두 Ready 로 만들고 curl 로 노드 간 Pod 통신을 검증한다."
---

# K8S kubeadm 클러스터 구축 실전: 자체 CA Harbor 와 Flannel CNI

## 노드 계획

| 노드 | IP | 역할 |
| -------- | ---------- | -------------------------------- |
| harbor | 11.0.1.250 | Harbor 이미지 레지스트리（자체 CA HTTPS） |
| master   | 11.0.1.231 | K8S control-plane                |
| worker01 | 11.0.1.232 | K8S worker node                  |
| worker02 | 11.0.1.233 | K8S worker node                  |

---

## 제1장 harbor 노드에 Docker + Harbor HTTPS 배포（자체 CA）

### 1.1 Docker 와 docker-compose 설치

```bash
[root@harbor ~]# tar xf dawn-autoinstall-docker-docker-compose.tar.gz
[root@harbor ~]# ./install-docker.sh i
```

```bash
[root@harbor ~]# docker --version
Docker version 27.0.3, build 7d4bcd8

[root@harbor ~]# docker-compose --version
Docker Compose version v2.29.0
```

### 1.2 Harbor 다운로드 및 압축 해제

```bash
[root@harbor ~]# wget -O /dawn/softwares/harbor-offline-installer-v2.7.4.tgz \
  https://github.com/goharbor/harbor/releases/download/v2.7.4/harbor-offline-installer-v2.7.4.tgz
[root@harbor ~]# tar xf /dawn/softwares/harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
[root@harbor ~]# ls /dawn/softwares/harbor/
common.sh  harbor.v2.7.4.tar.gz  harbor.yml.tmpl  install.sh  LICENSE  prepare
```

### 1.3 인증서 디렉토리 생성

```bash
[root@harbor ~]# mkdir -pv /dawn/softwares/harbor/certs/{ca,harbor-server,docker-client}
mkdir: created directory '/dawn/softwares/harbor/certs/ca'
mkdir: created directory '/dawn/softwares/harbor/certs/harbor-server'
mkdir: created directory '/dawn/softwares/harbor/certs/docker-client'
```

### 1.4 자체 CA 인증서 생성

```bash
[root@harbor certs]# cd /dawn/softwares/harbor/certs

# CA 개인 키 생성
[root@harbor certs]# openssl genrsa -out ca/ca.key 4096

# CA 개인 키 기반 CA 인증서 생성
[root@harbor certs]# openssl req -x509 -new -nodes -sha512 -days 3650 \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=example/OU=Personal/CN=dawn.com" \
  -key ca/ca.key \
  -out ca/ca.crt

[root@harbor certs]# ls -l ca/
total 8
-rw-r--r-- 1 root root 2037 ca.crt
-rw------- 1 root root 3268 ca.key
```

### 1.5 Harbor 서버 인증서 발급

```bash
# Harbor 서버 개인 키 생성
[root@harbor certs]# openssl genrsa -out harbor-server/harbor.key 4096

# 인증서 서명 요청 생성（CN=harbor）
[root@harbor certs]# openssl req -sha512 -new \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=example/OU=Personal/CN=harbor" \
  -key harbor-server/harbor.key \
  -out harbor-server/harbor.csr

# x509 v3 확장 파일 생성（SAN: DNS.1=harbor）
[root@harbor certs]# cat > harbor-server/v3.ext <<-EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1=harbor
EOF

# 자체 CA 로 Harbor 서버 인증서 발급
[root@harbor certs]# openssl x509 -req -sha512 -days 3650 \
  -extfile harbor-server/v3.ext \
  -CA ca/ca.crt -CAkey ca/ca.key -CAcreateserial \
  -in harbor-server/harbor.csr \
  -out harbor-server/harbor.crt

Certificate request self-signature ok
subject=C = CN, ST = Beijing, L = Beijing, O = example, OU = Personal, CN = harbor

[root@harbor certs]# ls -l harbor-server/
total 16
-rw-r--r-- 1 root root 2102 harbor.crt
-rw-r--r-- 1 root root 1695 harbor.csr
-rw------- 1 root root 3272 harbor.key
-rw-r--r-- 1 root root  225 v3.ext
```

### 1.6 harbor.yml 설정

```bash
[root@harbor harbor]# cd /dawn/softwares/harbor
[root@harbor harbor]# cp harbor.yml.tmpl harbor.yml
[root@harbor harbor]# vim harbor.yml
```

주요 설정 항목:

```yaml
hostname: harbor
https:
  port: 443
  certificate: /dawn/softwares/harbor/certs/harbor-server/harbor.crt
  private_key: /dawn/softwares/harbor/certs/harbor-server/harbor.key
harbor_admin_password: Harbor12345
data_volume: /dawn/data/harbor
```

### 1.7 Harbor 설치

```bash
[root@harbor harbor]# mkdir -p /dawn/data/harbor
[root@harbor harbor]# ./install.sh --with-chartmuseum
```

```
[Step 0]: checking if docker is installed ...
Note: docker version: 27.0.3
[Step 1]: checking docker-compose is installed ...
Note: docker-compose version: 2.29.0
[Step 2]: loading Harbor images ...
Loaded image: goharbor/harbor-jobservice:v2.7.4
...
[+] Running 12/12
 ✔ Container harbor-log       Started
 ✔ Container harbor-db        Started
 ✔ Container registryctl      Started
 ✔ Container harbor-portal    Started
 ✔ Container registry         Started
 ✔ Container redis            Started
 ✔ Container chartmuseum      Started
 ✔ Container harbor-core      Started
 ✔ Container harbor-jobservice Started
 ✔ Container nginx            Started
✔ ----Harbor has been installed and started successfully.----
```

### 1.8 Harbor 검증

```bash
[root@harbor ~]# docker ps --format 'table {{.Names}}\t{{.Status}}'
NAMES               STATUS
harbor-jobservice   Up X minutes (healthy)
nginx               Up X minutes (healthy)
harbor-core         Up X minutes (healthy)
redis               Up X minutes (healthy)
harbor-db           Up X minutes (healthy)
registryctl         Up X minutes (healthy)
chartmuseum         Up X minutes (healthy)
registry            Up X minutes (healthy)
harbor-portal       Up X minutes (healthy)
harbor-log          Up X minutes (healthy)
```

![image-20261030132355535](/images/k8s-kubeadm-cluster-harbor-ca/image-20261030132355535.png)

## 제2장 K8S 노드에 Docker 설치 + hosts 설정 + 클라이언트 인증서

### 2.1 세 노드에 Docker 설치

```bash
# master, worker01, worker02 모두에서 실행
[root@master ~]# tar xf dawn-autoinstall-docker-docker-compose.tar.gz
[root@master ~]# ./install-docker.sh i

[root@master ~]# docker --version
Docker version 27.0.3, build 7d4bcd8

[root@master ~]# docker-compose --version
Docker Compose version v2.29.0
```

docker daemon.json（설치 스크립트가 자동 구성）

```json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"]
}
```

Cgroup Driver 는 자동으로 systemd 로 설정됨

```bash
[root@master ~]# docker info | grep "Cgroup Driver:"
 Cgroup Driver: systemd
```

### 2.2 /etc/hosts 설정

```bash
[root@master ~]# cat >> /etc/hosts << EOF
11.0.1.250 harbor
11.0.1.231 master
11.0.1.232 worker01
11.0.1.233 worker02
EOF
```

세 노드 모두에서 실행

### 2.3 harbor 에서 Docker 클라이언트 인증서 생성

```bash
[root@harbor certs]# cd /dawn/softwares/harbor/certs

# PEM 을 Docker 클라이언트 형식으로 변환
[root@harbor certs]# openssl x509 -inform PEM -in harbor-server/harbor.crt -out docker-client/harbor.cert

# 개인 키와 CA 인증서 복사
[root@harbor certs]# cp harbor-server/harbor.key docker-client/
[root@harbor certs]# cp ca/ca.crt docker-client/

[root@harbor certs]# md5sum docker-client/harbor.cert harbor-server/harbor.crt
bd37fe66d7711b3fc3a34aec1c782dea  docker-client/harbor.cert
bd37fe66d7711b3fc3a34aec1c782dea  harbor-server/harbor.crt

[root@harbor certs]# ls -l docker-client/
total 12
-rw-r--r-- 1 root root 2037 ca.crt
-rw-r--r-- 1 root root 2102 harbor.cert
-rw------- 1 root root 3272 harbor.key
```

### 2.4 클라이언트 인증서를 세 노드로 배포

```bash
# master, worker01, worker02 모두에서 실행
[root@master ~]# mkdir -pv /etc/docker/certs.d/harbor/
mkdir: created directory '/etc/docker/certs.d/harbor/'

# 인증서 파일을 각 노드의 /etc/docker/certs.d/harbor/ 에 복사
# ca.crt, harbor.cert, harbor.key

[root@master ~]# ls -l /etc/docker/certs.d/harbor/
total 12
-rw-r--r-- 1 root root 2037 ca.crt
-rw-r--r-- 1 root root 2102 harbor.cert
-rw-r--r-- 1 root root 3272 harbor.key
```

### 2.5 docker login 으로 검증

```bash
[root@master ~]# docker login -u admin -p Harbor12345 harbor
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded
```

세 노드 모두 로그인 성공

---

## 제3장 K8S 노드 환경 준비

### 3.1 swap 비활성화

```bash
[root@master ~]# swapoff -a
[root@master ~]# sysctl -w vm.swappiness=0
vm.swappiness = 0

[root@master ~]# sed -ri '/^[^#]*swap/s@^@#@' /etc/fstab
[root@master ~]# swapon --show
（비어 있음, 출력 없음）
```

### 3.2 MAC 주소와 product_uuid 고유성 확인

```bash
[root@master ~]# cat /sys/class/dmi/id/product_uuid
de684d56-5f05-25c2-54de-68cd23efd88c

[root@worker01 ~]# cat /sys/class/dmi/id/product_uuid
ea094d56-2f5c-6c05-6365-0ef6c84c61b7

[root@worker02 ~]# cat /sys/class/dmi/id/product_uuid
1c3c4d56-0c08-76ac-61b8-725c5167c05e
```

세 노드의 product_uuid 가 모두 다릅니다

### 3.3 iptables 가 브리지 트래픽 검사하도록 허용

```bash
[root@master ~]# cat <<EOF | tee /etc/modules-load.d/k8s.conf
br_netfilter
EOF

[root@master ~]# cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
EOF

[root@master ~]# sysctl --system
* Applying /etc/sysctl.d/k8s.conf ...
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
```

### 3.4 kubeadm/kubelet/kubectl 1.23.17 설치

```bash
# Aliyun K8S apt 저장소 설정
[root@master ~]# apt-get update
[root@master ~]# apt-get install -y apt-transport-https
[root@master ~]# curl -fsSL https://mirrors.aliyun.com/kubernetes/apt/doc/apt-key.gpg | \
  gpg --dearmor -o /etc/apt/keyrings/kubernetes-archive-keyring.gpg

[root@master ~]# echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-archive-keyring.gpg] https://mirrors.aliyun.com/kubernetes/apt/ kubernetes-xenial main' | \
  tee /etc/apt/sources.list.d/kubernetes.list

# 지정 버전 설치
[root@master ~]# apt-get update
[root@master ~]# apt-get install -y kubelet=1.23.17-00 kubeadm=1.23.17-00 kubectl=1.23.17-00

[root@master ~]# kubeadm version
kubeadm version: &version.Info{Major:"1", Minor:"23", GitVersion:"v1.23.17", ...}
```

세 노드 모두에 설치

---

## 제4장 kubeadm init 로 master 초기화

### 4.1 master 초기화

```bash
[root@master ~]# kubeadm init \
  --kubernetes-version=v1.23.17 \
  --image-repository registry.aliyuncs.com/google_containers \
  --pod-network-cidr=10.100.0.0/16 \
  --service-cidr=10.200.0.0/16 \
  --service-dns-domain=dawn.com
```

초기화 성공

```
[init] Using Kubernetes version: v1.23.17
[preflight] Pulling images required for setting up a Kubernetes cluster
[certs] Generating "ca" certificate and key
[certs] apiserver serving cert is signed for DNS names [kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.dawn.com master]
[kubeconfig] Writing "admin.conf" kubeconfig file
[control-plane] Creating static Pod manifest for "kube-apiserver"
[control-plane] Creating static Pod manifest for "kube-controller-manager"
[control-plane] Creating static Pod manifest for "kube-scheduler"
[etcd] Creating static Pod manifest for local etcd
[apiclient] All control plane components are healthy after 7.508704 seconds
[bootstrap-token] Using token: dxyevc.qvifqa5t3764ccp3
[addons] Applied essential addon: CoreDNS
[addons] Applied essential addon: kube-proxy

Your Kubernetes control-plane has initialized successfully!
```

### 4.2 kubeconfig 설정

흔한 오류: `The connection to the server localhost:8080 was refused`

kubectl 이 클러스터 구성을 찾는 우선순위: `--kubeconfig` 인자 → `$KUBECONFIG` 환경 변수 → `~/.kube/config`.
세 가지가 모두 없으면 하드코딩된 `localhost:8080`（더 이상 권장되지 않는 안전하지 않은 포트）으로 폴백되는데, API Server 는 실제로 `6443` 을 리슨하므로 refused 가 발생합니다.
kubeadm 이 생성한 `/etc/kubernetes/admin.conf` 를 kubectl 에 설정해야 합니다.

**임시 방법（현재 셸에서만 유효）**

```bash
[root@master ~]# export KUBECONFIG=/etc/kubernetes/admin.conf
```

**영구 방법（권장, 새 로그인 시 자동 적용）**

```bash
[root@master ~]# mkdir -p $HOME/.kube
[root@master ~]# cp /etc/kubernetes/admin.conf $HOME/.kube/config
[root@master ~]# chown $(id -u):$(id -g) $HOME/.kube/config
```

검증:

```bash
[root@master ~]# kubectl get cs
Warning: v1 ComponentStatus is deprecated in v1.19+
NAME                 STATUS    MESSAGE                         ERROR
scheduler            Healthy   ok
controller-manager   Healthy   ok
etcd-0               Healthy   {"health":"true","reason":""}

[root@master ~]# kubectl get nodes
NAME       STATUS     ROLES                  AGE   VERSION
master     NotReady   control-plane,master   48m   v1.23.17
worker01   Ready      <none>                 47m   v1.23.17
worker02   Ready      <none>                 47m   v1.23.17
```

### 4.3 worker 노드 조인

```bash
[root@worker01 ~]# kubeadm join 11.0.1.231:6443 --token dxyevc.qvifqa5t3764ccp3 \
  --discovery-token-ca-cert-hash sha256:53ed18fc23a188d30575ab08ca8dae49c101743d4a1459f61bde4194ee99d82a

This node has joined the cluster.
* Certificate signing request was sent to apiserver and a response was received.

[root@worker02 ~]# kubeadm join 11.0.1.231:6443 --token dxyevc.qvifqa5t3764ccp3 \
  --discovery-token-ca-cert-hash sha256:53ed18fc23a188d30575ab08ca8dae49c101743d4a1459f61bde4194ee99d82a

This node has joined the cluster.
* Certificate signing request was sent to apiserver and a response was received.
```

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS     ROLES                  AGE   VERSION
master     NotReady   control-plane,master   60s   v1.23.17
worker01   NotReady   <none>                 17s   v1.23.17
worker02   NotReady   <none>                 15s   v1.23.17
```

---

## 제5장 Flannel CNI 플러그인 배포

### 5.1 kube-flannel.yml 을 master 에 업로드

kube-flannel.yml 핵심 설정:

```yaml
  net-conf.json: |
    {
      "Network": "10.100.0.0/16",
      "Backend": {
        "Type": "vxlan"
      }
    }
```

### 5.2 이미지 사전 풀（세 노드）

```bash
[root@worker01 ~]# docker pull docker.io/flannel/flannel:v0.25.5
v0.25.5: Pulling from flannel/flannel
Digest: sha256:4f65cc179d15e8ee4d67a6a32ce89c02094120a46452a4e0341d26be9fd556c3
Status: Downloaded newer image for flannel/flannel:v0.25.5

[root@worker01 ~]# docker pull docker.io/flannel/flannel-cni-plugin:v1.5.1-flannel1
v1.5.1-flannel1: Pulling from flannel/flannel-cni-plugin
Digest: sha256:442c2f8e1f9d27145b4090d0e8819b72676d46ac95cc81e944a7b69f49db5151
Status: Downloaded newer image for flannel/flannel-cni-plugin:v1.5.1-flannel1
```

### 5.3 Flannel 배포

```bash
[root@master ~]# kubectl apply -f /root/kube-flannel.yml
namespace/kube-flannel created
serviceaccount/flannel created
clusterrole.rbac.authorization.k8s.io/flannel created
clusterrolebinding.rbac.authorization.k8s.io/flannel created
configmap/kube-flannel-cfg created
daemonset.apps/kube-flannel-ds created
```

### 5.4 Flannel Pod 및 노드 상태 검증

```bash
[root@master ~]# kubectl get pods -n kube-flannel -o wide
NAME                    READY   STATUS    RESTARTS   AGE   IP           NODE
kube-flannel-ds-8rmk2   1/1     Running   0          71s   11.0.1.233   worker02
kube-flannel-ds-n6wcv   1/1     Running   0          8m    11.0.1.232   worker01
kube-flannel-ds-tw8f6   1/1     Running   0          8m    11.0.1.231   master

[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE   VERSION
master     Ready    control-plane,master   12m   v1.23.17
worker01   Ready    <none>                 12m   v1.23.17
worker02   Ready    <none>                 12m   v1.23.17
```

세 노드 모두 Ready, 세 flannel Pod 모두 Running

---

## 제6장 노드 간 Pod 네트워크（CNI）검증

### 6.1 테스트 Pod 배포

```yaml
# dawn-network-cni.yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v1
spec:
  nodeName: worker01
  containers:
  - image: uhub.service.ucloud.cn/dawn/apps:v1
    name: xiuxian
---
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v2
spec:
  nodeName: worker02
  containers:
  - image: uhub.service.ucloud.cn/dawn/apps:v2
    name: xiuxian
```

```bash
[root@master ~]# kubectl apply -f dawn-network-cni.yaml
pod/xiuxian-v1 created
pod/xiuxian-v2 created

[root@master ~]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          11s   10.100.1.2   worker01
xiuxian-v2   1/1     Running   0          11s   10.100.2.2   worker02
```

### 6.2 노드 간 curl 검증

```bash
# master 에서 worker01 의 xiuxian-v1 을 curl（Pod IP: 10.100.1.2）
[root@master ~]# curl 10.100.1.2
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v1</title>

# master 에서 worker02 의 xiuxian-v2 를 curl（Pod IP: 10.100.2.2）
[root@master ~]# curl 10.100.2.2
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v2</title>
```

노드 간 Pod 네트워크 연결 성공

### 6.3 테스트 Pod 정리

```bash
[root@master ~]# kubectl delete -f dawn-network-cni.yaml
pod "xiuxian-v1" deleted
pod "xiuxian-v2" deleted

[root@master ~]# kubectl get pods
No resources found in default namespace.
```

---

## 제7장 kubectl 자동 완성（세 노드）

```bash
[root@master ~]# kubectl completion bash > ~/.kube/completion.bash.inc
[root@master ~]# echo source '$HOME/.kube/completion.bash.inc' >> ~/.bashrc
[root@master ~]# source ~/.bashrc
```

---

## 제8장 타임존 설정（세 노드）

```bash
[root@master ~]# ln -svf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
'/etc/localtime' -> '/usr/share/zoneinfo/Asia/Shanghai'

[root@master ~]# date -R
Fri, 30 Oct 2026 13:06:17 +0800

[root@worker01 ~]# date -R
Fri, 30 Oct 2026 13:06:19 +0800

[root@worker02 ~]# date -R
Fri, 30 Oct 2026 13:06:21 +0800
```
