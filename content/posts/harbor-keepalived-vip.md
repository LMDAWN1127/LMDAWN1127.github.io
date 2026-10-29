---
title: "Harbor 高可用方案：用 keepalived 实现 VIP 漂移"
date: 2026-10-29T20:38:15+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本文实战演示用 keepalived 为 Harbor 实现 VIP 漂移的高可用方案。在 docker01、docker02 两台节点安装 keepalived，编写端口检测脚本，配置共享虚拟 IP 11.0.1.250 的 VRRP 实例（docker01 为 priority 100 的 MASTER、docker02 为 priority 90 的 BACKUP）。先验证 VIP 当前指向 docker01 的 Harbor，再手动停止 docker01 的 keepalived，观察 VIP 漂移到 docker02、Harbor 服务随之切换，证实 keepalived 高可用方案可行。"
---

# Harbor 高可用方案：用 keepalived 实现 VIP 漂移

## 1. 安装 keepalived

```bash
root@docker01:~# apt -y install keepalived
root@docker02:~# apt -y install keepalived
```

## 2. 创建端口检测脚本

```bash
root@docker01:~# cat > /etc/keepalived/check_port.sh <<'EOF'
#!/bin/bash
PORT=$1
ss -lnt | grep -q ":$PORT " && exit 0 || exit 1
EOF
root@docker01:~# chmod +x /etc/keepalived/check_port.sh
```

## 3. docker01 节点（MASTER）配置并启动

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

## 4. docker02 节点（BACKUP）配置并启动

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

## 5. 验证 VIP 访问 harbor（当前在 docker01）

![image-20261029203110175](/images/harbor-keepalived-vip/image-20261029203110175.png)

通过 VIP 访问 harbor API，返回的项目列表仅 `dawn-linux`、`library`（docker01 harbor 的项目），证明 VIP 当前指向 docker01

## 6. 手动停止 docker01 的 keepalived，观察 VIP 漂移

```bash
root@docker01:~# systemctl stop keepalived
root@docker01:~# ip a show ens33 | grep inet
    inet 11.0.1.121/24 brd 11.0.1.255 scope global ens33
```

## 7. 观察 docker02 节点 VIP 是否漂移

```bash
root@docker02:~# ip a show ens33 | grep inet
    inet 11.0.1.122/24 brd 11.0.1.255 scope global ens33
    inet 11.0.1.250/32 scope global ens33

root@docker02:~# journalctl -u keepalived | tail -1
Oct 29 09:32:48 docker02 Keepalived_vrrp[54946]: (VI_1) Entering MASTER STATE
```

## 8. 再次观察 harbor 的 WebUI

通过 VIP 访问 harbor，返回项目列表变为 `dawn-games`、`dawn-linux`、`library`（docker02 harbor 的项目），证明服务已成功切换到 docker02

![image-20261029203529595](/images/harbor-keepalived-vip/image-20261029203529595.png)

VIP 成功从 docker01 漂移到 docker02，harbor 服务随之切换，keepalived 高可用方案验证通过