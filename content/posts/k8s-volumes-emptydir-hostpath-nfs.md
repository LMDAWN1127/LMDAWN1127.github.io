---
title: "K8S 存储卷实战：emptyDir、hostPath 与 NFS"
date: 2026-10-30T19:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文实战 K8S 三类存储卷。emptyDir 生命周期与 Pod 绑定，用多容器 Pod 验证同一卷挂载到两个容器后数据共享；hostPath 把宿主机目录直接挂进 Pod，以 Elasticsearch 7.17.16 为例建索引后删除 Pod 重建，验证单节点持久化；NFS 解决跨节点共享问题，master 上配 nfs-kernel-server、三节点装 nfs-common，部署 MySQL 8.3.0 写入测试数据后把 Pod 从 worker01 漂移到 worker02，数据完整保留。最后给出选型结论：Pod 内共享用 emptyDir，单节点持久化用 hostPath，需要跨节点漂移用 NFS 或分布式存储。"
---

# K8S 存储卷实战：emptyDir、hostPath 与 NFS

---

## 一、emptyDir——同一 Pod 内容器共享数据

emptyDir 卷的生命周期与 Pod 绑定：Pod 创建时空目录生成，Pod 删除时空目录销毁。最经典的场景：一个容器写日志，另一个边车容器读取并转发。

### 1.1 编写多容器 Pod

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

同一个卷 `dawn-dawn` 挂载到 xiuxian 的 `/xixi` 和 alpine 的 `/haha`——两个容器看到的是同一块存储空间。

### 1.2 验证数据共享

```bash
[root@master pods]# kubectl apply -f 06-pods-volume-emptyDir.yaml
pod/xiuxian-emptydir-002 created

# xiuxian容器写入
[root@master pods]# kubectl cp /etc/os-release xiuxian-emptydir-002:/xixi -c xiuxian

# alpine容器可见同一份数据
[root@master pods]# kubectl exec xiuxian-emptydir-002 -c alpine -- ls -l /haha
total 0
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 os-release -> ../usr/lib/os-release
```

---

## 二、hostPath——单节点持久化（Elasticsearch实战）

hostPath 把宿主机目录直接挂进 Pod，Pod 删了数据还在。代价是 Pod 绑定到特定节点，换节点数据就没了。

### 2.1 Worker01 创建数据目录

```bash
[root@worker01 ~]# mkdir -pv /dawn/data/elasticsearch && chmod +777 /dawn/data/elasticsearch
```

### 2.2 部署 ES Pod

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

### 2.3 创建索引

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

### 2.4 删除 Pod 重建

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

Pod 删除重建后，ES 索引 `dawn-dawn` 和 `dawn-xixi` 依然存在——hostPath 持久化验证通过。

---

## 三、NFS——跨节点数据迁移（MySQL实战）

hostPath 的致命缺陷：Pod 绑定在 worker01，如果节点挂了或者你想迁移到 worker02，数据带不走。NFS 卷解决跨节点共享问题。

### 3.1 Master 节点配置 NFS Server

```bash
[root@master ~]# apt-get -y install nfs-kernel-server
[root@master ~]# mkdir -pv /dawn/data/nfs-server/mysql80
[root@master ~]# chmod +777 /dawn/data/nfs-server/mysql80
[root@master ~]# echo '/dawn/data/nfs-server *(rw,no_root_squash)' >> /etc/exports
[root@master ~]# systemctl restart nfs-server
[root@master ~]# exportfs
/dawn/data/nfs-server  <world>
```

### 3.2 三节点安装 nfs-common 客户端

```bash
[root@master ~]# apt-get -y install nfs-common
[root@worker01 ~]# apt-get -y install nfs-common
[root@worker02 ~]# apt-get -y install nfs-common
```

### 3.3 部署MySQL在worker01

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

### 3.4 写入测试数据

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -p123456 -e '
USE wordpress;
CREATE TABLE student(id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255), hobby VARCHAR(255));
INSERT INTO student(name, hobby) VALUE("DAWN", "K8S");
SELECT * FROM student;'
id  name  hobby
1   DAWN  K8S
```

### 3.5 迁移到 worker02

```bash
# 删 Pod，改 nodeName → worker02
[root@master pods]# kubectl delete pod mysql-002
pod "mysql-002" deleted

[root@master pods]# sed -i 's/nodeName: worker01/nodeName: worker02/' 10-pods-volume-nfs-env-mysql.yaml
[root@master pods]# kubectl apply -f 10-pods-volume-nfs-env-mysql.yaml
pod/mysql-002 created

[root@master pods]# kubectl get pods mysql-002 -o wide
NAME        READY   STATUS    RESTARTS   AGE   IP           NODE
mysql-002   1/1     Running   0          25s   10.100.2.7   worker02
```

### 3.6 验证数据完整性

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -pdawn -e 'SELECT * FROM wordpress.student;'
id  name  hobby
1   DAWN  K8S
```

MySQL 从 worker01 漂移到 worker02，数据完整保留，NFS 跨节点持久化验证通过。

---

## 三种卷对比

Pod 内共享 → emptyDir；

单节点持久化 → hostPath；

需要跨节点漂移 → NFS（或 Ceph/GlusterFS 等分布式存储）。