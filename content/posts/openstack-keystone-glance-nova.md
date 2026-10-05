---
title: "OpenStack 核心服务详解：Keystone 认证、Nova 计算与 Glance/Swift 镜像存储"
date: 2026-10-05T00:21:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "Keystone", "Glance", "Nova", "Endpoint", "镜像服务"]
summary: "梳理 OpenStack 三大核心服务：Keystone 的多域支持、service/endpoint 注册与策略文件权限控制；Nova 各模块（api/scheduler/conductor/compute/novncproxy）、消息队列与差分盘机制；Glance 镜像服务及改用 Swift 对象存储作为后端。"
---

# keystone服务

OpenStack多域支持

```bash
[root@Controller ~]# vim /etc/openstack-dashboard/local_settings
OPENSTACK_KEYSTONE_MULTIDOMAIN_SUPPORT = True
```

![image-20261004230313993](/images/openstack-kgn/image-20261004230313993.png)

列出系统中所有服务

```bash
[root@Controller ~(keystone_admin)]# openstack service list
```

keystone地址 API接口

```text
OS_AUTH_URL=http://192.168.100.10:5000/v3
```

![](/images/openstack-kgn/img-03.png)

1. 所有的服务都知道keystone地址，因为需要向keystone去检验用户token是否有效
2. keystone知道所有的服务地址是多少，所有的服务在创建时都向keystone进行注册

endpoint地址

```bash
[root@Controller ~(keystone_admin)]# openstack endpoint list
```

每个服务都会有三个endpoint地址，这三个URL地址可以相同，也可以不相同

public url  外网用户访问URL地址

admin url ： 管理员访问URL地址

internel url：内部组件间访问URL地址

**创建云主机流程**

1. 用户向keystone发送请求，输入用户名和密码，keystone认证成功后，给用户发放Token，用户使用Token向nova-api发送创建云主机请求
2. nova-api向keystone寻求帮助，帮我校验该Token是否有效，返回结果，如果成功
3. nova-api将请求发送给nova-compute主机
4. nova-compute主机根据用户请求信息，创建云主机，并返回给nova-api
5. nova-api将结果返回给用户，云主机创建完成，该主机的信息记录在数据库中

我向nova-api发送创建主机的请求，我是不知道nova-api地址的，但是我知道keystone地址，我向keystone去查询nova-api地址，keystone存储了所有服务的endpoint地址，所以，我只需要知道keystone的地址即可，以下是如何查询keystone地址和通过keystone去查其他地址的方法

```bash
[root@Controller ~(keystone_zlm)]# grep -E "^connection\s*=.*keystone" /etc/keystone/*.conf
/etc/keystone/keystone.conf:connection=mysql+pymysql://keystone_admin:c3fa63522e1f4586@192.168.100.10/keystone
# 用户名：keystone_admin 
# 密码：c3fa63522e1f4586
[root@Controller ~(keystone_zlm)]# mysql -u keystone_admin  -p -D keystone
Enter password:
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 15494
Server version: 10.3.27-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [keystone]> SELECT s.type AS service_type,
    ->        e.interface,
    ->        e.url
    -> FROM endpoint e
    -> JOIN service s ON e.service_id = s.id
    -> ORDER BY s.type, e.interface;
+----------------+-----------+--------------------------------------------------+
| service_type   | interface | url                                              |
+----------------+-----------+--------------------------------------------------+
| alarming       | admin     | http://192.168.100.10:8042                       |
| alarming       | internal  | http://192.168.100.10:8042                       |
| alarming       | public    | http://192.168.100.10:8042                       |
| cloudformation | admin     | http://192.168.100.10:8000/v1                    |
| cloudformation | internal  | http://192.168.100.10:8000/v1                    |
| cloudformation | public    | http://192.168.100.10:8000/v1                    |
| compute        | admin     | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| compute        | internal  | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| compute        | public    | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| identity       | admin     | http://192.168.100.10:5000                       |
| identity       | internal  | http://192.168.100.10:5000                       |
| identity       | public    | http://192.168.100.10:5000                       |
| image          | admin     | http://192.168.100.10:9292                       |
| image          | internal  | http://192.168.100.10:9292                       |
| image          | public    | http://192.168.100.10:9292                       |
| metering       | admin     | http://192.168.100.10:8777                       |
| metering       | internal  | http://192.168.100.10:8777                       |
| metering       | public    | http://192.168.100.10:8777                       |
| metric         | admin     | http://192.168.100.10:8041                       |
| metric         | internal  | http://192.168.100.10:8041                       |
| metric         | public    | http://192.168.100.10:8041                       |
| network        | admin     | http://192.168.100.10:9696                       |
| network        | internal  | http://192.168.100.10:9696                       |
| network        | public    | http://192.168.100.10:9696                       |
| object-store   | admin     | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| object-store   | internal  | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| object-store   | public    | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| orchestration  | admin     | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| orchestration  | internal  | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| orchestration  | public    | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| placement      | admin     | http://192.168.100.10:8778/placement             |
| placement      | internal  | http://192.168.100.10:8778/placement             |
| placement      | public    | http://192.168.100.10:8778/placement             |
| volumev2       | admin     | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev2       | internal  | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev2       | public    | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev3       | admin     | http://192.168.100.10:8776/v3/%(tenant_id)s      |
| volumev3       | internal  | http://192.168.100.10:8776/v3/%(tenant_id)s      |
| volumev3       | public    | http://192.168.100.10:8776/v3/%(tenant_id)s      |
+----------------+-----------+--------------------------------------------------+
39 rows in set (0.001 sec)

MariaDB [keystone]> SELECT s.type AS service_type,
    ->        e.interface,
    ->        e.url
    -> FROM endpoint e
    -> JOIN service s ON e.service_id = s.id
    -> WHERE e.interface = 'public'
    -> ORDER BY s.type;
+----------------+-----------+--------------------------------------------------+
| service_type   | interface | url                                              |
+----------------+-----------+--------------------------------------------------+
| alarming       | public    | http://192.168.100.10:8042                       |
| cloudformation | public    | http://192.168.100.10:8000/v1                    |
| compute        | public    | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| identity       | public    | http://192.168.100.10:5000                       |
| image          | public    | http://192.168.100.10:9292                       |
| metering       | public    | http://192.168.100.10:8777                       |
| metric         | public    | http://192.168.100.10:8041                       |
| network        | public    | http://192.168.100.10:9696                       |
| object-store   | public    | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| orchestration  | public    | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| placement      | public    | http://192.168.100.10:8778/placement             |
| volumev2       | public    | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev3       | public    | http://192.168.100.10:8776/v3/%(tenant_id)s      |
+----------------+-----------+--------------------------------------------------+
13 rows in set (0.000 sec)

MariaDB [keystone]>
```

部署openstack时，创建service

1. 进入数据库，创建database，比如glance
2. 创建数据库用户glance，设置glance用户对glance数据库中的所有的表有ALL（增删改查）权限
3. 创建glance service，并将glance-api地址注册到数据库中 endpoint地址

当用户需要访问glance-api时，会去向keystone发送请求，通过keystone 数据库查询到glance api endpoint地址

```bash
#示例 如果将zlm用户加入admin角色，那他就拥有了admin角色权限
[root@Controller ~(keystone_admin)]# openstack role add --user zlm --project LMandMY_HOME admin
```

用户向nova-api发送请求，nova-api向keystone校验用户身份，Token是否在有效期，并不会判断用户是否有权限创建云主机，用户是否有权限跟每个服务的策略文件有关

```bash
[root@Controller nova]# cd /etc/openstack-dashboard/
[root@Controller openstack-dashboard]# ls
cinder_policy.json  keystone_policy.json  neutron_policy.json  nova_policy.json
glance_policy.json  local_settings        nova_policy.d
[root@Controller nova(keystone_user)]# cp /etc/openstack-dashboard/glance_policy.json /etc/glance/policy.json
[root@Controller nova(keystone_user)]# openstack image create --container-format bare
--disk-format qcow2 --file /root/cirros-0.3.5-x86_64-disk.img --public    test2
[root@Controller nova(keystone_user)]# chgrp glance /etc/glance/policy.json
[root@Controller nova(keystone_user)]# systemctl restart openstack-glance-api.service
```

# nova服务

Controller节点

nova-api 模块

nova-scheduler 模块

nova-conductor 模块

nova-novncproxy模块

计算节点

nova-compute模块

**nova-api**

对外提供rest接口的处理

对传入的参数进行合法性校验和约束限制

对请求的资源进行配额（quota）的校验和预留

资源的创建，更新，删除查询等

虚拟机生命周期的入口

可水平扩展部署

**nova-conductor**

解耦 (nova-compute)对数据库直接访问，当用户申请创建云主机，创建成功后，将由nova-conductor模块将云主机信息写入到数据库中

database： 存放跟该组件相关的信息，比如云主机信息，比如镜像信息，比如网络信息

**nova-scheduler**

当openstack环境中有多台Compute计算节点时，用户创建云主机，nova-scheduler模块会根据每台compute主机的权重来决定该云主机运行在哪台计算节点上

HAProxy提供负载均衡，当用户要访问nova-api时，会将请求丢给HAProxy，该负载均衡软件根据各个nova-api的负载情况，决定将请求发送给哪个API节点

![](/images/openstack-kgn/img-01.png)

MQ： Message Queue 消息队列

当一个组件有多个模块时，模块与模块之间的访问，需要经过消息队列来进行拥塞控制等

如果有1000个用户将请求发送给nova-api

nova-api会将请求发送给nova-compute

nova-api 会将这1000个请求发送给消息队列，消息队列会根据每个compute主机的消息消费情况，处理进度，有序的将这些消息发送给nova-compute节点来处理

**nova-compute**

真正用来运行虚拟机的模块

**nova-novncproxy**

工作原理： nova-compute主机会为每个运行的虚拟机开启一个VNC Server端口

nova-compute主机不能对外暴露该端口，否则会导致Internet主机都可以访问该端口和虚拟机

为了解决该问题，在控制节点上开启一个nova-novncproxy服务对外提供，当用户访问该虚拟机控制台，会先将请求发送给nova-novncproxy，根据用户提供的信息（虚拟机UUID，Token等）查询到该虚拟机运行在哪台nova-compute上，将请求发送给运行了该虚拟机的Compute主机

通过VNC打开虚拟机工作原理

vncserver: 5900端口

vncviewer:  vncviewer

客户端不需要安装vncviewer，而是将该功能集成在浏览器html中，novnc协议

# **glance和swift服务**

一、部署云主机：

当用户发送一个部署云主机的指令后，验证通过，nova-compute主机会从glance镜像服务器下载镜像到本地（云主机部署在本地），/var/lib/nova/instances/_base/

云主机开机后，会产生一个差分盘，当新写入数据时，会将新数据写入到差分盘中

![](/images/openstack-kgn/img-04.png)

实验： 将glance镜像存放到swift对象存储中，而不是存放在glance本地硬盘

```bash
[root@Controller ~]# cd /etc/glance/
[root@Controller glance]# cp glance-api.conf glance-api.conf.bak
[root@Controller ~]# vim /etc/glance/glance-api.conf
3057 stores=file,http,swift
3111 default_store=swift
3982 swift_store_region = RegionOne
4032 swift_store_endpoint_type = publicURL
4090 swift_store_container = public
4118 swift_store_large_object_size = 5120
4142 swift_store_large_object_chunk_size = 100
4160 swift_store_create_container_on_put = True
4182 swift_store_multi_tenant = True
4230 swift_store_admin_tenants = services
4382 swift_store_auth_version = 2
4391 swift_store_auth_address = http://192.168.100.10:5000/v3
4399 swift_store_user = zlm
4408 swift_store_key = 000000
[root@Controller ~]# systemctl restart openstack-glance-api.service
```

备注： zlm用户添加swiftOperation角色才允许对swift有操作权限

![image-20261005001440979](/images/openstack-kgn/image-20261005001440979.png)
