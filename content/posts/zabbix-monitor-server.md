---
title: "Zabbix 监控服务器信息"
date: 2026-09-23T13:21:00+08:00
draft: false
categories: ["Zabbix", "监控运维"]
tags: ["Zabbix", "监控", "zabbix-agent", "监控配置"]
---

## 1.安装zabbix-agent客户端 准备一台服务器11.0.1.8

```bash
配置仓库:
[root@web02 ~]#  rpm -Uvh https://repo.zabbix.com/zabbix/5.0/rhel/7/x86_64/zabbix-release-5.0-1.el7.noarch.rpm
将服务端和客户端的yum仓库同步:
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl.repo
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl-rh.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl-rh.repo
[root@zabbix ~]#scp /etc/yum.repos.d/zabbix.repo  root@172.16.1.8:/etc/yum.repos.d/zabbix.repo
如果安装提示软件冲突:
[root@web02 ~]# yum -y install centos-release-scl
```

## 2.配置zabbix客户端服务器信息 启动客户端

```bash
[root@web02 ~]# yum -y install zabbix-agent
[root@web02 ~]# vim /etc/zabbix/zabbix_agentd.conf 
Server=172.16.1.71
ServerActive=172.16.1.71
Hostname=web02
[root@web02 ~]# systemctl enable zabbix-agent --now
```

## 3.zabbix监控web02

![](/images/p9_img63.png)

![](/images/p10_img68.png)

![](/images/p10_img70.png)

## 4.web02服务器完成监控操作

![](/images/p11_img75.png)
