---
title: "Docker in Practice: Linux Namespace Network Isolation and CGroup Resource Limits"
date: 2026-10-28T10:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Build a Linux network namespace by hand with ip netns, connect it to the outside world through a veth pair and NAT, then see how Docker containers share a net namespace; finally stress CPU and memory under cgroup v2 limits and reproduce an OOM kill, tying together the two low-level mechanisms behind containers: isolation (Namespace) and limits (CGroup)."
---

# Docker in Practice: Linux Namespace Network Isolation and CGroup Resource Limits

The "isolation" and "limits" of a container come from two capabilities of the Linux kernel: **Namespace provides resource isolation** and **CGroup provides resource quotas**. This article strings the whole chain together in three parts: first build a network namespace by hand with `ip netns`, connect it to the host with a veth pair and reach the outside world through NAT; then see how Docker containers share one net namespace; finally run CPU and memory stress tests with `--cpus` / `-m` and watch the cgroup v2 quota files and the full picture of being killed by OOM.

## 1. Linux network namespace isolation

Linux Namespace is a resource isolation mechanism provided by the Linux system. The resources it can isolate are listed below:

- **IPC**: isolates inter-process communication.
- **MNT**: isolates file systems and provides disk mount points.
- **NET**: isolates the network.
- **PID**: isolates process IDs.
- **User**: isolates users and groups.
- **UTS**: isolates HostName and DomainName.

### 1.1 Create the namespace and verify lo

```bash
root@docker01:~# ip netns add dawn-linux

# inspect the mount points
root@docker01:~# ls -l /var/run/netns/
total 0
-r--r--r-- 1 root root 0 Oct 28 01:55 dawn-linux

# lo is DOWN initially
root@docker01:~# ip netns exec dawn-linux ip a
1: lo: <LOOPBACK> mtu 65536 qdisc noop state DOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
```

Before and after bringing lo up:

```bash
# lo is not up, it cannot ping itself
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
ping: connect: Network is unreachable

# bring lo up
root@docker01:~# ip netns exec dawn-linux ip link set lo up
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
PING 127.0.0.1 (127.0.0.1) 56(84) bytes of data.
64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=5.71 ms

--- 127.0.0.1 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 5.709/5.709/5.709/0.000 ms
```

### 1.2 Create a veth pair and move it into the namespace

```bash
# create a pair of virtual NICs
root@docker01:~# ip link add veth100 type veth peer name veth200
# move veth200 into the namespace
root@docker01:~# ip link set veth200 netns dawn-linux
# the host can still see veth100
root@docker01:~# ip link show veth100
25: veth100@if24: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 72:0d:1b:68:aa:42 brd ff:ff:ff:ff:ff:ff link-netns dawn-linux
# veth200 is visible inside the namespace
root@docker01:~# ip netns exec dawn-linux ip link show veth200
24: veth200@if25: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 9a:82:9c:85:bb:9a brd ff:ff:ff:ff:ff:ff link-netnsid 0
```

After the move, `veth200` disappears from the host and shows up inside the namespace.

### 1.3 Configure addresses and reach each other

```bash
# inside the namespace
root@docker01:~# ip netns exec dawn-linux ip addr add 172.31.100.200/24 dev veth200
root@docker01:~# ip netns exec dawn-linux ip link set veth200 up

# on the host
root@docker01:~# ip addr add 172.31.100.100/24 dev veth100
root@docker01:~# ip link set veth100 up

# reachable in both directions
# host -> namespace
root@docker01:~# ping -c 2 172.31.100.200
PING 172.31.100.200 (172.31.100.200) 56(84) bytes of data.
64 bytes from 172.31.100.200: icmp_seq=1 ttl=64 time=6.06 ms
64 bytes from 172.31.100.200: icmp_seq=2 ttl=64 time=0.041 ms

--- 172.31.100.200 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 0.041/3.050/6.059/3.009 ms                       
# namespace -> host
root@docker01:~# ip netns exec dawn-linux ping -c 2 172.31.100.100
PING 172.31.100.100 (172.31.100.100) 56(84) bytes of data.
64 bytes from 172.31.100.100: icmp_seq=1 ttl=64 time=4.51 ms
64 bytes from 172.31.100.100: icmp_seq=2 ttl=64 time=0.020 ms

--- 172.31.100.100 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 0.020/2.265/4.510/2.245 ms
```

### 1.4 Communication across network segments

Before adding the gateway it fails:

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 1 11.0.1.122
ping: connect: Network is unreachable
```

Add the default gateway:

```bash
root@docker01:~# ip netns exec dawn-linux ip route add default via 172.31.100.100
root@docker01:~# ip netns exec dawn-linux ip route show
default via 172.31.100.100 dev veth200
172.31.100.0/24 dev veth200 proto kernel scope link src 172.31.100.200
```

It still cannot ping at this point. Locate the cause by capturing packets:

```bash
root@docker01:~# ip netns exec dawn-linux ping 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
# can capture requests 172.31.100.200 > 11.0.1.122
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

# no packets captured at all
root@docker01:~# tcpdump -i ens33 -nn icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), snapshot length 262144 bytes
```

This shows the packets reached `veth100` but were not forwarded to `ens33`, because Docker sets the default policy of the FORWARD chain to DROP when it starts.

```bash
root@docker01:~# iptables -L FORWARD -n -v
Chain FORWARD (policy DROP 114 packets, 9576 bytes)
 pkts bytes target     prot opt in     out     source               destination
  114  9576 DOCKER-USER  all  --  *      *       0.0.0.0/0            0.0.0.0/0
  114  9576 DOCKER-ISOLATION-STAGE-1  all  --  *      *       0.0.0.0/0            0.0.0.0/0
    0     0 ACCEPT     all  --  *      docker0  0.0.0.0/0            0.0.0.0/0            ctstate 
```

So three things are needed to communicate across network segments:

```bash
# 1. enable kernel forwarding
sysctl -w net.ipv4.ip_forward=1

# 2. allow FORWARD (required in a Docker environment)
iptables -I FORWARD 1 -s 172.31.100.0/24 -j ACCEPT
iptables -I FORWARD 2 -d 172.31.100.0/24 -j ACCEPT

# 3. SNAT on egress (so reply packets can come back)
iptables -t nat -A POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

Verification succeeds:

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 3 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
64 bytes from 11.0.1.122: icmp_seq=1 ttl=63 time=0.379 ms
64 bytes from 11.0.1.122: icmp_seq=2 ttl=63 time=0.365 ms
64 bytes from 11.0.1.122: icmp_seq=3 ttl=63 time=0.440 ms

--- 11.0.1.122 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2030ms
rtt min/avg/max/mdev = 0.365/0.394/0.440/0.032 ms

# the public IP is reachable too
root@docker01:~# ip netns exec dawn-linux ping -c 2 223.5.5.5
PING 223.5.5.5 (223.5.5.5) 56(84) bytes of data.
64 bytes from 223.5.5.5: icmp_seq=1 ttl=127 time=30.8 ms
64 bytes from 223.5.5.5: icmp_seq=2 ttl=127 time=28.4 ms

--- 223.5.5.5 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 28.396/29.618/30.841/1.222 ms
```

### 1.5 Clean up the namespace

```bash
ip netns del dawn-linux
ip link del veth100    # delete veth100 on the host (veth200 goes away with the namespace)

# restore the firewall rules
iptables -D FORWARD -s 172.31.100.0/24 -j ACCEPT
iptables -D FORWARD -d 172.31.100.0/24 -j ACCEPT
iptables -t nat -D POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

---

## 2. The Docker net namespace and sharing a namespace

### 2.1 Inspect the network namespace of a container

```bash
# the PID of container c2
root@docker01:~# C2PID=$(docker inspect -f '{{.State.Pid}}' c2)

# inspect the net namespace inode of c2
root@docker01:~# readlink /proc/$C2PID/ns/net
net:[4026533022]
```

### 2.2 Two containers sharing a network namespace

```bash
root@docker01:~# docker run -d --name c3 --network container:c2 \
  --restart unless-stopped \
  uhub.service.ucloud.cn/dawn/apps:v1 tail -f /dev/null
c385fd2ed2dfa3cdbe69e1f851b90e6bc85c9e9123d216db9bed8af6837fab84
```

Compare the net namespaces of the two containers:

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

The `net` inode of `c3` is exactly the same as that of `c2`, which shows they share the same network namespace, and the IP seen inside `c3` is the same as that of `c2`

---

## 3. cgroup resource limits

Linux CGroup, whose full name is Linux Control Group, is a Linux kernel feature used to limit, control and separate the resources of a process group (such as CPU, memory and disk I/O).

The resources that can be controlled in a Linux system are listed below:

- **cpu**: mainly limits the CPU usage of processes.
- **cpuacct**: reports the CPU usage of processes in cgroups.
- **cpuset**: assigns dedicated CPU nodes or memory nodes to processes in cgroups.
- **memory**: limits the memory usage of processes.
- **blkio**: limits the block device I/O of processes.
- **devices**: controls which devices a process can access.
- **net_cls**: marks the network packets of processes in cgroups so the tc module (traffic control) can control them.
- **net_prio**: this subsystem designs the priority of network traffic.
- **freezer**: suspends or resumes processes in cgroups.
- **ns**: lets processes in different cgroups use different namespaces.
- **hugetlb**: this subsystem mainly limits the HugeTLB system, which is a huge page file system.

### 3.1 Detect the cgroup version the current system is using

```bash
root@docker01:~# stat -fc %T /sys/fs/cgroup
cgroup2fs
```

### 3.2 Start a container with no limits and one with limits

```bash
# no limits
root@docker01:~# docker run -d --name cgroup1 uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
df316f18223a1497a1ca74357cb57ef4537fc0b3e010fab2f1b81edc8698cf36
# limit 0.3 cores + 128M memory
root@docker01:~# docker run -d --name cgroup2 --cpus 0.3 -m 128m \
  uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
48e4f3dcd924e709c208d97f27b22a2694f7d4f521bac8dd38aa7145d2b0f515
```

Inspect the cgroup v2 configuration:

```bash
root@docker01:~# for n in cgroup1 cgroup2; do
  CID=$(docker inspect $n --format '{{.Id}}')
  echo "[$n] cpu.max:    $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.max)"
  echo "[$n] memory.max: $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/memory.max)"
done
[cgroup1] cpu.max:    max 100000   # no limits
[cgroup1] memory.max: max          # no limits
[cgroup2] cpu.max:    30000 100000 # 0.3 cores
[cgroup2] memory.max: 134217728    # 128 MiB
```

The format of `cpu.max` is `<quota> <period>`: `30000/100000 = 0.3` cores

### 3.3 CPU stress test comparison

Run two `dd` infinite loops in each of the two containers (saturating the CPU):

```bash
root@docker01:~# docker exec -d cgroup1 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker exec -d cgroup2 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}}' cgroup1 cgroup2
cgroup1 CPU=169.66% # no limits, almost saturating 2 cores
cgroup2 CPU=29.87%  # limited to 0.3 cores, steady at 30%
```

### 3.4 Memory cap and updating a running container

Confirming the memory limit:

```bash
root@docker01:~# docker stats --no-stream --format '{{.Name}} MEM={{.MemUsage}}/{{.MemPerc}}' cgroup1 cgroup2
cgroup1 MEM=5.113MiB / 3.785GiB/0.13% # cap = all host memory
cgroup2 MEM=1.688MiB / 128MiB/1.32%   # cap = 128MiB
```

Adjust the limits of a running container on the fly:

```bash
root@docker01:~# docker update --cpus 0.2 -m 64m --memory-swap 64m cgroup1
cgroup1
```

After the update:

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

### 3.5 OOM kill (using the stress image)

When the memory limit was first shown with the es image, `/dev/shm` defaults to only 64M and the image has no `stress`/`python3`, so writing to `/dev/shm` with `dd` could not trigger OOM in an obvious way. Now a dedicated stress image is used to demonstrate OOM kill.

Pull the dedicated stress image:

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/stress:1.0.4
```

This image supports `--vm` / `--vm-bytes` for memory allocation stress tests.

The limited container (128M) allocates 256M of memory and triggers OOM:

```bash
root@docker01:~# docker run -d --name oom-test --memory 128m --memory-swap 128m \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 30s
29d2a42f1f2dfaf840adb1a4b27bd5537cf842c70e629b01933cb7317ef98fe2
```

Result:

```bash
root@docker01:~# docker logs oom-test
stress: info: [1] dispatching hogs: 0 cpu, 0 io, 1 vm, 0 hdd
stress: FAIL: [1] (415) <-- worker 6 got signal 9   # SIGKILL
stress: WARN: [1] (417) now reaping child worker processes
stress: FAIL: [1] (421) kill error: No such process
stress: FAIL: [1] (451) failed run completed in 0s # killed almost instantly

root@docker01:~# docker inspect oom-test --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=true ExitCode=1
```

```bash
root@docker01:~# docker ps -a
CONTAINER ID   IMAGE                                              COMMAND                  CREATED          STATUS                     PORTS                                   NAMES
29d2a42f1f2d   uhub.service.ucloud.cn/dawn/stress:1.0.4           "stress --vm 1 --vm-…"   5 minutes ago    Exited (1) 5 minutes ago                                           oom-test
```

The control group (no memory limit) allocates the same 256M and finishes normally:

```bash
root@docker01:~# docker run -d --name oom-ctrl \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 8s
10d549fd94e2d68f23b19829c078760fe14ca559dde8d6e71afbb55beb1dc333
```

Result:

```bash
root@docker01:~# docker inspect oom-ctrl --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=false ExitCode=0
```
