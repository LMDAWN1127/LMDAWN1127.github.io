---
title: "K8S Security Framework and RBAC in Action: Fine-Grained User & Group Access Control with CFSSL Certificates"
date: 2026-11-03T13:10:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "RBAC", "CFSSL", "Security"]
showToc: true
summary: "A comprehensive guide to the Kubernetes security framework (Authentication, Authorization, Admission Control) and RBAC core model: hands-on demonstration of issuing certificates for Users and Groups using CFSSL, scripting kubeconfig generation, and configuring Role/ClusterRole bindings with boundary validation."
---

# K8S Security Framework and RBAC in Action: Fine-Grained User & Group Access Control with CFSSL Certificates

---

## 1. Kubernetes Security Framework Overview

Designed to provide authorization and privilege delegation for Kubernetes users.

Certificate-based authentication against the Kubernetes API Server operates in three phases:

- **Authentication**: Equivalent to an "entry pass" for a gated residential community, allowing security guards at the gate to identify who you are.
- **Authorization**: Equivalent to a "key fob" needed to enter an apartment building. In Kubernetes, this key fob is implemented via a `kubeconfig` file or a Bearer Token.
- **Admission Control**: Equivalent to the card-reading device that scans the key fob. Once validated, access to cluster resources is granted.

The Kubernetes Authorization (RBAC) Framework:

- **Roles**: Specify what resources are permitted (the capabilities granted by the key fob device) — answering *"What can I do?"*
  - **Role**: Scoped to namespace-level resources.
  - **ClusterRole**: Scoped to cluster-wide resources.
  - Rules: `apiGroups` (target API groups), `resources` (target resources), and `verbs` (permitted actions, e.g., get, list, watch, create, update, delete).

- **Subjects**: Specify the identity types (the key fob itself) — answering *"Who am I?"*
  - **User**: Represents individual human users. Identified by the certificate’s `CN` (Common Name) field, typically stored within a `kubeconfig` file.
  - **ServiceAccount**: Service account for automated processes/pods inside the cluster, authenticated via Secrets containing Tokens.
  - **Group**: Represents an organization or team. Identified by the certificate’s `O` (Organization) field, also configurable in a `kubeconfig`.

- **Role Bindings**: Connect a "Role" with "Subjects" to grant the specified privileges:
  - **RoleBinding**: Binds a Role (or ClusterRole) to subjects within a specific namespace.
  - **ClusterRoleBinding**: Binds a ClusterRole to subjects across the entire cluster.

---

## 2. Kubernetes Built-in ClusterRoles

Kubernetes provides four built-in cluster roles ready for direct use:

- **cluster-admin**: Superuser with complete control over all resources in the cluster.
- **admin**: Grants read-write access to most resources within a specific namespace.
- **edit**: Allows read-write access to most workload objects; restricts viewing or modifying roles and role bindings.
- **view**: Grants read-only access to most objects in a namespace; restricts viewing roles, role bindings, and secrets.

View all cluster roles using `kubectl get clusterrole`, where roles prefixed with `system:` are reserved for internal Kubernetes components:

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

Among these, `flannel` is created during CNI plugin installation, and `kubeadm:get-nodes` is provisioned during cluster bootstrapping with kubeadm.

### Inspecting cluster-admin Permissions

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

### Inspecting admin Permissions

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

## 3. User-Based Authorization Hands-On

### 1. Install CFSSL Certificate Management Tools

#### 1.1 Download CFSSL Binaries

```bash
root@master:~# cd /tmp
root@master:/tmp# curl -sL -o cfssl https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssljson https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssljson_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssl-certinfo https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl-certinfo_1.6.5_linux_amd64
```

#### 1.2 Install CFSSL Binaries

```bash
root@master:/tmp# mv cfssl cfssljson cfssl-certinfo /usr/local/bin/
root@master:/tmp# chmod +x /usr/local/bin/cfssl*
root@master:/tmp# ll /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root 11890840 Nov  3 11:01 /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root  8413336 Nov  3 11:01 /usr/local/bin/cfssl-certinfo*
-rwxr-xr-x 1 root root  6205592 Nov  3 11:01 /usr/local/bin/cfssljson*
```

#### 1.3 Verify CFSSL Installation

```bash
root@master:/tmp# cfssl version
Version: 1.6.5
Runtime: go1.22.0
```

### 2. Prepare Certificate Signing Request (CSR)

#### 2.1 Create Working Directory

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

#### 2.2 Configure Certificate Validity (10 Years = 87600h)

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

#### 2.3 Configure CSR Profile (CN Field Represents the Username)

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

### 3. Issue Certificates

#### 3.1 Sign Certificate with Kubernetes API Server CA

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

#### 3.2 Inspect Certificate Metadata

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

Notice that `common_name` = "dawn" is the username (CN), and `organization` = "k8s" is the group name (O).

### 4. Generate kubeconfig Configuration File

#### 4.1 Write kubeconfig Generation Script

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

#### 4.2 Execute Script to Generate kubeconfig

```bash
root@master:user# bash kubeconfig.sh
Cluster "dawn-k8s" set.
User "k8s" set.
Context "xixi" created.
Switched to context "xixi".
```

#### 4.3 Verify Permissions (Access Denied Prior to Authorization)

```bash
root@master:user# kubectl get pods --kubeconfig=dawn-k8s.kubeconfig
Error from server (Forbidden): pods is forbidden: User "dawn" cannot list resource "pods" in API group "" in the namespace "default"
```

The user `dawn` is rejected with `Forbidden` because RBAC authorization has not yet been applied.

### 5. Create RBAC Authorization Policy

#### 5.1 Define rbac.yaml Manifest

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

#### 5.2 Apply RBAC Policy

```bash
root@master:user# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role created
rolebinding.rbac.authorization.k8s.io/dawn-linux-rbac created
```

#### 5.3 Test and Verify Permissions

First, create a test deployment:

```bash
root@master:user# kubectl create deploy nginx-test --image=nginx:alpine --replicas=2 -n default
deployment.apps/nginx-test created
```

Verify permissions using the custom kubeconfig:

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

Observations:
- A `Role` only grants access to resources within the bound namespace.
- Unpermitted verbs are rejected (e.g., `delete pod` is forbidden).
- Unbound namespaces cannot be accessed (e.g., `kube-system` queries are denied).

---

## 4. Validating Group-Based Authorization in `~/.kube/config`

### 1. Extract Certificate from kubeconfig

```bash
root@master:~# cat /root/.kube/config | grep client-certificate-data | awk '{print $2}' | base64 -d > /tmp/admin.kubeconfig
```

### 2. Inspect Certificate Metadata

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

The `organization` field represents the organization/group name, indicating that `kubernetes-admin` belongs to the `system:masters` group.

### 3. Inspect ClusterRoleBinding

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

The `kubernetes-admin` user belongs to the `system:masters` group. The `cluster-admin` ClusterRole is bound to `system:masters` via `ClusterRoleBinding`, granting cluster administrators full cluster access.

---

## 5. Four Ways to Load kubeconfig Configuration Files

### Method 1: Using the `--kubeconfig` CLI Flag

```bash
root@worker01:~# kubectl get pods --kubeconfig=/root/dawn-k8s.kubeconfig
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          89s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          89s
```

### Method 2: Placing Configuration in `~/.kube/config`

```bash
root@worker01:~# mkdir -p ~/.kube
root@worker01:~# cp /root/dawn-k8s.kubeconfig ~/.kube/config
root@worker01:~# kubectl get pods
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          106s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          106s
root@worker01:~# rm -f ~/.kube/config
```

### Method 3: Declaring the `KUBECONFIG` Environment Variable

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

### Method 4: Configuring a Shell Alias

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

## 6. Group-Based Authorization Hands-On

RBAC group-based authentication mechanism:

- **CN**: Identifies the username, e.g., `xiaoming`.
- **O**: Identifies the user group, e.g., `k8s`.

The advantage of using groups is that permissions do not need to be individually created for each user; authorizations are granted to the group, and all members inherit access automatically.

**Notes**:
1. The API Server checks the username (`CN`) first; if no matching permissions exist, it evaluates the user group (`O`) permissions.
2. Users and groups are attributes extracted from the client certificate; they are not resources created inside the Kubernetes cluster.

### 1. Adding `xiaoming` to the `k8s` Group

#### 1.1 Prepare Certificate Signing Request

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

#### 1.2 Sign Client Certificate with Kubernetes CA

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

### 2. Generate kubeconfig Configuration File

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

### 3. Verify Access (Access Denied Prior to Authorization)

```bash
root@master:group# kubectl get pods --kubeconfig=dawn-k8s-groups.kubeconfig -n kube-system
Error from server (Forbidden): pods is forbidden: User "xiaoming" cannot list resource "pods" in API group "" in the namespace "kube-system"
```

### 4. Create RBAC Authorization Policy

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

Here `subjects.kind` = `Group`, and `subjects.name` = `k8s` (matching the `O` field in the certificate).

```bash
root@master:group# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role-reader created
rolebinding.rbac.authorization.k8s.io/dawn-group-rolebinding created
```

### 5. Retest Access

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

Observations:
- The user `xiaoming` belongs to the `k8s` group and gains read-only access to the `kube-system` namespace via the Group RoleBinding.
- Unbound namespaces (`default`) remain inaccessible.
- Cluster-scoped resources (`nodes`) cannot be accessed (a `Role` only governs namespace-scoped resources).

## RBAC Key Takeaways

1. **Role** applies to namespace-level permissions, while **ClusterRole** applies to cluster-wide permissions.
2. **RoleBinding / ClusterRoleBinding** bind roles to subjects at the namespace or cluster level respectively.
3. During authorization evaluation, the API Server matches the username (`CN`) first, followed by the group name (`O`).
4. The `CN` and `O` fields in certificates are not cluster resources; they are extracted from the client certificate.
5. Built-in roles (`cluster-admin`, `admin`, `edit`, `view`) are readily available and do not require recreation.
