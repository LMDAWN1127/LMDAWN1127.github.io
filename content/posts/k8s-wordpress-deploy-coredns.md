---
title: "K8S 实战：WordPress 部署、NFS 持久化与 CoreDNS 域名解析"
date: 2026-10-31T15:13:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文在 K8S 集群上完整部署 WordPress，分三个版本递进演进。v1 先用 ReplicationController + Service 跑通基础链路：MySQL RC → SVC ClusterIP 固定 VIP → WordPress RC → SVC NodePort，浏览器完成安装初始化；随后把 WordPress 副本扩到 3，暴露出没有持久化时数据不一致的问题。v2 引入 NFS 共享存储，把 MySQL 数据与 WordPress 上传目录都落到 NFS 上，删掉 RC 让其自动重建 3 个新 Pod 后标记文件仍在，验证多副本共享同一份数据。v3 部署 CoreDNS 附加组件，让 WordPress 直接用 SVC 名称访问数据库，并从资源清单、Pod 内 ping SVC 名称、dig 查 A 记录三个角度验证集群域名解析链路打通。"
---

# K8S 实战：WordPress 部署、NFS 持久化与 CoreDNS 域名解析

## 一、编写资源清单部署（v1 无持久化）

先跑通基础链路：MySQL RC → SVC ClusterIP（固定 VIP）→ WordPress RC → SVC NodePort。

### 1.1 资源清单

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
  # 指定ClusterIP的VIP地址，指定svc的网段即可，集群部署采用的svc网段为"10.200.0.0/16"
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
          # 指定的是Pod的地址当Pod发生变化时，IP地址需要变动
          # value: 10.100.1.60
          # 此处我指定的是ClusterIP的地址，ClusterIP的地址被我固定
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

### 1.2 创建资源

```bash
[root@master v1]# kubectl apply -f .
```

查看运行状态：

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

db-svc 的 ClusterIP 固定为 `10.200.0.36`（VIP 生效），wp-svc 以 NodePort 30090 暴露。

### 1.3 初始化 WordPress 的页面

浏览器访问任一节点的 30090 端口（NodePort 全节点开放），三节点均返回 302 跳转到安装页

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

### 1.4 将 WordPress 的副本修改为 3，观察现象

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

无持久化时，3 个 WordPress 副本各自使用容器内文件系统，互相隔离。在每个 Pod 里写入标记文件，只能看到自己的

```bash
[root@master ~]# for p in $(kubectl get pods -l apps=wp -o name); do kubectl exec $p -- sh -c 'echo hello-from-$(hostname) > /var/www/html/marker.txt'; kubectl exec $p -- cat /var/www/html/marker.txt; done
hello-from-rc-wordpress-j2q2w
hello-from-rc-wordpress-jww9j
hello-from-rc-wordpress-v2lj4
```

---

## 二、WordPress 实现数据持久化（v2 NFS）

### 2.1 创建测试目录

master（NFS Server）上准备目录（属主已按容器内用户预置：mysql80→lxd、wordpress→www-data）

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

### 2.2 编写资源清单部署

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

与 v1 相比，两个 RC 都增加了 `volumes`（nfs）和 `volumeMounts`

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
  # 指定ClusterIP的VIP地址，指定svc的网段即可，集群部署采用的svc网段为"10.200.0.0/16"
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
          # 指定的是Pod的地址当Pod发生变化时，IP地址需要变动
          # value: 10.100.1.60
          # 此处我指定的是ClusterIP的地址，ClusterIP的地址被我固定
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

### 2.3 创建资源

先清理 v1 资源，再 apply

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

### 2.4 验证测试

**① NFS 挂载生效**：

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mount | grep nfs
master:/dawn/data/nfs-server/wordpress on /var/www/html type nfs4 (rw,relatime,vers=4.2,rsize=524288,wsize=524288,namlen=255,hard,proto=tcp,timeo=600,retrans=2,sec=sys,clientaddr=11.0.1.232,local_lock=none,addr=11.0.1.231)
```

**② MySQL 数据落盘到 NFS Server**（master 上看到 27 个初始化文件）：

```bash
[root@master ~]# ls /dawn/data/nfs-server/mysql80/
auto.cnf  binlog.000001  binlog.000002  binlog.index  ca-key.pem  ca.pem ...
[root@master ~]# ls /dawn/data/nfs-server/mysql80/ | wc -l
27
```

**③ WordPress 安装页正常、数据库连通，安装wordpress**：

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mysql -udawn -p123456 wordpress -e 'select database();'
database()
wordpress
```

![image-20261031140821392](/images/k8s-wordpress-deploy-coredns/image-20261031140821392.png)

**④ 持久化实测：删 Pod → 重建 → 数据还在**

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- sh -c 'echo "v2-nfs-persist-2026-10-31" > /var/www/html/nfs-marker.txt'
# 三个 Pod 立即可见（NFS 共享）
pod/rc-wordpress-qfl77 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-srv76 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-xrscz -> v2-nfs-persist-2026-10-31
[root@master ~]# kubectl delete pods -l apps=wp --wait=true
pod "rc-wordpress-qfl77" deleted
pod "rc-wordpress-srv76" deleted
pod "rc-wordpress-xrscz" deleted
# RC 自动重建 3 个新 Pod，标记文件仍在
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

## 三、引入 CoreDNS 附加组件实现 WordPress 的数据库解析（v3）

### 3.1 作用

将 SVC 的名称解析为 ClusterIP。 不再写死 IP，`WORDPRESS_DB_HOST` 直接填 `db-svc`。

### 3.2 案例——WordPress

02-svc-db.yaml 注释掉 clusterIP、03-rc-wordpress.yaml 的 WORDPRESS_DB_HOST 改为 `db-svc`，副本数 3

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
  # 指定ClusterIP的VIP地址，指定svc的网段即可，集群部署采用的svc网段为"10.200.0.0/16"
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
          # 指定的是Pod的地址当Pod发生变化时，IP地址需要变动
          # value: 10.100.1.60
          # 此处我指定的是ClusterIP的地址，ClusterIP的地址被我固定。
          # value: 10.200.0.36
          # 有些时候svc的地址无法固定或者已经分配，则不建议使用ClusterIP进行通信
          # 可以考虑直接使用svc的名称
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

清理 v2 资源后创建：

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

这次 db-svc 的 ClusterIP 由系统自动分配为 **10.200.74.120**（不再固定 10.200.0.36）。

端到端验证：WordPress 靠 `db-svc` 域名连上了数据库（安装页 200、无数据库连接错误，Pod 内环境变量确认为 `WORDPRESS_DB_HOST=db-svc`）：

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-5ctfw -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123456
```

### 3.3 验证 CoreDNS 附加组件是否正常工作

#### 1. 查看所有名称空间的资源

```bash
[root@master ~]# kubectl get svc -A
NAMESPACE     NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                  AGE
default       db-svc       ClusterIP   10.200.74.120   <none>        3306/TCP                 7m17s
default       kubernetes   ClusterIP   10.200.0.1      <none>        443/TCP                  18h
default       wp-svc       NodePort    10.200.93.233   <none>        80:30090/TCP             7m16s
kube-system   kube-dns     ClusterIP   10.200.0.10     <none>        53/UDP,53/TCP,9153/TCP   26h
```

#### 2. 查看 CoreDNS 组件是否正常运行

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

#### 3. 验证 CoreDNS 组件是否正常工作——方式一（Pod 内 ping SVC 名称）

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

名称解析全部成功（每个 SVC 名都解析出了 ClusterIP），但 ICMP 100% 丢包——这是正常现象，ClusterIP 本身不响应 ping，证明的是 DNS 解析链路已通。

#### 4. 验证 CoreDNS 组件是否正常工作——方式二（dig 查 A 记录）

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

语法格式:

  dig @DNS服务器  A记录解析格式

A记录格式:

  svc名称.名称空间.svc.你K8S集群的域名。