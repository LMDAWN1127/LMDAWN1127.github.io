---
title: "手动部署 Kubernetes v1.30 集群（kubeadm 方式）"
date: 2026-08-07T13:52:00+08:00
draft: false
categories: ["Kubernetes", "运维部署"]
tags: ["Kubernetes", "kubeadm", "containerd", "calico", "v1.30", "集群部署"]
---

规划如下：


master节点：   计算机名： master   IP地址：192.168.8.30


worker01节点： 计算机名： node1   IP地址： 192.168.8.31


worker02节点： 计算机名： node2   IP地址： 192.168.8.32


在三个节点上均完成以下步骤，并且保证三个节点时间均一致。


## 1. 关闭防火墙和SELinux

```bash
[root@master ~]# systemctl disable firewalld.service --now
[root@master ~]# vim /etc/selinux/config
SELINUX=disabled
[root@master ~]# setenforce 0
```

## 2. 关闭swap

```bash
[root@master ~]#sed -i '/swap/s/^/#/' /etc/fstab
[root@master ~]# swapoff -a
```

## 3. 设置系统参数，加载内核模块

```bash
[root@master ~]# cat > /etc/modules-load.d/k8s.conf << EOF
overlay
br_netfilter
EOF
[root@master ~]#modprobe overlay
[root@master ~]#modprobe br_netfilter
[root@master ~]# cat > /etc/sysctl.d/k8s.conf << EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
[root@master ~]# sysctl --system
```

## 4. 安装容器运行时（Containerd）


Kubernetes v1.30 推荐使用 Containerd 作为容器运行时：

```bash
[root@master ~]# yum -y  remove runc
```

删除系统自带的yum仓库文件

```bash
[root@master ~]# rm -rf /etc/yum.repos.d/Cent*.repo
```

配置本地yum仓库

```bash
[root@master ~]# mount /dev/cdrom /media/
[root@master ~]# cat /etc/fstab  |grep iso9660
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

配置Containerd

```bash
[root@master ~]#yum install -y yum-utils
[root@master ~]#yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```

安装containerd.io

```bash
[root@master ~]#yum install -y containerd.io
# 生成并修改配置文件
[root@master ~]#mkdir -p /etc/containerd
[root@master ~]#containerd config default > /etc/containerd/config.toml
# 修改配置使用systemd cgroup驱动
#sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g'  /etc/containerd/config.toml
# 配置镜像加速（可选）
#sed -i 's|registry.k8s.io|registry.aliyuncs.com/google_containers|g' /etc/containerd/config.toml
# 启动并设置开机自启
#systemctl enable --now containerd
```

## 5. 安装和配置kubernetes

```bash
[root@master yum.repos.d]# cat kubernetes.repo 
[kubernetes]
name=Kubernetes
baseurl=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/repodata/repomd.xml.key
```


安装指定版本的kubernetes组件

```bash
[root@master ~]#yum install -y kubelet-1.30.0 kubeadm-1.30.0 kubectl-1.30.0 --disableexcludes=kubernetes
# 启动kubelet
[root@master ~]#systemctl enable --now kubelet
```

## 6. 初始化kubernetes


注意：当所有的节点完成以上配置后，仅需在master节点上执行以下步骤

```bash
[root@master ~]# kubeadm init --pod-network-cidr=10.244.0.0/16 --service-cidr=172.16.0.0/16 --image-repository registry.aliyuncs.com/google_containers --kubernetes-version v1.30.0  --control-plane-endpoint="192.168.8.30:6443" --upload-certs
# 配置kubectl
[root@master ~]#mkdir -p $HOME/.kube
[root@master ~]#cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
[root@master ~]#chown $(id -u):$(id -g) $HOME/.kube/config
```

## 7. 将worker节点加入kubernetes集群


按照以下命令在worker节点上执行，注意：不同的节点token和ca证书可能都会不同，请根据自己系统的提示执行，证书也可能会过期，如果已经过期，可以执行kubeadm token create --print-join-command重新生成

```bash
[root@node1 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
[root@node2 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
```

## 8. 在master节点上安装calico网络插件

```bash
# 安装Calico网络插件
[root@master ~]#kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/calico.yaml
```

备注：由于众所周知的原因，可能会出现无法下载calico镜像的问题


我重新修改了该文件，请下载到master节点上，执行该文件即可

> 文件已上传至百度网盘，下载链接：https://pan.baidu.com/s/1BPCFxv0kE0KWb04Qsgy71g （提取码：s44k）

```bash
[root@master ~]#kubectl apply -f  /root/calico-ucloud.yaml
```

安装完成后，执行

```bash
[root@master ~]# kubectl get nodes
NAME     STATUS   ROLES           AGE   VERSION
master   Ready    control-plane   65m   v1.30.13
node1    Ready    <none>          62m   v1.30.0
node2    Ready    <none>          62m   v1.30.0
```

如果看到以上结果，表示kubernetes已经安装完成。


## 9. 扩展内容


在各个节点上执行以下命令

```bash
kubectl completion bash > /etc/bash_completion.d/kubectl
source /etc/bash_completion.d/kubectl
vim  /root/.bashrc
alias docker='crictl'
source /root/.bashrc
```

> **说明：**
> - **kubectl 命令补全**：上面前两行把 kubectl 的补全脚本写入 `/etc/bash_completion.d/`。但前提是**系统已安装 `bash-completion` 软件包**（如 `yum install -y bash-completion` 或 `apt install -y bash-completion`），否则该目录不存在、补全无法生效；此外 kubectl 本身还需执行这两条命令才能真正开启补全（即 k8s 需额外配置才能补全）。
> - **`docker` 别名**：Kubernetes 改用 containerd 容器运行时后，容器管理命令由 `docker` 变为 `crictl`。这里把 `docker` 别名成 `crictl`，是为了照顾习惯使用 `docker` 命令的用户，使其沿用原有的操作习惯。

当如果执行#docker images，报错情况：


k8s出现以下提示，如何解决


WARN[0000] image connect using default endpoints: [unix:///run/containerd/containerd.sock unix:///run/crio/crio.sock unix:///var/run/cri-dockerd.sock]. As the default settings are now deprecated, you should set the endpoint instead.


这个警告提示表明你使用的容器运行时客户端（如 crictl 或 kubelet）正在使用默认的端点配置，而这些默认配置已被弃用，需要显式指定端点。以下是解决此问题的详细步骤：

```bash
cat > /etc/crictl.yaml << EOF
runtime-endpoint: unix:///run/containerd/containerd.sock  # 根据你的容器运行时选择
image-endpoint: unix:///run/containerd/containerd.sock
timeout: 10
debug: false
pull-image-on-create: false
EOF
```

说明：


若使用 Containerd，端点为 unix:///run/containerd/containerd.sock。


若使用 CRI-O，端点为 unix:///run/crio/crio.sock。


备注： 可选


如果手动安装kubernetes，默认使用的是iptables转发数据，如果大规模的场景，则建议修改为ipvs模式，如果需要在安装完成后，修改为ipvs模式


## 1. 在所有的节点上安装ipvsadm软件包

```bash
[root@master ~]# yum -y install ipvsadm
```

## 2. 在所有节点上加载模块

```bash
cat > /etc/modules-load.d/ipvs.conf << EOF
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
nf_conntrack
EOF
```

## 3. 编辑kube-proxy ConfigMap

```bash
kubectl edit cm kube-proxy -n kube-system
```

在打开的编辑器中，找到并修改以下部分：

```yaml
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration

mode: "ipvs"  # 将原来的"iptables"改为"ipvs"

ipvs:
  scheduler: "rr"  # 负载均衡算法，可选 rr|wrr|lc
```


## 4. 强制重启 kube-proxy Pods


删除所有kube-proxy Pod，触发重建

```bash
#kubectl delete pods -n kube-system -l k8s-app=kube-proxy
```

## 5. 验证新 Pod 是否正常运行：

```bash
#kubectl get pods -n kube-system -l k8s-app=kube-proxy
# 所有Pod状态应为Running
```

## 6. 验证 IPVS 配置生效

```bash
[root@master ~]# ipvsadm -L -n
TCP  192.168.8.30:30080 rr
  -> 10.244.104.3:80              Masq    1      0          0         
  -> 10.244.104.4:80              Masq    1      0          0         
  -> 10.244.166.132:80            Masq    1      0          0
```
