---
title: "K8SセキュリティフレームワークとRBAC実践：CFSSL証明書によるユーザーとグループのきめ細かな権限制御"
date: 2026-11-03T13:10:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "RBAC", "CFSSL", "Security"]
showToc: true
summary: "Kubernetesセキュリティ体系（認証・認可・アドミッション制御）とRBACコアモデルを徹底解説。CFSSLを用いたUserおよびGroupの証明書発行、kubeconfig生成スクリプトの作成、Role/ClusterRoleによるきめ細かな権限バインディングと権限逸脱防御の検証を実践します。"
---

# K8SセキュリティフレームワークとRBAC実践：CFSSL証明書によるユーザーとグループのきめ細かな権限制御

---

## 一、Kubernetesセキュリティフレームワークの概要

Kubernetesユーザーに権限と認可機能を提供するための枠組みです。

KubernetesのAPI Serverによる証明書認証プロセスは、大きく3つのステップに分かれます：

- **認証 (Authentication)**：セキュリティゲートの警備員が本人を確認するための「入館証」に相当します。
- **認可 (Authorization)**：各棟や区画に入るための「セキュリティカード（キーフォブ）」に相当します。Kubernetesでは`kubeconfig`ファイルまたはTokenとして実装されます。
- **アドミッション制御 (Admission Control)**：キーフォブを読み取る認証機器に相当します。認証・検証が完了すると、クラスタリソースへのアクセスが許可されます。

Kubernetesの認可（RBAC）フレームワーク：

- **ロール（Role）**：どのリソースに対して認可を行うかを定義します（カードリーダー機器に相当、「何ができるか？」を表す）。
  - **Role**：名前空間（Namespace）レベルのローカルリソースを制御するロール。
  - **ClusterRole**：クラスタ全体のリソースを制御するロール。
  - ルール：`apiGroups`（対象APIグループ）、`resources`（リソース一覧）、`verbs`（実行可能な操作：get、list、watch、create、update、deleteなど）。

- **サブジェクト（Subject）**：ユーザー種別を指定します（キーフォブに相当、「誰であるか？」を表す）。
  - **User**：個々のユーザー。証明書の「CN」フィールドとして表され、通常kubeconfigファイルに保持されます。
  - **ServiceAccount**：クラスタ内のPodやプロセス向けのサービスアカウント。Token形式（Secret経由）で認証されます。
  - **Group**：グループや組織。証明書の「O」フィールドとして表され、kubeconfigでも管理可能です。

- **ロールバインディング（RoleBinding）**：「ロール」と「サブジェクト」を関連付け、ロールの権限をサブジェクトに付与します。
  - **RoleBinding**：特定の名前空間内でロール権限をサブジェクトにバインドします。
  - **ClusterRoleBinding**：クラスタ全体でロール権限をサブジェクトにバインドします。

---

## 二、Kubernetes組み込みクラスタロール

Kubernetesには、ユーザーが即座に利用できる4つの組み込みClusterRoleがあらかじめ定義されています：

- **cluster-admin**：スーパー管理者、クラスタ内のすべてのリソースに対する全権限を持ちます。
- **admin**：特定の名前空間におけるほぼすべてのリソースの読み書き権限を付与します。
- **edit**：ほとんどのワークロードオブジェクトの読み書きを許可しますが、ロールやロールバインディングの閲覧・変更は制限されます。
- **view**：名前空間内のほとんどのオブジェクトに対する読み取り専用権限を付与します（ロール、ロールバインディング、Secretの閲覧は禁止）。

`kubectl get clusterrole` で確認できます。`system:` で始まるものはシステム内部用です：

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

このうち、`flannel` はCNIプラグイン導入時に作成され、`kubeadm:get-nodes` はkubeadmによるクラスタ初期化時に作成されたロールです。

### cluster-admin の権限を確認

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

### admin の権限を確認

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

## 三、ユーザー（User）ベースの認真实践

### 1. 証明書管理ツール cfssl のインストール

#### 1.1 cfssl パッケージのダウンロード

```bash
root@master:~# cd /tmp
root@master:/tmp# curl -sL -o cfssl https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssljson https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssljson_1.6.5_linux_amd64
root@master:/tmp# curl -sL -o cfssl-certinfo https://github.com/cloudflare/cfssl/releases/download/v1.6.5/cfssl-certinfo_1.6.5_linux_amd64
```

#### 1.2 cfssl ツールの配置

```bash
root@master:/tmp# mv cfssl cfssljson cfssl-certinfo /usr/local/bin/
root@master:/tmp# chmod +x /usr/local/bin/cfssl*
root@master:/tmp# ll /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root 11890840 Nov  3 11:01 /usr/local/bin/cfssl*
-rwxr-xr-x 1 root root  8413336 Nov  3 11:01 /usr/local/bin/cfssl-certinfo*
-rwxr-xr-x 1 root root  6205592 Nov  3 11:01 /usr/local/bin/cfssljson*
```

#### 1.3 インストールの検証

```bash
root@master:/tmp# cfssl version
Version: 1.6.5
Runtime: go1.22.0
```

### 2. 証明書署名要求（CSR）の作成

#### 2.1 作業ディレクトリの作成

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

#### 2.2 証明書の有効期限を設定（10年 = 87600h）

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

#### 2.3 証明書署名要求の設定（CNフィールドがユーザー名）

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

### 3. 証明書の生成

#### 3.1 Kubernetes API Server の CA 証明書で署名発行

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

#### 3.2 証明書の詳細情報の確認

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

`common_name` = "dawn" がユーザー名（CN）、`organization` = "k8s" がグループ名（O）に該当します。

### 4. kubeconfig 認可ファイルの生成

#### 4.1 kubeconfig 生成スクリプトの作成

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

#### 4.2 kubeconfig ファイルの生成

```bash
root@master:user# bash kubeconfig.sh
Cluster "dawn-k8s" set.
User "k8s" set.
Context "xixi" created.
Switched to context "xixi".
```

#### 4.3 権限の検証（認可前のためアクセス拒否されること）

```bash
root@master:user# kubectl get pods --kubeconfig=dawn-k8s.kubeconfig
Error from server (Forbidden): pods is forbidden: User "dawn" cannot list resource "pods" in API group "" in the namespace "default"
```

この時点ではRBAC認可が設定されていないため、dawnユーザーのアクセスは拒絶されます。

### 5. RBAC 認可ポリシーの作成

#### 5.1 rbac.yaml 設定ファイルの作成

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

#### 5.2 RBAC 認可の適用

```bash
root@master:user# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role created
rolebinding.rbac.authorization.k8s.io/dawn-linux-rbac created
```

#### 5.3 テストと検証

まず、テスト用のDeploymentを作成します：

```bash
root@master:user# kubectl create deploy nginx-test --image=nginx:alpine --replicas=2 -n default
deployment.apps/nginx-test created
```

認可後の権限をテストします：

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

検証ポイント：
- Roleはバインドされた名前空間内のリソースのみに権限を付与します。
- 許可されていない操作（delete pod）は拒絶されます。
- 未認可の名前空間（kube-system）へのアクセスは拒絶されます。

---

## 四、`~/.kube/config` ファイルのGroup型認可の検証

### 1. kubeconfig からクライアント証明書を抽出

```bash
root@master:~# cat /root/.kube/config | grep client-certificate-data | awk '{print $2}' | base64 -d > /tmp/admin.kubeconfig
```

### 2. 証明書の詳細情報を確認

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

`organization` フィールドは組織を表し、このユーザー（`kubernetes-admin`）が `system:masters` グループに所属していることを示します。

### 3. クラスタロールバインディングの確認

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

`kubernetes-admin` ユーザーは `system:masters` グループに所属しており、`cluster-admin` ClusterRole が ClusterRoleBinding を介して `system:masters` にバインドされているため、管理者はクラスタ全体の全権限を保持します。

---

## 五、kubeconfig 設定ファイルをロードする4つの方法

### 方法1：`--kubeconfig` オプションで直接指定

```bash
root@worker01:~# kubectl get pods --kubeconfig=/root/dawn-k8s.kubeconfig
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          89s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          89s
```

### 方法2：`~/.kube/config` に配置

```bash
root@worker01:~# mkdir -p ~/.kube
root@worker01:~# cp /root/dawn-k8s.kubeconfig ~/.kube/config
root@worker01:~# kubectl get pods
NAME                          READY   STATUS    RESTARTS   AGE
nginx-test-7fd5f9d864-6fmhf   1/1     Running   0          106s
nginx-test-7fd5f9d864-pm8nh   1/1     Running   0          106s
root@worker01:~# rm -f ~/.kube/config
```

### 方法3：`KUBECONFIG` 環境変数の宣言

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

### 方法4：エイリアス（alias）の利用

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

## 六、ユーザーグループ（Group）ベースの認真实践

RBACにおけるグループ認証メカニズム：

- **CN**：ユーザー名を表す（例：`xiaoming`）
- **O**：ユーザーグループを表す（例：`k8s` グループ）

ユーザーグループを活用するメリットは、ユーザーごとに個別権限を作成する必要がなく、グループ単位で一括認可でき、すべての所属メンバーがグループ権限でアクセスできる点にあります。

**注**：
1. API Server はまずユーザー名（CNフィールド）を検証し、該当権限がない場合にユーザーグループ（Oフィールド）の権限を検証します。
2. ユーザーおよびユーザーグループは証明書から抽出される属性であり、クラスタ内にリソースとして作成されるものではありません。

### 1. xiaoming ユーザーを k8s グループに追加

#### 1.1 証明書署名要求の作成

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

#### 1.2 Kubernetes CA によるクライアント証明書の署名発行

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

### 2. kubeconfig 認可ファイルの生成

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

### 3. アクセステスト（認可前のためアクセス拒否されること）

```bash
root@master:group# kubectl get pods --kubeconfig=dawn-k8s-groups.kubeconfig -n kube-system
Error from server (Forbidden): pods is forbidden: User "xiaoming" cannot list resource "pods" in API group "" in the namespace "kube-system"
```

### 4. RBAC 認可ポリシーの作成

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

`subjects.kind` = `Group`、`subjects.name` = `k8s`（証明書の O フィールドに対応）

```bash
root@master:group# kubectl apply -f rbac.yaml
role.rbac.authorization.k8s.io/dawn-custom-role-reader created
rolebinding.rbac.authorization.k8s.io/dawn-group-rolebinding created
```

### 5. 再アクセステスト

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

検証結果：
- xiaomingユーザーはk8sグループに属しており、Group RoleBindingを通じてkube-system名前空間の読み取り専用権限を獲得。
- バインドされていない名前空間（default）へのアクセス権限はありません。
- クラスタレベルのリソース（nodes）へのアクセス権限はありません（Roleは名前空間レベルのリソースのみ制御可能）。

## RBAC コア要点まとめ

1. **Role** は名前空間レベルの権限制御、**ClusterRole** はクラスタ全体レベルの権限制御に使用されます。
2. **RoleBinding / ClusterRoleBinding** は、ロールを名前空間またはクラスタレベルでサブジェクトにバインドします。
3. 認可検証時、API Server はユーザー名（CN）を優先して照合し、その後グループ名（O）を照合します。
4. 証明書内の CN および O フィールドはクラスタ内に作成されるリソースではなく、クライアント証明書から抽出されます。
5. 組み込みロール（cluster-admin、admin、edit、view）は直接利用可能であり、再作成は不要です。
