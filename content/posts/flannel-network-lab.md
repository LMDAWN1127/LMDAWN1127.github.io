---
title: "flannel 网络实验手册"
date: 2025-05-21
draft: false
tags: ["flannel", "docker", "网络", "etcd"]
---

# flannel 网络实验手册

## 一、网络环境规划

1. etcd 主机 IP：192.168.8.88 主机名：docker-network
2. Host1 IP：192.168.8.188 主机名：web01
3. Host2 IP：192.168.8.99 主机名：web02

## 二、etcd 主机配置

### 步骤 1：下载并解压 etcd

1. 从github.com 下载etcd-v3.6.0-linux-amd64.tar.gz 软件包
2. 将软件包复制到 etcd 主机/root 目录并解压：

```bash
[root@docker-network ~]# tar -zxvf etcd-v3.6.0-linux-amd64.tar.gz
```

### 步骤 2：安装 etcd 可执行文件

```bash
[root@docker-network ~]# cd etcd-v3.6.0-linux-amd64
[root@docker-network etcd-v3.6.0-linux-amd64]# cp etcd* /usr/local/bin/
```

### 步骤 3：创建数据目录

```bash
[root@docker-network ~]# mkdir /var/lib/etcd
```

### 步骤 4：配置并启动 etcd 服务

1. 创建etcd.service 文件：

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

> 注意： 整个蓝色部分均为一行

2. 重载系统服务配置并启动 etcd：

```bash
[root@docker-network ~]# systemctl daemon-reload
[root@docker-network ~]# systemctl enable etcd.service
[root@docker-network ~]# systemctl restart etcd.service
```

3. 验证 etcd 监听状态：

```bash
[root@docker-network ~]# netstat -tulnp |grep :2379
tcp        0      0 192.168.8.88:2379       0.0.0.0:*               LISTEN      1912/etcd
tcp        0      0 127.0.0.1:2379          0.0.0.0:*               LISTEN      1912/etcd
```

### 步骤 5：向 etcd 添加 flannel 网络配置

```bash
etcdctl --endpoints http://127.0.0.1:2379 put /coreos.com/network/config '{"Network": "172.16.0.0/16", "SubnetLen": 24, "SubnetMin": "172.16.1.0","SubnetMax": "172.16.10.0", "Backend": {"Type": "vxlan"}}'
```

> 上述内容全部为一行，验证配置是否写入成功

```bash
etcdctl --endpoints http://192.168.8.88:2379 get /coreos.com/network/config
```

配置说明：

- Network：Flannel 地址池
- SubnetLen：分配给单个宿主机的 docker0 子网掩码长度（24 位即255.255.255.0）
- SubnetMin/SubnetMax：可分配的子网范围（示例为172.16.1.0/24 到172.16.10.0/24）
- Backend：数据转发模式（vxlan 支持跨主机通信）

### 步骤 6：关闭防火墙

```bash
[root@docker-network ~]# systemctl disable firewalld
[root@docker-network ~]# systemctl stop firewalld
```

## 三、docker01 主机配置（Host1: 192.168.8.188）

### 步骤 1：下载并解压 flannel

1. 下载flannel-v0.26.7-linux-amd64.tar.gz 到主机
2. 解压文件：

```bash
[root@web01 data]# tar -zxvf flannel-v0.26.7-linux-amd64.tar.gz
```

### 步骤 2：安装 flannel 可执行文件

```bash
[root@docker01 ~]# cp -p flanneld mk-docker-opts.sh /usr/local/bin/
```

### 步骤 3：配置并启动 flannel 服务

1. 创建flanneld.service 文件：

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

参数说明：

- `--iface=192.168.8.188`：指定本机连接 etcd 的 IP
- `--etcd-endpoints`：etcd 服务器地址

重载服务配置并启动 flannel：

```bash
[root@docker01 ~]# systemctl daemon-reload
[root@docker01 ~]# systemctl enable flanneld.service
[root@docker01 ~]# systemctl restart flanneld.service
```

### 步骤 4：验证 flannel 网络接口

```bash
[root@docker01 ~]# ifconfig
```

应显示flannel.1 接口（示例输出）：

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

### 步骤 5：修改 docker 配置文件

1. 查看 flannel 生成的子网环境变量：

```bash
[root@docker01 ~]# cat /run/flannel/subnet.env
```

输出示例：

```
FLANNEL_NETWORK=172.16.0.0/16
FLANNEL_SUBNET=172.16.5.1/24
FLANNEL_MTU=1450
FLANNEL_IPMASQ=true
```

```bash
[root@docker01 ~]# cat /run/docker_opts.env
```

输出示例：

```
DOCKER_OPT_BIP="--bip=172.16.5.1/24"
DOCKER_OPT_IPMASQ="--ip-masq=false"
DOCKER_OPT_MTU="--mtu=1450"
DOCKER_OPTS=" --bip=172.16.5.1/24 --ip-masq=false --mtu=1450"
```

2. 修改 docker 服务配置：

```bash
[root@docker01 ~]# vim /usr/lib/systemd/system/docker.service
```

在[Service]部分添加：

```ini
ExecStart=/usr/bin/dockerd $DOCKER_OPTS -H fd:// --containerd=/run/containerd/containerd.sock
ExecReload=/bin/kill -s HUP $MAINPID
EnvironmentFile=-/run/docker_opts.env
```

3. 重启 docker 服务：

```bash
[root@docker01 ~]# systemctl daemon-reload
[root@docker01 ~]# systemctl restart docker.service
```

### 步骤 6：验证 docker 网络

1. 创建 nginx 容器并进入：

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
[root@docker01 ~]# docker run -d -p 8800:80 nginx
[root@docker01 ~]# docker exec -it <容器ID> /bin/bash
```

2. 查看容器 IP（示例为172.16.5.3）：

```bash
root@容器ID:/# ifconfig
eth0: inet 172.16.5.3 netmask 255.255.255.0
```

![docker01 容器网络验证](/images/flannel/page6_img1.png)

## 四、docker02 主机配置（Host2: 192.168.0.208）

### 步骤说明

1. 配置步骤与 docker01 完全一致，仅需修改以下参数：
   - `--iface=192.168.8.99`（本机 IP）
   - docker 容器 IP 示例：172.16.5.2（由 flannel 自动分配）

## 五、实验验证

在 docker01 容器中 ping docker02 容器 IP（示例：172.16.9.2）：

![docker01 ping docker02 容器](/images/flannel/page7_img1.png)

在Docker02 中创建容器，查看容器IP 地址

结果：容器间通信成功，flannel 网络配置完成。

### 附录：etcd 网络配置查询

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
