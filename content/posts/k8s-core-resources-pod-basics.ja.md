---
title: "K8S コアリソース管理と Pod 基礎実践：マニフェスト、マルチコンテナ Pod、ラベルと hostNetwork"
date: 2026-10-30T16:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は K8S のコアリソース管理と Pod の基礎操作を体系的に整理する。まずよく使うリソース種別の略称チートシートと kubectl api-resources によるクラスタリソースの概要を示し、続いて日常の基本ヘルスチェック（worker ノード一覧、master コンポーネント、flannel インターフェース、各ノードの cni0/flannel.1 仮想インターフェース）を行う。次に単一コンテナ Pod とマルチコンテナ Pod のマニフェスト YAML を作成し、kubectl create と apply の違いを比較して、kubectl exec で指定コンテナに入る。さらに宣言的 API と命令的 API の違い、ラベルの追加・削除・変更・参照とラベルによるリソースの絞り込み/削除、kubectl describe による詳細確認を解説し、最後に hostNetwork モードで Pod がホストのネットワークを共有する様子をデモし、検証環境をクリーンアップする。"
---

# K8S コアリソース管理と Pod 基礎実践：マニフェスト、マルチコンテナ Pod、ラベルと hostNetwork

## 1. K8S よく使うリソース概要

K8S でよく使うリソース種別：

| 略称   | 正式名                     | 説明               |
| ------ | ------------------------ | ------------------ |
| po     | pods                     | コンテナの集まり（最小 1 つ） |
| svc    | services                 | Pod サービスのプロキシ       |
| deploy | deployments              | ステートレスサービスのデプロイ     |
| ds     | daemonsets               | ノードごとに 1 つの Pod     |
| sts    | statefulsets             | ステートフルサービス         |
| rs     | replicasets              | レプリカコントローラ（軽量） |
| cm     | configmaps               | 設定ファイル           |
| ns     | namespaces               | リソース分離           |
| hpa    | horizontalpodautoscalers | 水平オートスケール       |
| ing    | ingresses                | L7 プロキシ           |
| pv/pvc | persistentvolumes/claims | 永続ストレージ           |

### kubectl api-resources

```bash
[root@master ~]# kubectl api-resources | wc -l
57

[root@master ~]# kubectl api-resources
# 57 行のリソース種別を出力（pods, services, deployments, daemonsets, ingresses, ...）
```

---

## 2. K8S 日常の基本ヘルスチェック

### 1. worker ノード一覧を確認

```bash
[root@master ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE    VERSION
master     Ready    control-plane,master   148m   v1.23.17
worker01   Ready    <none>                 147m   v1.23.17
worker02   Ready    <none>                 147m   v1.23.17
```

### 2. master コンポーネントを確認

```bash
[root@master ~]# kubectl get cs
Warning: v1 ComponentStatus is deprecated in v1.19+
NAME                 STATUS    MESSAGE                         ERROR
controller-manager   Healthy   ok
etcd-0               Healthy   {"health":"true","reason":""}
scheduler            Healthy   ok
```

### 3. flannel インターフェースを確認

```bash
[root@master ~]# kubectl get pods -n kube-flannel -o wide
NAME                    READY   STATUS    RESTARTS   AGE    IP           NODE
kube-flannel-ds-8rmk2   1/1     Running   0          136m   11.0.1.233   worker02
kube-flannel-ds-n6wcv   1/1     Running   0          143m   11.0.1.232   worker01
kube-flannel-ds-tw8f6   1/1     Running   0          143m   11.0.1.231   master
```

### 4. 各ノードの cni0 と flannel.1 仮想インターフェースを確認

```bash
[root@master ~]# ip addr show cni0 | grep 'inet '
    inet 10.100.0.1/24 brd 10.100.0.255 scope global cni0
[root@master ~]# ip addr show flannel.1 | grep 'inet '
    inet 10.100.0.0/32 scope global flannel.1

[root@worker01 ~]# ip addr show cni0 | grep 'inet '
    inet 10.100.1.1/24 brd 10.100.1.255 scope global cni0
[root@worker01 ~]# ip addr show flannel.1 | grep 'inet '
    inet 10.100.1.0/32 scope global flannel.1

[root@worker02 ~]# ip addr show cni0 | grep 'inet '
    inet 10.100.2.1/24 brd 10.100.2.255 scope global cni0
[root@worker02 ~]# ip addr show flannel.1 | grep 'inet '
    inet 10.100.2.0/32 scope global flannel.1
```

3 ノードの cni0 と flannel.1 のサブネットが一致

---

## 3. Pod リソースマニフェストの記述と作成/削除

### 1. リソースディレクトリを作成

```bash
[root@master ~]# mkdir -pv /dawn/manifests/pods
[root@master ~]# cd /dawn/manifests/pods
```

### 2. 単一コンテナ Pod の YAML を作成

```bash
[root@master pods]# cat 01-pods-xiuxian-single.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v1
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

### 3. kubectl create と apply の比較

```bash
# create でリソースを作成
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

# 再度 create —— AlreadyExists エラー
[root@master pods]# kubectl create -f 01-pods-xiuxian-single.yaml
Error from server (AlreadyExists): error when creating "01-pods-xiuxian-single.yaml": pods "xiuxian-v1" already exists

# apply —— エラーなし、unchanged/configured を出力
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 configured

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 unchanged
```

本番環境では常に `kubectl apply` を使う。新規リソースは `created`、既存リソースは変更の有無に応じて `configured`/`unchanged` となる。

### 4. Pod 一覧を表示

```bash
[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       NOMINATED NODE   READINESS GATES
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   <none>           <none>
```

### 5. リソースを削除

```bash
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```

### 6. 再作成

```bash
[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE       ...
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01   ...
```

---

## 4. マルチコンテナ Pod と kubectl exec

### 1. alpine イメージの準備

```bash
[root@master ~]# docker pull alpine:3.20.2
3.20.2: Pulling from library/alpine
Digest: sha256:0a4eaa0eecf5f8c050e5bba433f58c052be7587ee8af3e8b3910ef9ab5fbe9f5
Status: Downloaded newer image for alpine:3.20.2

[root@master ~]# docker tag alpine:3.20.2 harbor:443/dawn-linux/alpine:3.20.2
[root@master ~]# docker push harbor:443/dawn-linux/alpine:3.20.2
3.20.2: digest: sha256:eddacbc7e24bf8799a4ed3cdcfa50d4b88a323695ad80f317b6629883b2c2a78 size: 528
```

### 2. マルチコンテナ Pod の YAML

```bash
[root@master pods]# cat 02-pods-xiuxian-alpine-multiple.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v2
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v2
    name: xiuxian
  - image: harbor:443/dawn-linux/alpine:3.20.2
    name: alpine
    stdin: true
```

```bash
[root@master pods]# kubectl apply -f 02-pods-xiuxian-alpine-multiple.yaml
pod/xiuxian-v2 created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          8s    10.100.1.6   worker01
xiuxian-v2   2/2     Running   0          8s    10.100.1.7   worker01
```

READY は `2/2` —— 両方のコンテナが準備完了。

### 3. kubectl exec でコンテナ内でコマンドを実行

```bash
# 単一コンテナ Pod、そのまま exec
[root@master pods]# kubectl exec xiuxian-v1 -- ifconfig
eth0      Link encap:Ethernet  HWaddr D2:D6:0C:13:89:D9
          inet addr:10.100.1.6  Bcast:10.100.1.255  Mask:255.255.255.0

# マルチコンテナ Pod、-c 未指定なら 0 番目のコンテナ
[root@master pods]# kubectl exec xiuxian-v2 -- hostname -i
Defaulted container "xiuxian" out of: xiuxian, alpine
10.100.1.7

# コンテナ名を指定
[root@master pods]# kubectl exec xiuxian-v2 -c alpine -- hostname -i
10.100.1.7
```

同一 Pod 内の複数コンテナはネットワーク名前空間を共有し、IP も同じ

---

## 5. 宣言的 API vs 命令的 API

### 命令的に Pod を作成

```bash
[root@master pods]# kubectl run xixi --image=harbor:443/dawn/apps:v2
pod/xixi created

[root@master pods]# kubectl get pods -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01
xiuxian-v2   2/2     Running   0          30s   10.100.1.7   worker01
xixi         1/1     Running   0          5s    10.100.2.4   worker02
```

### 宣言的な表示 vs 命令的な表示

```bash
# 宣言的：マニフェストファイルで絞り込み
[root@master pods]# kubectl get -f 01-pods-xiuxian-single.yaml -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE
xiuxian-v1   1/1     Running   0          30s   10.100.1.6   worker01

# 命令的：全体を表示
[root@master pods]# kubectl get pods -o wide --show-labels
NAME         READY   STATUS    ...  LABELS
xiuxian-v1   1/1     Running   ...  <none>
xiuxian-v2   2/2     Running   ...  <none>
xixi         1/1     Running   ...  run=xixi
```

---

## 6. ラベル管理

### 1. 命令的にラベルを追加

```bash
[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml school=czu class=computer01
pod/xiuxian-v1 labeled

[root@master pods]# kubectl label pods xiuxian-v1 address=ShaHe
pod/xiuxian-v1 labeled

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  address=ShaHe,class=computer01,school=czu
xixi         ...  run=xixi
```

### 2. 命令的にラベルを削除（ラベル名の後ろに `-`）

```bash
[root@master pods]# kubectl label pods xiuxian-v1 address-
pod/xiuxian-v1 unlabeled

[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml school-
pod/xiuxian-v1 unlabeled

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  class=computer01
xixi         ...  run=xixi
```

### 3. 命令的にラベルを変更

```bash
[root@master pods]# kubectl label -f 01-pods-xiuxian-single.yaml class=computer01 --overwrite
pod/xiuxian-v1 labeled
```

### 4. 命令的なラベルは一時的

```bash
# 削除して再作成 —— ラベルが消える
[root@master pods]# kubectl delete -f 01-pods-xiuxian-single.yaml
pod "xiuxian-v1" deleted

[root@master pods]# kubectl apply -f 01-pods-xiuxian-single.yaml
pod/xiuxian-v1 created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME         ...  LABELS
xiuxian-v1   ...  <none>        ← ラベルが消えた！
xixi         ...  run=xixi
```

### 5. 宣言的なラベル（YAML に記述、永続的）

```bash
[root@master pods]# cat 03-pods-labels.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-labels
  labels:
    school: czu
    class: computer01
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v2
    name: xiuxian
  - image: harbor:443/dawn-linux/alpine:3.20.2
    name: alpine
    stdin: true
```

```bash
[root@master pods]# kubectl apply -f 03-pods-labels.yaml
pod/xiuxian-labels created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME             READY   STATUS    ...  LABELS
xiuxian-labels   2/2     Running   ...  class=computer01,school=czu
xiuxian-v1       1/1     Running   ...  <none>
xixi             1/1     Running   ...  run=xixi
```

### 6. ラベルでリソースを絞り込み

```bash
# class ラベルを持つ Pod
[root@master pods]# kubectl get pods -l class --show-labels
NAME             READY   STATUS    ...  LABELS
xiuxian-labels   2/2     Running   ...  class=computer01,school=czu

# class=computer01 を完全一致
[root@master pods]# kubectl get pods -l class=computer01 --show-labels

# run ラベル
[root@master pods]# kubectl get pods -l run --show-labels
NAME   READY   STATUS    ...  LABELS
xixi   1/1     Running   ...  run=xixi
```

### 7. ラベルで削除

```bash
[root@master pods]# kubectl delete pods -l class
pod "xiuxian-labels" deleted

[root@master pods]# kubectl get pods --show-labels
NAME         READY   STATUS    ...  LABELS
xiuxian-v1   1/1     Running   ...  <none>
xiuxian-v2   2/2     Running   ...  <none>
xixi         1/1     Running   ...  run=xixi
```

---

## 7. kubectl describe でリソースの詳細を表示

### 1. Pod の詳細を表示

```bash
[root@master pods]# kubectl describe pods xixi
Name:         xixi
Namespace:    default
Node:         worker02/11.0.1.233
Labels:       run=xixi
Status:       Running
IP:           10.100.2.4
Containers:
  xixi:
    Image:          harbor:443/dawn/apps:v2
    State:          Running
    Ready:          True
    Restart Count:  0
Events:
  Normal  Scheduled  90s   default-scheduler  Successfully assigned default/xixi to worker02
  Normal  Pulled     89s   kubelet            Container image "harbor:443/dawn/apps:v2" already present on machine
  Normal  Created    89s   kubelet            Created container xixi
  Normal  Started    89s   kubelet            Started container xixi
```

### 2. ノードの詳細を表示

```bash
[root@master pods]# kubectl describe nodes master
Name:               master
Roles:              control-plane,master
Annotations:        flannel.alpha.coreos.com/public-ip: 11.0.1.231
                    flannel.alpha.coreos.com/backend-type: vxlan
Capacity:
  cpu:                2
  memory:             3969504Ki
  pods:               110
Conditions:
  NetworkUnavailable   False    FlannelIsUp    Flannel is running on this node
  MemoryPressure       False
  DiskPressure         False
  Ready                True
System Info:
  Kernel Version:     5.15.0-202-generic
  OS Image:           Ubuntu 22.04.3 LTS
  Container Runtime:  docker://27.0.3
  Kubelet Version:    v1.23.17
```

### 3. ラベルで describe を絞り込み

```bash
[root@master pods]# kubectl describe pods -l run=xixi
Name:         xixi
...
```

---

## 8. hostNetwork モード（Pod がホストのネットワークを共有）

```bash
[root@master pods]# cat 04-pods-hostNetwork.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostnetwork
  labels:
    apps: xiuxian
    school: czu
    class: computer01
spec:
  hostNetwork: true
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl apply -f 04-pods-hostNetwork.yaml
pod/xiuxian-hostnetwork created

[root@master pods]# kubectl get pods -o wide --show-labels
NAME                  READY   STATUS    RESTARTS   AGE   IP           NODE       LABELS
xiuxian-hostnetwork   1/1     Running   0          5s    11.0.1.232   worker01   apps=xiuxian,class=computer01,school=czu
xiuxian-v1            1/1     Running   0          62s   10.100.1.8   worker01   <none>
xiuxian-v2            2/2     Running   0          115s  10.100.1.7   worker01   <none>
```

`hostNetwork: true` の Pod の IP は `11.0.1.232`（ホスト worker01 の物理 IP）、通常の Pod の IP は `10.100.1.x`（Pod ネットワーク）。

```bash
# ホスト IP に curl すると hostNetwork Pod 内の nginx に届く
[root@master pods]# curl -s 11.0.1.232 | head -5
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v1</title>
```

---

## 9. 環境のクリーンアップ

```bash
[root@master pods]# kubectl delete pods --all
pod "xiuxian-hostnetwork" deleted
pod "xiuxian-v1" deleted
pod "xiuxian-v2" deleted
pod "xixi" deleted

[root@master pods]# kubectl get pods
No resources found in default namespace.
```
