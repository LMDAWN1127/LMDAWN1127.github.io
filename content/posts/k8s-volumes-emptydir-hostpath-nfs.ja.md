---
title: "K8S ストレージボリューム実践：emptyDir、hostPath と NFS"
date: 2026-10-30T19:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は K8S の 3 種類のボリュームを実践する。emptyDir は Pod のライフサイクルに紐づき、マルチコンテナ Pod で同じボリュームを各コンテナにマウントすると両方から同じデータが見えることを検証する。hostPath はホストのディレクトリを直接 Pod にマウントする。Elasticsearch 7.17.16 を使い、Pod を削除して再作成してもインデックスが残ることで単一ノードの永続化を証明する。NFS はノード間共有を解決する。master で nfs-kernel-server を構成し、3 ノードに nfs-common を入れ、MySQL 8.3.0 をデプロイしてテストデータを書き込み、Pod を worker01 から worker02 へ漂移させてもデータが完全に残ることを確認する。最後に選択基準をまとめる。Pod 内の共有は emptyDir、単一ノードの永続化は hostPath、ノード間の漂移が必要なら NFS（または分散ストレージ）。"
---

# K8S ストレージボリューム実践：emptyDir、hostPath と NFS

---

## 1. emptyDir —— 同一 Pod 内のコンテナ間でデータを共有

emptyDir ボリュームのライフサイクルは Pod に紐づく。Pod 作成時に空ディレクトリが生成され、Pod 削除時に破棄される。最も典型的なシナリオは、あるコンテナがログを書き、別のサイドカーコンテナがそれを読んで転送する構成。

### 1.1 マルチコンテナ Pod を作成

```yaml
# 06-pods-volume-emptyDir.yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-emptydir-002
spec:
  nodeName: worker01
  volumes:
  - name: dawn-dawn
    emptyDir: {}
  containers:
  - image: harbor:443/dawn/apps:v2
    name: xiuxian
    volumeMounts:
    - name: dawn-dawn
      mountPath: /xixi
  - image: harbor:443/dawn-linux/alpine:3.20.2
    name: alpine
    stdin: true
    volumeMounts:
    - name: dawn-dawn
      mountPath: /haha
```

同じボリューム `dawn-dawn` を xiuxian の `/xixi` と alpine の `/haha` にマウント —— 両方のコンテナは同じストレージ領域を見ている。

### 1.2 データ共有を検証

```bash
[root@master pods]# kubectl apply -f 06-pods-volume-emptyDir.yaml
pod/xiuxian-emptydir-002 created

# xiuxian コンテナが書き込み
[root@master pods]# kubectl cp /etc/os-release xiuxian-emptydir-002:/xixi -c xiuxian

# alpine コンテナから同じデータが見える
[root@master pods]# kubectl exec xiuxian-emptydir-002 -c alpine -- ls -l /haha
total 0
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 os-release -> ../usr/lib/os-release
```

---

## 2. hostPath —— 単一ノードでの永続化（Elasticsearch 実践）

hostPath はホストのディレクトリを直接 Pod にマウントするため、Pod を消してもデータは残る。代償として Pod が特定ノードに縛られ、別ノードに移すとデータが失われる。

### 2.1 worker01 にデータディレクトリを作成

```bash
[root@worker01 ~]# mkdir -pv /dawn/data/elasticsearch && chmod +777 /dawn/data/elasticsearch
```

### 2.2 ES Pod をデプロイ

```yaml
# 07-pods-volume-hostPath.yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-hostpath-es
  labels:
    apps: es7
spec:
  nodeName: worker01
  volumes:
  - name: data
    hostPath:
      path: /dawn/data/elasticsearch
  containers:
  - image: harbor:443/dawn-elasticstack/elasticsearch:7.17.16
    name: xiuxian
    env:
    - name: discovery.type
      value: single-node
    volumeMounts:
    - name: data
      mountPath: /usr/share/elasticsearch/data
```

### 2.3 インデックスを作成

```bash
[root@master pods]# kubectl get pods -o wide
NAME                  READY   STATUS    RESTARTS   AGE   IP
xiuxian-hostpath-es   1/1     Running   0          41s   10.100.1.12

[root@master pods]# curl -s 10.100.1.12:9200 | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d['cluster_name'], d['version']['number'])"
docker-cluster 7.17.16

[root@master pods]# curl -s -X PUT 10.100.1.12:9200/dawn-dawn
{"acknowledged":true,"shards_acknowledged":true,"index":"dawn-dawn"}

[root@master pods]# curl -s -X PUT 10.100.1.12:9200/dawn-xixi
{"acknowledged":true,"shards_acknowledged":true,"index":"dawn-xixi"}
```

### 2.4 Pod を削除して再作成

```bash
[root@master pods]# kubectl delete pod xiuxian-hostpath-es
pod "xiuxian-hostpath-es" deleted

[root@master pods]# kubectl apply -f 07-pods-volume-hostPath.yaml
pod/xiuxian-hostpath-es created

[root@master pods]# IP=$(kubectl get pod xiuxian-hostpath-es -o jsonpath='{.status.podIP}')
[root@master pods]# curl -s $IP:9200/_cat/indices
green  open .geoip_databases ... 5 0 4.8mb 4.8mb
yellow open dawn-xixi        ... 1 1 0 0    227b  227b
yellow open dawn-dawn     ... 1 1 0 0    227b  227b
```

Pod を削除して再作成しても ES のインデックス `dawn-dawn` と `dawn-xixi` は残っている —— hostPath の永続化を検証できた。

---

## 3. NFS —— ノード間データ移行（MySQL 実践）

hostPath の致命的な欠点：Pod が worker01 に縛られるため、そのノードが落ちた場合や worker02 に移したい場合、データを持っていけない。NFS ボリュームがノード間共有を解決する。

### 3.1 master ノードで NFS Server を構成

```bash
[root@master ~]# apt-get -y install nfs-kernel-server
[root@master ~]# mkdir -pv /dawn/data/nfs-server/mysql80
[root@master ~]# chmod +777 /dawn/data/nfs-server/mysql80
[root@master ~]# echo '/dawn/data/nfs-server *(rw,no_root_squash)' >> /etc/exports
[root@master ~]# systemctl restart nfs-server
[root@master ~]# exportfs
/dawn/data/nfs-server  <world>
```

### 3.2 3 ノードに nfs-common クライアントをインストール

```bash
[root@master ~]# apt-get -y install nfs-common
[root@worker01 ~]# apt-get -y install nfs-common
[root@worker02 ~]# apt-get -y install nfs-common
```

### 3.3 worker01 に MySQL をデプロイ

```yaml
# 10-pods-volume-nfs-env-mysql.yaml
apiVersion: v1
kind: Pod
metadata:
  name: mysql-002
  labels:
    apps: mysql80
spec:
  nodeName: worker01
  volumes:
  - name: db
    nfs:
      server: 11.0.1.231
      path: /dawn/data/nfs-server/mysql80
  containers:
  - image: harbor:443/dawn-db/mysql:8.3.0-oracle
    name: mysql
    env:
    - name: MYSQL_ROOT_PASSWORD
      value: 123456
    - name: MYSQL_DATABASE
      value: wordpress
    - name: MYSQL_USER
      value: dawn
    - name: MYSQL_PASSWORD
      value: "123456"
    volumeMounts:
    - name: db
      mountPath: /var/lib/mysql
```

### 3.4 テストデータを書き込み

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -p123456 -e '
USE wordpress;
CREATE TABLE student(id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255), hobby VARCHAR(255));
INSERT INTO student(name, hobby) VALUE("DAWN", "K8S");
SELECT * FROM student;'
id  name  hobby
1   DAWN  K8S
```

### 3.5 worker02 へ移行

```bash
# Pod を削除し、nodeName を worker02 に変更
[root@master pods]# kubectl delete pod mysql-002
pod "mysql-002" deleted

[root@master pods]# sed -i 's/nodeName: worker01/nodeName: worker02/' 10-pods-volume-nfs-env-mysql.yaml
[root@master pods]# kubectl apply -f 10-pods-volume-nfs-env-mysql.yaml
pod/mysql-002 created

[root@master pods]# kubectl get pods mysql-002 -o wide
NAME        READY   STATUS    RESTARTS   AGE   IP           NODE
mysql-002   1/1     Running   0          25s   10.100.2.7   worker02
```

### 3.6 データの完全性を検証

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -pdawn -e 'SELECT * FROM wordpress.student;'
id  name  hobby
1   DAWN  K8S
```

MySQL は worker01 から worker02 へ漂移し、データは完全に保持された —— NFS のノード間永続化を検証できた。

---

## 3 種類のボリューム比較

Pod 内で共有 → emptyDir；

単一ノードの永続化 → hostPath；

ノード間の漂移が必要 → NFS（または Ceph/GlusterFS などの分散ストレージ）。