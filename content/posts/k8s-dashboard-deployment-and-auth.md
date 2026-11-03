---
title: "Kubernetes Dashboard 极简部署实战：解决权限不足并实现 Token 与 Kubeconfig 双认证登录"
date: 2026-11-03T16:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Dashboard", "RBAC", "WebUI"]
showToc: true
summary: "详解 Kubernetes Dashboard 附加组件的版本选型、本地私有仓库镜像替换与 NodePort 暴露部署，针对官方默认账号权限不足问题，提供基于 ClusterRoleBinding 的 Token 授权方案及自动化生成 Kubeconfig 登录配置文件的完整实战。"
---

# Kubernetes Dashboard 极简部署实战：解决权限不足并实现 Token 与 Kubeconfig 双认证登录

---

## 一、Dashboard 和 K8S 版本对应关系

### 1. 概述

Dashboard 以图形化的 Web UI 管理 K8S 集群，操作简单。缺点是不支持多套集群管理，功能相对单一。生产环境中若需更好功能可考虑 Rancher、Kuboard、KubeSphere 等。

K8S 1.23 版本对应 Dashboard v2.5.1。

**参考链接**：https://github.com/kubernetes/dashboard/releases/tag/v2.5.1

---

## 二、部署 Dashboard 组件

### 1. 下载 recommended.yaml

```bash
root@master:03-dashboard# wget https://raw.githubusercontent.com/kubernetes/dashboard/v2.5.1/aio/deploy/recommended.yaml
root@master:03-dashboard# wc -l recommended.yaml
306 recommended.yaml
```

### 2. 修改 YAML 配置

原始 YAML 使用 `kubernetesui/` 镜像、Service 类型为 ClusterIP。修改点：

1. 镜像地址改为本地 Harbor（`11.0.1.250/dawn/`）

2. Service 类型改为 `NodePort`

修改前（镜像地址）：

```yaml
image: kubernetesui/dashboard:v2.5.1
image: kubernetesui/metrics-scraper:v1.0.7
```

修改后：

```yaml
image: 11.0.1.250/dawn/dashboard:v2.5.1
image: 11.0.1.250/dawn/metrics-scraper:v1.0.7
```

Service 修改（增加 `type: NodePort`）：

```yaml
spec:
  type: NodePort
  ports:
    - port: 443
      targetPort: 8443
```

### 3. 部署 Dashboard

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

### 4. 查看部署状态

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

### 5. 访问 Dashboard Web UI

Dashboard 通过 NodePort 暴露，访问地址：

```
https://11.0.1.231:32550/
https://11.0.1.232:32550/
https://11.0.1.233:32550/
```

由于使用自签证书，浏览器会提示不安全，用鼠标点击页面空白处（不要点任何按钮），然后直接键盘敲 thisisunsafe 这几个字母就行。
屏幕上不会显示你输入的内容，但敲完浏览器会自动跳转到 Dashboard 登录页。这个方法适用于 Chrome/Edge 等 Chromium 内核浏览器。

![image-20261103141902917](/images/k8s-dashboard-deployment-and-auth/image-20261103141902917.png)

---

## 三、登录 Dashboard

### 1. 官方默认 SA 权限不足

```bash
root@master:~# kubectl -n kubernetes-dashboard describe sa kubernetes-dashboard | grep Tokens              Tokens:              kubernetes-dashboard-token-8vp5g
```

官方默认 SA `kubernetes-dashboard` 绑定的 ClusterRole 权限有限，不能查看所有资源

### 2. 创建 cluster-admin 权限的 SA（Token 方式登录）

#### 2.1 编写 RBAC YAML

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

#### 2.2 应用 RBAC

```bash
root@master:03-dashboard# kubectl apply -f dawn-dashboard-rbac.yaml
serviceaccount/dawn created
clusterrolebinding.rbac.authorization.k8s.io/kubernetes-dashboard-dawn created
```

#### 2.3 查看 SA 的 Token 名称

```bash
root@master:03-dashboard# kubectl describe serviceaccounts -n kubernetes-dashboard dawn | grep Tokens
Tokens:              dawn-token-99t7v
```

#### 2.4 获取 Token 值

```bash
root@master:03-dashboard# kubectl -n kubernetes-dashboard get secret dawn-token-99t7v -o jsonpath='{.data.token}' | base64 -d
eyJhbGciOiJSUzI1NiIsImtpZCI6Ii0xRnhON2pLS0tCX1RRUEtIcmgyRWY3X3pqRlBlc3hzRzBQdnpsbXhWdEkifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJrdWJlcm5ldGVzLWRhc2hib2FyZCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VjcmV0Lm5hbWUiOiJkYXduLXRva2VuLTk5dDd2Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZXJ2aWNlLWFjY291bnQubmFtZSI6ImRhd24iLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiIzNGY1NDdhOS0wYTZmLTQzYTYtOTJjZS03ZWJlMTk0MmQ3M2QiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6a3ViZXJuZXRlcy1kYXNoYm9hcmQ6ZGF3biJ9.orVBsJnUmDsRRO55VE4FWpQLq2U04goe1IFCEeWpYt7cYmWk8c_bapjqb5UCGEF0g1pOyXbZ9XRWq3aF6W1-rLRa7MOLKvbGbnY4yR1cbtvtHt0eimENt45WFQ3q2hWyQYYku3WDWOhttKi0h6WXZEfnDh_GyptHjOPKylM61qaoxG_xFNp7BH80mUj10A5ksV-O-TLhDRwrkvs-NNlzOfV7RBv6sd98gagLwhHWQvN6_xNDNJ_7O-T8XvXoCtNxXFknyk2xXoMMYqcNF1WkP8h92GfBXEzY2qcdJvD49gYPeKwBH3feGOSppx82f3Ze0Oi36lYwJ8gXDEBbgn4W4A
```

#### 2.5 使用 Token 登录 Dashboard

在浏览器打开 `https://11.0.1.231:32550/`，选择 **Token** 方式，粘贴上述 Token 即可登录，拥有集群全部管理权限

![image-20261103144552317](/images/k8s-dashboard-deployment-and-auth/image-20261103144552317.png)

### 3. 基于 kubeconfig 文件登录

#### 3.1 编写生成 kubeconfig 的脚本

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

#### 3.2 运行脚本生成 kubeconfig

```bash
root@master:03-dashboard# bash dawn-generate-context-conf.sh
Cluster "dawn-k8s-dashboard-cluster" set.
User "dawn-k8s-dashboard-user" set.
Context "dawn-admin" created.
Switched to context "dawn-admin".
kubeconfig generated: ./dawn-k8s-dashboard-admin.conf
```

#### 3.3 使用 kubeconfig 文件登录

将生成的 `dawn-k8s-dashboard-admin.conf` 下载到本地，在 Dashboard 登录页选择 **Kubeconfig** 方式，上传该文件即可登录

![image-20261103154620001](/images/k8s-dashboard-deployment-and-auth/image-20261103154620001.png)

![image-20261103160026553](/images/k8s-dashboard-deployment-and-auth/image-20261103160026553.png)

---

## 四、Dashboard 基本使用

### 1. 创建资源

登录后点击右上角 **"＋"** 按钮，可粘贴 YAML 内容创建资源（Deployment、Service 等）

![image-20261103160151794](/images/k8s-dashboard-deployment-and-auth/image-20261103160151794.png)

![image-20261103160713291](/images/k8s-dashboard-deployment-and-auth/image-20261103160713291.png)

![image-20261103160813306](/images/k8s-dashboard-deployment-and-auth/image-20261103160813306.png)

### 2. 删除资源

在资源列表页勾选目标资源，点击删除按钮即可

![image-20261103160830316](/images/k8s-dashboard-deployment-and-auth/image-20261103160830316.png)

### 3. 修改资源

点击资源进入详情页，点击 编辑 按钮可直接在线修改 YAML 并应用

### 4. 查看资源

- **命名空间级别**：Pods、Deployments、Services、ConfigMaps、Secrets 等
- **集群级别**：Nodes、Namespaces、PersistentVolumes、ClusterRoles 等
- **Pod 详情**：日志查看、终端进入（Exec）、资源监控

Dashboard 中查看 Pod 列表 / 进入容器终端

![image-20261103161211225](/images/k8s-dashboard-deployment-and-auth/image-20261103161211225.png)

![image-20261103161622508](/images/k8s-dashboard-deployment-and-auth/image-20261103161622508.png)