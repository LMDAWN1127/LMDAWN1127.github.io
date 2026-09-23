---
title: "Custom Monitoring in Zabbix"
date: 2026-09-23T18:30:00+08:00
draft: false
categories: ["Zabbix", "Monitoring & Ops"]
tags: ["Zabbix", "custom-monitoring", "UserParameter", "trigger", "value-mapping"]
summary: "A hands-on Zabbix custom monitoring guide — collect custom metrics such as login user count and free-memory percentage with UserParameter, verify them via zabbix_get, then add items, value mappings, and triggers (including a multi-condition trigger) on the web UI for custom alerting."
---

## 1. Get the Number of Logged-in Users

```bash
[root@web02 ~]#w
 17:44:18 up  1:17,  2 users,  load average: 0.01, 0.02, 0.05
USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
root     pts/0    11.0.1.1         16:31   11:46   0.07s  0.07s -bash
root     pts/1    11.0.1.52        17:07    2.00s  0.04s  0.00s w
[root@web02 ~]#w|awk 'NR==1{print $4}'
2
```

## 2. Define It as a Zabbix Monitoring Item

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf 
UserParameter=login_number,w|awk 'NR==1{print $4}'
# zabbix_agentd -p can be used to check the item's syntax
[root@web02 ~]#zabbix_agentd -p|grep login_number
login_number                                  [t|2]
# restart the agent
[root@web02 ~]# systemctl restart zabbix-agent.service
```

## 3. Collect and Monitor from the Zabbix Server Side

From the server, use the command line to test whether the custom value can be fetched through the monitoring item.

```bash
# install the zabbix-get command
[root@zabbix ~]# yum -y install zabbix-get
[root@zabbix ~]#zabbix_get -s 172.16.1.8 -k login_number
2
```

Add the monitoring item on the web page

![](/images/p13_img93.png)

![](/images/p13_img94.png)

![](/images/p14_img101.png)

View the monitoring item

![](/images/p15_img104.png)

![](/images/p15_img106.png)

## 4. Monitor Whether TCP Port 22 Is Alive

Select the key value that matches the information you want to monitor.

Check whether the TCP port is in the LISTEN state. Returns 0 - not listening; 1 - listening.

![](/images/p16_img111.png)

![](/images/p16_img113.png)

Stop the sshd service on web02

```bash
[root@web02 ~]# systemctl stop sshd
```

![](/images/p16_img114.png)

## 5. Configure a Custom Value Mapping for Display

![](/images/p17_img119.png)

![](/images/p17_img120.png)

![](/images/p18_img124.png)

Apply the value mapping

![](/images/p18_img126.png)

![](/images/p19_img129.png)

## 6. Custom Monitoring of Server Memory Percentage

Step 1: Define a custom item to get the free-memory percentage

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf
UserParameter=login_number,w|awk 'NR==1{print $4}'
UserParameter=mem_free,free|awk 'NR==2{print $NF/$2*100}'
[root@web02 ~]# systemctl restart zabbix-agent.service 
[root@web02 ~]#zabbix_agentd -p|grep mem_free
mem_free                                      [t|79.8753]
```

Step 2: Test fetching the key value from the server and add the monitoring item

```bash
[root@zabbix ~]#zabbix_get -s 172.16.1.8 -k mem_free
79.9775
```

![](/images/p20_img135.png)

![](/images/p20_img136.png)

## 7. Set a Trigger for Available Memory

Trigger an alert when the available-memory percentage drops below 20%.

![](/images/p20_img139.png)

![](/images/p21_img144.png)

![](/images/p21_img145.png)

![](/images/p22_img148.png)

Test: turn off the swap partition

```bash
[root@web02 ~]# swapoff  -a
```

Use dd to stress-test and consume memory

```bash
[root@web02 ~]# dd if=/dev/zero of=/dev/null bs=1200M count=2048
```

![](/images/p23_img152.png)

## 8. Configure a Multi-condition Trigger

Trigger an alert only when both conditions are met simultaneously.

Add the swap-free percentage

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf
UserParameter=login_number,w|awk 'NR==1{print $4}'
UserParameter=mem_free,free|awk 'NR==2{print $NF/$2*100}'
UserParameter=swap_free,free -m|awk 'NR==3{print $3/$2*100}'
```

![](/images/p24_img158.png)

![](/images/p24_img160.png)

Modify the trigger configuration

![](/images/p25_img163.png)

Then run the dd stress test again to check the result.
