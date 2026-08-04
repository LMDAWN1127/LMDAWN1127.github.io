---
title: "KVM Virtualization from Beginner to Practice: Deployment, Management, and Network Configuration"
date: 2026-08-02
tags: ["KVM", "Virtualization", "Linux", "CentOS"]
categories: ["Virtualization"]
summary: "A systematic introduction to KVM virtualization technology, covering development history, deployment methods, virtual machine management, network mode configuration, and automated VM installation using the command line."
---

> This article systematically introduces KVM virtualization technology, covering its development history, deployment methods, virtual machine management, network mode configuration, and automated VM installation via command line. All commands have been verified on CentOS/RHEL environments.

## I. History of KVM

KVM (Kernel-based Virtual Machine) is the dominant virtualization technology in today's cloud computing landscape. Understanding its development history helps explain why the industry ultimately chose KVM.

Virtualization technologies can be broadly divided into two categories: proprietary virtualization (e.g., VMware, Microsoft Hyper-V) and open-source virtualization (e.g., Xen, KVM).

The early representative of open-source virtualization was Xen. AWS and Alibaba Cloud both adopted Xen in their early days; Citrix's XenServer and the desktop cloud product FusionAccess (corresponding to Citrix XenDesktop) were also based on Xen. Huawei's FusionCompute used Xen prior to version 6.3.

Key milestones are as follows:

- **2008**: Red Hat acquired KVM and officially released it in RHEL 5.4 (RHEL 5.0 shipped with Xen).
- **2010**: The OpenStack project was born. Red Hat, together with IBM, Dell, VMware, Cisco, HP, and other vendors, embraced the KVM open-source community and built the ecosystem under the OpenStack Foundation. During the same period, Citrix promoted the CloudStack community.
- **2014**: RHEL 5.11 was released (the end of life for the RHEL 5.x series, which provided 7 years of technical support and free upgrades to KVM).
- **Around 2017**: AWS launched KVM-based Nitro platform instances. Alibaba Cloud and numerous global vendors fully embraced KVM.

Today, the underlying virtualization technology of major cloud providers is essentially KVM. Huawei's FusionCompute 6.3 also switched from Xen to KVM. In 2019, IBM acquired Red Hat for approximately $34 billion, bringing projects such as Ansible, GlusterFS, and Ceph under its umbrella, further validating the value of this technology path.

## II. What is KVM

KVM stands for Kernel-based Virtual Machine. Its core characteristics are:

- **No kernel upgrade required**: It directly reuses the system's own kernel, with each virtual machine running as a process.
- **Lightweight virtualization platform**: More compact and efficient compared to traditional solutions.
- **Unified management**: Both Xen and KVM virtualization platforms provide unified management platforms and command-line tools.

## III. Deploying KVM

### 1. Install Required KVM Packages

**Prerequisite**: Enable virtualization support (VT-x) in the physical machine's BIOS (enabled by default on most computers). If installing KVM nested inside VMware, you also need to enable VT-x support in VMware settings.

Recommended resource allocation: 4 CPU cores, 4 GB RAM.

```bash
[root@cloud ~]# yum -y groupinstall "Virtualization*"
[root@cloud ~]# systemctl restart libvirtd.service
```

### 2. Graphical VM Installation

This lab uses the graphical tool `virt-manager` to create and install virtual machines.

> Note: The graphical wizard steps are not shown in screenshots in this article. The focus is on command-line operations; the graphical interface can be completed by following the prompts. Additionally, "host machine" refers to the machine running KVM virtual machines. This lab performs nested virtualization in VMware, so the host machine here is a VMware virtual machine, not a physical machine.

First, prepare the system installation image: create an `/isos` directory and copy the CentOS 8.4 ISO file into it.

```bash
[root@cloud ~]# mkdir /isos
```

Then launch the graphical management interface:

```bash
[root@cloud ~]# virt-manager
```

In the interface, click to create a new virtual machine, select the ISO placed in `/isos` as the installation source, and follow the wizard to configure CPU, memory, and disk to complete the installation. The disk file of the installed virtual machine is saved by default in the `/var/lib/libvirt/images/` directory, named like `server1.qcow2`:

```bash
[root@cloud ~]# cd /var/lib/libvirt/images/
[root@cloud images]# ls
server1.qcow2
```

### 3. Creating a Disk

During the graphical installation in the previous step, virt-manager automatically creates the disk. Here we introduce the manual method, which will be used later for creating cloud images and adding disks to virtual machines. Use `qemu-img` to create a qcow2 format disk:

```bash
[root@cloud ~]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server1.qcow2 10g
```

> Tip: If you want to create a cloud image this way, a smaller capacity means faster creation. You can research how to make the image as small as possible. Typically, the system disk does not require high performance; the real performance bottleneck is on the data disk.

### 4. Creating Bridge Mode (Virtual Switch with Uplink)

Enter the network configuration directory and copy a bridge configuration based on the existing network interface:

```bash
[root@cloud ~]# cd /etc/sysconfig/network-scripts/
[root@cloud network-scripts]# cp ifcfg-ens33 ifcfg-br0
```

Edit the bridge interface `ifcfg-br0`:

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

Edit the physical interface `ifcfg-ens33` to bridge it to br0:

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

Reload the network configuration and restart the connections:

```bash
[root@cloud ~]# nmcli connection reload
[root@cloud ~]# nmcli connection down ens33 ; nmcli connection up ens33
[root@cloud ~]# nmcli connection down br0 ; nmcli connection up br0
```

![Bridge Network Configuration](/images/kvm/bridge.png)

### 5. Creating a Cloud Image

**Requirement: Create a custom cloud machine image.**

After deploying the KVM virtual machine, enter the VM and install some necessary software:

1. Configure a local yum repository
2. Install necessary packages:

```bash
# yum -y install net-tools vim-enhanced bash-completion cloud-init
```

3. Edit the `/etc/cloud/cloud.cfg` configuration file and adjust parameters as needed
4. Delete `/etc/ssh/ssh_host*`
5. Run `init 0` to shut down

Finally, compress the image:

```bash
[root@cloud images]# qemu-img convert -c -O qcow2 /var/lib/libvirt/images/server1.qcow2 /isos/server1.qcow2
```

## IV. Managing KVM

Enter the virsh interactive interface:

```bash
[root@cloud ~]# virsh
```

Common virtual machine management commands are as follows.

**List all virtual machines:**

```bash
[root@cloud ~]# virsh list --all
  Id   Name      State
-------------------------
  -    server1   shut off
```

**Start / Shut down / Force off / Reboot a virtual machine:**

```bash
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh shutdown server1
[root@cloud ~]# virsh destroy server1
[root@cloud ~]# virsh reboot server1
```

### 6. Accessing the VM Console Interface

To enter a KVM virtual machine, add a virtual console to the VM, enabling console access from the host machine.

Edit the grub configuration inside the virtual machine:

```bash
[root@VM1 ~]# vim /etc/default/grub
```

Append `console=ttyS0` to the end of `GRUB_CMDLINE_LINUX`:

```
GRUB_CMDLINE_LINUX="crashkernel=auto resume=UUID=94e88e69-fad6-4d1f-99cf-0ba83cc793b5 rhgb quiet console=ttyS0"
```

Regenerate the grub configuration and reboot:

```bash
[root@VM1 ~]# grub2-mkconfig -o /boot/grub2/grub.cfg
[root@VM1 ~]# reboot
```

Connect to the console from the host machine:

```bash
[root@cloud ~]# virsh console server1
```

The shortcut to exit the console is `Ctrl + ]`.

### 7. Adding a Disk to a VM via Configuration

**(1) Create a disk file:**

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/disk2.qcow2 5g
```

**(2) Add the disk via the configuration file:**

```bash
[root@cloud ~]# vim /etc/libvirt/qemu/server1.xml
```

Add the following disk section to the configuration:

```xml
<disk type='file' device='disk'>
  <driver name='qemu' type='qcow2'/>
  <source file='/var/lib/libvirt/images/disk2.qcow2'/>
  <target dev='vdb' bus='virtio'/>
  <address type='pci' domain='0x0000' bus='0x07' slot='0x00' function='0x0'/>
</disk>
```

Restart the service and start the virtual machine:

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh console server1
```

Verify the disk inside the KVM virtual machine:

```bash
[root@localhost ~]# fdisk -l
/dev/vda
/dev/vdb
```

> Comparison: Under Xen virtualization, disk device names are `/dev/xvda`, `/dev/xvdb`.

### 8. Quickly Creating a KVM Virtual Machine

Quickly create a new VM by copying an existing VM's XML configuration:

```bash
[root@cloud qemu]# cp server1.xml server2.xml
[root@cloud qemu]# uuidgen
f3ccabc3-ca4c-41f2-8d6f-e99077c24eeb
[root@cloud qemu]# vim server2.xml
```

Modify key parameters such as name, uuid, disk path, and MAC address:

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

Restart the service and start the new virtual machine:

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server2
[root@cloud ~]# virsh list --all
```

## V. KVM Network Configuration

KVM commonly supports three network modes: NAT mode, Host-Only mode, and Bridge mode.

### 1. NAT Mode

NAT is implemented through iptables address masquerading:

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j MASQUERADE
```

Or use SNAT to specify the source address:

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j SNAT --to-source 192.168.8.99
```

![NAT Mode Network Topology](/images/kvm/nat.png)

View NAT rules:

```bash
[root@cloud ~]# iptables -t nat -nL
```

The default network configuration file is located at `/etc/libvirt/qemu/networks`:

```bash
[root@cloud networks]# pwd
/etc/libvirt/qemu/networks
[root@cloud networks]# vim default.xml
```

### 2. Host-Only Mode

In Host-Only mode, virtual machines can only communicate with the host machine and cannot access external networks.

![Host-Only Mode Network Topology](/images/kvm/hostonly.png)

### 3. Enabling KVM Virtual Machines to Access the Internet

**(1) Add a network interface to the VMware host that can access the Internet.**

**(2) Enter the host operating system and configure dual bridges.**

`ifcfg-br0` (internal network bridge):

```ini
TYPE=Bridge
NAME=br0
DEVICE=br0
ONBOOT=yes
IPADDR=192.168.8.99
PREFIX=24
```

`ifcfg-br1` (external network bridge, DHCP):

```ini
TYPE=Bridge
NAME=br1
DEVICE=br1
ONBOOT=yes
BOOTPROTO=dhcp
```

`ifcfg-ens33` bridged to br0:

```ini
TYPE=Ethernet
NAME=ens33
DEVICE=ens33
ONBOOT=yes
BRIDGE=br0
```

`ifcfg-ens37` bridged to br1:

```ini
TYPE=Ethernet
NAME=ens37
DEVICE=ens37
ONBOOT=yes
BRIDGE=br1
```

Restart the service and shut down the virtual machines:

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh shutdown server1
Domain server1 is being shutdown
[root@cloud ~]# virsh shutdown server2
Domain server2 is being shutdown
```

Modify the network interface of server1 in KVM to bridge to br1, and change the IP acquisition method to DHCP inside VM1:

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

Test external network connectivity:

```bash
[root@VM1 ~]# ping www.baidu.com
PING www.a.shifen.com (183.2.172.17) 56(84) bytes of data.
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=1 ttl=52 time=23.6 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=2 ttl=52 time=24.3 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=3 ttl=52 time=23.5 ms
```

## VI. Installing KVM Virtual Machines via Command Line

With kickstart automated installation scripts, you can perform unattended batch installation of virtual machines.

### 1. Create a Disk

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server3.qcow2 10g
```

### 2. Automated Installation

Use `virt-install` to specify the installation source and kickstart file:

```bash
[root@cloud ~]# virt-install -n server3 --memory 2048 --vcpu 2 \
  --disk /var/lib/libvirt/images/server3.qcow2 \
  --network bridge=br1 \
  -l http://192.168.31.96/pub \
  -x inst.ks=http://192.168.31.96/ks/ks01.cfg --vnc
```

Example kickstart configuration file `ks01.cfg`:

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

> Note: The installation source addresses (`192.168.0.107`), hostname (`server3`), and the password hashes after `rootpw` and `user` in the above example are for illustration only. Please replace them with your own environment's addresses and generated password ciphertexts in actual use.
