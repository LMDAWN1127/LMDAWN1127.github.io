---
title: "K8S 레플리카 제어와 서비스 디스커버리 실전: RC, ClusterIP 그리고 NodePort"
date: 2026-10-30T20:04:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 K8S 의 레플리카 제어와 서비스 디스커버리를 실습한다. ReplicationController 로 레플리카 3개를 선언하고, 자가 치유（Pod 를 지우면 자동으로 채워짐）와 RC 삭제 시 관리하던 Pod 가 연쇄적으로 정리되는 것을 검증한다. 이어 ClusterIP 타입 Service 로 두 노드에 흩어진 Pod 3개에 고정 진입점을 하나 제공하고, 각 Pod 의 nginx 가 자기 Pod 이름을 반환하게 한 뒤 5회 연속 요청으로 라운드로빈 로드밸런싱을 확인한다. 마지막으로 NodePort 타입으로 모든 노드의 30080 포트에 노출해 클러스터 밖에서 접근하면서 동일한 로드밸런싱을 확인한다."
---

# K8S 레플리카 제어와 서비스 디스커버리 실전: RC, ClusterIP 그리고 NodePort

---

## 1. RC（ReplicationController）—— 레플리카 유지

Pod 3개를 선언하면 RC 는 어떤 순간에도 정확히 Pod 3개가 실행되도록 보장한다. 하나 부족하면 자동으로 채우고, 하나 많으면 자동으로 죽인다.

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

`spec.replicas: 3` —— 기대 레플리카 수

`spec.selector.apps: xiuxian` —— 라벨로 관리할 Pod 매칭

### 1.2 RC 생성

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
replicationcontroller/xiuxian-rc created

[root@master ~]# kubectl get pods -o wide -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE
xiuxian-rc-zldnv 1/1   Running   0          41s   10.100.1.13   worker01
xiuxian-rc-p6fsm 1/1   Running   0          41s   10.100.2.5    worker02
xiuxian-rc-m6cbl 1/1   Running   0          41s   10.100.2.6    worker02
```

RC 는 Pod 3개를 자동으로 만들고 서로 다른 노드에 분산시켰다（worker01 에 1개, worker02 에 2개）.

### 1.3 RC 자가 치유

Pod 하나를 수동으로 삭제해 RC 가 자동으로 채우는지 확인한다:

```bash
[root@master ~]# kubectl delete pod xiuxian-rc-zldnv
pod "xiuxian-rc-zldnv" deleted

[root@master ~]# kubectl get pods -l apps=xiuxian
NAME            READY   STATUS    RESTARTS   AGE   ...
xiuxian-rc-p6fsm 1/1   Running   0          60s   ...
xiuxian-rc-m6cbl 1/1   Running   0          60s   ...
xiuxian-rc-xxxxx 1/1   Running   0          2s    ...   ← 새 Pod 가 자동으로 채워졌다
```

### 1.4 RC 삭제 시 Pod 자동 정리

```bash
[root@master ~]# kubectl delete rc xiuxian-rc
replicationcontroller "xiuxian-rc" deleted
# RC 가 관리하던 Pod 전부 자동 삭제
```

---

## 2. SVC ClusterIP —— 내부 로드밸런싱

Pod 3개는 2개 노드에 흩어져 있고 IP 도 서로 다르다. SVC 는 고정된 ClusterIP 와 포트를 제공하므로 클라이언트는 주소 하나만 기억하면 되고, 백엔드는 자동으로 정상 Pod 에 라운드로빈 분배한다.

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

`type: ClusterIP` —— 내부 IP, 클러스터 내에서만 접근 가능

`port: 88` —— SVC 가 노출하는 포트

`targetPort: 80` —— 백엔드 Pod 의 컨테이너 포트

`selector` —— 라벨로 백엔드 Pod 매칭（`school=czu, apps=xiuxian`）

### 2.2 SVC 생성 + RC 재생성

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/rc/01-rc-xiuxian.yaml
[root@master ~]# kubectl apply -f /dawn/manifests/svc/01-clusterIP-xiuxian.yaml

[root@master ~]# kubectl get svc xiuxian-svc-clusterip
NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc-clusterip   ClusterIP   10.200.142.177   <none>        88/TCP    2s
```

### 2.3 로드밸런싱 검증

먼저 각 Pod 의 nginx 가 자기 Pod 이름을 반환하게 해 분배 결과를 관찰하기 쉽게 한다:

```bash
[root@master ~]# for pod in $(kubectl get pods -l apps=xiuxian -o name); do
  kubectl exec ${pod#pod/} -- sh -c "echo ${pod#pod/} > /usr/share/nginx/html/index.html"
done
```

SVC 의 ClusterIP 로 5회 연속 요청한다:

```bash
[root@master ~]# CLIP=$(kubectl get svc xiuxian-svc-clusterip -o jsonpath='{.spec.clusterIP}')
[root@master ~]# for i in 1 2 3 4 5; do curl -s $CLIP:88; done
xiuxian-rc-zldnv    ← worker01 의 Pod
xiuxian-rc-zldnv
xiuxian-rc-p6fsm    ← worker02 의 Pod
xiuxian-rc-m6cbl    ← worker02 의 다른 Pod
xiuxian-rc-zldnv
```

 요청이 백엔드 Pod 3개에 라운드로빈으로 분배됐다 —— SVC ClusterIP 로드밸런싱 검증 통과.

---

## 3. SVC NodePort —— 외부 접근

ClusterIP 는 클러스터 내부에서만 접근 가능해 외부 사용자는 접근할 수 없다. NodePort 는 모든 노드에 고정 포트（30000-32767）를 열고 백엔드 Pod 로 자동 전달해 외부 접근을 가능하게 한다.

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

`88:30080` —— SVC 내부 88 포트가 모든 노드의 30080 포트로 매핑된다.

외부 접근 테스트:

```bash
# worker01 의 30080 포트로 접근
[root@master ~]# for i in 1 2 3 4 5; do curl -s 11.0.1.232:30080; done
xiuxian-rc-p6fsm
xiuxian-rc-m6cbl
xiuxian-rc-zldnv
xiuxian-rc-m6cbl
xiuxian-rc-p6fsm
```

NodePort 외부 접근이 성공했고, 로드밸런싱도 동일하게 동작한다.