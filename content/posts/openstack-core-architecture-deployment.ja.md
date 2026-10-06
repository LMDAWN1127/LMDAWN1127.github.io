---
title: "OpenStack �ラ�ド OS：���ー�テ�チャと自動化デプロ�"
date: 2026-10-06T20:35:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "�ラ�ド�ンピューテ�ン�", "自動化デプロ�", "Packstack", "Victoria"]
summary: "���ンポーネント（Nova/Glance/Neutron/Cinder など）か�、Packstack �用いた Victoria リリー�の一元自動デプロ�、さ�に Rsyslog ロ�トラブル�ューテ�ン�まで�"
---

## 一、OpenStack の���ンポーネントとその役割

### 1. HORIZON —— 統一�ラフ��ル管理�ン�ール�ービ�
* **��機能**: Web ベー�の Dashboard �ラフ��ル管理�ン�ール�提供し、�ラ�ド管理者と一般テナントが�ラ�ドリ�ー��視覚的に割�当て・監視でき��うにす��

### 2. NOVA —— �ンピュートリ�ー�管理�ービ�
* **��機能**: �ラ�ド環境の仮想化�ンピュートリ�ー�（`nova-compute`）�管理・設定す��
* **役割分担**:
  * **Controller 制御ノード**: `nova-api`、`nova-scheduler`、`nova-conductor` などの���ューリン��ービ��実行す��ユー�ーが�ラ�ド�ン��ン�作成�要�す�と、`nova-api` が要��受け取�解析し、`nova-scheduler` がポリ�ーに基づき最適な�ンピュートノード�選択して負荷�分散す��
  * **Compute �ンピュートノード**: �ラ�ド�ン��ン��実際に実行す�ワー�ーノード（KVM、VMware ESXi、Xen などの異種ハ�パーバ��ーに対応）�
* **制御ノードの高可用性とパフ�ーマン�のボトルネッ�**:
  * 制御ノードはすべての API �ート���、デー�ベー�、メッ�ー��ュー�担ってお�、高可用性とパフ�ーマン�の負荷が生じ��

### 3. GLANCE —— �メー��ービ�
* **��機能**: OS �メー�の発見・登録・検索・�トレー�管理�担当す��
* **一般的なデ����メー�形式**:
  * KVM で一般的な形式: `qcow2`（�ンプロビ�ョニン�と�ピー�ンラ�ト COW ��ポート）;
  * VMware で一般的な形式: `vmdk`�
* **デプロ�推奨**: 通常、高可用性�実現す�た�に制御ノード上に統合・併置してデプロ�す��

### 4. SWIFT —— �ブ���ト�トレー��ービ�
* **��機能**: 高可用性・分散・結果整合性の���ブ���ト�トレー��ービ�（Object Storage）�提供し、静的で非構造化のデー�、�ラ�ド�ン��ン�の��テム�メー�、デー�のフルバッ��ップなどに特化してい��

### 5. NEUTRON —— �フト���定義ネットワー�（SDN）
* **��機能**: �ラ�ド環境でネットワー�・��・�・�ービ��提供し、仮想ルー�ー、��ッチ、��ュリテ��ループ、フローテ�ン� IP、ノード間トラフ�ッ�の接続�管理す��
* **ネットワー�技術**: VLAN、VXLAN、Geneve、分散仮想ルーテ�ン�（DVR）�全面�ポート;
* **ハード��� SDN モード**: 本番環境では通常 2 台の�用ネットワー�ノード�配置して��テ�ブ・��テ�ブまたは��テ�ブ・��ンバ��ラ���構築す��

### 6. CINDER —— ブロッ��トレー��ービ�
* **��機能**: �ラ�ド�ン��ン�向けの永続的なブロッ��トレー�（�ラ�ドデ���）�提供し、動的な��ッチ・デ�ッチ・�ナップ�ョット・容量拡張が可能�
* **バッ��ンド連携能力**:
  * 従来型�トレー��レ�との連携: Huawei OceanStor、IBM、EMC などのハ��ンドハード����トレー�;
  * �ープン�ー�分散�トレー�との連携: Ceph RBD、GlusterFS など�
* **バッ��ンドの仕組み**: ユー�ーが�ラ�ドデ����申請す�と、Cinder は指示�バッ��ンド�トレー���テムに下位伝達し、本質的に物理／分散�トレー�内に LUN �切�出してマッピン�す��
* **比較説明**: �ブ���ト�トレー�（Baidu Netdisk、Swift、S3 など）はブロッ�デバ��として直接フ�ーマットして�ラ�ド�ン��ン�のフ��ル��テムとしてマ�ントできないが、Cinder ブロッ�デバ��は直接フ�ーマットしてマ�ントして利用でき��

### 7. HEAT —— �ー��トレー�ョン�ービ�
* **��機能**: 宣言型テンプレート（HOT テンプレートまたは AWS CloudFormation 形式）に基づき、�ラフ��ルな�ー��トレー�ョン���リプトで複数の VM、デー�ベー��ラ��、ネットワー�トポロ�、監視ポリ�ー�ワン�リッ�で自動一括デプロ�す��

### 8. CEILOMETER —— メー�リン�・監視�ービ�
* **��機能**: 物理リ�ー�と仮想リ�ー�のパフ�ーマン�指標、稼働�間、使用量�収集す��
  * **パブリッ��ラ�ド�ナリ�**: API 呼び出し回数、ネットワー�送信量、�ンピュート�間�記録し、課金��テムと連携す�;
  * **プラ�ベート�ラ�ド�ナリ오**: テナントの��ー�水位�監視し、リ�ー�の過剰利用�遊休�特定して�ャパ�テ�プランニン��支援す��

### 9. KEYSTONE —— 統一認証・認可�ービ�
* **��機能**: OpenStack 全体の��ュリテ�の礎石で��、プラットフ�ーム全体のテナント（Project）、ユー�ー（User）、ロール（Role）、�ービ���ロ�、トー�ン認証�担当す��
* **�ン�ープラ��向け��デンテ�テ�フ�デレー�ョン**:
  * 企業の既存の Windows Active Directory (AD) � Linux OpenLDAP と�ームレ�に統合し、�ン�ープラ���レードの統一���ント単一��ン�ン（SSO）�実現す�;
* **フロー承認と権限分離（Huawei Cloud の例）**:
  * �ラ�ド�ン��ン�の多段階申請・承認ワー�フロー��ポート（最大 5 段階の承認）;
  * 「三権分立」の��ュリテ�原則�徹底（��ュリテ�責任者、��テム管理者、監査員が権限�分離して管理）;
  * 顧客の自社開発 OA/BPM 承認フロー��テムとの連携��ポート�

---

### ���ンポーネント早見表：
| �ンポーネント名 | �ード名 | ���ービ�機能 |
| :--- | :--- | :--- |
| **Horizon** | Dashboard | 統一 Web �ラフ��ル管理�ン�ール |
| **Nova** | Compute | �ンピュートリ�ー�のラ�フ���ルと�ン��ン����ューリン�管理 |
| **Glance** | Image | 仮想マ�ン�メー�の�トレー�とバー�ョン登録 |
| **Swift** | Object | 大規模非構造化�ブ���ト�トレー��ービ� |
| **Neutron** | Network | �フト���定義ネットワー�（SDN）、ルーテ�ン�と��ュリテ��ループ管理 |
| **Cinder** | Block | �ラ�ド�ン��ン�の永続ブロッ��トレー�（�ラ�ドデ���）管理 |
| **Heat** | Orchestration | �ンフラ�トラ�チャ・��・�ード（IaC）の複数リ�ー���ッ��ー��トレー�ョン |
| **Ceilometer** | Metering | リ�ー�使用量統計、監視メー�リン�、��ー�分析 |
| **Keystone** | Identity | 統一認証、認可トー�ン、�ービ���ロ�管理 |

---

## 二、OpenStack デプロ�計画（Victoria 版）

### 1. デプロ�方式の比較
1. **�ープン�ー�の手動デプロ�**: �ンポーネント�個別に�ンパ�ル・設定す�—煩雑で複雑で��、通常は基盤メ�ニ�ムの深い学習向け;
2. **ツールに��自動化デプロ�**:
   * **Ansible デプロ�**（OpenStack-Ansible、Kolla-Ansible など）;
   * **Packstack デプロ�**: Red Hat が公開す� Puppet ベー�の自動化迅速デリバリーツール（本実践で採用）;

---

### 2. �ラ��ノード仕様とネットワー�計画

#### （1）Controller 制御ノード（1 台）
* **搭載�ンポーネント**:
  * API �ービ�: `nova-api`、`cinder-api`、`glance-api`、`neutron-server` など;
  * 基盤�ービ�: MariaDB / MySQL、RabbitMQ メッ�ー��ュー、Memcached、Keystone;
  * ネットワー�・管理�ービ�: ネットワー�ノードの外部ルーテ�ン�転送、ロー�ル YUM �ャッ�ュ、Chrony �刻同期�ーバー�
* **��テム構成要件**:
  * **CPU**: 4 vCPU 以上
  * **メモリ**: 4GB 以上
  * **デ���**: 100GB の空きデ���容量
  * **NIC**: 3 枚のネットワー��ード（NIC 1 は�ン�ーネット接続用ブリッ�モード、NIC 2 と NIC 3 はホ�ト�ンリー mode で内部トラフ�ッ�）
* **IP �ドレ�計画**:
  * 内部管理 IP: 192.168.100.10
  * 外部���� IP: 192.168.10.10

#### （2）Compute �ンピュートノード（1 台）
* **搭載�ンポーネント**: `nova-compute`、ネットワー� L2 Agent（Open vSwitch Agent）
* **��テム構成要件**:
  * **CPU**: 4 vCPU 以上
  * **メモリ**: 8GB 以上（最低 4GB）
  * **デ���**: 100GB のデ���容量
  * **NIC**: 3 枚のネットワー��ード（すべてホ�ト�ンリー mode）
* **IP �ドレ�計画**:
  * Compute: 192.168.100.11

#### （3）YUM リポ�トリ�ーバー + Chrony �刻同期�ーバー（1 台）
* **��テム構成要件**:
  * **CPU**: 2 vCPU
  * **メモリ**: 2GB
  * **NIC**: 2 枚（1 枚は�ン�ーネットにブリッ�して公開�刻同期と上流リポ�トリ用、�う 1 枚はホ�ト�ンリーで内部ノードへ提供）
* **IP �ドレ�計画**:
  * 外部 IP: 192.168.10.11
  * 内部 IP: 192.168.100.20

> **環境ダ�ン�レード説明**: パー�ナル�ンピュー�のハード���資源が限��てい�場合、**最小構成� 2 台の VM に圧縮**でき�（制御ノード� YUM �ー�と�刻同期�ーバーとして兼用し、�う 1 台��ンピュートノードとす�）�注意: 各ノードの��テム�刻は高度に一致していなけ�ばな�ず、**�刻ドリフトは 5 分�超えてはな�ない**�さ�ないと Keystone ハンド����とメッ�ー��ュー通信が全面的に失敗す��

---

## 三、OpenStack 自動化デプロ�実践手順

### フ�ー�1：YUM リポ�トリ�ーバーと Chrony �刻同期�ーバーの構築

#### 1. ネットワー��ン�ーフ�ー�の設定
```bash
# 1. 内部通信用 NIC ens160 �設定
[root@Cloud ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens160
TYPE=Ethernet
BOOTPROTO=none
NAME=ens160
DEVICE=ens160
ONBOOT=yes
IPADDR=192.168.100.20
PREFIX=24

# 2. �ン�ーネット接続用 NIC ens192 �設定（公開 NTP 同期用）
[root@Cloud ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens192
TYPE=Ethernet
BOOTPROTO=none
NAME=ens192
DEVICE=ens192
ONBOOT=yes

PROXY_METHOD=none
BROWSER_ONLY=no
IPADDR=192.168.10.11
PREFIX=24
GATEWAY=192.168.10.1
DNS1=192.168.10.1
DEFROUTE=yes
IPV4_FAILURE_FATAL=no
IPV6INIT=no
UUID=03da7500-2101-c722-2438-d0d006c28c73

# NIC �再起動して設定�有効化
[root@Cloud ~]# nmcli connection down ens160 ; nmcli connection up ens160
Connection 'ens160' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/1)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/4)
[root@Cloud ~]# nmcli connection down ens192 ; nmcli connection up ens192
Connection 'ens192' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/5)
```

#### 2. ロー�ル CD-ROM YUM リポ�トリの設定
```bash
[root@Cloud ~]# cd /etc/yum.repos.d/
[root@Cloud yum.repos.d]# mkdir bak
[root@Cloud yum.repos.d]# mv CentOS-Linux-* bak/

# OS �ン�トール ISO �マ�ント
mount /dev/cdrom /media/

# CD-ROM ロー�ルリポ�トリ設定フ��ル�作成
[root@Cloud ~]# cat > /etc/yum.repos.d/dvd.repo << 'EOF'
> [BaseOS]
> name=BaseOS
> baseurl=file:///media/BaseOS
> gpgcheck=0
>
> [AppStream]
> name=AppStream
> baseurl=file:///media/AppStream
> gpgcheck=0
> EOF
```

#### 3. Chrony �刻同期�ーバーの設定
OpenStack はノード間の�刻同期に対す�要�が極�て厳しいた�、まず�刻�ー��設定す�:

```bash
# /etc/chrony.conf �編集
[root@Cloud ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool ntp.tencent.com iburst
# Allow NTP client access from local network.
allow 192.168.100.0/24
# Serve time even if not synchronized to a time source.
local stratum 10

# �刻同期�ービ��再起動して検証
[root@Cloud ~]# systemctl restart chronyd.service
[root@Cloud ~]# chronyc sources
210 Number of sources = 1
MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 106.55.184.199                2   6    17     2   -224us[ -144us] +/-   54ms

# フ�����ールと SELinux �無効化
[root@Cloud ~]# systemctl disable firewalld.service --now
[root@Cloud ~]# setenforce 0
[root@Cloud ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
```

#### 4. httpd に��ロー�ル Web YUM リポ�トリの構築
CentOS 8 お�び OpenStack Victoria �フト���リポ�トリ� HTTP ミラー�ー�として公開し、すべての�ラ��ノードが取得でき��うにす��

```bash
# 1. Apache Web �ービ���ン�トールして起動
[root@Cloud ~]# yum -y install httpd
[root@Cloud ~]# systemctl enable httpd --now

# 2. デ�レ�トリ�作成し�メー�フ��ル�マ�ント
[root@Cloud ~]# mkdir /isos
[root@Cloud ~]# mkdir -p /var/www/html/centos8
[root@Cloud ~]# mkdir -p /var/www/html/openstack

# ベー���テム CD と OpenStack Victoria �ン�トール�メー��マ�ント
[root@Cloud ~]# mount /dev/cdrom /var/www/html/centos8/
[root@Cloud ~]# mount /isos/26-CentOS8-4-OSP-Victoria.iso /var/www/html/openstack/

# 3. マ�ント� /etc/fstab に永続化
[root@Cloud ~]# vim /etc/fstab
/dev/cdrom              /var/www/html/centos8   iso9660  defaults  0 0
/isos/26-CentOS8-4-OSP-Victoria.iso  /var/www/html/openstack iso9660 defaults 0 0

# 4. HTTP YUM リポ�トリフ��ル�設定
[root@Cloud ~]# vim /etc/yum.repos.d/dvd.repo
[BaseOS]
name=BaseOS
baseurl=http://192.168.100.20/centos8/BaseOS
gpgcheck=0

[AppStream]
name=AppStream
baseurl=http://192.168.100.20/centos8/AppStream
gpgcheck=0

[root@Cloud ~]# vim /etc/yum.repos.d/openstack.repo
[centos-advanced-virtualization]
name=centos-advanced-virtualization
baseurl=http://192.168.100.20/openstack/centos-advanced-virtualization
gpgcheck=0


[centos-nfv-openvswitch]
name=centos-nfv-openvswitch
baseurl=http://192.168.100.20/openstack/centos-nfv-openvswitch
gpgcheck=0


[centos-rabbitmq-38]
name=centos-rabbitmq-38
baseurl=http://192.168.100.20/openstack/centos-rabbitmq-38
gpgcheck=0


[PowerTools]
name=PowerTools
baseurl=http://192.168.100.20/openstack/PowerTools
gpgcheck=0

[centos-ceph-nautilus]
name=centos-ceph-nautilus
baseurl=http://192.168.100.20/openstack/centos-ceph-nautilus
gpgcheck=0


[centos-openstack-victoria]
name=centos-openstack-victoria
baseurl=http://192.168.100.20/openstack/centos-openstack-victoria
gpgcheck=0


[extras]
name=extras
baseurl=http://192.168.100.20/openstack/extras
gpgcheck=0

# 5. 作成した repo フ��ル�各制御ノードと�ンピュートノードに一括配布
[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.10:/etc/yum.repos.d/

[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.11:/etc/yum.repos.d/
```

---

### フ�ー�2：各�ラ��ノードの��テム環境初期化

#### 1. Controller制御ノードの初期化（192.168.100.10）
```bash
# 1. 管理ネットワー� ens160 �設定
[root@Controller ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.10/24 ipv4.method manual autoconnect yes
[root@Controller ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. 外部ネットワー� NIC ens224 �設定
[root@Controller ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens224
TYPE=Ethernet
BOOTPROTO=none
NAME=ens224
DEVICE=ens224
ONBOOT=yes

[root@Controller ~]# nmcli connection reload
[root@Controller ~]# nmcli connection modify ens224  ipv4.addresses 192.168.10.10/24   ipv4.gateway 192.168.10.1   ipv4.dns 192.168.10.1   ipv4.method manual   autoconnect yes
[root@Controller ~]# nmcli connection down ens224 ; nmcli connection up ens224

# 3. Chrony NTP �ラ��ント�設定
[root@Controller ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool 192.168.100.20 iburst

[root@Controller ~]# systemctl restart chronyd.service
[root@Controller ~]# chronyc sources
210 Number of sources = 1
MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 192.168.100.20                3   6   377    24    -22us[  -46us] +/-   43ms

# 4. ホ�ト名�設定
[root@Controller ~]# hostnamectl set-hostname Controller

# 5. フ�����ールと SELinux �無効化
[root@Controller ~]# systemctl disable firewalld.service --now
[root@Controller ~]# setenforce 0
[root@Controller ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 6. �ラ��の /etc/hosts 名前解決�設定
[root@Controller ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 7. デフ�ルト��テム repo �ャッ�ュ�削除
[root@Controller ~]# cd /etc/yum.repos.d
[root@Controller yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

#### 2. Compute �ンピュートノードの初期化（192.168.100.11）
```bash
# 1. 管理ネットワー��設定
[root@Compute ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.11/24 ipv4.method manual autoconnect yes
[root@Compute ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. Chrony NTP �ラ��ント�設定
[root@Compute ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool 192.168.100.20 iburst

[root@Compute ~]# systemctl enable chronyd.service --now

# 3. ホ�ト名�設定
[root@Compute ~]# hostnamectl set-hostname Compute

# 4. フ�����ールと SELinux �無効化
[root@Compute ~]# systemctl disable firewalld.service --now
[root@Compute ~]# setenforce 0
[root@Compute ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 5. �ラ�� hosts 名前解決�設定
[root@Compute ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 6. デフ�ルト��テム repo �削除
[root@Compute ~]# cd /etc/yum.repos.d
[root@Compute yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

> ⚠️ **重要チ�ッ�ポ�ント**: この��で全 VM ��ャットダ�ンし、**異常発生�に迅速にロールバッ�でき��う統一�ナップ�ョット�取得**す�こと�推奨�

---

### フ�ー�3：Packstack 自動化�ン�ーフ��ルデプロ�

#### 1. Packstack デプロ�ツールの�ン�トール
制御ノード（Controller）で実行:
```bash
[root@Controller ~]# yum -y install openstack-packstack
```

#### 2. デフ�ルトの�ン�ーフ��ル�生成
```bash
[root@Controller ~]# packstack --gen-answer-file=/root/answers.txt
```

> **ネットワー�方式の説明**: OpenStack Victoria は OVN（Open Virtual Network）と従来の OVS（Open vSwitch）の両方��ポートす��

#### 3. �ン�ーフ��ルのパラメー��精密に���マ��
```bash
# 自動検出さ�た外部 IP �内部管理 IP 192.168.100.10 に統一置換
[root@Controller ~]# sed -i 's/192.168.10.10/192.168.100.10/g' /root/answers.txt
```

`/root/answers.txt` �編集し、以下の��設定項目�確認・修正す�:
```ini
# 1. �ンピュートノード�ラ��の IP 一覧�指定（�ンマ区切�）
CONFIG_COMPUTE_HOSTS=192.168.100.11

# 2. Keystone 管理者 root の初期パ�ワード�設定
CONFIG_KEYSTONE_ADMIN_PW=000000

# 3. Demo テナントネットワー��無効化（本番化規範）
CONFIG_PROVISION_DEMO=n

# 4. Heat �ー��トレー�ョン�ンポーネント�有効化
CONFIG_HEAT_INSTALL=y

# 5. Neutron ��ドラ�バーとネットワー���プ設定（ML2 + OVS）
CONFIG_NEUTRON_ML2_TYPE_DRIVERS=geneve,flat,vxlan,vlan
CONFIG_NEUTRON_ML2_MECHANISM_DRIVERS=openvswitch
CONFIG_NEUTRON_ML2_TENANT_NETWORK_TYPES=vxlan
CONFIG_NEUTRON_L2_AGENT=openvswitch

# 6. OVS 外部ネットワー�ブリッ�バ�ンデ�ン�設定（物理外部 NIC ens224 �関連付け）
CONFIG_NEUTRON_OVS_BRIDGE_MAPPINGS=extnet:br-ex
CONFIG_NEUTRON_OVS_BRIDGE_IFACES=br-ex:ens224

# 7. �トレー���ー�容量�事前設定
CONFIG_SWIFT_STORAGE_SIZE=20G
CONFIG_CINDER_VOLUMES_SIZE=50G
```

> ⚠️ **重要チ�ッ�ポ�ント**: �ン�ーフ��ル修正後、再度すべての VM ��ャットダ�ンして�ナップ�ョット�取得す�こと�推奨�

#### 4. ワン�リッ�自動化デプロ�の実行
電源投入後、制御ノードでデプロ��マンド�実行:
```bash
[root@Controller ~]# packstack --answer-file=/root/answers.txt
```
デプロ���リプトは Puppet に基づき、全ノードで�フト����ー�設定、デー�ベー�のテーブル作成、メッ�ー��ュー�ラ��構築、証明書生成、各�ンポーネントの協調統合テ�ト�自動で完了す���了後、�ーミナルに Dashboard ロ��ン URL と `keystonerc_admin` 環境変数フ��ルのパ��出力す��

---

## 四、Linux ��テムロ�管理と OpenStack トラブル�ューテ�ン�

### 1. Linux Rsyslog のロ�レベルと設定�ー�テ�チャ
Linux ��テムでは、��テムの低層と大部分の�ービ�のロ�は `rsyslog` デーモンに�って集中管理さ���

* **設定フ��ル�確認**:
  ```bash
  rpm -qc rsyslog
  # ��のメ�ン設定フ��ル: /etc/rsyslog.conf
  ```

#### ロ�ルールの構文解析：
```text
�ービ�種別(Facility).ロ�レベル(Priority)    ロ�格納パ�
```
一般的な設定例:
```ini
# 1. ��テム共通の通常メッ�ー�:
# すべての�ービ�の >=info レベルのロ��記録す�が、メール・認証��ュリテ�・ cron ロ��除外
*.info;mail.none;authpriv.none;cron.none    /var/log/messages

# 2. デバッ�ロ�:
*.debug                                     /var/log/debug

# 3. �ラーレベルロ�:
*.err                                       /var/log/error.log
```

* **構文ルールの要�**:
  * `mail`: �ービ�種別（Facility）;
  * `info`: ロ�優先度レベル;
  * `.`: **以上（>=）** の優先度のロ�メッ�ー�に一致す�こと�示す;
  * `*.info`: すべての�ービ�の `>= info` レベルのロ�が対象フ��ルに集約さ�て書き込ま��こと�意味す��

#### リ�ル��ム動的ロ�監視�マンド：
```bash
# ��テムロ�の末尾出力�追跡
tail /var/log/messages

# リ�ル��ムでロ��トリーム�継続監視
tail -f /var/log/messages
```

---

### 2. OpenStack ���ム�ービ�ロ�のトラブル�ューテ�ン�基準

> **トラブル�ューテ�ン�原則**: 各�ンポーネントは通常独自の���ムロ�フ��ル体系（`/var/log/<�ンポーネント名>/` 配下）�持つ��ンポーネントが異常の場合、**まずその�ンポーネント�用ロ��排查し、���ムロ�がない場合のみ��テム全体ロ� `/var/log/messages` に戻って排查す�**�

#### 実践例：Neutron ネットワー��ービ�の障害特定
デプロ�または運用中に、仮想ネットワー�作成が失敗した� OVS ポートが起動しなかった�す�場合、正規表現マッチン�で�ラーと警告�直接捕捉でき�:

```bash
# 1. 全 Neutron ロ�か�正規表現で�ラーと警告�横断フ�ル�
tail -f /var/log/neutron/*.log | grep -iE '(err|warn)'

# 2. neutron-server �� API �ービ�ロ��深く排查し、マッチ項目の前後 3 行の�ンテ��ト�出力:
tail -f /var/log/neutron/server.log | grep -iE -A3 -B3 '(err|warn)'
```
*パラメー�説明*:

* `-i`: 大文字小文字�無視;
* `-E`: 拡張正規表現マッチン� `(err|warn)` �有効化;
* `-A 3` (After): マッチ行の後 3 行�出力;
* `-B 3` (Before): マッチ行の前 3 行�出力�
