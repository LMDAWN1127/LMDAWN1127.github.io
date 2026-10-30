---
title: "K8S Volumes in Practice: emptyDir, hostPath and NFS"
date: 2026-10-30T19:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article puts three K8S volume types to work. emptyDir is tied to the Pod lifecycle — a multi-container Pod shows both containers seeing the same data when the volume is mounted into each. hostPath mounts a host directory directly into the Pod; using Elasticsearch 7.17.16, indices survive deleting and recreating the Pod, proving single-node persistence. NFS solves cross-node sharing: configure nfs-kernel-server on the master, install nfs-common on all three nodes, deploy MySQL 8.3.0, write test data, then drift the Pod from worker01 to worker02 with the data fully intact. It closes with the selection rule: emptyDir for sharing inside a Pod, hostPath for single-node persistence, NFS (or distributed storage) when the workload must move across nodes."
---

# K8S Volumes in Practice: emptyDir, hostPath and NFS

---

## 1. emptyDir — Sharing Data Between Containers in the Same Pod

An emptyDir volume's lifecycle is tied to the Pod: the empty directory is created when the Pod is created and destroyed when the Pod is deleted. The classic use case: one container writes logs and a sidecar container reads and forwards them.

### 1.1 Write a Multi-Container Pod

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

The same volume `dawn-dawn` is mounted at `/xixi` in xiuxian and `/haha` in alpine — both containers see the same storage.

### 1.2 Verify Data Sharing

```bash
[root@master pods]# kubectl apply -f 06-pods-volume-emptyDir.yaml
pod/xiuxian-emptydir-002 created

# The xiuxian container writes
[root@master pods]# kubectl cp /etc/os-release xiuxian-emptydir-002:/xixi -c xiuxian

# The alpine container sees the same data
[root@master pods]# kubectl exec xiuxian-emptydir-002 -c alpine -- ls -l /haha
total 0
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 os-release -> ../usr/lib/os-release
```

---

## 2. hostPath — Single-Node Persistence (Elasticsearch in Practice)

hostPath mounts a host directory straight into the Pod, so data survives Pod deletion. The trade-off is that the Pod is pinned to a specific node: move to another node and the data is gone.

### 2.1 Create the Data Directory on worker01

```bash
[root@worker01 ~]# mkdir -pv /dawn/data/elasticsearch && chmod +777 /dawn/data/elasticsearch
```

### 2.2 Deploy the ES Pod

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

### 2.3 Create an Index

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

### 2.4 Delete and Recreate the Pod

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

After the Pod is deleted and recreated, the ES indices `dawn-dawn` and `dawn-xixi` still exist — hostPath persistence verified.

---

## 3. NFS — Cross-Node Data Migration (MySQL in Practice)

The fatal flaw of hostPath: the Pod is pinned to worker01, so if that node dies or you want to move to worker02, the data cannot follow. An NFS volume solves cross-node sharing.

### 3.1 Configure the NFS Server on the master Node

```bash
[root@master ~]# apt-get -y install nfs-kernel-server
[root@master ~]# mkdir -pv /dawn/data/nfs-server/mysql80
[root@master ~]# chmod +777 /dawn/data/nfs-server/mysql80
[root@master ~]# echo '/dawn/data/nfs-server *(rw,no_root_squash)' >> /etc/exports
[root@master ~]# systemctl restart nfs-server
[root@master ~]# exportfs
/dawn/data/nfs-server  <world>
```

### 3.2 Install the nfs-common Client on All Three Nodes

```bash
[root@master ~]# apt-get -y install nfs-common
[root@worker01 ~]# apt-get -y install nfs-common
[root@worker02 ~]# apt-get -y install nfs-common
```

### 3.3 Deploy MySQL on worker01

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

### 3.4 Write Test Data

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -p123456 -e '
USE wordpress;
CREATE TABLE student(id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255), hobby VARCHAR(255));
INSERT INTO student(name, hobby) VALUE("DAWN", "K8S");
SELECT * FROM student;'
id  name  hobby
1   DAWN  K8S
```

### 3.5 Migrate to worker02

```bash
# Delete the Pod, change nodeName to worker02
[root@master pods]# kubectl delete pod mysql-002
pod "mysql-002" deleted

[root@master pods]# sed -i 's/nodeName: worker01/nodeName: worker02/' 10-pods-volume-nfs-env-mysql.yaml
[root@master pods]# kubectl apply -f 10-pods-volume-nfs-env-mysql.yaml
pod/mysql-002 created

[root@master pods]# kubectl get pods mysql-002 -o wide
NAME        READY   STATUS    RESTARTS   AGE   IP           NODE
mysql-002   1/1     Running   0          25s   10.100.2.7   worker02
```

### 3.6 Verify Data Integrity

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -pdawn -e 'SELECT * FROM wordpress.student;'
id  name  hobby
1   DAWN  K8S
```

MySQL drifted from worker01 to worker02 with all data intact — NFS cross-node persistence verified.

---

## Comparing the Three Volume Types

Sharing inside a Pod -> emptyDir;

Single-node persistence -> hostPath;

Need to drift across nodes -> NFS (or distributed storage such as Ceph/GlusterFS).