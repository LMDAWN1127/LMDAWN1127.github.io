---
title: "Harbor 高可用性：keepalived による VIP フェイルオーバーの実現"
date: 2026-10-29T20:38:15+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本実践では keepalived を用いた VIP フェイルオーバーで Harbor の高可用性構成を構築する。docker01 と docker02 に keepalived をインストールし、ポートチェックスクリプトを作成して、仮想 IP 11.0.1.250 を共有する VRRP インスタンス（docker01 を priority 100 の MASTER、docker02 を priority 90 の BACKUP）を設定する。VIP が現在 docker01 の Harbor を指していることを確認後、docker01 の keepalived を手動で停止し、VIP が docker02 に漂着して Harbor サービスが切り替わることを観察し、keepalived の HA 構成が機能することを証明する。"
---

# Harbor 高可用性：keepalived による VIP フェイルオーバーの実現

## 1. keepalived のインストール

```bash
root@docker01:~# apt -y install keepalived
root@docker02:~# apt -y install keepalived
```

## 2. ポートチェックスクリプトの作成

```bash
root@docker01:~# cat > /etc/keepalived/check_port.sh <<'EOF'
#!/bin/bash
PORT=$1
ss -lnt | grep -q ":$PORT " && exit 0 || exit 1
EOF
root@docker01:~# chmod +x /etc/keepalived/check_port.sh
```

## 3. docker01 ノードの設定と起動（MASTER）

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

## 4. docker02 ノードの設定と起動（BACKUP）

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

## 5. VIP 経由の Harbor アクセス検証（現在地は docker01）

![image-20261029203110175](/images/harbor-keepalived-vip/image-20261029203110175.png)

VIP 経由で Harbor API にアクセスすると、返されるプロジェクト一覧は `dawn-linux`、`library` のみ（docker01 の Harbor のプロジェクト）となり、VIP が現在 docker01 を指していることを証明する。

## 6. docker01 の keepalived を手動停止し、VIP フェイルオーバーを観察

```bash
root@docker01:~# systemctl stop keepalived
root@docker01:~# ip a show ens33 | grep inet
    inet 11.0.1.121/24 brd 11.0.1.255 scope global ens33
```

## 7. docker02 ノードへの VIP フェイルオーバーの確認

```bash
root@docker02:~# ip a show ens33 | grep inet
    inet 11.0.1.122/24 brd 11.0.1.255 scope global ens33
    inet 11.0.1.250/32 scope global ens33

root@docker02:~# journalctl -u keepalived | tail -1
Oct 29 09:32:48 docker02 Keepalived_vrrp[54946]: (VI_1) Entering MASTER STATE
```

## 8. Harbor WebUI の再確認

VIP 経由で Harbor にアクセスすると、返されるプロジェクト一覧は `dawn-games`、`dawn-linux`、`library` に変化する（docker02 の Harbor のプロジェクト）ため、サービスが docker02 に正常に切り替わったことを証明する。

![image-20261029203529595](/images/harbor-keepalived-vip/image-20261029203529595.png)

VIP は docker01 から docker02 へ正常にフェイルオーバーし、Harbor サービスもそれに伴って切り替わり、keepalived の高可用性構成が検証された。