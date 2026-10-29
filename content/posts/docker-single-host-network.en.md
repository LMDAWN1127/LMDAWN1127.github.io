---
title: "Docker in Practice: Single-Host Network Types and Container Communication Options"
date: 2026-10-27T09:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker single-host networking: the five network types none, bridge, host, container and custom, with hands-on examples, plus three container-to-container communication options - /etc/hosts resolution, --link, and custom networks (including create, inspect, prune, custom subnets and manual IP assignment)."
---

# Docker in Practice: Single-Host Network Types and Container Communication Options

## 1. Docker Single-Host Network Types

### 1. Docker Has Five Single-Host Network Types by Default

none:

No network is allocated at all; only the local loopback interface lo exists.

bridge:

A bridged network. This is the default network type for containers and it creates a virtual device pair (veth).

host:

Uses the host network. No virtual device pair is created; instead it shares the network namespace with the host. This network type therefore has the highest efficiency.

container:

It also does not create a new virtual device pair; it uses the same network namespace as an already existing container.

custom network:

A custom Docker network type. You have to create the network yourself, and the custom network lets containers reach each other by container name - it is equivalent to having a built-in DNS feature.

### 2. Hands-on Examples

#### 2.1 List the existing network types

```bash
root@docker02:~# docker network list
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
```

#### 2.2 Start the containers

```bash
root@docker02:~# docker run -d --name c1-none --network none uhub.service.ucloud.cn/dawn/apps:v1
e2676be7a2c916a2b0347fa04e027bed8b82b9f9023dcd8920a91ce57537424c
root@docker02:~# docker run -d --name c2-bridge --network bridge uhub.service.ucloud.cn/dawn/apps:v1
381703fff9f3a15f0434ba051ac01a0f97d08c3ef59be685fe07ad14f067badc
root@docker02:~# docker run -d --name c3  uhub.service.ucloud.cn/dawn/apps:v1
63e2b89ab1bc818a4bb36012bb2f1a22fd4d64c4d8fe7a6f39bc902f656a7c4c
root@docker02:~# docker run -d --name c4-host --network host  uhub.service.ucloud.cn/dawn/apps:v1
3e99d8b0e3e2390f95da89e631464fc336d9890e86e65e5cbc76373e5f15ac93
root@docker02:~# docker run -d --name c5-container --network container:c3  uhub.service.ucloud.cn/dawn/apps:v1 sleep 3600
fef6e89c37319a2d5265851e37f815986483658c4df382df62f7600a16fa6c8e
root@docker02:~# docker ps
CONTAINER ID   IMAGE                                 COMMAND                  CREATED          STATUS          PORTS     NAMES
fef6e89c3731   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   7 seconds ago    Up 7 seconds              c5-container
3e99d8b0e3e2   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   20 seconds ago   Up 20 seconds             c4-host
63e2b89ab1bc   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   29 seconds ago   Up 29 seconds   80/tcp    c3
381703fff9f3   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   44 seconds ago   Up 44 seconds   80/tcp    c2-bridge
e2676be7a2c9   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   55 seconds ago   Up 54 seconds             c1-none
```

#### 2.3 Check the IP address of each container

```bash
root@docker02:~# docker exec c1-none ifconfig -a
lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

root@docker02:~# docker exec c2-bridge ifconfig -a
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:02
          inet addr:172.17.0.2  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:15 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1322 (1.2 KiB)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

root@docker02:~# docker exec c3 ifconfig -a
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:03
          inet addr:172.17.0.3  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:10 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:796 (796.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

root@docker02:~# docker exec c4-host ifconfig -a
docker0   Link encap:Ethernet  HWaddr 02:42:4D:70:11:0D
          inet addr:172.17.0.1  Bcast:172.17.255.255  Mask:255.255.0.0
          inet6 addr: fe80::42:4dff:fe70:110d/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:5 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:526 (526.0 B)

ens33     Link encap:Ethernet  HWaddr 00:0C:29:41:61:DF
          inet addr:11.0.1.122  Bcast:11.0.1.255  Mask:255.255.255.0
          inet6 addr: fe80::20c:29ff:fe41:61df/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:723 errors:0 dropped:0 overruns:0 frame:0
          TX packets:347 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:472448 (461.3 KiB)  TX bytes:50291 (49.1 KiB)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:92 errors:0 dropped:0 overruns:0 frame:0
          TX packets:92 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:7352 (7.1 KiB)  TX bytes:7352 (7.1 KiB)

veth3bdfcfd Link encap:Ethernet  HWaddr C6:8F:98:04:EE:EF
          inet6 addr: fe80::c48f:98ff:fe04:eeef/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:15 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:1322 (1.2 KiB)

vetha05a5db Link encap:Ethernet  HWaddr 52:09:1A:CB:B7:CB
          inet6 addr: fe80::5009:1aff:fecb:b7cb/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:10 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:796 (796.0 B)

root@docker02:~# ifconfig
docker0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 172.17.0.1  netmask 255.255.0.0  broadcast 172.17.255.255
        inet6 fe80::42:4dff:fe70:110d  prefixlen 64  scopeid 0x20<link>
        ether 02:42:4d:70:11:0d  txqueuelen 0  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 5  bytes 526 (526.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

ens33: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 11.0.1.122  netmask 255.255.255.0  broadcast 11.0.1.255
        inet6 fe80::20c:29ff:fe41:61df  prefixlen 64  scopeid 0x20<link>
        ether 00:0c:29:41:61:df  txqueuelen 1000  (Ethernet)
        RX packets 741  bytes 473768 (473.7 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 360  bytes 52913 (52.9 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0
        inet6 ::1  prefixlen 128  scopeid 0x10<host>
        loop  txqueuelen 1000  (Local Loopback)
        RX packets 92  bytes 7352 (7.3 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 92  bytes 7352 (7.3 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

veth3bdfcfd: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet6 fe80::c48f:98ff:fe04:eeef  prefixlen 64  scopeid 0x20<link>
        ether c6:8f:98:04:ee:ef  txqueuelen 0  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 16  bytes 1392 (1.3 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

vetha05a5db: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet6 fe80::5009:1aff:fecb:b7cb  prefixlen 64  scopeid 0x20<link>
        ether 52:09:1a:cb:b7:cb  txqueuelen 0  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 10  bytes 796 (796.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

root@docker02:~# docker exec c5-container ifconfig -a
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:03
          inet addr:172.17.0.3  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:10 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:796 (796.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```

Using the host network is the most efficient, because it removes two packet encapsulation steps;

If several containers share the same network, avoid port conflicts, otherwise the container will fail to start.

## 2. Three Options for Single-Host Container Communication

### 1. Add hosts resolution

```bash
root@docker02:~# docker run -d --name c1 --network bridge uhub.service.ucloud.cn/dawn/apps:v1
9b9ff369625e2e9486f16b4f0bd739d42759842151418c3b5ac3b69c67841ef5
root@docker02:~# docker run -d --name c2 --network bridge uhub.service.ucloud.cn/dawn/apps:v1
d540343cf595c733a64147738952ad35c4965b169baac0a0857dafa6c5b29742
root@docker02:~# docker exec c1 ifconfig -a
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:02
          inet addr:172.17.0.2  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:11 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:946 (946.0 B)  TX bytes:0 (0.0 B)

lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          inet6 addr: ::1/128 Scope:Host
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

root@docker02:~# docker exec c2 ifconfig -a
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:03
          inet addr:172.17.0.3  Bcast:172.17.255.255  Mask:255.255.0.0
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

root@docker02:~# docker exec -it c1 sh
/ # ping 172.17.0.3
PING 172.17.0.3 (172.17.0.3): 56 data bytes
64 bytes from 172.17.0.3: seq=0 ttl=64 time=28.075 ms
64 bytes from 172.17.0.3: seq=1 ttl=64 time=0.077 ms
64 bytes from 172.17.0.3: seq=2 ttl=64 time=0.073 ms
64 bytes from 172.17.0.3: seq=3 ttl=64 time=0.082 ms
64 bytes from 172.17.0.3: seq=4 ttl=64 time=0.084 ms
64 bytes from 172.17.0.3: seq=5 ttl=64 time=0.078 ms
64 bytes from 172.17.0.3: seq=6 ttl=64 time=0.084 ms
64 bytes from 172.17.0.3: seq=7 ttl=64 time=0.075 ms
^C
--- 172.17.0.3 ping statistics ---
8 packets transmitted, 8 packets received, 0% packet loss
round-trip min/avg/max = 0.073/3.578/28.075 ms
/ # ping c2
ping: bad address 'c2'
/ # echo 172.17.0.3 c2 >> /etc/hosts
/ # ping c2
PING c2 (172.17.0.3): 56 data bytes
64 bytes from 172.17.0.3: seq=0 ttl=64 time=3.165 ms
64 bytes from 172.17.0.3: seq=1 ttl=64 time=0.075 ms
64 bytes from 172.17.0.3: seq=2 ttl=64 time=0.091 ms
64 bytes from 172.17.0.3: seq=3 ttl=64 time=0.071 ms
64 bytes from 172.17.0.3: seq=4 ttl=64 time=0.076 ms
^C
--- c2 ping statistics ---
5 packets transmitted, 5 packets received, 0% packet loss
round-trip min/avg/max = 0.071/0.695/3.165 ms
/ # exit
root@docker02:~# docker exec -it c2 sh
/ # ping 172.17.0.2
PING 172.17.0.2 (172.17.0.2): 56 data bytes
64 bytes from 172.17.0.2: seq=0 ttl=64 time=2.077 ms
64 bytes from 172.17.0.2: seq=1 ttl=64 time=0.072 ms
64 bytes from 172.17.0.2: seq=2 ttl=64 time=0.083 ms
^C
--- 172.17.0.2 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.072/0.744/2.077 ms
/ # ping c1
ping: bad address 'c1'
/ # echo 172.17.0.2 c1 >> /etc/hosts
/ # ping c1
PING c1 (172.17.0.2): 56 data bytes
64 bytes from 172.17.0.2: seq=0 ttl=64 time=0.060 ms
64 bytes from 172.17.0.2: seq=1 ttl=64 time=0.072 ms
64 bytes from 172.17.0.2: seq=2 ttl=64 time=0.075 ms
64 bytes from 172.17.0.2: seq=3 ttl=64 time=0.073 ms
64 bytes from 172.17.0.2: seq=4 ttl=64 time=0.071 ms
^C
--- c1 ping statistics ---
5 packets transmitted, 5 packets received, 0% packet loss
round-trip min/avg/max = 0.060/0.070/0.075 ms
/ #
```

### 2. Link containers with --link

```bash
root@docker02:~# docker run -d --network bridge --name c1 uhub.service.ucloud.cn/dawn/apps:v1
634bcc802c658ef5b3fc321234740d0bb85398c31d75a78e9ed7b17c89c738e2
root@docker02:~# docker run -d  --name c2 --link c1 uhub.service.ucloud.cn/dawn/apps:v1
d02af6e57c8b868c8957417026dde0eaaad580d6126f49f0e04505f609e168df
root@docker02:~# docker exec c2 ping -c 3 c1
PING c1 (172.17.0.2): 56 data bytes
64 bytes from 172.17.0.2: seq=0 ttl=64 time=11.676 ms
64 bytes from 172.17.0.2: seq=1 ttl=64 time=0.069 ms
64 bytes from 172.17.0.2: seq=2 ttl=64 time=0.073 ms

--- c1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.069/3.939/11.676 ms
root@docker02:~# docker exec c2 cat /etc/hosts
127.0.0.1       localhost
::1     localhost ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
172.17.0.2      c1 634bcc802c65
172.17.0.3      d02af6e57c8b
```

With the hosts resolution approach, when a container IP address changes you have to edit the hosts file by hand;

When containers are linked with --link, if the linked container restarts and its IP address changes, the hosts mapping IP is updated automatically;

Using "--link" has a drawback: the linked container must be running; if it is not running, the container cannot start.

### 3. Custom network

#### 1. List the existing networks

```bash
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
```

#### 2. Create a custom network

```bash
root@docker02:~# docker network create dawn
90f334b56ee35760aae92a77dfd899c4c2214552ea00ff91f5e0bd7850747626
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
90f334b56ee3   dawn      bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
```

#### 3. Inspect the network

```bash
root@docker02:~# docker network inspect dawn
[
    {
        "Name": "dawn",
        "Id": "90f334b56ee35760aae92a77dfd899c4c2214552ea00ff91f5e0bd7850747626",
        "Created": "2026-10-27T01:44:44.135418304Z",
        "Scope": "local",
        "Driver": "bridge",
        "EnableIPv6": false,
        "IPAM": {
            "Driver": "default",
            "Options": {},
            "Config": [
                {
                    "Subnet": "172.18.0.0/16",
                    "Gateway": "172.18.0.1"
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

#### 4. Start containers on the custom network

```bash
root@docker02:~# docker run -d --name c1 --network dawn uhub.service.ucloud.cn/dawn/apps:v1
924a84cbfb61c6768dab734fc4edd377f8c0e5cd58603152343ceea596e67867
root@docker02:~# docker run -d --name c2 --network dawn uhub.service.ucloud.cn/dawn/apps:v1
2aa144764086e02faf86db5979f696756cc773fc9b34027272f1805eb3d3968c
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" c1
172.18.0.2
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" c2
172.18.0.3
```

#### 5. Verify communication between containers on the custom network

```bash
root@docker02:~# docker exec -it c1 sh
/ # cat /etc/hosts
127.0.0.1       localhost
::1     localhost ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
172.18.0.2      924a84cbfb61
/ # ping c2 -c 3
PING c2 (172.18.0.3): 56 data bytes
64 bytes from 172.18.0.3: seq=0 ttl=64 time=3.143 ms
64 bytes from 172.18.0.3: seq=1 ttl=64 time=0.085 ms
64 bytes from 172.18.0.3: seq=2 ttl=64 time=0.077 ms

--- c2 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.077/1.101/3.143 ms
/ #
```

#### 6. Remove unused networks

```bash
root@docker02:~# docker network create  xixi
186305bb46cf1eb4c1e86a76eb75c3b6e0f053a655e17e8ca6efc457149b65f3
root@docker02:~# docker network create  haha
7fba716d08ed1200fbca1d1b42286a893d7bc329f8a25817ad063dc980f3ebf2
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
90f334b56ee3   dawn      bridge    local
7fba716d08ed   haha      bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
186305bb46cf   xixi      bridge    local
root@docker02:~# docker network prune -f
Deleted Networks:
dawn
xixi
haha

root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
```

Running "docker network prune -f" removes all unused custom networks;

The default networks (none, host, bridge) cannot be removed.

#### 7. Remove a specific network

```bash
root@docker02:~# docker network create xixi
8ef453f7b4a33594c4376cc8c1341ddcb9daa8876d6812dd1ae1be5f3a6fdf90
root@docker02:~# docker network create  haha
0ab3e0b4cb879aa305ec40a227826268f57e3ddbfcb58b2546d63aece40697ea
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
0ab3e0b4cb87   haha      bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
8ef453f7b4a3   xixi      bridge    local
root@docker02:~# docker network rm xixi haha
xixi
haha
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
```

#### 8. When creating a network you can customize the gateway, IP address range, subnet range, network type and more
##### 8.1 Create a custom subnet

```bash
root@docker02:~# docker network create -d bridge --gateway 172.21.0.254 --ip-range 172.21.100.0/24 --subnet 172.21.0.0/16 dawn
b4bc4bdf19e7d24fc564f1dcb103d35d5e2c492f7fdb6a3fec9017b335f939d7
root@docker02:~# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
2cca2f2fcd8d   bridge    bridge    local
b4bc4bdf19e7   dawn      bridge    local
d480eece0b34   host      host      local
73e2eaa95d1e   none      null      local
```
##### 8.2 Inspect the custom network

```bash
root@docker02:~# docker network inspect dawn
[
    {
        "Name": "dawn",
        "Id": "b4bc4bdf19e7d24fc564f1dcb103d35d5e2c492f7fdb6a3fec9017b335f939d7",
        "Created": "2026-10-27T01:54:09.497375438Z",
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
##### 8.3 Attach containers to the custom network

```bash
root@docker02:~# docker container run -d --name c1 --network dawn uhub.service.ucloud.cn/dawn/apps:v1
2d2c5db8cd2018607ef3efd75e9dfd8244097056fcca480451c1cf6f5c13eee1
root@docker02:~# docker container run -d --name c2 --network dawn uhub.service.ucloud.cn/dawn/apps:v1
47fef5f6a507f696fa5c4049e479c4e2f0a286f799577723e7a6e89151d6e490
root@docker02:~# docker exec c1 ifconfig eth0
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:64:00
          inet addr:172.21.100.0  Bcast:172.21.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:13 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:1182 (1.1 KiB)  TX bytes:0 (0.0 B)

root@docker02:~# docker exec c2 ifconfig eth0
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:64:01
          inet addr:172.21.100.1  Bcast:172.21.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:8 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:656 (656.0 B)  TX bytes:0 (0.0 B)
```
##### 8.4 Assign an IP address manually

```bash
root@docker02:~# docker container run -d --name c3 --network dawn --ip 172.21.1.102 uhub.service.ucloud.cn/dawn/apps:v1
6732c957624d4b832447bde3f497156ec95b01f88f9b09c40318c1e7d5330602
root@docker02:~# docker exec c3 ifconfig eth0
eth0      Link encap:Ethernet  HWaddr 02:42:AC:15:01:66
          inet addr:172.21.1.102  Bcast:172.21.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:8 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:656 (656.0 B)  TX bytes:0 (0.0 B)
```
##### 8.5 Test connectivity between containers and IP addresses

```bash
root@docker02:~# docker exec c3 ping c1 -c 3
PING c1 (172.21.100.0): 56 data bytes
64 bytes from 172.21.100.0: seq=0 ttl=64 time=0.439 ms
64 bytes from 172.21.100.0: seq=1 ttl=64 time=0.081 ms
64 bytes from 172.21.100.0: seq=2 ttl=64 time=0.078 ms

--- c1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.078/0.199/0.439 ms
root@docker02:~# docker exec c3 ping c2 -c 3
PING c2 (172.21.100.1): 56 data bytes
64 bytes from 172.21.100.1: seq=0 ttl=64 time=9.331 ms
64 bytes from 172.21.100.1: seq=1 ttl=64 time=0.080 ms
64 bytes from 172.21.100.1: seq=2 ttl=64 time=0.145 ms

--- c2 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 0.080/3.185/9.331 ms
```
