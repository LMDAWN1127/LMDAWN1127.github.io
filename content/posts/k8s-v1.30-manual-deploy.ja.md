---
title: "Kubernetes v1.30 クラスタを手動デプロイする（kubeadm 方式）"
date: 2026-08-07T13:52:00+08:00
draft: false
categories: ["Kubernetes", "運用・デプロイ"]
tags: ["Kubernetes", "kubeadm", "containerd", "calico", "v1.30", "クラスタデプロイ"]
summary: "kubeadm を用いて Kubernetes v1.30 クラスタを手動でデプロイする手順を解説します。ファイアウォール/SELinux、スワップ、カーネルモジュール、Containerd、kubeadm init、ワーカー参加、Calico、IPVS 追加まで網羅。"
showToc: true
TocOpen: true
---

計画は以下の通りです：


Master ノード：   ホスト名： master   IP アドレス：192.168.8.30


Worker01 ノード： ホスト名： node1   IP アドレス：192.168.8.31


Worker02 ノード： ホスト名： node2   IP アドレス：192.168.8.32


3 つのノードすべてで以下の手順を完了し、3 つのノードの時刻が一致していることを確認してください。


## 1. ファイアウォールと SELinux を無効にする

```bash
[root@master ~]# systemctl disable firewalld.service --now
[root@master ~]# vim /etc/selinux/config
SELINUX=disabled
[root@master ~]# setenforce 0
```

## 2. スワップを無効にする

```bash
[root@master ~]# sed -i '/swap/s/^/#/' /etc/fstab
[root@master ~]# swapoff -a
```

## 3. システムパラメータの設定とカーネルモジュールのロード

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

## 4. コンテナランタイム（Containerd）のインストール

Kubernetes v1.30 ではコンテナランタイムとして Containerd の使用が推奨されています：

```bash
[root@master ~]# yum -y remove runc
```

OS 同梱の yum リポジトリファイルを削除します：

```bash
[root@master ~]# rm -rf /etc/yum.repos.d/Cent*.repo
```

ローカル yum リポジトリを設定します：

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

Containerd を設定します：

```bash
[root@master ~]# yum install -y yum-utils
[root@master ~]# yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```

containerd.io をインストールします：

```bash
[root@master ~]# yum install -y containerd.io
# 設定ファイルを生成して編集する
[root@master ~]# mkdir -p /etc/containerd
[root@master ~]# containerd config default > /etc/containerd/config.toml
# systemd cgroup ドライバを使用するよう設定を編集する
#sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g'  /etc/containerd/config.toml
# イメージアクセラレーションを設定（任意）
#sed -i 's|registry.k8s.io|registry.aliyuncs.com/google_containers|g' /etc/containerd/config.toml
# 起動してブート時に有効化する
#systemctl enable --now containerd
```

## 5. Kubernetes のインストールと設定

```bash
[root@master yum.repos.d]# cat kubernetes.repo 
[kubernetes]
name=Kubernetes
baseurl=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/repodata/repomd.xml.key
```

指定バージョンの Kubernetes コンポーネントをインストールします：

```bash
[root@master ~]# yum install -y kubelet-1.30.0 kubeadm-1.30.0 kubectl-1.30.0 --disableexcludes=kubernetes
# kubelet を起動する
[root@master ~]# systemctl enable --now kubelet
```

## 6. Kubernetes の初期化

注意：すべてのノードで上記の設定が完了したら、以下の手順は master ノードでのみ実行してください。

```bash
[root@master ~]# kubeadm init --pod-network-cidr=10.244.0.0/16 --service-cidr=172.16.0.0/16 --image-repository registry.aliyuncs.com/google_containers --kubernetes-version v1.30.0  --control-plane-endpoint="192.168.8.30:6443" --upload-certs
# kubectl を設定する
[root@master ~]# mkdir -p $HOME/.kube
[root@master ~]# cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
[root@master ~]# chown $(id -u):$(id -g) $HOME/.kube/config
```

## 7. ワーカーノードを Kubernetes クラスタに参加させる

以下のコマンドをワーカーノードで実行します。注意：ノードごとにトークンと CA 証明書ハッシュが異なる場合があります。お使いのシステムの指示に従ってください。証明書の有効期限が切れている場合もあります。その場合は `kubeadm token create --print-join-command` で参加コマンドを再生成してください。

```bash
[root@node1 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
[root@node2 ~]# kubeadm join 192.168.8.30:6443 --token yfjrsi.60lmqgzobp0b8al3 --discovery-token-ca-cert-hash sha256:f4e3c924918545abfd8148e71a377e086d591c6a59856a496b4b33e0987d9c18
```

## 8. master ノードへの Calico ネットワークプラグインのインストール

```bash
# Calico ネットワークプラグインをインストールする
[root@master ~]# kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/calico.yaml
```

注意：周知の理由により、Calico イメージのダウンロードに失敗する場合があります。

当該マニフェストファイルを修正したので、master ノードにダウンロードして適用してください：

> このファイルは百度網盤（Baidu Netdisk）にアップロードしてあります。ダウンロードリンク：https://pan.baidu.com/s/1BPCFxv0kE0KWb04Qsgy71g （抽出コード：s44k）

```bash
[root@master ~]# kubectl apply -f /root/calico-ucloud.yaml
```

インストール完了後、以下を実行します：

```bash
[root@master ~]# kubectl get nodes
NAME     STATUS   ROLES           AGE   VERSION
master   Ready    control-plane   65m   v1.30.13
node1    Ready    <none>          62m   v1.30.0
node2    Ready    <none>          62m   v1.30.0
```

上記の結果が表示されれば、Kubernetes のインストールは完了です。


## 9. 補足

各ノードで以下のコマンドを実行します：

```bash
kubectl completion bash > /etc/bash_completion.d/kubectl
source /etc/bash_completion.d/kubectl
vim /root/.bashrc
alias docker='crictl'
source /root/.bashrc
```

`# docker images` を実行した際に、以下のエラーが発生した場合：

Kubernetes に以下の警告が表示された場合の解決方法は次の通りです。

WARN[0000] image connect using default endpoints: [unix:///run/containerd/containerd.sock unix:///run/crio/crio.sock unix:///var/run/cri-dockerd.sock]. As the default settings are now deprecated, you should set the endpoint instead.

この警告は、使用しているコンテナランタイムクライアント（crictl や kubelet など）がデフォルトのエンドポイント設定を使用しており、それが非推奨となっているため明示的に設定する必要があることを示しています。解決手順は以下の通りです：

```bash
cat > /etc/crictl.yaml << EOF
runtime-endpoint: unix:///run/containerd/containerd.sock  # 使用するコンテナランタイムに合わせて選択
image-endpoint: unix:///run/containerd/containerd.sock
timeout: 10
debug: false
pull-image-on-create: false
EOF
```

補足：

Containerd を使用する場合、エンドポイントは `unix:///run/containerd/containerd.sock` です。

CRI-O を使用する場合、エンドポイントは `unix:///run/crio/crio.sock` です。

備考：任意。

Kubernetes を手動でインストールした場合、デフォルトではデータ転送に iptables が使用されます。大規模なシナリオでは、IPVS モードへの変更を推奨します。インストール完了後に IPVS モードに変更する手順は以下の通りです：

## 1. 全ノードに ipvsadm パッケージをインストールする

## 2. 全ノードでモジュールをロードする

```bash
cat > /etc/modules-load.d/ipvs.conf << EOF
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
nf_conntrack
EOF
```

## 3. kube-proxy ConfigMap を編集する

```bash
kubectl edit cm kube-proxy -n kube-system
```

開いたエディタで、以下のセクションを探して変更します：

```yaml
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration

mode: "ipvs"  # "iptables" から "ipvs" に変更

ipvs:
  scheduler: "rr"  # ロードバランシングアルゴリズム： rr|wrr|lc
```

## 4. kube-proxy Pod を強制再起動する

すべての kube-proxy Pod を削除して再作成をトリガーします：

```bash
#kubectl delete pods -n kube-system -l k8s-app=kube-proxy
```

## 5. 新しい Pod が正常に動作していることを確認する

```bash
#kubectl get pods -n kube-system -l k8s-app=kube-proxy
# すべての Pod が Running 状態であること
```

## 6. IPVS 設定が有効になったことを確認する

```bash
[root@master ~]# ipvsadm -L -n
TCP  192.168.8.30:30080 rr
  -> 10.244.104.3:80              Masq    1      0          0         
  -> 10.244.104.4:80              Masq    1      0          0         
  -> 10.244.166.132:80            Masq    1      0          0
```
