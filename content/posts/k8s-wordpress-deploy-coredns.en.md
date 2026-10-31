---
title: "K8S in Practice: WordPress Deployment, NFS Persistence and CoreDNS Name Resolution"
date: 2026-10-31T15:13:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article deploys WordPress on a K8S cluster and evolves it through three versions. v1 gets the basic chain working with ReplicationControllers and Services: MySQL RC to SVC ClusterIP with a pinned VIP, to WordPress RC, to SVC NodePort, finishing the installer in a browser; scaling WordPress to 3 replicas then exposes the data inconsistency caused by the lack of persistence. v2 introduces NFS shared storage so both MySQL data and the WordPress uploads directory land on NFS — after deleting the RC and letting it rebuild 3 fresh Pods, the marker files are still there, proving all replicas share the same data. v3 deploys the CoreDNS add-on so WordPress reaches the database by SVC name, and validates cluster DNS resolution three ways: from the manifests, by pinging SVC names inside a Pod, and with dig A-record lookups."
---

# K8S in Practice: WordPress Deployment, NFS Persistence and CoreDNS Name Resolution

## 1. Deploying with Manifests (v1, No Persistence)

Get the basic chain working first: MySQL RC -> SVC ClusterIP (fixed VIP) -> WordPress RC -> SVC NodePort.

### 1.1 Manifests

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
  # Pin the ClusterIP VIP; just pick an address from the svc subnet - this cluster uses "10.200.0.0/16" for svc
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
          # This is the Pod address; when the Pod changes, the IP changes too
          # value: 10.100.1.60
          # Here I pin the ClusterIP address; the ClusterIP is fixed by me
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

### 1.2 Create the Resources

```bash
[root@master v1]# kubectl apply -f .
```

Check the running state:

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

The db-svc ClusterIP is pinned to `10.200.0.36` (the VIP works), and wp-svc is exposed through NodePort 30090.

### 1.3 Initialize the WordPress Pages

Open port 30090 on any node in a browser (NodePort is open on every node); all three nodes return a 302 redirect to the installer

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

### 1.4 Scale WordPress to 3 Replicas and Observe

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

Without persistence, the 3 WordPress replicas each use their own in-container filesystem and are isolated from one another. Write a marker file in each Pod and it only sees its own

```bash
[root@master ~]# for p in $(kubectl get pods -l apps=wp -o name); do kubectl exec $p -- sh -c 'echo hello-from-$(hostname) > /var/www/html/marker.txt'; kubectl exec $p -- cat /var/www/html/marker.txt; done
hello-from-rc-wordpress-j2q2w
hello-from-rc-wordpress-jww9j
hello-from-rc-wordpress-v2lj4
```

---

## 2. Adding Data Persistence to WordPress (v2, NFS)

### 2.1 Create the Test Directories

Prepare the directories on master (the NFS Server); ownership is pre-set to match the in-container users: mysql80 -> lxd, wordpress -> www-data

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

### 2.2 Write and Deploy the Manifests

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

Compared with v1, both RCs gain `volumes` (nfs) and `volumeMounts`

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
  # Pin the ClusterIP VIP; just pick an address from the svc subnet - this cluster uses "10.200.0.0/16" for svc
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
          # This is the Pod address; when the Pod changes, the IP changes too
          # value: 10.100.1.60
          # Here I pin the ClusterIP address; the ClusterIP is fixed by me
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

### 2.3 Create the Resources

Clean up the v1 resources first, then apply

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

### 2.4 Verification Tests

**1. NFS mount works**:

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mount | grep nfs
master:/dawn/data/nfs-server/wordpress on /var/www/html type nfs4 (rw,relatime,vers=4.2,rsize=524288,wsize=524288,namlen=255,hard,proto=tcp,timeo=600,retrans=2,sec=sys,clientaddr=11.0.1.232,local_lock=none,addr=11.0.1.231)
```

**2. MySQL data lands on the NFS Server** (27 initialization files visible on master):

```bash
[root@master ~]# ls /dawn/data/nfs-server/mysql80/
auto.cnf  binlog.000001  binlog.000002  binlog.index  ca-key.pem  ca.pem ...
[root@master ~]# ls /dawn/data/nfs-server/mysql80/ | wc -l
27
```

**3. The WordPress installer works, the database is reachable, install wordpress**:

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mysql -udawn -p123456 wordpress -e 'select database();'
database()
wordpress
```

![image-20261031140821392](/images/k8s-wordpress-deploy-coredns/image-20261031140821392.png)

**4. Persistence test: delete Pod -> recreate -> data is still there**

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- sh -c 'echo "v2-nfs-persist-2026-10-31" > /var/www/html/nfs-marker.txt'
# All three Pods see it immediately (NFS sharing)
pod/rc-wordpress-qfl77 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-srv76 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-xrscz -> v2-nfs-persist-2026-10-31
[root@master ~]# kubectl delete pods -l apps=wp --wait=true
pod "rc-wordpress-qfl77" deleted
pod "rc-wordpress-srv76" deleted
pod "rc-wordpress-xrscz" deleted
# The RC rebuilds 3 new Pods automatically and the marker file is still there
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

## 3. Adding the CoreDNS Add-on for WordPress Database Resolution (v3)

### 3.1 Purpose

It resolves a SVC name to its ClusterIP. No more hard-coded IPs — `WORDPRESS_DB_HOST` is simply set to `db-svc`.

### 3.2 Case Study — WordPress

Comment out clusterIP in 02-svc-db.yaml, change WORDPRESS_DB_HOST in 03-rc-wordpress.yaml to `db-svc`, replicas 3

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
  # Pin the ClusterIP VIP; just pick an address from the svc subnet - this cluster uses "10.200.0.0/16" for svc
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
          # This is the Pod address; when the Pod changes, the IP changes too
          # value: 10.100.1.60
          # Here I pin the ClusterIP address; the ClusterIP is fixed by me.
          # value: 10.200.0.36
          # Sometimes the svc address cannot be pinned or is already assigned, so ClusterIP is not recommended for communication
          # You can just use the svc name directly
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

Clean up the v2 resources, then create:

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

This time the db-svc ClusterIP is assigned automatically by the system as **10.200.74.120** (no longer pinned to 10.200.0.36).

End-to-end verification: WordPress reached the database through the `db-svc` name (installer returns 200, no database connection error, and the env var inside the Pod confirms `WORDPRESS_DB_HOST=db-svc`):

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-5ctfw -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123456
```

### 3.3 Verify That the CoreDNS Add-on Works

#### 1. List Resources in All Namespaces

```bash
[root@master ~]# kubectl get svc -A
NAMESPACE     NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                  AGE
default       db-svc       ClusterIP   10.200.74.120   <none>        3306/TCP                 7m17s
default       kubernetes   ClusterIP   10.200.0.1      <none>        443/TCP                  18h
default       wp-svc       NodePort    10.200.93.233   <none>        80:30090/TCP             7m16s
kube-system   kube-dns     ClusterIP   10.200.0.10     <none>        53/UDP,53/TCP,9153/TCP   26h
```

#### 2. Check That CoreDNS Is Running

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

#### 3. Verify CoreDNS — Method 1 (ping the SVC Name from Inside a Pod)

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

Name resolution succeeds everywhere (every SVC name resolved to a ClusterIP), but ICMP is 100% lost — that is expected, because a ClusterIP does not answer ping. What it proves is that the DNS resolution path works.

#### 4. Verify CoreDNS — Method 2 (dig for A Records)

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

Syntax:

  dig @DNS-server  A-record-query-format

A record format:

  svc-name.namespace.svc.your-K8S-cluster-domain.