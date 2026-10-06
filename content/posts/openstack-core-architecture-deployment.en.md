---
title: "OpenStack Cloud OS: Core Architecture and Automated Deployment"
date: 2026-10-06T20:35:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "Cloud Computing", "Automated Deployment", "Packstack", "Victoria"]
summary: "From core components (Nova/Glance/Neutron/Cinder, etc.) to one-click Packstack-based automated deployment of the Victoria release, plus Rsyslog log troubleshooting."
---

## I. OpenStack Core Components and Their Roles

### 1. HORIZON — Unified Web Dashboard Service
* **Core function**: Provides a Web-based Dashboard graphical management console for cloud administrators and tenants to visually allocate and monitor cloud resources.

### 2. NOVA — Compute Resource Management Service
* **Core function**: Manages and configures virtualized compute resources in the cloud environment (`nova-compute`).
* **Role division**:
  * **Controller node**: Runs scheduling services such as `nova-api`, `nova-scheduler`, and `nova-conductor`. When a user requests a new cloud instance, `nova-api` receives and parses the request, and `nova-scheduler` selects the best compute node for load scheduling based on policy.
  * **Compute node**: The worker node that actually hosts running cloud instances (supports heterogeneous hypervisors such as KVM, VMware ESXi, and Xen).
* **High availability and performance bottlenecks of the controller node**:
  * The controller node hosts all API gateways, databases, and message queues, creating HA and performance pressure;

### 3. GLANCE — Image Service
* **Core function**: Responsible for discovery, registration, retrieval, and storage management of OS images.
* **Common disk image formats**:
  * Common KVM format: `qcow2` (supports thin provisioning and copy-on-write, COW);
  * Common VMware format: `vmdk`.
* **Deployment recommendation**: Usually co-located and integrated on the controller node for high availability.

### 4. SWIFT — Object Storage Service
* **Core function**: Provides a highly available, distributed, eventually-consistent object storage service (Object Storage), purpose-built for static unstructured data, cloud instance system images, and full data backups.

### 5. NEUTRON — Software-Defined Networking (SDN)
* **Core function**: Provides network-as-a-service in the cloud environment, managing virtual routers, switches, security groups, floating IPs, and cross-node traffic connectivity.
* **Network technologies**: Fully supports VLAN, VXLAN, Geneve, and distributed virtual routing (DVR);
* **Hardware SDN mode**: Production environments typically deploy 2 dedicated network nodes to build an active-active or active-standby cluster.

### 6. CINDER — Block Storage Service
* **Core function**: Provides persistent block storage (cloud disks) for cloud instances, with dynamic attach, detach, snapshot, and resize.
* **Underlying backend integration**:
  * Integrates with traditional storage arrays: Huawei OceanStor, IBM, EMC, and other high-end hardware storage;
  * Integrates with open-source distributed storage: Ceph RBD, GlusterFS, etc.
* **Underlying mechanism**: When a user requests a cloud disk, Cinder passes the instruction down to the backend storage system—essentially carving and mapping out a LUN within physical or distributed storage.
* **Comparison**: Object storage (e.g., Baidu Netdisk, Swift, S3) cannot be formatted and mounted directly as a block device for a cloud instance's filesystem, whereas a Cinder block device can be formatted and mounted directly.

### 7. HEAT — Orchestration Service
* **Core function**: Based on declarative templates (HOT templates or AWS CloudFormation format), it automates one-click batch deployment of multiple VMs, database clusters, network topologies, and monitoring policies via graphical orchestration or scripts.

### 8. CEILOMETER — Telemetry & Monitoring Service
* **Core function**: Collects performance metrics, uptime, and usage of physical and virtual resources.
  * **Public cloud scenario**: Records API call volume, network egress, and compute hours, integrating with the billing system;
  * **Private cloud scenario**: Monitors tenant quota levels, identifies over-use or idle resources, and supports capacity planning.

### 9. KEYSTONE — Unified Identity & Authorization Service
* **Core function**: The security cornerstone of OpenStack, responsible for tenant (Project), user (User), role (Role), service catalog, and Token authentication across the platform.
* **Enterprise identity federation**:
  * Can seamlessly integrate with the enterprise's existing Windows Active Directory (AD) or Linux OpenLDAP to deliver enterprise-grade unified-account single sign-on (SSO);
* **Workflow approval and privilege isolation (Huawei Cloud as an example)**:
  * Supports multi-level cloud instance request and approval workflows (up to 5 approval levels);
  * Enforces the "separation of three powers" security principle (security officer, system administrator, and auditor manage with separated privileges);
  * Supports integration with the customer's in-house OA/BPM approval-flow systems.

---

### Quick Reference Table of Core Components
| Component | Code Name | Core Service Function |
| :--- | :--- | :--- |
| **Horizon** | Dashboard | Unified Web Graphical Management Console |
| **Nova** | Compute | Compute Resource Lifecycle & Instance Scheduling |
| **Glance** | Image | VM Image Storage & Version Registration |
| **Swift** | Object | Large-Scale Unstructured Object Storage Service |
| **Neutron** | Network | Software-Defined Networking (SDN), Routing & Security Group Management |
| **Cinder** | Block | Persistent Block Storage (Cloud Disk) Management for Instances |
| **Heat** | Orchestration | Infrastructure-as-Code (IaC) Multi-Resource Stack Orchestration |
| **Ceilometer** | Metering | Resource Usage Statistics, Monitoring Metering & Quota Analysis |
| **Keystone** | Identity | Unified Identity Authentication, Token & Service Catalog Management |

---

## II. OpenStack Deployment Planning (Victoria Edition)

### 1. Deployment Method Comparison
1. **Open-source manual deployment**: Compile and configure each component individually—tedious and complex, usually for deep learning of underlying mechanisms;
2. **Tool-based automated deployment**:
   * **Ansible deployment** (e.g., OpenStack-Ansible, Kolla-Ansible);
   * **Packstack deployment**: Red Hat's open-source, Puppet-based automated rapid-delivery tool (used in this walkthrough);

---

### 2. Cluster Node Specifications and Network Planning

#### (1) Controller Node (1 unit)
* **Hosted components**:
  * API services: `nova-api`, `cinder-api`, `glance-api`, `neutron-server`, etc.;
  * Underlying base services: MariaDB / MySQL, RabbitMQ message queue, Memcached, Keystone;
  * Network and management services: external routing on the network node, local YUM cache, and Chrony NTP server.
* **System requirements**:
  * **CPU**: 4 vCPU minimum
  * **Memory**: 4GB minimum
  * **Disk**: 100GB available disk space
  * **NICs**: 3 network cards (NIC 1 in bridged mode for Internet access; NIC 2 and NIC 3 in host-only mode for internal traffic)
* **IP address planning**:
  * Internal management IP: 192.168.100.10
  * External access IP: 192.168.10.10

#### (2) Compute Node (1 unit)
* **Hosted components**: `nova-compute`, and the network L2 Agent (Open vSwitch Agent)
* **System requirements**:
  * **CPU**: 4 vCPU minimum
  * **Memory**: 8GB minimum (4GB at least)
  * **Disk**: 100GB disk space
  * **NICs**: 3 network cards (all in host-only mode)
* **IP address planning**:
  * Compute: 192.168.100.11

#### (3) YUM Repository Server + Chrony NTP Server (1 unit)
* **System requirements**:
  * **CPU**: 2 vCPU
  * **Memory**: 2GB
  * **NICs**: 2 cards (one bridged to the Internet for public time sync and upstream repos, the other host-only to serve internal nodes)
* **IP address planning**:
  * External IP: 192.168.10.11
  * Internal IP: 192.168.100.20

> **Environment downgrade note**: If your personal computer is short on hardware, you can **compress down to a minimum of 2 VMs** (the controller node also acts as the YUM source and NTP server, plus 1 compute node). Note: the system clocks of all nodes must stay highly consistent—**clock drift must not exceed 5 minutes**, otherwise Keystone handshakes and message-queue communication will fail entirely.

---

## III. Full Automated Deployment Walkthrough

### Phase 1: YUM Repository Server and Chrony NTP Server Setup

#### 1. Configure Network Interfaces
```bash
# 1. Configure the internal communication NIC ens160
[root@Cloud ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens160
TYPE=Ethernet
BOOTPROTO=none
NAME=ens160
DEVICE=ens160
ONBOOT=yes
IPADDR=192.168.100.20
PREFIX=24

# 2. Configure the Internet-facing NIC ens192 (for syncing public NTP)
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

# Restart the NICs to apply the configuration
[root@Cloud ~]# nmcli connection down ens160 ; nmcli connection up ens160
Connection 'ens160' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/1)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/4)
[root@Cloud ~]# nmcli connection down ens192 ; nmcli connection up ens192
Connection 'ens192' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/5)
```

#### 2. Configure Local CD-ROM YUM Repository
```bash
[root@Cloud ~]# cd /etc/yum.repos.d/
[root@Cloud yum.repos.d]# mkdir bak
[root@Cloud yum.repos.d]# mv CentOS-Linux-* bak/

# Mount the OS installation ISO
mount /dev/cdrom /media/

# Write the local CD-ROM repository config file
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

#### 3. Configure Chrony NTP Server
Because OpenStack is extremely strict about inter-node clock synchronization, configure the time source first:

```bash
# Edit /etc/chrony.conf
[root@Cloud ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool ntp.tencent.com iburst
# Allow NTP client access from local network.
allow 192.168.100.0/24
# Serve time even if not synchronized to a time source.
local stratum 10

# Restart and verify the time sync service
[root@Cloud ~]# systemctl restart chronyd.service
[root@Cloud ~]# chronyc sources
210 Number of sources = 1
MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 106.55.184.199                2   6    17     2   -224us[ -144us] +/-   54ms

# Disable the firewall and SELinux
[root@Cloud ~]# systemctl disable firewalld.service --now
[root@Cloud ~]# setenforce 0
[root@Cloud ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
```

#### 4. Build an httpd-based Local Web YUM Repository
Publish the CentOS 8 and OpenStack Victoria software repositories as an HTTP mirror source for all cluster nodes to pull from.

```bash
# 1. Install and start the Apache web service
[root@Cloud ~]# yum -y install httpd
[root@Cloud ~]# systemctl enable httpd --now

# 2. Create directories and mount the image files
[root@Cloud ~]# mkdir /isos
[root@Cloud ~]# mkdir -p /var/www/html/centos8
[root@Cloud ~]# mkdir -p /var/www/html/openstack

# Mount the base system CD and the OpenStack Victoria installation image
[root@Cloud ~]# mount /dev/cdrom /var/www/html/centos8/
[root@Cloud ~]# mount /isos/26-CentOS8-4-OSP-Victoria.iso /var/www/html/openstack/

# 3. Persist the mounts in /etc/fstab
[root@Cloud ~]# vim /etc/fstab
/dev/cdrom              /var/www/html/centos8   iso9660  defaults  0 0
/isos/26-CentOS8-4-OSP-Victoria.iso  /var/www/html/openstack iso9660 defaults 0 0

# 4. Configure the HTTP YUM repository files
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

# 5. Distribute the prepared repo files to each controller and compute node
[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.10:/etc/yum.repos.d/

[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.11:/etc/yum.repos.d/
```

---

### Phase 2: System Environment Initialization for Each Cluster Node

#### 1. Controller Node Initialization (192.168.100.10)
```bash
# 1. Configure the management network ens160
[root@Controller ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.10/24 ipv4.method manual autoconnect yes
[root@Controller ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. Configure the external network NIC ens224
[root@Controller ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens224
TYPE=Ethernet
BOOTPROTO=none
NAME=ens224
DEVICE=ens224
ONBOOT=yes

[root@Controller ~]# nmcli connection reload
[root@Controller ~]# nmcli connection modify ens224  ipv4.addresses 192.168.10.10/24   ipv4.gateway 192.168.10.1   ipv4.dns 192.168.10.1   ipv4.method manual   autoconnect yes
[root@Controller ~]# nmcli connection down ens224 ; nmcli connection up ens224

# 3. Configure the Chrony NTP client
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

# 4. Set the hostname
[root@Controller ~]# hostnamectl set-hostname Controller

# 5. Disable the firewall and SELinux
[root@Controller ~]# systemctl disable firewalld.service --now
[root@Controller ~]# setenforce 0
[root@Controller ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 6. Configure cluster /etc/hosts resolution
[root@Controller ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 7. Clean the default system repo cache
[root@Controller ~]# cd /etc/yum.repos.d
[root@Controller yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

#### 2. Compute Node Initialization (192.168.100.11)
```bash
# 1. Configure the management network
[root@Compute ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.11/24 ipv4.method manual autoconnect yes
[root@Compute ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. Configure the Chrony NTP client
[root@Compute ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool 192.168.100.20 iburst

[root@Compute ~]# systemctl enable chronyd.service --now

# 3. Set the hostname
[root@Compute ~]# hostnamectl set-hostname Compute

# 4. Disable the firewall and SELinux
[root@Compute ~]# systemctl disable firewalld.service --now
[root@Compute ~]# setenforce 0
[root@Compute ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 5. Configure cluster hosts resolution
[root@Compute ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 6. Clean the default system repo
[root@Compute ~]# cd /etc/yum.repos.d
[root@Compute yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

> ⚠️ **Key checkpoint**: It is recommended to shut down all VMs at this point and **take a unified snapshot for quick rollback if something goes wrong.**

---

### Phase 3: Packstack Automated Answer-File Deployment

#### 1. Install the Packstack Deployment Tool
Run on the controller node (Controller):
```bash
[root@Controller ~]# yum -y install openstack-packstack
```

#### 2. Generate the Default Answer File
```bash
[root@Controller ~]# packstack --gen-answer-file=/root/answers.txt
```

> **Networking note**: OpenStack Victoria supports both OVN (Open Virtual Network) and the traditional OVS (Open vSwitch).

#### 3. Customize the Answer File Parameters
```bash
# Replace the auto-detected external IP with the internal management IP 192.168.100.10
[root@Controller ~]# sed -i 's/192.168.10.10/192.168.100.10/g' /root/answers.txt
```

Edit `/root/answers.txt` and review and modify the following core configuration items:
```ini
# 1. Specify the compute node cluster IP list (comma-separated)
CONFIG_COMPUTE_HOSTS=192.168.100.11

# 2. Set the Keystone admin root initial password
CONFIG_KEYSTONE_ADMIN_PW=000000

# 3. Disable the Demo tenant network (production hardening)
CONFIG_PROVISION_DEMO=n

# 4. Enable Heat orchestration component support
CONFIG_HEAT_INSTALL=y

# 5. Neutron core driver and network type configuration (ML2 + OVS)
CONFIG_NEUTRON_ML2_TYPE_DRIVERS=geneve,flat,vxlan,vlan
CONFIG_NEUTRON_ML2_MECHANISM_DRIVERS=openvswitch
CONFIG_NEUTRON_ML2_TENANT_NETWORK_TYPES=vxlan
CONFIG_NEUTRON_L2_AGENT=openvswitch

# 6. OVS external network bridge binding configuration (associates the physical external NIC ens224)
CONFIG_NEUTRON_OVS_BRIDGE_MAPPINGS=extnet:br-ex
CONFIG_NEUTRON_OVS_BRIDGE_IFACES=br-ex:ens224

# 7. Preset storage quota capacity
CONFIG_SWIFT_STORAGE_SIZE=20G
CONFIG_CINDER_VOLUMES_SIZE=50G
```

> ⚠️ **Key checkpoint**: After modifying the answer file, it is recommended to shut down all VMs again and take a snapshot.

#### 4. Execute One-Click Automated Deployment
After powering on, run the deployment command on the controller node:
```bash
[root@Controller ~]# packstack --answer-file=/root/answers.txt
```
The deployment script uses Puppet to automatically complete software-source configuration, database table creation, message-queue cluster setup, certificate generation, and coordinated integration testing of all components across all nodes. When finished, it prints the Dashboard login URL and the `keystonerc_admin` environment-variable file path to the terminal.

---

## IV. Linux System Log Management and OpenStack Troubleshooting

### 1. Linux Rsyslog Log Levels and Configuration Architecture
In Linux systems, logs from the low-level system and most services are centrally managed by the `rsyslog` daemon.

* **View the config file**:
  ```bash
  rpm -qc rsyslog
  # Core main config file: /etc/rsyslog.conf
  ```

#### Log Rule Syntax Analysis
```text
facility.level(priority)    log storage path
```
Common configuration examples:
```ini
# 1. General system messages:
# Log all services >=info level, but exclude mail, authpriv, and cron logs
*.info;mail.none;authpriv.none;cron.none    /var/log/messages

# 2. Debug logs:
*.debug                                     /var/log/debug

# 3. Error-level logs:
*.err                                       /var/log/error.log
```

* **Syntax rule key points**:
  * `mail`: service facility;
  * `info`: log priority level;
  * `.`: denotes matching log messages at **greater than or equal to (>=)** this priority;
  * `*.info`: means all services' `>= info` level logs are aggregated and written to the target file.

#### Real-Time Dynamic Log Monitoring Commands
```bash
# Follow the tail output of the system log
tail /var/log/messages

# Continuously tail the live log stream
tail -f /var/log/messages
```

---

### 2. OpenStack Custom Service Log Troubleshooting Guidelines

> **Troubleshooting principle**: Each component usually has its own custom log-file system (under `/var/log/<component>/`). If a component misbehaves, **prioritize its dedicated logs; only fall back to the system-wide log `/var/log/messages` when no custom log exists**.

#### Case Study: Locating Neutron Network Service Failures
During deployment or operation, if virtual network creation fails or an OVS port does not come up, you can directly capture errors and warnings via regex matching:

```bash
# 1. Regex-filter errors and warnings across all Neutron logs
tail -f /var/log/neutron/*.log | grep -iE '(err|warn)'

# 2. Deep-troubleshoot the neutron-server core API service log, printing 3 lines of context before and after each match:
tail -f /var/log/neutron/server.log | grep -iE -A3 -B3 '(err|warn)'
```
*Parameter description*:

* `-i`: ignore case;
* `-E`: enable extended regex matching `(err|warn)`;
* `-A 3` (After): print 3 lines after the match;
* `-B 3` (Before): print 3 lines before the match.