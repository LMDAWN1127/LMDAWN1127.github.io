---
title: "Neutron"
date: 2026-10-07T17:42:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "Neutron"]
summary: "Neutron 是 OpenStack 的网络服务组件，负责虚拟交换机（OVS/OVN）、命名空间、安全组，以及 tap/qbr/qvb/qvo/br-int 等网络虚拟化机制。"
---

## 一、Neutron网络服务

SDN： Software Define Network  软件定义网络

**虚拟交换机**

Bridge： 桥接器

OVS：Open Vswitch

OVN： Open Virtual Network

**云租户隔离机制**

**namespace机制**  命名空间

![](/images/neutron-img-04.png)

```bash
#用于管理Linux以太网网桥
[root@Controller ~]# yum -y install bridge-utils
[root@Compute01 ~]# yum -y install bridge-utils
[root@Compute02 ~]# yum -y install bridge-utils
```

tap设备： 虚拟机虚拟网卡名称，在虚拟机操作系统中网卡eth0，在openstack看来，就是一个tap设备

qbr：Qemu Bridge  提供安全组规则，因为目前openswitch不支持iptables防火墙规则，引入qbr来实现iptables规则

qvb : Bridge  qbr

qvo: OVS qvo  ovs

br-int： 内部虚拟交换机

如果VM1和VM2在同一个子网中，并且在同一台计算节点上，则VM1访问VM2，直接通过br-int这个内部虚拟交换机来实现即可，提升访问性能

## 二、跨主机数据流

由于之前电脑资源限制，只创建了一台计算节点，现在为了满足实验需要，现在增加一台计算节点Compute02

1.克隆Compute,将原来的Compute节点主机名修改成Compute01，将克隆的节点主机名修改成Compute02

2.将克隆后的主机所有网卡重新生成MAC地址，以防冲突

![image-20261006224937442](/images/neutron-image-20261006224937442.png)

3.将克隆后的主机IP地址修改，以防止冲突

```bash
[root@Compute02 ~]# ip a
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
2: ens160: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:50:56:29:d6:05 brd ff:ff:ff:ff:ff:ff
    inet 192.168.100.12/24 brd 192.168.100.255 scope global noprefixroute ens160
       valid_lft forever preferred_lft forever
    inet6 fe80::250:56ff:fe29:d605/64 scope link
       valid_lft forever preferred_lft forever
3: ens192: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:50:56:26:dc:b9 brd ff:ff:ff:ff:ff:ff
    inet 192.168.200.11/24 brd 192.168.200.255 scope global noprefixroute ens192
       valid_lft forever preferred_lft forever
    inet6 fe80::250:56ff:fe26:dcb9/64 scope link
       valid_lft forever preferred_lft forever
```

4.将Controller、Compute01、Compute02和storage四台的/etc/hosts配置文件同步

```bash
vim /etc/hosts
192.168.100.10 Controller
192.168.100.11 Compute01
192.168.100.12 Compute02
192.168.200.20 storage
```

6.将应答文件answers.txt修改，然后进行自动化部署将Compute02节点加入

```bash
[root@Controller ~]# vim /etc/hosts
CONFIG_COMPUTE_HOSTS=192.168.100.11,192.168.100.12
[root@Controller ~]# packstack --answer-file=/root/answers.txt
```



![](/images/neutron-img-02.png)

## 三、跨主机，跨网络数据流

![](/images/neutron-img-01.png)

## 四、访问Internet数据流

![](/images/neutron-img-07.png)

OpenStack Neutron SDN  软件定义网络  交换机OVS Router VLAN VXLAN隧道网络 Flat网络

![](/images/neutron-img-06.png)

计算节点运行L2 Agent

openstack-openvswitch.service

网络节点运行 L3 Agent

neutron-l3-agent.service

openstack-openvswitch.service

dhcp agent

metadata agent  cloud-init，如果没有该服务，即便安装了cloud-init也无法实现自定义个性化信息，主机名 IP地址，root密码等

查看各个节点运行的网络组件

```bash
[root@Controller ~(keystone_admin)]# neutron agent-list
neutron CLI is deprecated and will be removed in the future. Use openstack CLI instead.
+--------------------------------------+--------------------+------------+-------------------+-------+----------------+---------------------------+
| id                                   | agent_type         | host       | availability_zone | alive | admin_state_up | binary                    |
+--------------------------------------+--------------------+------------+-------------------+-------+----------------+---------------------------+
| 1eea40a9-8ead-435a-a8b4-e08f39ed44ee | Metadata agent     | Controller |                   | :-)   | True           | neutron-metadata-agent    |
| 2b5e9b53-f364-4ff2-8923-2b9124db90c6 | Open vSwitch agent | Compute02  |                   | :-)   | True           | neutron-openvswitch-agent |
| 4b77d79e-4ce8-4f37-a35c-2c663199f8b3 | Open vSwitch agent | Compute    |                   | :-)   | True           | neutron-openvswitch-agent |
| 7c5771f1-ab63-41ab-b52a-d137b5d09dfd | Metering agent     | Controller |                   | :-)   | True           | neutron-metering-agent    |
| 8751ee3e-a7e4-4d70-8233-44b4fb4b8bec | Open vSwitch agent | Controller |                   | :-)   | True           | neutron-openvswitch-agent |
| 922ff7f3-8a7c-48e2-831c-57621542222c | L3 agent           | Controller | nova              | :-)   | True           | neutron-l3-agent          |
| ac7660d8-58d0-40da-81cd-3e8a2eec89ae | DHCP agent         | Controller | nova              | :-)   | True           | neutron-dhcp-agent        |
+--------------------------------------+--------------------+------------+-------------------+-------+----------------+---------------------------+
```

**Agent：** 代理，具体处理业务的存在 L2 Agent 处理真正二层交换数据

**L3 Agent：**处理路由的数据

在一个网络中，L2 Agent可以由Bridge或者OVS来实现，但同时只能使用其中之一

所有的节点必须要么是Bridge，要么是OVS，如果想要我们的环境支持多种L2 Agent，可以引入ML2， 支持多种L2 Agent

改造现有的VXLAN网络为flat网络（无VLAN隔离的网络类型）

**LOCAL：**如果Neutron租户采用该网络，只有同一个计算节点的虚拟机才能通讯，仅主机模式，一般不采用

**Flat：**扁平网络  不采用VLAN隔离的网络

云主机之间不走192.168.100.0/24，减少网络压力

单独使用一个网络来走云主机通讯网络

VLAN： 带vlan tag的网络

VXLAN,GRE等： 隧道网络

## 五、云主机跨主机实现互访

给Controller、Compute01和Compute02分别再添加一张仅主机网卡

控制节点：

```bash
[root@Controller network-scripts]# ip a
14: ens161: <BROADCAST,MULTICAST> mtu 1500 qdisc noop master ovs-system state DOWN group default qlen 1000
    link/ether 00:0c:29:0b:63:c0 brd ff:ff:ff:ff:ff:ff
[root@Controller network-scripts]# vim ifcfg-ens161
TYPE=Ethernet
NAME=ens161
DEVICE=ens161
ONBOOT=yes
HWADDR=00:0c:29:0b:63:c0
[root@Controller ~]# systemctl restart network
[root@Controller ~]# ovs-vsctl add-br br-eth1
[root@Controller ~]# ovs-vsctl add-port br-eth1 ens161
[root@Controller ~]# ovs-vsctl show
...
    Bridge br-eth1
        Port br-eth1
            Interface br-eth1
                type: internal
        Port ens161
            Interface ens161
...
```

分别在两个计算节点上

```bash
# Compute01
[root@Compute01 network-scripts]# ip a
3: ens161: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:0c:29:fa:35:77 brd ff:ff:ff:ff:ff:ff
    inet6 fe80::20c:29ff:fefa:3577/64 scope link
       valid_lft forever preferred_lft forever
[root@Compute01 network-scripts]# vim ifcfg-ens161
TYPE=Ethernet
NAME=ens161
DEVICE=ens161
ONBOOT=yes
HWADDR=00:0c:29:fa:35:77
[root@Compute01 ~]# nmcli con reload
[root@Compute01 ~]# nmcli con down ens161;nmcli con up ens161
Connection 'ens161' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/2)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/4)
[root@Compute01 ~]# ovs-vsctl add-br br-eth1
[root@Compute01 ~]# ovs-vsctl add-port br-eth1 ens161
[root@Compute01 network-scripts]# vim ifcfg-ens161
...
    Bridge br-eth1
        Port br-eth1
            Interface br-eth1
                type: internal
        Port ens161
            Interface ens161
...

# Compute02
[root@Compute02 network-scripts]# ip a
3: ens161: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:0c:29:f4:89:20 brd ff:ff:ff:ff:ff:ff
    inet6 fe80::20c:29ff:fef4:8920/64 scope link
       valid_lft forever preferred_lft forever
[root@Compute02 network-scripts]# vim ifcfg-ens161
TYPE=Ethernet
NAME=ens161
DEVICE=ens161
ONBOOT=yes
HWADDR=00:0c:29:f4:89:20
[root@Compute02 network-scripts]# nmcli con reload
[root@Compute02 network-scripts]# nmcli con down ens161;nmcli con up ens161
Connection 'ens161' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/2)
Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/4)
[root@Compute02 network-scripts]# ovs-vsctl add-br br-eth1
[root@Compute02 network-scripts]# ovs-vsctl add-port br-eth1 ens161
[root@Compute02 network-scripts]# ovs-vsctl show
...
    Bridge br-eth1
        Port br-eth1
            Interface br-eth1
                type: internal
        Port ens161
            Interface ens161
...
```

在控制节点上：

```bash
[root@Controller plugins]# cd /etc/neutron/plugins/ml2/
[root@Controller ml2]# ls
ml2_conf.ini  openvswitch_agent.ini  sriov_agent.ini
[root@Controller ml2]# vim ml2_conf.ini
[ml2]
type_drivers=geneve,flat,vlan,vxlan
tenant_network_types=flat
mechanism_drivers=openvswitch
path_mtu=0
extension_drivers=port_security,qos
[ml2_type_flat]
flat_networks=extnet,default
[root@Controller ml2]# vim openvswitch_agent.ini
[ovs]
bridge_mappings =extnet:br-ex,default:br-eth1
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.10
[root@Controller ~]# systemctl restart neutron-server.service neutron-openvswitch-agent.service
```

计算节点：

```bash
[root@Compute01 ~]# vim /etc/neutron/plugins/ml2/openvswitch_agent.ini
[ovs]
bridge_mappings=default:br-eth1
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.11
[root@Compute01 ~]# systemctl restart neutron-openvswitch-agent.service
[root@Compute02 ~]# vim /etc/neutron/plugins/ml2/openvswitch_agent.ini
[ovs]
bridge_mappings=default:br-eth1
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.12
[root@Compute02 ~]# systemctl restart neutron-openvswitch-agent.service
```

使用admin身份创建网络

![image-20261007005527392](/images/neutron-image-20261007005527392.png)

![image-20261007005712017](/images/neutron-image-20261007005712017.png)

![image-20261007005812037](/images/neutron-image-20261007005812037.png)

使用zlm用户身份创建两台云主机，测试是否可以互访

![image-20261007171622217](/images/neutron-image-20261007171622217.png)

![image-20261007171756091](/images/neutron-image-20261007171756091.png)

![image-20261007172844790](/images/neutron-image-20261007172844790.png)



![image-20261007165554143](/images/neutron-image-20261007165554143.png)
