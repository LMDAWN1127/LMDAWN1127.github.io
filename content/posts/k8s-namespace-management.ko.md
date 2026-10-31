---
title: "K8S 네임스페이스 관리 실전: 명령형/선언형 관리와 네임스페이스 간 서비스 접근"
date: 2026-10-31T16:22:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 K8S 네임스페이스 관리를 체계적으로 다룬다. 먼저 네임스페이스의 역할과 네임스페이스 리소스/클러스터 전체 리소스 구분법（kubectl api-resources 의 NAMESPACED 열）. 이어 명령형 명령으로 네임스페이스 생성, 조회, 라벨링, 삭제를 하고, default 와 dawn 에 같은 이름의 Pod xiuxian-v1 을 각각 만들어 격리 효과와 네임스페이스 삭제 시 연쇄 삭제를 확인한다. 다음은 선언형 관리다. 기존 리소스에서 yaml 을 뽑아 빼기 작업을 한 뒤 apply 로 라벨 있는 네임스페이스를 만든다. 마지막으로 MySQL 은 dawn, WordPress 는 kube-public 에 두고 네임스페이스 간 축약형 db-svc.dawn 으로 DB 에 연결하며, 네임스페이스 간 A 레코드 세 가지 작성법과 실측 결과를 정리한다."
---

# K8S 네임스페이스 관리 실전: 명령형/선언형 관리와 네임스페이스 간 서비스 접근

---

## 1. 네임스페이스 소개

K8S 에서 말하는 네임스페이스는 클러스터 리소스를 격리하기 위한 것.

K8S 는 모든 것이 리소스다. 네임스페이스를 지원하는 리소스를 네임스페이스 리소스, 지원하지 않는 리소스를 클러스터 전체 리소스라고 부른다. `NAMESPACED` 열을 보면 된다 —— `true` 면 네임스페이스 리소스, `false` 면 클러스터 전체 리소스:

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

| 유형                         | 리소스 예시                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| 네임스페이스 리소스（NAMESPACED=true）  | Pod、Service、RC/Deployment、ConfigMap、Secret、PVC、Ingress、Job/CronJob |
| 클러스터 전체 리소스（NAMESPACED=false） | Node、Namespace、PV、ClusterRole、StorageClass、PriorityClass |

---

## 2. 명령형으로 네임스페이스 관리

### 2.1 네임스페이스 생성

```bash
[root@master ~]# kubectl create ns dawn
namespace/dawn created
```

### 2.2 네임스페이스 조회

```bash
[root@master ~]# kubectl get ns
NAME              STATUS   AGE
dawn              Active   1s
default           Active   26h
kube-flannel      Active   26h
kube-node-lease   Active   26h
kube-public       Active   26h
kube-system       Active   26h
[root@master ~]# kubectl get ns dawn   # 지정한 네임스페이스 조회
NAME   STATUS   AGE
dawn   Active   1s
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   1s    kubernetes.io/metadata.name=dawn
```

새로 만든 네임스페이스에는 자동으로 `kubernetes.io/metadata.name=dawn` 라벨이 붙는다（K8s 1.21+ 동작）

### 2.3 네임스페이스 수정

```bash
[root@master ~]# kubectl label namespaces dawn school=czu
namespace/dawn labeled
[root@master ~]# kubectl label ns dawn class=computer01
namespace/dawn labeled
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   7s    class=computer01,kubernetes.io/metadata.name=dawn,school=czu
```

네임스페이스는 이름 변경이 불가능하지만 라벨은 수정할 수 있다

### 2.4 네임스페이스를 사용하는 Pod 예시

default 와 dawn 두 네임스페이스에 같은 이름의 Pod `xiuxian-v1` 을 각각 만들어 격리 효과를 직접 확인한다:

```bash
[root@master pods]# cat 13-pods-xiuxian-namespace.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v1
  # 네임스페이스 지정. 생략하면 "default" 네임스페이스
  # namespace: default
  namespace: dawn
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl apply -f 13-pods-xiuxian.yaml              # namespace 를 쓰지 않아 default 로 들어감
pod/xiuxian-v1 created
[root@master pods]# kubectl apply -f 13-pods-xiuxian-namespace.yaml   # namespace: dawn 지정
pod/xiuxian-v1 created
[root@master pods]# kubectl get pods -n dawn # 지정 네임스페이스의 Pod 조회. -n 을 쓰지 않으면 기본으로 default 네임스페이스
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

<h1 style="color: green">범인수선전 v1 </h1>
<div>
<img src="1.jpg">
<div>
</body>

</html>
```

같은 이름의 Pod 는 두 네임스페이스에서 서로 간섭하지 않는다

### 2.5 -A 옵션으로 모든 네임스페이스 리소스 조회

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
[root@master pods]# kubectl get pods --all-namespaces    # --all-namespaces 는 -A 와 동일, 출력 같음
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

`xiuxian-v1` 이 dawn 과 default 에 각각 하나씩 존재하며 충돌하지 않음을 확인할 수 있다

### 2.6 네임스페이스 삭제

```bash
[root@master pods]# kubectl delete ns dawn 
namespace "dawn" deleted
[root@master pods]# kubectl get pods --namespace dawn 
No resources found in dawn namespace.
[root@master pods]# kubectl get pods -n default | grep xiuxian    # default 의 동명 Pod 는 영향 없음
xiuxian-v1           1/1     Running   0               72s
```

네임스페이스를 삭제하면 그 안의 모든 리소스도 삭제된다（연쇄 삭제）. 운영 환경에서는 신중하게 다뤄야 한다

---

## 3. 선언형으로 네임스페이스 관리

### 3.1 리소스의 yaml 파일 얻기

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

### 3.2 제공된 yaml 파일에서 빼기 작업을 해 리소스 생성

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

### 3.3 네임스페이스를 사용해 WordPress 재작성

MySQL 은 dawn 네임스페이스에, WordPress 는 kube-public 네임스페이스에 넣고, DB 주소는 네임스페이스 간 축약형 `db-svc.dawn` 을 사용한다

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

먼저 NFS Server（master）에 dawn 네임스페이스 인스턴스용 데이터 디렉터리를 만든다

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
  # ClusterIP VIP 지정. svc 대역만 지정하면 되며, 클러스터 구축 시 사용한 svc 대역은 "10.200.0.0/16"
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
          # 지정한 것은 Pod 주소. Pod 가 바뀌면 IP 도 바뀐다
          # value: 10.100.1.60
          # 여기서는 ClusterIP 주소를 지정. ClusterIP 는 내가 고정했다
          # value: 10.200.0.36
          # 어떤 경우에는 svc 주소를 고정할 수 없거나 이미 할당되어 있어 ClusterIP 통신을 권장하지 않는다
          # 리소스가 같은 네임스페이스라면 svc 이름을 그대로 써도 된다
          # value: db-svc
          # 데이터베이스와 wordpress 가 같은 네임스페이스에 없으면 전체 A 레코드를 써야 한다
          # value: db-svc.dawn.svc.dawn.com
          # 네임스페이스까지만 축약해도 되며 svc 이후 설정은 생략할 수 있다
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

네임스페이스 간 A 레코드 세 가지 작성법:

| 작성법                   | 예시                       | 해석 가능               |
| ---------------------- | -------------------------- | ---------------------- |
| SVC 이름만              | `db-svc`                   | 같은 네임스페이스 안에서만 유효 |
| 축약형（네임스페이스까지） | `db-svc.dawn`              | `svc.` 이후는 생략 가능    |
| 전체 FQDN              | `db-svc.dawn.svc.dawn.com` | 가능                     |

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

kube-public 의 WordPress 가 `db-svc.dawn` 으로 dawn 의 MySQL 에 연결됐다:

```bash
# Pod 내부 환경변수 확인
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc.dawn
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123

# DNS 실측: 축약형이 전체 FQDN 으로 보완되어 dawn 의 db-svc 로 해석됨
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- getent hosts db-svc.dawn
10.200.63.31    db-svc.dawn.svc.dawn.com

# 서비스 검증: 설치 페이지 200, DB 연결 오류 없음（NodePort 30091 경유）
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30091/wp-admin/install.php
HTTP 200
[root@master ~]# curl -sL http://11.0.1.231:30091/wp-admin/install.php | grep -oE '<title>[^<]*</title>'
<title>WordPress &rsaquo; Installation</title>
```
