---
title: "Manually Deploying a Kubernetes v1.30 Cluster (via kubeadm)"
date: 2026-08-07T13:52:00+08:00
draft: false
categories: ["Kubernetes", "Operations & Deployment"]
tags: ["Kubernetes", "kubeadm", "containerd", "calico", "v1.30", "cluster-deployment"]
summary: "A step-by-step guide to manually deploying a Kubernetes v1.30 cluster with kubeadm — covering firewall/SELinux, swap, kernel modules, Containerd, kubeadm init, worker join, Calico, and an IPVS add-on."
showToc: true
TocOpen: true
---

Planning is as follows:

Master node:   Hostname: master   IP address: 192.168.8.30

Worker01 node: Hostname: node1   IP address: 192.168.8.31

Worker02 node: Hostname: node2   IP address: 192.168.8.32

Complete the following steps on all three nodes, and make sure the clocks of all three nodes are synchronized.


## 1. Disable Firewall and SELinux

```bash
[root@master ~]# systemctl disable firewalld.service --now
[root@master ~]# vim /etc/selinux/config
SELINUX=disabled
[root@master ~]# setenforce 0
```

## 2. Disable Swap

```bash
[root@master ~]# sed -i '/swap/s/^/#/' /etc/fstab
[root@master ~]# swapoff -a
```

## 3. Configure System Parameters and Load Kernel Modules

```bash
[root@master ~]# cat > /etc/modules-load.d/k8s.conf << EOF
overlay
br_netfilter
EOF
[root@master ~]# modprobe overlay
[root@master ~]# modprobe br_netfilter
[root@master ~]# cat > /etc/sysctl.d/k8s.conf << EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
[root@master ~]# sysctl --system
```

## 4. Install the Container Runtime (Containerd)

Kubernetes v1.30 recommends using Containerd as the container runtime:

```bash
[root@master ~]# yum -y remove runc
```

Remove the OS-bundled yum repository files:

```bash
[root@master ~]# rm -rf /etc/yum.repos.d/Cent*.repo
```

Configure the local yum repository:

```bash
[root@master ~]# mount /dev/cdrom /media/
[root@master ~]# cat /etc/fstab | grep iso9660
/dev/cdrom		/media			iso9660 defaults   0 0
[root@master ~]# cat /etc/yum.repos.d/dvd.repo 
[BaseOS]
name=BaseOS
baseurl=file:///media/BaseOS
gpgcheck=0
[AppStream]
name=AppStream
baseurl=file:///media/AppStream
gpgcheck=0
```

Configure Containerd:

```bash
[root@master ~]# yum install -y yum-utils
[root@master ~]# yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```

Install containerd.io:

```bash
[root@master ~]# yum install -y containerd.io
# Generate and edit the configuration file
[root@master ~]# mkdir -p /etc/containerd
[root@master ~]# containerd config default > /etc/containerd/config.toml
# Edit the config to use the systemd cgroup driver
#sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g'  /etc/containerd/config.toml
# Configure image acceleration (optional)
#sed -i 's|registry.k8s.io|registry.aliyuncs.com/google_containers|g' /etc/containerd/config.toml
# Start and enable on boot
#systemctl enable --now containerd
```

## 5. Install and Configure Kubernetes

```bash
[root@master yum.repos.d]# cat kubernetes.repo 
[kubernetes]
name=Kubernetes
baseurl=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/
enabled=1
gpgcheck=1
```

gpgkey=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/repodata/repomd.xml.key

Install the specified version of the Kubernetes components:

```bash
[root@master ~]# yum install -y kubelet-1.30.0 kubeadm-1.30.0 kubectl-1.30.0 --disableexcludes=kubernetes
# Start kubelet
[root@master ~]# systemctl enable --now kubelet
```

## 6. Initialize Kubernetes

Note: Once all nodes have completed the configuration above, run the following steps only on the master node.

```bash
[root@master ~]# kubeadm init --pod-network-cidr=10.244.0.0/16 --service-cidr=172.16.0.0/16 --image-repository registry.aliyuncs.com/google_containers --kubernetes-version v1.30.0  --control-plane-endpoint="192.168.8.30:6443" --upload-certs
# Configure kubectl
[root@master ~]# mkdir -p $HOME/.kube
[root@master ~]# cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
[root@master ~]# chown $(id -u):$(id -g) $HOME/.kube/config
```

## 7. Join Worker Nodes to the Kubernetes Cluster

Run the following commands on the worker nodes. Note: the token and CA certificate hash differ per node — follow the prompt from your own system. The certificate may also expire; if it has, regenerate the join command with `kubeadm token create --print-join-command`.

```bash
[root@node1 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
[root@node2 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
```

## 8. Install the Calico Network Plugin on the Master Node

```bash
# Install the Calico network plugin
[root@master ~]# kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/calico.yaml
```

Note: For well-known reasons, you may encounter issues downloading the Calico image.

I have revised that manifest file — download it to the master node and apply it:

```bash
[root@master ~]# kubectl apply -f /root/calico-ucloud.yaml
```

After installation, run:

```bash
[root@master ~]# kubectl get nodes
NAME     STATUS   ROLES           AGE   VERSION
master   Ready    control-plane   65m   v1.30.13
node1    Ready    <none>          62m   v1.30.0
node2    Ready    <none>          62m   v1.30.0
```

If you see the output above, Kubernetes has been installed successfully.


## 9. Additional Content

Run the following commands on every node:

```bash
kubectl completion bash > /etc/bash_completion.d/kubectl
source /etc/bash_completion.d/kubectl
vim /root/.bashrc
alias docker='crictl'
source /root/.bashrc
```

If you run `# docker images` and encounter the following error:

Kubernetes shows the following warning — here is how to resolve it.

WARN[0000] image connect using default endpoints: [unix:///run/containerd/containerd.sock unix:///run/crio/crio.sock unix:///var/run/cri-dockerd.sock]. As the default settings are now deprecated, you should set the endpoint instead.

This warning indicates that the container runtime client you are using (such as crictl or kubelet) is using the default endpoint configuration, which is now deprecated and must be set explicitly. The detailed steps to fix it are as follows:

```bash
cat > /etc/crictl.yaml << EOF
runtime-endpoint: unix:///run/containerd/containerd.sock  # Choose according to your container runtime
image-endpoint: unix:///run/containerd/containerd.sock
timeout: 10
debug: false
pull-image-on-create: false
EOF
```

Notes:

If you use Containerd, the endpoint is `unix:///run/containerd/containerd.sock`.

If you use CRI-O, the endpoint is `unix:///run/crio/crio.sock`.

Remark: Optional.

If you installed Kubernetes manually, it uses iptables for data forwarding by default. For large-scale scenarios, it is recommended to switch to IPVS mode. The steps to switch to IPVS mode after installation are as follows:

## 1. Install the ipvsadm package on all nodes

## 2. Load the modules on all nodes

```bash
cat > /etc/modules-load.d/ipvs.conf << EOF
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
nf_conntrack
EOF
```

## 3. Edit the kube-proxy ConfigMap

```bash
kubectl edit cm kube-proxy -n kube-system
```

In the editor that opens, find and modify the following section:

```yaml
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration

mode: "ipvs"  # change from "iptables" to "ipvs"

ipvs:
  scheduler: "rr"  # load balancing algorithm: rr|wrr|lc
```

## 4. Force a restart of the kube-proxy Pods

Delete all kube-proxy Pods to trigger recreation:

```bash
#kubectl delete pods -n kube-system -l k8s-app=kube-proxy
```

## 5. Verify the new Pods are running normally

```bash
#kubectl get pods -n kube-system -l k8s-app=kube-proxy
# All Pods should be in Running state
```

## 6. Verify the IPVS configuration is effective

```bash
[root@master ~]# ipvsadm -L -n
TCP  192.168.8.30:30080 rr
  -> 10.244.104.3:80              Masq    1      0          0         
  -> 10.244.104.4:80              Masq    1      0          0         
  -> 10.244.166.132:80            Masq    1      0          0
```
