---
title: "Docker 実戦：Linux Namespace ネットワーク隔離と CGroup リソース制限"
date: 2026-10-28T10:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "ip netns で Linux ネットワーク名前空間を手作業で構築し、veth pair と NAT で外部ネットワークに接続します。さらに Docker コンテナが net namespace を共有する仕組みを確認し、最後に cgroup v2 で CPU・メモリの制限制御と OOM kill の再現までを行い、コンテナの 2 つの基盤機構である隔離 (Namespace) と制限 (CGroup) を一気に通します。"
---

# Docker 実戦：Linux Namespace ネットワーク隔離と CGroup リソース制限

コンテナの「隔離」と「制限」は Linux カーネルの 2 つの機能によって提供されます。**Namespace はリソースの隔離を担当**し、**CGroup はリソースの割り当てを担当**します。本記事は 3 部構成で全体の流れをつなぎます。まず `ip netns` でネットワーク名前空間を手作業で構築し、veth pair でホストとつないで NAT 経由で外部ネットワークにアクセスします。次に Docker コンテナが同じ net namespace を共有する仕組みを見ます。最後に `--cpus` / `-m` で CPU・メモリの圧縮テストを行い、cgroup v2 の割り当てファイルと OOM kill されるまでの現象を観察します。

## 1. Linux network namespace 隔離

Linux Namespace は Linux システムが提供するリソース隔離の仕組みで、隔離できるシステムリソースは次のとおりです:

- **IPC**: プロセス間通信を隔離します。
- **MNT**: ファイルシステムを隔離し、ディスクのマウントポイントを提供します。
- **NET**: ネットワークを隔離します。
- **PID**: プロセス ID を隔離します。
- **User**: ユーザーとユーザーグループを隔離します。
- **UTS**: HostName と DomainName を隔離します。

### 1.1 名前空間を作成して lo を検証

```bash
root@docker01:~# ip netns add dawn-linux

# マウントポイントを確認
root@docker01:~# ls -l /var/run/netns/
total 0
-r--r--r-- 1 root root 0 Oct 28 01:55 dawn-linux

# 初期状態では lo は DOWN
root@docker01:~# ip netns exec dawn-linux ip a
1: lo: <LOOPBACK> mtu 65536 qdisc noop state DOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
```

lo 起動前後の比較:

```bash
# lo が未起動で、自分自身に ping が通らない
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
ping: connect: Network is unreachable

# lo を起動
root@docker01:~# ip netns exec dawn-linux ip link set lo up
root@docker01:~# ip netns exec dawn-linux ping -c 1 127.0.0.1
PING 127.0.0.1 (127.0.0.1) 56(84) bytes of data.
64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=5.71 ms

--- 127.0.0.1 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 5.709/5.709/5.709/0.000 ms
```

### 1.2 veth ペアを作成して名前空間へ移動

```bash
# 仮想 NIC のペアを作成
root@docker01:~# ip link add veth100 type veth peer name veth200
# veth200 を名前空間へ移動
root@docker01:~# ip link set veth200 netns dawn-linux
# ホスト側にはまだ veth100 が見える
root@docker01:~# ip link show veth100
25: veth100@if24: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 72:0d:1b:68:aa:42 brd ff:ff:ff:ff:ff:ff link-netns dawn-linux
# 名前空間内に veth200 が見える
root@docker01:~# ip netns exec dawn-linux ip link show veth200
24: veth200@if25: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 9a:82:9c:85:bb:9a brd ff:ff:ff:ff:ff:ff link-netnsid 0
```

移動後、ホスト上から `veth200` が消え、名前空間内に `veth200` が増えます。

### 1.3 アドレスを設定して相互接続

```bash
# 名前空間内
root@docker01:~# ip netns exec dawn-linux ip addr add 172.31.100.200/24 dev veth200
root@docker01:~# ip netns exec dawn-linux ip link set veth200 up

# ホスト側
root@docker01:~# ip addr add 172.31.100.100/24 dev veth100
root@docker01:~# ip link set veth100 up

# 双方向に疎通
# ホスト → 名前空間
root@docker01:~# ping -c 2 172.31.100.200
PING 172.31.100.200 (172.31.100.200) 56(84) bytes of data.
64 bytes from 172.31.100.200: icmp_seq=1 ttl=64 time=6.06 ms
64 bytes from 172.31.100.200: icmp_seq=2 ttl=64 time=0.041 ms

--- 172.31.100.200 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 0.041/3.050/6.059/3.009 ms                       
# 名前空間 → ホスト
root@docker01:~# ip netns exec dawn-linux ping -c 2 172.31.100.100
PING 172.31.100.100 (172.31.100.100) 56(84) bytes of data.
64 bytes from 172.31.100.100: icmp_seq=1 ttl=64 time=4.51 ms
64 bytes from 172.31.100.100: icmp_seq=2 ttl=64 time=0.020 ms

--- 172.31.100.100 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 0.020/2.265/4.510/2.245 ms
```

### 1.4 異なるネットワーク帯間の通信

ゲートウェイ追加前は失敗:

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 1 11.0.1.122
ping: connect: Network is unreachable
```

デフォルトゲートウェイを追加:

```bash
root@docker01:~# ip netns exec dawn-linux ip route add default via 172.31.100.100
root@docker01:~# ip netns exec dawn-linux ip route show
default via 172.31.100.100 dev veth200
172.31.100.0/24 dev veth200 proto kernel scope link src 172.31.100.200
```

この時点ではまだ ping が通りません。パケットキャプチャで特定します:

```bash
root@docker01:~# ip netns exec dawn-linux ping 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
# 172.31.100.200 > 11.0.1.122 のリクエストを捕捉できる
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

# パケットを 1 つも捕捉できない
root@docker01:~# tcpdump -i ens33 -nn icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on ens33, link-type EN10MB (Ethernet), snapshot length 262144 bytes
```

パケットは `veth100` まで到達しているのに `ens33` へ転送されていないことを示しています。原因は Docker 起動時に FORWARD チェーンの既定ポリシーが DROP に設定されるためです。

```bash
root@docker01:~# iptables -L FORWARD -n -v
Chain FORWARD (policy DROP 114 packets, 9576 bytes)
 pkts bytes target     prot opt in     out     source               destination
  114  9576 DOCKER-USER  all  --  *      *       0.0.0.0/0            0.0.0.0/0
  114  9576 DOCKER-ISOLATION-STAGE-1  all  --  *      *       0.0.0.0/0            0.0.0.0/0
    0     0 ACCEPT     all  --  *      docker0  0.0.0.0/0            0.0.0.0/0            ctstate 
```

そのため、異なるネットワーク帯間で通信するには 3 つのことが必要です:

```bash
# 1. カーネルの転送を有効化
sysctl -w net.ipv4.ip_forward=1

# 2. FORWARD を許可 (Docker 環境では必須)
iptables -I FORWARD 1 -s 172.31.100.0/24 -j ACCEPT
iptables -I FORWARD 2 -d 172.31.100.0/24 -j ACCEPT

# 3. 出口で SNAT (戻りパケットを返すため)
iptables -t nat -A POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

検証成功:

```bash
root@docker01:~# ip netns exec dawn-linux ping -c 3 11.0.1.122
PING 11.0.1.122 (11.0.1.122) 56(84) bytes of data.
64 bytes from 11.0.1.122: icmp_seq=1 ttl=63 time=0.379 ms
64 bytes from 11.0.1.122: icmp_seq=2 ttl=63 time=0.365 ms
64 bytes from 11.0.1.122: icmp_seq=3 ttl=63 time=0.440 ms

--- 11.0.1.122 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2030ms
rtt min/avg/max/mdev = 0.365/0.394/0.440/0.032 ms

# グローバル IP にも到達
root@docker01:~# ip netns exec dawn-linux ping -c 2 223.5.5.5
PING 223.5.5.5 (223.5.5.5) 56(84) bytes of data.
64 bytes from 223.5.5.5: icmp_seq=1 ttl=127 time=30.8 ms
64 bytes from 223.5.5.5: icmp_seq=2 ttl=127 time=28.4 ms

--- 223.5.5.5 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 28.396/29.618/30.841/1.222 ms
```

### 1.5 名前空間の掃除

```bash
ip netns del dawn-linux
ip link del veth100    # ホスト側の veth100 を削除 (veth200 は名前空間と一緒に削除される)

# ファイアウォールのルールを元に戻す
iptables -D FORWARD -s 172.31.100.0/24 -j ACCEPT
iptables -D FORWARD -d 172.31.100.0/24 -j ACCEPT
iptables -t nat -D POSTROUTING -s 172.31.100.0/24 -j MASQUERADE
```

---

## 2. Docker の net namespace と共有名前空間

### 2.1 コンテナのネットワーク名前空間を確認

```bash
# コンテナ c2 の PID
root@docker01:~# C2PID=$(docker inspect -f '{{.State.Pid}}' c2)

# c2 の net namespace inode を確認
root@docker01:~# readlink /proc/$C2PID/ns/net
net:[4026533022]
```

### 2.2 2 つのコンテナがネットワーク名前空間を共有

```bash
root@docker01:~# docker run -d --name c3 --network container:c2 \
  --restart unless-stopped \
  uhub.service.ucloud.cn/dawn/apps:v1 tail -f /dev/null
c385fd2ed2dfa3cdbe69e1f851b90e6bc85c9e9123d216db9bed8af6837fab84
```

2 つのコンテナの net namespace を比較:

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

`c3` と `c2` の `net` inode は完全に一致しており、同じネットワーク名前空間を共有していることを示します。`c3` 内部から見える IP は `c2` と同じです

---

## 3. cgroup リソース制限

Linux CGroup (正式名称 Linux Control Group) は Linux カーネルの機能で、プロセスグループのリソース (CPU、メモリ、ディスク入出力など) を制限・制御・分離するために使われます。

Linux システムで制御できるリソースは次のとおりです:

- **cpu**: 主にプロセスの cpu 使用率を制限します。
- **cpuacct**: cgroups 内のプロセスの cpu 使用状況を集計できます。
- **cpuset**: cgroups 内のプロセスに専用の cpu ノードやメモリノードを割り当てられます。
- **memory**: プロセスの memory 使用量を制限できます。
- **blkio**: プロセスのブロックデバイス io を制限できます。
- **devices**: プロセスがアクセスできるデバイスを制御できます。
- **net_cls**: cgroups 内プロセスのネットワークパケットにマークを付け、tc モジュール (traffic control) でパケットを制御できます。
- **net_prio**: ネットワークトラフィックの優先度を設計するサブシステムです。
- **freezer**: cgroups 内のプロセスをサスペンドまたは再開できます。
- **ns**: 異なる cgroups 配下のプロセスに異なる namespace を使わせられます。
- **hugetlb**: 主に HugeTLB システム (巨大ページファイルシステム) を制限するサブシステムです。

### 3.1 現行システムが使用している cgroup バージョンを検出

```bash
root@docker01:~# stat -fc %T /sys/fs/cgroup
cgroup2fs
```

### 3.2 制限なしコンテナと制限ありコンテナを起動

```bash
# 制限なし
root@docker01:~# docker run -d --name cgroup1 uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
df316f18223a1497a1ca74357cb57ef4537fc0b3e010fab2f1b81edc8698cf36
# 0.3 コア + 128M メモリに制限
root@docker01:~# docker run -d --name cgroup2 --cpus 0.3 -m 128m \
  uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3 tail -f /dev/null
48e4f3dcd924e709c208d97f27b22a2694f7d4f521bac8dd38aa7145d2b0f515
```

cgroup v2 の設定を確認:

```bash
root@docker01:~# for n in cgroup1 cgroup2; do
  CID=$(docker inspect $n --format '{{.Id}}')
  echo "[$n] cpu.max:    $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.max)"
  echo "[$n] memory.max: $(cat /sys/fs/cgroup/system.slice/docker-$CID.scope/memory.max)"
done
[cgroup1] cpu.max:    max 100000   # 制限なし
[cgroup1] memory.max: max          # 制限なし
[cgroup2] cpu.max:    30000 100000 # 0.3 コア
[cgroup2] memory.max: 134217728    # 128 MiB
```

`cpu.max` の書式は `<quota> <period>` で、`30000/100000 = 0.3` コアです

### 3.3 CPU 圧縮テストの比較

2 つのコンテナ内でそれぞれ 2 つの `dd` 無限ループ (CPU を使い切る) を実行:

```bash
root@docker01:~# docker exec -d cgroup1 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker exec -d cgroup2 sh -c 'dd if=/dev/zero of=/dev/null & dd if=/dev/zero of=/dev/null & wait'
root@docker01:~# docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}}' cgroup1 cgroup2
cgroup1 CPU=169.66% # 制限なし、2 コアをほぼ使い切る
cgroup2 CPU=29.87%  # 0.3 コアに制限、30% で安定
```

### 3.4 メモリ上限と稼働中の update

メモリ制限の確認:

```bash
root@docker01:~# docker stats --no-stream --format '{{.Name}} MEM={{.MemUsage}}/{{.MemPerc}}' cgroup1 cgroup2
cgroup1 MEM=5.113MiB / 3.785GiB/0.13% # 上限=ホストの全メモリ
cgroup2 MEM=1.688MiB / 128MiB/1.32%   # 上限=128MiB
```

稼働中のコンテナの制限を動的に調整:

```bash
root@docker01:~# docker update --cpus 0.2 -m 64m --memory-swap 64m cgroup1
cgroup1
```

更新後:

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

### 3.5 OOM kill (stress イメージを使用)

メモリ制限を当初 es イメージで実演した際は、`/dev/shm` の既定値が 64M しかなく、イメージ内に `stress`/`python3` も存在しないため、`dd` で `/dev/shm` に書き込んでも OOM を直感的に発生させられませんでした。そこで専用の圧縮テストイメージを使って OOM kill を実演します。

専用の圧縮テストイメージを取得:

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/stress:1.0.4
```

このイメージは `--vm` / `--vm-bytes` によるメモリ確保の圧縮テストに対応しています。

制限ありコンテナ (128M) が 256M のメモリを確保し、OOM を発生させます:

```bash
root@docker01:~# docker run -d --name oom-test --memory 128m --memory-swap 128m \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 30s
29d2a42f1f2dfaf840adb1a4b27bd5537cf842c70e629b01933cb7317ef98fe2
```

結果:

```bash
root@docker01:~# docker logs oom-test
stress: info: [1] dispatching hogs: 0 cpu, 0 io, 1 vm, 0 hdd
stress: FAIL: [1] (415) <-- worker 6 got signal 9   # SIGKILL
stress: WARN: [1] (417) now reaping child worker processes
stress: FAIL: [1] (421) kill error: No such process
stress: FAIL: [1] (451) failed run completed in 0s # ほぼ一瞬で kill される

root@docker01:~# docker inspect oom-test --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=true ExitCode=1
```

```bash
root@docker01:~# docker ps -a
CONTAINER ID   IMAGE                                              COMMAND                  CREATED          STATUS                     PORTS                                   NAMES
29d2a42f1f2d   uhub.service.ucloud.cn/dawn/stress:1.0.4           "stress --vm 1 --vm-…"   5 minutes ago    Exited (1) 5 minutes ago                                           oom-test
```

対照群 (メモリ制限なし) が同じ 256M を確保し、正常に完了します:

```bash
root@docker01:~# docker run -d --name oom-ctrl \
  uhub.service.ucloud.cn/dawn/stress:1.0.4 \
  stress --vm 1 --vm-bytes 256M --timeout 8s
10d549fd94e2d68f23b19829c078760fe14ca559dde8d6e71afbb55beb1dc333
```

結果:

```bash
root@docker01:~# docker inspect oom-ctrl --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
OOMKilled=false ExitCode=0
```
