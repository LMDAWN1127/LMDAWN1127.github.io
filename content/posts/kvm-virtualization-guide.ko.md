---
title: "KVM 가상화 입문부터 실전까지: 배포, 관리 및 네트워크 구성"
date: 2026-08-02
tags: ["KVM", "가상화", "Linux", "CentOS"]
categories: ["가상화"]
summary: "KVM 가상화 기술을 체계적으로 소개합니다. 발전 역사, 배포 방법, 가상 머신 관리, 네트워크 모드 구성 및 명령줄을 통한 가상 머신 자동 설치를 다룹니다."
showToc: true
TocOpen: true
---

> 이 글은 KVM 가상화 기술을 체계적으로 소개하며, 발전 역사, 배포 방법, 가상 머신 관리, 네트워크 모드 구성 및 명령줄을 통한 자동 설치를 다룹니다. 모든 명령은 CentOS/RHEL 환경에서 검증되었습니다.

## I. KVM 발전 역사

KVM(Kernel-based Virtual Machine)은 오늘날 클라우드 컴퓨팅 분야의 주류 가상화 기술입니다. 그 발전 과정을 이해하면 업계가 왜 결국 KVM을 선택했는지 알 수 있습니다.

가상화 기술은 크게 두 가지로 나눌 수 있습니다: 폐쇄형 가상화(예: VMware, Microsoft Hyper-V)와 오픈소스 가상화(예: Xen, KVM).

초기 오픈소스 가상화의 대표 주자는 Xen이었습니다. AWS와 알리바바 클라우드는 초기에 모두 Xen 방식을 채택했습니다. 시트릭스의 XenServer 및 데스크톱 클라우드 제품인 FusionAccess(Citrix XenDesktop에 대응)도 Xen을 기반으로 했습니다. 화웨이의 FusionCompute도 6.3 버전 이전에는 Xen을 사용했습니다.

주요 이정표는 다음과 같습니다:

- **2008년**: Red Hat이 KVM을 인수하고 RHEL 5.4에서 정식으로 KVM을 출시했습니다(RHEL 5.0에는 Xen이 탑재되었습니다).
- **2010년**: OpenStack 프로젝트가 탄생했습니다. Red Hat은 IBM, Dell, VMware, Cisco, HP 등과 함께 KVM 오픈소스 커뮤니티를 포용하고 오픈소스 소프트웨어 재단 아래에서 생태계를 구축했습니다. 같은 시기에 시트릭스는 CloudStack 커뮤니티를 추진했습니다.
- **2014년**: RHEL 5.11이 출시되었습니다(RHEL 5.x 시리즈의 수명 종료, 7년의 기술 지원 제공 및 KVM으로의 무료 업그레이드 가능).
- **2017년 전후**: AWS가 KVM 기반 Nitro 플랫폼 인스턴스를 출시했고, 알리바바 클라우드와 전 세계 수많은 업체가 KVM을 전면 채택했습니다.

오늘날 주요 클라우드 서비스 제공업체의 가상화 기반은 기본적으로 KVM입니다. 화웨이의 FusionCompute 6.3도 Xen에서 KVM으로 전환했습니다. 2019년 IBM이 약 340억 달러에 Red Hat을 인수하면서 Ansible, GlusterFS, Ceph 등 Red Hat 생태계 프로젝트가 그 산하에 편입되었으며, 이는 이 기술 노선의 가치를 추가로 입증합니다.

## II. KVM이란 무엇인가

KVM은 Kernel-based Virtual Machine의 약자입니다. 핵심 특징은 다음과 같습니다:

- **커널 업그레이드 불필요**: 시스템 자체의 커널을 직접 재사용하며, 각 가상 머신은 하나의 프로세스로 실행됩니다.
- **경량 가상화 플랫폼**: 기존 방식에 비해 더 가볍고 효율적입니다.
- **통합 관리**: Xen/KVM 가상화 플랫폼 모두 통합 관리 플랫폼과 명령줄 도구를 제공합니다.

## III. KVM 배포

### 1. KVM 필수 패키지 설치

**전제 조건**: 물리 머신 BIOS에서 가상화 지원 VT-x를 활성화합니다(대부분의 컴퓨터에서 기본 활성화됨). VMware 내부에 중첩 설치하는 경우 VMware 설정에서도 VT-x 지원을 활성화해야 합니다.

권장 리소스 구성: CPU 4코어, 메모리 4GB.

```bash
[root@cloud ~]# yum -y groupinstall "Virtualization*"
[root@cloud ~]# systemctl restart libvirtd.service
```

### 2. 그래픽 도구로 가상 머신 설치

이 실습에서는 그래픽 도구 `virt-manager`를 사용하여 가상 머신을 생성하고 설치합니다.

> 참고: 그래픽 마법사의 조작 과정은 이 글에서 스크린샷으로 보여드리지 않습니다. 본문은 명령줄 조작을 위주로 하며, 그래픽 인터페이스는 안내에 따라 클릭하면 완료할 수 있습니다. 또한, "호스트 머신"이란 KVM 가상 머신을 실행하는 머신을 의미합니다. 이 실습은 VMware에서 중첩 가상화를 수행하므로 여기서 호스트 머신은 물리 머신이 아닌 VMware 가상 머신입니다.

먼저 시스템 설치 이미지를 준비합니다: `/isos` 디렉터리를 생성하고 CentOS 8.4 ISO 파일을 복사합니다.

```bash
[root@cloud ~]# mkdir /isos
```

그래픽 관리 인터페이스를 실행합니다:

```bash
[root@cloud ~]# virt-manager
```

인터페이스에서 새 가상 머신 생성을 클릭하고, `/isos`에 넣은 ISO를 설치 소스로 선택한 후 마법사에 따라 CPU, 메모리, 디스크를 구성하면 설치가 완료됩니다. 설치된 가상 머신의 디스크 파일은 기본적으로 `/var/lib/libvirt/images/` 디렉터리에 `server1.qcow2`와 같은 이름으로 저장됩니다:

```bash
[root@cloud ~]# cd /var/lib/libvirt/images/
[root@cloud images]# ls
server1.qcow2
```

### 3. 디스크 생성

이전 단계의 그래픽 설치 시 virt-manager가 자동으로 디스크를 생성합니다. 여기서는 수동 생성 방법을 소개하며, 이는 나중에 클라우드 이미지 제작 및 가상 머신에 디스크 추가 시 사용됩니다. `qemu-img`를 사용하여 qcow2 형식 디스크를 생성합니다:

```bash
[root@cloud ~]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server1.qcow2 10g
```

> 팁: 이 방식으로 클라우드 이미지를 생성할 때 용량이 작을수록 생성 속도가 빠릅니다. 이미지를 최소한으로 만드는 방법을 연구해 볼 수 있습니다. 일반적으로 시스템 디스크는 성능 요구사항이 높지 않으며, 실제 성능 병목은 데이터 디스크에 있습니다.

### 4. 브리지 모드 생성 (업링크가 있는 가상 스위치)

네트워크 구성 디렉터리로 이동하여 기존 네트워크 인터페이스를 기반으로 브리지 구성을 복사합니다:

```bash
[root@cloud ~]# cd /etc/sysconfig/network-scripts/
[root@cloud network-scripts]# cp ifcfg-ens33 ifcfg-br0
```

브리지 인터페이스 `ifcfg-br0` 편집:

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

물리 인터페이스 `ifcfg-ens33`을 br0에 브리지하도록 편집:

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

네트워크 구성을 다시 로드하고 연결을 재시작합니다:

```bash
[root@cloud ~]# nmcli connection reload
[root@cloud ~]# nmcli connection down ens33 ; nmcli connection up ens33
[root@cloud ~]# nmcli connection down br0 ; nmcli connection up br0
```

![브리지 네트워크 구성](/images/kvm/bridge.png)

### 5. 클라우드 이미지 제작

**요구사항: 사용자 정의 클라우드 머신 이미지를 생성합니다.**

KVM 가상 머신 배포 완료 후, 가상 머신에 접속하여 필요한 소프트웨어를 설치합니다:

1. 로컬 yum 저장소 구성
2. 필수 패키지 설치:

```bash
# yum -y install net-tools vim-enhanced bash-completion cloud-init
```

3. `/etc/cloud/cloud.cfg` 구성 파일 편집, 실제 요구에 따라 매개변수 조정
4. `/etc/ssh/ssh_host*` 삭제
5. `init 0`으로 종료

마지막으로 이미지를 압축합니다:

```bash
[root@cloud images]# qemu-img convert -c -O qcow2 /var/lib/libvirt/images/server1.qcow2 /isos/server1.qcow2
```

## IV. KVM 관리

virsh 대화형 인터페이스 진입:

```bash
[root@cloud ~]# virsh
```

주요 가상 머신 관리 명령은 다음과 같습니다.

**모든 가상 머신 나열:**

```bash
[root@cloud ~]# virsh list --all
  Id   Name      State
-------------------------
  -    server1   shut off
```

**가상 머신 시작 / 종료 / 강제 종료 / 재부팅:**

```bash
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh shutdown server1
[root@cloud ~]# virsh destroy server1
[root@cloud ~]# virsh reboot server1
```

### 6. 가상 머신 콘솔 인터페이스 진입

KVM 가상 머신에 진입하여 가상 머신에 가상 콘솔을 추가함으로써 호스트 머신에서 콘솔 방식으로 가상 머신에 접근할 수 있습니다.

가상 머신 내에서 grub 구성 편집:

```bash
[root@VM1 ~]# vim /etc/default/grub
```

`GRUB_CMDLINE_LINUX` 끝에 `console=ttyS0` 추가:

```
GRUB_CMDLINE_LINUX="crashkernel=auto resume=UUID=94e88e69-fad6-4d1f-99cf-0ba83cc793b5 rhgb quiet console=ttyS0"
```

grub 구성 재생성 및 재부팅:

```bash
[root@VM1 ~]# grub2-mkconfig -o /boot/grub2/grub.cfg
[root@VM1 ~]# reboot
```

호스트 머신에서 콘솔 연결:

```bash
[root@cloud ~]# virsh console server1
```

콘솔 종료 단축키는 `Ctrl + ]`입니다.

### 7. 구성을 통한 가상 머신 디스크 추가

**(1) 디스크 파일 생성:**

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/disk2.qcow2 5g
```

**(2) 구성 파일로 디스크 추가:**

```bash
[root@cloud ~]# vim /etc/libvirt/qemu/server1.xml
```

구성에 다음 disk 섹션 추가:

```xml
<disk type='file' device='disk'>
  <driver name='qemu' type='qcow2'/>
  <source file='/var/lib/libvirt/images/disk2.qcow2'/>
  <target dev='vdb' bus='virtio'/>
  <address type='pci' domain='0x0000' bus='0x07' slot='0x00' function='0x0'/>
</disk>
```

서비스 재시작 및 가상 머신 시작:

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh console server1
```

KVM 가상 머신 내에서 디스크 확인:

```bash
[root@localhost ~]# fdisk -l
/dev/vda
/dev/vdb
```

> 비교: Xen 가상화에서 디스크 장치명은 `/dev/xvda`, `/dev/xvdb`입니다.

### 8. KVM 가상 머신 빠른 생성

기존 가상 머신의 XML 구성을 복사하여 빠르게 생성:

```bash
[root@cloud qemu]# cp server1.xml server2.xml
[root@cloud qemu]# uuidgen
f3ccabc3-ca4c-41f2-8d6f-e99077c24eeb
[root@cloud qemu]# vim server2.xml
```

name, uuid, 디스크 경로 및 MAC 주소 등 주요 매개변수 수정:

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

서비스 재시작 및 새 가상 머신 시작:

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server2
[root@cloud ~]# virsh list --all
```

## V. KVM 네트워크 구성

KVM에는 일반적으로 세 가지 네트워크 모드가 있습니다: NAT 모드, 호스트 전용 모드(Host-Only), 브리지 모드.

### 1. NAT 모드

iptables 주소 변환(MASQUERADE)을 통해 NAT를 구현합니다:

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j MASQUERADE
```

또는 SNAT으로 소스 주소를 지정:

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j SNAT --to-source 192.168.8.99
```

![NAT 모드 네트워크 토폴로지](/images/kvm/nat.png)

NAT 규칙 확인:

```bash
[root@cloud ~]# iptables -t nat -nL
```

기본 네트워크 구성 파일은 `/etc/libvirt/qemu/networks`에 위치:

```bash
[root@cloud networks]# pwd
/etc/libvirt/qemu/networks
[root@cloud networks]# vim default.xml
```

### 2. 호스트 전용 모드

호스트 전용 모드에서는 가상 머신이 호스트 머신과만 통신할 수 있으며 외부 네트워크에 접근할 수 없습니다.

![호스트 전용 모드 네트워크 토폴로지](/images/kvm/hostonly.png)

### 3. KVM 가상 머신에서 인터넷 접근 허용

**(1) VMware 호스트 머신에 인터넷 접근이 가능한 네트워크 인터페이스를 추가합니다.**

**(2) 호스트 머신 운영체제에 진입하여 이중 브리지를 구성합니다.**

`ifcfg-br0`(내부망 브리지):

```ini
TYPE=Bridge
NAME=br0
DEVICE=br0
ONBOOT=yes
IPADDR=192.168.8.99
PREFIX=24
```

`ifcfg-br1`(외부망 브리지, DHCP):

```ini
TYPE=Bridge
NAME=br1
DEVICE=br1
ONBOOT=yes
BOOTPROTO=dhcp
```

`ifcfg-ens33`을 br0에 브리지:

```ini
TYPE=Ethernet
NAME=ens33
DEVICE=ens33
ONBOOT=yes
BRIDGE=br0
```

`ifcfg-ens37`을 br1에 브리지:

```ini
TYPE=Ethernet
NAME=ens37
DEVICE=ens37
ONBOOT=yes
BRIDGE=br1
```

서비스 재시작 및 가상 머신 종료:

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh shutdown server1
Domain server1 is being shutdown
[root@cloud ~]# virsh shutdown server2
Domain server2 is being shutdown
```

KVM 내 server1 가상 머신의 네트워크 인터페이스를 br1에 브리지하도록 수정하고, VM1 내에서 IP 획득 방식을 DHCP로 변경:

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

외부 네트워크 연결 테스트:

```bash
[root@VM1 ~]# ping www.baidu.com
PING www.a.shifen.com (183.2.172.17) 56(84) bytes of data.
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=1 ttl=52 time=23.6 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=2 ttl=52 time=24.3 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=3 ttl=52 time=23.5 ms
```

## VI. 명령줄로 KVM 가상 머신 설치

kickstart 자동 설치 스크립트를 활용하여 무인 방식으로 가상 머신을 일괄 설치할 수 있습니다.

### 1. 디스크 생성

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server3.qcow2 10g
```

### 2. 자동 설치

`virt-install`로 설치 소스와 kickstart 파일을 지정:

```bash
[root@cloud ~]# virt-install -n server3 --memory 2048 --vcpu 2 \
  --disk /var/lib/libvirt/images/server3.qcow2 \
  --network bridge=br1 \
  -l http://192.168.31.96/pub \
  -x inst.ks=http://192.168.31.96/ks/ks01.cfg --vnc
```

kickstart 구성 파일 `ks01.cfg` 예시:

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

> 참고: 위 설치 소스 주소(`192.168.0.107`), 호스트명(`server3`) 및 `rootpw`, `user` 뒤의 비밀번호 해시는 예시입니다. 실제 사용 시 자신의 환경 주소와 생성한 비밀번호 암호문으로 교체하십시오.
