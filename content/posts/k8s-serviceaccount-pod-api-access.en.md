---
title: "K8S ServiceAccount in Action: Authorizing in-Pod Python Applications to Securely Access APIServer"
date: 2026-11-03T13:40:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ServiceAccount", "RBAC", "Python"]
showToc: true
summary: "An in-depth exploration of Kubernetes ServiceAccount management across imperative and declarative paradigms. Hands-on demonstration of containerized Python applications calling the Kubernetes APIServer via in-pod SA Tokens, combined with complete RBAC chain severance verification."
---

# K8S ServiceAccount in Action: Authorizing in-Pod Python Applications to Securely Access APIServer

---

## 1. Imperative Management of ServiceAccount

Imperative SA management: Directly executing `kubectl create/delete` commands.

### 1. Create a ServiceAccount

```bash
root@master:sa# kubectl create sa dawn
serviceaccount/dawn created
```

### 2. Inspect the ServiceAccount

```bash
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
dawn      1         0s
default   1         4d
```

### 3. Delete the ServiceAccount

```bash
root@master:sa# kubectl delete sa dawn
serviceaccount "dawn" deleted
root@master:sa#
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
default   1         4d
```

---

## 2. Declarative Management of ServiceAccount

Declarative SA management: Managing SA manifests via YAML using `kubectl apply/delete -f`.

### 1. Write the ServiceAccount YAML Manifest

```bash
root@master:sa# cat 01-sa.yaml
```

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dawn
  namespace: default
```

### 2. Apply and Verify the ServiceAccount

```bash
root@master:sa# kubectl apply -f 01-sa.yaml
serviceaccount/dawn created
root@master:sa#
root@master:sa# kubectl get -f 01-sa.yaml
NAME   SECRETS   AGE
dawn   1         1s
```

### 3. Delete the ServiceAccount via YAML

```bash
root@master:sa# kubectl delete -f 01-sa.yaml
serviceaccount "dawn" deleted
```

---

## 3. Authorizing in-Pod Python Applications to Access Kubernetes API

### Architecture & Principles

Running a Python script inside a Pod to interact with the Kubernetes API using the mounted ServiceAccount Token. The RBAC authorization chain:

```
Role (defines permissions) → RoleBinding (binds SA) → ServiceAccount (used by Pod) → Python App (presents Token)
```

Authorization workflow:

1. Create a Role (defines permitted actions on specific resources).
2. Create a ServiceAccount.
3. Bind the ServiceAccount to the Role via a RoleBinding.
4. Specify the custom SA for the Pod (`serviceAccountName`).
5. Execute the Python script inside the container to test API permissions.

### 1. Create the ServiceAccount

```bash
root@master:sa# cat 01-sa.yaml
```

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dawn-python
  namespace: default
```

```bash
root@master:sa# kubectl apply -f 01-sa.yaml
serviceaccount/dawn-python created
```

### 2. Create the Role

```bash
root@master:sa# cat 02-Role.yaml
```

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: dawn-pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
```

```bash
root@master:sa# kubectl apply -f 02-Role.yaml
role.rbac.authorization.k8s.io/dawn-pod-reader created
```

This Role grants only `get/watch/list` verbs on `pods` resources, strictly excluding `deployments` or other API objects.

### 3. Create the RoleBinding

```bash
root@master:sa# cat 03-RoleBinding.yaml
```

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dawn-sa-to-role
subjects:
- kind: ServiceAccount
  name: dawn-python
roleRef:
  kind: Role
  name: dawn-pod-reader
  apiGroup: rbac.authorization.k8s.io
```

```bash
root@master:sa# kubectl apply -f 03-RoleBinding.yaml
rolebinding.rbac.authorization.k8s.io/dawn-sa-to-role created
```

Here `subjects.kind` = `ServiceAccount` and `subjects.name` = `dawn-python`, associating the ServiceAccount with the Role.

### 4. Deploy the Python Pod

```bash
root@master:sa# cat 04-deploy-python.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dawn-deploy-python-sa
spec:
  replicas: 2
  selector:
    matchLabels:
      apps: python
  template:
    metadata:
      labels:
        apps: python
    spec:
      # Specify the SA bound to the permitted Role via RoleBinding
      serviceAccountName: dawn-python
      containers:
      - image: 11.0.1.250/dawn-troubleshooting/python:3.9.16-alpine3.16
        name: py
        command:
        - tail
        - -f
        - /etc/hosts
```

```bash
root@master:sa# kubectl apply -f 04-deploy-python.yaml
deployment.apps/dawn-deploy-python-sa created
```

### 5. Inspect Pod Status

```bash
root@master:sa# kubectl get pods -l apps=python -o wide
NAME                                   READY   STATUS    RESTARTS   AGE   IP             NODE       NOMINATED NODE   READINESS GATES
dawn-deploy-python-sa-bdb546d9-g85zf   1/1     Running   0          88s   10.100.1.49    worker01   <none>           <none>
dawn-deploy-python-sa-bdb546d9-w4dpf   1/1     Running   0          88s   10.100.2.250   worker02   <none>           <none>
```

### 6. Enter Container, Install Dependencies, and Write Test Script

```bash
root@master:sa# kubectl exec -it dawn-deploy-python-sa-bdb546d9-g85zf -- sh
/ # python --version
Python 3.9.16
/ #
/ # pip install kubernetes
Collecting kubernetes
  Downloading kubernetes-35.0.0-py2.py3-none-any.whl (2.0 MB)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2.0/2.0 MB 1.2 MB/s
...
Successfully installed kubernetes-35.0.0 ...
/ #
```

Write the Python test script `view-k8s-resources.py`:

```python
from kubernetes import client, config

with open('/var/run/secrets/kubernetes.io/serviceaccount/token') as f:
    token = f.read()

configuration = client.Configuration()
configuration.host = "https://kubernetes"  # APISERVER地址
configuration.ssl_ca_cert = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"  # CA证书
configuration.verify_ssl = True   # 启用证书验证
configuration.api_key = {"authorization": "Bearer " + token}  # 指定Token字符串
client.Configuration.set_default(configuration)
apps_api = client.AppsV1Api()
core_api = client.CoreV1Api()
try:
    print("###### Deployment列表 ######")
    # 列出default命名空间所有deployment名称
    for dp in apps_api.list_namespaced_deployment("default").items:
        print(dp.metadata.name)
except:
    print("没有权限访问Deployment资源！")

try:
    # 列出default命名空间所有pod名称
    print("###### Pod列表 ######")
    for po in core_api.list_namespaced_pod("default").items:
        print(po.metadata.name)
except:
    print("没有权限访问Pod资源！")
```

### 7. Run Test (With RBAC Authorization)

```bash
/ # python3 view-k8s-resources.py

###### Deployment列表 ######

没有权限访问Deployment资源！

###### Pod列表 ######

dawn-deploy-python-sa-bdb546d9-g85zf
dawn-deploy-python-sa-bdb546d9-w4dpf
nginx-test-7fd5f9d864-6fmhf
nginx-test-7fd5f9d864-pm8nh
/ #
```

Because Role `dawn-pod-reader` only authorizes `get/watch/list` on `pods`:
- The Pod list is retrieved successfully.
- The Deployment list request is denied (unauthorized resource).

### 8. Delete the RoleBinding

```bash
root@master:sa# kubectl delete -f 03-RoleBinding.yaml
rolebinding.rbac.authorization.k8s.io "dawn-sa-to-role" deleted
```

### 9. Retest Access (Without RBAC Authorization)

```bash
/ # python3 view-k8s-resources.py

###### Deployment列表 ######

没有权限访问Deployment资源！

###### Pod列表 ######

没有权限访问Pod资源！
/ #
```

Upon deleting the RoleBinding, the SA `dawn-python` forfeits all privileges, causing both Pod and Deployment access to be denied. This proves the full RBAC chain: **SA → RoleBinding → Role → Resource Privileges** — breaking any single link immediately revokes access.
