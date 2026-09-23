---
title: "Monitoring Server Information with Zabbix"
date: 2026-09-23T13:21:00+08:00
draft: false
categories: ["Zabbix", "Monitoring & Ops"]
tags: ["Zabbix", "monitoring", "zabbix-agent", "monitoring-config"]
summary: "How to deploy the Zabbix agent on a target server (web02, 11.0.1.8), point it at the Zabbix server, and start monitoring it from the Zabbix web UI."
---

## 1. Install the zabbix-agent Client — Prepare a Server (11.0.1.8)

```bash
Configure the repository:
[root@web02 ~]#  rpm -Uvh https://repo.zabbix.com/zabbix/5.0/rhel/7/x86_64/zabbix-release-5.0-1.el7.noarch.rpm
Sync the yum repositories from the server to the client:
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl.repo
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl-rh.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl-rh.repo
[root@zabbix ~]#scp /etc/yum.repos.d/zabbix.repo  root@172.16.1.8:/etc/yum.repos.d/zabbix.repo
If the installation reports a package conflict:
[root@web02 ~]# yum -y install centos-release-scl
```

## 2. Configure the zabbix-agent with the Server Info and Start It

```bash
[root@web02 ~]# yum -y install zabbix-agent
[root@web02 ~]# vim /etc/zabbix/zabbix_agentd.conf 
Server=172.16.1.71
ServerActive=172.16.1.71
Hostname=web02
[root@web02 ~]# systemctl enable zabbix-agent --now
```

## 3. Monitor web02 from Zabbix

![](/images/p9_img63.png)

![](/images/p10_img68.png)

![](/images/p10_img70.png)

## 4. web02 Monitoring Setup Complete

![](/images/p11_img75.png)
