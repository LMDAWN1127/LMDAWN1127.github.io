---
title: "OpenStack 클라우드 서버 프로비저닝"
date: 2026-10-04T21:50:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "클라우드 서버", "Horizon", "Neutron", "Nova", "CLI"]
summary: "GUI부터 CLI까지 OpenStack 클라우드 서버 제공 전체 흐름을 완전 정리: 테넌트·사용자·이미지·플레이버·네트워크·라우터·보안 그룹·키 페어·플로팅 IP 생성 및 삭제, 그리고 iptables SNAT/DNAT와 Nova cell_v2 discover_hosts 트러블슈팅."
---

## I. GUI(대시보드)에서 클라우드 서버 제공

admin 사용자는 클라우드 최고 관리자입니다

admin은 아이덴티티를 관리합니다

![image-20261004133254743](/images/openstack-launch/image-20261004133254743.png)

1. 테넌트(프로젝트) 생성

![image-20261004133333694](/images/openstack-launch/image-20261004133333694.png)

2. 사용자 생성 및 프로젝트 연결

![image-20261004133444084](/images/openstack-launch/image-20261004133444084.png)

![image-20261004133543426](/images/openstack-launch/image-20261004133543426.png)

3. 이미지 업로드: 관리자가 업로드한 이미지는 퍼블릭(모든 테넌트 접근 가능)으로 설정할 수 있으며, 일반 사용자가 업로드한 이미지는 프라이빗으로 해당 테넌트 내에서만 공유됩니다.

![image-20261004133840621](/images/openstack-launch/image-20261004133840621.png)

4. 플레이버 생성

![image-20261004133940119](/images/openstack-launch/image-20261004133940119.png)

5. 외부 네트워크 생성

![image-20261004180757779](/images/openstack-launch/image-20261004180757779.png)

![image-20261004181355263](/images/openstack-launch/image-20261004181355263.png)

![image-20261004181528225](/images/openstack-launch/image-20261004181528225.png)

L3 Agent가 배포된 노드가 **네트워크 노드**가 됩니다

![](/images/openstack-launch/img-02.png)

테넌트로 로그인

1. 테넌트 계정으로 로그인

![image-20261004140319831](/images/openstack-launch/image-20261004140319831.png)

2. 프라이빗 네트워크 및 서브넷(VPC) 생성

![image-20261004140615180](/images/openstack-launch/image-20261004140615180.png)

![image-20261004181925830](/images/openstack-launch/image-20261004181925830.png)

![image-20261004140927338](/images/openstack-launch/image-20261004140927338.png)

3. 라우터 생성 및 외부/프라이빗 네트워크 연결

![image-20261004143700506](/images/openstack-launch/image-20261004143700506.png)

![image-20261004182358026](/images/openstack-launch/image-20261004182358026.png)

![image-20261004194243028](/images/openstack-launch/image-20261004194243028.png)

![image-20261004183707764](/images/openstack-launch/image-20261004183707764.png)

4. 보안 그룹 및 규칙 생성

![image-20261004182721297](/images/openstack-launch/image-20261004182721297.png)

5. 키 페어 생성

![image-20261004182823825](/images/openstack-launch/image-20261004182823825.png)

6. 클라우드 서버 제공 및 플로팅 IP 연결

![image-20261004183111306](/images/openstack-launch/image-20261004183111306.png)

![image-20261004183150078](/images/openstack-launch/image-20261004183150078.png)

![image-20261004183251232](/images/openstack-launch/image-20261004183251232.png)

![image-20261004194719509](/images/openstack-launch/image-20261004194719509.png)

7. 테스트(로그인, 호스트명, 네트워크)

cloud-init이 호스트명·암호 등 사용자 정의 정보를 초기화합니다

![image-20261004201528038](/images/openstack-launch/image-20261004201528038.png)

예를 들어 디스크 20GB를 차지하고 원활한 구동에 메모리 4GB 이상이 필요한 큰 이미지를 만들었다고 가정합니다. 하지만 테넌트는 이를 모르고 서버 제공 시 디스크 10GB·메모리 2GB 플레이버를 선택해 실패하며 원인도 모릅니다. 따라서 이미지 등록 시 최소 디스크 20GB·최소 메모리 4GB를 지정해 두면, 나중에 플레이버를 고를 때 해당 조건보다 작은 것은 선택할 수 없고 조건을 만족하는 것만 고를 수 있습니다.

아래는 OpenStack Nova에서 **새로 추가된 컴퓨트 노드를 소속 Cell 데이터베이스에 검색·매핑**하기 위해 사용하는 핵심 명령입니다. Cells v2 아키텍처에서는 각 컴퓨트 노드가 반드시 이 등록 단계를 거쳐야 하며, 그렇지 않으면 스케줄러가 해당 노드에 인스턴스를 배치할 수 없고 API에도 해당 호스트가 목록에 나타나지 않습니다.

```bash
[root@Controller ~(keystone_admin)]# nova-manage cell_v2 discover_hosts --verbose
```



클라우드 서버는 라우터를 통해 인터넷에 접근할 수 있습니다. 플로팅 IP를 구성하는 의미는 외부에 서비스를 노출하는 것입니다(웹 서버는 SNAT로 외부로 나갈 수 있지만 원격 사용자는 그 서비스에 들어올 수 없습니다). 아래는 OpenStack이 내부적으로 사용하는 iptables 규칙을 확인하는 방법입니다.

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



실습 과제: 인터넷에 접근 가능한 클라우드 서버를 생성하고, yum 저장소를 Alibaba Cloud로 지정한 뒤 httpd 패키지를 설치·서비스를 시작하고, 외부 호스트에서 Web 페이지 http://192.168.10.182 에 접근한다.

![image-20261004202716013](/images/openstack-launch/image-20261004202716013.png)

Compute 호스트는 본질적으로 KVM 하이퍼바이저입니다. OpenStack이 클라우드 서버를 제공할 때 스케줄러가 그 중 한 Compute 호스트에 배치합니다.

![image-20261004210535149](/images/openstack-launch/image-20261004210535149.png)



## II. 명령줄(CLI)에서 클라우드 서버 제공

```bash
[root@Controller ~(keystone_admin)]# cp keystonerc_admin keystonerc_zlm
```

요구사항 1: CLI로 모든 리소스 삭제

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

1. 클라우드 서버 삭제

```bash
[root@Controller ~(keystone_zlm)]# openstack server list
+--------------------------------------+------+--------+--------------------------------------+------------------+--------+
| ID                                   | Name | Status | Networks                             | Image            | Flavor |
+--------------------------------------+------+--------+--------------------------------------+------------------+--------+
| 44f0fa66-94ed-44ac-a9ae-0a3a13c1faba | web  | ACTIVE | VPC01=192.168.20.197, 192.168.10.182 | CentOS 8.4 64bit | m3.web |
+--------------------------------------+------+--------+--------------------------------------+------------------+--------+
[root@Controller ~(keystone_zlm)]# openstack server delete 44f0fa66-94ed-44ac-a9ae-0a3a13c1faba
```

2. 볼륨 삭제

```bash
[root@Controller ~(keystone_zlm)]# openstack volume list
[root@Controller ~(keystone_zlm)]# openstack volume delete data01
```

3. 라우터 삭제

```bash
[root@Controller ~(keystone_zlm)]# openstack router list
[root@Controller ~(keystone_zlm)]# openstack router show router01
[root@Controller ~(keystone_zlm)]# openstack subnet list
[root@Controller ~(keystone_zlm)]# openstack router remove subnet router01  subnet01
[root@Controller ~(keystone_zlm)]# openstack router delete router01
```

4. 보안 그룹 삭제

```bash
[root@Controller ~(keystone_zlm)]# openstack security group list
[root@Controller ~(keystone_zlm)]# openstack security group delete SG01
```

5. 네트워크 삭제

```bash
[root@Controller ~(keystone_zlm)]# openstack network list
[root@Controller ~(keystone_zlm)]# openstack network delete VPC01
```

admin 계정으로 전환하여 퍼블릭 네트워크·이미지·플레이버·테넌트·사용자 등을 삭제합니다.

```bash
[root@Controller ~(keystone_zlm)]# source  keystonerc_admin
```

6. 퍼블릭 네트워크 삭제

```bash
[root@Controller ~(keystone_admin)]# openstack network list
[root@Controller ~(keystone_admin)]# openstack network delete public
```

7. 이미지 삭제

```bash
[root@Controller ~(keystone_admin)]# openstack image list
[root@Controller ~(keystone_admin)]# openstack image delete e3336d90-e673-4b1b-82ec-69b70fd6402c
[root@Controller ~(keystone_admin)]# openstack image delete cec813dd-8141-4a99-8883-805ac6e3ec17
[root@Controller ~(keystone_admin)]# openstack image delete c6ffe7db-ccb0-4df4-8715-e8ce0fd5dc7d
```

8. 플레이버 삭제

```bash
[root@Controller ~(keystone_admin)]# openstack flavor list
[root@Controller ~(keystone_admin)]# openstack flavor delete m3.web
```

9. 테넌트 및 사용자 삭제

```bash
[root@Controller ~(keystone_admin)]# openstack project list
[root@Controller ~(keystone_admin)]# openstack project delete LMandMY_HOME
[root@Controller ~(keystone_admin)]# openstack user list
[root@Controller ~(keystone_admin)]# openstack user delete zlm
```

요구사항 2: CLI로 모든 리소스 생성—서버 제공, 플로팅 IP 추가, 서버 접속, 네트워크 생성

```bash
[root@Controller ~(keystone_admin)]# source keystonerc_admin
```

1. 프로젝트 사용자를 생성하고 연결

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

2. 이미지 업로드

```bash
[root@Controller ~(keystone_admin)]# openstack image create --file  /data/cirros-0.3.5-x86_64-disk.img --disk-format qcow2 --container-format bare   --public cirros
```

3. 플레이버 생성

```bash
[root@Controller ~(keystone_admin)]# openstack flavor create --ram 1024 --disk 10  --public m3.web
```

4. 퍼블릭 네트워크 및 서브넷 생성

```bash
[root@Controller ~(keystone_admin)]# openstack network create --external --share --provider-network-type flat --provider-physical-network extnet  --project LMandMY_HOME  public
```

서브넷 생성

```bash
[root@Controller ~(keystone_admin)]# openstack subnet create --no-dhcp  --subnet-range 192.168.10.0/24 --allocation-pool start=192.168.10.100,end=192.168.10.200  --gateway 192.168.10.1 --network public publicsub01
```

테넌트 계정으로 전환

```bash
[root@Controller ~(keystone_admin)]# source  keystonerc_zlm
```

1. 네트워크 및 서브넷 생성

```bash
[root@Controller ~(keystone_zlm)]# openstack network create VPC01
```

서브넷 생성

```bash
[root@Controller ~(keystone_zlm)]# openstack subnet create --network VPC01  --subnet-range 192.168.20.0/24 --dhcp --gateway 192.168.20.254 --dns-nameserver 114.114.114.114 subnet01
```

2. 라우터 생성

```bash
[root@Controller ~(keystone_zlm)]# openstack router create router01
[root@Controller ~(keystone_zlm)]# openstack router add subnet router01 subnet01
[root@Controller ~(keystone_zlm)]# openstack router set --external-gateway public router01
```

3. 보안 그룹 생성

```bash
[root@Controller ~(keystone_zlm)]# openstack security group create SG01
```

ICMP 프로토콜 허용

```bash
[root@Controller ~(keystone_zlm)]# openstack security group rule create  --ingress  --protocol icmp  --remote-ip 0.0.0.0/0  SG01
```

SSH 서비스 허용

```bash
[root@Controller ~(keystone_zlm)]# openstack security group rule create  --ingress  --protocol tcp --dst-port 22   --remote-ip 0.0.0.0/0  SG01
```

포트 80 허용

```bash
[root@Controller ~(keystone_zlm)]# openstack security group rule create  --ingress  --protocol tcp --dst-port 80   --remote-ip 0.0.0.0/0 SG01
```

4. 플로팅 IP 생성

```bash
[root@Controller ~(keystone_zlm)]# openstack floating ip  create  public
```

5. 키 페어 생성

```bash
[root@Controller ~(keystone_zlm)]# openstack key create key01 > key01.pem
```

6. 클라우드 서버 생성

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

플로팅 IP를 클라우드 서버에 연결

```bash
[root@Controller ~(keystone_zlm)]# openstack port list
[root@Controller ~(keystone_zlm)]# openstack floating ip set --port=46ba21d5-6f14-4693-a215-5a6fc8781adf  192.168.10.182
```

클라우드 서버 접속

```bash
[root@Controller ~(keystone_zlm)]# chmod 400 key01.pem
[root@Controller ~(keystone_zlm)]# ssh -i key01.pem cirros@192.168.10.182
```

외부 NIC 통신이 안 되는 경우

```bash
[root@Controller ~(keystone_zlm)]# ifup br-ex ; ifup ens224
```
