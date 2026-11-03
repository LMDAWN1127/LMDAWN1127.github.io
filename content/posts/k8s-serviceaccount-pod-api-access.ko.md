---
title: "K8S ServiceAccount 심층 실전: Pod 내부 Python 애플리케이션의 APIServer 안전 접근 인가"
date: 2026-11-03T13:40:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ServiceAccount", "RBAC", "Python"]
showToc: true
summary: "Kubernetes 서비스 계정(ServiceAccount)의 명령형 및 선언형 라이프사이클 관리를 심층 분석합니다. Pod에 마운트된 SA Token을 활용하여 Python 클라이언트로 APIServer를 안전하게 호출하는 실습과 RBAC 체인 해제를 통한 권한 차단 검증을 수행합니다."
---

# K8S ServiceAccount 심층 실전: Pod 내부 Python 애플리케이션의 APIServer 안전 접근 인가

---

## 1. ServiceAccount의 명령형(Imperative) 관리

명령형 방식 SA 관리: `kubectl create/delete` 명령어를 직접 사용합니다.

### 1. SA 생성

```bash
root@master:sa# kubectl create sa dawn
serviceaccount/dawn created
```

### 2. SA 조회

```bash
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
dawn      1         0s
default   1         4d
```

### 3. SA 삭제

```bash
root@master:sa# kubectl delete sa dawn
serviceaccount "dawn" deleted
root@master:sa#
root@master:sa# kubectl get sa
NAME      SECRETS   AGE
default   1         4d
```

---

## 2. ServiceAccount의 선언형(Declarative) 관리

선언형 방식 SA 관리: YAML 파일 및 `kubectl apply/delete -f`를 통해 관리합니다.

### 1. SA YAML 매니페스트 작성

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

### 2. SA 적용 및 확인

```bash
root@master:sa# kubectl apply -f 01-sa.yaml
serviceaccount/dawn created
root@master:sa#
root@master:sa# kubectl get -f 01-sa.yaml
NAME   SECRETS   AGE
dawn   1         1s
```

### 3. YAML을 통한 SA 삭제

```bash
root@master:sa# kubectl delete -f 01-sa.yaml
serviceaccount "dawn" deleted
```

---

## 3. 컨테이너 내부 Python 프로그램의 K8S API 접근 권한 인가 실전

### 실험 원리

Pod 내부에서 Python 스크립트를 실행하여 ServiceAccount의 Token을 통해 Kubernetes API에 접근합니다. RBAC 인가 체인:

```
Role(권한 정의) → RoleBinding(SA 바인딩) → ServiceAccount(Pod 적용) → Python 프로그램(Token 제시)
```

인가 절차:

1. Role 생성 (대상 리소스에 대한 작업 권한 정의)
2. ServiceAccount 생성
3. ServiceAccount와 Role 바인딩 (RoleBinding)
4. Pod에 커스텀 SA 지정 (`serviceAccountName`)
5. 컨테이너에 접속하여 Python 프로그램 실행 및 K8S API 권한 검증

### 1. ServiceAccount 생성

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

### 2. Role 생성

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

해당 Role은 `pods` 리소스의 `get/watch/list` 작업만 인가하며, `deployments` 등 다른 리소스는 포함하지 않습니다.

### 3. RoleBinding 생성

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

`subjects.kind` = `ServiceAccount`, `subjects.name` = `dawn-python`으로 지정하여 SA와 Role을 연계합니다.

### 4. Python Pod 배포

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
      # RoleBinding으로 권한 Role에 바인딩된 SA 지정
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

### 5. Pod 상태 확인

```bash
root@master:sa# kubectl get pods -l apps=python -o wide
NAME                                   READY   STATUS    RESTARTS   AGE   IP             NODE       NOMINATED NODE   READINESS GATES
dawn-deploy-python-sa-bdb546d9-g85zf   1/1     Running   0          88s   10.100.1.49    worker01   <none>           <none>
dawn-deploy-python-sa-bdb546d9-w4dpf   1/1     Running   0          88s   10.100.2.250   worker02   <none>           <none>
```

### 6. 컨테이너 접속, 의존성 설치 및 테스트 프로그램 작성

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

Python 테스트 프로그램 `view-k8s-resources.py` 작성:

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

### 7. 테스트 실행 (RBAC 인가 부여 상태)

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

Role `dawn-pod-reader`는 `pods`의 `get/watch/list` 권한만 허용하므로:
- Pod 목록은 정상적으로 조회됩니다.
- Deployment 목록 조회는 거부됩니다(deployments 미인가).

### 8. RoleBinding 삭제

```bash
root@master:sa# kubectl delete -f 03-RoleBinding.yaml
rolebinding.rbac.authorization.k8s.io "dawn-sa-to-role" deleted
```

### 9. 재테스트 실행 (RBAC 인가 해제 상태)

```bash
/ # python3 view-k8s-resources.py

###### Deployment列表 ######

没有权限访问Deployment资源！

###### Pod列表 ######

没有权限访问Pod资源！
/ #
```

RoleBinding을 삭제하면 SA `dawn-python`은 모든 권한을 상실하여 Pod와 Deployment 모두 접근할 수 없게 됩니다. 이는 RBAC 인가 체인인 **SA → RoleBinding → Role → 리소스 권한** 중 어느 한 고리라도 끊어지면 권한이 즉시 상실됨을 입증합니다.
