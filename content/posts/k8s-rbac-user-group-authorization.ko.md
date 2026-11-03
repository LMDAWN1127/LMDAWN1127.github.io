---
title: "K8S 보안 프레임워크와 RBAC 실전: CFSSL 인증서 기반 사용자 및 사용자 그룹 세부 권한 제어"
date: 2026-11-03T13:10:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "RBAC", "CFSSL", "Security"]
showToc: true
summary: "Kubernetes 보안 체계(인증, 인가, 승인 제어)와 RBAC 핵심 모델을 심층 분석하고, CFSSL을 사용한 User 및 Group 인증서 발급, kubeconfig 생성 스크립트 작성, Role/ClusterRole 세부 권한 바인딩 및 권한 침해 방지 검증을 실전 실습합니다."
---

# K8S 보안 프레임워크와 RBAC 실전: CFSSL 인증서 기반 사용자 및 사용자 그룹 세부 권한 제어

---

## 1. Kubernetes 보안 프레임워크 개요

Kubernetes 사용자에게 권한 및 인가 기능을 제공하기 위한 프레임워크입니다.

Kubernetes API Server의 인증서 인증 과정은 크게 3단계로 구분됩니다:

- **인증 (Authentication)**: 아파트 단지 입구에서 경비원이 신원을 확인하기 위한 "출입증"에 해당합니다.
- **인가 (Authorization)**: 아파트 동에 들어가기 위해 사용하는 "도어락 출입 카드(키 포브)"에 해당합니다. Kubernetes에서는 `kubeconfig` 파일 또는 Token 방식으로 구현됩니다.
- **승인 제어 (Admission Control)**: 출입 카드를 인식하는 카드 리더기 장비에 해당합니다. 인식이 완료되면 클러스터 리소스에 접근할 수 있습니다.

Kubernetes의 인가(RBAC) 프레임워크:

- **역할 (Role)**: 어떤 리소스에 권한을 부여할지 정의(리더기 장비에 해당, *"내가 무엇을 할 수 있는가?"*를 표현):
  - **Role**: 네임스페이스 수준의 로컬 리소스를 제어하는 역할.
  - **ClusterRole**: 클러스터 전체 수준의 리소스를 제어하는 역할.
  - 규칙: `apiGroups`(리소스가 속한 API 그룹), `resources`(리소스 목록), `verbs`(리소스에 수행 가능한 작업, 예: get, list, watch, create, update, delete).

- **주체 (Subject)**: 사용자 유형을 지정(출입 카드 자체에 해당, *"내가 누구인가?"*를 표현):
  - **User**: 일반 사용자(개인). 인증서의 "CN" 필드로 표현되며, 일반적으로 `kubeconfig` 파일에 저장됩니다.
  - **ServiceAccount**: 클러스터 내부의 Pod나 프로세스를 위한 서비스 계정. Token 형태(Secret을 통해 관리)로 인증됩니다.
  - **Group**: 조직 또는 그룹. 인증서의 "O" 필드로 표현되며, `kubeconfig`를 통해 구성할 수 있습니다.

- **역할 바인딩 (RoleBinding)**: "역할"과 "주체"를 연결하여 역할의 권한을 주체에게 부여:
  - **RoleBinding**: 특정 네임스페이스 내에서 역할 권한을 주체에 바인딩.
  - **ClusterRoleBinding**: 클러스터 전체에서 역할 권한을 주체에 바인딩.

---

## 2. Kubernetes 기본 내장 클러스터 역할

Kubernetes는 사용자가 즉시 사용할 수 있는 4가지 기본 ClusterRole을 제공합니다:

- **cluster-admin**: 슈퍼 관리자, 클러스터의 모든 리소스에 대한 전체 권한을 보유.
- **admin**: 특정 네임스페이스의 대부분 리소스에 대한 읽기/쓰기 권한을 부여.
- **edit**: 대부분의 워크로드 오브젝트에 대한 읽기/쓰기를 허용하며, 역할 및 역할 바인딩 확인/수정은 제한.
- **view**: 네임스페이스 내 대부분 오브젝트에 대한 읽기 전용 권한을 부여(역할, 역할 바인딩, Secret 조회 제한).

`kubectl get clusterrole` 명령어로 확인할 수 있으며, `system:`으로 시작하는 것은 시스템 내부용입니다:

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

이 중 `flannel`은 CNI 플러그인 설치 시 생성된 역할이며, `kubeadm:get-nodes`는 kubeadm을 통해 클러스터를 구축할 때 생성된 역할입니다.

### cluster-admin 역할 권한 확인

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

### admin 역할 권한 확인

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

## 3. 사용자(User) 기반 인가 실전

### 1. CFSSL 인증서 관리 도구 설치

#### 1.1 CFSSL 패키지 다운로드

```bash
root@master:~# cd /tmp
root@master:/tmp# curl -sL -o cfssl https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssljson https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssljson_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssl-certinfo https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl-certinfo_1.6.5_linux_amd64
```

#### 1.2 CFSSL 도구 설치

```bash
root@master:/tmp# mv cfssl cfssljson cfssl-certinfo /usr/local/bin/
root@master:/tmp# chmod +x /usr/local/bin/cfssl*
root@master:/tmp# ll /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root 11890840 Nov  3 11:01 /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root  8413336 Nov  3 11:01 /usr/local/bin/cfssl-certinfo*
-rwxr-xr-x 1 root root  6205592 Nov  3 11:01 /usr/local/bin/cfssljson*
```

#### 1.3 CFSSL 도구 설치 검증

```bash
root@master:/tmp# cfssl version
Version: 1.6.5
Runtime: go1.22.0
```

### 2. 인증서 서명 요청(CSR) 작성

#### 2.1 작업 디렉터리 생성

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

#### 2.2 인증서 유효 기간 설정 (10년 = 87600h)

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

#### 2.3 인증서 서명 요청 설정 (CN 필드는 사용자 이름)

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

### 3. 인증서 생성

#### 3.1 Kubernetes API Server CA 인증서로 서명 발급

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

#### 3.2 인증서 상세 정보 확인

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

`common_name` = "dawn"은 사용자 이름(CN)이며, `organization` = "k8s"는 그룹 이름(O)에 해당합니다.

### 4. kubeconfig 인가 파일 생성

#### 4.1 kubeconfig 생성 스크립트 작성

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

#### 4.2 kubeconfig 파일 생성 실행

```bash
root@master:user# bash kubeconfig.sh
Cluster "dawn-k8s" set.
User "k8s" set.
Context "xixi" created.
Switched to context "xixi".
```

#### 4.3 권한 검증 (인가 전 거부 확인)

```bash
root@master:user# kubectl get pods --kubeconfig=dawn-k8s.kubeconfig
Error from server (Forbidden): pods is forbidden: User "dawn" cannot list resource "pods" in API group "" in the namespace "default"
```

아직 RBAC 인가가 적용되지 않았으므로 dawn 사용자의 접근이 정상적으로 거부(Forbidden)됩니다.

### 5. RBAC 인가 정책 생성

#### 5.1 rbac.yaml 매니페스트 작성

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

#### 5.2 RBAC 인가 적용

```bash
root@master:user# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role created
rolebinding.rbac.authorization.k8s.io/dawn-linux-rbac created
```

#### 5.3 테스트 및 검증

먼저 테스트용 Deployment를 생성합니다:

```bash
root@master:user# kubectl create deploy nginx-test --image=nginx:alpine --replicas=2 -n default
deployment.apps/nginx-test created
```

인가 후 권한을 테스트합니다:

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

검증 결과:
- `Role`은 바인딩된 네임스페이스 내부 리소스에만 권한을 부여합니다.
- 인가되지 않은 동작(예: `delete pod`)은 거부됩니다.
- 인가되지 않은 네임스페이스(`kube-system`) 접근은 거부됩니다.

---

## 4. `~/.kube/config` 파일의 Group 기반 인가 검증

### 1. kubeconfig에서 클라이언트 인증서 추출

```bash
root@master:~# cat /root/.kube/config | grep client-certificate-data | awk '{print $2}' | base64 -d > /tmp/admin.kubeconfig
```

### 2. 인증서 상세 정보 확인

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

`organization` 필드는 조직을 나타내며, 해당 사용자(`kubernetes-admin`)가 `system:masters` 그룹에 속해 있음을 의미합니다.

### 3. 클러스터 역할 바인딩 확인

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

`kubernetes-admin` 사용자는 `system:masters` 그룹에 속하며, `cluster-admin` ClusterRole이 ClusterRoleBinding을 통해 `system:masters`에 바인딩되어 있으므로 클러스터 관리자는 전체 클러스터 권한을 갖습니다.

---

## 5. kubeconfig 설정 파일을 로드하는 4가지 방법

### 방법 1: `--kubeconfig` 옵션으로 직접 지정

```bash
root@worker01:~# kubectl get pods --kubeconfig=/root/dawn-k8s.kubeconfig
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          89s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          89s
```

### 방법 2: `~/.kube/config` 기본 경로에 배치

```bash
root@worker01:~# mkdir -p ~/.kube
root@worker01:~# cp /root/dawn-k8s.kubeconfig ~/.kube/config
root@worker01:~# kubectl get pods
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          106s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          106s
root@worker01:~# rm -f ~/.kube/config
```

### 방법 3: `KUBECONFIG` 환경 변수 선언

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

### 방법 4: 셸 앨리어스(alias) 설정

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

## 6. 사용자 그룹(Group) 기반 인가 실전

RBAC의 그룹 기반 인증 메커니즘:

- **CN**: 사용자 이름을 의미(예: `xiaoming`)
- **O**: 사용자 그룹을 의미(예: `k8s` 그룹)

사용자 그룹의 장점은 각 사용자에게 개별 권한을 생성할 필요 없이 그룹 단위로 권한을 부여하여 그룹 소속 사용자가 동일한 권한으로 접근할 수 있다는 점입니다.

**참고 사항**:
1. API Server는 사용자 이름(`CN` 필드)을 먼저 검증하며, 일치하는 권한이 없는 경우 사용자 그룹(`O` 필드) 권한을 검증합니다.
2. User와 Group은 클라이언트 인증서에서 추출하는 속성이며, Kubernetes 클러스터 내부에 리소스로 생성되는 것이 아닙니다.

### 1. `xiaoming` 사용자를 `k8s` 그룹에 추가

#### 1.1 인증서 서명 요청(CSR) 작성

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

#### 1.2 Kubernetes CA로 클라이언트 인증서 서명 발급

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

### 2. kubeconfig 인가 파일 생성

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

### 3. 접근 테스트 (인가 전 거부 확인)

```bash
root@master:group# kubectl get pods --kubeconfig=dawn-k8s-groups.kubeconfig -n kube-system
Error from server (Forbidden): pods is forbidden: User "xiaoming" cannot list resource "pods" in API group "" in the namespace "kube-system"
```

### 4. RBAC 인가 정책 생성

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

`subjects.kind` = `Group`, `subjects.name` = `k8s`(인증서의 `O` 필드와 매핑).

```bash
root@master:group# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role-reader created
rolebinding.rbac.authorization.k8s.io/dawn-group-rolebinding created
```

### 5. 접근 재테스트

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

검증 요약:
- `xiaoming` 사용자는 `k8s` 그룹에 속하며, Group RoleBinding을 통해 `kube-system` 네임스페이스의 읽기 전용 권한을 획득합니다.
- 바인딩되지 않은 네임스페이스(`default`)는 접근이 차단됩니다.
- 클러스터 수준 리소스(`nodes`)는 접근이 차단됩니다(Role은 네임스페이스 수준 리소스만 제어).

## RBAC 핵심 요점 정리

1. **Role**은 네임스페이스 수준의 권한 제어에 사용되며, **ClusterRole**은 클러스터 전체 수준의 권한 제어에 사용됩니다.
2. **RoleBinding / ClusterRoleBinding**은 역할을 네임스페이스 또는 클러스터 수준에서 주체와 바인딩합니다.
3. 인가 평가 시 API Server는 사용자 이름(`CN`)을 먼저 매칭하고, 이후 그룹 이름(`O`)을 매칭합니다.
4. 인증서의 `CN` 및 `O` 필드는 클러스터에 생성되는 리소스가 아니며 클라이언트 인증서에서 추출됩니다.
5. 기본 내장 역할(`cluster-admin`, `admin`, `edit`, `view`)은 바로 사용할 수 있으며 새로 생성할 필요가 없습니다.
