---
title: "Docker 实战：Linux Namespace 网络隔离与 CGroup 资源限制"
date: 2026-10-28T10:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "用 ip netns 手工搭建 Linux 网络命名空间，经 veth pair 与 NAT 打通外网；再看 Docker 容器共享 net namespace；最后用 cgroup v2 做 CPU/内存限额压测并复现 OOM kill，完整串起容器的隔离(Namespace)与限制(CGroup)两大底层机制。"
---

# Docker 实战：Linux Namespace 网络隔离与 CGroup 资源限制

容器的“隔离”与“限制”分别由 Linux 内核的两项能力提供：**Namespace 负责资源隔离**，**CGroup 负责资源配额**。本文分三部分串起完整链路：先用 `ip netns` 手工搭一个网络命名空间，用 veth pair 打通它与宿主机并通过 NAT 访问外网；再看 Docker 容器如何共享同一个 net namespace；最后用 `--cpus` / `-m` 做 CPU、内存压测，观察 cgroup v2 的配额文件与被 OOM kill 的完整现象。

## 1. Linux network namespace 隔离

Linux Namespace是Linux系统提供的一种资源隔离机制，可实现系统资源隔离的列表如下:

- **IPC**：用于隔离进程间通信。
- **MNT**：用于隔离文件系统和提供硬盘挂载点。
- **NET**：用于隔离网络。
- **PID**：用于隔离进程ID。
- **User**：用于隔离用户和用户组。
- **UTS**：用于隔离HostName和DomainName。

### 1.1 创建命名空间并验证 lo

```bash
root@docker01:~# ip netns add dawn-linux

# 查看挂载点
root@docker01:~# ls -l /var/run/netns/
total 0
-r--r--r-- 1 root root 0 Oct 28 01:55 dawn-linux

# 初始 lo 处于 DOWN
root@docker01:~# ip netns exec dawn-linux ip a
1: lo: <LOOPBACK> mtu 65536 qdisc noop state DOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
```

启动 lo 前后对比：

```bash
# lo 未启动，ping 不通自己
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
ping: connect: Network is unreachable

# 启动 lo
root@docker01:~# ip netns exec dawn-linux ip link set lo up
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
PING 127.0.0.1 (127.0.0.1) 56(84) bytes of data.
64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=5.71 ms

--- 127.0.0.1 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 5.709/5.709/5.709/0.000 ms
```

### 1.2 创建 veth 对并移入命名空间

```bash
# 创建一对虚拟网卡
root@docker01:~# ip link add veth100 type veth peer name veth200
# 把 veth200 移入命名空间
root@docker01:~# ip link set veth200 netns dawn-linux
# 宿主机仍能看到 veth100
root@docker01:~# ip link show veth100
25: veth100@if24: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 72:0d:1b:68:aa:42 brd ff:ff:ff:ff:ff:ff link-netns dawn-linux
# 命名空间内看到 veth200
root@docker01:~# ip netns exec dawn-linux ip link show veth200
24: veth200@if25: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 9a:82:9c:85:bb:9a brd ff:ff:ff:ff:ff:ff link-netnsid 0
```

移入后，宿主机上 `veth200` 消失，命名空间内多出 `veth200`。

### 1.3 配置地址并互通

```bash
# 命名空间内
root@docker01:~# ip netns exec dawn-linux ip addr add 172.31.100.200/24 dev veth200
root@docker01:~# ip netns exec dawn-linux ip link set veth200 up

# 宿主机
root@docker01:~# ip addr add 172.31.100.100/24 dev veth100
root@docker01:~# ip link set veth100 up

# 双向互通
# 宿主机 → 命名空间
root@docker01:~# ping -c 2 172.31.100.200
PING 172.31.100.200 (172.31.100.200) 56(84) bytes of data.
64 bytes from 172.31.100.200: icmp_seq=1 ttl=64 time=6.06 ms
64 bytes from 172.31.100.200: icmp_seq=2 ttl=64 time=0.041 ms

--- 172.31.100.200 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 0.041/3.050/6.059/3.009 ms                       
# 命名空间 → 宿主机
root@docker01:~# ip netns exec dawn-linux ping -c 2 172.31.100.100
PING 172.31.100.100 (172.31.100.100) 56(84) bytes of data.
64 bytes from 172.31.100.100: icmp_seq=1 ttl=64 time=4.51 ms
64 bytes from 172.31.100.100: icmp_seq=2 ttl=64 time=0.020 ms

--- 172.31.100.100 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 0.020/2.265/4.510/2.245 ms
```

### 1.4 跨网段通信

加网关前失败：

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 1 11.0.1.122
ping: connect: Network is unreachable
```

添加默认网关：

```bash
root@docker01:~# ip netns exec dawn-linux ip route add default via 172.31.100.100
root@docker01:~# ip netns exec dawn-linux ip route show
default via 172.31.100.100 dev veth200
172.31.100.0/24 dev veth200 proto kernel scope link src 172.31.100.200
```

此时仍 ping 不通。抓包定位：

```bash
root@docker01:~# ip netns exec dawn-linux ping 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
# 能抓到 172.31.100.200 > 11.0.1.122 的请求
root@docker01:~# iptables -t nat -D POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
root@docker01:~# tcpdump -i veth100 -nn icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on veth100, link-type EN10MB (Ethernet), snapshot length 262144 bytes
02:18:26.167790 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 15, length 64
02:18:27.191802 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 16, length 64
02:18:28.215805 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 17, length 64
02:18:29.239838 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 18, length 64
02:18:30.263832 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 19, length 64
02:18:31.287775 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 20, length 64
02:18:32.311866 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 21, length 64
02:18:33.335942 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 22, length 64
02:18:34.359877 IP 172.31.100.200 > 11.0.1.122: ICMP echo request, id 22863, seq 23, length 64

# 抓不到任何报文
root@docker01:~# tcpdump -i ens33 -nn icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), snapshot length 262144 bytes
```

说明报文到了 `veth100` 却没被转发到 `ens33`，原因是 Docker 启动时把 FORWARD 链默认策略设为 DROP。

```bash
root@docker01:~# iptables -L FORWARD -n -v
Chain FORWARD (policy DROP 114 packets, 9576 bytes)
 pkts bytes target     prot opt in     out     source               destination
  114  9576 DOCKER-USER  all  --  *      *       0.0.0.0/0            0.0.0.0/0
  114  9576 DOCKER-ISOLATION-STAGE-1  all  --  *      *       0.0.0.0/0            0.0.0.0/0
    0     0 ACCEPT     all  --  *      docker0  0.0.0.0/0            0.0.0.0/0            ctstate 
```

因此需要三件事才能跨网段通信：

```bash
# 1. 开启内核转发
sysctl -w net.ipv4.ip_forward=1

# 2. 放行 FORWARD（Docker 环境必须）
iptables -I FORWARD 1 -s 172.31.100.0/24 -j ACCEPT
iptables -I FORWARD 2 -d 172.31.100.0/24 -j ACCEPT

# 3. SNAT 出口（让回包能回来）
iptables -t nat -A POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

验证成功：

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 3 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
64 bytes from 11.0.1.122: icmp_seq=1 ttl=63 time=0.379 ms
64 bytes from 11.0.1.122: icmp_seq=2 ttl=63 time=0.365 ms
64 bytes from 11.0.1.122: icmp_seq=3 ttl=63 time=0.440 ms

--- 11.0.1.122 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2030ms
rtt min/avg/max/mdev = 0.365/0.394/0.440/0.032 ms

# 公网 IP 也通
root@docker01:~# ip netns exec dawn-linux ping -c 2 223.5.5.5
PING 223.5.5.5 (223.5.5.5) 56(84) bytes of data.
64 bytes from 223.5.5.5: icmp_seq=1 ttl=127 time=30.8 ms
64 bytes from 223.5.5.5: icmp_seq=2 ttl=127 time=28.4 ms

--- 223.5.5.5 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 28.396/29.618/30.841/1.222 ms
```

### 1.5 清理命名空间

```bash
ip netns del dawn-linux
ip link del veth100    # 删除宿主机的 veth100（veth200 随命名空间一并删除）

# 还原防火墙规则
iptables -D FORWARD -s 172.31.100.0/24 -j ACCEPT
iptables -D FORWARD -d 172.31.100.0/24 -j ACCEPT
iptables -t nat -D POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

---

## 2. Docker 的 net namespace 与共享命名空间

### 2.1 查看容器的网络命名空间

```bash
# 容器 c2 的 PID
root@docker01:~# C2PID=$(docker inspect -f '{{.State.Pid}}' c2)

# 查看 c2 的 net namespace inode
root@docker01:~# readlink /proc/$C2PID/ns/net
net:[4026533022]
```

### 2.2 两个容器共享网络命名空间

```bash
root@docker01:~# docker run -d --name c3 --network container:c2 \
  --restart unless-stopped \
  uhub.service.ucloud.cn/dawn/apps:v1 tail -f /dev/null
c385fd2ed2dfa3cdbe69e1f851b90e6bc85c9e9123d216db9bed8af6837fab84
```

对比两个容器的 net namespace：

```bash
root@docker01:~# C3PID=$(docker inspect -f '{{.State.Pid}}' c3)
root@docker01:~# readlink /proc/$C2PID/ns/net
net:[4026533022]
root@docker01:~# readlink /proc/$C3PID/ns/net
net:[4026533022]

root@docker01:~# docker exec c2 ip a
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
16: eth0@if17: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1450 qdisc noqueue state UP
    link/ether 02:42:ac:1e:00:01 brd ff:ff:ff:ff:ff:ff
    inet 172.30.0.1/16 brd 172.30.255.255 scope global eth0
       valid_lft forever preferred_lft forever
18: eth1@if19: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1500 qdisc noqueue state UP
    link/ether 02:42:ac:12:00:03 brd ff:ff:ff:ff:ff:ff
    inet 172.18.0.3/16 brd 172.18.255.255 scope global eth1
       valid_lft forever preferred_lft forever
root@docker01:~# docker exec c3 ip a
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
16: eth0@if17: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1450 qdisc noqueue state UP
    link/ether 02:42:ac:1e:00:01 brd ff:ff:ff:ff:ff:ff
    inet 172.30.0.1/16 brd 172.30.255.255 scope global eth0
       valid_lft forever preferred_lft forever
18: eth1@if19: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1500 qdisc noqueue state UP
    link/ether 02:42:ac:12:00:03 brd ff:ff:ff:ff:ff:ff
    inet 172.18.0.3/16 brd 172.18.255.255 scope global eth1
       valid_lft forever preferred_lft forever
```

`c3` 与 `c2` 的 `net` inode 完全一致，说明二者共享同一个网络命名空间，`c3` 内部看到的 IP 与 `c2` 相同

---

## 3. cgroup 资源限制

Linux CGroup全称Linux Control Group， 是Linux内核的一个功能，用来限制，控制与分离一个进程组群的资源（如CPU、内存、磁盘输入输出等）。

在Linux系统中能够控制的资源列表如下:

- **cpu**：主要限制进程的cpu使用率。
- **cpuacct**：可以统计cgroups中的进程的cpu使用报告。
- **cpuset**：可以为cgroups中的进程分配单独的cpu节点或者内存节点。
- **memory**：可以限制进程的memory使用量。
- **blkio**：可以限制进程的块设备io。
- **devices**：可以控制进程能够访问某些设备。
- **net_cls**：可以标记cgroups中进程的网络数据包，然后可以使用tc模块（traffic control）对数据包进行控制。
- **net_prio**：这个子系统用来设计网络流量的优先级。
- **freezer**：可以挂起或者恢复cgroups中的进程。
- **ns**：可以使不同cgroups下面的进程使用不同的namespace。
- **hugetlb**：这个子系统主要针对于HugeTLB系统进行限制，这是一个大页文件系统。

### 3.1 检测当前系统正在使用的cgroup版本

```bash
root@docker01:~# stat -fc %T /sys/fs/cgroup
cgroup2fs
```

### 3.2 启动无限制与有限制容器

```bash
# 无限制
root@docker01:~# docker run -d --name cgroup1 uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
df316f18223a1497a1ca74357cb57ef4537fc0b3e010fab2f1b81edc8698cf36
# 限制 0.3 核 + 128M 内存
root@docker01:~# docker run -d --name cgroup2 --cpus 0.3 -m 128m \
  uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
48e4f3dcd924e709c208d97f27b22a2694f7d4f521bac8dd38aa7145d2b0f515
```

查看 cgroup v2 配置：

```bash
root@docker01:~# for n in cgroup1 cgroup2; do
  CID=$(docker inspect $n --format '{{.Id}}')
  echo "[$n] cpu.max:    $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.max)"
  echo "[$n] memory.max: $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/memory.max)"
done
[cgroup1] cpu.max:    max 100000   # 无限制
[cgroup1] memory.max: max          # 无限制
[cgroup2] cpu.max:    30000 100000 # 0.3 核
[cgroup2] memory.max: 134217728    # 128 MiB
```

`cpu.max` 格式为 `<quota> <period>`：`30000/100000 = 0.3` 核

### 3.3 CPU 压测对比

在两个容器内分别跑两个 `dd` 死循环（压满 CPU）：

```bash
root@docker01:~# docker exec -d cgroup1 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker exec -d cgroup2 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}}' cgroup1 cgroup2
cgroup1 CPU=169.66% # 无限制，几乎吃满 2 核
cgroup2 CPU=29.87%  # 限制 0.3 核，稳定在30%
```

### 3.4 内存上限与运行中 update

内存限制确认：

```bash
root@docker01:~# docker stats --no-stream --format '{{.Name}} MEM={{.MemUsage}}/{{.MemPerc}}' cgroup1 cgroup2
cgroup1 MEM=5.113MiB / 3.785GiB/0.13% # 上限=宿主机全部内存
cgroup2 MEM=1.688MiB / 128MiB/1.32%   # 上限=128MiB
```

对运行中的容器动态调整限制：

```bash
root@docker01:~# docker update --cpus 0.2 -m 64m --memory-swap 64m cgroup1
cgroup1
```

更新后：

```bash
root@docker01:~# for n in cgroup1 cgroup2; do
  CID=$(docker inspect $n --format '{{.Id}}')
  echo "[$n] cpu.max:    $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.max)"
  echo "[$n] memory.max: $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/memory.max)"
done
[cgroup1] cpu.max:    20000 100000
[cgroup1] memory.max: 67108864
[cgroup2] cpu.max:    30000 100000
[cgroup2] memory.max: 134217728
```

### 3.5 OOM kill（使用 stress 镜像）

内存限制最初用 es 镜像演示时，因 `/dev/shm` 默认仅 64M、镜像内无 `stress`/`python3`，用 `dd` 写 `/dev/shm` 无法直观触发 OOM。现改用专门压测镜像演示OOM kill。

拉取专门压测镜像：

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/stress:1.0.4
```

该镜像支持 `--vm` / `--vm-bytes` 做内存分配压测。

受限容器（128M）分配 256M 内存，触发 OOM：

```bash
root@docker01:~# docker run -d --name oom-test --memory 128m --memory-swap 128m \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 30s
29d2a42f1f2dfaf840adb1a4b27bd5537cf842c70e629b01933cb7317ef98fe2
```

结果：

```bash
root@docker01:~# docker logs oom-test
stress: info: [1] dispatching hogs: 0 cpu, 0 io, 1 vm, 0 hdd
stress: FAIL: [1] (415) <-- worker 6 got signal 9   # SIGKILL
stress: WARN: [1] (417) now reaping child worker processes
stress: FAIL: [1] (421) kill error: No such process
stress: FAIL: [1] (451) failed run completed in 0s # 几乎被瞬间杀掉

root@docker01:~# docker inspect oom-test --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=true ExitCode=1
```

```bash
root@docker01:~# docker ps -a
CONTAINER ID   IMAGE                                              COMMAND                  CREATED          STATUS                     PORTS                                   NAMES
29d2a42f1f2d   uhub.service.ucloud.cn/dawn/stress:1.0.4           "stress --vm 1 --vm-…"   5 minutes ago    Exited (1) 5 minutes ago                                           oom-test
```

对照组（无内存限制）分配同样 256M，正常完成：

```bash
root@docker01:~# docker run -d --name oom-ctrl \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 8s
10d549fd94e2d68f23b19829c078760fe14ca559dde8d6e71afbb55beb1dc333
```

结果：

```bash
root@docker01:~# docker inspect oom-ctrl --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=false ExitCode=0
```
