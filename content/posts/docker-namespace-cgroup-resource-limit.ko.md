---
title: "Docker 실전: Linux Namespace 네트워크 격리와 CGroup 리소스 제한"
date: 2026-10-28T10:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "ip netns 로 Linux 네트워크 네임스페이스를 직접 만들고 veth pair 와 NAT 로 외부망을 연결합니다. 그리고 Docker 컨테이너가 net namespace 를 공유하는 방식을 살펴보고, 마지막으로 cgroup v2 로 CPU·메모리 제한 압축 테스트와 OOM kill 재현까지 진행해 컨테이너의 두 가지 저수준 메커니즘인 격리(Namespace)와 제한(CGroup)을 하나로 묶습니다."
---

# Docker 실전: Linux Namespace 네트워크 격리와 CGroup 리소스 제한

컨테이너의 "격리"와 "제한"은 Linux 커널의 두 가지 기능으로 제공됩니다. **Namespace 는 리소스 격리를 담당**하고 **CGroup 은 리소스 할당을 담당**합니다. 이 글은 세 부분으로 전체 흐름을 잇습니다. 먼저 `ip netns` 로 네트워크 네임스페이스를 직접 만들고 veth pair 로 호스트와 연결한 뒤 NAT 로 외부망에 접근합니다. 다음으로 Docker 컨테이너가 같은 net namespace 를 공유하는 방식을 살펴봅니다. 마지막으로 `--cpus` / `-m` 으로 CPU·메모리 압축 테스트를 하고 cgroup v2 의 할당 파일과 OOM kill 당하는 전체 현상을 관찰합니다.

## 1. Linux network namespace 격리

Linux Namespace 는 Linux 시스템이 제공하는 리소스 격리 메커니즘이며, 격리할 수 있는 시스템 리소스 목록은 다음과 같습니다:

- **IPC**: 프로세스 간 통신을 격리합니다.
- **MNT**: 파일 시스템을 격리하고 디스크 마운트 지점을 제공합니다.
- **NET**: 네트워크를 격리합니다.
- **PID**: 프로세스 ID 를 격리합니다.
- **User**: 사용자와 사용자 그룹을 격리합니다.
- **UTS**: HostName 과 DomainName 을 격리합니다.

### 1.1 네임스페이스 생성 및 lo 확인

```bash
root@docker01:~# ip netns add dawn-linux

# 마운트 지점 조회
root@docker01:~# ls -l /var/run/netns/
total 0
-r--r--r-- 1 root root 0 Oct 28 01:55 dawn-linux

# 초기 lo 는 DOWN 상태
root@docker01:~# ip netns exec dawn-linux ip a
1: lo: <LOOPBACK> mtu 65536 qdisc noop state DOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
```

lo 시작 전후 비교:

```bash
# lo 가 시작되지 않아 자기 자신에게 ping 이 통하지 않음
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
ping: connect: Network is unreachable

# lo 시작
root@docker01:~# ip netns exec dawn-linux ip link set lo up
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
PING 127.0.0.1 (127.0.0.1) 56(84) bytes of data.
64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=5.71 ms

--- 127.0.0.1 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 5.709/5.709/5.709/0.000 ms
```

### 1.2 veth 페어 생성 후 네임스페이스로 이동

```bash
# 가상 NIC 한 쌍 생성
root@docker01:~# ip link add veth100 type veth peer name veth200
# veth200 을 네임스페이스로 이동
root@docker01:~# ip link set veth200 netns dawn-linux
# 호스트에는 여전히 veth100 이 보임
root@docker01:~# ip link show veth100
25: veth100@if24: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 72:0d:1b:68:aa:42 brd ff:ff:ff:ff:ff:ff link-netns dawn-linux
# 네임스페이스 안에 veth200 이 보임
root@docker01:~# ip netns exec dawn-linux ip link show veth200
24: veth200@if25: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 9a:82:9c:85:bb:9a brd ff:ff:ff:ff:ff:ff link-netnsid 0
```

이동 후 호스트에서 `veth200` 이 사라지고 네임스페이스 안에 `veth200` 이 생깁니다.

### 1.3 주소 설정 및 상호 통신

```bash
# 네임스페이스 내부
root@docker01:~# ip netns exec dawn-linux ip addr add 172.31.100.200/24 dev veth200
root@docker01:~# ip netns exec dawn-linux ip link set veth200 up

# 호스트
root@docker01:~# ip addr add 172.31.100.100/24 dev veth100
root@docker01:~# ip link set veth100 up

# 양방향 통신
# 호스트 → 네임스페이스
root@docker01:~# ping -c 2 172.31.100.200
PING 172.31.100.200 (172.31.100.200) 56(84) bytes of data.
64 bytes from 172.31.100.200: icmp_seq=1 ttl=64 time=6.06 ms
64 bytes from 172.31.100.200: icmp_seq=2 ttl=64 time=0.041 ms

--- 172.31.100.200 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 0.041/3.050/6.059/3.009 ms                       
# 네임스페이스 → 호스트
root@docker01:~# ip netns exec dawn-linux ping -c 2 172.31.100.100
PING 172.31.100.100 (172.31.100.100) 56(84) bytes of data.
64 bytes from 172.31.100.100: icmp_seq=1 ttl=64 time=4.51 ms
64 bytes from 172.31.100.100: icmp_seq=2 ttl=64 time=0.020 ms

--- 172.31.100.100 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 0.020/2.265/4.510/2.245 ms
```

### 1.4 서로 다른 네트워크 대역 간 통신

게이트웨이 추가 전 실패:

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 1 11.0.1.122
ping: connect: Network is unreachable
```

기본 게이트웨이 추가:

```bash
root@docker01:~# ip netns exec dawn-linux ip route add default via 172.31.100.100
root@docker01:~# ip netns exec dawn-linux ip route show
default via 172.31.100.100 dev veth200
172.31.100.0/24 dev veth200 proto kernel scope link src 172.31.100.200
```

이 시점에서는 여전히 ping 이 통하지 않습니다. 패킷 캡처로 위치를 찾습니다:

```bash
root@docker01:~# ip netns exec dawn-linux ping 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
# 172.31.100.200 > 11.0.1.122 요청을 캡처할 수 있음
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

# 어떤 패킷도 캡처되지 않음
root@docker01:~# tcpdump -i ens33 -nn icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), snapshot length 262144 bytes
```

패킷이 `veth100` 까지 도착했지만 `ens33` 으로 포워딩되지 않았음을 보여줍니다. 원인은 Docker 가 시작될 때 FORWARD 체인의 기본 정책을 DROP 으로 설정하기 때문입니다.

```bash
root@docker01:~# iptables -L FORWARD -n -v
Chain FORWARD (policy DROP 114 packets, 9576 bytes)
 pkts bytes target     prot opt in     out     source               destination
  114  9576 DOCKER-USER  all  --  *      *       0.0.0.0/0            0.0.0.0/0
  114  9576 DOCKER-ISOLATION-STAGE-1  all  --  *      *       0.0.0.0/0            0.0.0.0/0
    0     0 ACCEPT     all  --  *      docker0  0.0.0.0/0            0.0.0.0/0            ctstate 
```

따라서 서로 다른 네트워크 대역 간 통신에는 세 가지가 필요합니다:

```bash
# 1. 커널 포워딩 활성화
sysctl -w net.ipv4.ip_forward=1

# 2. FORWARD 허용 (Docker 환경에서는 필수)
iptables -I FORWARD 1 -s 172.31.100.0/24 -j ACCEPT
iptables -I FORWARD 2 -d 172.31.100.0/24 -j ACCEPT

# 3. 출구 SNAT (응답 패킷이 돌아오도록)
iptables -t nat -A POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

검증 성공:

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 3 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
64 bytes from 11.0.1.122: icmp_seq=1 ttl=63 time=0.379 ms
64 bytes from 11.0.1.122: icmp_seq=2 ttl=63 time=0.365 ms
64 bytes from 11.0.1.122: icmp_seq=3 ttl=63 time=0.440 ms

--- 11.0.1.122 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2030ms
rtt min/avg/max/mdev = 0.365/0.394/0.440/0.032 ms

# 공인 IP 도 통함
root@docker01:~# ip netns exec dawn-linux ping -c 2 223.5.5.5
PING 223.5.5.5 (223.5.5.5) 56(84) bytes of data.
64 bytes from 223.5.5.5: icmp_seq=1 ttl=127 time=30.8 ms
64 bytes from 223.5.5.5: icmp_seq=2 ttl=127 time=28.4 ms

--- 223.5.5.5 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 28.396/29.618/30.841/1.222 ms
```

### 1.5 네임스페이스 정리

```bash
ip netns del dawn-linux
ip link del veth100    # 호스트의 veth100 삭제 (veth200 은 네임스페이스와 함께 삭제됨)

# 방화벽 규칙 복원
iptables -D FORWARD -s 172.31.100.0/24 -j ACCEPT
iptables -D FORWARD -d 172.31.100.0/24 -j ACCEPT
iptables -t nat -D POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

---

## 2. Docker 의 net namespace 와 네임스페이스 공유

### 2.1 컨테이너의 네트워크 네임스페이스 조회

```bash
# 컨테이너 c2 의 PID
root@docker01:~# C2PID=$(docker inspect -f '{{.State.Pid}}' c2)

# c2 의 net namespace inode 조회
root@docker01:~# readlink /proc/$C2PID/ns/net
net:[4026533022]
```

### 2.2 두 컨테이너의 네트워크 네임스페이스 공유

```bash
root@docker01:~# docker run -d --name c3 --network container:c2 \
  --restart unless-stopped \
  uhub.service.ucloud.cn/dawn/apps:v1 tail -f /dev/null
c385fd2ed2dfa3cdbe69e1f851b90e6bc85c9e9123d216db9bed8af6837fab84
```

두 컨테이너의 net namespace 비교:

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

`c3` 와 `c2` 의 `net` inode 가 완전히 일치하므로 두 컨테이너가 같은 네트워크 네임스페이스를 공유하며 `c3` 내부에서 보이는 IP 는 `c2` 와 같습니다

---

## 3. cgroup 리소스 제한

Linux CGroup (정식 명칭 Linux Control Group) 은 Linux 커널의 기능으로, 프로세스 그룹의 리소스 (CPU, 메모리, 디스크 입출력 등) 를 제한·제어·분리하는 데 사용됩니다.

Linux 시스템에서 제어할 수 있는 리소스 목록은 다음과 같습니다:

- **cpu**: 주로 프로세스의 cpu 사용률을 제한합니다.
- **cpuacct**: cgroups 내 프로세스의 cpu 사용량을 집계할 수 있습니다.
- **cpuset**: cgroups 내 프로세스에 별도의 cpu 노드나 메모리 노드를 할당할 수 있습니다.
- **memory**: 프로세스의 memory 사용량을 제한할 수 있습니다.
- **blkio**: 프로세스의 블록 디바이스 io 를 제한할 수 있습니다.
- **devices**: 프로세스가 접근할 수 있는 디바이스를 제어할 수 있습니다.
- **net_cls**: cgroups 내 프로세스의 네트워크 패킷에 표시를 하고 tc 모듈 (traffic control) 로 패킷을 제어할 수 있습니다.
- **net_prio**: 네트워크 트래픽의 우선순위를 설계하는 서브시스템입니다.
- **freezer**: cgroups 내 프로세스를 일시 중지하거나 재개할 수 있습니다.
- **ns**: 서로 다른 cgroups 아래의 프로세스가 서로 다른 namespace 를 사용하게 할 수 있습니다.
- **hugetlb**: 주로 HugeTLB 시스템 (대용량 페이지 파일 시스템) 을 제한하는 서브시스템입니다.

### 3.1 현재 시스템이 사용 중인 cgroup 버전 감지

```bash
root@docker01:~# stat -fc %T /sys/fs/cgroup
cgroup2fs
```

### 3.2 제한 없는 컨테이너와 제한 있는 컨테이너 실행

```bash
# 제한 없음
root@docker01:~# docker run -d --name cgroup1 uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
df316f18223a1497a1ca74357cb57ef4537fc0b3e010fab2f1b81edc8698cf36
# 0.3 코어 + 128M 메모리로 제한
root@docker01:~# docker run -d --name cgroup2 --cpus 0.3 -m 128m \
  uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
48e4f3dcd924e709c208d97f27b22a2694f7d4f521bac8dd38aa7145d2b0f515
```

cgroup v2 설정 조회:

```bash
root@docker01:~# for n in cgroup1 cgroup2; do
  CID=$(docker inspect $n --format '{{.Id}}')
  echo "[$n] cpu.max:    $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.max)"
  echo "[$n] memory.max: $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/memory.max)"
done
[cgroup1] cpu.max:    max 100000   # 제한 없음
[cgroup1] memory.max: max          # 제한 없음
[cgroup2] cpu.max:    30000 100000 # 0.3 코어
[cgroup2] memory.max: 134217728    # 128 MiB
```

`cpu.max` 형식은 `<quota> <period>` 이며 `30000/100000 = 0.3` 코어입니다

### 3.3 CPU 압축 테스트 비교

두 컨테이너에서 각각 `dd` 무한 루프 두 개 (CPU 를 가득 채움) 를 실행:

```bash
root@docker01:~# docker exec -d cgroup1 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker exec -d cgroup2 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}}' cgroup1 cgroup2
cgroup1 CPU=169.66% # 제한 없음, 2 코어를 거의 가득 사용
cgroup2 CPU=29.87%  # 0.3 코어로 제한, 30% 에서 안정
```

### 3.4 메모리 상한과 실행 중 update

메모리 제한 확인:

```bash
root@docker01:~# docker stats --no-stream --format '{{.Name}} MEM={{.MemUsage}}/{{.MemPerc}}' cgroup1 cgroup2
cgroup1 MEM=5.113MiB / 3.785GiB/0.13% # 상한=호스트 전체 메모리
cgroup2 MEM=1.688MiB / 128MiB/1.32%   # 상한=128MiB
```

실행 중인 컨테이너의 제한 동적 조정:

```bash
root@docker01:~# docker update --cpus 0.2 -m 64m --memory-swap 64m cgroup1
cgroup1
```

갱신 후:

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

### 3.5 OOM kill (stress 이미지 사용)

메모리 제한을 처음 es 이미지로 시연했을 때는 `/dev/shm` 기본값이 64M 에 불과하고 이미지에 `stress`/`python3` 도 없어 `dd` 로 `/dev/shm` 에 써도 OOM 을 직관적으로 일으킬 수 없었습니다. 이제 전용 압축 테스트 이미지로 OOM kill 을 시연합니다.

전용 압축 테스트 이미지 풀:

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/stress:1.0.4
```

이 이미지는 `--vm` / `--vm-bytes` 로 메모리 할당 압축 테스트를 지원합니다.

제한된 컨테이너 (128M) 가 256M 메모리를 할당하여 OOM 을 발생시킵니다:

```bash
root@docker01:~# docker run -d --name oom-test --memory 128m --memory-swap 128m \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 30s
29d2a42f1f2dfaf840adb1a4b27bd5537cf842c70e629b01933cb7317ef98fe2
```

결과:

```bash
root@docker01:~# docker logs oom-test
stress: info: [1] dispatching hogs: 0 cpu, 0 io, 1 vm, 0 hdd
stress: FAIL: [1] (415) <-- worker 6 got signal 9   # SIGKILL
stress: WARN: [1] (417) now reaping child worker processes
stress: FAIL: [1] (421) kill error: No such process
stress: FAIL: [1] (451) failed run completed in 0s # 거의 순식간에 종료됨

root@docker01:~# docker inspect oom-test --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=true ExitCode=1
```

```bash
root@docker01:~# docker ps -a
CONTAINER ID   IMAGE                                              COMMAND                  CREATED          STATUS                     PORTS                                   NAMES
29d2a42f1f2d   uhub.service.ucloud.cn/dawn/stress:1.0.4           "stress --vm 1 --vm-…"   5 minutes ago    Exited (1) 5 minutes ago                                           oom-test
```

대조군 (메모리 제한 없음) 이 동일하게 256M 를 할당하여 정상 완료합니다:

```bash
root@docker01:~# docker run -d --name oom-ctrl \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 8s
10d549fd94e2d68f23b19829c078760fe14ca559dde8d6e71afbb55beb1dc333
```

결과:

```bash
root@docker01:~# docker inspect oom-ctrl --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=false ExitCode=0
```
