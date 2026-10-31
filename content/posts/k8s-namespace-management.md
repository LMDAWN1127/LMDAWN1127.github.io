---
title: "K8S 名称空间管理实战：响应式与声明式管理、跨命名空间服务访问"
date: 2026-10-31T16:22:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文系统讲 K8S 名称空间管理。先介绍名称空间的作用与局部资源/全局资源的区分方法（看 kubectl api-resources 的 NAMESPACED 列）；再用响应式命令完成名称空间的创建、查看、打标签、删除，并用同名 Pod 在 default 与 dawn 两个名称空间各建一个，直观验证隔离效果与删除名称空间时的级联清理；随后切到声明式管理：先从已有资源导出 yaml 做减法，再用 apply 创建带标签的名称空间；最后把 MySQL 放进 dawn、WordPress 放进 kube-public，用跨命名空间短写 `db-svc.dawn` 连通数据库，并给出跨命名空间 A 记录的三种写法与实测结果。"
---

# K8S 名称空间管理实战：响应式与声明式管理、跨命名空间服务访问

---

## 一、名称空间介绍

K8S 所谓的名称空间，就是用来隔离 K8S 集群资源的。

K8S 一切皆资源，有的资源支持名称空间，我们称之为局部资源；有的资源不支持名称空间，我们称之为全局资源。看 `NAMESPACED` 列——`true` 为局部资源，`false` 为全局资源：

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

| 类型                         | 资源举例                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| 局部资源（NAMESPACED=true）  | Pod、Service、RC/Deployment、ConfigMap、Secret、PVC、Ingress、Job/CronJob |
| 全局资源（NAMESPACED=false） | Node、Namespace、PV、ClusterRole、StorageClass、PriorityClass |

---

## 二、响应式管理名称空间

### 2.1 创建名称空间

```bash
[root@master ~]# kubectl create ns dawn
namespace/dawn created
```

### 2.2 查看名称空间

```bash
[root@master ~]# kubectl get ns
NAME              STATUS   AGE
dawn              Active   1s
default           Active   26h
kube-flannel      Active   26h
kube-node-lease   Active   26h
kube-public       Active   26h
kube-system       Active   26h
[root@master ~]# kubectl get ns dawn   # 查看指定的名称空间
NAME   STATUS   AGE
dawn   Active   1s
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   1s    kubernetes.io/metadata.name=dawn
```

新建的名称空间会自动带上 `kubernetes.io/metadata.name=dawn` 标签（K8s 1.21+ 行为）

### 2.3 修改名称空间

```bash
[root@master ~]# kubectl label namespaces dawn school=czu
namespace/dawn labeled
[root@master ~]# kubectl label ns dawn class=computer01
namespace/dawn labeled
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   7s    class=computer01,kubernetes.io/metadata.name=dawn,school=czu
```

名称空间不支持改名，但是可以修改标签信息

### 2.4 Pod 使用名称空间案例

在 default 和 dawn 两个名称空间分别创建同名 Pod `xiuxian-v1`，直观感受隔离效果：

```bash
[root@master pods]# cat 13-pods-xiuxian-namespace.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v1
  # 指定名称空间，若不指定，则默认为"default"名称空间
  # namespace: default
  namespace: dawn
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl apply -f 13-pods-xiuxian.yaml              # 不写 namespace，落到 default
pod/xiuxian-v1 created
[root@master pods]# kubectl apply -f 13-pods-xiuxian-namespace.yaml   # 指定 namespace: dawn
pod/xiuxian-v1 created
[root@master pods]# kubectl get pods -n dawn # 查看指定名称空间的Pod，若不使用-n选项指的，则默认使用default名称空间
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

<h1 style="color: green">凡人修仙传 v1 </h1>
<div>
<img src="1.jpg">
<div>
</body>

</html>
```

同名 Pod 在两个名称空间互不干扰

### 2.5 使用 -A 选项查看所有名称空间资源

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
[root@master pods]# kubectl get pods --all-namespaces    # --all-namespaces 与 -A 等价，输出相同
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

可以看到 `xiuxian-v1` 在 dawn 和 default 中各有一个，互不冲突

### 2.6 删除名称空间

```bash
[root@master pods]# kubectl delete ns dawn 
namespace "dawn" deleted
[root@master pods]# kubectl get pods --namespace dawn 
No resources found in dawn namespace.
[root@master pods]# kubectl get pods -n default | grep xiuxian    # default 里的同名 Pod 不受影响
xiuxian-v1           1/1     Running   0               72s
```

删除名称空间，意味着该名称空间下的所有资源都被删除（级联删除），生产环境中，谨慎操作

---

## 三、声明式管理名称空间

### 3.1 获取资源的 yaml 文件

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

### 3.2 根据提供的 yaml 文件做减法，实现资源创建

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

### 3.3 使用名称空间改写WordPress

把 MySQL 放进 dawn 命名空间，WordPress 放进 kube-public 命名空间，数据库地址用跨命名空间短写 `db-svc.dawn`

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

先在 NFS Server（master）上为 dawn 命名空间的实例创建数据目录

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
  # 指定ClusterIP的VIP地址，指定svc的网段即可，集群部署采用的svc网段为"10.200.0.0/16"
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
          # 指定的是Pod的地址当Pod发生变化时，IP地址需要变动
          # value: 10.100.1.60
          # 此处我指定的是ClusterIP的地址，ClusterIP的地址被我固定
          # value: 10.200.0.36
          # 有些情况下svc的地址无法固定或者已经分配，则不建议使用ClusterIP进行通信
          # 可以考虑直接使用svc的名称即可，前提是资源同一名称空间
          # value: db-svc
          # 当数据库和wordpress不在同一个名称空间时，需要写完整的A记录
          # value: db-svc.dawn.svc.dawn.com
          # 也可以简写到名称空间为止即可，svc及后面的配置可以省略
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

跨命名空间 A 记录的三种写法：

| 写法                   | 示例                       | 能否解析               |
| ---------------------- | -------------------------- | ---------------------- |
| 仅 SVC 名              | `db-svc`                   | 只在同一名称空间内有效 |
| 短写（到名称空间为止） | `db-svc.dawn`              | `svc.` 及之后可省略    |
| 完整 FQDN              | `db-svc.dawn.svc.dawn.com` | 能                     |

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

kube-public 里的 WordPress 通过 `db-svc.dawn` 连上了 dawn 里的 MySQL：

```bash
# Pod内环境变量确认
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc.dawn
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123

# DNS实测：短写被补全为完整FQDN并解析到dawn的db-svc
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- getent hosts db-svc.dawn
10.200.63.31    db-svc.dawn.svc.dawn.com

# 业务验证：安装页200且无数据库连接错误（走 NodePort 30091）
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30091/wp-admin/install.php
HTTP 200
[root@master ~]# curl -sL http://11.0.1.231:30091/wp-admin/install.php | grep -oE '<title>[^<]*</title>'
<title>WordPress &rsaquo; Installation</title>
```
