---
title: "OpenStack Cinder 블록 스토리지 상세 정리: 로컬 LVM + iSCSI 볼륨과 NFS 백엔드 연동"
date: 2026-10-05T23:30:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "Cinder", "블록 스토리지", "LVM", "iSCSI", "NFS"]
summary: "OpenStack Cinder 블록 스토리지 정리: 볼륨 생성과 마운트의 역할 분담(Cinder는 생성, Nova는 마운트), 로컬 LVM + iSCSI로 컨트롤러를 스토리지로 만드는 전체 흐름(VG/LV, targetcli 기반 ISCSI 공유, libvirt 마운트), 그리고 NFS 백엔드 연동과 대시보드 실습."
---

## Cinder 볼륨 생성 및 연결 아키텍처

볼륨 생성은 cinder 노드(컨트롤러 노드)가 담당하고, 볼륨 마운트는 nova가 담당합니다

![](/images/openstack-cinder/img-02.png)

## 로컬 LVM + iSCSI 볼륨 스토리지 구성

1. answers.txt 응답 파일에서 cinder 볼륨을 생성하도록 지정합니다. 실습 환경에서는 전용 스토리지 장비를 제공할 수 없으므로 시스템은 로컬 LVM을 cinder 스토리지로 사용합니다

시스템은 기본적으로 cinder-volumes 볼륨 그룹을 50G 크기로 생성합니다(사용자가 수동 지정)

이 볼륨 그룹은 컨트롤러 노드에 생성됩니다

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

2. /etc/cinder/cinder.conf에서 LVM 드라이버를 호출해 생성된 볼륨 그룹을 인식시킵니다
3. 이 컨트롤러 노드를 ISCSI 스토리지(target)로 사용하여 사용자가 만든 볼륨을 ISCSI로 compute 노드에 공유합니다

사용자가 2G 클라우드 디스크를 생성하면 시스템이 자동으로 LVM 드라이버를 호출해 볼륨 그룹 안에 2G LV를 만듭니다

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

4. 사용자가 이 볼륨을 클라우드 서버 web01에 연결하면 cinder가 스토리지 측에 명령을 보냅니다. 스토리지 측은 해당 LV를 compute 호스트에 공유하고, compute 호스트가 그 디스크를 인식해 새로운 2G 디스크가 생기며 libvirt가 xml 파일을 호출해 클라우드 서버에 추가합니다

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

스토리지 측 설정

1. targetcli 패키지를 설치하고 서비스를 시작합니다

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

2. 타깃, 서비스 서버, 스토리지 클라이언트

```bash
[root@Compute ~]# iscsiadm -m discovery -t st -p 192.168.100.10
[root@Compute ~]# iscsiadm -m node -T iqn.2024.com.storage:disk -p 192.168.100.10:3260 -l
#fdisk -l
```

## Cinder와 NFS 스토리지 연동

![](/images/openstack-cinder/img-01.png)

위 그림에 따라 네트워크를 계획하고 구성합니다

### 1. NFS 스토리지 구성

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

### 2. cinder 노드 네트워크 구성(컨트롤러 노드)

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

### 3. 컴퓨트 노드 네트워크 구성

```bash
[root@Compute ~]# nmcli connection modify ens192 ipv4.addresses 192.168.200.10/24 autoconnect yes ipv4.method manual
[root@Compute ~]# nmcli connection down ens192 ; nmcli connection up ens192
```

### 4. cinder 구성

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

Cinder 노드

```bash
[root@Controller ~]# cat /etc/hosts   ####额外增加一条记录
192.168.8.20 storage
```

컴퓨트 노드

```bash
[root@Compute ~]# cat /etc/hosts
192.168.200.20 storage
[root@Controller ~]# source keystonerc_admin
[root@Controller ~(keystone_admin)]# cinder type-create nfs
[root@Controller ~(keystone_admin)]# cinder type-key nfs set volume_backend_name=nfsdata
[root@Controller ~(keystone_admin)]# systemctl restart openstack-cinder-*
```

5. OpenStack 웹 화면에서 볼륨을 만들고 nfs를 선택한 뒤 해당 볼륨을 클라우드 서버에 연결합니다

   ![image-20261005230924810](/images/openstack-cinder/image-20261005230924810.png)

   ![image-20261005231009576](/images/openstack-cinder/image-20261005231009576.png)

   ![image-20261005231037390](/images/openstack-cinder/image-20261005231037390.png)

   ![image-20261005231112714](/images/openstack-cinder/image-20261005231112714.png)

6. OpenStack 웹 화면에서 볼륨을 만들고 nfs를 선택한 뒤 소스를 이미지로 지정합니다. 클라우드 서버 생성 시에는 방금 만든 볼륨을 소스로 선택합니다

   ![image-20261005230757113](/images/openstack-cinder/image-20261005230757113.png)

   클라우드 서버를 만들고 나면 볼륨 하나가 생성됩니다

   ![image-20261005231222843](/images/openstack-cinder/image-20261005231222843.png)

   기존 클라우드 서버를 삭제하고 다시 생성하면 이 볼륨을 사용할 수 있습니다

   ![image-20261005231447520](/images/openstack-cinder/image-20261005231447520.png)

![](/images/openstack-cinder/img-04.png)
