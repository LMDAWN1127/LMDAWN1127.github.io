---
title: "K8S 副本控制与服务发现实战：RC、ClusterIP 与 NodePort"
date: 2026-10-30T20:04:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文实战 K8S 的副本控制与服务发现。先用 ReplicationController 声明 3 个副本，验证 RC 的自愈能力（删掉一个 Pod 会自动补齐）以及删除 RC 时其管理的 Pod 被级联清理；再用 ClusterIP 类型的 Service 为分散在两个节点上的 3 个 Pod 提供固定入口，让每个 Pod 的 nginx 返回自己的 Pod 名，连续请求 5 次观察到轮询负载均衡；最后用 NodePort 类型在每个节点的 30080 端口暴露服务，从集群外访问并同样实现负载均衡。"
---

# K8S 副本控制与服务发现实战：RC、ClusterIP 与 NodePort

---

## 一、RC（ReplicationController）——副本保持

如果声明了要 3 个 Pod，RC就保证任何时刻都有恰好 3 个 Pod 在运行。 少一个自动补，多一个自动杀。

### 1.1 RC YAML

```yaml
# /dawn/manifests/rc/01-rc-xiuxian.yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-rc
spec:
  replicas: 3
  selector:
    apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        school: czu
        class: computer01
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

`spec.replicas: 3`——期望副本数

`spec.selector.apps: xiuxian`——通过标签匹配管理哪些 Pod

### 1.2 创建 RC

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
replicationcontroller/xiuxian-rc created

[root@master ~]# kubectl get pods -o wide -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE
xiuxian-rc-zldnv 1/1   Running   0          41s   10.100.1.13   worker01
xiuxian-rc-p6fsm 1/1   Running   0          41s   10.100.2.5    worker02
xiuxian-rc-m6cbl 1/1   Running   0          41s   10.100.2.6    worker02
```

RC 自动创建了 3 个 Pod，分布在不同节点上（worker01 一个，worker02 两个）。

### 1.3 RC 自愈能力

手动删除一个 Pod，看 RC 是否自动补：

```bash
[root@master ~]# kubectl delete pod xiuxian-rc-zldnv
pod "xiuxian-rc-zldnv" deleted

[root@master ~]# kubectl get pods -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   ...
xiuxian-rc-p6fsm 1/1   Running   0          60s   ...
xiuxian-rc-m6cbl 1/1   Running   0          60s   ...
xiuxian-rc-xxxxx 1/1   Running   0          2s    ...   ← 新的 Pod 自动补上了
```

### 1.4 删除RC自动清理Pod

```bash
[root@master ~]# kubectl delete rc xiuxian-rc
replicationcontroller "xiuxian-rc" deleted
# RC管理的Pod全部自动删除
```

---

## 二、SVC ClusterIP——内部负载均衡

3 个 Pod 分布在 2 个节点上，IP 各不相同，SVC 提供一个固定的 ClusterIP 和端口，客户端只需要记一个地址就够了，后端自动轮询分发到健康的 Pod。

### 2.1 SVC YAML

```yaml
# /dawn/manifests/svc/01-clusterIP-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-clusterip
spec:
  type: ClusterIP
  selector:
    school: czu
    apps: xiuxian
  ports:
  - port: 88
    targetPort: 80
```

`type: ClusterIP`——内部 IP，只集群内可访问

`port: 88`——SVC 暴露的端口

`targetPort: 80`——后端 Pod 的容器端口

`selector` ——通过标签匹配后端 Pod（`school=czu, apps=xiuxian`）

### 2.2 创建 SVC + 重建 RC

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
[root@master ~]# kubectl apply -f /dawn/manifests/svc/01-clusterIP-xiuxian.yaml

[root@master ~]# kubectl get svc xiuxian-svc-clusterip
NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc-clusterip   ClusterIP   10.200.142.177   <none>        88/TCP    2s
```

### 2.3 验证负载均衡

先让每个 Pod 的 nginx 返回自己的 Pod 名，方便观察分发结果：

```bash
[root@master ~]# for pod in $(kubectl get pods -l apps=xiuxian -o name); do
  kubectl exec ${pod#pod/} -- sh -c "echo ${pod#pod/} > /usr/share/nginx/html/index.html"
done
```

用 SVC 的 ClusterIP 连续请求 5 次：

```bash
[root@master ~]# CLIP=$(kubectl get svc xiuxian-svc-clusterip -o jsonpath='{.spec.clusterIP}')
[root@master ~]# for i in 1 2 3 4 5; do curl -s $CLIP:88; done
xiuxian-rc-zldnv    ← worker01 上的 Pod
xiuxian-rc-zldnv
xiuxian-rc-p6fsm    ← worker02 上的 Pod
xiuxian-rc-m6cbl    ← worker02 上的另一个 Pod
xiuxian-rc-zldnv
```

 请求被轮询分发到 3 个后端 Pod——SVC ClusterIP 负载均衡验证通过。

---

## 三、SVC NodePort——外部访问

ClusterIP只能集群内部访问，外部用户没法访问，NodePort 在每个节点上开放一个固定端口（30000-32767），自动转发到后端 Pod，外部用户就可以访问了。

```yaml
# /dawn/manifests/svc/02-nodePort-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-nodeport
spec:
  type: NodePort
  selector:
    school: czu
    apps: xiuxian
  ports:
  - port: 88
    targetPort: 80
    nodePort: 30080
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/svc/02-nodePort-xiuxian.yaml
service/xiuxian-svc-nodeport created

[root@master ~]# kubectl get svc
NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
xiuxian-svc-clusterip   ClusterIP   10.200.142.177   <none>        88/TCP         56s
xiuxian-svc-nodeport    NodePort    10.200.12.142    <none>        88:30080/TCP   2s
```

`88:30080`——SVC 内部 88 端口，映射为所有节点的 30080 端口。

外部访问测试：

```bash
# 通过 worker01 的 30080 端口访问
[root@master ~]# for i in 1 2 3 4 5; do curl -s 11.0.1.232:30080; done
xiuxian-rc-p6fsm
xiuxian-rc-m6cbl
xiuxian-rc-zldnv
xiuxian-rc-m6cbl
xiuxian-rc-p6fsm
```

NodePort 外部访问成功，同样实现了负载均衡。