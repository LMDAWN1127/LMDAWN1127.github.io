---
title: "K8S kubeadm Cluster Deployment in Practice: Harbor with a Self-Built CA and Flannel CNI"
date: 2026-10-30T14:51:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This hands-on guide builds a K8S kubeadm cluster (v1.23.17, 1 master + 2 workers, 3 nodes in total) from scratch. First install Docker on the harbor node and deploy a Harbor image registry (self-built CA issues the HTTPS certificate, harbor.yml enables port 443). Then install Docker on the three K8S nodes, configure /etc/hosts and the Docker client certificate, and verify docker login against Harbor successfully. Next prepare the nodes (disable swap, check product_uuid, configure iptables bridge traffic and the Aliyun apt repo, and install kubeadm/kubelet/kubectl), run kubeadm init on the master, configure kubeconfig, join the worker nodes, and finally deploy the Flannel CNI plugin so all three nodes become Ready, and verify cross-node Pod connectivity with curl."
---

# K8S kubeadm Cluster Deployment in Practice: Harbor with a Self-Built CA and Flannel CNI

## Node Planning

| Node | IP | Role |
| -------- | ---------- | -------------------------------- |
| harbor | 11.0.1.250 | Harbor image registry (self-built CA HTTPS) |
| master   | 11.0.1.231 | K8S control-plane                |
| worker01 | 11.0.1.232 | K8S worker node                  |
| worker02 | 11.0.1.233 | K8S worker node                  |

---

## 1. Deploying Docker + Harbor HTTPS on the Harbor Node (Self-Built CA)

### 1.1 Install Docker and docker-compose

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

### 1.2 Download and Extract Harbor

```bash
[root@harbor ~]# wget -O /dawn/softwares/harbor-offline-installer-v2.7.4.tgz \
  https://github.com/goharbor/harbor/releases/download/v2.7.4/harbor-offline-installer-v2.7.4.tgz
[root@harbor ~]# tar xf /dawn/softwares/harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
[root@harbor ~]# ls /dawn/softwares/harbor/
common.sh  harbor.v2.7.4.tar.gz  harbor.yml.tmpl  install.sh  LICENSE  prepare
```

### 1.3 Create the Certificate Directories

```bash
[root@harbor ~]# mkdir -pv /dawn/softwares/harbor/certs/{ca,harbor-server,docker-client}
mkdir: created directory '/dawn/softwares/harbor/certs/ca'
mkdir: created directory '/dawn/softwares/harbor/certs/harbor-server'
mkdir: created directory '/dawn/softwares/harbor/certs/docker-client'
```

### 1.4 Generate the Self-Built CA Certificate

```bash
[root@harbor certs]# cd /dawn/softwares/harbor/certs

# Create the CA private key
[root@harbor certs]# openssl genrsa -out ca/ca.key 4096

# Create the CA certificate from the CA private key
[root@harbor certs]# openssl req -x509 -new -nodes -sha512 -days 3650 \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=example/OU=Personal/CN=dawn.com" \
  -key ca/ca.key \
  -out ca/ca.crt

[root@harbor certs]# ls -l ca/
total 8
-rw-r--r-- 1 root root 2037 ca.crt
-rw------- 1 root root 3268 ca.key
```

### 1.5 Issue the Harbor Server Certificate

```bash
# Generate the Harbor server private key
[root@harbor certs]# openssl genrsa -out harbor-server/harbor.key 4096

# Generate the certificate signing request (CN=harbor)
[root@harbor certs]# openssl req -sha512 -new \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=example/OU=Personal/CN=harbor" \
  -key harbor-server/harbor.key \
  -out harbor-server/harbor.csr

# Create the x509 v3 extension file (SAN: DNS.1=harbor)
[root@harbor certs]# cat > harbor-server/v3.ext <<-EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1=harbor
EOF

# Sign the Harbor server certificate with the self-built CA
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

### 1.6 Configure harbor.yml

```bash
[root@harbor harbor]# cd /dawn/softwares/harbor
[root@harbor harbor]# cp harbor.yml.tmpl harbor.yml
[root@harbor harbor]# vim harbor.yml
```

Key configuration items:

```yaml
hostname: harbor
https:
  port: 443
  certificate: /dawn/softwares/harbor/certs/harbor-server/harbor.crt
  private_key: /dawn/softwares/harbor/certs/harbor-server/harbor.key
harbor_admin_password: Harbor12345
data_volume: /dawn/data/harbor
```

### 1.7 Install Harbor

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

### 1.8 Verify Harbor

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

## 2. Installing Docker on K8S Nodes + Configuring hosts + Client Certificate

### 2.1 Install Docker on All Three Nodes

```bash
# Run on all of master, worker01, worker02
[root@master ~]# tar xf dawn-autoinstall-docker-docker-compose.tar.gz
[root@master ~]# ./install-docker.sh i

[root@master ~]# docker --version
Docker version 27.0.3, build 7d4bcd8

[root@master ~]# docker-compose --version
Docker Compose version v2.29.0
```

docker daemon.json (configured automatically by the install script)

```json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"]
}
```

Cgroup Driver is automatically set to systemd

```bash
[root@master ~]# docker info | grep "Cgroup Driver:"
 Cgroup Driver: systemd
```

### 2.2 Configure /etc/hosts

```bash
[root@master ~]# cat >> /etc/hosts << EOF
11.0.1.250 harbor
11.0.1.231 master
11.0.1.232 worker01
11.0.1.233 worker02
EOF
```

Run on all three nodes

### 2.3 Generate the Docker Client Certificate on Harbor

```bash
[root@harbor certs]# cd /dawn/softwares/harbor/certs

# Convert PEM to the Docker client format
[root@harbor certs]# openssl x509 -inform PEM -in harbor-server/harbor.crt -out docker-client/harbor.cert

# Copy the private key and the CA certificate
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

### 2.4 Distribute the Client Certificate to All Three Nodes

```bash
# Run on all of master, worker01, worker02
[root@master ~]# mkdir -pv /etc/docker/certs.d/harbor/
mkdir: created directory '/etc/docker/certs.d/harbor/'

# Copy the certificate files to /etc/docker/certs.d/harbor/ on each node
# ca.crt, harbor.cert, harbor.key

[root@master ~]# ls -l /etc/docker/certs.d/harbor/
total 12
-rw-r--r-- 1 root root 2037 ca.crt
-rw-r--r-- 1 root root 2102 harbor.cert
-rw-r--r-- 1 root root 3272 harbor.key
```

### 2.5 Verify with docker login

```bash
[root@master ~]# docker login -u admin -p Harbor12345 harbor
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded
```

docker login succeeded on all three nodes

---

## 3. K8S Node Environment Preparation

### 3.1 Disable Swap

```bash
[root@master ~]# swapoff -a
[root@master ~]# sysctl -w vm.swappiness=0
vm.swappiness = 0

[root@master ~]# sed -ri '/^[^#]*swap/s@^@#@' /etc/fstab
[root@master ~]# swapon --show
(empty, no output)
```

### 3.2 Check the Uniqueness of the MAC Address and product_uuid

```bash
[root@master ~]# cat /sys/class/dmi/id/product_uuid
de684d56-5f05-25c2-54de-68cd23efd88c

[root@worker01 ~]# cat /sys/class/dmi/id/product_uuid
ea094d56-2f5c-6c05-6365-0ef6c84c61b7

[root@worker02 ~]# cat /sys/class/dmi/id/product_uuid
1c3c4d56-0c08-76ac-61b8-725c5167c05e
```

The product_uuid of the three nodes are all different

### 3.3 Allow iptables to Inspect Bridged Traffic

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

### 3.4 Install kubeadm/kubelet/kubectl 1.23.17

```bash
# Configure the Aliyun K8S apt repository
[root@master ~]# apt-get update
[root@master ~]# apt-get install -y apt-transport-https
[root@master ~]# curl -fsSL https://mirrors.aliyun.com/kubernetes/apt/doc/apt-key.gpg | \
  gpg --dearmor -o /etc/apt/keyrings/kubernetes-archive-keyring.gpg

[root@master ~]# echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-archive-keyring.gpg] https://mirrors.aliyun.com/kubernetes/apt/ kubernetes-xenial main' | \
  tee /etc/apt/sources.list.d/kubernetes.list

# Install the pinned version
[root@master ~]# apt-get update
[root@master ~]# apt-get install -y kubelet=1.23.17-00 kubeadm=1.23.17-00 kubectl=1.23.17-00

[root@master ~]# kubeadm version
kubeadm version: &version.Info{Major:"1", Minor:"23", GitVersion:"v1.23.17", ...}
```

Install on all three nodes

---

## 4. Initializing the Master with kubeadm init

### 4.1 Initialize the Master

```bash
[root@master ~]# kubeadm init \
  --kubernetes-version=v1.23.17 \
  --image-repository registry.aliyuncs.com/google_containers \
  --pod-network-cidr=10.100.0.0/16 \
  --service-cidr=10.200.0.0/16 \
  --service-dns-domain=dawn.com
```

Initialization succeeded

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

### 4.2 Configure kubeconfig

Common error: `The connection to the server localhost:8080 was refused`

The priority for kubectl to look up cluster config: the `--kubeconfig` flag → the `$KUBECONFIG` environment variable → `~/.kube/config`.
When all three are missing, it falls back to the hard-coded `localhost:8080` (a deprecated, insecure port), while the API Server actually listens on `6443`, causing the refusal.
You need to point kubectl at the `/etc/kubernetes/admin.conf` generated by kubeadm.

**Temporary solution (valid only in the current shell)**

```bash
[root@master ~]# export KUBECONFIG=/etc/kubernetes/admin.conf
```

**Permanent solution (recommended, applies automatically on new logins)**

```bash
[root@master ~]# mkdir -p $HOME/.kube
[root@master ~]# cp /etc/kubernetes/admin.conf $HOME/.kube/config
[root@master ~]# chown $(id -u):$(id -g) $HOME/.kube/config
```

Verify:

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

### 4.3 Join the Worker Nodes

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

## 5. Deploying the Flannel CNI Plugin

### 5.1 Upload kube-flannel.yml to the Master

Key configuration in kube-flannel.yml:

```yaml
  net-conf.json: |
    {
      "Network": "10.100.0.0/16",
      "Backend": {
        "Type": "vxlan"
      }
    }
```

### 5.2 Pre-pull Images (on All Three Nodes)

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

### 5.3 Deploy Flannel

```bash
[root@master ~]# kubectl apply -f /root/kube-flannel.yml
namespace/kube-flannel created
serviceaccount/flannel created
clusterrole.rbac.authorization.k8s.io/flannel created
clusterrolebinding.rbac.authorization.k8s.io/flannel created
configmap/kube-flannel-cfg created
daemonset.apps/kube-flannel-ds created
```

### 5.4 Verify the Flannel Pods and Node Status

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

All three nodes are Ready and all three flannel Pods are Running

---

## 6. Verifying Cross-Node Pod Network (CNI)

### 6.1 Deploy Test Pods

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

### 6.2 Cross-Node curl Verification

```bash
# From master, curl xiuxian-v1 on worker01 (Pod IP: 10.100.1.2)
[root@master ~]# curl 10.100.1.2
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v1</title>

# From master, curl xiuxian-v2 on worker02 (Pod IP: 10.100.2.2)
[root@master ~]# curl 10.100.2.2
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v2</title>
```

Cross-node Pod network connectivity succeeded

### 6.3 Clean Up the Test Pods

```bash
[root@master ~]# kubectl delete -f dawn-network-cni.yaml
pod "xiuxian-v1" deleted
pod "xiuxian-v2" deleted

[root@master ~]# kubectl get pods
No resources found in default namespace.
```

---

## 7. kubectl Auto-Completion (on All Three Nodes)

```bash
[root@master ~]# kubectl completion bash > ~/.kube/completion.bash.inc
[root@master ~]# echo source '$HOME/.kube/completion.bash.inc' >> ~/.bashrc
[root@master ~]# source ~/.bashrc
```

---

## 8. Time Zone Settings (on All Three Nodes)

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
