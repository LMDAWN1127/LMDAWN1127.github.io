---
title: "K8S 스토리지 볼륨 실전: emptyDir, hostPath 그리고 NFS"
date: 2026-10-30T19:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 K8S 의 세 가지 볼륨을 실습한다. emptyDir 는 Pod 생명주기에 묶이며, 멀티 컨테이너 Pod 에서 같은 볼륨을 각 컨테이너에 마운트하면 양쪽에서 같은 데이터가 보임을 검증한다. hostPath 는 호스트 디렉터리를 Pod 에 직접 마운트한다. Elasticsearch 7.17.16 으로 Pod 를 삭제하고 다시 만들어도 인덱스가 남아 단일 노드 영속화를 입증한다. NFS 는 노드 간 공유를 해결한다. master 에 nfs-kernel-server 를 구성하고 세 노드에 nfs-common 을 설치한 뒤 MySQL 8.3.0 을 배포해 테스트 데이터를 넣고, Pod 를 worker01 에서 worker02 로 옮겨도 데이터가 온전히 유지됨을 확인한다. 마지막으로 선택 기준을 정리한다. Pod 내부 공유는 emptyDir, 단일 노드 영속화는 hostPath, 노드 간 이동이 필요하면 NFS（또는 분산 스토리지）."
---

# K8S 스토리지 볼륨 실전: emptyDir, hostPath 그리고 NFS

---

## 1. emptyDir —— 같은 Pod 안 컨테이너 간 데이터 공유

emptyDir 볼륨의 생명주기는 Pod 에 묶인다. Pod 생성 시 빈 디렉터리가 만들어지고, Pod 삭제 시 함께 사라진다. 가장 대표적인 시나리오는 한 컨테이너가 로그를 쓰고 다른 사이드카 컨테이너가 읽어 전달하는 구성이다.

### 1.1 멀티 컨테이너 Pod 작성

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

같은 볼륨 `dawn-dawn` 을 xiuxian 의 `/xixi` 와 alpine 의 `/haha` 에 마운트 —— 두 컨테이너는 같은 저장 공간을 본다.

### 1.2 데이터 공유 검증

```bash
[root@master pods]# kubectl apply -f 06-pods-volume-emptyDir.yaml
pod/xiuxian-emptydir-002 created

# xiuxian 컨테이너가 쓰기
[root@master pods]# kubectl cp /etc/os-release xiuxian-emptydir-002:/xixi -c xiuxian

# alpine 컨테이너에서 동일 데이터 확인
[root@master pods]# kubectl exec xiuxian-emptydir-002 -c alpine -- ls -l /haha
total 0
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 os-release -> ../usr/lib/os-release
```

---

## 2. hostPath —— 단일 노드 영속화（Elasticsearch 실전）

hostPath 는 호스트 디렉터리를 Pod 에 직접 마운트하므로 Pod 를 지워도 데이터가 남는다. 대가는 Pod 가 특정 노드에 묶인다는 점이다. 다른 노드로 옮기면 데이터가 사라진다.

### 2.1 worker01 에 데이터 디렉터리 생성

```bash
[root@worker01 ~]# mkdir -pv /dawn/data/elasticsearch && chmod +777 /dawn/data/elasticsearch
```

### 2.2 ES Pod 배포

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

### 2.3 인덱스 생성

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

### 2.4 Pod 삭제 후 재생성

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

Pod 를 삭제하고 다시 만들어도 ES 인덱스 `dawn-dawn` 과 `dawn-xixi` 는 그대로 남아 있다 —— hostPath 영속화 검증 통과.

---

## 3. NFS —— 노드 간 데이터 이전（MySQL 실전）

hostPath 의 치명적 결함: Pod 가 worker01 에 묶여 있어 노드가 죽거나 worker02 로 옮기려 할 때 데이터를 가져갈 수 없다. NFS 볼륨이 노드 간 공유를 해결한다.

### 3.1 master 노드에 NFS Server 구성

```bash
[root@master ~]# apt-get -y install nfs-kernel-server
[root@master ~]# mkdir -pv /dawn/data/nfs-server/mysql80
[root@master ~]# chmod +777 /dawn/data/nfs-server/mysql80
[root@master ~]# echo '/dawn/data/nfs-server *(rw,no_root_squash)' >> /etc/exports
[root@master ~]# systemctl restart nfs-server
[root@master ~]# exportfs
/dawn/data/nfs-server  <world>
```

### 3.2 세 노드에 nfs-common 클라이언트 설치

```bash
[root@master ~]# apt-get -y install nfs-common
[root@worker01 ~]# apt-get -y install nfs-common
[root@worker02 ~]# apt-get -y install nfs-common
```

### 3.3 worker01 에 MySQL 배포

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

### 3.4 테스트 데이터 입력

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -p123456 -e '
USE wordpress;
CREATE TABLE student(id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255), hobby VARCHAR(255));
INSERT INTO student(name, hobby) VALUE("DAWN", "K8S");
SELECT * FROM student;'
id  name  hobby
1   DAWN  K8S
```

### 3.5 worker02 로 이전

```bash
# Pod 삭제 후 nodeName 을 worker02 로 변경
[root@master pods]# kubectl delete pod mysql-002
pod "mysql-002" deleted

[root@master pods]# sed -i 's/nodeName: worker01/nodeName: worker02/' 10-pods-volume-nfs-env-mysql.yaml
[root@master pods]# kubectl apply -f 10-pods-volume-nfs-env-mysql.yaml
pod/mysql-002 created

[root@master pods]# kubectl get pods mysql-002 -o wide
NAME        READY   STATUS    RESTARTS   AGE   IP           NODE
mysql-002   1/1     Running   0          25s   10.100.2.7   worker02
```

### 3.6 데이터 무결성 검증

```bash
[root@master pods]# kubectl exec mysql-002 -- mysql -pdawn -e 'SELECT * FROM wordpress.student;'
id  name  hobby
1   DAWN  K8S
```

MySQL 이 worker01 에서 worker02 로 옮겨갔고 데이터는 온전히 유지됐다 —— NFS 노드 간 영속화 검증 통과.

---

## 세 가지 볼륨 비교

Pod 내부 공유 → emptyDir；

단일 노드 영속화 → hostPath；

노드 간 이동이 필요 → NFS（또는 Ceph/GlusterFS 등 분산 스토리지）.