---
title: "KVM仮想化 入門から実戦まで：デプロイ、管理とネットワーク構成"
date: 2026-08-02
tags: ["KVM", "仮想化", "Linux", "CentOS"]
categories: ["仮想化"]
summary: "KVM仮想化技術を体系的に紹介します。発展の歴史、デプロイ方法、仮想マシン管理、ネットワークモードの構成、コマンドラインによる仮想マシンの自動インストールをカバーします。"
showToc: true
TocOpen: true
---

> 本記事ではKVM仮想化技術を体系的に紹介し、発展の歴史、デプロイ方法、仮想マシン管理、ネットワークモードの構成、コマンドラインによる自動インストールをカバーします。すべてのコマンドはCentOS/RHEL環境で検証済みです。

## I. KVMの発展の歴史

KVM（Kernel-based Virtual Machine）は、今日のクラウドコンピューティング分野における主流の仮想化技術です。その発展の脈絡を理解することで、業界がなぜ最終的にKVMを選択したのかを理解できます。

仮想化技術は大きく二つのカテゴリに分けられます：クローズドソース仮想化（例：VMware、Microsoft Hyper-V）とオープンソース仮想化（例：Xen、KVM）。

初期のオープンソース仮想化の代表はXenでした。AWSとAlibaba Cloudは初期にどちらもXen方式を採用していました。CitrixのXenServerおよびデスクトップクラウド製品FusionAccess（Citrix XenDesktopに対応）もXenをベースにしていました。HuaweiのFusionComputeも6.3バージョン以前はXenを使用していました。

主なマイルストーンは以下の通りです：

- **2008年**：Red HatがKVMを買収し、RHEL 5.4で正式にKVMをリリースしました（RHEL 5.0にはXenが搭載されていました）。
- **2010年**：OpenStackプロジェクトが誕生しました。Red HatはIBM、Dell、VMware、Cisco、HPなどと共にKVMオープンソースコミュニティを支援し、オープンソースソフトウェア財団の下でエコシステムを構築しました。同時期にCitrixはCloudStackコミュニティを推進していました。
- **2014年**：RHEL 5.11がリリースされました（RHEL 5.xシリーズのライフサイクル終了、7年間の技術サポート提供、KVMへの無料アップグレードが可能）。
- **2017年前後**：AWSがKVMベースのNitroプラットフォームインスタンスを発表し、Alibaba Cloudおよび世界中の多くのベンダーがKVMを全面的に採用しました。

今日、主要なクラウドサービスプロバイダーの仮想化基盤は基本的にKVMです。HuaweiのFusionCompute 6.3もXenからKVMに切り替えました。2019年にIBMが約340億ドルでRed Hatを買収し、Ansible、GlusterFS、CephなどのRed Hatエコシステムプロジェクトがその傘下に入りました。これはこの技術路線の価値をさらに裏付けるものです。

## II. KVMとは

KVMはKernel-based Virtual Machineの略です。その核心的な特徴は以下の通りです：

- **カーネルのアップグレードが不要**：システム自体のカーネルを直接再利用し、各仮想マシンは一つのプロセスとして実行されます。
- **軽量な仮想化プラットフォーム**：従来の方式に比べてより軽量で効率的です。
- **統合管理**：Xen/KVM仮想化プラットフォームはどちらも統合管理プラットフォームとコマンドラインツールを提供しています。

## III. KVMのデプロイ

### 1. KVM必要パッケージのインストール

**前提条件**：物理マシンのBIOSで仮想化サポートVT-xを有効にします（ほとんどのコンピュータではデフォルトで有効）。VMware内でネストしてインストールする場合は、VMwareの設定でもVT-xサポートを有効にする必要があります。

推奨リソース構成：CPU 4コア、メモリ4GB。

```bash
[root@cloud ~]# yum -y groupinstall "Virtualization*"
[root@cloud ~]# systemctl restart libvirtd.service
```

### 2. グラフィカルな仮想マシンインストール

本実習ではグラフィカルツール`virt-manager`を使用して仮想マシンを作成・インストールします。

> 注意：グラフィカルウィザードの操作手順は本記事ではスクリーンショットで示しません。本文はコマンドライン操作を主とし、グラフィカルインターフェースは指示に従ってクリックすれば完了します。また、「ホストマシン」とはKVM仮想マシンを実行するマシンを指します。本実習はVMware内でネスト仮想化を行うため、ここでのホストマシンは物理マシンではなくVMware仮想マシンです。

まずシステムインストールイメージを準備します：`/isos`ディレクトリを作成し、CentOS 8.4のISOファイルをコピーします。

```bash
[root@cloud ~]# mkdir /isos
```

グラフィカル管理インターフェースを起動します：

```bash
[root@cloud ~]# virt-manager
```

インターフェースで新規仮想マシンの作成をクリックし、`/isos`に配置したISOをインストールソースとして選択し、ウィザードに従ってCPU、メモリ、ディスクを構成すればインストールが完了します。インストールされた仮想マシンのディスクファイルはデフォルトで`/var/lib/libvirt/images/`ディレクトリに`server1.qcow2`のような名前で保存されます：

```bash
[root@cloud ~]# cd /var/lib/libvirt/images/
[root@cloud images]# ls
server1.qcow2
```

### 3. ディスクの作成

前のステップのグラフィカルインストール時にvirt-managerが自動的にディスクを作成します。ここでは手動作成の方法を紹介します。これは後でクラウドイメージの作成や仮想マシンへのディスク追加で使用します。`qemu-img`を使用してqcow2形式のディスクを作成します：

```bash
[root@cloud ~]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server1.qcow2 10g
```

> ヒント：この方法でクラウドイメージを作成する場合、容量が小さいほど作成速度が速くなります。イメージを最小化する方法を研究することをお勧めします。通常、システムディスクは高い性能を要求しません。本当の性能のボトルネックはデータディスクにあります。

### 4. ブリッジモードの作成（アップリンク付き仮想スイッチ）

ネットワーク構成ディレクトリに移動し、既存のネットワークインターフェースをベースにブリッジ構成をコピーします：

```bash
[root@cloud ~]# cd /etc/sysconfig/network-scripts/
[root@cloud network-scripts]# cp ifcfg-ens33 ifcfg-br0
```

ブリッジインターフェース`ifcfg-br0`の編集：

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

物理インターフェース`ifcfg-ens33`をbr0にブリッジするよう編集：

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

ネットワーク構成を再読み込みし、接続を再起動します：

```bash
[root@cloud ~]# nmcli connection reload
[root@cloud ~]# nmcli connection down ens33 ; nmcli connection up ens33
[root@cloud ~]# nmcli connection down br0 ; nmcli connection up br0
```

![ブリッジネットワーク構成](/images/kvm/bridge.png)

### 5. クラウドイメージの作成

**要件：カスタムクラウドマシンイメージを作成します。**

KVM仮想マシンのデプロイ完了後、仮想マシンに入って必要なソフトウェアをインストールします：

1. ローカルyumリポジトリの構成
2. 必要なパッケージのインストール：

```bash
# yum -y install net-tools vim-enhanced bash-completion cloud-init
```

3. `/etc/cloud/cloud.cfg`構成ファイルを編集し、実際の要件に応じてパラメータを調整
4. `/etc/ssh/ssh_host*`を削除
5. `init 0`でシャットダウン

最後にイメージを圧縮します：

```bash
[root@cloud images]# qemu-img convert -c -O qcow2 /var/lib/libvirt/images/server1.qcow2 /isos/server1.qcow2
```

## IV. KVMの管理

virsh対話型インターフェースに入ります：

```bash
[root@cloud ~]# virsh
```

主な仮想マシン管理コマンドは以下の通りです。

**すべての仮想マシンの一覧表示：**

```bash
[root@cloud ~]# virsh list --all
  Id   Name      State
-------------------------
  -    server1   shut off
```

**仮想マシンの起動 / シャットダウン / 強制終了 / 再起動：**

```bash
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh shutdown server1
[root@cloud ~]# virsh destroy server1
[root@cloud ~]# virsh reboot server1
```

### 6. 仮想マシンコンソールインターフェースへのアクセス

KVM仮想マシンに入り、仮想マシンに仮想コンソールを追加することで、ホストマシンからコンソール方式で仮想マシンにアクセスできます。

仮想マシン内でgrub構成を編集：

```bash
[root@VM1 ~]# vim /etc/default/grub
```

`GRUB_CMDLINE_LINUX`の末尾に`console=ttyS0`を追加：

```
GRUB_CMDLINE_LINUX="crashkernel=auto resume=UUID=94e88e69-fad6-4d1f-99cf-0ba83cc793b5 rhgb quiet console=ttyS0"
```

grub構成を再生成し再起動：

```bash
[root@VM1 ~]# grub2-mkconfig -o /boot/grub2/grub.cfg
[root@VM1 ~]# reboot
```

ホストマシンからコンソールに接続：

```bash
[root@cloud ~]# virsh console server1
```

コンソールを終了するショートカットキーは`Ctrl + ]`です。

### 7. 構成による仮想マシンへのディスク追加

**(1) ディスクファイルの作成：**

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/disk2.qcow2 5g
```

**(2) 構成ファイルでディスクを追加：**

```bash
[root@cloud ~]# vim /etc/libvirt/qemu/server1.xml
```

構成に以下のdiskセクションを追加：

```xml
<disk type='file' device='disk'>
  <driver name='qemu' type='qcow2'/>
  <source file='/var/lib/libvirt/images/disk2.qcow2'/>
  <target dev='vdb' bus='virtio'/>
  <address type='pci' domain='0x0000' bus='0x07' slot='0x00' function='0x0'/>
</disk>
```

サービスを再起動し仮想マシンを起動：

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server1
[root@cloud ~]# virsh console server1
```

KVM仮想マシン内でディスクを確認：

```bash
[root@localhost ~]# fdisk -l
/dev/vda
/dev/vdb
```

> 比較：Xen仮想化ではディスクデバイス名は`/dev/xvda`、`/dev/xvdb`です。

### 8. KVM仮想マシンの迅速な作成

既存の仮想マシンのXML構成をコピーして迅速に作成：

```bash
[root@cloud qemu]# cp server1.xml server2.xml
[root@cloud qemu]# uuidgen
f3ccabc3-ca4c-41f2-8d6f-e99077c24eeb
[root@cloud qemu]# vim server2.xml
```

name、uuid、ディスクパス、MACアドレスなどの主要パラメータを変更：

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

サービスを再起動し新しい仮想マシンを起動：

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh start server2
[root@cloud ~]# virsh list --all
```

## V. KVMネットワーク構成

KVMには一般的に3つのネットワークモードがあります：NATモード、ホストオンリーモード（Host-Only）、ブリッジモード。

### 1. NATモード

iptablesのアドレスマスカレードでNATを実現します：

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j MASQUERADE
```

またはSNATでソースアドレスを指定：

```bash
# iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j SNAT --to-source 192.168.8.99
```

![NATモードのネットワークトポロジー](/images/kvm/nat.png)

NATルールの確認：

```bash
[root@cloud ~]# iptables -t nat -nL
```

デフォルトのネットワーク構成ファイルは`/etc/libvirt/qemu/networks`にあります：

```bash
[root@cloud networks]# pwd
/etc/libvirt/qemu/networks
[root@cloud networks]# vim default.xml
```

### 2. ホストオンリーモード

ホストオンリーモードでは、仮想マシンはホストマシンとのみ通信でき、外部ネットワークにはアクセスできません。

![ホストオンリーモードのネットワークトポロジー](/images/kvm/hostonly.png)

### 3. KVM仮想マシンからのインターネットアクセスの有効化

**(1) VMwareホストマシンにインターネットアクセス可能なネットワークインターフェースを追加します。**

**(2) ホストマシンのOSに入り、デュアルブリッジを構成します。**

`ifcfg-br0`（内部ネットワークブリッジ）：

```ini
TYPE=Bridge
NAME=br0
DEVICE=br0
ONBOOT=yes
IPADDR=192.168.8.99
PREFIX=24
```

`ifcfg-br1`（外部ネットワークブリッジ、DHCP）：

```ini
TYPE=Bridge
NAME=br1
DEVICE=br1
ONBOOT=yes
BOOTPROTO=dhcp
```

`ifcfg-ens33`をbr0にブリッジ：

```ini
TYPE=Ethernet
NAME=ens33
DEVICE=ens33
ONBOOT=yes
BRIDGE=br0
```

`ifcfg-ens37`をbr1にブリッジ：

```ini
TYPE=Ethernet
NAME=ens37
DEVICE=ens37
ONBOOT=yes
BRIDGE=br1
```

サービスを再起動し仮想マシンをシャットダウン：

```bash
[root@cloud ~]# systemctl restart libvirtd.service
[root@cloud ~]# virsh shutdown server1
Domain server1 is being shutdown
[root@cloud ~]# virsh shutdown server2
Domain server2 is being shutdown
```

KVM内のserver1仮想マシンのネットワークインターフェースをbr1にブリッジするよう変更し、VM1内でIP取得方式をDHCPに変更：

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

外部ネットワーク接続のテスト：

```bash
[root@VM1 ~]# ping www.baidu.com
PING www.a.shifen.com (183.2.172.17) 56(84) bytes of data.
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=1 ttl=52 time=23.6 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=2 ttl=52 time=24.3 ms
64 bytes from 183.2.172.17 (183.2.172.17): icmp_seq=3 ttl=52 time=23.5 ms
```

## VI. コマンドラインによるKVM仮想マシンのインストール

kickstart自動インストールスクリプトを活用することで、無人での仮想マシンの一括インストールが可能です。

### 1. ディスクの作成

```bash
[root@cloud images]# qemu-img create -f qcow2 -o preallocation=metadata /var/lib/libvirt/images/server3.qcow2 10g
```

### 2. 自動インストール

`virt-install`でインストールソースとkickstartファイルを指定：

```bash
[root@cloud ~]# virt-install -n server3 --memory 2048 --vcpu 2 \
  --disk /var/lib/libvirt/images/server3.qcow2 \
  --network bridge=br1 \
  -l http://192.168.31.96/pub \
  -x inst.ks=http://192.168.31.96/ks/ks01.cfg --vnc
```

kickstart構成ファイル`ks01.cfg`の例：

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

> 注意：上記のインストールソースアドレス（`192.168.0.107`）、ホスト名（`server3`）、および`rootpw`、`user`の後のパスワードハッシュは例です。実際の使用時はご自身の環境のアドレスと生成したパスワード暗号文に置き換えてください。
