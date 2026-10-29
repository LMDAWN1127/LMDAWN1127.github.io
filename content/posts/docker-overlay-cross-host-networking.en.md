---
title: "Docker in Practice: Overlay Cross-Host Container Networking with a WordPress Case"
date: 2026-10-27T18:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Initialize a Swarm cluster on two Docker hosts, create the attachable overlay network dawn-overlay, demonstrate cross-host container communication by IP and container name, verify Internet egress via docker_gwbridge, observe encapsulation by capturing VXLAN (UDP 4789) packets, and finish with a cross-host WordPress deployment."
---

# Docker in Practice: Overlay Cross-Host Container Networking with a WordPress Case

## 1. Lab Objectives

1. Form a Docker Swarm cluster from docker01 and docker02.
2. Create a custom overlay network `dawn-overlay` with the subnet `172.30.0.0/16`.
3. Start container `c1` on docker02 and container `c2` on docker01.
4. Verify that the two containers can communicate across hosts by IP and by container name.
5. Verify that the containers can still reach the Internet through `docker_gwbridge`.
6. Capture VXLAN packets on the host service NIC `ens33` and observe how overlay encapsulates the data.

## 2. Lab Environment and Topology

### 2.1 Host Environment

| Host | Service IP | NIC | Docker | Swarm Role | Test Container |
|---|---|---|---|---|---|
| docker01 | 11.0.1.121/24 | ens33 | 27.0.3 | manager、leader | c2，172.30.0.3 |
| docker02 | 11.0.1.122/24 | ens33 | 27.0.3 | worker | c1，172.30.0.1 |

### 2.2 Logical Topology

```text
                      Swarm cluster
             Control plane: Raft + node discovery
                           
   docker01                              docker02
   11.0.1.121                            11.0.1.122
   manager / leader                     worker
        |                                     |
        |        UDP 4789, VXLAN tunnel          |
        |<===================================>|
        |                                     |
     c2 container                               c1 container
   172.30.0.3/16                         172.30.0.1/16
        |                                     |
        +------ dawn-overlay, same L2 subnet -----+

   Container to Internet:eth1 -> docker_gwbridge -> host NAT -> ens33
```

### 2.3 Ports Required by Swarm

| Port | Protocol | Purpose |
|---|---|---|
| 2377 | TCP | Swarm management traffic, mainly for nodes joining and talking to managers |
| 7946 | TCP, UDP | Node discovery and state propagation |
| 4789 | UDP | VXLAN data encapsulation for overlay networks |

If cross-host ping fails even though the containers and the overlay network already exist, check these ports and any intermediate network security policies first.

## 3. Initialize Swarm on docker01

Run on docker01:

```bash
docker swarm init \
  --advertise-addr 11.0.1.121 \
  --listen-addr 11.0.1.121:2377
```

```bash
Swarm initialized: current node (ilsct3hz5rg7tc1ln7l426p1e) is now a manager.
```

Check the nodes:

```bash
docker node ls
```

At this point there is only the manager node:

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
```

Get the worker join token:

```bash
docker swarm join-token worker
```

The token is a cluster join credential; when you reproduce this lab, fetch it live on docker01.

After initialization, docker01 starts listening on:

```bash
tcp  11.0.1.121:2377
tcp  11.0.1.121:7946
udp  11.0.1.121:7946
```



### Other Automatically Created Networks

After initializing Swarm you will also see:

| Network           | Purpose                                                          |
| ----------------- | ------------------------------------------ |
| `ingress`         | Routing mesh network used when Swarm services publish ports      |
| `docker_gwbridge` | Local bridge network connecting overlay containers to host and Internet |

## 4. Join docker02 to the Cluster

Run the following command on docker02:

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

Go back to docker01 to verify:

```bash
docker node ls
```

```bash
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
ilsct3hz5rg7tc1ln7l426p1e *   docker01   Ready     Active         Leader           27.0.3
zqccn7zzxvujvbuw8i43jczdn     docker02   Ready     Active                          27.0.3
```

Both nodes are `Ready / Active`, which means the cluster control plane is healthy.

`docker node ls` is a manager-only command; running it on a worker reports that the current node is not a manager.

## 5. Create the Custom Overlay Network

Run on the manager node docker01:

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

Inspect the network:

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

In Swarm mode an overlay network is mainly intended for services/tasks by default. If you also want plain containers to attach via `docker run --network dawn-overlay`, you must specify `--attachable` when creating the network.



Right after the network is created, run on docker02:

```bash
docker network ls
docker network inspect dawn-overlay
```

You will observe:

```bash
Error response from daemon: network dawn-overlay not found
```

At this point `docker network ls` also shows only `bridge`, `host`, `none`, `ingress` and `docker_gwbridge` — no `dawn-overlay` yet.

This is not a cluster sync failure but the on-demand provisioning of Swarm overlay networks on worker nodes: the network configuration is stored in the cluster, but a worker usually builds the local data-plane resources only when a container or task actually needs to attach to that network.

## 6. Start c1 on docker02

Run on docker02:

```bash
docker run -d \
  --name c1 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

Inspect the container NICs:

```bash
docker exec c1 ifconfig
```

Key results:

```text
eth0: inet addr 172.30.0.1/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

Check the network again:

```bash
docker network ls --filter name=dawn-overlay
NETWORK ID     NAME           DRIVER    SCOPE
8myzpa127zbq   dawn-overlay   overlay   swarm

docker network inspect dawn-overlay \
  --format 'Id={{.Id}} Scope={{.Scope}} Attachable={{.Attachable}}'
Id=8myzpa127zbqa8x3wnzrfv1eh Scope=swarm Attachable=true
```

Once a container is attached, `dawn-overlay` appears on docker02, and its network ID is exactly the same as on docker01.

## 7. Start c2 on docker01

Run on docker01:

```bash
docker run -d \
  --name c2 \
  --network dawn-overlay \
  uhub.service.ucloud.cn/dawn/apps:v1 \
  sleep 3600
```

Inspect the NICs:

```bash
docker exec c2 ifconfig
```

Key results:

```text
eth0: inet addr 172.30.0.3/16，MTU 1450
eth1: inet addr 172.18.0.3/16，MTU 1500
lo:   127.0.0.1
```

## 8. Verify Cross-Host Communication

### 8.1 Communicate by target IP

Run on docker01:

```bash
docker exec c2 ping -c 3 172.30.0.1
PING 172.30.0.1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=7.124 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.414 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.518 ms

--- 172.30.0.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

### 8.2 Communicate by container name

Continue with:

```bash
docker exec c2 ping -c 3 c1
PING c1 (172.30.0.1): 56 data bytes
64 bytes from 172.30.0.1: seq=0 ttl=64 time=0.996 ms
64 bytes from 172.30.0.1: seq=1 ttl=64 time=0.456 ms
64 bytes from 172.30.0.1: seq=2 ttl=64 time=0.492 ms

--- c1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

In production, prefer stable service names or container names rather than hard-coding dynamically assigned container IPs into configuration files.

## 9. Verify Routing and Internet Access

Check c2's routes:

```bash
docker exec c2 route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         172.18.0.1      0.0.0.0         UG    0      0        0 eth1
172.18.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth1
172.30.0.0      0.0.0.0         255.255.0.0     U     0      0        0 eth0
```

When the destination belongs to `172.30.0.0/16`, traffic goes out the overlay NIC `eth0`.

All other addresses use the default route `172.18.0.1`, which corresponds to `eth1` and `docker_gwbridge`.

Test Internet access:

```bash
docker exec c2 ping -c 3 baidu.com
```

Actual result:

```text
3 packets transmitted, 3 packets received, 0% packet loss
round-trip min/avg/max = 37.178/40.291/46.454 ms
```

At the same time, capture packets on docker01's `docker_gwbridge`:

```bash
timeout 10 tcpdump -i docker_gwbridge -nn -c 2 icmp
```

In another terminal, run:

```bash
docker exec c2 ping -c 2 baidu.com
```

Captured:

```text
IP 172.18.0.3 > 111.63.65.103: ICMP echo request
IP 111.63.65.103 > 172.18.0.3: ICMP echo reply
```

This verifies that Internet traffic goes through `docker_gwbridge` rather than the overlay VXLAN tunnel.

## 10. Capture VXLAN Cross-Host Packets

Capture packets on docker01:

```bash
timeout 12 tcpdump -i ens33 -nn -vv -c 4 'udp port 4789'
```

Generate cross-host traffic from another terminal:

```bash
docker exec c2 ping -c 4 172.30.0.1
```

Key packets:

```text
11.0.1.121.41805 > 11.0.1.122.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.3 > 172.30.0.1: ICMP echo request

11.0.1.122.44099 > 11.0.1.121.4789:
VXLAN, flags [I] (0x08), vni 4097
IP 172.30.0.1 > 172.30.0.3: ICMP echo reply
```

Capture statistics:

```text
4 packets captured
4 packets received by filter
0 packets dropped by kernel
```

Cross-host containers encapsulate the container's original packets into VXLAN and transport them over the `ens33` network of the two hosts.

## 11. Hands-on Case: Deploying WordPress with overlay

Deploy wordpress on a custom overlay network with the subnet `172.23.0.0/16`.

### 11.1 Create the Network

```bash
# docker01
docker network create -d overlay --attachable \
  --subnet 172.23.0.0/16 --gateway 172.23.0.254 wp-overlay
```

### 11.2 Deploy MySQL on docker02

```bash
# docker02
docker run -d --name wp-db --network wp-overlay --restart unless-stopped \
  -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=wordpress \
  -e MYSQL_PASSWORD=123456 \
  -e MYSQL_ROOT_PASSWORD=123456 \
  -v wp-db-data:/var/lib/mysql \
  mysql:8.4.1-oracle
```

### 11.3 Deploy WordPress on docker01

```bash
# docker01
docker run -d --name wp-web --network wp-overlay --restart unless-stopped \
  -p 8080:80 \
  -e WORDPRESS_DB_HOST=wp-db:3306 \
  -e WORDPRESS_DB_NAME=wordpress \
  -e WORDPRESS_DB_USER=wordpress \
  -e WORDPRESS_DB_PASSWORD=123456 \
  uhub.service.ucloud.cn/dawn/wordpress:6.8
```

`WORDPRESS_DB_HOST=wp-db:3306` uses the container name directly. Although the two containers live on different hosts, they share the `wp-overlay` network, and Docker's built-in DNS resolves `wp-db` to the MySQL container IP on docker02, enabling cross-host database access.

Verify cross-host DNS resolution:

```bash
docker exec wp-web getent hosts wp-db
172.23.0.1  wp-db
```

### 11.4 Verify the Installation Page

![image-20261027210610539](/images/docker-overlay-cross-host-networking-image-20261027210610539.png)

## 12. Clean Up the Lab Environment

Remove the containers:

```bash
# docker01
docker rm -f c2

# docker02
docker rm -f c1
```

Delete the custom network on the manager:

```bash
docker network rm dawn-overlay
```

Make the worker leave the cluster:

```bash
# docker02
docker swarm leave
```

Make the manager leave and disband the cluster:

```bash
# docker01
docker swarm leave --force
```

Check after cleanup:

```bash
docker info --format '{{.Swarm.LocalNodeState}}'
docker network ls
docker ps -a
```
