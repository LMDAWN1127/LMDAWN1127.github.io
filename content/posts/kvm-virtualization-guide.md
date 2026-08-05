---
title: "KVM 虚拟化入门到实战：部署、管理与网络配置"
date: 2026-08-02
draft: false
tags: ["KVM", "虚拟化", "Linux", "CentOS"]
showToc: true
TocOpen: true
---

# KVM 虚拟化入门到实战：部署、管理与网络配置

> 本文系统介绍 KVM 虚拟化技术，涵盖发展历史、部署方法、虚拟机管理、网络模式配置，以及使用命令行自动化安装虚拟机。所有命令均在 CentOS/RHEL 环境下验证。

## 一、KVM 发展历史

KVM（Kernel-based Virtual Machine，基于内核的虚拟机）是当前云计算领域主流的虚拟化技术。了解它的发展脉络，有助于理解为什么业界最终选择了 KVM。

虚拟化技术大致可分为两类：闭源虚拟化（如 VMware、Microsoft Hyper-V）和开源虚拟化（如 Xen、KVM）。

早期的开源虚拟化代表是 Xen。AWS 和阿里云早期都采用 Xen 方案；Citrix 的 XenServer（思杰）以及桌面云产品 FusionAccess（对应 Citrix XenDesktop）也基于 Xen。华为的 FusionCompute 在 6.3 版本之前同样使用 Xen。

关键的时间节点如下：

- **2008 年**：RedHat 收购 KVM，并在 RHEL 5.4 版本中正式发布 KVM（RHEL 5.0 发布的是 Xen）。
- **2010 年**：OpenStack 项目诞生，红帽联合 IBM、Dell、VMware、Cisco、HP 等厂商共同拥抱 KVM 开源社区，在开源软件基金会下共建生态。同期 Citrix 主推 CloudStack 社区。
- **2014 年**：RHEL 5.11 发布（RHEL 5.x 系列的生命周期终点，提供 7 年有效技术支持，可免费升级到 KVM）。
- **2017 年前后**：AWS 推出基于 KVM 的 Nitro 平台实例，阿里云及全球众多厂商全面拥抱 KVM。

如今，主流云厂商的虚拟化底层基本都是 KVM。华为 FusionCompute 6.3 版本也从 Xen 切换到了 KVM。2019 年 IBM 以约 340 亿美金收购红帽公司，ansible、glusterfs、ceph 等红帽生态项目随之纳入麾下，进一步印证了这条技术路线的价值。

## 二、什么是 KVM

KVM 全称 Kernel-based Virtual Machine，即基于内核的虚拟机。它的核心特点是：

- **无需升级内核**：直接复用系统本身的内核，每个虚拟机被当做一个进程来运行。
- **轻量级虚拟化平台**：相比传统方案更轻巧高效。
- **统一管理**：XEN/KVM 虚拟化平台都提供统一的管理平台和命令行工具。

## 三、部署 KVM

### 1. 安装 KVM 所需软件包

**前提条件**：在物理机 BIOS 中开启虚拟化支持 VT-x（大部分电脑默认开启）。如果是在 VMware 中嵌套安装，还需要在 VMware 里开启 VT-x 支持。

建议资源配置：CPU 4 核，内存 4G。

```bash
[root@cloud ~]# yum -y groupinstall "Virtualization*"
[root@cloud ~]# systemctl restart libvirtd.service
```

### 2. 图形化安装虚拟机

本实验使用图形化工具 `virt-manager` 来创建并安装虚拟机。

> 说明：图形化向导的操作过程本文不再截图展示，全文以命令行操作为主，图形界面按提示点击即可完成。另外，宿主机指运行 KVM 虚拟机的那台机器，本实验在 VMware 中进行嵌套虚拟化，因此这里的宿主机是一台 VMware 虚拟机，而非物理机。

首先准备系统安装镜像：创建 `/isos` 目录，并将 CentOS 8.4 的 ISO 文件复制进去。

```bash
[root@cloud ~]# mkdir /isos
```

然后启动图形化管理界面：

```bash
[root@cloud ~]# virt-manager
```

在界面中点击新建虚拟机，选择刚才放入 `/isos` 的 ISO 作为安装源，再按向导依次配置 CPU、内存和磁盘，即可完成安装。安装好的虚拟机磁盘文件默认保存在 `/var/lib/libvirt/images/` 目录下，形如 `server1.qcow2`：

```bash
[root@cloud ~]# cd /var/lib/libvirt/images/
[root@cloud images]# ls
server1.qcow2
```

### 3. 创建磁盘

上一步图形化安装时 virt-manager 会自动创建磁盘；这里介绍手动创建的方式，后面制作云镜像、给虚拟机添加硬盘都会用到。使用 `qemu-img` 创建 qcow2 格式磁盘：

```bash
[root@cloud ~]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server1.qcow2 10g
```

> 提示：如果要用这种方式创建云镜像，容量越小速度越快，可以研究如何把镜像做得最小。通常系统盘性能要求不高，真正的性能瓶颈在数据磁盘。

### 4. 创建桥接模式（带上行链路的虚拟交换机）

进入网络配置目录，基于现有网卡复制一份桥接配置：

```bash
[root@cloud ~]# cd /etc/sysconfig/network-scripts/
[root@cloud network-scripts]# cp ifcfg-ens33 ifcfg-br0
```

编辑桥接网卡 `ifcfg-br0`：

```bash
[root@cloud network-scripts]# cat ifcfg-br0
```

```ini
TYPE=Bridge
NAME=br0
DEVICE=br0
ONBOOT=yes
IPADDR=192.168.8.99
PREFIX=24
GATEWAY=192.168.8.254
DNS1=192.168.8.254
```

编辑物理网卡 `ifcfg-ens33`，将其桥接到 br0：

```bash
[root@cloud network-scripts]# cat ifcfg-ens33
```

```ini
TYPE=Ethernet
NAME=ens33
DEVICE=ens33
ONBOOT=yes
BRIDGE=br0
```

重新加载网络配置并重启连接：

```bash
[root@cloud ~]# nmcli connection reload
[root@cloud ~]# nmcli connection down ens33 ; nmcli connection up ens33
[root@cloud ~]# nmcli connection down br0 ; nmcli connection up br0
```

![桥接网络配置示意](/images/kvm/bridge.png)

### 5. 制作云主机镜像

**需求：创建一个自定义云主机镜像。**

在 KVM 虚拟机部署完成后，进入虚拟机安装一些必要软件：

1. 配置本地 yum 源
2. 安装必要的软件包：

```bash
# yum -y install net-tools vim-enhanced bash-completion cloud-init
```

3. 编辑 `/etc/cloud/cloud.cfg` 配置文件，按实际需求调整其中的参数
4. 删除 `/etc/ssh/ssh_host*`
5. 执行 `init 0` 关机

最后压缩镜像：

```bash
[root@cloud images]# qemu-img convert -c -O qcow2 /var/lib/libvirt/images/server1.qcow2 /isos/server1.qcow2
```

## 四、管理 KVM

进入 virsh 交互界面：

```bash
[root@cloud ~]# virsh
```

常用的虚拟机管理命令如下。

**列出所有虚拟机：**

```bash
[root@cloud ~]# virsh list --all
  Id   Name      State
-------------------------
  -    server1   shut off
```

**开启 / 关闭 / 强制关闭 / 重启虚拟机：**

```bash
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh shutdown server1
[root@cloud ~]# virsh destroy server1
[root@cloud ~]# virsh reboot server1
```

### 6. 进入虚拟机 console 接口

进入 KVM 虚拟机，给虚拟机添加虚拟 console，从而实现从宿主机以 console 方式访问虚拟机。

在虚拟机中编辑 grub 配置：

```bash
[root@VM1 ~]# vim /etc/default/grub
```

在 `GRUB_CMDLINE_LINUX` 末尾追加 `console=ttyS0`：

```
GRUB_CMDLINE_LINUX="crashkernel=auto resume=UUID=94e88e69-fad6-4d1f-99cf-0ba83cc793b5 rhgb quiet console=ttyS0"
```

重新生成 grub 配置并重启：

```bash
[root@VM1 ~]# grub2-mkconfig -o /boot/grub2/grub.cfg
[root@VM1 ~]# reboot
```

在宿主机上连接 console：

```bash
[root@cloud ~]# virsh console server1
```

退出 console 的快捷键是 `Ctrl + ]`。

### 7. 通过配置给虚拟机添加硬盘

**（1）创建磁盘文件：**

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/disk2.qcow2 5g
```

**（2）通过配置文件添加硬盘：**

```bash
[root@cloud ~]# vim /etc/libvirt/qemu/server1.xml
```

在配置中加入如下 disk 段：

```xml
<disk type='file' device='disk'>
  <driver name='qemu' type='qcow2'/>
  <source file='/var/lib/libvirt/images/disk2.qcow2'/>
  <target dev='vdb' bus='virtio'/>
  <address type='pci' domain='0x0000' bus='0x07' slot='0x00' function='0x0'/>
</disk>
```

重启服务并启动虚拟机：

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh console server1
```

在 KVM 虚拟机中验证磁盘：

```bash
[root@localhost ~]# fdisk -l
/dev/vda
/dev/vdb
```

> 对比：Xen 虚拟化下磁盘设备名为 `/dev/xvda`、`/dev/xvdb`。

### 8. 快速创建 KVM 虚拟机

通过复制现有虚拟机的 XML 配置来快速创建：

```bash
[root@cloud qemu]# cp server1.xml server2.xml
[root@cloud qemu]# uuidgen
f3ccabc3-ca4c-41f2-8d6f-e99077c24eeb
[root@cloud qemu]# vim server2.xml
```

修改 name、uuid、磁盘路径和 MAC 地址等关键参数：

```xml
<domain type='kvm'>
  <name>server2</name>
  <uuid>f3ccabc3-ca4c-41f2-8d6f-e99077c24eeb</uuid>
  <metadata>
  <disk type='file' device='disk'>
    <driver name='qemu' type='qcow2'/>
    <source file='/isos/server1.qcow2'/>
    <target dev='vda' bus='virtio'/>
    <address type='pci' domain='0x0000' bus='0x04' slot='0x00' function='0x0'/>
  </disk>
  <interface type='bridge'>
    <mac address='52:54:00:96:f6:a2'/>
    <source bridge='br0'/>
    <model type='virtio'/>
    <address type='pci' domain='0x0000' bus='0x01' slot='0x00' function='0x0'/>
  </interface>
```

重启服务并启动新虚拟机：

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server2
[root@cloud ~]# virsh list --all
```

## 五、KVM 网络配置

KVM 常见有三种网络模式：NAT 模式、仅主机模式（Host-Only）和桥接模式。

### 1. NAT 模式

通过 iptables 地址伪装实现 NAT：

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j MASQUERADE
```

或者使用 SNAT 指定源地址：

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j SNAT --to-source 192.168.8.99
```

![NAT 模式网络拓扑](/images/kvm/nat.png)

查看 NAT 规则：

```bash
[root@cloud ~]# iptables -t nat -nL
```

默认网络配置文件位于 `/etc/libvirt/qemu/networks`：

```bash
[root@cloud networks]# pwd
/etc/libvirt/qemu/networks
[root@cloud networks]# vim default.xml
```

### 2. 仅主机模式

仅主机模式下，虚拟机只能与宿主机通信，无法访问外部网络。

![仅主机模式网络拓扑](/images/kvm/hostonly.png)

### 3. 让 KVM 中的虚拟机访问 Internet

**（1）给 VMware 宿主机添加一块可以访问 Internet 的网卡。**

**（2）进入宿主机操作系统，配置双桥接。**

`ifcfg-br0`（内网桥接）：

```ini
TYPE=Bridge
NAME=br0
DEVICE=br0
ONBOOT=yes
IPADDR=192.168.8.99
PREFIX=24
```

`ifcfg-br1`（外网桥接，DHCP 获取地址）：

```ini
TYPE=Bridge
NAME=br1
DEVICE=br1
ONBOOT=yes
BOOTPROTO=dhcp
```

`ifcfg-ens33` 桥接到 br0：

```ini
TYPE=Ethernet
NAME=ens33
DEVICE=ens33
ONBOOT=yes
BRIDGE=br0
```

`ifcfg-ens37` 桥接到 br1：

```ini
TYPE=Ethernet
NAME=ens37
DEVICE=ens37
ONBOOT=yes
BRIDGE=br1
```

重启服务并关闭虚拟机：

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh shutdown server1
Domain server1 is being shutdown
[root@cloud ~]# virsh shutdown server2
Domain server2 is being shutdown
```

将 KVM 中 server1 虚拟机网卡修改为桥接到 br1，进入 VM1 把 IP 获取方式改为 DHCP：

```bash
[root@VM1 ~]# nmcli connection modify enp1s0 ipv4.method auto autoconnect yes
[root@VM1 ~]# nmcli connection down enp1s0 ; nmcli connection up enp1s0
[root@VM1 ~]# ifconfig
enp1s0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.31.158  netmask 255.255.255.0  broadcast 192.168.31.255
        inet6 fe80::5054:ff:fe96:f6a1  prefixlen 64  scopeid 0x20<link>
        ether 52:54:00:96:f6:a1  txqueuelen 1000  (Ethernet)
        RX packets 1253  bytes 279527 (272.9 KiB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 119  bytes 17932 (17.5 KiB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
```

测试外网连通性：

```bash
[root@VM1 ~]# ping www.baidu.com
PING www.a.shifen.com (183.2.172.17) 56(84) bytes of data.
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=1 ttl=52 time=23.6 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=2 ttl=52 time=24.3 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=3 ttl=52 time=23.5 ms
```

## 六、使用命令行安装 KVM 虚拟机

借助 kickstart 自动化安装脚本，可以无人值守地批量安装虚拟机。

### 1. 创建磁盘

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server3.qcow2 10g
```

### 2. 自动化安装

使用 `virt-install` 指定安装源和 kickstart 文件：

```bash
[root@cloud ~]# virt-install -n server3 --memory 2048 --vcpu 2 \
  --disk /var/lib/libvirt/images/server3.qcow2 \
  --network bridge=br1 \
  -l http://192.168.31.96/pub \
  -x inst.ks=http://192.168.31.96/ks/ks01.cfg --vnc
```

kickstart 配置文件 `ks01.cfg` 示例：

```bash
# vim /var/www/html/ks/ks01.cfg
```

```kickstart
#version=RHEL8
# Use text install for fully unattended
text

repo --name="AppStream" --baseurl=http://192.168.0.107/pub/AppStream
repo --name="BaseOS" --baseurl=http://192.168.0.107/pub/BaseOS
reboot

%packages
@^minimal-environment
kexec-tools

%end

# Keyboard layouts
keyboard --xlayouts='us'
# System language
lang en_US.UTF-8

# Network information
network --bootproto=dhcp --activate --hostname=server3 --onboot=yes

# Use network installation media
url --url=http://192.168.0.107/pub/BaseOS

# Run the Setup Agent on first boot
firstboot --disable

ignoredisk --only-use=vda
clearpart --all --initlabel
autopart
# System timezone
timezone Asia/Shanghai --utc

# Root password
rootpw --iscrypted $6$c31XqEglO8ECIli0$enF8T.LW3OknT.178Vb9m2HHYD6dqRdKF2QZia5.G5Tv/zMD//04S2h61oBOKihJZwPIUmWxLc7oXuWtkHQy10
user --name=admin --password=$6$Ey847S5bcqYg8ktk$sd4BJeFF01IFsGOaFwRoqXoYuZ5H1RV3bLC6n6gQGa1tNAjplFDhTnm3Cjw2pgwltIE.xr27X7E/ro4gF2JSG1 --iscrypted --gecos="admin"

%addon com_redhat_kdump --enable --reserve-mb='auto'

%end

%anaconda
pwpolicy root --minlen=6 --minquality=1 --notstrict --nochanges --notempty
pwpolicy user --minlen=6 --minquality=1 --notstrict --nochanges --emptyok
pwpolicy luks --minlen=6 --minquality=1 --notstrict --nochanges --notempty
%end
```

> 说明：上面的安装源地址（`192.168.0.107`）、主机名（`server3`）以及 `rootpw`、`user` 后的密码哈希均为示例，实际使用时请替换为自己环境的地址和生成的密码密文。
