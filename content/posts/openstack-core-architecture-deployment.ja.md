---
title: "OpenStack クラウド OS：コアアーキテクチャと自動化デプロイ"
date: 2026-10-03T22:50:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "クラウドコンピューティング", "自動化デプロイ", "Packstack", "Victoria"]
summary: "コアコンポーネント（Nova/Glance/Neutron/Cinder など）から、Packstack を用いた Victoria リリースの一元自動デプロイ、さらに Rsyslog ログトラブルシューティングまで。"
---

## 一、OpenStack のコアコンポーネントとその役割

### 1. HORIZON —— 統一グラフィカル管理コンソールサービス
* **コア機能**: Web ベースの Dashboard グラフィカル管理コンソールを提供し、クラウド管理者と一般テナントがクラウドリソースを視覚的に割り当て・監視できるようにする。

### 2. NOVA —— コンピュートリソース管理サービス
* **コア機能**: クラウド環境の仮想化コンピュートリソース（`nova-compute`）を管理・設定する。
* **役割分担**:
  * **Controller 制御ノード**: `nova-api`、`nova-scheduler`、`nova-conductor` などのスケジューリングサービスを実行する。ユーザーがクラウドインスタンス作成を要求すると、`nova-api` が要求を受け取り解析し、`nova-scheduler` がポリシーに基づき最適なコンピュートノードを選択して負荷を分散する。
  * **Compute コンピュートノード**: クラウドインスタンスを実際に実行するワーカーノード（KVM、VMware ESXi、Xen などの異種ハイパーバイザーに対応）。
* **制御ノードの高可用性とパフォーマンスのボトルネック**:
  * 制御ノードはすべての API ゲートウェイ、データベース、メッセージキューを担っており、高可用性とパフォーマンスの負荷が生じる。

### 3. GLANCE —— イメージサービス
* **コア機能**: OS イメージの発見・登録・検索・ストレージ管理を担当する。
* **一般的なディスクイメージ形式**:
  * KVM で一般的な形式: `qcow2`（シンプロビジョニングとコピーオンライト COW をサポート）;
  * VMware で一般的な形式: `vmdk`。
* **デプロイ推奨**: 通常、高可用性を実現するために制御ノード上に統合・併置してデプロイする。

### 4. SWIFT —— オブジェクトストレージサービス
* **コア機能**: 高可用性・分散・結果整合性のあるオブジェクトストレージサービス（Object Storage）を提供し、静的で非構造化のデータ、クラウドインスタンスのシステムイメージ、データのフルバックアップなどに特化している。

### 5. NEUTRON —— ソフトウェア定義ネットワーク（SDN）
* **コア機能**: クラウド環境でネットワーク・アズ・ア・サービスを提供し、仮想ルーター、スイッチ、セキュリティグループ、フローティング IP、ノード間トラフィックの接続を管理する。
* **ネットワーク技術**: VLAN、VXLAN、Geneve、分散仮想ルーティング（DVR）を全面サポート;
* **ハードウェア SDN モード**: 本番環境では通常 2 台の専用ネットワークノードを配置してアクティブ・アクティブまたはアクティブ・スタンバイクラスタを構築する。

### 6. CINDER —— ブロックストレージサービス
* **コア機能**: クラウドインスタンス向けの永続的なブロックストレージ（クラウドディスク）を提供し、動的なアタッチ・デタッチ・スナップショット・容量拡張が可能。
* **バックエンド連携能力**:
  * 従来型ストレージアレイとの連携: Huawei OceanStor、IBM、EMC などのハイエンドハードウェアストレージ;
  * オープンソース分散ストレージとの連携: Ceph RBD、GlusterFS など。
* **バックエンドの仕組み**: ユーザーがクラウドディスクを申請すると、Cinder は指示をバックエンドストレージシステムに下位伝達し、本質的に物理／分散ストレージ内に LUN を切り出してマッピングする。
* **比較説明**: オブジェクトストレージ（Baidu Netdisk、Swift、S3 など）はブロックデバイスとして直接フォーマットしてクラウドインスタンスのファイルシステムとしてマウントできないが、Cinder ブロックデバイスは直接フォーマットしてマウントして利用できる。

### 7. HEAT —— オーケストレーションサービス
* **コア機能**: 宣言型テンプレート（HOT テンプレートまたは AWS CloudFormation 形式）に基づき、グラフィカルなオーケストレーションやスクリプトで複数の VM、データベースクラスタ、ネットワークトポロジ、監視ポリシーをワンクリックで自動一括デプロイする。

### 8. CEILOMETER —— メータリング・監視サービス
* **コア機能**: 物理リソースと仮想リソースのパフォーマンス指標、稼働時間、使用量を収集する。
  * **パブリッククラウドシナリオ**: API 呼び出し回数、ネットワーク送信量、コンピュート時間を記録し、課金システムと連携する;
  * **プライベートクラウドシナリ오**: テナントのクォータ水位を監視し、リソースの過剰利用や遊休を特定してキャパシティプランニングを支援する。

### 9. KEYSTONE —— 統一認証・認可サービス
* **コア機能**: OpenStack 全体のセキュリティの礎石であり、プラットフォーム全体のテナント（Project）、ユーザー（User）、ロール（Role）、サービスカタログ、トークン認証を担当する。
* **エンタープライズ向けアイデンティティフェデレーション**:
  * 企業の既存の Windows Active Directory (AD) や Linux OpenLDAP とシームレスに統合し、エンタープライズグレードの統一アカウント単一サインオン（SSO）を実現する;
* **フロー承認と権限分離（Huawei Cloud の例）**:
  * クラウドインスタンスの多段階申請・承認ワークフローをサポート（最大 5 段階の承認）;
  * 「三権分立」のセキュリティ原則を徹底（セキュリティ責任者、システム管理者、監査員が権限を分離して管理）;
  * 顧客の自社開発 OA/BPM 承認フローシステムとの連携をサポート。

---

### コアコンポーネント早見表：
| コンポーネント名 | コード名 | コアサービス機能 |
| :--- | :--- | :--- |
| **Horizon** | Dashboard | 統一 Web グラフィカル管理コンソール |
| **Nova** | Compute | コンピュートリソースのライフサイクルとインスタンススケジューリング管理 |
| **Glance** | Image | 仮想マシンイメージのストレージとバージョン登録 |
| **Swift** | Object | 大規模非構造化オブジェクトストレージサービス |
| **Neutron** | Network | ソフトウェア定義ネットワーク（SDN）、ルーティングとセキュリティグループ管理 |
| **Cinder** | Block | クラウドインスタンスの永続ブロックストレージ（クラウドディスク）管理 |
| **Heat** | Orchestration | インフラストラクチャ・アズ・コード（IaC）の複数リソーススタックオーケストレーション |
| **Ceilometer** | Metering | リソース使用量統計、監視メータリング、クォータ分析 |
| **Keystone** | Identity | 統一認証、認可トークン、サービスカタログ管理 |

---

## 二、OpenStack デプロイ計画（Victoria 版）

### 1. デプロイ方式の比較
1. **オープンソースの手動デプロイ**: コンポーネントを個別にコンパイル・設定する—煩雑で複雑であり、通常は基盤メカニズムの深い学習向け;
2. **ツールによる自動化デプロイ**:
   * **Ansible デプロイ**（OpenStack-Ansible、Kolla-Ansible など）;
   * **Packstack デプロイ**: Red Hat が公開する Puppet ベースの自動化迅速デリバリーツール（本実践で採用）;

---

### 2. クラスタノード仕様とネットワーク計画

#### （1）Controller 制御ノード（1 台）
* **搭載コンポーネント**:
  * API サービス: `nova-api`、`cinder-api`、`glance-api`、`neutron-server` など;
  * 基盤サービス: MariaDB / MySQL、RabbitMQ メッセージキュー、Memcached、Keystone;
  * ネットワーク・管理サービス: ネットワークノードの外部ルーティング転送、ローカル YUM キャッシュ、Chrony 時刻同期サーバー。
* **システム構成要件**:
  * **CPU**: 4 vCPU 以上
  * **メモリ**: 4GB 以上
  * **ディスク**: 100GB の空きディスク容量
  * **NIC**: 3 枚のネットワークカード（NIC 1 はインターネット接続用ブリッジモード、NIC 2 と NIC 3 はホストオンリー mode で内部トラフィック）
* **IP アドレス計画**:
  * 内部管理 IP: 192.168.100.10
  * 外部アクセス IP: 192.168.10.10

#### （2）Compute コンピュートノード（1 台）
* **搭載コンポーネント**: `nova-compute`、ネットワーク L2 Agent（Open vSwitch Agent）
* **システム構成要件**:
  * **CPU**: 4 vCPU 以上
  * **メモリ**: 8GB 以上（最低 4GB）
  * **ディスク**: 100GB のディスク容量
  * **NIC**: 3 枚のネットワークカード（すべてホストオンリー mode）
* **IP アドレス計画**:
  * Compute: 192.168.100.11

#### （3）YUM リポジトリサーバー + Chrony 時刻同期サーバー（1 台）
* **システム構成要件**:
  * **CPU**: 2 vCPU
  * **メモリ**: 2GB
  * **NIC**: 2 枚（1 枚はインターネットにブリッジして公開時刻同期と上流リポジトリ用、もう 1 枚はホストオンリーで内部ノードへ提供）
* **IP アドレス計画**:
  * 外部 IP: 192.168.10.11
  * 内部 IP: 192.168.100.20

> **環境ダウングレード説明**: パーソナルコンピュータのハードウェア資源が限られている場合、**最小構成を 2 台の VM に圧縮**できる（制御ノードを YUM ソースと時刻同期サーバーとして兼用し、もう 1 台をコンピュートノードとする）。注意: 各ノードのシステム時刻は高度に一致していなければならず、**時刻ドリフトは 5 分を超えてはならない**。さもないと Keystone ハンドシェイクとメッセージキュー通信が全面的に失敗する。

---

## 三、OpenStack 自動化デプロイ実践手順

### フェーズ1：YUM リポジトリサーバーと Chrony 時刻同期サーバーの構築

#### 1. ネットワークインターフェースの設定
```bash
# 1. 内部通信用 NIC ens160 を設定
[root@Cloud ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens160
TYPE=Ethernet
BOOTPROTO=none
NAME=ens160
DEVICE=ens160
ONBOOT=yes
IPADDR=192.168.100.20
PREFIX=24

# 2. インターネット接続用 NIC ens192 を設定（公開 NTP 同期用）
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

# NIC を再起動して設定を有効化
[root@Cloud ~]# nmcli connection down ens160 ; nmcli connection up ens160
Connection 'ens160' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/1)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/4)
[root@Cloud ~]# nmcli connection down ens192 ; nmcli connection up ens192
Connection 'ens192' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/5)
```

#### 2. ローカル CD-ROM YUM リポジトリの設定
```bash
[root@Cloud ~]# cd /etc/yum.repos.d/
[root@Cloud yum.repos.d]# mkdir bak
[root@Cloud yum.repos.d]# mv CentOS-Linux-* bak/

# OS インストール ISO をマウント
mount /dev/cdrom /media/

# CD-ROM ローカルリポジトリ設定ファイルを作成
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

#### 3. Chrony 時刻同期サーバーの設定
OpenStack はノード間の時刻同期に対する要求が極めて厳しいため、まず時刻ソースを設定する:

```bash
# /etc/chrony.conf を編集
[root@Cloud ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool ntp.tencent.com iburst
# Allow NTP client access from local network.
allow 192.168.100.0/24
# Serve time even if not synchronized to a time source.
local stratum 10

# 時刻同期サービスを再起動して検証
[root@Cloud ~]# systemctl restart chronyd.service
[root@Cloud ~]# chronyc sources
210 Number of sources = 1
MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 106.55.184.199                2   6    17     2   -224us[ -144us] +/-   54ms

# ファイアウォールと SELinux を無効化
[root@Cloud ~]# systemctl disable firewalld.service --now
[root@Cloud ~]# setenforce 0
[root@Cloud ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
```

#### 4. httpd によるローカル Web YUM リポジトリの構築
CentOS 8 および OpenStack Victoria ソフトウェアリポジトリを HTTP ミラーソースとして公開し、すべてのクラスタノードが取得できるようにする。

```bash
# 1. Apache Web サービスをインストールして起動
[root@Cloud ~]# yum -y install httpd
[root@Cloud ~]# systemctl enable httpd --now

# 2. ディレクトリを作成しイメージファイルをマウント
[root@Cloud ~]# mkdir /isos
[root@Cloud ~]# mkdir -p /var/www/html/centos8
[root@Cloud ~]# mkdir -p /var/www/html/openstack

# ベースシステム CD と OpenStack Victoria インストールイメージをマウント
[root@Cloud ~]# mount /dev/cdrom /var/www/html/centos8/
[root@Cloud ~]# mount /isos/26-CentOS8-4-OSP-Victoria.iso /var/www/html/openstack/

# 3. マウントを /etc/fstab に永続化
[root@Cloud ~]# vim /etc/fstab
/dev/cdrom              /var/www/html/centos8   iso9660  defaults  0 0
/isos/26-CentOS8-4-OSP-Victoria.iso  /var/www/html/openstack iso9660 defaults 0 0

# 4. HTTP YUM リポジトリファイルを設定
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

# 5. 作成した repo ファイルを各制御ノードとコンピュートノードに一括配布
[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.10:/etc/yum.repos.d/

[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.11:/etc/yum.repos.d/
```

---

### フェーズ2：各クラスタノードのシステム環境初期化

#### 1. Controller 制御ノードの初期化（192.168.100.10）
```bash
# 1. 管理ネットワーク ens160 を設定
[root@Controller ~]# nmcli connection modify ens33 ipv4.addresses 192.168.100.10/24 ipv4.method manual autoconnect yes
[root@Controller ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. 外部ネットワーク NIC ens224 を設定
[root@Controller ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens224
TYPE=Ethernet
BOOTPROTO=none
NAME=ens224
DEVICE=ens224
ONBOOT=yes

[root@Controller ~]# nmcli connection reload
[root@Controller ~]# nmcli connection modify ens224  ipv4.addresses 192.168.10.10/24   ipv4.gateway 192.168.10.1   ipv4.dns 192.168.10.1   ipv4.method manual   autoconnect yes
[root@Controller ~]# nmcli connection down ens224 ; nmcli connection up ens224

# 3. Chrony NTP クライアントを設定
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

# 4. ホスト名を設定
[root@Controller ~]# hostnamectl set-hostname Controller

# 5. ファイアウォールと SELinux を無効化
[root@Controller ~]# systemctl disable firewalld.service --now
[root@Controller ~]# setenforce 0
[root@Controller ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 6. クラスタの /etc/hosts 名前解決を設定
[root@Controller ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 7. デフォルトシステム repo キャッシュを削除
[root@Controller ~]# cd /etc/yum.repos.d
[root@Controller yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

#### 2. Compute01 コンピュートノードの初期化（192.168.9.11）
```bash
# 1. 管理ネットワークを設定
[root@Compute ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.11/24 ipv4.method manual autoconnect yes
[root@Compute ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. Chrony NTP クライアントを設定
[root@Compute ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool 192.168.100.20 iburst

[root@Compute ~]# systemctl enable chronyd.service --now

# 3. ホスト名を設定
[root@Compute ~]# hostnamectl set-hostname Compute

# 4. ファイアウォールと SELinux を無効化
[root@Compute ~]# systemctl disable firewalld.service --now
[root@Compute ~]# setenforce 0
[root@Compute ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 5. クラスタ hosts 名前解決を設定
[root@Compute ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 6. デフォルトシステム repo を削除
[root@Compute ~]# cd /etc/yum.repos.d
[root@Compute yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

> ⚠️ **重要チェックポイント**: この時点で全 VM をシャットダウンし、**異常発生時に迅速にロールバックできるよう統一スナップショットを取得**することを推奨。

---

### フェーズ3：Packstack 自動化アンサーファイルデプロイ

#### 1. Packstack デプロイツールのインストール
制御ノード（Controller）で実行:
```bash
[root@Controller ~]# yum -y install openstack-packstack
```

#### 2. デフォルトのアンサーファイルを生成
```bash
[root@Controller ~]# packstack --gen-answer-file=/root/answers.txt
```

> **ネットワーク方式の説明**: OpenStack Victoria は OVN（Open Virtual Network）と従来の OVS（Open vSwitch）の両方をサポートする。

#### 3. アンサーファイルのパラメータを精密にカスタマイズ
```bash
# 自動検出された外部 IP を内部管理 IP 192.168.100.10 に統一置換
[root@Controller ~]# sed -i 's/192.168.10.10/192.168.100.10/g' /root/answers.txt
```

`/root/answers.txt` を編集し、以下のコア設定項目を確認・修正する:
```ini
# 1. コンピュートノードクラスタの IP 一覧を指定（カンマ区切り）
CONFIG_COMPUTE_HOSTS=192.168.100.11

# 2. Keystone 管理者 root の初期パスワードを設定
CONFIG_KEYSTONE_ADMIN_PW=000000

# 3. Demo テナントネットワークを無効化（本番化規範）
CONFIG_PROVISION_DEMO=n

# 4. Heat オーケストレーションコンポーネントを有効化
CONFIG_HEAT_INSTALL=y

# 5. Neutron コアドライバーとネットワークタイプ設定（ML2 + OVS）
CONFIG_NEUTRON_ML2_TYPE_DRIVERS=geneve,flat,vxlan,vlan
CONFIG_NEUTRON_ML2_MECHANISM_DRIVERS=openvswitch
CONFIG_NEUTRON_ML2_TENANT_NETWORK_TYPES=vxlan
CONFIG_NEUTRON_L2_AGENT=openvswitch

# 6. OVS 外部ネットワークブリッジバインディング設定（物理外部 NIC ens224 を関連付け）
CONFIG_NEUTRON_OVS_BRIDGE_MAPPINGS=extnet:br-ex
CONFIG_NEUTRON_OVS_BRIDGE_IFACES=br-ex:ens224

# 7. ストレージクォータ容量を事前設定
CONFIG_SWIFT_STORAGE_SIZE=20G
CONFIG_CINDER_VOLUMES_SIZE=50G
```

> ⚠️ **重要チェックポイント**: アンサーファイル修正後、再度すべての VM をシャットダウンしてスナップショットを取得することを推奨。

#### 4. ワンクリック自動化デプロイの実行
電源投入後、制御ノードでデプロイコマンドを実行:
```bash
[root@Controller ~]# packstack --answer-file=/root/answers.txt
```
デプロイスクリプトは Puppet に基づき、全ノードでソフトウェアソース設定、データベースのテーブル作成、メッセージキュークラスタ構築、証明書生成、各コンポーネントの協調統合テストを自動で完了する。終了後、ターミナルに Dashboard ログイン URL と `keystonerc_admin` 環境変数ファイルのパスを出力する。

---

## 四、Linux システムログ管理と OpenStack トラブルシューティング

### 1. Linux Rsyslog のログレベルと設定アーキテクチャ
Linux システムでは、システムの低層と大部分のサービスのログは `rsyslog` デーモンによって集中管理される。

* **設定ファイルを確認**:
  ```bash
  rpm -qc rsyslog
  # コアのメイン設定ファイル: /etc/rsyslog.conf
  ```

#### ログルールの構文解析：
```text
サービス種別(Facility).ログレベル(Priority)    ログ格納パス
```
一般的な設定例:
```ini
# 1. システム共通の通常メッセージ:
# すべてのサービスの >=info レベルのログを記録するが、メール・認証セキュリティ・ cron ログを除外
*.info;mail.none;authpriv.none;cron.none    /var/log/messages

# 2. デバッグログ:
*.debug                                     /var/log/debug

# 3. エラーレベルログ:
*.err                                       /var/log/error.log
```

* **構文ルールの要点**:
  * `mail`: サービス種別（Facility）;
  * `info`: ログ優先度レベル;
  * `.`: **以上（>=）** の優先度のログメッセージに一致することを示す;
  * `*.info`: すべてのサービスの `>= info` レベルのログが対象ファイルに集約されて書き込まれることを意味する。

#### リアルタイム動的ログ監視コマンド：
```bash
# システムログの末尾出力を追跡
tail /var/log/messages

# リアルタイムでログストリームを継続監視
tail -f /var/log/messages
```

---

### 2. OpenStack カスタムサービスログのトラブルシューティング基準

> **トラブルシューティング原則**: 各コンポーネントは通常独自のカスタムログファイル体系（`/var/log/<コンポーネント名>/` 配下）を持つ。コンポーネントが異常の場合、**まずそのコンポーネント専用ログを排查し、カスタムログがない場合のみシステム全体ログ `/var/log/messages` に戻って排查する**。

#### 実践例：Neutron ネットワークサービスの障害特定
デプロイまたは運用中に、仮想ネットワーク作成が失敗したり OVS ポートが起動しなかったりする場合、正規表現マッチングでエラーと警告を直接捕捉できる:

```bash
# 1. 全 Neutron ログから正規表現でエラーと警告を横断フィルタ
tail -f /var/log/neutron/*.log | grep -iE '(err|warn)'

# 2. neutron-server コア API サービスログを深く排查し、マッチ項目の前後 3 行のコンテキストを出力:
tail -f /var/log/neutron/server.log | grep -iE -A3 -B3 '(err|warn)'
```
*パラメータ説明*:

* `-i`: 大文字小文字を無視;
* `-E`: 拡張正規表現マッチング `(err|warn)` を有効化;
* `-A 3` (After): マッチ行の後 3 行を出力;
* `-B 3` (Before): マッチ行の前 3 行を出力。
