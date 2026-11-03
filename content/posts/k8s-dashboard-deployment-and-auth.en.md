---
title: "Kubernetes Dashboard Streamlined Deployment: Resolving Privilege Deficits and Implementing Dual Token & Kubeconfig Authentication"
date: 2026-11-03T16:15:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Dashboard", "RBAC", "WebUI"]
showToc: true
summary: "A comprehensive walkthrough on deploying the Kubernetes Dashboard add-on with local registry image substitution and NodePort exposure. Solves official default ServiceAccount privilege limitations via cluster-admin ClusterRoleBinding, detailing both Bearer Token extraction and automated Kubeconfig credential generation."
---

# Kubernetes Dashboard Streamlined Deployment: Resolving Privilege Deficits and Implementing Dual Token & Kubeconfig Authentication

---

## 1. Kubernetes and Dashboard Version Compatibility

### 1. Overview

Kubernetes Dashboard provides a graphical Web UI to manage Kubernetes clusters with operational simplicity. Its main limitation is the lack of native multi-cluster management and relatively basic built-in tooling compared to platforms like Rancher, Kuboard, or KubeSphere in complex production environments.

Kubernetes version 1.23 corresponds to Dashboard v2.5.1.

**Reference link**: https://github.com/kubernetes/dashboard/releases/tag/v2.5.1

---

## 2. Deploying Dashboard Components

### 1. Download recommended.yaml

```bash
root@master:03-dashboard# wget https://raw.githubusercontent.com/kubernetes/dashboard/v2.5.1/aio/deploy/recommended.yaml
root@master:03-dashboard# wc -l recommended.yaml
306 recommended.yaml
```

### 2. Modify YAML Configuration

The upstream YAML uses default `kubernetesui/` images and configures the Service as ClusterIP. Required modifications:

1. Change image registries to the local Harbor instance (`11.0.1.250/dawn/`).

2. Change Service type to `NodePort`.

Before modification (image references):

```yaml
image: kubernetesui/dashboard:v2.5.1
image: kubernetesui/metrics-scraper:v1.0.7
```

After modification:

```yaml
image: 11.0.1.250/dawn/dashboard:v2.5.1
image: 11.0.1.250/dawn/metrics-scraper:v1.0.7
```

Service modification (add `type: NodePort`):

```yaml
spec:
  type: NodePort
  ports:
    - port: 443
      targetPort: 8443
```

### 3. Deploy Dashboard

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

### 4. Inspect Deployment Status

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

### 5. Access Dashboard Web UI

Dashboard is exposed via NodePort across cluster nodes:

```
https://11.0.1.231:32550/
https://11.0.1.232:32550/
https://11.0.1.233:32550/
```

Due to self-signed TLS certificates, modern browsers will display an untrusted certificate warning. Click on the empty space of the browser page (do not click any button), then type the characters `thisisunsafe` on your keyboard.
The typed characters will not appear on the screen, but once entered, Chromium-based browsers (Chrome, Edge, etc.) will bypass the warning and navigate to the Dashboard login portal.

![image-20261103141902917](/images/k8s-dashboard-deployment-and-auth/image-20261103141902917.png)

---

## 3. Logging into Dashboard

### 1. Upstream Default SA Privilege Limitations

```bash
root@master:~# kubectl -n kubernetes-dashboard describe sa kubernetes-dashboard | grep Tokens              Tokens:              kubernetes-dashboard-token-8vp5g
```

The upstream default ServiceAccount `kubernetes-dashboard` possesses minimal cluster permissions and cannot inspect global workloads.

### 2. Provisioning cluster-admin SA (Token Authentication)

#### 2.1 Define RBAC Manifest

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

#### 2.2 Apply RBAC Manifest

```bash
root@master:03-dashboard# kubectl apply -f dawn-dashboard-rbac.yaml
serviceaccount/dawn created
clusterrolebinding.rbac.authorization.k8s.io/kubernetes-dashboard-dawn created
```

#### 2.3 Inspect SA Token Name

```bash
root@master:03-dashboard# kubectl describe serviceaccounts -n kubernetes-dashboard dawn | grep Tokens
Tokens:              dawn-token-99t7v
```

#### 2.4 Extract Token Secret

```bash
root@master:03-dashboard# kubectl -n kubernetes-dashboard get secret dawn-token-99t7v -o jsonpath='{.data.token}' | base64 -d
eyJhbGciOiJSUzI1NiIsImtpZCI6Ii0xRnhON2pLS0tCX1RRUEtIcmgyRWY3X3pqRlBlc3hzRzBQdnpsbXhWdEkifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJrdWJlcm5ldGVzLWRhc2hib2FyZCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VjcmV0Lm5hbWUiOiJkYXduLXRva2VuLTk5dDd2Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZXJ2aWNlLWFjY291bnQubmFtZSI6ImRhd24iLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiIzNGY1NDdhOS0wYTZmLTQzYTYtOTJjZS03ZWJlMTk0MmQ3M2QiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6a3ViZXJuZXRlcy1kYXNoYm9hcmQ6ZGF3biJ9.orVBsJnUmDsRRO55VE4FWpQLq2U04goe1IFCEeWpYt7cYmWk8c_bapjqb5UCGEF0g1pOyXbZ9XRWq3aF6W1-rLRa7MOLKvbGbnY4yR1cbtvtHt0eimENt45WFQ3q2hWyQYYku3WDWOhttKi0h6WXZEfnDh_GyptHjOPKylM61qaoxG_xFNp7BH80mUj10A5ksV-O-TLhDRwrkvs-NNlzOfV7RBv6sd98gagLwhHWQvN6_xNDNJ_7O-T8XvXoCtNxXFknyk2xXoMMYqcNF1WkP8h92GfBXEzY2qcdJvD49gYPeKwBH3feGOSppx82f3Ze0Oi36lYwJ8gXDEBbgn4W4A
```

#### 2.5 Log into Dashboard Using Token

Open `https://11.0.1.231:32550/` in your browser, select the **Token** option, paste the token above, and log in with full administrative privileges.

![image-20261103144552317](/images/k8s-dashboard-deployment-and-auth/image-20261103144552317.png)

### 3. Kubeconfig-Based Authentication

#### 3.1 Script Automated Kubeconfig Generation

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

#### 3.2 Execute Generation Script

```bash
root@master:03-dashboard# bash dawn-generate-context-conf.sh
Cluster "dawn-k8s-dashboard-cluster" set.
User "dawn-k8s-dashboard-user" set.
Context "dawn-admin" created.
Switched to context "dawn-admin".
kubeconfig generated: ./dawn-k8s-dashboard-admin.conf
```

#### 3.3 Log in via Kubeconfig File

Download `dawn-k8s-dashboard-admin.conf` to your local machine, select **Kubeconfig** on the login page, upload the file, and proceed.

![image-20261103154620001](/images/k8s-dashboard-deployment-and-auth/image-20261103154620001.png)

![image-20261103160026553](/images/k8s-dashboard-deployment-and-auth/image-20261103160026553.png)

---

## 4. Fundamental Dashboard Operations

### 1. Creating Resources

Click the **"+"** button at the top-right corner to paste YAML specifications and instantiate resources (Deployments, Services, etc.).

![image-20261103160151794](/images/k8s-dashboard-deployment-and-auth/image-20261103160151794.png)

![image-20261103160713291](/images/k8s-dashboard-deployment-and-auth/image-20261103160713291.png)

![image-20261103160813306](/images/k8s-dashboard-deployment-and-auth/image-20261103160813306.png)

### 2. Deleting Resources

Select targeted objects from the resource list view and click the Delete button.

![image-20261103160830316](/images/k8s-dashboard-deployment-and-auth/image-20261103160830316.png)

### 3. Modifying Resources

Navigate to resource detail views and click Edit to modify live YAML manifests directly.

### 4. Inspecting Resources

- **Namespace Scope**: Pods, Deployments, Services, ConfigMaps, Secrets, etc.
- **Cluster Scope**: Nodes, Namespaces, PersistentVolumes, ClusterRoles, etc.
- **Pod Diagnostics**: Live logs streaming, container terminal execution (Exec), and metrics monitoring.

Viewing Pod inventories and accessing container shells in the Dashboard:

![image-20261103161211225](/images/k8s-dashboard-deployment-and-auth/image-20261103161211225.png)

![image-20261103161622508](/images/k8s-dashboard-deployment-and-auth/image-20261103161622508.png)
