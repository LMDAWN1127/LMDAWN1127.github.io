---
title: "OpenStack Neutron 网络类型设计与实现：flat、VLAN 与 VXLAN"
date: 2026-10-07T19:45:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "Neutron", "VLAN", "VXLAN", "OVS"]
summary: "从 flat 到 VLAN 再到 VXLAN，逐步拆解 Neutron 三种网络类型的 ML2 与 OVS 配置、外部网络与路由器打通方式、OVS 流表转发分析，以及云主机通过 169.254.169.254 获取 metadata 的完整链路。"
---

## 一、flat网络设计

```bash
[root@Controller ~]# source keystonerc_admin
[root@Controller ~(keystone_admin)]# neutron agent-list
```

每台云主机每块网卡都有一个qbr，因为安全组是关联到网卡的，每块网卡关联不同的安全组

```bash
[root@Compute01 ~]# brctl show
bridge name	bridge id		STP enabled	interfaces
qbr24c7a169-96		8000.ceb36944e179	no		qvb24c7a169-96
tap24c7a169-96
```

QEMU虚拟化套件 + KVM虚拟化内核

```text
integration_bridge=br-int
```

![](/images/neutron-net-img-02.png)

```bash
[root@Compute01 ~]# ovs-vsctl show
```

让VM1（web01）可以访问Internet，或者与其他网段互通

1. 在网络节点上配置neutron

```bash
[root@Controller ~(keystone_admin)]# cd /etc/neutron/plugins/ml2/
[root@Controller ml2(keystone_admin)]# vim ml2_conf.ini
[ml2]
type_drivers=geneve,flat,vlan,vxlan
tenant_network_types=flat
mechanism_drivers=openvswitch
path_mtu=0
extension_drivers=port_security,qos
[securitygroup]
enable_security_group=True
[ml2_type_geneve]
max_header_size=38
vni_ranges=10:100
[ml2_type_flat]
flat_networks=default,extent
[root@Controller ml2(keystone_admin)]# vim openvswitch_agent.ini
[ovs]
bridge_mappings=default:br-eth1,extnet:br-ex
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.10
[root@Controller ~(keystone_admin)]# systemctl restart neutron-*
```

2. 在openstack web界面上，使用admin身份登录，在管理员菜单上，创建外部网络，选择flat，名称为extnet
3. 使用租户身份登录，创建路由器，关联外部网络和子网
4. 相关问题

**问题1：** 弹性IP地址是配置在哪里的？在哪里可以找到这个弹性IP地址

```bash
[root@Controller ~(keystone_admin)]# ip netns ls
qrouter-8e9ae372-905a-4ded-9ee4-e5d6f487e8f2 (id: 1)
qdhcp-7d04c8e1-3ccf-4efe-85c3-9370bfc6a88a (id: 0)
```

namespace 命名空间

```bash
[root@Controller ~(keystone_admin)]# ip netns exec qdhcp-7d04c8e1-3ccf-4efe-85c3-9370bfc6a88a ip addr list
[root@Controller ~(keystone_admin)]# ip netns exec qrouter-8e9ae372-905a-4ded-9ee4-e5d6f487e8f2 ip addr list
[root@Controller ~(keystone_admin)]# ip netns exec qrouter-8e9ae372-905a-4ded-9ee4-e5d6f487e8f2 route -n
[root@Controller ~(keystone_admin)]# ip netns exec qrouter-8e9ae372-905a-4ded-9ee4-e5d6f487e8f2 ping www.baidu.com
[root@Controller ~(keystone_admin)]# ip netns exec qrouter-8e9ae372-905a-4ded-9ee4-e5d6f487e8f2 ping 192.168.31.1
```

**问题2：** 弹性IP绑定在路由器上，那是如何通过弹性IP访问云主机的

```bash
[root@Controller ~(keystone_admin)]# ip netns exec qrouter-8e9ae372-905a-4ded-9ee4-e5d6f487e8f2 iptables -t nat -nL
#iptables -t nat -A PREROUTING -d 192.168.31.17 -j DNAT --to-dest 192.168.33.254
```

**问题3：** 如果云主机绑定了弹性IP地址，会优先通过弹性IP地址出去，如果没有绑定，会通过路由器开启SNAT出去访问

**VLAN 静态路由  NAT TCP三层握手**

弹性IP地址不一定是为访问Internet而准备的，而是为了访问服务，也可以把弹性IP地址绑定给ELB负载均衡

![image-20261007181923684](/images/neutron-net-image-20261007181923684.png)

flat网络拓扑图

![image-20261007182836070](/images/neutron-net-image-20261007182836070.png)

## 二、VLAN网络设计和实现

1. 配置网络节点和计算节点

```bash
[root@Controller ~]# cd /etc/neutron/plugins/ml2/
[root@Controller ml2]# vim ml2_conf.ini
[ml2]
type_drivers=geneve,flat,vlan,vxlan
tenant_network_types=vlan
mechanism_drivers=openvswitch
path_mtu=0
extension_drivers=port_security,qos
[ml2_type_flat]
flat_networks=default,extent
[ml2_type_vlan]
network_vlan_ranges=mynetwork:100:1000
[root@Controller ml2]# vim openvswitch_agent.ini
[ovs]
bridge_mappings=mynetwork:br-eth1,extnet:br-ex
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.10
[root@Controller ~]# systemctl restart neutron-*
```

计算节点

```bash
[root@Compute01 ~]# cd /etc/neutron/plugins/ml2/
[root@Compute01 ml2]# vim openvswitch_agent.ini
[ovs]
bridge_mappings=mynetwork:br-eth1
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.11
[root@Compute01 ~]# systemctl restart neutron-openvswitch-agent.service
[root@Compute02 ~]# cd /etc/neutron/plugins/ml2/
[root@Compute02 ml2]# vim openvswitch_agent.ini
[ovs]
bridge_mappings=mynetwork:br-eth1
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.12
[root@Compute02 ~]# systemctl restart neutron-openvswitch-agent.service
```

2. 在openstack web界面上，使用admin身份创建网络
3. 使用zlm身份创建两个云主机

查看

openstack  neutron流表

VLAN网络的流表分析

```bash
[root@Compute01 ~]# ovs-ofctl dump-flows br-eth1
```

priority=4  数字越大，优先级越高

```bash
cookie=0x28f07cbfb122feff, duration=1736.064s, table=0, n_packets=267, n_bytes=39412, priority=4,in_port="phy-br-eth1",dl_vlan=1 actions=mod_vlan_vid:100,NORMAL
[root@Compute01 ~]# ovs-ofctl dump-flows br-int
cookie=0xffd369a083b424eb, duration=2050.913s, table=0, n_packets=1241, n_bytes=236428, priority=3,in_port="int-br-eth1",dl_vlan=100 actions=mod_vlan_vid:1,resubmit(,60)
```

flat网络流表分析

```bash
[root@Compute01 ~]# ovs-ofctl dump-flows br-eth1
cookie=0x632acfea08b01b9d, duration=311.151s, table=0, n_packets=81, n_bytes=4210, priority=4,in_port="phy-br-eth1",dl_vlan=1 actions=strip_vlan,NORMAL cookie=0x632acfea08b01b9d, duration=326.012s, table=0, n_packets=4, n_bytes=352, priority=2,in_port="phy-br-eth1" actions=drop cookie=0x632acfea08b01b9d, duration=326.023s, table=0, n_packets=13485, n_bytes=6729360, priority=0 actions=NORMAL
```

![image-20261007182948942](/images/neutron-net-image-20261007182948942.png)

## 三、VXLAN的网络设计和实现

解决：**大二层问题**，跨数据中心云主机热迁移问题，热迁移只能在二层网络中

VXLAN实现将二层网络封装在三层中进行传输，到了对方解封装，实现二层通讯

1. 修改网络节点配置

```bash
[root@Controller ~]# vim /etc/neutron/plugins/ml2/ml2_conf.ini
[ml2]
type_drivers=geneve,flat,vlan,vxlan
tenant_network_types=vxlan
mechanism_drivers=openvswitch
path_mtu=0
extension_drivers=port_security,qos
[ml2_type_vxlan]
vxlan_group=224.0.0.1
vni_ranges=10:100
[root@Controller ~]# vim /etc/neutron/plugins/ml2/openvswitch_agent.ini
[ovs]
bridge_mappings=mynetwork:br-eth1,extnet:br-ex
integration_bridge=br-int
tunnel_bridge=br-tun
local_ip=192.168.100.10
[root@Controller ~]# systemctl restart neutron-server.service
```

2. 相关问题

Compute01： web111云主机  192.168.99.140

Compute02： web222云主机  192.168.99.14

**问题1：** web111可以ping通web222吗？

可以

![image-20261007183338288](/images/neutron-net-image-20261007183338288.png)

**问题2：** 192.168.88.126可以ping通192.168.99.0/24主机？

可以

**问题3：**云主机是如何获得metadata信息的？

metadata元数据

nova-metadata

neutron-metadata

1. 当云主机开机时，会运行cloud-init程序，cloud-init会通知云主机去访问http://169.254.169.254
2. 因为在云主机中有一条默认路由，route -n

169.254.169.254 192.168.99.254  255.255.255.255 UGH   100    0        0 ens3

从而将请求转发给网关，即VRouter，这个请求将进入网络节点

3. 网络节点收到这个请求后，将该请求转发给neutron-ns-proxy进程，这个进程通过内部接口转发给neutron-metadata-agent

```bash
[root@Controller ~]# ip netns ls
[root@Controller ~]# ip netns exec qrouter-d88a6264-ff05-498c-ab98-f56a261da0e0  iptables -t nat -nL
REDIRECT   tcp  --  0.0.0.0/0            169.254.169.254      tcp dpt:80 redir ports 9697
[root@Controller ~]# ip netns exec qrouter-d88a6264-ff05-498c-ab98-f56a261da0e0  netstat -tulnp
[root@Controller ~]# ps aux |grep proxy |grep neutron
neutron    52920  0.0  0.0 156032  2700 ?        Ss   14:37   0:00 haproxy -f /var/lib/neutron/ns-metadata-proxy/d88a6264-ff05-498c-ab98-f56a261da0e0.conf
```

4. 因为neutron网络节点与控制节点管理网络互通，当用户申请云主机时，会填写云主机名称，root密码，秘钥等信息，当用户输入这些信息时，将这些请求发送给controller节点nova-api，nova-api会转发给nova-metadata-api，因为网络节点和控制节点管理网络互通，所以neutron-metadata服务向nova-metadata-api服务请求用户自定义信息，从而让云主机得到这些信息。

云主机先得到IP地址，IP地址是从DHCP中获取的，跟metadata无关，当云主机得到IP地址时，才触发了以上流程

当用户申请云主机时，会输入云主机metadata数据（计算机名，root密码，ssh秘钥等），这个请求会发送nova-api，nova-api会将这些信息转发给nova-api-metadata进行存储

云主机创建完成后，开机，通过DHCP获取到IP地址，运行cloud-init，cloud-init根据配置文件，去请求http://169.254.169.254

当用户没有创建路由器时，无法得到用户的metadata信息



