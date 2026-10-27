---
title: "Docker 实战：Overlay 实现容器跨主机网络互联"
date: 2026-10-27T18:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "在两台 Docker 主机上初始化 Swarm 集群，创建 attachable overlay 网络 dawn-overlay，演示容器跨主机通过 IP 与容器名通信，并验证外网经 docker_gwbridge 出口、最终通过 VXLAN（UDP 4789）抓包观察 overlay 数据封装过程。"
---

# Docker 实战：Overlay 实现容器跨主机网络互联

## 1. 实验目标

1. 将 docker01 和 docker02 组成一个 Docker Swarm 集群。
2. 创建自定义 overlay 网络 `dawn-overlay`，网段为 `172.30.0.0/16`。
3. 在 docker02 上启动容器 `c1`，在 docker01 上启动容器 `c2`。
4. 验证两个容器可以跨主机通过 IP 和容器名通信。
5. 验证容器仍可通过 `docker_gwbridge` 访问外网。
6. 在宿主机业务网卡 `ens33` 上抓取 VXLAN 报文，观察 overlay 的数据封装过程。

## 2. 实验环境与拓扑

### 2.1 主机环境

| 主机 | 业务 IP | 网卡 | Docker | Swarm 角色 | 测试容器 |
|---|---|---|---|---|---|
| docker01 | 11.0.1.121/24 | ens33 | 27.0.3 | manager、leader | c2，172.30.0.3 |
| docker02 | 11.0.1.122/24 | ens33 | 27.0.3 | worker | c1，172.30.0.1 |

### 2.2 逻辑拓扑

```text
                      Swarm 集群
             控制面：Raft + 节点发现
                           
   docker01                              docker02
   11.0.1.121                            11.0.1.122
   manager / leader                     worker
        |                                     |
        |        UDP 4789，VXLAN 隧道          |
        |<===================================>|
        |                                     |
     c2 容器                               c1 容器
   172.30.0.3/16                         172.30.0.1/16
        |                                     |
        +------ dawn-overlay，同一二层网段 -----+

   容器访问外网：eth1 -> docker_gwbridge -> 宿主机 NAT -> ens33
```

### 2.3 Swarm 所需端口

| 端口 | 协议 | 用途 |
|---|---|---|
| 2377 | TCP | Swarm 管理通信，主要用于节点加入和管理节点通信 |
| 7946 | TCP、UDP | 节点之间的发现与状态传播 |
| 4789 | UDP | overlay 网络的 VXLAN 数据封装 |

如果跨主机 ping 不通，但容器和 overlay 网络均已创建，应优先检查这些端口及中间网络安全策略。

## 3. 在 docker01 初始化 Swarm

在 docker01 上执行：

```bash
docker swarm init \
  --advertise-addr 11.0.1.121 \
  --listen-addr 11.0.1.121:2377
```

```bash
Swarm initialized: current node (ilsct3hz5rg7tc1ln7l426p1e) is now a manager.
```

查看节点：

```bash
docker node ls
```

此时只有管理节点：

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
```

查看 worker 加入令牌：

```bash
docker swarm join-token worker
```

令牌属于集群加入凭据，复现实验时应在 docker01 上实时获取。

初始化后，docker01 开始监听：

```bash
tcp  11.0.1.121:2377
tcp  11.0.1.121:7946
udp  11.0.1.121:7946
```



### 自动生成的其他网络

初始化 Swarm 后还可以看到：

| 网络              | 作用                                       |
| ----------------- | ------------------------------------------ |
| `ingress`         | Swarm 服务发布端口时使用的路由网格网络     |
| `docker_gwbridge` | overlay 容器连接宿主机和外网的本地桥接网络 |

## 4. 将 docker02 加入集群

在 docker02 上执行以下命令：

```bash
docker swarm join \
  --token <WORKER_TOKEN> \
  --advertise-addr 11.0.1.122 \
  --listen-addr 11.0.1.122:2377 \
  11.0.1.121:2377
```

```bash
This node joined a swarm as a worker.
```

回到 docker01 验证：

```bash
docker node ls
```

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
zqccn7zzxvujvbuw8i43jczdn     docker02   Ready     Active                          27.0.3
```

两个节点均为 `Ready / Active`，说明集群控制面正常。

`docker node ls` 是管理节点命令，在 worker 上执行会提示当前节点不是 manager。

## 5. 创建自定义 overlay 网络

在管理节点 docker01 上执行：

```bash
docker network create \
  -d overlay \
  --attachable \
  --subnet 172.30.0.0/16 \
  --gateway 172.30.0.254 \
  dawn-overlay
```

```bash
8myzpa127zbqa8x3wnzrfv1eh
```

查看网络：

```bash
docker network inspect dawn-overlay \
  --format 'Name={{.Name}} Id={{.Id}} Scope={{.Scope}} Driver={{.Driver}} Attachable={{.Attachable}} Subnet={{(index .IPAM.Config 0).Subnet}} Gateway={{(index .IPAM.Config 0).Gateway}}'
```

```bash
Name=dawn-overlay
Id=8myzpa127zbqa8x3wnzrfv1eh
Scope=swarm
Driver=overlay
Attachable=true
Subnet=172.30.0.0/16
Gateway=172.30.0.254
```

Swarm 模式下的 overlay 网络默认主要供 service/task 使用。如果希望普通容器也能通过 `docker run --network dawn-overlay` 接入，需要在创建网络时指定 `--attachable`。



网络刚创建时，在 docker02 上执行：

```bash
docker network ls
docker network inspect dawn-overlay
```

观察到：

```bash
Error response from daemon: network dawn-overlay not found
```

此时 `docker network ls` 中也只有 `bridge`、`host`、`none`、`ingress` 和 `docker_gwbridge`，暂时没有 `dawn-overlay`。

这不是集群同步失败，而是 Swarm overlay 网络在工作节点上的按需下发机制：网络配置保存在集群中，但工作节点通常在有容器或任务实际需要接入该网络时，才建立本地的数据面资源。

## 6. 在 docker02 启动 c1

在 docker02 上执行：

```bash
docker run -d \
  --name c1 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

查看容器网卡：

```bash
docker exec c1 ifconfig
```

关键结果：

```text
eth0: inet addr 172.30.0.1/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

再次查看网络：

```bash
docker network ls --filter name=dawn-overlay
NETWORK ID     NAME           DRIVER    SCOPE
8myzpa127zbq   dawn-overlay   overlay   swarm

docker network inspect dawn-overlay \
  --format 'Id={{.Id}} Scope={{.Scope}} Attachable={{.Attachable}}'
Id=8myzpa127zbqa8x3wnzrfv1eh Scope=swarm Attachable=true
```

接入容器后，`dawn-overlay` 已在 docker02 上出现，并且网络 ID 与 docker01 完全一致。

## 7. 在 docker01 启动 c2

在 docker01 上执行：

```bash
docker run -d \
  --name c2 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

查看网卡：

```bash
docker exec c2 ifconfig
```

关键结果：

```text
eth0: inet addr 172.30.0.3/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

## 8. 验证跨主机通信

### 8.1 通过目标 IP 通信

在 docker01 上执行：

```bash
docker exec c2 ping -c 3 172.30.0.1
PING 172.30.0.1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=7.124 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.414 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.518 ms

--- 172.30.0.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

### 8.2 通过容器名通信

继续执行：

```bash
docker exec c2 ping -c 3 c1
PING c1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=0.996 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.456 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.492 ms

--- c1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

生产环境中应优先使用稳定的服务名或容器名，而不是把动态分配的容器 IP 写死在配置文件中。

## 9. 验证路由和外网访问

查看 c2 路由：

```bash
docker exec c2 route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         172.18.0.1      0.0.0.0         UG    0      0        0 eth1
172.18.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth1
172.30.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth0
```

目的地址属于 `172.30.0.0/16` 时，走 overlay 网卡 `eth0`。

其他地址走默认路由 `172.18.0.1`，对应 `eth1` 和 `docker_gwbridge`。

测试外网：

```bash
docker exec c2 ping -c 3 baidu.com
```

实际结果：

```text
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 37.178/40.291/46.454 ms
```

同时在 docker01 的 `docker_gwbridge` 上抓包：

```bash
timeout 10 tcpdump -i docker_gwbridge -nn -c 2 icmp
```

另开终端执行：

```bash
docker exec c2 ping -c 2 baidu.com
```

抓到：

```text
IP 172.18.0.3 > 111.63.65.103: ICMP echo request
IP 111.63.65.103 > 172.18.0.3: ICMP echo reply
```

验证了外网流量是经过 `docker_gwbridge`，而不是走 overlay 的 VXLAN 隧道。

## 10. 抓取 VXLAN 跨主机报文

在 docker01 上执行抓包：

```bash
timeout 12 tcpdump -i ens33 -nn -vv -c 4 'udp port 4789'
```

另开终端产生跨主机流量：

```bash
docker exec c2 ping -c 4 172.30.0.1
```

关键报文：

```text
11.0.1.121.41805 > 11.0.1.122.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.3 > 172.30.0.1: ICMP echo request

11.0.1.122.44099 > 11.0.1.121.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.1 > 172.30.0.3: ICMP echo reply
```

抓包统计：

```text
4 packets captured
4 packets received by filter
0 packets dropped by kernel
```

跨主机容器是把容器原始报文封装进 VXLAN，再通过两台宿主机的 `ens33` 网络传输。

## 11. 实验环境清理

删除容器：

```bash
# docker01
docker rm -f c2

# docker02
docker rm -f c1
```

在manager上删除自定义网络：

```bash
docker network rm dawn-overlay
```

让worker离开集群：

```bash
# docker02
docker swarm leave
```

让manager离开并解散集群：

```bash
# docker01
docker swarm leave --force
```

清理后检查：

```bash
docker info --format '{{.Swarm.LocalNodeState}}'
docker network ls
docker ps -a
```
