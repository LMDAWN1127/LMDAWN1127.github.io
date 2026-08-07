---
title: "Kubernetes v1.30 클러스터 수동 배포 (kubeadm 방식)"
date: 2026-08-07T13:52:00+08:00
draft: false
categories: ["Kubernetes", "운영・배포"]
tags: ["Kubernetes", "kubeadm", "containerd", "calico", "v1.30", "클러스터배포"]
summary: "kubeadm으로 Kubernetes v1.30 클러스터를 수동 배포하는 단계별 가이드입니다. 방화벽/SELinux, 스왑, 커널 모듈, Containerd, kubeadm init, 워커 가입, Calico, IPVS 추가까지 다룹니다."
---

계획은 다음과 같습니다:


Master 노드:   호스트명: master   IP 주소: 192.168.8.30


Worker01 노드: 호스트명: node1   IP 주소: 192.168.8.31


Worker02 노드: 호스트명: node2   IP 주소: 192.168.8.32


세 노드 모두에서 다음 단계를 완료하고, 세 노드의 시간이 일치하는지 확인하세요.


## 1. 방화벽 및 SELinux 비활성화

```bash
[root@master ~]# systemctl disable firewalld.service --now
[root@master ~]# vim /etc/selinux/config
SELINUX=disabled
[root@master ~]# setenforce 0
```

## 2. 스왑 비활성화

```bash
[root@master ~]# sed -i '/swap/s/^/#/' /etc/fstab
[root@master ~]# swapoff -a
```

## 3. 시스템 파라미터 설정 및 커널 모듈 로드

```bash
[root@master ~]# cat > /etc/modules-load.d/k8s.conf << EOF
overlay
br_netfilter
EOF
[root@master ~]# modprobe overlay
[root@master ~]# modprobe br_netfilter
[root@master ~]# cat > /etc/sysctl.d/k8s.conf << EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
[root@master ~]# sysctl --system
```

## 4. 컨테이너 런타임(Containerd) 설치

Kubernetes v1.30에서는 컨테이너 런타임으로 Containerd 사용을 권장합니다：

```bash
[root@master ~]# yum -y remove runc
```

OS에 기본 포함된 yum 저장소 파일을 삭제합니다：

```bash
[root@master ~]# rm -rf /etc/yum.repos.d/Cent*.repo
```

로컬 yum 저장소를 구성합니다：

```bash
[root@master ~]# mount /dev/cdrom /media/
[root@master ~]# cat /etc/fstab | grep iso9660
/dev/cdrom		/media			iso9660 defaults   0 0
[root@master ~]# cat /etc/yum.repos.d/dvd.repo 
[BaseOS]
name=BaseOS
baseurl=file:///media/BaseOS
gpgcheck=0
[AppStream]
name=AppStream
baseurl=file:///media/AppStream
gpgcheck=0
```

Containerd를 구성합니다：

```bash
[root@master ~]# yum install -y yum-utils
[root@master ~]# yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```

containerd.io를 설치합니다：

```bash
[root@master ~]# yum install -y containerd.io
# 설정 파일을 생성하고 편집합니다
[root@master ~]# mkdir -p /etc/containerd
[root@master ~]# containerd config default > /etc/containerd/config.toml
# systemd cgroup 드라이버를 사용하도록 설정을 편집합니다
#sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g'  /etc/containerd/config.toml
# 이미지 가속 구성(선택 사항)
#sed -i 's|registry.k8s.io|registry.aliyuncs.com/google_containers|g' /etc/containerd/config.toml
# 시작하고 부팅 시 활성화합니다
#systemctl enable --now containerd
```

## 5. Kubernetes 설치 및 구성

```bash
[root@master yum.repos.d]# cat kubernetes.repo 
[kubernetes]
name=Kubernetes
baseurl=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/repodata/repomd.xml.key
```

지정한 버전의 Kubernetes 구성 요소를 설치합니다：

```bash
[root@master ~]# yum install -y kubelet-1.30.0 kubeadm-1.30.0 kubectl-1.30.0 --disableexcludes=kubernetes
# kubelet 시작
[root@master ~]# systemctl enable --now kubelet
```

## 6. Kubernetes 초기화

주의：모든 노드에서 위 구성을 마친 후, 다음 단계는 master 노드에서만 실행하세요.

```bash
[root@master ~]# kubeadm init --pod-network-cidr=10.244.0.0/16 --service-cidr=172.16.0.0/16 --image-repository registry.aliyuncs.com/google_containers --kubernetes-version v1.30.0  --control-plane-endpoint="192.168.8.30:6443" --upload-certs
# kubectl 구성
[root@master ~]# mkdir -p $HOME/.kube
[root@master ~]# cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
[root@master ~]# chown $(id -u):$(id -g) $HOME/.kube/config
```

## 7. 워커 노드를 Kubernetes 클러스터에 가입

다음 명령을 워커 노드에서 실행합니다. 주의：노드마다 토큰과 CA 인증서 해시가 다를 수 있으므로 자신의 시스템 프롬프트를 따르세요. 인증서가 만료되었을 수도 있으며, 만료된 경우 `kubeadm token create --print-join-command`로 가입 명령을 다시 생성하세요.

```bash
[root@node1 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
[root@node2 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
```

## 8. master 노드에 Calico 네트워크 플러그인 설치

```bash
# Calico 네트워크 플러그인 설치
[root@master ~]# kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/calico.yaml
```

참고：잘 알려진 이유로 Calico 이미지 다운로드에 실패할 수 있습니다.

해당 매니페스트 파일을 수정해 두었으니, master 노드에 다운로드하여 적용하세요：

> 이 파일은 Baidu Netdisk(百度网盘)에 업로드되어 있습니다. 다운로드 링크: https://pan.baidu.com/s/1BPCFxv0kE0KWb04Qsgy71g (추출 코드: s44k)

```bash
[root@master ~]# kubectl apply -f /root/calico-ucloud.yaml
```

설치 완료 후 다음을 실행합니다：

```bash
[root@master ~]# kubectl get nodes
NAME     STATUS   ROLES           AGE   VERSION
master   Ready    control-plane   65m   v1.30.13
node1    Ready    <none>          62m   v1.30.0
node2    Ready    <none>          62m   v1.30.0
```

위 결과가 보이면 Kubernetes 설치가 완료된 것입니다.


## 9. 추가 내용

각 노드에서 다음 명령을 실행합니다：

```bash
kubectl completion bash > /etc/bash_completion.d/kubectl
source /etc/bash_completion.d/kubectl
vim /root/.bashrc
alias docker='crictl'
source /root/.bashrc
```

> **참고:**
> - **kubectl 셸 완성:** 위의 첫 두 줄은 kubectl 완성 스크립트를 `/etc/bash_completion.d/`에 기록합니다. 단, 이전에 **시스템에 `bash-completion` 패키지가 설치되어 있어야** 합니다(`yum install -y bash-completion` 또는 `apt install -y bash-completion`). 설치되어 있지 않으면 해당 디렉터리가 존재하지 않아 완성이 동작하지 않습니다. 또한 kubectl 자체도 이 두 명령을 실행해야 비로소 완성이 활성화됩니다(Kubernetes는 이 추가 설정이 필요합니다).
> - **`docker` 별칭:** Kubernetes가 containerd 런타임으로 전환되면서 컨테이너 관리 명령은 `docker` 대신 `crictl`을 사용합니다. 여기서 `docker`를 `crictl`로 별칭하는 것은 `docker` 명령에 익숙한 사용자를 배려하여 기존 작업 습관을 그대로 유지할 수 있게 하기 위함입니다.

`# docker images`를 실행했을 때 다음과 같은 오류가 발생하는 경우：

Kubernetes에 다음 경고가 표시되면 해결 방법은 다음과 같습니다.

WARN[0000] image connect using default endpoints: [unix:///run/containerd/containerd.sock unix:///run/crio/crio.sock unix:///var/run/cri-dockerd.sock]. As the default settings are now deprecated, you should set the endpoint instead.

이 경고는 사용 중인 컨테이너 런타임 클라이언트(예： crictl 또는 kubelet)가 기본 엔드포인트 설정을 사용하고 있으며, 이 설정은 이제 더 이상 사용되지 않으므로 명시적으로 지정해야 함을 나타냅니다. 해결 단계는 다음과 같습니다：

```bash
cat > /etc/crictl.yaml << EOF
runtime-endpoint: unix:///run/containerd/containerd.sock  # 사용하는 컨테이너 런타임에 맞게 선택
image-endpoint: unix:///run/containerd/containerd.sock
timeout: 10
debug: false
pull-image-on-create: false
EOF
```

설명：

Containerd를 사용하는 경우 엔드포인트는 `unix:///run/containerd/containerd.sock`입니다.

CRI-O를 사용하는 경우 엔드포인트는 `unix:///run/crio/crio.sock`입니다.

비고：선택 사항.

Kubernetes를 수동으로 설치하면 기본적으로 데이터 전송에 iptables를 사용합니다. 대규모 환경에서는 IPVS 모드로 변경하는 것이 좋습니다. 설치 완료 후 IPVS 모드로 변경하는 단계는 다음과 같습니다：

## 1. 모든 노드에 ipvsadm 패키지 설치

```bash
[root@master ~]# yum -y install ipvsadm
```

## 2. 모든 노드에서 모듈 로드

```bash
cat > /etc/modules-load.d/ipvs.conf << EOF
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
nf_conntrack
EOF
```

## 3. kube-proxy ConfigMap 편집

```bash
kubectl edit cm kube-proxy -n kube-system
```

열린 편집기에서 다음 섹션을 찾아 수정합니다：

```yaml
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration

mode: "ipvs"  # "iptables"를 "ipvs"로 변경

ipvs:
  scheduler: "rr"  # 로드 밸런싱 알고리즘： rr|wrr|lc
```

## 4. kube-proxy Pod 강제 재시작

모든 kube-proxy Pod를 삭제하여 재생성을 트리거합니다：

```bash
#kubectl delete pods -n kube-system -l k8s-app=kube-proxy
```

## 5. 새 Pod가 정상 동작하는지 확인

```bash
#kubectl get pods -n kube-system -l k8s-app=kube-proxy
# 모든 Pod가 Running 상태여야 합니다
```

## 6. IPVS 설정이 적용되었는지 확인

```bash
[root@master ~]# ipvsadm -L -n
TCP  192.168.8.30:30080 rr
  -> 10.244.104.3:80              Masq    1      0          0         
  -> 10.244.104.4:80              Masq    1      0          0         
  -> 10.244.166.132:80            Masq    1      0          0
```
