---
title: "Harbor 고가용성: keepalived 로 VIP 페일오버 구현"
date: 2026-10-29T20:38:15+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "이 실습에서는 keepalived 를 사용한 VIP 페일오버로 Harbor 고가용성 구성을 구축한다. docker01 과 docker02 에 keepalived 를 설치하고 포트 확인 스크립트를 만들어, 가상 IP 11.0.1.250 을 공유하는 VRRP 인스턴스（docker01 을 priority 100 의 MASTER, docker02 를 priority 90 의 BACKUP）를 구성한다. VIP 가 현재 docker01 의 Harbor 를 가리킴을 확인한 후 docker01 의 keepalived 를 수동으로 중지해 VIP 가 docker02 로 이동하고 Harbor 서비스가 전환되는 것을 관찰하여, keepalived HA 구성가 동작함을 증명한다."
---

# Harbor 고가용성: keepalived 로 VIP 페일오버 구현

## 1. keepalived 설치

```bash
root@docker01:~# apt -y install keepalived
root@docker02:~# apt -y install keepalived
```

## 2. 포트 확인 스크립트 생성

```bash
root@docker01:~# cat > /etc/keepalived/check_port.sh <<'EOF'
#!/bin/bash
PORT=$1
ss -lnt | grep -q ":$PORT " && exit 0 || exit 1
EOF
root@docker01:~# chmod +x /etc/keepalived/check_port.sh
```

## 3. docker01 노드 설정 및 시작（MASTER）

```bash
root@docker01:~# cat > /etc/keepalived/keepalived.conf <<'EOF'
! Configuration File for keepalived
global_defs {
   router_id 11.0.1.121
}
vrrp_script chk_nginx {
    script "/etc/keepalived/check_port.sh 80"
    interval 2
    weight -20
}
vrrp_instance VI_1 {
    state MASTER
    interface ens33
    virtual_router_id 101
    priority 100
    advert_int 1
    mcast_src_ip 11.0.1.121
    authentication {
        auth_type PASS
        auth_pass 123456
    }
    track_script {
         chk_nginx
    }
    virtual_ipaddress {
        11.0.1.250
    }
}
EOF
root@docker01:~# systemctl restart keepalived
root@docker01:~# ip a show ens33 | grep inet
    inet 11.0.1.121/24 brd 11.0.1.255 scope global ens33
    inet 11.0.1.250/32 scope global ens33
```

## 4. docker02 노드 설정 및 시작（BACKUP）

```bash
root@docker02:~# cat > /etc/keepalived/keepalived.conf <<'EOF'
! Configuration File for keepalived
global_defs {
   router_id 11.0.1.122
}
vrrp_script chk_nginx {
    script "/etc/keepalived/check_port.sh 80"
    interval 2
    weight -20
}
vrrp_instance VI_1 {
    state BACKUP
    interface ens33
    virtual_router_id 101
    priority 90
    advert_int 1
    mcast_src_ip 11.0.1.122
    authentication {
        auth_type PASS
        auth_pass 123456
    }
    track_script {
         chk_nginx
    }
    virtual_ipaddress {
        11.0.1.250
    }
}
EOF
root@docker02:~# systemctl restart keepalived
root@docker02:~# ip a show ens33 | grep inet
    inet 11.0.1.122/24 brd 11.0.1.255 scope global ens33
```

## 5. VIP 를 통한 Harbor 접속 검증（현재 위치 docker01）

![image-20261029203110175](/images/harbor-keepalived-vip/image-20261029203110175.png)

VIP 를 통해 Harbor API 에 접속하면 반환되는 프로젝트 목록이 `dawn-linux`, `library` 만 포함된다（docker01 Harbor 의 프로젝트）. 이는 VIP 가 현재 docker01 을 가리키고 있음을 증명한다.

## 6. docker01 의 keepalived 수동 중지 및 VIP 페일오버 관찰

```bash
root@docker01:~# systemctl stop keepalived
root@docker01:~# ip a show ens33 | grep inet
    inet 11.0.1.121/24 brd 11.0.1.255 scope global ens33
```

## 7. docker02 노드로의 VIP 페일오버 확인

```bash
root@docker02:~# ip a show ens33 | grep inet
    inet 11.0.1.122/24 brd 11.0.1.255 scope global ens33
    inet 11.0.1.250/32 scope global ens33

root@docker02:~# journalctl -u keepalived | tail -1
Oct 29 09:32:48 docker02 Keepalived_vrrp[54946]: (VI_1) Entering MASTER STATE
```

## 8. Harbor WebUI 재확인

VIP 를 통해 Harbor 에 접속하면 프로젝트 목록이 `dawn-games`, `dawn-linux`, `library` 로 바뀐다（docker02 Harbor 의 프로젝트）. 이는 서비스가 docker02 로 성공적으로 전환되었음을 증명한다.

![image-20261029203529595](/images/harbor-keepalived-vip/image-20261029203529595.png)

VIP 가 docker01 에서 docker02 로 성공적으로 페일오버하고 Harbor 서비스도 함께 전환되어, keepalived 고가용성 구성가 검증되었다.