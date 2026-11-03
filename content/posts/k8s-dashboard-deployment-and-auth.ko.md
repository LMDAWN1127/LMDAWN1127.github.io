---
title: "Kubernetes Dashboard 실전 배포: 권한 부족 해결 및 Token과 Kubeconfig 이중 인증 로그인 구현"
date: 2026-11-03T16:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Dashboard", "RBAC", "WebUI"]
showToc: true
summary: "Kubernetes Dashboard 애드온의 버전 호환성 검토, 로컬 레지스트리 이미지 대체 및 NodePort 노출 배포를 상세히 다룹니다. 공식 기본 ServiceAccount의 권한 부족 문제를 cluster-admin ClusterRoleBinding으로 해결하고, Token 로그인과 자동화된 Kubeconfig 생성 스크립트를 통한 이중 인증을 실전 구현합니다."
---

# Kubernetes Dashboard 실전 배포: 권한 부족 해결 및 Token과 Kubeconfig 이중 인증 로그인 구현

---

## 1. Dashboard와 Kubernetes 버전 호환성

### 1. 개요

Dashboard는 그래픽 Web UI를 통해 Kubernetes 클러스터를 간편하게 관리할 수 있도록 지원합니다. 다만 멀티 클러스터 관리를 지원하지 않고 기능이 비교적 단순한 편이므로, 고도화된 프로덕션 환경에서는 Rancher, Kuboard, KubeSphere 등의 도입을 고려할 수 있습니다.

Kubernetes 1.23 버전은 Dashboard v2.5.1과 호환됩니다.

**참고 링크**: https://github.com/kubernetes/dashboard/releases/tag/v2.5.1

---

## 2. Dashboard 컴포넌트 배포

### 1. recommended.yaml 다운로드

```bash
root@master:03-dashboard# wget https://raw.githubusercontent.com/kubernetes/dashboard/v2.5.1/aio/deploy/recommended.yaml
root@master:03-dashboard# wc -l recommended.yaml
306 recommended.yaml
```

### 2. YAML 설정 수정

기본 제공되는 YAML은 `kubernetesui/` 이미지를 사용하며 Service 타입이 ClusterIP로 지정되어 있습니다. 주요 수정 사항:

1. 이미지 저장소를 로컬 Harbor(`11.0.1.250/dawn/`)로 변경.

2. Service 타입을 `NodePort`로 변경.

수정 전 (이미지 경로):

```yaml
image: kubernetesui/dashboard:v2.5.1
image: kubernetesui/metrics-scraper:v1.0.7
```

수정 후:

```yaml
image: 11.0.1.250/dawn/dashboard:v2.5.1
image: 11.0.1.250/dawn/metrics-scraper:v1.0.7
```

Service 수정 (`type: NodePort` 추가):

```yaml
spec:
  type: NodePort
  ports:
    - port: 443
      targetPort: 8443
```

### 3. Dashboard 배포 실행

```bash
root@master:03-dashboard# kubectl apply -f recommended.yaml
namespace/kubernetes-dashboard created
serviceaccount/kubernetes-dashboard created
service/kubernetes-dashboard created
secret/kubernetes-dashboard-certs created
secret/kubernetes-dashboard-csrf created
secret/kubernetes-dashboard-key-holder created
configmap/kubernetes-dashboard-settings created
role.rbac.authorization.k8s.io/kubernetes-dashboard created
clusterrole.rbac.authorization.k8s.io/kubernetes-dashboard created
rolebinding.rbac.authorization.k8s.io/kubernetes-dashboard created
clusterrolebinding.rbac.authorization.k8s.io/kubernetes-dashboard created
deployment.apps/kubernetes-dashboard created
service/dashboard-metrics-scraper created
deployment.apps/dashboard-metrics-scraper created
```

### 4. 배포 상태 확인

```bash
root@master:03-dashboard# kubectl get pods -n kubernetes-dashboard -o wide
NAME                                        READY   STATUS    RESTARTS   AGE   IP             NODE       NOMINATED NODE   READINESS GATES
dashboard-metrics-scraper-8f9d6dd68-xm75g   1/1     Running   0          15s   10.100.2.251   worker02   <none>           <none>
kubernetes-dashboard-b8c8ff76d-bfzrr        1/1     Running   0          15s   10.100.2.252   worker02   <none>           <none>

root@master:03-dashboard# kubectl get svc -n kubernetes-dashboard
NAME                        TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)         AGE
dashboard-metrics-scraper   ClusterIP   10.200.118.3    <none>        8000/TCP        15s
kubernetes-dashboard        NodePort    10.200.219.13   <none>        443:32550/TCP   15s
```

### 5. Dashboard Web UI 접속

Dashboard는 NodePort를 통해 노출되며 접속 주소는 다음과 같습니다:

```
https://11.0.1.231:32550/
https://11.0.1.232:32550/
https://11.0.1.233:32550/
```

자체 서명된 인증서를 사용하므로 브라우저에서 안전하지 않음 경고가 나타납니다. 브라우저 페이지의 빈 화면(버튼 제외)을 클릭한 후 키보드로 `thisisunsafe`를 차례로 입력합니다.
화면에 입력 내용이 표시되지는 않지만, 입력을 마치면 Chromium 기반 브라우저(Chrome, Edge 등)에서 자동으로 Dashboard 로그인 페이지로 이동합니다.

![image-20261103141902917](/images/k8s-dashboard-deployment-and-auth/image-20261103141902917.png)

---

## 3. Dashboard 로그인

### 1. 공식 기본 SA 권한 부족 문제

```bash
root@master:~# kubectl -n kubernetes-dashboard describe sa kubernetes-dashboard | grep Tokens              Tokens:              kubernetes-dashboard-token-8vp5g
```

공식 기본 SA `kubernetes-dashboard`는 제한된 ClusterRole에만 바인딩되어 있어 전체 리소스를 조회할 수 없습니다.

### 2. cluster-admin 권한의 SA 생성 (Token 방식 로그인)

#### 2.1 RBAC YAML 매니페스트 작성

```bash
root@master:03-dashboard# cat dawn-dashboard-rbac.yaml
```

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    k8s-app: kubernetes-dashboard
  name: dawn
  namespace: kubernetes-dashboard

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  labels:
    k8s-app: kubernetes-dashboard
  name: kubernetes-dashboard-dawn
  namespace: kubernetes-dashboard
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: dawn
    namespace: kubernetes-dashboard
```

#### 2.2 RBAC 적용

```bash
root@master:03-dashboard# kubectl apply -f dawn-dashboard-rbac.yaml
serviceaccount/dawn created
clusterrolebinding.rbac.authorization.k8s.io/kubernetes-dashboard-dawn created
```

#### 2.3 SA의 Token 이름 확인

```bash
root@master:03-dashboard# kubectl describe serviceaccounts -n kubernetes-dashboard dawn | grep Tokens
Tokens:              dawn-token-99t7v
```

#### 2.4 Token 값 추출

```bash
root@master:03-dashboard# kubectl -n kubernetes-dashboard get secret dawn-token-99t7v -o jsonpath='{.data.token}' | base64 -d
eyJhbGciOiJSUzI1NiIsImtpZCI6Ii0xRnhON2pLS0tCX1RRUEtIcmgyRWY3X3pqRlBlc3hzRzBQdnpsbXhWdEkifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJrdWJlcm5ldGVzLWRhc2hib2FyZCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VjcmV0Lm5hbWUiOiJkYXduLXRva2VuLTk5dDd2Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZXJ2aWNlLWFjY291bnQubmFtZSI6ImRhd24iLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiIzNGY1NDdhOS0wYTZmLTQzYTYtOTJjZS03ZWJlMTk0MmQ3M2QiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6a3ViZXJuZXRlcy1kYXNoYm9hcmQ6ZGF3biJ9.orVBsJnUmDsRRO55VE4FWpQLq2U04goe1IFCEeWpYt7cYmWk8c_bapjqb5UCGEF0g1pOyXbZ9XRWq3aF6W1-rLRa7MOLKvbGbnY4yR1cbtvtHt0eimENt45WFQ3q2hWyQYYku3WDWOhttKi0h6WXZEfnDh_GyptHjOPKylM61qaoxG_xFNp7BH80mUj10A5ksV-O-TLhDRwrkvs-NNlzOfV7RBv6sd98gagLwhHWQvN6_xNDNJ_7O-T8XvXoCtNxXFknyk2xXoMMYqcNF1WkP8h92GfBXEzY2qcdJvD49gYPeKwBH3feGOSppx82f3Ze0Oi36lYwJ8gXDEBbgn4W4A
```

#### 2.5 Token으로 Dashboard 로그인

브라우저에서 `https://11.0.1.231:32550/`을 열고, **Token** 옵션을 선택한 뒤 위에서 복사한 Token을 붙여넣으면 클러스터 전체 관리자 권한으로 로그인됩니다.

![image-20261103144552317](/images/k8s-dashboard-deployment-and-auth/image-20261103144552317.png)

### 3. Kubeconfig 파일 기반 로그인

#### 3.1 Kubeconfig 생성 스크립트 작성

```bash
root@master:03-dashboard# cat dawn-generate-context-conf.sh
```

```bash
#!/bin/bash

# 获取secret名称
SECRET_NAME=$(kubectl --kubeconfig=/etc/kubernetes/admin.conf get secrets -n kubernetes-dashboard | grep dawn | awk '{print $1}')

# 指定API SERVER地址
API_SERVER=11.0.1.231:6443

# 指定kubeconfig配置文件的路径名称
KUBECONFIG_NAME=./dawn-k8s-dashboard-admin.conf

# 获取dawn用户的token
dawn_TOKEN=$(kubectl --kubeconfig=/etc/kubernetes/admin.conf get secrets -n kubernetes-dashboard $SECRET_NAME -o jsonpath={.data.token} | base64 -d)

# 在kubeconfig配置文件中设置集群项
kubectl config set-cluster dawn-k8s-dashboard-cluster --server=https://$API_SERVER --kubeconfig=$KUBECONFIG_NAME

# 在kubeconfig中设置用户项
kubectl config set-credentials dawn-k8s-dashboard-user --token=$dawn_TOKEN --kubeconfig=$KUBECONFIG_NAME

# 配置上下文
kubectl config set-context dawn-admin --cluster=dawn-k8s-dashboard-cluster --user=dawn-k8s-dashboard-user --kubeconfig=$KUBECONFIG_NAME

# 配置当前使用的上下文
kubectl config use-context dawn-admin --kubeconfig=$KUBECONFIG_NAME

echo "kubeconfig generated: $KUBECONFIG_NAME"
```

#### 3.2 스크립트 실행으로 Kubeconfig 생성

```bash
root@master:03-dashboard# bash dawn-generate-context-conf.sh
Cluster "dawn-k8s-dashboard-cluster" set.
User "dawn-k8s-dashboard-user" set.
Context "dawn-admin" created.
Switched to context "dawn-admin".
kubeconfig generated: ./dawn-k8s-dashboard-admin.conf
```

#### 3.3 Kubeconfig 파일로 로그인

생성된 `dawn-k8s-dashboard-admin.conf` 파일을 로컬에 다운로드한 후, Dashboard 로그인 화면에서 **Kubeconfig**를 선택하고 해당 파일을 업로드하여 로그인합니다.

![image-20261103154620001](/images/k8s-dashboard-deployment-and-auth/image-20261103154620001.png)

![image-20261103160026553](/images/k8s-dashboard-deployment-and-auth/image-20261103160026553.png)

---

## 4. Dashboard 기본 기능 활용

### 1. 리소스 생성

우측 상단의 **"+"** 버튼을 클릭하여 YAML 내용을 붙여넣고 리소스(Deployment, Service 등)를 직접 생성할 수 있습니다.

![image-20261103160151794](/images/k8s-dashboard-deployment-and-auth/image-20261103160151794.png)

![image-20261103160713291](/images/k8s-dashboard-deployment-and-auth/image-20261103160713291.png)

![image-20261103160813306](/images/k8s-dashboard-deployment-and-auth/image-20261103160813306.png)

### 2. 리소스 삭제

리소스 목록 페이지에서 대상 리소스를 체크하고 상단 삭제 버튼을 클릭하여 제거합니다.

![image-20261103160830316](/images/k8s-dashboard-deployment-and-auth/image-20261103160830316.png)

### 3. 리소스 수정

리소스 상세 페이지로 이동한 후 편집 버튼을 클릭하여 온라인에서 실시간으로 YAML을 수정 및 적용할 수 있습니다.

### 4. 리소스 조회 및 모니터링

- **네임스페이스 범위**: Pods, Deployments, Services, ConfigMaps, Secrets 등
- **클러스터 범위**: Nodes, Namespaces, PersistentVolumes, ClusterRoles 등
- **Pod 상세 기능**: 실시간 로그 스트리밍, 컨테이너 셸 접속(Exec), 리소스 메트릭 모니터링

Dashboard에서 Pod 목록 확인 및 컨테이너 터미널 접속:

![image-20261103161211225](/images/k8s-dashboard-deployment-and-auth/image-20261103161211225.png)

![image-20261103161622508](/images/k8s-dashboard-deployment-and-auth/image-20261103161622508.png)
