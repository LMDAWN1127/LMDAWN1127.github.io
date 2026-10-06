---
title: "OpenStack 클라우드 OS: 핵심 아��텍처 및 자동화 배포"
date: 2026-10-06T20:35:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "클라우드 컴퓨팅", "자동화 배포", "Packstack", "Victoria"]
summary: "Nova/Glance/Neutron/Cinder 등 핵심 컴포넌트부터 Packstack 기반 Victoria 릴리스 원클릭 자동 배포, 그리고 Rsyslog 로그 트러블슈팅까지."
---

## 1. OpenStack 핵심 컴포넌트 및 역할

### 1. HORIZON — 통합 웹 대시보드 서비스
* **핵심 기능**: 클라우드 관리자와 일반 테넌트가 클라우드 리소스를 시각적으로 할당·모니터링할 수 있는 Web 기반 Dashboard 그래픽 관리 콘솔을 제공합니다.

### 2. NOVA — 컴퓨트 리소스 관리 서비스
* **핵심 기능**: 클라우드 환경의 가상화 컴퓨트 리소스(`nova-compute`)를 관리·설정합니다.
* **역할 분담**:
  * **Controller 제어 노드**: `nova-api`, `nova-scheduler`, `nova-conductor` 등의 스케줄링 서비스를 실행합니다. �용자가 클라우드 인스턴스 생성을 요청하면 `nova-api`가 요청을 수신·파싱하고, `nova-scheduler`가 정책에 따라 최적의 컴퓨트 노드를 선택해 부하를 스케줄링합니다.
  * **Compute 컴퓨트 노드**: 클라우드 인스턴스를 실제로 호스팅하는 워커 노드(KVM, VMware ESXi, Xen 등 이기종 하이퍼바이저 지원).
* **제어 노드의 고가용성과 성능 병목**:
  * 제어 노드는 모든 API 게이트웨이, 데이터베이스, 메시지 큐를 담당하여 고가용성·성능 부하가 발생한다.

### 3. GLANCE — 이미지 서비스
* **핵심 기능**: OS 이미지의 발견, 등록, 검색 및 스토리지 관리를 담당합니다.
* **일반적인 디스크 이미지 형식**:
  * KVM 일반 형식: `qcow2`(씬 프로비저닝 및 Copy-on-Write, COW 지원);
  * VMware 일반 형식: `vmdk`.
* **배포 권장**: 일반적으로 고가용성을 위해 제어 노드에 통합·배치하여 배포합니다.

### 4. SWIFT — 오브젝트 스토리지 서비스
* **핵심 기능**: 고가용·분�·최종 일관성 객체 스토리지 서비스(Object Storage)를 제공하며, 정적 비정형 데이터, 클라우드 인스턴스 시스템 이미지, 전체 데이터 백업 등에 특화되어 있다.

### 5. NEUTRON — 소프트웨어 정의 네트워크(SDN)
* **핵심 기능**: 클라우드 환경에서 네트워크 서비스(NaaS)를 제공하며 가상 라우터, 스위치, 보안 그룹, 플로팅 IP, 노드 간 트래픽 연결을 관리합니다.
* **네트워크 기술**: VLAN, VXLAN, Geneve 및 분� 가상 라우팅(DVR)을 완전 지원;
* **하드웨어 SDN 모드**: 프로덕션 환경에서는 보통 2대의 전용 네트워크 노드를 배치해 액티브-액티브 또는 액티브-스탠바이 클러스터를 구성한다.

### 6. CINDER — 블록 스토리지 서비스
* **핵심 기능**: 클라우드 인스턴스용 영구 블록 스토리지(클라우드 디스크)를 제공하며 동적 연결·분리·스냅샷·확장이 가능하다.
* **백엔드 연동 능력**:
  * 기존 스토리지 어레이 연동: 화웨이 OceanStor, IBM, EMC 등 하이엔드 하드웨어 스토리지;
  * 오픈소스 분� 스토리지 연동: Ceph RBD, GlusterFS 등.
* **백엔드 메커니즘**: �용자가 클라우드 디스크를 신청하면 Cinder는 지시를 백엔드 스토리지 시스템으로 하위 전달하며, 본질적으로 물리/분� 스토리지 �에 LUN을 할당·매핑한다.
* **비교 설명**: 객체 스토리지(예: 바이두 왕판, Swift, S3)는 블록 디바이스로 직접 포맷·마운트하여 클라우드 인스턴스 파일 시스템으로 쓸 수 없지만, Cinder 블록 디바이스는 직접 포맷해 마운트해 �용할 수 있다.

### 7. HEAT — 오케스트레이션 서비스
* **핵심 기능**: 선언형 템플릿(HOT 템플릿 또는 AWS CloudFormation 형식)을 기반으로 그래픽 오케스트레이션이� 스크립트를 통해 다수의 VM, 데이터베이스 클러스터, 네트워크 토폴로지, 모니터링 정책을 원클릭으로 자동 일괄 배포한다.

### 8. CEILOMETER — 계측 모니터링 서비스
* **핵심 기능**: 물리·가상 리소스의 성능 지표, 가동 시간, �용량을 수집한다.
  * **퍼블릭 클라우드 시�리오**: API 호출량, 네트워크 송출량, 컴퓨트 시간을 기록하고 과금 시스템과 연동;
  * **프라이빗 클라우드 시�리오**: 테넌트 할당량 수준을 모니터링하고 리소스 과다 �용·유휴를 식별해 용량 계획을 지원한다.

### 9. KEYSTONE — 통합 인증 및 권한 부여 서비스
* **핵심 기능**: OpenStack 전체 보안의 초석으로, 플랫폼 전반의 테넌트(Project), �용자(User), 역할(Role), 서비스 카탈로그, 토큰 인증을 담당한다.
* **엔터프라이즈 아이덴티티 연합**:
  * 기업의 기존 Windows Active Directory(AD) 또는 Linux OpenLDAP과 원활히 통합해 엔터프라이즈급 통합 계정 single sign-on(SSO)을 구현한다;
* **워크플로우 승인 및 권한 격리(화웨이 클라우드 예시)**:
  * 클라우드 인스턴스 다단계 신청·승인 워크플로우 지원(최대 5단계 승인);
  * "�권 분립" 보안 원칙을 관철(보안 담당자, 시스템 관리자, 감�자가 권한을 분리해 관리);
  * 고객� 자체 개발 OA/BPM 승인 흐름 시스템 연동을 지원한다.

---

### 핵심 컴포넌트 기능 요약표:
| 컴포넌트 이름 | 코드 명칭 | 핵심 서비스 기능 |
| :--- | :--- | :--- |
| **Horizon** | Dashboard | 통합 Web 그래픽 관리 콘솔 |
| **Nova** | Compute | 컴퓨트 리소스 라이프�이클 및 인스턴스 스케줄링 관리 |
| **Glance** | Image | VM 이미지 스토리지 및 버전 등록 |
| **Swift** | Object | 대규모 비정형 객체 스토리지 서비스 |
| **Neutron** | Network | 소프트웨어 정의 네트워크(SDN), 라우팅 및 보안 그룹 관리 |
| **Cinder** | Block | 클라우드 인스턴스 영구 블록 스토리지(클라우드 디스크) 관리 |
| **Heat** | Orchestration | 인프라-as-Code(IaC) 다중 리소스 스택 오케스트레이션 |
| **Ceilometer** | Metering | 리소스 �용량 통계, 모니터링 계량 및 할당량 분석 |
| **Keystone** | Identity | 통합 신원 인증, 인가 토큰 및 서비스 카탈로그 관리 |

---

## 2. OpenStack 배포 계획(Victoria 에디션)

### 1. 배포 방식 비교
1. **오픈소스 수동 배포**: 컴포넌트를 하�씩 컴파일·설정—번거롭고 복잡하며 보통 기반 메커니즘 심층 학습용;
2. **도구 기반 자동화 배포**:
   * **Ansible 배포**(예: OpenStack-Ansible, Kolla-Ansible);
   * **Packstack 배포**: Red Hat가 오픈소스로 제공하는 Puppet 기반 자동화 신속 전달 도구(본 실전에서 채택);

---

### 2. 클러스터 노드 �양 및 네트워크 계획

#### (1) Controller 제어 노드(1대)
* **탑재 컴포넌트**:
  * API 서비스: `nova-api`, `cinder-api`, `glance-api`, `neutron-server` 등;
  * 기반 서비스: MariaDB / MySQL, RabbitMQ 메시지 큐, Memcached, Keystone;
  * 네트워크 및 관리 서비스: 네트워크 노드 외부 라우팅 포워딩, 로컬 YUM 캐시, Chrony 시간 동기화 서버.
* **시스템 �양 요구**:
  * **CPU**: 4 vCPU 이상
  * **메모리**: 4GB 이상
  * **디스크**: 100GB �용 가능 디스크 공간
  * **NIC**: 네트워크 카드 3개(NIC 1은 인터넷 접속용 브릿지 모드, NIC 2·3은 호스트 전용 모드로 �부 트래픽)
* **IP 주소 계획**:
  * �부 관리 IP: 192.168.100.10
  * 외부 접속 IP: 192.168.10.10

#### (2) Compute 컴퓨트 노드(1대)
* **탑재 컴포넌트**: `nova-compute`, 네트워크 L2 Agent(Open vSwitch Agent)
* **시스템 �양 요구**:
  * **CPU**: 4 vCPU 이상
  * **메모리**: 8GB 이상(최소 4GB)
  * **디스크**: 100GB 디스크 공간
  * **NIC**: 네트워크 카드 3개(전부 호스트 전용 모드)
* **IP 주소 계획**:
  * Compute: 192.168.100.11

#### (3) YUM 저장소 서버 + Chrony 시간 동기화 서버(1대)
* **시스템 �양 요구**:
  * **CPU**: 2 vCPU
  * **메모리**: 2GB
  * **NIC**: 네트워크 카드 2개(하�는 인터넷 브릿지로 공개 시각 동기화 및 상위 저장소용, 다른 하�는 호스트 전용으로 �부 노드 제공)
* **IP 주소 계획**:
  * 외부 IP: 192.168.10.11
  * �부 IP: 192.168.100.20

> **환경 하향 조정 안�**: 개인용 컴퓨터 하드웨어 자원이 부족하면 **최소 2대의 VM으로 압축**할 수 있다(제어 노드를 YUM 소스 및 시간 동기화 서버로 겸용하고, 컴퓨트 노드 1대를 추가). 주의: 모든 노드의 시스템 시각은 매우 일치해야 하며 **시계 드리프트는 5분을 초과해서는 안 된다**. 그렇지 않으면 Keystone 핸드셰이크와 메시지 큐 통신이 완전히 실패한다.

---

## 3. OpenStack 자동화 배포 실전 절차

### 단계 1: YUM 저장소 서버 및 Chrony 시간 동기화 서버 구축

#### 1. 네트워크 인터페이스 설정
```bash
# 1. �부 통신 NIC ens160 설정
[root@Cloud ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens160
TYPE=Ethernet
BOOTPROTO=none
NAME=ens160
DEVICE=ens160
ONBOOT=yes
IPADDR=192.168.100.20
PREFIX=24

# 2. 인터넷 연결용 NIC ens192 설정(공개 NTP 동기화용)
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

# 설정을 적용하기 위해 NIC 재시작
[root@Cloud ~]# nmcli connection down ens160 ; nmcli connection up ens160
Connection 'ens160' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/1)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/4)
[root@Cloud ~]# nmcli connection down ens192 ; nmcli connection up ens192
Connection 'ens192' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/5)
```

#### 2. 로컬 CD-ROM YUM 저장소 설정
```bash
[root@Cloud ~]# cd /etc/yum.repos.d/
[root@Cloud yum.repos.d]# mkdir bak
[root@Cloud yum.repos.d]# mv CentOS-Linux-* bak/

# OS 설치 ISO 마운트
mount /dev/cdrom /media/

# CD-ROM 로컬 저장소 설정 파일 작성
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

#### 3. Chrony 시간 동기화 서버 설정
OpenStack은 노드 간 시각 동기화 요구가 매우 엄격하므로 먼저 시간 소스를 설정한다:

```bash
# /etc/chrony.conf 편집
[root@Cloud ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool ntp.tencent.com iburst
# Allow NTP client access from local network.
allow 192.168.100.0/24
# Serve time even if not synchronized to a time source.
local stratum 10

# 시간 동기화 서비스 재시작 및 검증
[root@Cloud ~]# systemctl restart chronyd.service
[root@Cloud ~]# chronyc sources
210 Number of sources = 1
MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 106.55.184.199                2   6    17     2   -224us[ -144us] +/-   54ms

# 방화벽 및 SELinux 비활성화
[root@Cloud ~]# systemctl disable firewalld.service --now
[root@Cloud ~]# setenforce 0
[root@Cloud ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
```

#### 4. httpd 기반 로컬 웹 YUM 저장소 구축
CentOS 8 및 OpenStack Victoria 소프트웨어 저장소를 HTTP 미러 소스로 게시하여 모든 클러스터 노드가 가져오도록 한다.

```bash
# 1. Apache 웹 서비스 설치 및 시작
[root@Cloud ~]# yum -y install httpd
[root@Cloud ~]# systemctl enable httpd --now

# 2. 디렉터리 생성 및 이미지 파일 마운트
[root@Cloud ~]# mkdir /isos
[root@Cloud ~]# mkdir -p /var/www/html/centos8
[root@Cloud ~]# mkdir -p /var/www/html/openstack

# 베이스 시스템 CD 및 OpenStack Victoria 설치 이미지 마운트
[root@Cloud ~]# mount /dev/cdrom /var/www/html/centos8/
[root@Cloud ~]# mount /isos/26-CentOS8-4-OSP-Victoria.iso /var/www/html/openstack/

# 3. 마운트를 /etc/fstab에 영구 기록
[root@Cloud ~]# vim /etc/fstab
/dev/cdrom              /var/www/html/centos8   iso9660  defaults  0 0
/isos/26-CentOS8-4-OSP-Victoria.iso  /var/www/html/openstack iso9660 defaults 0 0

# 4. HTTP YUM 저장소 파일 설정
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

# 5. 작성한 repo 파일을 각 제어 노드와 컴퓨트 노드에 일괄 배포
[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.10:/etc/yum.repos.d/

[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.11:/etc/yum.repos.d/
```

---

### 단계 2: 클러스터 각 노드 시스템 환경 초기화

#### 1. Controller제어 노드 초기화(192.168.100.10)
```bash
# 1. 관리 네트워크 ens160 설정
[root@Controller ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.10/24 ipv4.method manual autoconnect yes
[root@Controller ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. 외부 네트워크 NIC ens224 설정
[root@Controller ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens224
TYPE=Ethernet
BOOTPROTO=none
NAME=ens224
DEVICE=ens224
ONBOOT=yes

[root@Controller ~]# nmcli connection reload
[root@Controller ~]# nmcli connection modify ens224  ipv4.addresses 192.168.10.10/24   ipv4.gateway 192.168.10.1   ipv4.dns 192.168.10.1   ipv4.method manual   autoconnect yes
[root@Controller ~]# nmcli connection down ens224 ; nmcli connection up ens224

# 3. Chrony NTP 클라이언트 설정
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

# 4. 호스트명 설정
[root@Controller ~]# hostnamectl set-hostname Controller

# 5. 방화벽 및 SELinux 비활성화
[root@Controller ~]# systemctl disable firewalld.service --now
[root@Controller ~]# setenforce 0
[root@Controller ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 6. 클러스터 /etc/hosts 해석 설정
[root@Controller ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 7. 기본 시스템 repo 캐시 정리
[root@Controller ~]# cd /etc/yum.repos.d
[root@Controller yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

#### 2. Compute 컴퓨트 노드 초기화(192.168.100.11)
```bash
# 1. 관리 네트워크 설정
[root@Compute ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.11/24 ipv4.method manual autoconnect yes
[root@Compute ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. Chrony NTP 클라이언트 설정
[root@Compute ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool 192.168.100.20 iburst

[root@Compute ~]# systemctl enable chronyd.service --now

# 3. 호스트명 설정
[root@Compute ~]# hostnamectl set-hostname Compute

# 4. 방화벽 및 SELinux 비활성화
[root@Compute ~]# systemctl disable firewalld.service --now
[root@Compute ~]# setenforce 0
[root@Compute ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 5. 클러스터 hosts 해석 설정
[root@Compute ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 6. 기본 시스템 repo 정리
[root@Compute ~]# cd /etc/yum.repos.d
[root@Compute yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

> ⚠️ **핵심 점검점**: 이 시점에서 모든 VM을 종료하고 **문제 발생 시 신속히 롤백할 수 있도록 통합 스냅샷을 촬영**할 것을 권장한다.

---

### 단계 3: Packstack 자동화 응답 파일 배포

#### 1. Packstack 배포 도구 설치
제어 노드(Controller)에서 실행:
```bash
[root@Controller ~]# yum -y install openstack-packstack
```

#### 2. 기본 응답 파일 생성
```bash
[root@Controller ~]# packstack --gen-answer-file=/root/answers.txt
```

> **네트워크 방식 설명**: OpenStack Victoria는 OVN(Open Virtual Network)과 기존 OVS(Open vSwitch) 모두를 지원한다.

#### 3. 응답 파일 파라미터 정밀 커스터마이징
```bash
# 자동 감지된 외부 IP를 �부 관리 IP 192.168.100.10으로 일괄 치환
[root@Controller ~]# sed -i 's/192.168.10.10/192.168.100.10/g' /root/answers.txt
```

`/root/answers.txt`를 편집하고 다음 핵심 설정 항목을 확인·수정한다:
```ini
# 1. 컴퓨트 노드 클러스터 IP 목록 지정(쉼표 구분)
CONFIG_COMPUTE_HOSTS=192.168.100.11

# 2. Keystone 관리자 root 초기 비밀번호 설정
CONFIG_KEYSTONE_ADMIN_PW=000000

# 3. Demo 테넌트 네트워크 비활성화(프로덕션 규범)
CONFIG_PROVISION_DEMO=n

# 4. Heat 오케스트레이션 컴포넌트 지원 활성화
CONFIG_HEAT_INSTALL=y

# 5. Neutron 코어 드라이버 및 네트워크 유형 설정(ML2 + OVS)
CONFIG_NEUTRON_ML2_TYPE_DRIVERS=geneve,flat,vxlan,vlan
CONFIG_NEUTRON_ML2_MECHANISM_DRIVERS=openvswitch
CONFIG_NEUTRON_ML2_TENANT_NETWORK_TYPES=vxlan
CONFIG_NEUTRON_L2_AGENT=openvswitch

# 6. OVS 외부 네트워크 브리지 바인딩 설정(물리 외부 NIC ens224 연결)
CONFIG_NEUTRON_OVS_BRIDGE_MAPPINGS=extnet:br-ex
CONFIG_NEUTRON_OVS_BRIDGE_IFACES=br-ex:ens224

# 7. �전 스토리지 할당량 용량 설정
CONFIG_SWIFT_STORAGE_SIZE=20G
CONFIG_CINDER_VOLUMES_SIZE=50G
```

> ⚠️ **핵심 점검점**: 응답 파일 수정 후, 다시 모든 VM을 종료하고 스냅샷을 촬영할 것을 권장한다.

#### 4. 원클릭 자동화 배포 실행
전원 켠 후 제어 노드에서 배포 명령 실행:
```bash
[root@Controller ~]# packstack --answer-file=/root/answers.txt
```
배포 스크립트는 Puppet을 기반으로 모든 노드에서 소프트웨어 소스 설정, 데이터베이스 테이블 생성, 메시지 큐 클러스터 구축, 인증서 생성, 각 컴포넌트 협조 통합 테스트를 자동으로 완료한다. 완료되면 터미널에 Dashboard 로그인 URL과 `keystonerc_admin` 환경 변수 파일 경로를 출력한다.

---

## 4. Linux 시스템 로그 관리 및 OpenStack 장애 해결

### 1. Linux Rsyslog 로그 레벨 및 설정 아��텍처
Linux 시스템에서 시스템 하위 계층과 대부분의 서비스 로그는 `rsyslog` 데몬에 의해 중앙 집중 관리된다.

* **설정 파일 확인**:
  ```bash
  rpm -qc rsyslog
  # 핵심 메인 설정 파일: /etc/rsyslog.conf
  ```

#### 로그 규칙 구문 분석:
```text
서비스 유형(Facility).로그 레벨(Priority)    로그 저장 경로
```
일반적인 설정 예시:
```ini
# 1. 시스템 일반 메시지:
# 모든 서비스의 >=info 레벨 로그를 기록하되 메일, 인증 보안, cron 로그 제외
*.info;mail.none;authpriv.none;cron.none    /var/log/messages

# 2. 디버그 로그:
*.debug                                     /var/log/debug

# 3. 오류 수준 로그:
*.err                                       /var/log/error.log
```

* **구문 규칙 핵심 �항**:
  * `mail`: 서비스 유형(Facility);
  * `info`: 로그 우선순위 레벨;
  * `.`: **이상(>=)** 의 우선순위 로그 메시지에 일치함을 �타냄;
  * `*.info`: 모든 서비스의 `>= info` 레벨 로그가 대상 파일에 집계되어 기록됨을 의미한다.

#### 실시간 동적 로그 모니터링 명령:
```bash
# 시스템 로그 끝 출력 추적
tail /var/log/messages

# 실시간 로그 스트림 지속 수신
tail -f /var/log/messages
```

---

### 2. OpenStack 커스텀 서비스 로그 트러블슈팅 가이드

> **트러블슈팅 원칙**: 각 컴포넌트는 보통 독립적인 커스텀 로그 파일 체계(`/var/log/<컴포넌트명>/` 하위)를 갖는다. 컴포넌트에 이상이 있으면 **먼저 해당 컴포넌트 전용 로그를 확인하고, 커스텀 로그가 없을 때만 시스템 전역 로그 `/var/log/messages`로 돌아가 확인한다**.

#### 실전 �례: Neutron 네트워크 서비스 장애 위치 확인
배포 또는 운영 중 가상 네트워크 생성이 실패하거� OVS 포트가 올라오지 않으면, 정규식 매칭으로 오류와 경고를 직접 포착할 수 있다:

```bash
# 1. 모든 Neutron 로그에서 정규식으로 오류·경고 필터링
tail -f /var/log/neutron/*.log | grep -iE '(err|warn)'

# 2. neutron-server 핵심 API 서비스 로그를 심층 확인하고 매칭 항목 전후 3줄 컨텍스트 출력:
tail -f /var/log/neutron/server.log | grep -iE -A3 -B3 '(err|warn)'
```
*파라미터 설명*:

* `-i`: 대소문자 무시;
* `-E`: 확장 정규식 매칭 `(err|warn)` 활성화;
* `-A 3` (After): 매칭 행 이후 3줄 출력;
* `-B 3` (Before): 매칭 행 이전 3줄 출력.
