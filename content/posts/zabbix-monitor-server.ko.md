---
title: "Zabbix로 서버 정보 모니터링하기"
date: 2026-09-23T13:21:00+08:00
draft: false
categories: ["Zabbix", "모니터링・운영"]
tags: ["Zabbix", "모니터링", "zabbix-agent", "모니터링설정"]
summary: "대상 서버(web02, 11.0.1.8)에 Zabbix 에이전트를 설치하고 Zabbix 서버에 연결한 뒤 웹 UI에서 모니터링을 시작하는 방법입니다."
---

## 1. zabbix-agent 클라이언트 설치 — 서버(11.0.1.8) 준비

```bash
저장소를 설정합니다:
[root@web02 ~]#  rpm -Uvh https://repo.zabbix.com/zabbix/5.0/rhel/7/x86_64/zabbix-release-5.0-1.el7.noarch.rpm
서버의 yum 저장소를 클라이언트로 동기화합니다:
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl.repo
[root@zabbix ~]#scp /etc/yum.repos.d/CentOS-SCLo-scl-rh.repo root@172.16.1.8:/etc/yum.repos.d/CentOS-SCLo-scl-rh.repo
[root@zabbix ~]#scp /etc/yum.repos.d/zabbix.repo  root@172.16.1.8:/etc/yum.repos.d/zabbix.repo
설치 시 패키지 충돌이 발생하면:
[root@web02 ~]# yum -y install centos-release-scl
```

## 2. zabbix-agent에 서버 정보를 설정하고 시작

```bash
[root@web02 ~]# yum -y install zabbix-agent
[root@web02 ~]# vim /etc/zabbix/zabbix_agentd.conf 
Server=172.16.1.71
ServerActive=172.16.1.71
Hostname=web02
[root@web02 ~]# systemctl enable zabbix-agent --now
```

## 3. Zabbix에서 web02 모니터링

![](/images/p9_img63.png)

![](/images/p10_img68.png)

![](/images/p10_img70.png)

## 4. web02 모니터링 설정 완료

![](/images/p11_img75.png)
