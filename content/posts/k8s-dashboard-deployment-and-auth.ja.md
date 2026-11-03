---
title: "Kubernetes Dashboard 導入実践：権限不足の解決とToken・Kubeconfigデュアル認証ログイン"
date: 2026-11-03T16:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Dashboard", "RBAC", "WebUI"]
showToc: true
summary: "Kubernetes Dashboardアドオンのバージョン選定、ローカルレジストリイメージ置換、NodePort公開によるデプロイ手順を解説。公式デフォルトServiceAccountの権限不足をcluster-adminのClusterRoleBindingで解消し、TokenログインおよびKubeconfig自動生成スクリプトによる二重認証を実践します。"
---

# Kubernetes Dashboard 導入実践：権限不足の解決とToken・Kubeconfigデュアル認証ログイン

---

## 一、DashboardとK8Sのバージョン対応関係

### 1. 概要

DashboardはWeb UIによるグラフィカルなK8Sクラスタ管理を提供し、直感的な操作が可能です。一方、マルチクラスタ管理には対応しておらず、機能面は比較的シンプルです。高度な機能を求める本番環境では、Rancher、Kuboard、KubeSphereなどの採用も検討されます。

Kubernetes 1.23 バージョンに対応するDashboardは v2.5.1 です。

**参考リンク**：https://github.com/kubernetes/dashboard/releases/tag/v2.5.1

---

## 二、Dashboard コンポーネントのデプロイ

### 1. recommended.yaml のダウンロード

```bash
root@master:03-dashboard# wget https://raw.githubusercontent.com/kubernetes/dashboard/v2.5.1/aio/deploy/recommended.yaml
root@master:03-dashboard# wc -l recommended.yaml
306 recommended.yaml
```

### 2. YAML設定の変更

元のYAMLは公式の `kubernetesui/` イメージを使用し、ServiceタイプはClusterIPに設定されています。主な変更点：

1. イメージレジストリをローカルHarbor（`11.0.1.250/dawn/`）に変更。

2. Serviceタイプを `NodePort` に変更。

変更前（イメージ参照部）：

```yaml
image: kubernetesui/dashboard:v2.5.1
image: kubernetesui/metrics-scraper:v1.0.7
```

変更後：

```yaml
image: 11.0.1.250/dawn/dashboard:v2.5.1
image: 11.0.1.250/dawn/metrics-scraper:v1.0.7
```

Serviceの変更（`type: NodePort` を追加）：

```yaml
spec:
  type: NodePort
  ports:
    - port: 443
      targetPort: 8443
```

### 3. Dashboard のデプロイ

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

### 4. デプロイ状態の確認

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

### 5. Dashboard Web UI へのアクセス

DashboardはNodePort経由で公開されています。アクセスURL：

```
https://11.0.1.231:32550/
https://11.0.1.232:32550/
https://11.0.1.233:32550/
```

自己署名証明書を使用しているため、ブラウザにセキュリティ警告が表示されます。ページの空白部分をマウスでクリック（ボタンはクリックしない）し、キーボードから直接 `thisisunsafe` と入力します。
画面上には文字が表示されませんが、入力が完了するとChromium系ブラウザ（ChromeやEdgeなど）は自動的にDashboardのログイン画面へ遷移します。

![image-20261103141902917](/images/k8s-dashboard-deployment-and-auth/image-20261103141902917.png)

---

## 三、Dashboard へのログイン

### 1. 公式デフォルト SA の権限不足

```bash
root@master:~# kubectl -n kubernetes-dashboard describe sa kubernetes-dashboard | grep Tokens              Tokens:              kubernetes-dashboard-token-8vp5g
```

公式デフォルトのSA `kubernetes-dashboard` は割り当てられている権限が限定されており、全リソースを閲覧することはできません。

### 2. cluster-admin 権限を持つ SA の作成（Token 認証ログイン）

#### 2.1 RBAC YAML マニフェストの作成

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

#### 2.2 RBAC の適用

```bash
root@master:03-dashboard# kubectl apply -f dawn-dashboard-rbac.yaml
serviceaccount/dawn created
clusterrolebinding.rbac.authorization.k8s.io/kubernetes-dashboard-dawn created
```

#### 2.3 SA の Token 名を確認

```bash
root@master:03-dashboard# kubectl describe serviceaccounts -n kubernetes-dashboard dawn | grep Tokens
Tokens:              dawn-token-99t7v
```

#### 2.4 Token 値の取得

```bash
root@master:03-dashboard# kubectl -n kubernetes-dashboard get secret dawn-token-99t7v -o jsonpath='{.data.token}' | base64 -d
eyJhbGciOiJSUzI1NiIsImtpZCI6Ii0xRnhON2pLS0tCX1RRUEtIcmgyRWY3X3pqRlBlc3hzRzBQdnpsbXhWdEkifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJrdWJlcm5ldGVzLWRhc2hib2FyZCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VjcmV0Lm5hbWUiOiJkYXduLXRva2VuLTk5dDd2Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZXJ2aWNlLWFjY291bnQubmFtZSI6ImRhd24iLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiIzNGY1NDdhOS0wYTZmLTQzYTYtOTJjZS03ZWJlMTk0MmQ3M2QiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6a3ViZXJuZXRlcy1kYXNoYm9hcmQ6ZGF3biJ9.orVBsJnUmDsRRO55VE4FWpQLq2U04goe1IFCEeWpYt7cYmWk8c_bapjqb5UCGEF0g1pOyXbZ9XRWq3aF6W1-rLRa7MOLKvbGbnY4yR1cbtvtHt0eimENt45WFQ3q2hWyQYYku3WDWOhttKi0h6WXZEfnDh_GyptHjOPKylM61qaoxG_xFNp7BH80mUj10A5ksV-O-TLhDRwrkvs-NNlzOfV7RBv6sd98gagLwhHWQvN6_xNDNJ_7O-T8XvXoCtNxXFknyk2xXoMMYqcNF1WkP8h92GfBXEzY2qcdJvD49gYPeKwBH3feGOSppx82f3Ze0Oi36lYwJ8gXDEBbgn4W4A
```

#### 2.5 Token による Dashboard ログイン

ブラウザで `https://11.0.1.231:32550/` を開き、**Token** を選択して取得したTokenを貼り付けることで、クラスタ全権限でログインできます。

![image-20261103144552317](/images/k8s-dashboard-deployment-and-auth/image-20261103144552317.png)

### 3. kubeconfig ファイルによるログイン

#### 3.1 kubeconfig 生成スクリプトの作成

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

#### 3.2 スクリプト実行による kubeconfig 生成

```bash
root@master:03-dashboard# bash dawn-generate-context-conf.sh
Cluster "dawn-k8s-dashboard-cluster" set.
User "dawn-k8s-dashboard-user" set.
Context "dawn-admin" created.
Switched to context "dawn-admin".
kubeconfig generated: ./dawn-k8s-dashboard-admin.conf
```

#### 3.3 kubeconfig ファイルによるログイン

生成された `dawn-k8s-dashboard-admin.conf` をローカルPCにダウンロードし、ログイン画面で **Kubeconfig** を選択してアップロードします。

![image-20261103154620001](/images/k8s-dashboard-deployment-and-auth/image-20261103154620001.png)

![image-20261103160026553](/images/k8s-dashboard-deployment-and-auth/image-20261103160026553.png)

---

## 四、Dashboard の基本操作

### 1. リソースの作成

右上の **「＋」** ボタンをクリックし、YAML定義を貼り付けてリソース（DeploymentやServiceなど）を作成できます。

![image-20261103160151794](/images/k8s-dashboard-deployment-and-auth/image-20261103160151794.png)

![image-20261103160713291](/images/k8s-dashboard-deployment-and-auth/image-20261103160713291.png)

![image-20261103160813306](/images/k8s-dashboard-deployment-and-auth/image-20261103160813306.png)

### 2. リソースの削除

リソース一覧画面で対象リソースにチェックを入れ、削除ボタンをクリックします。

![image-20261103160830316](/images/k8s-dashboard-deployment-and-auth/image-20261103160830316.png)

### 3. リソースの編集

リソースの詳細画面に入り、「編集」ボタンをクリックしてオンラインで直接YAMLを修正・適用できます。

### 4. リソースの閲覧

- **名前空間レベル**：Pods、Deployments、Services、ConfigMaps、Secrets など
- **クラスタレベル**：Nodes、Namespaces、PersistentVolumes、ClusterRoles など
- **Pod詳細**：ログストリーミング、コンテナ端末（Exec）操作、リソース監視

DashboardでのPod一覧確認およびコンテナ端末へのアクセス：

![image-20261103161211225](/images/k8s-dashboard-deployment-and-auth/image-20261103161211225.png)

![image-20261103161622508](/images/k8s-dashboard-deployment-and-auth/image-20261103161622508.png)
