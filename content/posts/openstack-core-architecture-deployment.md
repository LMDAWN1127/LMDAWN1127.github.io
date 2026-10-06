---

title: "OpenStack 云操作系统核心架构与自动化部署"
date: 2026-10-06T20:35:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "云计算", "自动化部署", "Packstack", "Victoria"]
summary: "从核心组件（Nova/Glance/Neutron/Cinder 等）到基于 Packstack 的 Victoria 版一键自动化部署，并附 Rsyslog 日志排查方法。"
---

## 一、OpenStack 核心组件及作用

### 1. HORIZON —— 统一图形界面服务
* **核心功能**：提供基于 Web 的 Dashboard 图形管理控制台，供云管理员和普通租户进行云资源的可视化调配与监控。

### 2. NOVA —— 计算资源管理服务
* **核心功能**：负责管理和配置云计算环境中的虚拟化算力资源（`nova-compute`）。
* **角色分工**：
  * **Controller 控制节点**：运行 `nova-api`、`nova-scheduler`、`nova-conductor` 等调度服务。当用户发起创建云主机请求时，`nova-api` 接收请求并解析，`nova-scheduler` 根据规格策略选择最佳计算节点进行负载调度；
  * **Compute 计算节点**：实际承载云主机运行的工作节点（支持对接 KVM、VMware ESXi、Xen 等异构虚拟化主机）。
* **控制节点的高可用与性能瓶颈**：
  * 控制节点承担所有 API 网关、数据库和消息队列，存在高可用与性能压力；

### 3. GLANCE —— 镜像服务
* **核心功能**：负责操作系统镜像的发现、注册、检索与存储管理。
* **常见磁盘镜像格式**：
  * KVM 常用格式：`qcow2`（支持瘦分配与写时复制 COW）；
  * VMware 常用格式：`vmdk`。
* **部署建议**：通常复用并集成部署在控制节点上以实现高可用。

### 4. SWIFT —— 对象存储服务
* **核心功能**：提供高可用、分布式、最终一致性的对象存储服务（Object Storage），专门用于存储静态无结构数据、云主机系统镜像、数据全量备份等。

### 5. NEUTRON —— 软件定义网络（SDN）
* **核心功能**：提供云计算环境中的虚拟网络即服务，管理虚拟路由、交换机、安全组、浮动 IP 及跨节点流量打通。
* **网络技术**：全面支持 VLAN、VXLAN、Geneve 及分布式虚拟路由（DVR）；
* **硬件 SDN 模式**：生产环境中通常配备 2 台专用网络节点搭建双活或主备集群。

### 6. CINDER —— 块存储服务
* **核心功能**：为云主机提供持久化的块存储（云硬盘），可动态挂载、卸载、快照与扩容。
* **底层对接能力**：
  * 对接传统存储阵列：华为 OceanStor、IBM、EMC 等高端硬件存储；
  * 对接开源分布式存储：Ceph RBD、GlusterFS 等。
* **底层机制**：当用户申请一块云硬盘时，Cinder 会向下透传指令到后端存储系统，本质上相当于在物理/分布式存储中划分并映射出一个 LUN。
* **对比说明**：对象存储（如百度网盘、Swift、S3）无法作为块设备直接格式化挂载为云主机文件系统，而 Cinder 块设备可以直接格式化并进行挂载使用。

### 7. HEAT —— 基础设施编排服务
* **核心功能**：基于声明式模板（HOT 模板或 AWS CloudFormation 格式），通过图形化编排或编写脚本，一键自动化批量部署多台虚拟机、数据库集群、网络拓扑与监控策略。

### 8. CEILOMETER —— 计量监控服务
* **核心功能**：采集物理资源与虚拟资源的性能指标、运行时间与使用量。
  * **公有云场景**：记录 API 调用量、网络流出量、算力时长，对接计费计费系统；
  * **私有云场景**：监控租户配额水位，识别资源超用或空闲情况，为容量规划提供支撑。

### 9. KEYSTONE —— 统一身份认证与授权服务
* **核心功能**：OpenStack 整体安全基石，负责全平台的租户（Project）、用户（User）、角色（Role）、服务目录与 Token 鉴权认证。
* **企业级身份联邦对接**：
  * 可与企业现有的 Windows Active Directory (AD) 或 Linux OpenLDAP 无缝整合，实现企业级统一账号单点登录（SSO）；
* **流程审批与权限隔离（以华为云为例）**：
  * 支持云主机多级申请与审批工作流（支持高达 5 级审批）；
  * 贯彻“三权分立”安全准则（安全员、系统管理员、审计员分权管理）；
  * 支持对接客户企业自研 OA/BPM 审批流系统。

---

### 核心组件功能速查表：
| 组件名称 | 代码代号 | 核心服务功能 |
| :--- | :--- | :--- |
| **Horizon** | Dashboard | 统一 Web 图形化管理控制台 |
| **Nova** | Compute | 计算资源生命周期与实例调度管理 |
| **Glance** | Image | 虚拟机镜像存储与版本注册 |
| **Swift** | Object | 大规模非结构化对象存储服务 |
| **Neutron** | Network | 软件定义网络（SDN）、路由与安全组管理 |
| **Cinder** | Block | 云主机持久化块存储（云硬盘）管理 |
| **Heat** | Orchestration | 基础设施即代码（IaC）多资源栈编排 |
| **Ceilometer** | Metering | 资源使用量统计、监控计量与配额分析 |
| **Keystone** | Identity | 统一身份认证、鉴权令牌与服务目录管理 |

---

## 二、OpenStack 部署规划（以 Victoria 版为例）

### 1. 部署方式比较
1. **开源 OpenStack 手动部署**：按组件逐个编译配置，过程繁琐复杂，常用于底层机制深度学习；
2. **工具化自动化部署**：
   * **Ansible 部署**（如 OpenStack-Ansible、Kolla-Ansible）；
   * **Packstack 部署**：RedHat 开源的基于 Puppet 的自动化快速交付工具（本实战采用）；

---

### 2. 集群节点规格与网络规划

#### （1）Controller 控制节点（1 台）
* **承载组件**：
  * API 服务：`nova-api`、`cinder-api`、`glance-api`、`neutron-server` 等；
  * 底层基础服务：MariaDB / MySQL、RabbitMQ 消息队列、Memcached、Keystone；
  * 网络与管理服务：网络节点外网路由转发、YUM 本地缓存、Chrony 时间同步服务端。
* **系统配置要求**：
  * **CPU**：4 vCPU 起
  * **内存**：4GB 内存起
  * **硬盘**：100GB 可用磁盘空间
  * **网卡**：3 块网卡（网卡 1 配置为桥接模式访问互联网；网卡 2 与网卡 3 配置为仅主机 Host-Only 模式走内网业务）
* **IP 地址规划**：
  * 内部管理 IP：192.168.100.10
  * 外部访问 IP：192.168.10.10

#### （2）Compute 计算节点（1 台）
* **承载组件**：`nova-compute`、网络 L2 Agent（Open vSwitch Agent）
* **系统配置要求**：
  * **CPU**：4 vCPU 起
  * **内存**：8GB 内存起（最低 4GB）
  * **硬盘**：100GB 磁盘空间
  * **网卡**：3 块网卡（全配置为仅主机 Host-Only 模式）
* **IP 地址规划**：
  * Compute：192.168.100.11

#### （3）YUM 软件源服务器 + Chrony 时间服务器（1 台）
* **系统配置要求**：
  * **CPU**：2 vCPU
  * **内存**：2GB
  * **网卡**：2 块（一块桥接连接 Internet 同步公网时间与上游软件源，另一块仅主机模式为内网节点提供服务）
* **IP 地址规划**：
  * 外网 IP：192.168.10.11
  * 内网 IP：192.168.100.20

> **环境降配说明**：若个人电脑硬件资源紧张，可**最低压缩为 2 台虚拟机**（控制节点复用为 YUM 源与时间服务器，另配 1 台计算节点）。注意：各节点系统时间必须保持高度一致，**时钟漂移不得超过 5 分钟**，否则 Keystone 握手与消息队列通信将全面失效。

---

## 三、OpenStack 自动化部署实战全流程

### 阶段一：YUM 源服务器与 Chrony 时间服务器搭建

#### 1. 配置网络接口
```bash
# 1. 配置内部通信网卡 ens160
[root@Cloud ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens160
TYPE=Ethernet
BOOTPROTO=none
NAME=ens160
DEVICE=ens160
ONBOOT=yes
IPADDR=192.168.100.20
PREFIX=24

# 2. 配置可连接外网的网卡 ens192（用于同步公网时钟）
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

# 重启网卡使配置生效
[root@Cloud ~]# nmcli connection down ens160 ; nmcli connection up ens160
Connection 'ens160' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/1)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/4)
[root@Cloud ~]# nmcli connection down ens192 ; nmcli connection up ens192
Connection 'ens192' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/5)
```

#### 2. 配置本地光盘 YUM 源
```bash
[root@Cloud ~]# cd /etc/yum.repos.d/
[root@Cloud yum.repos.d]# mkdir bak
[root@Cloud yum.repos.d]# mv CentOS-Linux-* bak/

# 挂载操作系统 ISO 光盘
mount /dev/cdrom /media/

# 编写光盘本地源配置文件
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

#### 3. 配置 Chrony 时间同步服务端
由于 OpenStack 对节点间时钟同步要求极其严苛，先配置时间源：

```bash
# 编辑 /etc/chrony.conf
[root@Cloud ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool ntp.tencent.com iburst
# Allow NTP client access from local network.
allow 192.168.100.0/24
# Serve time even if not synchronized to a time source.
local stratum 10

# 重启并验证时间同步服务
[root@Cloud ~]# systemctl restart chronyd.service
[root@Cloud ~]# chronyc sources
210 Number of sources = 1
MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 106.55.184.199                2   6    17     2   -224us[ -144us] +/-   54ms

# 关闭防火墙与 SELinux
[root@Cloud ~]# systemctl disable firewalld.service --now
[root@Cloud ~]# setenforce 0
[root@Cloud ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
```

#### 4. 搭建 httpd本地web yum仓库
将 CentOS 8 及 OpenStack Victoria 软件仓库发布为 HTTP 镜像源，供所有集群节点拉取。

```bash
# 1. 安装并启动 Apache Web 服务
[root@Cloud ~]# yum -y install httpd
[root@Cloud ~]# systemctl enable httpd --now

# 2. 创建目录并挂载镜像文件
[root@Cloud ~]# mkdir /isos
[root@Cloud ~]# mkdir -p /var/www/html/centos8
[root@Cloud ~]# mkdir -p /var/www/html/openstack

# 挂载基础系统光盘与 OpenStack Victoria 安装镜像
[root@Cloud ~]# mount /dev/cdrom /var/www/html/centos8/
[root@Cloud ~]# mount /isos/26-CentOS8-4-OSP-Victoria.iso /var/www/html/openstack/

# 3. 持久化挂载写入 /etc/fstab
[root@Cloud ~]# vim /etc/fstab
/dev/cdrom              /var/www/html/centos8   iso9660  defaults  0 0
/isos/26-CentOS8-4-OSP-Victoria.iso  /var/www/html/openstack iso9660 defaults 0 0

# 4. 配置 HTTP YUM 仓库文件
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

# 5. 将写好的 repo 文件批量分发至各控制节点与计算节点
[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.10:/etc/yum.repos.d/

[root@Cloud ~]# scp /etc/yum.repos.d/dvd.repo /etc/yum.repos.d/openstack.repo root@192.168.100.11:/etc/yum.repos.d/
```

---

### 阶段二：集群各节点系统环境初始化

#### 1. Controller控制节点初始化（192.168.100.10）
```bash
# 1. 配置管理网络 ens160
[root@Controller ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.10/24 ipv4.method manual autoconnect yes
[root@Controller ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. 配置外部网络网卡 ens224
[root@Controller ~]# vim /etc/sysconfig/network-scripts/ifcfg-ens224
TYPE=Ethernet
BOOTPROTO=none
NAME=ens224
DEVICE=ens224
ONBOOT=yes

[root@Controller ~]# nmcli connection reload
[root@Controller ~]# nmcli connection modify ens224  ipv4.addresses 192.168.10.10/24   ipv4.gateway 192.168.10.1   ipv4.dns 192.168.10.1   ipv4.method manual   autoconnect yes
[root@Controller ~]# nmcli connection down ens224 ; nmcli connection up ens224

# 3. 配置 Chrony 时间同步客户端
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

# 4. 配置主机名
[root@Controller ~]# hostnamectl set-hostname Controller

# 5. 关闭防火墙与 SELinux
[root@Controller ~]# systemctl disable firewalld.service --now
[root@Controller ~]# setenforce 0
[root@Controller ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 6. 配置集群 /etc/hosts 解析
[root@Controller ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 7. 清理默认系统 repo 缓存
[root@Controller ~]# cd /etc/yum.repos.d
[root@Controller yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

#### 2. Compute计算节点初始化（192.168.100.11）
```bash
# 1. 配置管理网络
[root@Compute ~]# nmcli connection modify ens160 ipv4.addresses 192.168.100.11/24 ipv4.method manual autoconnect yes
[root@Compute ~]# nmcli connection down ens160 ; nmcli connection up ens160

# 2. 配置 Chrony 时间同步客户端
[root@Compute ~]# vim /etc/chrony.conf
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
pool 192.168.100.20 iburst

[root@Compute ~]# systemctl enable chronyd.service --now

# 3. 设置主机名
[root@Compute ~]# hostnamectl set-hostname Compute

# 4. 关闭防火墙与 SELinux
[root@Compute ~]# systemctl disable firewalld.service --now
[root@Compute ~]# setenforce 0
[root@Compute ~]# sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

# 5. 配置集群 hosts 解析
[root@Compute ~]# vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute

# 6. 清理默认系统 repo
[root@Compute ~]# cd /etc/yum.repos.d
[root@Compute yum.repos.d]# mkdir -p bak && mv CentOS-Linux-* bak/
```

> ⚠️ **关键检查点**：此时建议将所有虚拟机关机，**统一拍摄快照，以便出现异常时快速回退。

---

### 阶段三：Packstack 自动化应答部署

#### 1. 安装 Packstack 部署工具
在控制节点（Controller）执行：
```bash
[root@Controller ~]# yum -y install openstack-packstack
```

#### 2. 生成默认部署应答文件
```bash
[root@Controller ~]# packstack --gen-answer-file=/root/answers.txt
```

> **网络方案说明**：OpenStack Victoria 支持 OVN（Open Virtual Network）与传统 OVS（Open vSwitch）。

#### 3. 精准定制修改应答文件参数
```bash
# 将自动探测的外网 IP 统一替换为内网管理 IP 192.168.100.10
[root@Controller ~]# sed -i 's/192.168.10.10/192.168.100.10/g' /root/answers.txt
```

编辑 `/root/answers.txt`，核对并修改以下核心配置项：
```ini
# 1. 指定计算节点集群 IP 列表（逗号分隔）
CONFIG_COMPUTE_HOSTS=192.168.100.11

# 2. 设置 Keystone 管理员 root 初始密码
CONFIG_KEYSTONE_ADMIN_PW=000000

# 3. 禁用 Demo 演示租户网络（生产化规范）
CONFIG_PROVISION_DEMO=n

# 4. 开启 Heat 编排组件支持
CONFIG_HEAT_INSTALL=y

# 5. Neutron 核心驱动与网络类型配置（ML2 + OVS）
CONFIG_NEUTRON_ML2_TYPE_DRIVERS=geneve,flat,vxlan,vlan
CONFIG_NEUTRON_ML2_MECHANISM_DRIVERS=openvswitch
CONFIG_NEUTRON_ML2_TENANT_NETWORK_TYPES=vxlan
CONFIG_NEUTRON_L2_AGENT=openvswitch

# 6. OVS 外部网络网桥绑定配置（关联物理外部网卡 ens224）
CONFIG_NEUTRON_OVS_BRIDGE_MAPPINGS=extnet:br-ex
CONFIG_NEUTRON_OVS_BRIDGE_IFACES=br-ex:ens224

# 7. 预设存储配额容量
CONFIG_SWIFT_STORAGE_SIZE=20G
CONFIG_CINDER_VOLUMES_SIZE=50G
```

> ⚠️ **关键检查点**：修改完应答文件后，建议再次将所有虚拟机关机拍摄快照。

#### 4. 执行一键自动化部署
开机后在控制节点运行部署命令：
```bash
[root@Controller ~]# packstack --answer-file=/root/answers.txt
```
部署脚本将基于 Puppet 自动在所有节点完成软件源配置、数据库建表、消息队列集群建立、证书生成以及各组件协同联调。完成后将在终端打印登录 Dashboard 的 URL 及 `keystonerc_admin` 环境变量文件路径。

---

## 四、Linux 系统日志管理与 OpenStack 故障排查

### 1. Linux Rsyslog 日志分级与配置架构
在 Linux 系统中，系统底层与大部分服务的日志均交由 `rsyslog` 守护进程集中管理。

* **查看配置文件**：
  ```bash
  rpm -qc rsyslog
  # 核心主配置文件: /etc/rsyslog.conf
  ```

#### 日志规则语法解析：
```text
服务类别(Facility).日志等级(Priority)    日志存储路径
```
常见配置示例：
```ini
# 1. 系统通用常规消息：
# 记录所有服务 >=info 级别的日志，但排除邮件、认证安全和计划任务日志
*.info;mail.none;authpriv.none;cron.none    /var/log/messages

# 2. 调试日志：
*.debug                                     /var/log/debug

# 3. 错误级别日志：
*.err                                       /var/log/error.log
```

* **语法规则要点**：
  * `mail`：服务类别（Facility）；
  * `info`：日志优先级等级；
  * `.`：表示匹配**大于等于（>=）**该优先级的日志消息；
  * `*.info`：表示所有服务的 `>= info` 级别日志均汇聚写入目标文件。

#### 实时动态监控日志命令：
```bash
# 跟踪系统日志末尾输出
tail /var/log/messages

# 持续挂起实时监听日志流
tail -f /var/log/messages
```

---

### 2. OpenStack 自定义服务日志排查准则

> **排错原则**：各组件通常具备独立的自定义日志文件体系（位于 `/var/log/<组件名>/` 目录下）。若组件运行异常，**优先排查该组件专属日志，无自定义日志时再退回排查系统全局日志 `/var/log/messages`**。

#### 实战案例：以 Neutron 网络服务故障定位为例
在部署或运行过程中，若虚拟网络创建失败或 OVS 端口未上线，可通过正则匹配直接捕获错误与警告信息：

```bash
# 1. 跨文件正则过滤所有 Neutron 日志中的错误与告警
tail -f /var/log/neutron/*.log | grep -iE '(err|warn)'

# 2. 深度排查 neutron-server 核心 API 服务日志，并输出匹配项前后 3 行上下文：
tail -f /var/log/neutron/server.log | grep -iE -A3 -B3 '(err|warn)'
```
*参数说明*：

* `-i`：忽略大小写；
* `-E`：开启扩展正则表达式匹配 `(err|warn)`；
* `-A 3` (After)：打印匹配行后 3 行；
* `-B 3` (Before)：打印匹配行前 3 行。
