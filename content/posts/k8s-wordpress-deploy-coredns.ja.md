---
title: "K8S 実践：WordPress デプロイ、NFS 永続化と CoreDNS 名前解決"
date: 2026-10-31T15:13:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は K8S クラスタ上で WordPress をデプロイし、3 つのバージョンに分けて段階的に進化させる。v1 は ReplicationController と Service で基本の流れを通す。MySQL RC → SVC ClusterIP（VIP 固定）→ WordPress RC → SVC NodePort まで構築し、ブラウザでインストールを完了させる。その後 WordPress のレプリカを 3 に増やすと、永続化がないことによるデータ不整合が露呈する。v2 は NFS 共有ストレージを導入し、MySQL のデータと WordPress のアップロードディレクトリを NFS 上に置く。RC を削除して 3 つの新 Pod を自動再作成させてもマーカーファイルが残り、全レプリカが同じデータを共有していることを証明する。v3 は CoreDNS アドオンを導入し、WordPress が SVC 名で DB に接続できるようにする。そして manifests の確認、Pod 内から SVC 名への ping、dig による A レコード照会という 3 つの角度からクラスタの名前解決経路が通っていることを検証する。"
---

# K8S 実践：WordPress デプロイ、NFS 永続化と CoreDNS 名前解決

## 1. マニフェストを書いてデプロイ（v1 永続化なし）

まず基本の流れを通す：MySQL RC → SVC ClusterIP（固定 VIP）→ WordPress RC → SVC NodePort。

### 1.1 リソースマニフェスト

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
  # ClusterIP の VIP を指定。svc のサブネットを指定すればよい。クラスタ構築時の svc サブネットは "10.200.0.0/16"
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
          # ここで指定しているのは Pod のアドレス。Pod が変わると IP も変わる
          # value: 10.100.1.60
          # ここでは ClusterIP のアドレスを指定。ClusterIP は自分で固定している
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

### 1.2 リソースを作成

```bash
[root@master v1]# kubectl apply -f .
```

動作状態を確認：

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

db-svc の ClusterIP は `10.200.0.36` に固定される（VIP が有効）、wp-svc は NodePort 30090 で公開される。

### 1.3 WordPress の画面を初期化

ブラウザでいずれかのノードの 30090 ポートにアクセス（NodePort は全ノードで開放）、3 ノードとも 302 を返してインストール画面にリダイレクトされる

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

### 1.4 WordPress のレプリカを 3 に変更して現象を観察

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

永続化がない場合、3 つの WordPress レプリカはそれぞれコンテナ内のファイルシステムを使い、互いに隔離される。各 Pod にマーカーファイルを書き込んでも、自分のが見えるだけ

```bash
[root@master ~]# for p in $(kubectl get pods -l apps=wp -o name); do kubectl exec $p -- sh -c 'echo hello-from-$(hostname) > /var/www/html/marker.txt'; kubectl exec $p -- cat /var/www/html/marker.txt; done
hello-from-rc-wordpress-j2q2w
hello-from-rc-wordpress-jww9j
hello-from-rc-wordpress-v2lj4
```

---

## 2. WordPress のデータ永続化（v2 NFS）

### 2.1 テストディレクトリを作成

master（NFS Server）上にディレクトリを用意する（所有者はコンテナ内ユーザに合わせて事前設定：mysql80→lxd、wordpress→www-data）

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

### 2.2 マニフェストを書いてデプロイ

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

v1 と比べ、両方の RC に `volumes`（nfs）と `volumeMounts` が追加される

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
  # ClusterIP の VIP を指定。svc のサブネットを指定すればよい。クラスタ構築時の svc サブネットは "10.200.0.0/16"
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
          # ここで指定しているのは Pod のアドレス。Pod が変わると IP も変わる
          # value: 10.100.1.60
          # ここでは ClusterIP のアドレスを指定。ClusterIP は自分で固定している
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

### 2.3 リソースを作成

v1 のリソースを先に掃除してから apply

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

### 2.4 検証テスト

**① NFS マウントが有効**：

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mount | grep nfs
master:/dawn/data/nfs-server/wordpress on /var/www/html type nfs4 (rw,relatime,vers=4.2,rsize=524288,wsize=524288,namlen=255,hard,proto=tcp,timeo=600,retrans=2,sec=sys,clientaddr=11.0.1.232,local_lock=none,addr=11.0.1.231)
```

**② MySQL のデータが NFS Server に書き込まれる**（master 上で初期化ファイルが 27 個見える）：

```bash
[root@master ~]# ls /dawn/data/nfs-server/mysql80/
auto.cnf  binlog.000001  binlog.000002  binlog.index  ca-key.pem  ca.pem ...
[root@master ~]# ls /dawn/data/nfs-server/mysql80/ | wc -l
27
```

**③ WordPress のインストール画面が正常、DB にも接続でき、wordpress をインストール**：

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- mysql -udawn -p123456 wordpress -e 'select database();'
database()
wordpress
```

![image-20261031140821392](/images/k8s-wordpress-deploy-coredns/image-20261031140821392.png)

**④ 永続化の実測：Pod を削除 → 再作成 → データが残る**

```bash
[root@master ~]# kubectl exec rc-wordpress-qfl77 -- sh -c 'echo "v2-nfs-persist-2026-10-31" > /var/www/html/nfs-marker.txt'
# 3 つの Pod から即座に見える（NFS 共有）
pod/rc-wordpress-qfl77 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-srv76 -> v2-nfs-persist-2026-10-31
pod/rc-wordpress-xrscz -> v2-nfs-persist-2026-10-31
[root@master ~]# kubectl delete pods -l apps=wp --wait=true
pod "rc-wordpress-qfl77" deleted
pod "rc-wordpress-srv76" deleted
pod "rc-wordpress-xrscz" deleted
# RC が 3 つの新 Pod を自動再作成し、マーカーファイルは残っている
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

## 3. CoreDNS アドオンを導入して WordPress の DB 名前解決（v3）

### 3.1 役割

SVC の名前を ClusterIP に解決する。 IP を直書きせず、`WORDPRESS_DB_HOST` に `db-svc` をそのまま指定できる。

### 3.2 ケース —— WordPress

02-svc-db.yaml の clusterIP をコメントアウトし、03-rc-wordpress.yaml の WORDPRESS_DB_HOST を `db-svc` に変更、レプリカ数 3

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
  # ClusterIP の VIP を指定。svc のサブネットを指定すればよい。クラスタ構築時の svc サブネットは "10.200.0.0/16"
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
          # ここで指定しているのは Pod のアドレス。Pod が変わると IP も変わる
          # value: 10.100.1.60
          # ここでは ClusterIP のアドレスを指定。ClusterIP は自分で固定している。
          # value: 10.200.0.36
          # svc のアドレスを固定できない、あるいは既に割り当て済みの場合もあるので、ClusterIP での通信は推奨されない
          # svc の名前を直接使うことも検討できる
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

v2 のリソースを掃除してから作成：

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

今回 db-svc の ClusterIP はシステムから自動払い出しの **10.200.74.120**（10.200.0.36 には固定されない）。

エンドツーエンド検証：WordPress は `db-svc` という名前で DB に接続できた（インストール画面が 200、DB 接続エラーなし、Pod 内の環境変数も `WORDPRESS_DB_HOST=db-svc` と確認できた）：

```bash
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30090/wp-admin/install.php
HTTP 200
[root@master ~]# kubectl exec rc-wordpress-5ctfw -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123456
```

### 3.3 CoreDNS アドオンが動作しているか検証

#### 1. 全名前空間のリソースを表示

```bash
[root@master ~]# kubectl get svc -A
NAMESPACE     NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                  AGE
default       db-svc       ClusterIP   10.200.74.120   <none>        3306/TCP                 7m17s
default       kubernetes   ClusterIP   10.200.0.1      <none>        443/TCP                  18h
default       wp-svc       NodePort    10.200.93.233   <none>        80:30090/TCP             7m16s
kube-system   kube-dns     ClusterIP   10.200.0.10     <none>        53/UDP,53/TCP,9153/TCP   26h
```

#### 2. CoreDNS コンポーネントが正常動作しているか確認

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

#### 3. CoreDNS の動作検証 —— 方法 1（Pod 内から SVC 名へ ping）

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

名前解決はすべて成功（どの SVC 名も ClusterIP に解決できた）が、ICMP は 100% ロス —— これは正常な挙動で、ClusterIP 自体は ping に応答しない。証明できるのは DNS 解決の経路が通っていること。

#### 4. CoreDNS の動作検証 —— 方法 2（dig で A レコードを引く）

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

構文:

  dig @DNSサーバ  Aレコード解決形式

Aレコード形式:

  svc名.名前空間.svc.あなたの K8S クラスタのドメイン。