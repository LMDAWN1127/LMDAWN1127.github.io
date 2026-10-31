---
title: "K8S 실전: WordPress 배포, NFS 영속화 그리고 CoreDNS 이름 해석"
date: 2026-10-31T15:13:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 K8S 클러스터에 WordPress 를 배포하고 세 버전으로 단계적으로 발전시킨다. v1 은 ReplicationController 와 Service 로 기본 흐름을 뚫는다. MySQL RC → SVC ClusterIP（VIP 고정）→ WordPress RC → SVC NodePort 까지 구성하고 브라우저에서 설치를 마친다. 이어 WordPress 레플리카를 3으로 늘리면 영속화가 없어 생기는 데이터 불일치가 드러난다. v2 는 NFS 공유 스토리지를 도입해 MySQL 데이터와 WordPress 업로드 디렉터리를 NFS 에 올린다. RC 를 삭제해 새 Pod 3개가 자동 재생성되게 해도 마커 파일이 남아 있어 모든 레플리카가 같은 데이터를 공유함을 입증한다. v3 는 CoreDNS 애드온을 도입해 WordPress 가 SVC 이름으로 DB 에 접근하게 하고, 매니페스트 확인, Pod 안에서 SVC 이름으로 ping, dig A 레코드 조회라는 세 가지 관점에서 클러스터 이름 해석 경로가 뚫렸는지 검증한다."
---

# K8S 실전: WordPress 배포, NFS 영속화 그리고 CoreDNS 이름 해석

## 1. 매니페스트 작성 및 배포（v1 영속화 없음）

먼저 기본 흐름을 뚫는다: MySQL RC → SVC ClusterIP（고정 VIP）→ WordPress RC → SVC NodePort.

### 1.1 리소스 매니페스트

```bash
[root@master v1]# ll
total 24
drwxr-xr-x 2 root root 4096 Oct 31 13:11 ./
drwxr-xr-x 8 root root 4096 Oct 31 13:10 ../
-rw-r--r-- 1 root root  517 Oct 31 13:11 01-rc-mysql.yaml
-rw-r--r-- 1 root root  294 Oct 31 13:11 02-svc-db.yaml
-rw-r--r-- 1 root root  726 Oct 31 13:11 03-rc-wordpress.yaml
-rw-r--r-- 1 root root  163 Oct 31 13:11 04-svc-wordpress.yaml
[root@master v1]# cat 01-rc-mysql.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-mysql
spec:
  replicas: 1
  selector:
    apps: mysql80
  template:
    metadata:
      labels:
        apps: mysql80
    spec:   
      containers:
      - image: harbor:443/dawn-db/mysql:8.3.0-oracle
        name: db
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: "123456"
        - name: MYSQL_DATABASE
          value: wordpress
        - name: MYSQL_USER
          value: dawn
        - name: MYSQL_PASSWORD
          value: "123456"
[root@master v1]# cat 02-svc-db.yaml 
apiVersion: v1
kind: Service
metadata:
  name: db-svc
spec:
  type: ClusterIP
  # ClusterIP VIP 지정. svc 대역만 지정하면 되며, 클러스터 구축 시 사용한 svc 대역은 "10.200.0.0/16"
  clusterIP: 10.200.0.36
  selector:
    apps: mysql80
  ports:
  - port: 3306
    targetPort: 3306
[root@master v1]# cat 03-rc-wordpress.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-wordpress
spec:
  replicas: 1
  selector:
    apps: wp
  template:
    metadata:
      labels:
        apps: wp
    spec:   
      containers:
      - image: harbor:443/dawn-db/wordpress:latest
        name: wp
        env:
        - name: WORDPRESS_DB_HOST
          # 지정한 것은 Pod 주소. Pod 가 바뀌면 IP 도 바뀐다
          # value: 10.100.1.60
          # 여기서는 ClusterIP 주소를 지정. ClusterIP 는 내가 고정했다
          value: 10.200.0.36
        - name: WORDPRESS_DB_NAME
          value: wordpress
        - name: WORDPRESS_DB_USER
          value: dawn
        - name: WORDPRESS_DB_PASSWORD
          value: "123456"
[root@master v1]# cat 04-svc-wordpress.yaml 
apiVersion: v1
kind: Service
metadata:
  name: wp-svc
spec:
  type: NodePort
  selector:
    apps: wp
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30090
```

### 1.2 리소스 생성

```bash
[root@master v1]# kubectl apply -f .
```

동작 상태 확인:

```bash
[root@master v1]# kubectl get po,svc -o wide
NAME                     READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
pod/rc-mysql-tkxcm       1/1     Running   0          32s   10.100.1.42   worker01   <none>           <none>
pod/rc-wordpress-j2q2w   1/1     Running   0          44s   10.100.2.40   worker02   <none>           <none>

NAME                 TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE   SELECTOR
service/db-svc       ClusterIP   10.200.0.36    <none>        3306/TCP       44s   apps=mysql80
service/kubernetes   ClusterIP   10.200.0.1     <none>        443/TCP        16h   <none>
service/wp-svc       NodePort    10.200.204.6   <none>        80:30090/TCP   44s   apps=wp
```

db-svc 의 ClusterIP 는 `10.200.0.36` 으로 고정된다（VIP 동작）, wp-svc 는 NodePort 30090 으로 노출된다.

### 1.3 WordPress 페이지 초기화

브라우저에서 아무 노드의 30090 포트로 접속（NodePort 는 모든 노드에 열림）, 세 노드 모두 302 를 반환해 설치 페이지로 리다이렉트된다

```bash
[root@master ~]# for n in 11.0.1.231 11.0.1.232 11.0.1.233; do curl -s -o /dev/null -w "$n -> HTTP %{http_code}\n" http://$n:30090/; done
11.0.1.231 -> HTTP 302
11.0.1.232 -> HTTP 302
11.0.1.233 -> HTTP 302
```

![image-20261031134022845](/images/k8s-wordpress-deploy-coredns/image-20261031134022845.png)

![image-20261031134252625](/images/k8s-wordpress-deploy-coredns/image-20261031134252625.png)

![image-20261031134305759](/images/k8s-wordpress-deploy-coredns/image-20261031134305759.png)

![image-20261031134358566](/images/k8s-wordpress-deploy-coredns/image-20261031134358566.png)

### 1.4 WordPress 레플리카를 3으로 변경하고 현상 관찰

```bash
[root@master ~]# kubectl edit rc rc-wordpress 
replicationcontroller/rc-wordpress edited
[root@master ~]# kubectl get rc rc-wordpress
NAME           DESIRED   CURRENT   READY   AGE
rc-wordpress   3         3         1       82s
[root@master ~]# kubectl get pods -l apps=wp -o wide
NAME                 READY   STATUS    RESTARTS   AGE    IP            NODE       NOMINATED NODE   READINESS GATES
rc-wordpress-j2q2w   1/1     Running   0          104s   10.100.2.40   worker02   <none>           <none>
rc-wordpress-jww9j   1/1     Running   0          22s    10.100.2.41   worker02   <none>           <none>
rc-wordpress-v2lj4   1/1     Running   0          22s    10.100.1.43   worker01   <none>           <none>
```

영속화가 없으면 WordPress 레플리카 3개는 각자 컨테이너 내부 파일시스템을 쓰고 서로 격리된다. 각 Pod 에 마커 파일을 써도 자기 것만 보인다

```bash
[root@master ~]# for p in $(kubectl get pods -l apps=wp -o name); do kubectl exec $p -- sh -c 'echo hello-from-$(hostname) > /var/www/html/marker.txt'; kubectl exec $p -- cat /var/www/html/marker.txt; done
hello-from-rc-wordpress-j2q2w
hello-from-rc-wordpress-jww9j
hello-from-rc-wordpress-v2lj4
```

---

## 2. WordPress 데이터 영속화（v2 NFS）

### 2.1 테스트 디렉터리 생성

master（NFS Server）에 디렉터리를 준비한다（소유자는 컨테이너 내부 사용자에 맞춰 미리 설정: mysql80→lxd, wordpress→www-data）

```bash
[root@master ~]# mkdir -pv /dawn/data/nfs-server/wordpress
[root@master ~]# chmod +777 /dawn/data/nfs-server/wordpress
[root@master ~]# ll -ld /dawn/data/nfs-server/wordpress/
drwxr-xr-x 5 www-data www-data 4096 Oct 31 13:14 /dawn/data/nfs-server/wordpress/
[root@master ~]# rm -rf /dawn/data/nfs-server/mysql80/*
[root@master ~]# ll -ld /dawn/data/nfs-server/mysql80/
drwxrwxrwx 2 lxd  root 4096 Oct 31 12:20 /dawn/data/nfs-server/mysql80/
[root@master ~]# ll  /dawn/data/nfs-server/mysql80/
total 8
drwxrwxrwx 2 lxd  root 4096 Oct 31 12:20 ./
drwxr-xr-x 4 root root 4096 Oct 31 13:14 ../
```

### 2.2 매니페스트 작성 및 배포

```bash
[root@master v2-svc-volumes]# ll
total 24
drwxr-xr-x 2 root root 4096 Oct 31 13:11 ./
drwxr-xr-x 8 root root 4096 Oct 31 13:10 ../
-rw-r--r-- 1 root root  714 Oct 31 13:11 01-rc-mysql.yaml
-rw-r--r-- 1 root root  294 Oct 31 13:11 02-svc-db.yaml
-rw-r--r-- 1 root root  924 Oct 31 13:11 03-rc-wordpress.yaml
-rw-r--r-- 1 root root  163 Oct 31 13:11 04-svc-wordpress.yaml
```

v1 과 비교해 두 RC 모두 `volumes`（nfs）와 `volumeMounts` 가 추가된다

```bash
[root@master v2-svc-volumes]# cat 01-rc-mysql.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-mysql
spec:
  replicas: 1
  selector:
    apps: mysql80
  template:
    metadata:
      labels:
        apps: mysql80
    spec:   
      volumes:
      - name: data
        nfs:
          server: master
          path: /dawn/data/nfs-server/mysql80
      containers:
      - image: harbor:443/dawn-db/mysql:8.3.0-oracle
        name: db
        volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: "123456"
        - name: MYSQL_DATABASE
          value: wordpress
        - name: MYSQL_USER
          value: dawn
        - name: MYSQL_PASSWORD
          value: "123456"
[root@master v2-svc-volumes]# cat 02-svc-db.yaml 
apiVersion: v1
kind: Service
metadata:
  name: db-svc
spec:
  type: ClusterIP
  # ClusterIP VIP 지정. svc 대역만 지정하면 되며, 클러스터 구축 시 사용한 svc 대역은 "10.200.0.0/16"
  clusterIP: 10.200.0.36
  selector:
    apps: mysql80
  ports:
  - port: 3306
    targetPort: 3306
[root@master v2-svc-volumes]# cat 03-rc-wordpress.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-wordpress
spec:
  replicas: 3
  selector:
    apps: wp
  template:
    metadata:
      labels:
        apps: wp
    spec:
      volumes:
      - name: data
        nfs:
          server: master
          path: /dawn/data/nfs-server/wordpress
      containers:
      - image: harbor:443/dawn-db/wordpress:latest
        name: wp
        volumeMounts:
        - name: data
          mountPath: /var/www/html
        env:
        - name: WORDPRESS_DB_HOST
          # 지정한 것은 Pod 주소. Pod 가 바뀌면 IP 도 바뀐다
          # value: 10.100.1.60
          # 여기서는 ClusterIP 주소를 지정. ClusterIP 는 내가 고정했다
          value: 10.200.0.36
        - name: WORDPRESS_DB_NAME
          value: wordpress
        - name: WORDPRESS_DB_USER
          value: dawn
        - name: WORDPRESS_DB_PASSWORD
          value: "123456"
[root@master v2-svc-volumes]# cat 04-svc-wordpress.yaml 
apiVersion: v1
kind: Service
metadata:
  name: wp-svc
spec:
  type: NodePort
  selector:
    apps: wp
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30090
```

### 2.3 리소스 생성

v1 리소스를 먼저 정리한 뒤 apply

```bash
[root@master v1]# kubectl delete -f .
replicationcontroller "rc-mysql" deleted
service "db-svc" deleted
replicationcontroller "rc-wordpress" deleted
service "wp-svc" deleted
[root@master v2-svc-volumes]# kubectl apply -f .
replicationcontroller/rc-mysql created
service/db-svc unchanged
replicationcontroller/rc-wordpress unchanged
service/wp-svc unchanged
```

### 2.4 검증 테스트

**① NFS 마운트 동작**:

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mount | grep nfs
master:/dawn/data/nfs-server/wordpress on /var/www/html type nfs4 (rw,relatime,vers=4.2,rsize=524288,wsize=524288,namlen=255,hard,proto=tcp,timeo=600,retrans=2,sec=sys,clientaddr=11.0.1.232,local_lock=none,addr=11.0.1.231)
```

**② MySQL 데이터가 NFS Server 에 기록됨**（master 에서 초기화 파일 27개 확인）:

```bash
[root@master ~]# ls /dawn/data/nfs-server/mysql80/
auto.cnf  binlog.000001  binlog.000002  binlog.index  ca-key.pem  ca.pem ...
[root@master ~]# ls /dawn/data/nfs-server/mysql80/ | wc -l
27
```

**③ WordPress 설치 페이지 정상, DB 연결됨, wordpress 설치**:

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mysql -udawn -p123456 wordpress -e 'select database();'
database()
wordpress
```

![image-20261031140821392](/images/k8s-wordpress-deploy-coredns/image-20261031140821392.png)

**④ 영속화 실측: Pod 삭제 → 재생성 → 데이터 유지**

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- sh -c 'echo "v2-nfs-persist-2026-10-31" > /var/www/html/nfs-marker.txt'
# 세 Pod 에서 즉시 보인다（NFS 공유）
pod/rc-wordpress-qfl77 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-srv76 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-xrscz -> v2-nfs-persist-2026-10-31
[root@master ~]# kubectl delete pods -l apps=wp --wait=true
pod "rc-wordpress-qfl77" deleted
pod "rc-wordpress-srv76" deleted
pod "rc-wordpress-xrscz" deleted
# RC 가 새 Pod 3개를 자동 재생성하고 마커 파일은 그대로 남는다
[root@master ~]# kubectl get pods -l apps=wp -o wide
NAME                 READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
rc-wordpress-cv2r2   1/1     Running   0          6m51s   10.100.2.50   worker02   <none>           <none>
rc-wordpress-f4kxc   1/1     Running   0          6m51s   10.100.1.52   worker01   <none>           <none>
rc-wordpress-fgn6h   1/1     Running   0          6m51s   10.100.2.49   worker02   <none>           <none>
[root@master ~]# kubectl exec rc-wordpress-cv2r2 -- sh -c 'cat /var/www/html/nfs-marker.txt'
v2-nfs-persist-2026-10-31
[root@master ~]# kubectl exec rc-wordpress-f4kxc -- sh -c 'cat /var/www/html/nfs-marker.txt'
v2-nfs-persist-2026-10-31
[root@master ~]# kubectl exec rc-wordpress-fgn6h -- sh -c 'cat /var/www/html/nfs-marker.txt'
v2-nfs-persist-2026-10-31
```

![image-20261031143945932](/images/k8s-wordpress-deploy-coredns/image-20261031143945932.png)

---

## 3. CoreDNS 애드온 도입으로 WordPress DB 이름 해석（v3）

### 3.1 역할

SVC 이름을 ClusterIP 로 해석한다. IP 를 하드코딩하지 않고 `WORDPRESS_DB_HOST` 에 `db-svc` 를 그대로 넣는다.

### 3.2 사례 —— WordPress

02-svc-db.yaml 의 clusterIP 는 주석 처리, 03-rc-wordpress.yaml 의 WORDPRESS_DB_HOST 는 `db-svc` 로 변경, 레플리카 3

```bash
[root@master v3-svc-volumes-CoreDNS]# ll
total 24
drwxr-xr-x 2 root root 4096 Oct 31 13:11 ./
drwxr-xr-x 8 root root 4096 Oct 31 13:10 ../
-rw-r--r-- 1 root root  716 Oct 31 13:14 01-rc-mysql.yaml
-rw-r--r-- 1 root root  296 Oct 31 13:11 02-svc-db.yaml
-rw-r--r-- 1 root root 1129 Oct 31 13:11 03-rc-wordpress.yaml
-rw-r--r-- 1 root root  163 Oct 31 13:11 04-svc-wordpress.yaml
[root@master v3-svc-volumes-CoreDNS]# cat 01-rc-mysql.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-mysql
spec:
  replicas: 1
  selector:
    apps: mysql80
  template:
    metadata:
      labels:
        apps: mysql80
    spec:   
      volumes:
      - name: data
        nfs:
          server: master
          path: /dawn/data/nfs-server/mysql80
      containers:
      - image: harbor:443/dawn-db/mysql:8.3.0-oracle
        name: db
        volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: "123456"
        - name: MYSQL_DATABASE
          value: wordpress
        - name: MYSQL_USER
          value: dawn
        - name: MYSQL_PASSWORD
          value: "123456"
[root@master v3-svc-volumes-CoreDNS]# cat 02-svc-db.yaml 
apiVersion: v1
kind: Service
metadata:
  name: db-svc
spec:
  type: ClusterIP
  # ClusterIP VIP 지정. svc 대역만 지정하면 되며, 클러스터 구축 시 사용한 svc 대역은 "10.200.0.0/16"
  # clusterIP: 10.200.0.36
  selector:
    apps: mysql80
  ports:
  - port: 3306
    targetPort: 3306
[root@master v3-svc-volumes-CoreDNS]# cat 03-rc-wordpress.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-wordpress
spec:
  replicas: 3
  selector:
    apps: wp
  template:
    metadata:
      labels:
        apps: wp
    spec:
      volumes:
      - name: data
        nfs:
          server: master
          path: /dawn/data/nfs-server/wordpress
      containers:
      - image: harbor:443/dawn-db/wordpress:latest
        name: wp
        volumeMounts:
        - name: data
          mountPath: /var/www/html
        env:
        - name: WORDPRESS_DB_HOST
          # 지정한 것은 Pod 주소. Pod 가 바뀌면 IP 도 바뀐다
          # value: 10.100.1.60
          # 여기서는 ClusterIP 주소를 지정. ClusterIP 는 내가 고정했다.
          # value: 10.200.0.36
          # svc 주소를 고정할 수 없거나 이미 할당된 경우도 있어 ClusterIP 통신은 권장하지 않는다
          # svc 이름을 직접 사용하는 것도 고려할 수 있다
          value: db-svc
        - name: WORDPRESS_DB_NAME
          value: wordpress
        - name: WORDPRESS_DB_USER
          value: dawn
        - name: WORDPRESS_DB_PASSWORD
          value: "123456"
[root@master v3-svc-volumes-CoreDNS]# cat 04-svc-wordpress.yaml 
apiVersion: v1
kind: Service
metadata:
  name: wp-svc
spec:
  type: NodePort
  selector:
    apps: wp
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30090
```

v2 리소스를 정리한 뒤 생성:

```bash
[root@master v2-svc-volumes]# kubectl delete -f .
replicationcontroller "rc-mysql" deleted
service "db-svc" deleted
replicationcontroller "rc-wordpress" deleted
service "wp-svc" deleted
[root@master v3-svc-volumes-CoreDNS]# kubectl apply -f .
replicationcontroller/rc-mysql created
service/db-svc created
replicationcontroller/rc-wordpress created
service/wp-svc created
[root@master v3-svc-volumes-CoreDNS]# kubectl get po,svc -o wide
NAME                     READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
pod/rc-mysql-4fx65       1/1     Running   0          26s   10.100.1.54   worker01   <none>           <none>
pod/rc-wordpress-5ctfw   1/1     Running   0          25s   10.100.1.53   worker01   <none>           <none>
pod/rc-wordpress-gn7lm   1/1     Running   0          25s   10.100.2.51   worker02   <none>           <none>
pod/rc-wordpress-kh6kd   1/1     Running   0          26s   10.100.2.52   worker02   <none>           <none>

NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE   SELECTOR
service/db-svc       ClusterIP   10.200.74.120   <none>        3306/TCP       26s   apps=mysql80
service/kubernetes   ClusterIP   10.200.0.1      <none>        443/TCP        18h   <none>
service/wp-svc       NodePort    10.200.93.233   <none>        80:30090/TCP   25s   apps=wp
```

이번에는 db-svc 의 ClusterIP 가 시스템에 의해 **10.200.74.120** 으로 자동 할당된다（10.200.0.36 으로 고정하지 않음）.

엔드투엔드 검증: WordPress 가 `db-svc` 이름으로 DB 에 연결됐다（설치 페이지 200, DB 연결 오류 없음, Pod 내부 환경변수도 `WORDPRESS_DB_HOST=db-svc` 로 확인）:

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-5ctfw -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123456
```

### 3.3 CoreDNS 애드온 정상 동작 검증

#### 1. 모든 네임스페이스의 리소스 조회

```bash
[root@master ~]# kubectl get svc -A
NAMESPACE     NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                  AGE
default       db-svc       ClusterIP   10.200.74.120   <none>        3306/TCP                 7m17s
default       kubernetes   ClusterIP   10.200.0.1      <none>        443/TCP                  18h
default       wp-svc       NodePort    10.200.93.233   <none>        80:30090/TCP             7m16s
kube-system   kube-dns     ClusterIP   10.200.0.10     <none>        53/UDP,53/TCP,9153/TCP   26h
```

#### 2. CoreDNS 컴포넌트 정상 동작 확인

```bash
[root@master ~]# kubectl get pods -n kube-system --show-labels -l k8s-app=kube-dns
NAME                      READY   STATUS    RESTARTS       AGE   LABELS
coredns-6d8c4cb4d-qkn74   1/1     Running   2 (3h4m ago)   26h   k8s-app=kube-dns,pod-template-hash=6d8c4cb4d
coredns-6d8c4cb4d-vxxvm   1/1     Running   2 (3h4m ago)   26h   k8s-app=kube-dns,pod-template-hash=6d8c4cb4d
[root@master ~]# kubectl get pods -A --show-labels -l k8s-app=kube-dns
NAMESPACE     NAME                      READY   STATUS    RESTARTS       AGE   LABELS
kube-system   coredns-6d8c4cb4d-qkn74   1/1     Running   2 (3h5m ago)   26h   k8s-app=kube-dns,pod-template-hash=6d8c4cb4d
kube-system   coredns-6d8c4cb4d-vxxvm   1/1     Running   2 (3h5m ago)   26h   k8s-app=kube-dns,pod-template-hash=6d8c4cb4d
```

#### 3. CoreDNS 검증 —— 방법 1（Pod 안에서 SVC 이름으로 ping）

```bash
[root@master ~]# kubectl run test-dns --image=harbor:443/dawn-linux/alpine:3.20.2 --restart=Never -- sh -c 'ping -c 3 wp-svc; ping -c 3 kubernetes; ping -c 3 db-svc; ping -c 3 kube-dns; ping -c 3 kube-dns.kube-system'
pod/test-dns created
[root@master ~]# kubectl logs test-dns
PING wp-svc (10.200.93.233): 56 data bytes

--- wp-svc ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
PING kubernetes (10.200.0.1): 56 data bytes

--- kubernetes ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
PING db-svc (10.200.74.120): 56 data bytes

--- db-svc ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
ping: bad address 'kube-dns'
PING kube-dns.kube-system (10.200.0.10): 56 data bytes

--- kube-dns.kube-system ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
```

이름 해석은 모두 성공（모든 SVC 이름이 ClusterIP 로 해석됨）했지만 ICMP 는 100% 손실 —— 이는 정상이다. ClusterIP 자체는 ping 에 응답하지 않는다. 증명된 것은 DNS 해석 경로가 뚫렸다는 점이다.

#### 4. CoreDNS 검증 —— 방법 2（dig 로 A 레코드 조회）

```bash
[root@master ~]# dig @10.200.0.10 db-svc.default.svc.dawn.com +short
10.200.74.120
[root@master ~]# dig @10.200.0.10 wp-svc.default.svc.dawn.com +short
10.200.93.233
[root@master ~]# dig @10.200.0.10 kubernetes.default.svc.dawn.com +short
10.200.0.1
[root@master ~]# dig @10.200.0.10 kube-dns.kube-system.svc.dawn.com +short
10.200.0.10
```

문법:

  dig @DNS서버  A레코드 조회 형식

A레코드 형식:

  svc이름.네임스페이스.svc.당신의 K8S 클러스터 도메인.