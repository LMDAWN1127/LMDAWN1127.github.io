---
title: "K8S 名前空間管理実践：命令的・宣言的管理と名前空間をまたぐサービス接続"
date: 2026-10-31T16:22:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本記事は K8S の名前空間管理を体系的に解説する。まず名前空間の役割と、名前空間リソースとクラスタ全体リソースの見分け方（kubectl api-resources の NAMESPACED 列）。次に命令的なコマンドで名前空間の作成・表示・ラベル付け・削除を行い、default と dawn の両方に同名 Pod xiuxian-v1 を作って分離効果と、名前空間削除時のカスケード削除を実証する。続いて宣言的管理へ移る。既存リソースから yaml を書き出して引き算し、apply でラベル付き名前空間を作成する。最後に MySQL を dawn、WordPress を kube-public に置き、名前空間をまたぐ短縮形 db-svc.dawn で DB に接続し、名前空間をまたぐ A レコードの 3 つの書き方と実測結果を示す。"
---

# K8S 名前空間管理実践：命令的・宣言的管理と名前空間をまたぐサービス接続

---

## 1. 名前空間とは

K8S のいわゆる名前空間は、クラスタのリソースを分離するためのもの。

K8S ではすべてがリソース。名前空間をサポートするものを名前空間リソース、サポートしないものをクラスタ全体リソースと呼ぶ。`NAMESPACED` 列を見る —— `true` が名前空間リソース、`false` がクラスタ全体リソース：

```bash
[root@master ~]# kubectl api-resources 
NAME                              SHORTNAMES   APIVERSION                             NAMESPACED   KIND
bindings                                       v1                                     true         Binding
componentstatuses                 cs           v1                                     false        ComponentStatus
configmaps                        cm           v1                                     true         ConfigMap
endpoints                         ep           v1                                     true         Endpoints
events                            ev           v1                                     true         Event
limitranges                       limits       v1                                     true         LimitRange
namespaces                        ns           v1                                     false        Namespace
nodes                             no           v1                                     false        Node
persistentvolumeclaims            pvc          v1                                     true         PersistentVolumeClaim
persistentvolumes                 pv           v1                                     false        PersistentVolume
pods                              po           v1                                     true         Pod
podtemplates                                   v1                                     true         PodTemplate
replicationcontrollers            rc           v1                                     true         ReplicationController
resourcequotas                    quota        v1                                     true         ResourceQuota
secrets                                        v1                                     true         Secret
serviceaccounts                   sa           v1                                     true         ServiceAccount
services                          svc          v1                                     true         Service
mutatingwebhookconfigurations                  admissionregistration.k8s.io/v1        false        MutatingWebhookConfiguration
validatingwebhookconfigurations                admissionregistration.k8s.io/v1        false        ValidatingWebhookConfiguration
customresourcedefinitions         crd,crds     apiextensions.k8s.io/v1                false        CustomResourceDefinition
apiservices                                    apiregistration.k8s.io/v1              false        APIService
controllerrevisions                            apps/v1                                true         ControllerRevision
daemonsets                        ds           apps/v1                                true         DaemonSet
deployments                       deploy       apps/v1                                true         Deployment
replicasets                       rs           apps/v1                                true         ReplicaSet
statefulsets                      sts          apps/v1                                true         StatefulSet
tokenreviews                                   authentication.k8s.io/v1               false        TokenReview
localsubjectaccessreviews                      authorization.k8s.io/v1                true         LocalSubjectAccessReview
selfsubjectaccessreviews                      authorization.k8s.io/v1                false        SelfSubjectAccessReview
selfsubjectrulesreviews                        authorization.k8s.io/v1                false        SelfSubjectRulesReview
subjectaccessreviews                           authorization.k8s.io/v1                false        SubjectAccessReview
horizontalpodautoscalers          hpa          autoscaling/v2                         true         HorizontalPodAutoscaler
cronjobs                          cj           batch/v1                               true         CronJob
jobs                                           batch/v1                               true         Job
certificatesigningrequests        csr          certificates.k8s.io/v1                 false        CertificateSigningRequest
leases                                         coordination.k8s.io/v1                 true         Lease
endpointslices                                 discovery.k8s.io/v1                    true         EndpointSlice
events                            ev           events.k8s.io/v1                       true         Event
flowschemas                                    flowcontrol.apiserver.k8s.io/v1beta2   false        FlowSchema
prioritylevelconfigurations                    flowcontrol.apiserver.k8s.io/v1beta2   false        PriorityLevelConfiguration
ingressclasses                                 networking.k8s.io/v1                   false        IngressClass
ingresses                         ing          networking.k8s.io/v1                   true         Ingress
networkpolicies                   netpol       networking.k8s.io/v1                   true         NetworkPolicy
runtimeclasses                                 node.k8s.io/v1                         false        RuntimeClass
poddisruptionbudgets              pdb          policy/v1                              true         PodDisruptionBudget
podsecuritypolicies               psp          policy/v1beta1                         false        PodSecurityPolicy
clusterrolebindings                            rbac.authorization.k8s.io/v1           false        ClusterRoleBinding
clusterroles                                   rbac.authorization.k8s.io/v1           false        ClusterRole
rolebindings                                   rbac.authorization.k8s.io/v1           true         RoleBinding
roles                                          rbac.authorization.k8s.io/v1           true         Role
priorityclasses                   pc           scheduling.k8s.io/v1                   false        PriorityClass
csidrivers                                     storage.k8s.io/v1                      false        CSIDriver
csinodes                                     storage.k8s.io/v1                      false        CSINode
csistoragecapacities                            storage.k8s.io/v1beta1                true         CSIStorageCapacity
storageclasses                    sc           storage.k8s.io/v1                      false        StorageClass
volumeattachments                              storage.k8s.io/v1                      false        VolumeAttachment
[root@master ~]# 
```

| 種別                         | リソース例                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| 名前空間リソース（NAMESPACED=true）  | Pod、Service、RC/Deployment、ConfigMap、Secret、PVC、Ingress、Job/CronJob |
| クラスタ全体リソース（NAMESPACED=false） | Node、Namespace、PV、ClusterRole、StorageClass、PriorityClass |

---

## 2. 命令的に名前空間を管理

### 2.1 名前空間を作成

```bash
[root@master ~]# kubectl create ns dawn
namespace/dawn created
```

### 2.2 名前空間を表示

```bash
[root@master ~]# kubectl get ns
NAME              STATUS   AGE
dawn              Active   1s
default           Active   26h
kube-flannel      Active   26h
kube-node-lease   Active   26h
kube-public       Active   26h
kube-system       Active   26h
[root@master ~]# kubectl get ns dawn   # 指定した名前空間を表示
NAME   STATUS   AGE
dawn   Active   1s
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   1s    kubernetes.io/metadata.name=dawn
```

新しく作った名前空間には自動的に `kubernetes.io/metadata.name=dawn` ラベルが付く（K8s 1.21+ の挙動）

### 2.3 名前空間を変更

```bash
[root@master ~]# kubectl label namespaces dawn school=czu
namespace/dawn labeled
[root@master ~]# kubectl label ns dawn class=computer01
namespace/dawn labeled
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   7s    class=computer01,kubernetes.io/metadata.name=dawn,school=czu
```

名前空間はリネームできないが、ラベルは変更できる

### 2.4 Pod を名前空間で使う例

default と dawn の両方に同名の Pod `xiuxian-v1` を作り、分離効果を体感する：

```bash
[root@master pods]# cat 13-pods-xiuxian-namespace.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v1
  # 名前空間を指定。省略すると "default" 名前空間になる
  # namespace: default
  namespace: dawn
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl apply -f 13-pods-xiuxian.yaml              # namespace を書かないので default に入る
pod/xiuxian-v1 created
[root@master pods]# kubectl apply -f 13-pods-xiuxian-namespace.yaml   # namespace: dawn を指定
pod/xiuxian-v1 created
[root@master pods]# kubectl get pods -n dawn # 指定名前空間の Pod を表示。-n を使わない場合は既定で default 名前空間
NAME         READY   STATUS    RESTARTS   AGE
xiuxian-v1   1/1     Running   0          5s
[root@master pods]# kubectl get pods -n dawn -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES
xiuxian-v1   1/1     Running   0          10s   10.100.1.57   worker01   <none>           <none>
[root@master pods]# curl 10.100.1.57  
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>DAWN apps v1</title>
    <style>
       div img {
          width: 900px;
          height: 600px;
          margin: 0;
       }
    </style>
  </head>

<body>

<h1 style="color: green">凡人修仙伝 v1 </h1>
<div>
<img src="1.jpg">
<div>
</body>

</html>
```

同名の Pod は 2 つの名前空間で互いに干渉しない

### 2.5 -A オプションで全名前空間のリソースを表示

```bash
[root@master pods]# kubectl get pods -A
NAMESPACE      NAME                             READY   STATUS    RESTARTS        AGE
dawn           xiuxian-v1                       1/1     Running   0               55s
default        rc-mysql-4fx65                   1/1     Running   0               35m
default        rc-wordpress-5ctfw               1/1     Running   0               35m
default        rc-wordpress-gn7lm               1/1     Running   0               35m
default        rc-wordpress-kh6kd               1/1     Running   0               35m
default        xiuxian-v1                       1/1     Running   0               55s
kube-flannel   kube-flannel-ds-8rmk2            1/1     Running   2 (3h32m ago)   26h
kube-flannel   kube-flannel-ds-n6wcv            1/1     Running   2 (3h32m ago)   26h
kube-flannel   kube-flannel-ds-tw8f6            1/1     Running   2 (3h32m ago)   26h
kube-system    coredns-6d8c4cb4d-qkn74          1/1     Running   2 (3h32m ago)   26h
kube-system    coredns-6d8c4cb4d-vxxvm          1/1     Running   2 (3h32m ago)   26h
kube-system    etcd-master                      1/1     Running   2 (3h32m ago)   26h
kube-system    kube-apiserver-master            1/1     Running   2 (3h32m ago)   26h
kube-system    kube-controller-manager-master   1/1     Running   2 (3h32m ago)   26h
kube-system    kube-proxy-c46br                 1/1     Running   2 (3h32m ago)   26h
kube-system    kube-proxy-lnxt2                 1/1     Running   2 (3h31m ago)   26h
kube-system    kube-proxy-r66sd                 1/1     Running   2 (3h32m ago)   26h
kube-system    kube-scheduler-master            1/1     Running   2 (3h32m ago)   26h
[root@master pods]# kubectl get pods --all-namespaces    # --all-namespaces は -A と等価、出力は同じ
[root@master pods]# kubectl get pods -n default 
NAME                 READY   STATUS    RESTARTS   AGE
rc-mysql-4fx65       1/1     Running   0               35m
rc-wordpress-5ctfw   1/1     Running   0               35m
rc-wordpress-gn7lm   1/1     Running   0               35m
rc-wordpress-kh6kd   1/1     Running   0               35m
xiuxian-v1           1/1     Running   0               55s
[root@master pods]# kubectl get pods --namespace dawn 
NAME         READY   STATUS    RESTARTS   AGE
xiuxian-v1   1/1     Running   0               55s
```

`xiuxian-v1` が dawn と default に 1 つずつ存在し、衝突しないことがわかる

### 2.6 名前空間を削除

```bash
[root@master pods]# kubectl delete ns dawn 
namespace "dawn" deleted
[root@master pods]# kubectl get pods --namespace dawn 
No resources found in dawn namespace.
[root@master pods]# kubectl get pods -n default | grep xiuxian    # default 内の同名 Pod は影響を受けない
xiuxian-v1           1/1     Running   0               72s
```

名前空間を削除すると、その中の全リソースも削除される（カスケード削除）。本番環境では慎重に操作すること

---

## 3. 宣言的に名前空間を管理

### 3.1 リソースの yaml を取得

```bash
[root@master ~]# kubectl get ns default -o yaml
apiVersion: v1
kind: Namespace
metadata:
  creationTimestamp: "2026-10-30T04:54:13Z"
  labels:
    kubernetes.io/metadata.name: default
  name: default
  resourceVersion: "206"
  uid: c8e78f91-0add-4a22-87a4-e3888c694857
spec:
  finalizers:
  - kubernetes
status:
  phase: Active
```

### 3.2 提供された yaml から引き算してリソースを作成

```bash
[root@master v4-svc-volumes-CoreDNS-ns]# cat 05-ns-dawn.yaml
```

```yaml
apiVersion: v1
kind: Namespace
metadata:
  labels:
    school: czu
    class: computer01
  name: dawn
```

```bash
[root@master v4-svc-volumes-CoreDNS-ns]# kubectl apply -f 05-ns-dawn.yaml
namespace/dawn created
[root@master v4-svc-volumes-CoreDNS-ns]# kubectl get ns dawn --show-labels
NAME        STATUS   AGE   LABELS
dawn   Active   15s   class=computer01,kubernetes.io/metadata.name=dawn,school=czu
```

### 3.3 名前空間を使って WordPress を書き換え

MySQL を dawn 名前空間に、WordPress を kube-public 名前空間に置き、DB アドレスは名前空間をまたぐ短縮形 `db-svc.dawn` を使う

```bash
[root@master v4-svc-volumes-CoreDNS-ns]# ll
total 28
drwxr-xr-x 2 root root 4096 Oct 31 15:24 ./
drwxr-xr-x 6 root root 4096 Oct 31 15:21 ../
-rw-r--r-- 1 root root  732 Oct 31 15:22 01-rc-mysql-ns-dawn.yaml
-rw-r--r-- 1 root root  314 Oct 31 15:22 02-svc-db-ns-dawn.yaml
-rw-r--r-- 1 root root 1480 Oct 31 15:22 03-rc-wordpress.yaml
-rw-r--r-- 1 root root  188 Oct 31 15:22 04-svc-wordpress.yaml
-rw-r--r-- 1 root root  102 Oct 31 15:22 05-ns-dawn.yaml
```

先に NFS Server（master）上で dawn 名前空間のインスタンス用データディレクトリを作成

```bash
[root@master ~]# mkdir -p /dawn/data/nfs-server/mysql80-dawn /dawn/data/nfs-server/wordpress-dawn
[root@master ~]# chmod 777 /dawn/data/nfs-server/mysql80-dawn /dawn/data/nfs-server/wordpress-dawn
[root@master ~]# chown www-data:www-data /dawn/data/nfs-server/wordpress-dawn
[root@master ~]# ls -ld /dawn/data/nfs-server/*/
drwxrwxrwx 8 lxd      root     4096 Oct 31 14:47 /dawn/data/nfs-server/mysql80/
drwxrwxrwx 2 root     root     4096 Oct 31 15:24 /dawn/data/nfs-server/mysql80-dawn/
drwxr-xr-x 5 www-data www-data 4096 Oct 31 13:14 /dawn/data/nfs-server/wordpress/
drwxrwxrwx 2 www-data www-data 4096 Oct 31 15:24 /dawn/data/nfs-server/wordpress-dawn/
```

```bash
[root@master v4-svc-volumes-CoreDNS-ns]# cat 01-rc-mysql-ns-dawn.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-mysql
  namespace: dawn
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
          path: /dawn/data/nfs-server/mysql80-dawn
      containers:
      - image: harbor:443/dawn-db/mysql:8.3.0-oracle
        name: db
        volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: dawn
        - name: MYSQL_DATABASE
          value: wordpress
        - name: MYSQL_USER
          value: dawn
        - name: MYSQL_PASSWORD
          value: "123"
[root@master v4-svc-volumes-CoreDNS-ns]# cat 02-svc-db-ns-dawn.yaml 
apiVersion: v1
kind: Service
metadata:
  name: db-svc
  namespace: dawn
spec:
  type: ClusterIP
  # ClusterIP の VIP を指定。svc のサブネットを指定すればよい。クラスタ構築時の svc サブネットは "10.200.0.0/16"
  # clusterIP: 10.200.0.36
  selector:
    apps: mysql80
  ports:
  - port: 3306
    targetPort: 3306
[root@master v4-svc-volumes-CoreDNS-ns]# cat 03-rc-wordpress.yaml 
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-wordpress
  namespace: kube-public
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
          path: /dawn/data/nfs-server/wordpress-dawn
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
          # value: 10.200.0.36
          # svc のアドレスを固定できない、あるいは既に割り当て済みの場合もあるので、ClusterIP での通信は推奨されない
          # リソースが同一名前空間なら、svc の名前をそのまま使ってもよい
          # value: db-svc
          # DB と wordpress が同じ名前空間にない場合は、完全な A レコードを書く必要がある
          # value: db-svc.dawn.svc.dawn.com
          # 名前空間までで短縮してもよく、svc 以降の設定は省略できる
          value: db-svc.dawn
        - name: WORDPRESS_DB_NAME
          value: wordpress
        - name: WORDPRESS_DB_USER
          value: dawn
        - name: WORDPRESS_DB_PASSWORD
          value: "123" 
[root@master v4-svc-volumes-CoreDNS-ns]# cat 04-svc-wordpress.yaml 
apiVersion: v1
kind: Service
metadata:
  name: wp-svc
  namespace: kube-public
spec:
  type: NodePort
  selector:
    apps: wp
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30091
[root@master v4-svc-volumes-CoreDNS-ns]# cat 05-ns-dawn.yaml 
apiVersion: v1
kind: Namespace
metadata:
  labels:
    school: czu
    class: computer01
  name: dawn
[root@master v4-svc-volumes-CoreDNS-ns]# kubectl apply -f .
replicationcontroller/rc-mysql created
service/db-svc created
replicationcontroller/rc-wordpress created
service/wp-svc created
namespace/dawn unchanged
```

名前空間をまたぐ A レコードの 3 つの書き方：

| 書き方                   | 例                       | 名前解決できるか               |
| ---------------------- | -------------------------- | ---------------------- |
| SVC 名のみ              | `db-svc`                   | 同一名前空間内でのみ有効 |
| 短縮形（名前空間まで） | `db-svc.dawn`              | `svc.` 以降は省略可可    |
| 完全 FQDN              | `db-svc.dawn.svc.dawn.com` | 可                     |

```bash
[root@master ~]# kubectl get pods -n dawn -o wide
NAME             READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
rc-mysql-9jrjq   1/1     Running   0          48s   10.100.2.54   worker02   <none>           <none>
[root@master ~]# kubectl get pods -n kube-public -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
rc-wordpress-kqbm7   1/1     Running   0          48s   10.100.2.53   worker02   <none>           <none>
rc-wordpress-s9fkp   1/1     Running   0          48s   10.100.2.55   worker02   <none>           <none>
rc-wordpress-vv6vz   1/1     Running   0          48s   10.100.1.58   worker01   <none>           <none>
[root@master ~]# kubectl get svc -A
NAMESPACE     NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                  AGE
dawn          db-svc       ClusterIP   10.200.63.31    <none>        3306/TCP                 48s
default       db-svc       ClusterIP   10.200.74.120   <none>        3306/TCP                 38m
default       kubernetes   ClusterIP   10.200.0.1      <none>        443/TCP                  18h
default       wp-svc       NodePort    10.200.93.233   <none>        80:30090/TCP             38m
kube-public   wp-svc       NodePort    10.200.37.3     <none>        80:30091/TCP             48s
kube-system   kube-dns     ClusterIP   10.200.0.10     <none>        53/UDP,53/TCP,9153/TCP   26h
```

kube-public の WordPress は `db-svc.dawn` 経由で dawn の MySQL に接続できた：

```bash
# Pod 内の環境変数を確認
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc.dawn
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123

# DNS 実測：短縮形が完全 FQDN に補完され、dawn の db-svc に解決される
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- getent hosts db-svc.dawn
10.200.63.31    db-svc.dawn.svc.dawn.com

# 業務検証：インストール画面が 200、DB 接続エラーなし（NodePort 30091 経由）
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30091/wp-admin/install.php
HTTP 200
[root@master ~]# curl -sL http://11.0.1.231:30091/wp-admin/install.php | grep -oE '<title>[^<]*</title>'
<title>WordPress &rsaquo; Installation</title>
```
