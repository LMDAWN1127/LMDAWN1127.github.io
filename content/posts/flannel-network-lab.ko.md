---
title: "flannel 네트워크 실험 매뉴얼"
date: 2025-05-21
draft: false
tags: ["flannel", "Docker", "네트워크", "etcd"]
---

# flannel 네트워크 실험 매뉴얼

## 1. 네트워크 환경 계획

1. etcd 호스트 IP: 192.168.8.88 호스트명: docker-network
2. Host1 IP: 192.168.8.188 호스트명: web01
3. Host2 IP: 192.168.8.99 호스트명: web02

## 2. etcd 호스트 구성

### 단계 1: etcd 다운로드 및 압축 해제

1. github.com에서 etcd-v3.6.0-linux-amd64.tar.gz 소프트웨어 패키지를 다운로드합니다
2. 소프트웨어 패키지를 etcd 호스트의 /root 디렉토리에 복사하고 압축을 해제합니다:

```bash
[root@docker-network ~]# tar -zxvf etcd-v3.6.0-linux-amd64.tar.gz
```

### 단계 2: etcd 실행 파일 설치

```bash
[root@docker-network ~]# cd etcd-v3.6.0-linux-amd64
[root@docker-network etcd-v3.6.0-linux-amd64]# cp etcd* /usr/local/bin/
```

### 단계 3: 데이터 디렉토리 생성

```bash
[root@docker-network ~]# mkdir /var/lib/etcd
```

### 단계 4: etcd 서비스 구성 및 시작

1. etcd.service 파일을 생성합니다:

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


2. 시스템 서비스 구성을 다시 로드하고 etcd를 시작합니다:

```bash
[root@docker-network ~]# systemctl daemon-reload
[root@docker-network ~]# systemctl enable etcd.service
[root@docker-network ~]# systemctl restart etcd.service
```

3. etcd 리스닝 상태를 확인합니다:

```bash
[root@docker-network ~]# netstat -tulnp |grep :2379
tcp        0      0 192.168.8.88:2379       0.0.0.0:*               LISTEN      1912/etcd
tcp        0      0 127.0.0.1:2379          0.0.0.0:*               LISTEN      1912/etcd
```

### 단계 5: etcd에 flannel 네트워크 구성 추가

```bash
etcdctl --endpoints http://127.0.0.1:2379 put /coreos.com/network/config '{"Network": "172.16.0.0/16", "SubnetLen": 24, "SubnetMin": "172.16.1.0","SubnetMax": "172.16.10.0", "Backend": {"Type": "vxlan"}}'
```


```bash
etcdctl --endpoints http://192.168.8.88:2379 get /coreos.com/network/config
```

구성 설명:

- Network: flannel 주소 풀
- SubnetLen: 단일 호스트에 할당되는 docker0 서브넷 마스크 길이 (24비트는 255.255.255.0)
- SubnetMin/SubnetMax: 할당 가능한 서브넷 범위 (예: 172.16.1.0/24 ~ 172.16.10.0/24)
- Backend: 데이터 전달 모드 (vxlan은 호스트 간 통신 지원)

### 단계 6: 방화벽 비활성화

```bash
[root@docker-network ~]# systemctl disable firewalld
[root@docker-network ~]# systemctl stop firewalld
```

## 3. web01 호스트 구성 (Host1: 192.168.8.188)

### 단계 1: flannel 다운로드 및 압축 해제

1. flannel-v0.26.7-linux-amd64.tar.gz를 호스트에 다운로드합니다
2. 파일의 압축을 해제합니다:

```bash
[root@web01 ~]# tar -zxvf flannel-v0.26.7-linux-amd64.tar.gz
```

### 단계 2: flannel 실행 파일 설치

```bash
[root@web01 ~]# cp -p flanneld mk-docker-opts.sh /usr/local/bin/
```

### 단계 3: flannel 서비스 구성 및 시작

1. flanneld.service 파일을 생성합니다:

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

매개변수 설명:

- `--iface=192.168.8.188`: etcd에 연결하는 로컬 IP를 지정합니다
- `--etcd-endpoints`: etcd 서버 주소

서비스 구성을 다시 로드하고 flannel을 시작합니다:

```bash
[root@web01 ~]# systemctl daemon-reload
[root@web01 ~]# systemctl enable flanneld.service
[root@web01 ~]# systemctl restart flanneld.service
```

### 단계 4: flannel 네트워크 인터페이스 확인

```bash
[root@web01 ~]# ifconfig
```

flannel.1 인터페이스가 표시되어야 합니다 (예시 출력):

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

### 단계 5: docker 구성 파일 수정

1. flannel이 생성한 서브넷 환경 변수를 확인합니다:

```bash
[root@web01 ~]# cat /run/flannel/subnet.env
```

출력 예시:

```
FLANNEL_NETWORK=172.16.0.0/16
FLANNEL_SUBNET=172.16.5.1/24
FLANNEL_MTU=1450
FLANNEL_IPMASQ=true
```

```bash
[root@web01 ~]# cat /run/docker_opts.env
```

출력 예시:

```
DOCKER_OPT_BIP="--bip=172.16.5.1/24"
DOCKER_OPT_IPMASQ="--ip-masq=false"
DOCKER_OPT_MTU="--mtu=1450"
DOCKER_OPTS=" --bip=172.16.5.1/24 --ip-masq=false --mtu=1450"
```

2. docker 서비스 구성을 수정합니다:

```bash
[root@web01 ~]# vim /usr/lib/systemd/system/docker.service
```

[Service] 섹션에 다음을 추가합니다:

```ini
ExecStart=/usr/bin/dockerd $DOCKER_OPTS -H fd:// --containerd=/run/containerd/containerd.sock
ExecReload=/bin/kill -s HUP $MAINPID
EnvironmentFile=-/run/docker_opts.env
```

3. docker 서비스를 재시작합니다:

```bash
[root@web01 ~]# systemctl daemon-reload
[root@web01 ~]# systemctl restart docker.service
```

### 단계 6: docker 네트워크 확인

1. nginx 컨테이너를 생성하고 접속합니다:

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
[root@web01 ~]# docker exec -it <컨테이너 ID> /bin/bash
```

2. 컨테이너 IP를 확인합니다 (예시: 172.16.5.3):

```bash
root@컨테이너 ID:/# ifconfig
eth0: inet 172.16.5.3 netmask 255.255.255.0
```

![web01 컨테이너 네트워크 확인](/images/flannel/page6_img1.png)

## 4. web02 호스트 구성 (Host2: 192.168.0.208)

### 단계 설명

1. 구성 단계는 web01과 완전히 동일하며, 다음 매개변수만 수정하면 됩니다:
   - `--iface=192.168.8.99` (로컬 IP)
   - docker 컨테이너 IP 예시: 172.16.5.2 (flannel에 의해 자동 할당)

## 5. 실험 확인

web01 컨테이너에서 web02 컨테이너 IP (예시: 172.16.9.2)로 ping을 수행합니다:

![web01 ping web02 컨테이너](/images/flannel/page7_img1.png)

Docker02에서 컨테이너를 생성하고 컨테이너 IP 주소를 확인합니다.

결과: 컨테이너 간 통신이 성공하고, flannel 네트워크 구성이 완료되었습니다.

### 부록: etcd 네트워크 구성 조회

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