---
title: "flannel 実践：Docker クロスホストコンテナネットワークをゼロから構築"
date: 2025-05-21
draft: false
tags: ["flannel", "Docker", "ネットワーク", "etcd"]
---

# flannel 実践：Docker クロスホストコンテナネットワークをゼロから構築

## 一、ネットワーク環境の計画

1. etcd ホスト IP：192.168.8.88 ホスト名：docker-network
2. Host1 IP：192.168.8.188 ホスト名：web01
3. Host2 IP：192.168.8.99 ホスト名：web02

## 二、etcd ホストの設定

### ステップ 1：etcd のダウンロードと解凍

1. github.com から etcd-v3.6.0-linux-amd64.tar.gz パッケージをダウンロードします
2. パッケージを etcd ホストの /root ディレクトリにコピーして解凍します：

```bash
[root@docker-network ~]# tar -zxvf etcd-v3.6.0-linux-amd64.tar.gz
```

### ステップ 2：etcd 実行ファイルのインストール

```bash
[root@docker-network ~]# cd etcd-v3.6.0-linux-amd64
[root@docker-network etcd-v3.6.0-linux-amd64]# cp etcd* /usr/local/bin/
```

### ステップ 3：データディレクトリの作成

```bash
[root@docker-network ~]# mkdir /var/lib/etcd
```

### ステップ 4：etcd サービスの設定と起動

1. etcd.service ファイルを作成します：

```bash
[root@docker-network ~]# vim /usr/lib/systemd/system/etcd.service
```

```ini
[Unit]
Description=etcd_service
[Service]
ExecStart=/usr/local/bin/etcd --name etcd1 --data-dir /var/lib/etcd --listen-client-urls http://192.168.8.88:2379,http://127.0.0.1:2379 --advertise-client-urls http://192.168.8.88:2379,http://127.0.0.1:2379
[Install]
WantedBy=multi-user.target
```


2. システムサービス設定をリロードして etcd を起動します：

```bash
[root@docker-network ~]# systemctl daemon-reload
[root@docker-network ~]# systemctl enable etcd.service
[root@docker-network ~]# systemctl restart etcd.service
```

3. etcd のリスニング状態を確認します：

```bash
[root@docker-network ~]# netstat -tulnp |grep :2379
tcp        0      0 192.168.8.88:2379       0.0.0.0:*               LISTEN      1912/etcd
tcp        0      0 127.0.0.1:2379          0.0.0.0:*               LISTEN      1912/etcd
```

### ステップ 5：etcd に flannel ネットワーク設定を追加

```bash
etcdctl --endpoints http://127.0.0.1:2379 put /coreos.com/network/config '{"Network": "172.16.0.0/16", "SubnetLen": 24, "SubnetMin": "172.16.1.0","SubnetMax": "172.16.10.0", "Backend": {"Type": "vxlan"}}'
```


```bash
etcdctl --endpoints http://192.168.8.88:2379 get /coreos.com/network/config
```

設定の説明：

- Network：Flannel アドレスプール
- SubnetLen：単一のホストに割り当てる docker0 のサブネットマスク長（24ビットは 255.255.255.0）
- SubnetMin/SubnetMax：割り当て可能なサブネット範囲（例：172.16.1.0/24 から 172.16.10.0/24）
- Backend：データ転送モード（vxlan はクロスホスト通信をサポート）

### ステップ 6：ファイアウォールの無効化

```bash
[root@docker-network ~]# systemctl disable firewalld
[root@docker-network ~]# systemctl stop firewalld
```

## 三、web01 ホストの設定（Host1: 192.168.8.188）

### ステップ 1：flannel のダウンロードと解凍

1. flannel-v0.26.7-linux-amd64.tar.gz をホストにダウンロードします
2. ファイルを解凍します：

```bash
[root@web01 ~]# tar -zxvf flannel-v0.26.7-linux-amd64.tar.gz
```

### ステップ 2：flannel 実行ファイルのインストール

```bash
[root@web01 ~]# cp -p flanneld mk-docker-opts.sh /usr/local/bin/
```

### ステップ 3：flannel サービスの設定と起動

1. flanneld.service ファイルを作成します：

```bash
[root@web01 ~]# vim /usr/lib/systemd/system/flanneld.service
```

```ini
[Unit]
Description=Flanneld
Documentation=https://github.com/coreos/flannel
After=network.target
Before=docker.service
[Service]
User=root
ExecStartPost=/usr/local/bin/mk-docker-opts.sh
ExecStart=/usr/local/bin/flanneld --etcd-endpoints=http://192.168.8.88:2379 --iface=192.168.8.188 --ip-masq=true --etcd-prefix=/coreos.com/network
Restart=on-failure
Type=notify
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
```

パラメータの説明：

- `--iface=192.168.8.188`：本機の etcd 接続用 IP を指定
- `--etcd-endpoints`：etcd サーバーのアドレス

サービス設定をリロードして flannel を起動します：

```bash
[root@web01 ~]# systemctl daemon-reload
[root@web01 ~]# systemctl enable flanneld.service
[root@web01 ~]# systemctl restart flanneld.service
```

### ステップ 4：flannel ネットワークインターフェースの確認

```bash
[root@web01 ~]# ifconfig
```

flannel.1 インターフェースが表示されるはずです（出力例）：

```
flannel.1: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1450
        inet 172.16.5.0  netmask 255.255.255.255  broadcast 0.0.0.0
        inet6 fe80::f06c:96ff:fefe:b7ab  prefixlen 64  scopeid 0x20<link>
        ether f2:6c:96:fe:b7:ab  txqueuelen 0  (Ethernet)
        RX packets 315  bytes 26460 (25.8 KiB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 314  bytes 34636 (33.8 KiB)
        TX errors 0  dropped 29 overruns 0  carrier 0  collisions 0
```

### ステップ 5：docker 設定ファイルの変更

1. flannel が生成したサブネット環境変数を確認します：

```bash
[root@web01 ~]# cat /run/flannel/subnet.env
```

出力例：

```
FLANNEL_NETWORK=172.16.0.0/16
FLANNEL_SUBNET=172.16.5.1/24
FLANNEL_MTU=1450
FLANNEL_IPMASQ=true
```

```bash
[root@web01 ~]# cat /run/docker_opts.env
```

出力例：

```
DOCKER_OPT_BIP="--bip=172.16.5.1/24"
DOCKER_OPT_IPMASQ="--ip-masq=false"
DOCKER_OPT_MTU="--mtu=1450"
DOCKER_OPTS=" --bip=172.16.5.1/24 --ip-masq=false --mtu=1450"
```

2. docker サービス設定を変更します：

```bash
[root@web01 ~]# vim /usr/lib/systemd/system/docker.service
```

[Service] セクションに以下を追加します：

```ini
ExecStart=/usr/bin/dockerd $DOCKER_OPTS -H fd:// --containerd=/run/containerd/containerd.sock
ExecReload=/bin/kill -s HUP $MAINPID
EnvironmentFile=-/run/docker_opts.env
```

3. docker サービスを再起動します：

```bash
[root@web01 ~]# systemctl daemon-reload
[root@web01 ~]# systemctl restart docker.service
```

### ステップ 6：docker ネットワークの確認

1. nginx コンテナを作成して進入します：

```bash
[root@web01 ~]# ifconfig
docker0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1450
        inet 172.16.5.1  netmask 255.255.255.0  broadcast 172.16.5.255
        inet6 fe80::42:f6ff:fe5d:5423  prefixlen 64  scopeid 0x20<link>
        ether 02:42:f6:5d:54:23  txqueuelen 0  (Ethernet)
        RX packets 10073  bytes 407167 (397.6 KiB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 48185  bytes 38083646 (36.3 MiB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
```

```bash
[root@web01 ~]# docker run -d -p 8800:80 nginx
[root@web01 ~]# docker exec -it <コンテナID> /bin/bash
```

2. コンテナ IP を確認します（例：172.16.5.3）：

```bash
root@コンテナID:/# ifconfig
eth0: inet 172.16.5.3 netmask 255.255.255.0
```

![web01 コンテナネットワーク検証](/images/flannel/page6_img1.png)

## 四、web02 ホストの設定（Host2: 192.168.0.208）

### ステップの説明

1. 設定手順は web01 と完全に同じです。以下のパラメータのみ変更してください：
   - `--iface=192.168.8.99`（本機の IP）
   - docker コンテナ IP の例：172.16.5.2（flannel が自動割り当て）

## 五、実験の検証

web01 のコンテナから web02 のコンテナ IP（例：172.16.9.2）に ping を実行します：

![web01 から web02 コンテナへの ping](/images/flannel/page7_img1.png)

web02 でコンテナを作成し、コンテナ IP アドレスを確認します

結果：コンテナ間通信が成功し、flannel ネットワークの設定が完了しました。

### 付録：etcd ネットワーク設定の確認

```bash
[root@docker-network ~]# etcdctl --endpoints=http://127.0.0.1:2379 get /coreos.com/network/config
/coreos.com/network/config
{"Network": "172.16.0.0/16", "SubnetLen": 24, "SubnetMin": "172.16.1.0","SubnetMax": "172.16.10.0", "Backend": {"Type": "vxlan"}}
```

```bash
[root@docker-network ~]# etcdctl --endpoints=http://127.0.0.1:2379 get /coreos.com/network/subnets --prefix --keys-only
/coreos.com/network/subnets/172.16.5.0-24
/coreos.com/network/subnets/172.16.9.0-24
```

```bash
[root@docker-network ~]# etcdctl --endpoints=http://127.0.0.1:2379 get /coreos.com/network/subnets/172.16.5.0-24
/coreos.com/network/subnets/172.16.5.0-24
{"PublicIP":"192.168.8.188","PublicIPv6":null,"BackendType":"vxlan","BackendData":{"VNI":1,"VtepMAC":"5a:67:18:61:6a:5d"}}
```
