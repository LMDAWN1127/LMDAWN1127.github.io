---
title: "Docker 实战：基于多 Bridge 网络的容器隔离与跨网络通信"
date: 2026-10-27T08:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "通过 xixi 与 haha 两个自定义 Bridge 网络，演示 Docker 默认网络隔离机制，以及 docker network connect/disconnect 在运行时动态加入/退出网络、实现跨网络容器互通的轻量组网手段。"
---

# Docker 实战：基于多 Bridge 网络的容器隔离与跨网络通信

本实验演示了在 Docker 中如何通过创建多个自定义 Bridge 网络实现网络隔离，以及如何利用 `docker network connect` 将一个容器动态加入另一个网络，实现跨网络容器的互通，最后演示如何使用 `docker network disconnect` 断开网络

---

## 实验拓扑

```text
实验拓扑（文本示意）

  网络 xixi  (172.21.0.0/16, 网关 172.21.0.254)
   └── c1.eth0 = 172.21.100.0

  网络 haha  (172.22.0.0/16, 网关 172.22.0.254)
   └── c2.eth0 = 172.22.100.0

  初始状态：c1 与 c2 分属不同 Bridge 网络 -> 默认隔离(iptables)，无法互通
  操作    ：docker network connect haha c1
  结果    ：c1 新增 eth1 = 172.22.100.1 -> 跨网络互通 OK
  回退    ：docker network disconnect haha c1 -> c1 移除 eth1，恢复隔离
```


---

## 1. 创建多个自定义网络

首先查看当前 Docker 主机上的默认网络列表

```bash
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
```

### 创建网络 `xixi`
- 网段：`172.21.0.0/16`
- IP 范围：`172.21.100.0/24`
- 网关：`172.21.0.254`

```bash
root@docker02:~# docker network create -d bridge --gateway 172.21.0.254 --ip-range 172.21.100.0/24 --subnet 172.21.0.0/16 xixi
583cf675a306b955c36d2749828569626f1629dafb72f938436fec670633bb6b
```

### 创建网络 `haha`
- 网段：`172.22.0.0/16`
- IP 范围：`172.22.100.0/24`
- 网关：`172.22.0.254`

```bash
root@docker02:~# docker network create -d bridge --gateway 172.22.0.254 --ip-range 172.22.100.0/24 --subnet 172.22.0.0/16 haha
609c120d64e622b3f5a6d955da3826854190a4dd10d1ada75513e42bf3aaec4b
```

### 验证网络创建结果

```bash
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
609c120d64e6   haha      bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
583cf675a306   xixi      bridge    local
```

### 查看网络详细信息

查看 `xixi` 网络配置

```bash
root@docker02:~# docker network inspect xixi
[
    {
        "Name": "xixi",
        "Id": "583cf675a306b955c36d2749828569626f1629dafb72f938436fec670633bb6b",
        "Created": "2026-10-27T05:08:44.825169015Z",
        "Scope": "local",
        "Driver": "bridge",
        "EnableIPv6": false,
        "IPAM": {
            "Driver": "default",
            "Options": {},
            "Config": [
                {
                    "Subnet": "172.21.0.0/16",
                    "IPRange": "172.21.100.0/24",
                    "Gateway": "172.21.0.254"
                }
            ]
        },
        "Internal": false,
        "Attachable": false,
        "Ingress": false,
        "ConfigFrom": {
            "Network": ""
        },
        "ConfigOnly": false,
        "Containers": {},
        "Options": {},
        "Labels": {}
    }
]
```

查看 `haha` 网络配置

```bash
root@docker02:~# docker network inspect haha
[
    {
        "Name": "haha",
        "Id": "609c120d64e622b3f5a6d955da3826854190a4dd10d1ada75513e42bf3aaec4b",
        "Created": "2026-10-27T05:09:05.773564638Z",
        "Scope": "local",
        "Driver": "bridge",
        "EnableIPv6": false,
        "IPAM": {
            "Driver": "default",
            "Options": {},
            "Config": [
                {
                    "Subnet": "172.22.0.0/16",
                    "IPRange": "172.22.100.0/24",
                    "Gateway": "172.22.0.254"
                }
            ]
        },
        "Internal": false,
        "Attachable": false,
        "Ingress": false,
        "ConfigFrom": {
            "Network": ""
        },
        "ConfigOnly": false,
        "Containers": {},
        "Options": {},
        "Labels": {}
    }
]
```

---

## 2. 启动容器分别加入不同网络

### 启动容器 `c1` 加入 `xixi` 网络

```bash
root@docker02:~# docker run -d --name c1 --network xixi uhub.service.ucloud.cn/dawn/apps:v1
631c6c8f1f8cd444c66d88915acabe1c8c44041a0bb827907709ef3c77521d35
```

查看容器 `c1` 的网络接口信息

```bash
root@docker02:~# docker exec c1 ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:64:00
          inet addr:172.21.100.0  Bcast:172.21.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:14 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1252 (1.2 KiB)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```
`c1` 的 `eth0` 分配到了 IP `172.21.100.0`

### 启动容器 `c2` 加入 `haha` 网络

```bash
root@docker02:~# docker run -d --name c2 --network haha uhub.service.ucloud.cn/dawn/apps:v1
212f2ec99af465975a8b63bf83a3b50adce8414e776c4bc766434a27a1b421e0
```

查看容器 `c2` 的网络接口信息与路由表

```bash
root@docker02:~# docker exec c2 ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:16:64:00
          inet addr:172.22.100.0  Bcast:172.22.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:13 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1182 (1.1 KiB)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```

```bash
root@docker02:~# docker exec -it c2 route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         172.22.0.254    0.0.0.0         UG    0      0        0 eth0
172.22.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth0
```
`c2` 的 `eth0` 分配到了 IP `172.22.100.0`，默认网关指向 `172.22.0.254`

---

## 3. 测试 c1 和 c2 连通性

进入容器 `c1` 内部进行网络连通性测试

```bash
root@docker02:~# docker exec -it c1 sh
```

### 测试 1：通过容器名尝试解析并 ping

```sh
/ # ping c2
ping: bad address 'c2'
```
由于 `c1` 和 `c2` 属于不同的自定义网络，Docker 内置 DNS 服务不会跨网络解析容器名

### 测试 2：通过 IP 地址尝试 ping

```sh
/ # ping 172.22.100.0 -c 3
PING 172.22.100.0 (172.22.100.0): 56 data bytes

--- 172.22.100.0 ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
```
不同 Bridge 网络之间通过 Linux iptables 规则隔离，因此数据包无法互通

---

## 4. 将 c1 容器添加至 c2 容器相同的网络

使用 `docker network connect` 命令将容器 `c1` 连接到 `haha` 网络中

```bash
root@docker02:~# docker network connect haha c1
```

查看 `c1` 当前的网络配置

```bash
root@docker02:~# docker exec c1 ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:64:00
          inet addr:172.21.100.0  Bcast:172.21.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:17 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1462 (1.4 KiB)  TX bytes:0 (0.0 B)

eth1      Link encap:Ethernet  HWaddr 02:42:AC:16:64:01
          inet addr:172.22.100.1  Bcast:172.22.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:8 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:656 (656.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```

容器 `c1` 中新增了网卡 `eth1`，分配到了 `haha` 网络的 IP 地址 `172.22.100.1`。此时 `c1` 同时拥有两个网络的通信能力

---

## 5. 再次测试连通性

在宿主机直接使用 `docker exec` 在 `c1` 内部向 `c2` 发送 ping 请求

```bash
root@docker02:~# docker exec c1 ping c2 -c 3
PING c2 (172.22.100.0): 56 data bytes
64 bytes from 172.22.100.0: seq=0 ttl=64 time=11.755 ms
64 bytes from 172.22.100.0: seq=1 ttl=64 time=0.082 ms
64 bytes from 172.22.100.0: seq=2 ttl=64 time=0.078 ms

--- c2 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.078/3.971/11.755 ms
```

连通成功

## 6. 断开网络

测试完成后，将 `c1` 从 `haha` 网络中断开

```bash
root@docker02:~# docker network disconnect haha c1 
```

再次检查 `c1` 的网络配置

```bash
root@docker02:~# docker exec c1 ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:64:00
          inet addr:172.21.100.0  Bcast:172.21.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:17 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1462 (1.4 KiB)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:4 errors:0 dropped:0 overruns:0 frame:0
          TX packets:4 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:210 (210.0 B)  TX bytes:210 (210.0 B)
```

网卡 eth1 已被动态卸载，c1 恢复为仅加入 xixi 网络的原有状态

## 小结

本文通过 `xixi` 与 `haha` 两个自定义 Bridge 网络，演示了 Docker 的网络隔离机制与运行时动态组网能力：

- **默认隔离**：不同自定义 Bridge 网络之间由 Linux iptables 规则隔离，既无法跨网 IP 互通，Docker 内置 DNS 也不会跨网络解析容器名；
- **动态加入**：`docker network connect <网络> <容器>` 可在容器运行时将其加入另一个网络，自动新增一块网卡并分配该网段 IP，从而实现跨网络通信；
- **动态退出**：`docker network disconnect <网络> <容器>` 可卸载对应网卡，使容器恢复原有隔离状态；
- **轻量运维**：connect/disconnect 不重建容器、不影响容器生命周期，是运行时调整网络拓扑的轻量手段，适用于临时排障、灰度联通等场景。

> 提示：容器名 DNS 解析仅在**同一自定义网络**内生效；跨网络互通依赖 `connect` 后共用网段，而非 DNS。
