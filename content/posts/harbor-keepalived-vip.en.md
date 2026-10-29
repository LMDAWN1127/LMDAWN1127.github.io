---
title: "Harbor High Availability: Implementing VIP Failover with keepalived"
date: 2026-10-29T20:38:15+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "This hands-on walkthrough builds a Harbor high-availability solution using keepalived for VIP failover. keepalived is installed on docker01 and docker02, a port-check script is created, and a VRRP instance sharing the virtual IP 11.0.1.250 is configured (docker01 as MASTER with priority 100, docker02 as BACKUP with priority 90). After verifying the VIP currently points to docker01's Harbor, keepalived on docker01 is stopped manually to observe the VIP drift to docker02 and the Harbor service switch, proving the keepalived HA scheme works."
---

# Harbor High Availability: Implementing VIP Failover with keepalived

## 1. Installing keepalived

```bash
root@docker01:~# apt -y install keepalived
root@docker02:~# apt -y install keepalived
```

## 2. Creating the Port-Check Script

```bash
root@docker01:~# cat > /etc/keepalived/check_port.sh <<'EOF'
#!/bin/bash
PORT=$1
ss -lnt | grep -q ":$PORT " && exit 0 || exit 1
EOF
root@docker01:~# chmod +x /etc/keepalived/check_port.sh
```

## 3. Configuring and Starting the docker01 Node (MASTER)

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

## 4. Configuring and Starting the docker02 Node (BACKUP)

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

## 5. Verifying VIP Access to Harbor (Currently on docker01)

![image-20261029203110175](/images/harbor-keepalived-vip/image-20261029203110175.png)

Accessing the Harbor API via the VIP returns a project list containing only `dawn-linux` and `library` (the projects on docker01's Harbor), proving the VIP currently points to docker01.

## 6. Manually Stopping keepalived on docker01 and Observing VIP Failover

```bash
root@docker01:~# systemctl stop keepalived
root@docker01:~# ip a show ens33 | grep inet
    inet 11.0.1.121/24 brd 11.0.1.255 scope global ens33
```

## 7. Checking Whether the VIP Failed Over to docker02

```bash
root@docker02:~# ip a show ens33 | grep inet
    inet 11.0.1.122/24 brd 11.0.1.255 scope global ens33
    inet 11.0.1.250/32 scope global ens33

root@docker02:~# journalctl -u keepalived | tail -1
Oct 29 09:32:48 docker02 Keepalived_vrrp[54946]: (VI_1) Entering MASTER STATE
```

## 8. Re-checking the Harbor WebUI

Accessing Harbor via the VIP now returns the project list `dawn-games`, `dawn-linux`, `library` (the projects on docker02's Harbor), proving the service has successfully switched to docker02.

![image-20261029203529595](/images/harbor-keepalived-vip/image-20261029203529595.png)

The VIP successfully failed over from docker01 to docker02, the Harbor service switched accordingly, and the keepalived high-availability scheme is verified.