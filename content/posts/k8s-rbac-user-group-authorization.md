---
title: "K8S 安全框架与 RBAC 实战：基于 CFSSL 证书实现用户与用户组细粒度权限控制"
date: 2026-11-03T13:10:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "RBAC", "CFSSL", "Security"]
showToc: true
summary: "深入剖析 Kubernetes 安全体系（认证、授权、准入控制）与 RBAC 核心模型，实战演示使用 CFSSL 为 User 和 Group 签发证书、编写 kubeconfig 生成脚本，并配置 Role/ClusterRole 细粒度权限绑定与越权防护验证。"
---

# K8S 安全框架与 RBAC 实战：基于 CFSSL 证书实现用户与用户组细粒度权限控制

---

## 一、K8S安全框架概述

为了给K8S用户创建权限授权的功能。

K8S的api-server对证书认证大概分为三部曲:

- **鉴权 (Authentication)**：相当于进入小区的"出入证"，以便于门口保安识别。
- **授权 (Authorization)**：相当于进入小区的单元楼要使用的"门禁卡"，这个"门禁卡"，在K8S实现为kubeconfig文件或者token的方式。
- **准入控制**：相当于识别门禁卡的设备，一旦识别后，就可以对K8S集群资源进行访问。

K8S的授权(Authorization)框架:

- **角色**：本质上就是对哪些资源授权，识别门禁卡的设备，体现的是"我能干啥？"
  - **Role**：用于控制局部资源的角色。
  - **ClusterRole**：用于控制全局(集群)资源的角色。
  - 规则：`apiGroups`（资源所属的api组）、`resources`（资源列表）、`verbs`（可以对资源做哪些操作，如增删改查）。

- **主题**：指定用户类型，相当于门禁卡，体现的是"我是谁？"
  - **User**：用户，一般给个人使用。体现形式为证书的"CN"字段，证书可基于kubeconfig文件存储。
  - **ServiceAccount**：服务账号，数据以"Token"形式体现。
  - **Group**：组，一般给一个组织使用。体现形式为证书的"O"字段。

- **角色绑定**：将"角色"和"主题"进行关联，将角色权限授权给主题。
  - **RoleBinding**：将局部资源的角色权限绑定给一个主题。
  - **ClusterRoleBinding**：将控制全局资源的角色绑定给一个主题。

---

## 二、K8S内置集群角色

K8S预定义好了四个集群角色供用户使用：

- **cluster-admin**：超级管理员，有集群所有权限
- **admin**：主要用于授权命名空间所有读写权限
- **edit**：允许对大多数对象读写操作，不允许查看或修改角色、角色绑定
- **view**：允许对命名空间大多数对象只读权限，不允许查看角色、角色绑定和secret

使用 `kubectl get clusterrole` 查看，其中 `system:` 开头的为系统内部使用

```bash
root@master:~# kubectl get clusterroles | grep -v system:
NAME                                                                   CREATED AT
admin                                                                  2026-10-30T04:54:12Z
cluster-admin                                                          2026-10-30T04:54:12Z
edit                                                                   2026-10-30T04:54:12Z
flannel                                                                2026-10-30T04:58:58Z
kubeadm:get-nodes                                                      2026-10-30T04:54:14Z
view                                                                   2026-10-30T04:54:12Z
root@master:~#
```

其中，`flannel` 是 CNI 组件安装时创建的集群角色，`kubeadm:get-nodes` 是基于 kubeadm 方式安装时创建的集群角色

### 查看 cluster-admin 角色权限

```bash
root@master:~# kubectl get clusterroles cluster-admin -o yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  annotations:
    rbac.authorization.kubernetes.io/autoupdate: "true"
  creationTimestamp: "2026-10-30T04:54:12Z"
  labels:
    kubernetes.io/bootstrapping: rbac-defaults
  name: cluster-admin
  resourceVersion: "87"
  uid: 5ad64683-6c7d-403b-80be-f2bb828ae7a9
rules:
- apiGroups:
  - '*'
  resources:
  - '*'
  verbs:
  - '*'
- nonResourceURLs:
  - '*'
  verbs:
  - '*'
```

### 查看 admin 角色权限

```bash
root@master:~# kubectl get clusterroles admin -o yaml
aggregationRule:
  clusterRoleSelectors:
  - matchLabels:
      rbac.authorization.k8s.io/aggregate-to-admin: "true"
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  annotations:
    rbac.authorization.kubernetes.io/autoupdate: "true"
  creationTimestamp: "2026-10-30T04:54:12Z"
  labels:
    kubernetes.io/bootstrapping: rbac-defaults
  name: admin
  resourceVersion: "352145"
  uid: 62fea99a-a48b-4d58-8df5-a86bc1aa26bf
rules:
- apiGroups:
  - ""
  resources:
  - pods/attach
  - pods/exec
  - pods/portforward
  - pods/proxy
  - secrets
  - services/proxy
  verbs:
  - get
  - list
  - watch
- apiGroups:
  - ""
  resources:
  - serviceaccounts
  verbs:
  - impersonate
# ...
- apiGroups:
  - rbac.authorization.k8s.io
  resources:
  - rolebindings
  - roles
  verbs:
  - create
  - delete
  - deletecollection
  - get
  - list
  - patch
  - update
  - watch
```

---

## 三、基于用户(User)授权案例

### 1. 安装证书管理工具 cfssl

#### 1.1 下载 cfssl 软件包

```bash
root@master:~# cd /tmp
root@master:/tmp# curl -sL -o cfssl https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssljson https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssljson_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssl-certinfo https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl-certinfo_1.6.5_linux_amd64
```

#### 1.2 安装 cfssl 工具

```bash
root@master:/tmp# mv cfssl cfssljson cfssl-certinfo /usr/local/bin/
root@master:/tmp# chmod +x /usr/local/bin/cfssl*
root@master:/tmp# ll /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root 11890840 Nov  3 11:01 /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root  8413336 Nov  3 11:01 /usr/local/bin/cfssl-certinfo*
-rwxr-xr-x 1 root root  6205592 Nov  3 11:01 /usr/local/bin/cfssljson*
```

#### 1.3 验证 cfssl 工具是否安装成功

```bash
root@master:/tmp# cfssl version
Version: 1.6.5
Runtime: go1.22.0
```

### 2. 编写证书请求

#### 2.1 创建工作目录

```bash
root@master:~# mkdir -p /dawn/manifests/rbac/user
root@master:~# cd /dawn/manifests/rbac/user
root@master:user# pwd
/dawn/manifests/rbac/user
root@master:user# ll
total 8
drwxr-xr-x 2 root root 4096 Nov  3 11:02 ./
drwxr-xr-x 3 root root 4096 Nov  3 11:02 ../
```

#### 2.2 设置证书有效期（10年 = 87600h）

```bash
root@master:user# cat > ca-config.json <<EOF
{
  "signing": {
    "default": {
      "expiry": "87600h"
    },
    "profiles": {
      "kubernetes": {
        "usages": [
            "signing",
            "key encipherment",
            "server auth",
            "client auth"
        ],
        "expiry": "87600h"
      }
    }
  }
}
EOF
```

#### 2.3 配置证书签发请求（CN字段是用户名）

```bash
root@master:user# cat > dawn-csr.json <<EOF
{
  "CN": "dawn",
  "hosts": [],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "BeiJing",
      "L": "BeiJing",
      "O": "k8s",
      "OU": "System"
    }
  ]
}
EOF
```

### 3. 生成证书

#### 3.1 使用 API Server 的 CA 证书进行签发

```bash
root@master:user# ll
total 16
drwxr-xr-x 2 root root 4096 Nov  3 11:02 ./
drwxr-xr-x 3 root root 4096 Nov  3 11:02 ../
-rw-r--r-- 1 root root  292 Nov  3 11:02 ca-config.json
-rw-r--r-- 1 root root  222 Nov  3 11:02 dawn-csr.json
root@master:user# cfssl gencert -ca=/etc/kubernetes/pki/ca.crt -ca-key=/etc/kubernetes/pki/ca.key -config=ca-config.json -profile=kubernetes dawn-csr.json | cfssljson -bare dawn
2026/11/03 11:02:04 [INFO] generate received request
2026/11/03 11:02:04 [INFO] received CSR
2026/11/03 11:02:04 [INFO] generating key: rsa-2048
2026/11/03 11:02:04 [INFO] encoded CSR
2026/11/03 11:02:04 [INFO] signed certificate with serial number 479958042590989071071217058570354310720529671886
root@master:user# ll
total 28
drwxr-xr-x 2 root root 4096 Nov  3 11:02 ./
drwxr-xr-x 3 root root 4096 Nov  3 11:02 ../
-rw-r--r-- 1 root root  292 Nov  3 11:02 ca-config.json
-rw-r--r-- 1 root root 1001 Nov  3 11:02 dawn.csr
-rw-r--r-- 1 root root  222 Nov  3 11:02 dawn-csr.json
-rw------- 1 root root 1679 Nov  3 11:02 dawn-key.pem
-rw-r--r-- 1 root root 1281 Nov  3 11:02 dawn.pem
```

#### 3.2 查看证书的详细信息

```bash
root@master:user# cfssl-certinfo -cert dawn.pem
{
  "subject": {
    "common_name": "dawn",
    "country": "CN",
    "organization": "k8s",
    "organizational_unit": "System",
    "locality": "BeiJing",
    "province": "BeiJing",
    "names": [
      "CN",
      "BeiJing",
      "BeiJing",
      "k8s",
      "System",
      "dawn"
    ]
  },
  "issuer": {
    "common_name": "kubernetes",
    "names": [
      "kubernetes"
    ]
  },
  "serial_number": "479958042590989071071217058570354310720529671886",
  "not_before": "2026-11-03T02:02:00Z",
  "not_after": "2036-10-31T02:02:00Z",
  "sigalg": "SHA256WithRSA",
  ...
}
```

`common_name` = "dawn" 是用户名(CN)，`organization` = "k8s" 是组名(O)

### 4. 生成 kubeconfig 授权文件

#### 4.1 编写生成 kubeconfig 文件的脚本

```bash
root@master:user# cat > kubeconfig.sh <<'EOF'
kubectl config set-cluster dawn-k8s \
  --certificate-authority=/etc/kubernetes/pki/ca.crt \
  --embed-certs=true \
  --server=https://11.0.1.231:6443 \
  --kubeconfig=dawn-k8s.kubeconfig

kubectl config set-credentials k8s \
  --client-key=dawn-key.pem \
  --client-certificate=dawn.pem \
  --embed-certs=true \
  --kubeconfig=dawn-k8s.kubeconfig

kubectl config set-context xixi \
  --cluster=dawn-k8s \
  --user=k8s \
  --kubeconfig=dawn-k8s.kubeconfig

kubectl config use-context xixi --kubeconfig=dawn-k8s.kubeconfig
EOF
```

#### 4.2 生成 kubeconfig 文件

```bash
root@master:user# bash kubeconfig.sh
Cluster "dawn-k8s" set.
User "k8s" set.
Context "xixi" created.
Switched to context "xixi".
```

#### 4.3 验证权限（未授权前应被拒绝）

```bash
root@master:user# kubectl get pods --kubeconfig=dawn-k8s.kubeconfig
Error from server (Forbidden): pods is forbidden: User "dawn" cannot list resource "pods" in API group "" in the namespace "default"
```

此时会发现 dawn 用户没有访问权限，因为还没有授权

### 5. 创建 RBAC 授权策略

#### 5.1 创建 rbac.yaml 配置文件

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: default
  name: dawn-custom-role
rules:
- apiGroups: ["","apps"]
  resources: ["pods","deployments"]
  verbs: ["get", "list"]
- apiGroups: ["","apps"]
  resources: ["daemonsets"]
  verbs: ["get", "list","delete"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dawn-linux-rbac
  namespace: default
subjects:
- kind: User
  name: dawn
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: dawn-custom-role
  apiGroup: rbac.authorization.k8s.io
```

#### 5.2 应用 RBAC 授权

```bash
root@master:user# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role created
rolebinding.rbac.authorization.k8s.io/dawn-linux-rbac created
```

#### 5.3 测试验证

首先创建一个测试 deployment：

```bash
root@master:user# kubectl create deploy nginx-test --image=nginx:alpine --replicas=2 -n default
deployment.apps/nginx-test created
```

测试授权后的权限：

```bash
root@master:user# kubectl get pods --kubeconfig=dawn-k8s.kubeconfig
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          55s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          55s

root@master:user# kubectl get deploy --kubeconfig=dawn-k8s.kubeconfig
NAME         READY   UP-TO-DATE   AVAILABLE   AGE
nginx-test   2/2     2            2           55s

root@master:user# kubectl get deploy --kubeconfig=dawn-k8s.kubeconfig -n default
NAME         READY   UP-TO-DATE   AVAILABLE   AGE
nginx-test   2/2     2            2           55s

root@master:user# kubectl get ds --kubeconfig=dawn-k8s.kubeconfig
No resources found in default namespace.

root@master:user# kubectl delete pod --kubeconfig=dawn-k8s.kubeconfig nginx-test-7fd5f9d864-6fmhf
Error from server (Forbidden): pods "nginx-test-7fd5f9d864-6fmhf" is forbidden: User "dawn" cannot delete resource "pods" in API group "" in the namespace "default"

root@master:user# kubectl get pods --kubeconfig=dawn-k8s.kubeconfig -n kube-system
Error from server (Forbidden): pods is forbidden: User "dawn" cannot list resource "pods" in API group "" in the namespace "kube-system"
```

Role 角色只能针对某个名称空间的资源进行授权

未授权的资源无法访问（delete pod 被拒绝）

未授权的命名空间无法访问（kube-system 被拒绝）

---

## 四、验证 `~/.kube/config` 文件基于 Group 类型授权

### 1. 导入 kubeconfig 的证书文件

```bash
root@master:~# cat /root/.kube/config | grep client-certificate-data | awk '{print $2}' | base64 -d > /tmp/admin.kubeconfig
```

### 2. 查看证书的详细信息

```bash
root@master:~# cfssl-certinfo -cert /tmp/admin.kubeconfig
{
  "subject": {
    "common_name": "kubernetes-admin",
    "organization": "system:masters",
    "names": [
      "system:masters",
      "kubernetes-admin"
    ]
  },
  ...
}
```

 `organization` 字段，表示组织的意思，意味着该用户（`kubernetes-admin`）属于 `system:masters` 组

### 3. 查看集群角色绑定

```bash
root@master:~# kubectl get clusterrolebindings cluster-admin -o yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  annotations:
    rbac.authorization.kubernetes.io/autoupdate: "true"
  creationTimestamp: "2026-10-30T04:54:13Z"
  labels:
    kubernetes.io/bootstrapping: rbac-defaults
  name: cluster-admin
  resourceVersion: "149"
  uid: 62229eee-1d2f-48ac-b83e-536ddcb3ef8e
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: Group
  name: system:masters
```

`kubernetes-admin` 用户属于 `system:masters` 组，`cluster-admin` ClusterRole 通过 ClusterRoleBinding 绑定到了 `system:masters` 组，因此管理员拥有集群所有权限

---

## 五、加载 kubeconfig 配置文件的四种方法

### 方法1：基于 `--kubeconfig` 选项指定

```bash
root@worker01:~# kubectl get pods --kubeconfig=/root/dawn-k8s.kubeconfig
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          89s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          89s
```

### 方法2：将 kubeconfig 存放到 `~/.kube/config`

```bash
root@worker01:~# mkdir -p ~/.kube
root@worker01:~# cp /root/dawn-k8s.kubeconfig ~/.kube/config
root@worker01:~# kubectl get pods
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          106s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          106s
root@worker01:~# rm -f ~/.kube/config
```

### 方法3：声明 KUBECONFIG 环境变量

```bash
root@worker01:~# export KUBECONFIG=/root/dawn-k8s.kubeconfig
root@worker01:~# kubectl get pods
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          106s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          106s
root@worker01:~# echo $KUBECONFIG
/root/dawn-k8s.kubeconfig
root@worker01:~# unset KUBECONFIG
root@worker01:~# echo $KUBECONFIG
```

### 方法4：使用别名（alias）

```bash
root@worker02:~# vim ~/.bashrc
...
alias kubectl='kubectl --kubeconfig=/root/dawn-k8s.kubeconfig'
...
root@worker02:~# source ~/.bashrc
root@worker02:~# kubectl get pods
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          2m
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          2m
```

---

## 六、基于用户组(Group)授权案例

RBAC 基于组的方式认证：

- **CN**：代表用户名，如 `xiaoming`
- **O**：代表用户组，如 `k8s` 组

用户组的好处是无需单独为某个用户创建权限，统一为这个组名授权，所有用户都以组的身份访问资源。

**注**：

1. API Server 会优先校验用户名(CN字段)，若用户名没有对应权限，则再去校验用户组(O)的权限；

2. 用户、用户组都是提取证书中的一个字段，不是在集群中创建的。

### 1. 将 xiaoming 用户添加到 k8s 组

#### 1.1 编写证书请求

```bash
root@master:group# pwd
/dawn/manifests/rbac/group
root@master:group# cat > ca-config.json <<EOF
{
  "signing": {
    "default": {
      "expiry": "87600h"
    },
    "profiles": {
      "kubernetes": {
        "usages": [
            "signing",
            "key encipherment",
            "server auth",
            "client auth"
        ],
        "expiry": "87600h"
      }
    }
  }
}
EOF
```

```bash
root@master:group# cat > xiaoming-csr.json <<EOF
{
  "CN": "xiaoming",
  "hosts": [],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "BeiJing",
      "L": "BeiJing",
      "O": "k8s",
      "OU": "System"
    }
  ]
}
EOF
```

#### 1.2 使用 K8S CA 签发客户端证书

```bash
root@master:group# cfssl gencert -ca=/etc/kubernetes/pki/ca.crt -ca-key=/etc/kubernetes/pki/ca.key -config=ca-config.json -profile=kubernetes xiaoming-csr.json | cfssljson -bare k8s
root@master:group# ll
total 28
drwxr-xr-x 2 root root 4096 Nov  3 11:05 ./
drwxr-xr-x 4 root root 4096 Nov  3 11:05 ../
-rw-r--r-- 1 root root  292 Nov  3 11:05 ca-config.json
-rw-r--r-- 1 root root  227 Nov  3 11:05 xiaoming-csr.json
-rw-r--r-- 1 root root 1005 Nov  3 11:05 k8s.csr
-rw------- 1 root root 1675 Nov  3 11:05 k8s-key.pem
-rw-r--r-- 1 root root 1289 Nov  3 11:05 k8s.pem
```

### 2. 生成 kubeconfig 授权文件

```bash
root@master:group# kubectl config set-cluster k8s-cluster \
  --certificate-authority=/etc/kubernetes/pki/ca.crt \
  --embed-certs=true \
  --server=https://11.0.1.231:6443 \
  --kubeconfig=dawn-k8s-groups.kubeconfig

root@master:group# kubectl config set-credentials xiaoming \
  --client-key=k8s-key.pem \
  --client-certificate=k8s.pem \
  --embed-certs=true \
  --kubeconfig=dawn-k8s-groups.kubeconfig

root@master:group# kubectl config set-context haha \
  --cluster=k8s-cluster \
  --user=xiaoming \
  --kubeconfig=dawn-k8s-groups.kubeconfig

root@master:group# kubectl config use-context haha --kubeconfig=dawn-k8s-groups.kubeconfig
```

### 3. 访问测试（未授权前应被拒绝）

```bash
root@master:group# kubectl get pods --kubeconfig=dawn-k8s-groups.kubeconfig -n kube-system
Error from server (Forbidden): pods is forbidden: User "xiaoming" cannot list resource "pods" in API group "" in the namespace "kube-system"
```

### 4. 创建 RBAC 授权策略

```bash
root@master:group# cat rbac.yaml
```

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: kube-system
  name: dawn-custom-role-reader
rules:
- apiGroups: ["","apps"]
  resources: ["pods","nodes","services","deployments"]
  verbs: ["get", "watch", "list"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dawn-group-rolebinding
  namespace: kube-system
subjects:
- kind: Group
  name: k8s
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: dawn-custom-role-reader
  apiGroup: rbac.authorization.k8s.io
```

`subjects.kind` = `Group`，`subjects.name` = `k8s`（对应证书中的 O 字段）

```bash
root@master:group# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role-reader created
rolebinding.rbac.authorization.k8s.io/dawn-group-rolebinding created
```

### 5. 再次访问测试

```bash
root@master:group# kubectl get pods --kubeconfig=dawn-k8s-groups.kubeconfig -n kube-system
NAME                             READY   STATUS    RESTARTS       AGE
coredns-6d8c4cb4d-qkn74          1/1     Running   8 (25m ago)    3d22h
coredns-6d8c4cb4d-vxxvm          1/1     Running   7 (25m ago)    3d22h
etcd-master                      1/1     Running   6 (25m ago)    3d22h
kube-apiserver-master            1/1     Running   3 (25m ago)    39h
kube-controller-manager-master   1/1     Running   20 (25m ago)   3d22h
kube-proxy-j7js7                 1/1     Running   2 (25m ago)    41h
kube-proxy-lsxcn                 1/1     Running   2 (24m ago)    41h
kube-proxy-mzbpc                 1/1     Running   2 (25m ago)    41h
kube-scheduler-master            1/1     Running   18 (25m ago)   3d22h

root@master:group# kubectl get pods --kubeconfig=dawn-k8s-groups.kubeconfig -n default
Error from server (Forbidden): pods is forbidden: User "xiaoming" cannot list resource "pods" in API group "" in the namespace "default"

root@master:group# kubectl get nodes --kubeconfig=dawn-k8s-groups.kubeconfig
Error from server (Forbidden): nodes is forbidden: User "xiaoming" cannot list resource "nodes" in API group "" at the cluster scope
```

xiaoming 用户属于 k8s 组，通过 Group RoleBinding 获得了 kube-system 命名空间的只读权限；

未绑定的命名空间（default）无权访问；

集群级别的资源（nodes）无权访问（Role 只能控制命名空间级别的资源）。

## RBAC 核心要点

1. **Role** 用于命名空间级别的权限控制，**ClusterRole** 用于集群级别的权限控制
2. **RoleBinding / ClusterRoleBinding** 分别将角色绑定到命名空间或集群级别
3. 授权时，API Server 先匹配用户名(CN)，再匹配组名(O)
4. cert 中的 CN 和 O 字段不是集群中创建的资源，而是从客户端证书中提取的
5. 内置角色 cluster-admin、admin、edit、view 可以直接使用，无需重复创建
