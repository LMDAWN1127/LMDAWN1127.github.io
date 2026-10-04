---
title: "OpenStack发放云主机"
date: 2026-10-04T21:50:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "云主机", "Horizon", "Neutron", "Nova", "命令行"]
summary: "从图形化界面到命令行，完整演示 OpenStack 发放云主机的全流程：租户/用户/镜像/规格/网络/路由器/安全组/密钥对/浮动IP 的创建与删除，并附 iptables SNAT/DNAT 与 Nova cell_v2 discover_hosts 排查要点。"
---

## 一、图形化界面发放云主机

admin用户是云超级管理员

admin管理身份

![image-20261004133254743](/images/openstack-launch/image-20261004133254743.png)

一、创建租户 tenant  project 项

![image-20261004133333694](/images/openstack-launch/image-20261004133333694.png)

二、创建用户，关联项目

![image-20261004133444084](/images/openstack-launch/image-20261004133444084.png)

![image-20261004133543426](/images/openstack-launch/image-20261004133543426.png)

三、上传镜像 管理员上传镜像是可以设置为公共镜像，所有租户可以访问，用户自行上传镜像是私有镜像，只能在租户内共享

![image-20261004133840621](/images/openstack-launch/image-20261004133840621.png)

四、创建规格

![image-20261004133940119](/images/openstack-launch/image-20261004133940119.png)

五、创建外部网络

![image-20261004180757779](/images/openstack-launch/image-20261004180757779.png)

![image-20261004181355263](/images/openstack-launch/image-20261004181355263.png)

![image-20261004181528225](/images/openstack-launch/image-20261004181528225.png)

L3 Agent部署在哪里哪个节点就是**网络节点**

![](/images/openstack-launch/img-02.png)

租户身份登录

一、使用租户身份登录

![image-20261004140319831](/images/openstack-launch/image-20261004140319831.png)

二、创建私有网络和子网 VPC

![image-20261004140615180](/images/openstack-launch/image-20261004140615180.png)

![image-20261004181925830](/images/openstack-launch/image-20261004181925830.png)

![image-20261004140927338](/images/openstack-launch/image-20261004140927338.png)

三、创建路由器，关联外部网络和私有网络

![image-20261004143700506](/images/openstack-launch/image-20261004143700506.png)

![image-20261004182358026](/images/openstack-launch/image-20261004182358026.png)

![image-20261004194243028](/images/openstack-launch/image-20261004194243028.png)

![image-20261004183707764](/images/openstack-launch/image-20261004183707764.png)

四、创建安全组和策略

![image-20261004182721297](/images/openstack-launch/image-20261004182721297.png)

五、创建秘钥对

![image-20261004182823825](/images/openstack-launch/image-20261004182823825.png)

六、发放云主机并且绑定浮动IP

![image-20261004183111306](/images/openstack-launch/image-20261004183111306.png)

![image-20261004183150078](/images/openstack-launch/image-20261004183150078.png)

![image-20261004183251232](/images/openstack-launch/image-20261004183251232.png)

![image-20261004194719509](/images/openstack-launch/image-20261004194719509.png)

七、测试（登录，主机名，网络）

cloud-init 初始化自定义信息  主机名  密码等

![image-20261004201528038](/images/openstack-launch/image-20261004201528038.png)

假如我创建了一个镜像，这个镜像内容特别多，大概占用了20G硬盘，需要4G内存才能更流畅的运行，但租户不知道啊，他发放云主机时，选择了10G硬盘，2G内存的规格，导致发放失败，但租户不知道什么原因，所以此时我在上传镜像时，指定硬盘最少20G，内存至少4G，将来选择规格时，如果规格小于这个，则不能选择，只能选择满足该条件的规则才行。

以下是OpenStack Nova 中用于**发现并将新加入的计算节点映射到其所属 Cell 数据库**的关键命令，在 Cells v2 架构下，每个计算节点必须经过此步骤完成注册，否则调度器无法在其上部署实例，API 也不会列出该主机

```bash
[root@Controller ~(keystone_admin)]# nova-manage cell_v2 discover_hosts --verbose
```



发放云主机可以通过路由器访问Internet，那配置弹性IP的意义是可以对外提供服务，web服务器，可以通过SNAT出去访问，但远程用户不能进来访问该服务，以下是查看OpenStack底层使用iptables的策略

```bash
[root@Controller ~(keystone_admin)]# ip netns
qrouter-aa6470e8-9c0e-4a50-9be6-71566d0c3903 (id: 1)
qdhcp-a82a6d9e-26ec-497f-8f71-68d8395386ad (id: 0)
[root@Controller ~(keystone_admin)]# ip netns exec qrouter-aa6470e8-9c0e-4a50-9be6-71566d0c3903 ip addr list
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
33: qg-d9305000-ef: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UNKNOWN group default qlen 1000
    link/ether fa:16:3e:18:37:69 brd ff:ff:ff:ff:ff:ff
    inet 192.168.10.106/24 brd 192.168.10.255 scope global qg-d9305000-ef
       valid_lft forever preferred_lft forever
    inet 192.168.10.182/32 brd 192.168.10.182 scope global qg-d9305000-ef
       valid_lft forever preferred_lft forever
    inet6 fe80::f816:3eff:fe18:3769/64 scope link
       valid_lft forever preferred_lft forever
34: qr-eb02e78e-a3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN group default qlen 1000
    link/ether fa:16:3e:18:b8:5f brd ff:ff:ff:ff:ff:ff
    inet 192.168.20.254/24 brd 192.168.20.255 scope global qr-eb02e78e-a3
       valid_lft forever preferred_lft forever
    inet6 fe80::f816:3eff:fe18:b85f/64 scope link
       valid_lft forever preferred_lft forever
[root@Controller ~(keystone_admin)]# ip netns exec qrouter-aa6470e8-9c0e-4a50-9be6-71566d0c3903 iptables -t nat -nL
Chain PREROUTING (policy ACCEPT)
target     prot opt source               destination
neutron-l3-agent-PREROUTING  all  --  0.0.0.0/0            0.0.0.0/0

Chain INPUT (policy ACCEPT)
target     prot opt source               destination

Chain POSTROUTING (policy ACCEPT)
target     prot opt source               destination
neutron-l3-agent-POSTROUTING  all  --  0.0.0.0/0            0.0.0.0/0
neutron-postrouting-bottom  all  --  0.0.0.0/0            0.0.0.0/0

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
neutron-l3-agent-OUTPUT  all  --  0.0.0.0/0            0.0.0.0/0

Chain neutron-l3-agent-OUTPUT (1 references)
target     prot opt source               destination
DNAT       all  --  0.0.0.0/0            192.168.10.182       to:192.168.20.197

Chain neutron-l3-agent-POSTROUTING (1 references)
target     prot opt source               destination
ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            ! ctstate DNAT

Chain neutron-l3-agent-PREROUTING (1 references)
target     prot opt source               destination
REDIRECT   tcp  --  0.0.0.0/0            169.254.169.254      tcp dpt:80 redir ports 9697
DNAT       all  --  0.0.0.0/0            192.168.10.182       to:192.168.20.197

Chain neutron-l3-agent-float-snat (1 references)
target     prot opt source               destination
SNAT       all  --  192.168.20.197       0.0.0.0/0            to:192.168.10.182 random-fully

Chain neutron-l3-agent-snat (1 references)
target     prot opt source               destination
neutron-l3-agent-float-snat  all  --  0.0.0.0/0            0.0.0.0/0
SNAT       all  --  0.0.0.0/0            0.0.0.0/0            to:192.168.10.106 random-fully
SNAT       all  --  0.0.0.0/0            0.0.0.0/0            mark match ! 0x2/0xffff ctstate DNAT to:192.168.10.106 random-fully

Chain neutron-postrouting-bottom (1 references)
target     prot opt source               destination
neutron-l3-agent-snat  all  --  0.0.0.0/0            0.0.0.0/0            /* Perform source NAT on outgoing traffic. */
```



实验需求：创建一台云主机，可以访问Internet，yum源指向阿里云，并且安装httpd软件包，启动服务，从外部主机访问该web页面http://192.168.10.182

![image-20261004202716013](/images/openstack-launch/image-20261004202716013.png)

Compute主机本质上是一台KVM宿主机，在openstack中发放云主机，会通过调度程序将云主机分发到某一台Compute主机上

![image-20261004210535149](/images/openstack-launch/image-20261004210535149.png)



## 二、命令行界面发放云主机

```bash
[root@Controller ~(keystone_admin)]# cp keystonerc_admin keystonerc_zlm
```

### 需求一：使用命令行删除所有的资源

```bash
[root@Controller ~(keystone_zlm)]# cat keystonerc_zlm
unset OS_SERVICE_TOKEN
export OS_USERNAME=zlm
export OS_PASSWORD='000000'
export OS_REGION_NAME=RegionOne
export OS_AUTH_URL=http://192.168.100.10:5000/v3
export PS1='[\u@\h \W(keystone_zlm)]\$ '
export OS_PROJECT_NAME=LMandMY_HOME
export OS_USER_DOMAIN_NAME=Default
export OS_PROJECT_DOMAIN_NAME=Default
export OS_IDENTITY_API_VERSION=3
[root@Controller ~(keystone_zlm)]# source keystonerc_zlm
```

1. 删除云主机

```bash
[root@Controller ~(keystone_zlm)]# openstack server list
+--------------------------------------+------+--------+--------------------------------------+------------------+--------+
| ID                                   | Name | Status | Networks                             | Image            | Flavor |
+--------------------------------------+------+--------+--------------------------------------+------------------+--------+
| 44f0fa66-94ed-44ac-a9ae-0a3a13c1faba | web  | ACTIVE | VPC01=192.168.20.197, 192.168.10.182 | CentOS 8.4 64bit | m3.web |
+--------------------------------------+------+--------+--------------------------------------+------------------+--------+
[root@Controller ~(keystone_zlm)]# openstack server delete 44f0fa66-94ed-44ac-a9ae-0a3a13c1faba
```

2. 删除卷

```bash
[root@Controller ~(keystone_zlm)]# openstack volume list
[root@Controller ~(keystone_zlm)]# openstack volume delete data01
```

3. 删除路由器

```bash
[root@Controller ~(keystone_zlm)]# openstack router list
[root@Controller ~(keystone_zlm)]# openstack router show router01
[root@Controller ~(keystone_zlm)]# openstack subnet list
[root@Controller ~(keystone_zlm)]# openstack router remove subnet router01  subnet01
[root@Controller ~(keystone_zlm)]# openstack router delete router01
```

4. 删除安全组

```bash
[root@Controller ~(keystone_zlm)]# openstack security group list
[root@Controller ~(keystone_zlm)]# openstack security group delete SG01
```

5. 删除网络

```bash
[root@Controller ~(keystone_zlm)]# openstack network list
[root@Controller ~(keystone_zlm)]# openstack network delete VPC01
```

进入admin身份删除public网络，镜像，规格，租户，用户等

```bash
[root@Controller ~(keystone_zlm)]# source  keystonerc_admin
```

6. 删除public网络

```bash
[root@Controller ~(keystone_admin)]# openstack network list
[root@Controller ~(keystone_admin)]# openstack network delete public
```

7. 删除镜像

```bash
[root@Controller ~(keystone_admin)]# openstack image list
[root@Controller ~(keystone_admin)]# openstack image delete e3336d90-e673-4b1b-82ec-69b70fd6402c
[root@Controller ~(keystone_admin)]# openstack image delete cec813dd-8141-4a99-8883-805ac6e3ec17
[root@Controller ~(keystone_admin)]# openstack image delete c6ffe7db-ccb0-4df4-8715-e8ce0fd5dc7d
```

8. 删除规格

```bash
[root@Controller ~(keystone_admin)]# openstack flavor list
[root@Controller ~(keystone_admin)]# openstack flavor delete m3.web
```

9. 删除租户和用户

```bash
[root@Controller ~(keystone_admin)]# openstack project list
[root@Controller ~(keystone_admin)]# openstack project delete LMandMY_HOME
[root@Controller ~(keystone_admin)]# openstack user list
[root@Controller ~(keystone_admin)]# openstack user delete zlm
```

需求二：使用命令行创建所有的资源 发放云主机，添加弹性IP，访问云主机，创建网络

```bash
[root@Controller ~(keystone_admin)]# source keystonerc_admin
```

### 1. 创建项目，用户，将用户与项目关联

```bash
[root@Controller ~(keystone_admin)]# openstack project create LMandMY_HOME
[root@Controller ~(keystone_admin)]# openstack user create --project LMandMY_HOME --project-domain Default --password-prompt  zlm
[root@Controller ~(keystone_admin)]# openstack role list
+----------------------------------+------------------+
| ID                               | Name             |
+----------------------------------+------------------+
| 0adc17230a5a434195d5995863280b3d | heat_stack_owner |
| 2e5abdde67bb4f23bbf15454616af53e | ResellerAdmin    |
| 46d49fecd6f4411bbd72d0b9f575bcae | admin            |
| 5f5bf78c40b143bbb2df74fc855ea204 | reader           |
| 84ebb81407f644b18e1a529e0c317f16 | member           |
| b83f4c27c83445489554e988fb9af5a1 | heat_stack_user  |
| b8f8cd45891240bfa0f80e93f0e37ab9 | _member_         |
| ebc22a15458c4712bf0dd4f4de09e0bf | SwiftOperator    |
+----------------------------------+------------------+
[root@Controller ~(keystone_admin)]# openstack role add --user zlm --project LMandMY_HOME  b8f8cd45891240bfa0f80e93f0e37ab9
```

2. 上传镜像

```bash
[root@Controller ~(keystone_admin)]# openstack image create --file  /data/cirros-0.3.5-x86_64-disk.img --disk-format qcow2 --container-format bare   --public cirros
```

3. 创建规格

```bash
[root@Controller ~(keystone_admin)]# openstack flavor create --ram 1024 --disk 10  --public m3.web
```

4. 创建public网络和子网

```bash
[root@Controller ~(keystone_admin)]# openstack network create --external --share --provider-network-type flat --provider-physical-network extnet  --project LMandMY_HOME  public
```

创建子网

```bash
[root@Controller ~(keystone_admin)]# openstack subnet create --no-dhcp  --subnet-range 192.168.10.0/24 --allocation-pool start=192.168.10.100,end=192.168.10.200  --gateway 192.168.10.1 --network public publicsub01
```

进入租户身份

```bash
[root@Controller ~(keystone_admin)]# source  keystonerc_zlm
```

1. 创建网络和子网

```bash
[root@Controller ~(keystone_zlm)]# openstack network create VPC01
```

创建子网

```bash
[root@Controller ~(keystone_zlm)]# openstack subnet create --network VPC01  --subnet-range 192.168.20.0/24 --dhcp --gateway 192.168.20.254 --dns-nameserver 114.114.114.114 subnet01
```

2. 创建路由器

```bash
[root@Controller ~(keystone_zlm)]# openstack router create router01
[root@Controller ~(keystone_zlm)]# openstack router add subnet router01 subnet01
[root@Controller ~(keystone_zlm)]# openstack router set --external-gateway public router01
```

3. 创建安全组

```bash
[root@Controller ~(keystone_zlm)]# openstack security group create SG01
```

放行ICMP协议

```bash
[root@Controller ~(keystone_zlm)]# openstack security group rule create  --ingress  --protocol icmp  --remote-ip 0.0.0.0/0  SG01
```

放行ssh服务

```bash
[root@Controller ~(keystone_zlm)]# openstack security group rule create  --ingress  --protocol tcp --dst-port 22   --remote-ip 0.0.0.0/0  SG01
```

放行80端口

```bash
[root@Controller ~(keystone_zlm)]# openstack security group rule create  --ingress  --protocol tcp --dst-port 80   --remote-ip 0.0.0.0/0 SG01
```

4. 创建浮动IP

```bash
[root@Controller ~(keystone_zlm)]# openstack floating ip  create  public
```

5. 创建秘钥对

```bash
[root@Controller ~(keystone_zlm)]# openstack key create key01 > key01.pem
```

6. 创建云主机

```bash
[root@Controller ~(keystone_zlm)]# openstack network list
+--------------------------------------+--------+--------------------------------------+
| ID                                   | Name   | Subnets                              |
+--------------------------------------+--------+--------------------------------------+
| a82a6d9e-26ec-497f-8f71-68d8395386ad | VPC01  | 40bd75e0-3d22-4e7b-8659-8a6c0a44e3aa |
| d99ba601-05e3-4f1f-88b8-f0587c6a5f6e | public | 5d39db23-8359-4e33-bde7-0f9ac6a0f7c7 |
+--------------------------------------+--------+--------------------------------------+
[root@Controller ~(keystone_zlm)]# openstack server create --image cirros --security-group SG01 --key-name key01 --flavor m3.web  --nic net-id=a82a6d9e-26ec-497f-8f71-68d8395386ad web
```

将弹性IP关联给该云主机

```bash
[root@Controller ~(keystone_zlm)]# openstack port list
[root@Controller ~(keystone_zlm)]# openstack floating ip set --port=46ba21d5-6f14-4693-a215-5a6fc8781adf  192.168.10.182
```

访问云主机

```bash
[root@Controller ~(keystone_zlm)]# chmod 400 key01.pem
[root@Controller ~(keystone_zlm)]# ssh -i key01.pem cirros@192.168.10.182
```

如果外网网卡不能通讯

```bash
[root@Controller ~(keystone_zlm)]# ifup br-ex ; ifup ens224
```
