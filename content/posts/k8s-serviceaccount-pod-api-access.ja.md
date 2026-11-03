---
title: "K8S ServiceAccount 徹底実践：Pod内PythonプログラムによるAPIServer安全アクセス認可"
date: 2026-11-03T13:40:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ServiceAccount", "RBAC", "Python"]
showToc: true
summary: "Kubernetesサービスアカウント（ServiceAccount）の命令的・宣言的ライフサイクル管理を深掘り解説。Pod内にマウントされたSA Tokenを使用し、PythonクライアントからAPIServerをセキュアに呼び出す手順と、RBACバインディング解除による境界防御の検証を実践します。"
---

# K8S ServiceAccount 徹底実践：Pod内PythonプログラムによるAPIServer安全アクセス認可

---

## 一、ServiceAccountの命令的（Imperative）管理

命令的方式によるSA管理：`kubectl create/delete` コマンドを直接実行します。

### 1. SAの作成

```bash
root@master:sa# kubectl create sa dawn
serviceaccount/dawn created
```

### 2. SAの確認

```bash
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
dawn      1         0s
default   1         4d
```

### 3. SAの削除

```bash
root@master:sa# kubectl delete sa dawn
serviceaccount "dawn" deleted
root@master:sa#
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
default   1         4d
```

---

## 二、ServiceAccountの宣言的（Declarative）管理

宣言的方式によるSA管理：YAMLファイルと `kubectl apply/delete -f` を用いて管理します。

### 1. SAのYAMLマニフェスト作成

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

### 2. SAの適用と確認

```bash
root@master:sa# kubectl apply -f 01-sa.yaml
serviceaccount/dawn created
root@master:sa#
root@master:sa# kubectl get -f 01-sa.yaml
NAME   SECRETS   AGE
dawn   1         1s
```

### 3. YAML経由でのSA削除

```bash
root@master:sa# kubectl delete -f 01-sa.yaml
serviceaccount "dawn" deleted
```

---

## 三、コンテナ内PythonプログラムへのK8S APIアクセス権限認可の実践

### 実験の仕組み

Pod内でPythonスクリプトを実行し、ServiceAccountのTokenを介してKubernetes APIにアクセスします。RBACの認可チェーン：

```
Role（権限定義） → RoleBinding（SAバインド） → ServiceAccount（Pod適用） → Pythonプログラム（Token提示）
```

認可の手順：

1. Roleを作成（対象リソースに対する操作権限を定義）
2. ServiceAccountを作成
3. ServiceAccountとRoleを関連付け（RoleBinding）
4. Pod定義でカスタムSAを指定（`serviceAccountName`）
5. コンテナ内でPythonプログラムを実行し、Kubernetes APIの権限を検証

### 1. ServiceAccountの作成

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

### 2. Roleの作成

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

このRoleは `pods` リソースの `get/watch/list` のみを許可しており、`deployments` などの他のリソースは含まれません。

### 3. RoleBindingの作成

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

`subjects.kind` = `ServiceAccount`、`subjects.name` = `dawn-python` と指定し、SAとRoleを関連付けます。

### 4. Python Podのデプロイ

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
      # RoleBindingで権限付きRoleにバインドされたSAを指定
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

### 5. Pod状態の確認

```bash
root@master:sa# kubectl get pods -l apps=python -o wide
NAME                                   READY   STATUS    RESTARTS   AGE   IP             NODE       NOMINATED NODE   READINESS GATES
dawn-deploy-python-sa-bdb546d9-g85zf   1/1     Running   0          88s   10.100.1.49    worker01   <none>           <none>
dawn-deploy-python-sa-bdb546d9-w4dpf   1/1     Running   0          88s   10.100.2.250   worker02   <none>           <none>
```

### 6. コンテナに入り依存パッケージ導入とテストプログラム作成

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

Pythonテストプログラム `view-k8s-resources.py` の作成：

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

### 7. テストの実行（RBAC認可あり）

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

Role `dawn-pod-reader` は `pods` の `get/watch/list` のみ許可しているため：
- Pod一覧は正常に取得されます。
- Deployment一覧の取得は拒否されます（deploymentsリソースへの未認可）。

### 8. RoleBindingの削除

```bash
root@master:sa# kubectl delete -f 03-RoleBinding.yaml
rolebinding.rbac.authorization.k8s.io "dawn-sa-to-role" deleted
```

### 9. 再テストの実行（RBAC認可なし）

```bash
/ # python3 view-k8s-resources.py

###### Deployment列表 ######

没有权限访问Deployment资源！

###### Pod列表 ######

没有权限访问Pod资源！
/ #
```

RoleBindingを削除すると、SA `dawn-python` はすべての権限を失い、PodとDeploymentの両方にアクセスできなくなります。これにより、RBACの認可チェーン **SA → RoleBinding → Role → リソース権限** のいずれかが欠落すると権限が無効化されることが実証されます。
