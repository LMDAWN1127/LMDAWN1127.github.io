---
title: "Zabbix 自定义监控"
date: 2026-09-23T18:30:00+08:00
draft: false
categories: ["Zabbix", "监控运维"]
tags: ["Zabbix", "自定义监控", "UserParameter", "触发器", "值映射"]
summary: "Zabbix 自定义监控实战：用 UserParameter 采集登录用户数/内存可用百分比等自定义指标，通过 zabbix_get 验证，在 Web 页面添加监控项、值映射、触发器（含多条件触发器）实现自定义告警。"
---

## 1. 获取系统的登录用户数

```bash
[root@web02 ~]#w
 17:44:18 up  1:17,  2 users,  load average: 0.01, 0.02, 0.05
USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
root     pts/0    11.0.1.1         16:31   11:46   0.07s  0.07s -bash
root     pts/1    11.0.1.52        17:07    2.00s  0.04s  0.00s w
[root@web02 ~]#w|awk 'NR==1{print $4}'
2
```

## 2. 定义为 zabbix 的监控项

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf 
UserParameter=login_number,w|awk 'NR==1{print $4}'
# 查看监控项 zabbix_agentd -p 有语法检测功能
[root@web02 ~]#zabbix_agentd -p|grep login_number
login_number                                  [t|2]
# 重启客户端
[root@web02 ~]# systemctl restart zabbix-agent.service
```

## 3. 使用 zabbix 服务器端进行采集监控

服务端通过命令行测试是否通过监控项来获取用户自定义的值

```bash
# 安装 zabbix-get 命令
[root@zabbix ~]# yum -y install zabbix-get
[root@zabbix ~]#zabbix_get -s 172.16.1.8 -k login_number
2
```

在 Web 页面添加监控项

![](/images/p13_img93.png)

![](/images/p13_img94.png)

![](/images/p14_img101.png)

查看监控项

![](/images/p15_img104.png)

![](/images/p15_img106.png)

## 4. 监控 TCP 22 端口是否存活

键值在选择中选取需要监控的信息

检查 TCP 端口是否处于侦听状态。返回 0 - 未侦听；1 - 正在侦听

![](/images/p16_img111.png)

![](/images/p16_img113.png)

停止 web02 sshd 服务

```bash
[root@web02 ~]# systemctl stop sshd
```

![](/images/p16_img114.png)

## 5. 自定义配置展示值映射

![](/images/p17_img119.png)

![](/images/p17_img120.png)

![](/images/p18_img124.png)

调用值映射

![](/images/p18_img126.png)

![](/images/p19_img129.png)

## 6. 自定义监控服务器内存百分比

第一步：自定义监控项，获取可用百分比

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf
UserParameter=login_number,w|awk 'NR==1{print $4}'
UserParameter=mem_free,free|awk 'NR==2{print $NF/$2*100}'
[root@web02 ~]# systemctl restart zabbix-agent.service 
[root@web02 ~]#zabbix_agentd -p|grep mem_free
mem_free                                      [t|79.8753]
```

第二步：服务端测试获取 key 值并添加监控

```bash
[root@zabbix ~]#zabbix_get -s 172.16.1.8 -k mem_free
79.9775
```

![](/images/p20_img135.png)

![](/images/p20_img136.png)

## 7. 为可用内存设置触发器

当内存可用百分比小于 20% 则触发报警规则

![](/images/p20_img139.png)

![](/images/p21_img144.png)

![](/images/p21_img145.png)

![](/images/p22_img148.png)

测试：关闭 swap 分区

```bash
[root@web02 ~]# swapoff  -a
```

使用 dd 压测消耗内存

```bash
[root@web02 ~]# dd if=/dev/zero of=/dev/null bs=1200M count=2048
```

![](/images/p23_img152.png)

## 8. 配置多条件触发器

同时满足两个条件触发告警

添加 swap 可用百分比

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf
UserParameter=login_number,w|awk 'NR==1{print $4}'
UserParameter=mem_free,free|awk 'NR==2{print $NF/$2*100}'
UserParameter=swap_free,free -m|awk 'NR==3{print $3/$2*100}'
```

![](/images/p24_img158.png)

![](/images/p24_img160.png)

修改触发器配置

![](/images/p25_img163.png)

完成后在使用 dd 压测查看结果
