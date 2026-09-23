---
title: "Zabbix でサーバー情報を監視する"
date: 2026-09-23T13:21:00+08:00
draft: false
categories: ["Zabbix", "監視・運用"]
tags: ["Zabbix", "監視", "zabbix-agent", "監視設定"]
summary: "対象サーバー (web02, 11.0.1.8) に Zabbix エージェントを導入し、Zabbix サーバーへ紐づけて、Web UI から監視を開始する手順です。"
---

## 1. zabbix-agent クライアントをインストールする — サーバー (11.0.1.8) を用意

```bash
リポジトリを設定します：
[root@web02 ~]#  rpm -Uvh https://repo.zabbix.com/zabbix/5.0/rhel/7/x86_64/zabbix-release-5.0-1.el7.noarch.rpm
サーバー側の yum リポジトリをクライアントへ同期します：
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl.repo
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl-rh.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl-rh.repo
[root@zabbix ~]#scp /etc/yum.repos.d/zabbix.repo  root@172.16.1.8:/etc/yum.repos.d/zabbix.repo
インストール時にパッケージ競合が発生した場合：
[root@web02 ~]# yum -y install centos-release-scl
```

## 2. zabbix-agent にサーバー情報を設定し、起動する

```bash
[root@web02 ~]# yum -y install zabbix-agent
[root@web02 ~]# vim /etc/zabbix/zabbix_agentd.conf 
Server=172.16.1.71
ServerActive=172.16.1.71
Hostname=web02
[root@web02 ~]# systemctl enable zabbix-agent --now
```

## 3. Zabbix から web02 を監視する

![](/images/p9_img63.png)

![](/images/p10_img68.png)

![](/images/p10_img70.png)

## 4. web02 の監視設定完了

![](/images/p11_img75.png)
