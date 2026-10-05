---
title: "OpenStack Cinder 块存储详解：LVM + iSCSI 本地卷与 NFS 后端对接"
date: 2026-10-05T23:30:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "Cinder", "块存储", "LVM", "iSCSI", "NFS"]
summary: "梳理 OpenStack Cinder 块存储：卷创建与挂载的架构分工（Cinder 建卷、Nova 挂载）、本地 LVM + iSCSI 把控制节点变成存储端的完整链路（VG/LV/targetcli ISCSI 共享/libvirt 挂载），以及对接 NFS 存储的后端配置与 Web 界面实操。"
---

## cinder创建卷和挂载卷架构

创建卷流程是由cinder节点提供（控制节点），挂载卷流程是由nova提供的

![](/images/openstack-cinder/img-02.png)

## 本地 LVM + iSCSI 卷存储配置

1. 在answers.txt应答文件中指定要创建cinder卷，考虑到实验环境无法提供专门的存储设备，所以系统采用本地LVM作为cinder存储

系统默认会创建一个cinder-volumes卷组，大小为50G（用户手动指定）

该卷组创建在控制节点上

```bash
[root@Controller ~]# vgdisplay
  --- Volume group ---
  VG Name               cl
  System ID
  Format                lvm2
  Metadata Areas        1
  Metadata Sequence No  4
  VG Access             read/write
  VG Status             resizable
  MAX LV                0
  Cur LV                3
  Open LV               3
  Max PV                0
  Cur PV                1
  Act PV                1
  VG Size               <99.00 GiB
  PE Size               4.00 MiB
  Total PE              25343
  Alloc PE / Size       25343 / <99.00 GiB
  Free  PE / Size       0 / 0
  VG UUID               K2c9TX-MlXI-k9Ga-CPPm-3zuu-WNoK-mRuUEZ

  --- Volume group ---
  VG Name               cinder-volumes
  System ID
  Format                lvm2
  Metadata Areas        1
  Metadata Sequence No  4
  VG Access             read/write
  VG Status             resizable
  MAX LV                0
  Cur LV                1
  Open LV               0
  Max PV                0
  Cur PV                1
  Act PV                1
  VG Size               <51.50 GiB
  PE Size               4.00 MiB
  Total PE              13183
  Alloc PE / Size       12551 / <49.03 GiB
  Free  PE / Size       632 / <2.47 GiB
  VG UUID               nXhaeU-1PwG-is18-Ef2N-cK5R-9LRk-3ksn1k
```

2. 在/etc/cinder/cinder.conf调用LVM驱动来识别创建的卷组
3. 将该控制节点当做ISCSI存储（target），将用户创建的卷使用ISCSI共享给compute节点

当用户创建2G的云硬盘，系统会自动调用LVM驱动在卷组中创建2G LV

![image-20261005160032207](/images/openstack-cinder/image-20261005160032207.png)

```bash
[root@Controller ~]# lvdisplay
  --- Logical volume ---
  LV Path                /dev/cl/swap
  LV Name                swap
  VG Name                cl
  LV UUID                f9Aqve-GgxT-gQNg-v0W0-ogyz-1cJT-WIEOMw
  LV Write Access        read/write
  LV Creation host, time localhost.localdomain, 2026-06-27 05:28:10 +0800
  LV Status              available
  # open                 2
  LV Size                <7.88 GiB
  Current LE             2016
  Segments               1
  Allocation             inherit
  Read ahead sectors     auto
  - currently set to     8192
  Block device           253:1

  --- Logical volume ---
  LV Path                /dev/cl/home
  LV Name                home
  VG Name                cl
  LV UUID                5f8ntZ-4pxS-yYFl-3BHC-qKaW-pFsi-2ZGkHg
  LV Write Access        read/write
  LV Creation host, time localhost.localdomain, 2026-06-27 05:28:10 +0800
  LV Status              available
  # open                 1
  LV Size                29.89 GiB
  Current LE             7653
  Segments               1
  Allocation             inherit
  Read ahead sectors     auto
  - currently set to     8192
  Block device           253:2

  --- Logical volume ---
  LV Path                /dev/cl/root
  LV Name                root
  VG Name                cl
  LV UUID                32JpBQ-Ld4z-0bLU-jHuG-iMRC-WLoO-WtcrnT
  LV Write Access        read/write
  LV Creation host, time localhost.localdomain, 2026-06-27 05:28:10 +0800
  LV Status              available
  # open                 1
  LV Size                <61.23 GiB
  Current LE             15674
  Segments               1
  Allocation             inherit
  Read ahead sectors     auto
  - currently set to     8192
  Block device           253:0

  --- Logical volume ---
  LV Name                cinder-volumes-pool
  VG Name                cinder-volumes
  LV UUID                ughXDw-Fl7B-Mbo9-vsHS-OvMy-Pi60-E2GPaa
  LV Write Access        read/write (activated read only)
  LV Creation host, time Controller, 2026-07-08 16:03:29 +0800
  LV Pool metadata       cinder-volumes-pool_tmeta
  LV Pool data           cinder-volumes-pool_tdata
  LV Status              available
  # open                 0
  LV Size                <48.93 GiB
  Allocated pool data    0.00%
  Allocated metadata     10.44%
  Current LE             12525
  Segments               1
  Allocation             inherit
  Read ahead sectors     auto
  - currently set to     8192
  Block device           253:6

  --- Logical volume ---
  LV Path                /dev/cinder-volumes/volume-3561d822-2929-4b47-87c5-25f769f8f44e
  LV Name                volume-3561d822-2929-4b47-87c5-25f769f8f44e
  VG Name                cinder-volumes
  LV UUID                WoSBug-zWc4-wVYn-39xk-MWVw-z3Pj-UOdvok
  LV Write Access        read/write
  LV Creation host, time Controller, 2026-10-05 15:56:30 +0800
  LV Pool name           cinder-volumes-pool
  LV Status              available
  # open                 0
  LV Size                2.00 GiB
  Mapped size            0.00%
  Current LE             512
  Segments               1
  Allocation             inherit
  Read ahead sectors     auto
  - currently set to     8192
  Block device           253:7
```

4. 当用户要将该卷附加给云主机web01，cinder发送指令给存储端，存储端就会把该LV共享给compute主机，从而让compute主机识别到该硬盘，产生了一个新的2G硬盘，并通过libvirt调用xml文件，给云主机添加

   ![image-20261005161115673](/images/openstack-cinder/image-20261005161115673.png)

```bash
[root@Controller ~]# systemctl status target
● target.service - Restore LIO kernel target configuration
   Loaded: loaded (/usr/lib/systemd/system/target.service; enabled; vendor preset: disabled)
   Active: active (exited) since Mon 2026-10-05 14:18:51 CST; 1h 30min ago
  Process: 1873 ExecStart=/usr/bin/targetctl restore (code=exited, status=0/SUCCESS)
 Main PID: 1873 (code=exited, status=0/SUCCESS)
    Tasks: 0 (limit: 36406)
   Memory: 0B
   CGroup: /system.slice/target.service

Oct 05 14:18:50 Controller systemd[1]: Starting Restore LIO kernel target configuration...
Oct 05 14:18:51 Controller target[1873]: No saved config file at /etc/target/saveconfig.json, ok, exiting
Oct 05 14:18:51 Controller systemd[1]: Started Restore LIO kernel target configuration.
[root@Controller ~]# targetcli
targetcli shell version 2.1.53
Copyright 2011-2013 by Datera, Inc and others.
For help on commands, type 'help'.

/> ls
o- / ......................................................................................................................... [...]
  o- backstores .............................................................................................................. [...]
  | o- block .................................................................................................. [Storage Objects: 1]
  | | o- iqn.2010-10.org.openstack:volume-3561d822-2929-4b47-87c5-25f769f8f44e  [/dev/cinder-volumes/volume-3561d822-2929-4b47-87c5-25f769f8f44e (2.0GiB) write-thru activated]
  | |   o- alua ................................................................................................... [ALUA Groups: 1]
  | |     o- default_tg_pt_gp ....................................................................... [ALUA state: Active/optimized]
  | o- fileio ................................................................................................. [Storage Objects: 0]
  | o- pscsi .................................................................................................. [Storage Objects: 0]
  | o- ramdisk ................................................................................................ [Storage Objects: 0]
  o- iscsi ............................................................................................................ [Targets: 1]
  | o- iqn.2010-10.org.openstack:volume-3561d822-2929-4b47-87c5-25f769f8f44e ............................................. [TPGs: 1]
  |   o- tpg1 .......................................................................................... [no-gen-acls, auth per-acl]
  |     o- acls .......................................................................................................... [ACLs: 1]
  |     | o- iqn.1994-05.com.redhat:1220933cde3c ...................................................... [1-way auth, Mapped LUNs: 1]
  |     |   o- mapped_lun0 ................. [lun0 block/iqn.2010-10.org.openstack:volume-3561d822-2929-4b47-87c5-25f769f8f44e (rw)]
  |     o- luns .......................................................................................................... [LUNs: 1]
  |     | o- lun0  [block/iqn.2010-10.org.openstack:volume-3561d822-2929-4b47-87c5-25f769f8f44e (/dev/cinder-volumes/volume-3561d822-2929-4b47-87c5-25f769f8f44e) (default_tg_pt_gp)]
  |     o- portals .................................................................................................... [Portals: 1]
  |       o- 192.168.100.10:3260 .............................................................................................. [OK]
  o- loopback ......................................................................................................... [Targets: 0]
/>
[root@Compute ~]# cat /etc/iscsi/initiatorname.iscsi
InitiatorName=iqn.1994-05.com.redhat:1220933cde3c
[root@Compute ~]# iscsiadm -m session
tcp: [1] 192.168.100.10:3260,1 iqn.2010-10.org.openstack:volume-3561d822-2929-4b47-87c5-25f769f8f44e (non-flash)
[root@Compute ~]# vim /etc/libvirt/qemu/instance-00000002.xml
    <disk type='block' device='disk'>
      <driver name='qemu' type='raw' cache='none' io='native'/>
      <source dev='/dev/sda'/>
      <target dev='vdb' bus='virtio'/>
      <serial>3561d822-2929-4b47-87c5-25f769f8f44e</serial>
      <address type='pci' domain='0x0000' bus='0x00' slot='0x07' function='0x0'/>
    </disk>
```

存储端配置

1. 安装targetcli软件包，并启动服务

```bash
#yum -y install targetcli
#systemctl enable target --now
#targetcli
/> /backstores/block create dev=/dev/sdb1 name=data01
/> /iscsi create iqn.2024.com.storage:disk
/> /iscsi/ iqn.2024.com.storage:disk/tpg1/acls create iqn.1994-05.com.redhat:b4ff583759f4
/>/iscsi/ iqn.2024.com.storage:disk /tpg1/luns create data01
/> /iscsi/ iqn.2024.com.storage:disk/tpg1/portals create 192.168.100.10:3260
/> saveconfig
```

2. 目标器  业务服务器  存储客户端

```bash
[root@Compute ~]# iscsiadm -m discovery -t st -p 192.168.100.10
[root@Compute ~]# iscsiadm -m node -T iqn.2024.com.storage:disk -p 192.168.100.10:3260 -l
#fdisk -l
```

## Cinder对接NFS存储

![](/images/openstack-cinder/img-01.png)

根据上图规划和配置网络

### 1. 配置NFS存储

```bash
#配置网络
[root@storage ~]# nmcli connection modify ens160 ipv4.addresses 192.168.200.20/24 ipv4.method manual autoconnect yes
[root@storage ~]# nmcli connection down ens160 ; nmcli connection up ens160
[root@storage ~]# cd /etc/sysconfig/network-scripts/
[root@storage network-scripts]# cp ifcfg-ens160 ifcfg-ens192
[root@storage network-scripts]# cat ifcfg-ens192
# Generated by parse-kickstart
TYPE=Ethernet
DEVICE=ens192
ONBOOT=yes
BOOTPROTO=none
NAME=ens192
[root@storage ~]# nmcli connection reload
[root@storage ~]# nmcli connection modify ens192 ipv4.addresses 192.168.8.20/24 ipv4.method manual autoconnect yes
[root@storage ~]# nmcli connection down ens192 ; nmcli connection up ens192
#安装配置安装NFS服务
[root@storage ~]# yum install -y nfs-utils rpcbind
[root@storage ~]# mkdir /storage
[root@storage ~]# cat /etc/exports
/storage   192.168.200.0/24(rw,sync,no_root_squash)
/storage   192.168.8.0/24(rw,sync,no_root_squash)
[root@storage ~]# systemctl enable nfs-server --now
[root@storage ~]# systemctl enable rpcbind --now
```

### 2. 配置cinder节点网络（控制节点）

```bash
[root@Controller ~]# cat /etc/sysconfig/network-scripts/ifcfg-ens192
TYPE=Ethernet
NAME=ens192
DEVICE=ens192
ONBOOT=yes
IPADDR=192.168.8.10
NETMASK=255.255.255.0
[root@Controller ~]# systemctl restart network
```

### 3. 配置计算节点网络

```bash
[root@Compute ~]# nmcli connection modify ens192 ipv4.addresses 192.168.200.10/24 autoconnect yes ipv4.method manual
[root@Compute ~]# nmcli connection down ens192 ; nmcli connection up ens192
```

### 4.配置cinder

```bash
[root@Controller ~]# vim /etc/cinder/cinder.conf
410 default_volume_type=nfs
436 enabled_backends=lvm,nfs666
[nfs666]
volume_backend_name=nfsdata
volume_driver=cinder.volume.drivers.nfs.NfsDriver
nfs_shares_config = /etc/cinder/nfs_shares
[root@Controller ~]# cat /etc/cinder/nfs_shares
storage:/storage
[root@Controller ~]# systemctl restart openstack-cinder-*
```

Cinder节点

```bash
[root@Controller ~]# cat /etc/hosts   ####额外增加一条记录
192.168.8.20 storage
```

计算节点

```bash
[root@Compute ~]# cat /etc/hosts
192.168.200.20 storage
[root@Controller ~]# source keystonerc_admin
[root@Controller ~(keystone_admin)]# cinder type-create nfs
[root@Controller ~(keystone_admin)]# cinder type-key nfs set volume_backend_name=nfsdata
[root@Controller ~(keystone_admin)]# systemctl restart openstack-cinder-*
```

5. 在openstack web界面上，创建卷，选择nfs，将该卷关联给云主机

   ![image-20261005230924810](/images/openstack-cinder/image-20261005230924810.png)

   ![image-20261005231009576](/images/openstack-cinder/image-20261005231009576.png)

   ![image-20261005231037390](/images/openstack-cinder/image-20261005231037390.png)

   ![image-20261005231112714](/images/openstack-cinder/image-20261005231112714.png)

6. 在openstack web界面上，创建卷，选择nfs, 源选择镜像，创建云主机时，选择源为刚创建的卷

   ![image-20261005230757113](/images/openstack-cinder/image-20261005230757113.png)

   创建完云主机后会产生一个卷

   ![image-20261005231222843](/images/openstack-cinder/image-20261005231222843.png)

   将原来云主机删除，再次创建云主机这个卷就可以使用了

   ![image-20261005231447520](/images/openstack-cinder/image-20261005231447520.png)

![](/images/openstack-cinder/img-04.png)
