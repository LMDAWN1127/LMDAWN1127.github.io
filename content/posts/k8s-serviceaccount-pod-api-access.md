---
title: "K8S ServiceAccount 深度实战：授权容器内 Python 程序安全访问 APIServer"
date: 2026-11-03T13:40:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ServiceAccount", "RBAC", "Python"]
showToc: true
summary: "深入剖析 Kubernetes 服务账号 ServiceAccount 的响应式与声明式生命周期管理，并通过在 Pod 内自动挂载 SA Token，使用 Python 客户端实战演示容器应用如何安全合规地调用 APIServer，以及 RBAC 权限断开失效的边界防护验证。"
---

# K8S ServiceAccount 深度实战：授权容器内 Python 程序安全访问 APIServer

---

## 一、响应式管理 ServiceAccount

命令式（imperative）方式管理 SA：直接使用 `kubectl create/delete` 命令

### 1. 创建 SA

```bash
root@master:sa# kubectl create sa dawn
serviceaccount/dawn created
```

### 2. 查看 SA

```bash
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
dawn      1         0s
default   1         4d
```

### 3. 删除 SA

```bash
root@master:sa# kubectl delete sa dawn
serviceaccount "dawn" deleted
root@master:sa#
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
default   1         4d
```

---

## 二、声明式管理 ServiceAccount

声明式（declarative）方式管理 SA：通过 YAML 文件 `kubectl apply/delete -f`

### 1. 编写 SA 的 YAML 文件

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

### 2. 应用并查看 SA

```bash
root@master:sa# kubectl apply -f 01-sa.yaml
serviceaccount/dawn created
root@master:sa#
root@master:sa# kubectl get -f 01-sa.yaml
NAME   SECRETS   AGE
dawn   1         1s
```

### 3. 通过 YAML 删除 SA

```bash
root@master:sa# kubectl delete -f 01-sa.yaml
serviceaccount "dawn" deleted
```

---

## 三、授权容器中 Python 程序对 K8S API 访问权限案例

### 实验原理

在 Pod 中运行 Python 程序，通过 ServiceAccount 的 Token 访问 K8S API。RBAC 授权链路：

```
Role（定义权限） → RoleBinding（绑定SA） → ServiceAccount（Pod使用） → Python程序（携带Token）
```

授权步骤：

1. 创建 Role（定义对哪些资源有哪些操作权限）
2. 创建 ServiceAccount
3. 将 ServiceAccount 与 Role 绑定（RoleBinding）
4. 为 Pod 指定自定义的 SA（`serviceAccountName`）
5. 进入容器执行 Python 程序测试 K8S API 权限

### 1. 创建 ServiceAccount

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

### 2. 创建 Role

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

该 Role 仅授权 `pods` 资源的 `get/watch/list` 操作，不包含 `deployments` 等其他资源

### 3. 创建 RoleBinding

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

`subjects.kind` = `ServiceAccount`，`subjects.name` = `dawn-python`，将 SA 与 Role 关联

### 4. 部署 Python 的 Pod

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
      # 指定 SA，该 SA 需已通过 RoleBinding 绑定到有权限的 Role
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

### 5. 查看 Pod 状态

```bash
root@master:sa# kubectl get pods -l apps=python -o wide
NAME                                   READY   STATUS    RESTARTS   AGE   IP             NODE       NOMINATED NODE   READINESS GATES
dawn-deploy-python-sa-bdb546d9-g85zf   1/1     Running   0          88s   10.100.1.49    worker01   <none>           <none>
dawn-deploy-python-sa-bdb546d9-w4dpf   1/1     Running   0          88s   10.100.2.250   worker02   <none>           <none>
```

### 6. 进入容器安装依赖并编写测试程序

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

编写 Python 测试程序 `view-k8s-resources.py`：

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

### 7. 运行测试（有 RBAC 授权）

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

Role `dawn-pod-reader` 仅授权了 `pods` 的 `get/watch/list`，所以：

Pod 列表成功获取

Deployment 列表被拒绝（未授权 deployments 资源）

### 8. 删除 RoleBinding

```bash
root@master:sa# kubectl delete -f 03-RoleBinding.yaml
rolebinding.rbac.authorization.k8s.io "dawn-sa-to-role" deleted
```

### 9. 再次测试（无 RBAC 授权）

```bash
/ # python3 view-k8s-resources.py

###### Deployment列表 ######

没有权限访问Deployment资源！

###### Pod列表 ######

没有权限访问Pod资源！
/ #
```

删除 RoleBinding 后，SA `dawn-python` 失去所有权限，Pod 和 Deployment 均无法访问。这验证了 RBAC 的授权链路：**SA → RoleBinding → Role → 资源权限**，任意一环断开则权限失效