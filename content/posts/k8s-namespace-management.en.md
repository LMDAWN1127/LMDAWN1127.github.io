---
title: "K8S Namespace Management in Practice: Imperative and Declarative Management, Cross-Namespace Service Access"
date: 2026-10-31T16:22:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article walks through K8S namespace management. It starts with what namespaces do and how to tell namespaced from cluster-scoped resources (the NAMESPACED column of kubectl api-resources). Then it creates, lists, labels and deletes namespaces with imperative commands, and creates a Pod named xiuxian-v1 in both default and dawn to demonstrate isolation and the cascade delete that happens when a namespace is removed. Next it switches to declarative management: export a YAML from an existing resource and subtract from it, then apply to create a labeled namespace. Finally it puts MySQL in dawn and WordPress in kube-public, connects them using the cross-namespace short form db-svc.dawn, and lists the three ways to write a cross-namespace A record with the measured results."
---

# K8S Namespace Management in Practice: Imperative and Declarative Management, Cross-Namespace Service Access

---

## 1. What Namespaces Are

A K8S namespace is what isolates cluster resources.

In K8S everything is a resource. Some resources support namespaces — we call them namespaced resources; others do not — we call them cluster-scoped resources. Look at the `NAMESPACED` column: `true` means namespaced, `false` means cluster-scoped:

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

| Type                         | Example resources                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| Namespaced resources (NAMESPACED=true)  | Pod、Service、RC/Deployment、ConfigMap、Secret、PVC、Ingress、Job/CronJob |
| Cluster-scoped resources (NAMESPACED=false) | Node、Namespace、PV、ClusterRole、StorageClass、PriorityClass |

---

## 2. Managing Namespaces Imperatively

### 2.1 Create a Namespace

```bash
[root@master ~]# kubectl create ns dawn
namespace/dawn created
```

### 2.2 List Namespaces

```bash
[root@master ~]# kubectl get ns
NAME              STATUS   AGE
dawn              Active   1s
default           Active   26h
kube-flannel      Active   26h
kube-node-lease   Active   26h
kube-public       Active   26h
kube-system       Active   26h
[root@master ~]# kubectl get ns dawn   # View a specific namespace
NAME   STATUS   AGE
dawn   Active   1s
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   1s    kubernetes.io/metadata.name=dawn
```

A newly created namespace automatically gets the `kubernetes.io/metadata.name=dawn` label (K8s 1.21+ behavior)

### 2.3 Modify a Namespace

```bash
[root@master ~]# kubectl label namespaces dawn school=czu
namespace/dawn labeled
[root@master ~]# kubectl label ns dawn class=computer01
namespace/dawn labeled
[root@master ~]# kubectl get ns dawn  --show-labels
NAME   STATUS   AGE   LABELS
dawn   Active   7s    class=computer01,kubernetes.io/metadata.name=dawn,school=czu
```

A namespace cannot be renamed, but its labels can be changed

### 2.4 Example: Putting a Pod in a Namespace

Create a Pod named `xiuxian-v1` in both the default and dawn namespaces to feel the isolation directly:

```bash
[root@master pods]# cat 13-pods-xiuxian-namespace.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-v1
  # Specify the namespace; if omitted it defaults to "default"
  # namespace: default
  namespace: dawn
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
```

```bash
[root@master pods]# kubectl apply -f 13-pods-xiuxian.yaml              # No namespace field, so it lands in default
pod/xiuxian-v1 created
[root@master pods]# kubectl apply -f 13-pods-xiuxian-namespace.yaml   # namespace: dawn is specified
pod/xiuxian-v1 created
[root@master pods]# kubectl get pods -n dawn # List Pods in a given namespace; without -n it defaults to the default namespace
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

<h1 style="color: green">A Record of a Mortal's Journey to Immortality v1 </h1>
<div>
<img src="1.jpg">
<div>
</body>

</html>
```

Same-named Pods in the two namespaces do not interfere with each other

### 2.5 Listing Resources in All Namespaces with -A

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
[root@master pods]# kubectl get pods --all-namespaces    # --all-namespaces is equivalent to -A, same output
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

You can see `xiuxian-v1` exists once in dawn and once in default, with no conflict

### 2.6 Delete a Namespace

```bash
[root@master pods]# kubectl delete ns dawn 
namespace "dawn" deleted
[root@master pods]# kubectl get pods --namespace dawn 
No resources found in dawn namespace.
[root@master pods]# kubectl get pods -n default | grep xiuxian    # The same-named Pod in default is unaffected
xiuxian-v1           1/1     Running   0               72s
```

Deleting a namespace deletes every resource inside it (cascade delete) — be careful in production

---

## 3. Managing Namespaces Declaratively

### 3.1 Export a Resource's YAML

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

### 3.2 Create Resources by Subtracting from a Given YAML

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

### 3.3 Rewriting WordPress with Namespaces

Put MySQL in the dawn namespace and WordPress in kube-public; the database address uses the cross-namespace short form `db-svc.dawn`

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

First create the data directories for the dawn namespace instance on the NFS Server (master)

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
  # Pin the ClusterIP VIP; just pick an address from the svc subnet - this cluster uses "10.200.0.0/16" for svc
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
          # This is the Pod address; when the Pod changes, the IP changes too
          # value: 10.100.1.60
          # Here I pin the ClusterIP address; the ClusterIP is fixed by me
          # value: 10.200.0.36
          # In some cases the svc address cannot be pinned or is already assigned, so ClusterIP is not recommended for communication
          # You can simply use the svc name instead, provided the resources are in the same namespace
          # value: db-svc
          # When the database and wordpress are not in the same namespace, you must write the full A record
          # value: db-svc.dawn.svc.dawn.com
          # You can also shorten it up to the namespace; the svc part and everything after can be omitted
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

Three ways to write a cross-namespace A record:

| Form                   | Example                       | Resolves?               |
| ---------------------- | -------------------------- | ---------------------- |
| SVC name only              | `db-svc`                   | Only valid within the same namespace |
| Short form (up to the namespace) | `db-svc.dawn`              | `svc.` and everything after can be omitted    |
| Full FQDN              | `db-svc.dawn.svc.dawn.com` | Yes                     |

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

WordPress in kube-public connects to MySQL in dawn through `db-svc.dawn`:

```bash
# Confirm the env vars inside the Pod
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- printenv | grep WORDPRESS_DB
WORDPRESS_DB_HOST=db-svc.dawn
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=dawn
WORDPRESS_DB_PASSWORD=123

# DNS check: the short form is expanded to the full FQDN and resolves to db-svc in dawn
[root@master ~]# kubectl exec -n kube-public rc-wordpress-kqbm7 -- getent hosts db-svc.dawn
10.200.63.31    db-svc.dawn.svc.dawn.com

# Application check: installer returns 200 with no database connection error (via NodePort 30091)
[root@master ~]# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://11.0.1.231:30091/wp-admin/install.php
HTTP 200
[root@master ~]# curl -sL http://11.0.1.231:30091/wp-admin/install.php | grep -oE '<title>[^<]*</title>'
<title>WordPress &rsaquo; Installation</title>
```
