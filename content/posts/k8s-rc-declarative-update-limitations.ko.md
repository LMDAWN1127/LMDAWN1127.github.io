---
title: "RC 리소스는 선언적 업데이트를 지원하지 않음"
date: 2026-10-31T19:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "RC 리소스의 선언적 업데이트 미지원 실전 검증: RC의 Pod 이미지 템플릿을 수정한 후 kubectl apply를 실행해도 실행 중인 Pod가 갱신되지 않는 현상을 확인하고, 기존 Pod를 수동 삭제해야 새 템플릿으로 재생성됨을 검증하며 운영 환경에서 모든 Pod를 일괄 삭제하는 위험성을 짚어봅니다."
---

## RC 리소스는 선언적 업데이트를 지원하지 않음

### 1. 환경 준비

```bash
[root@master rc]# cat 02-rc-xiuxian-update.yaml 
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: rc-xiuxian
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
        ports:
        - containerPort: 80
          name: xiuxian

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    apps: xiuxian
  ports:
  - port: 80
    name: xiuxian
```

```bash
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian created
service/xiuxian-svc created
[root@master rc]# kubectl get pods,svc
NAME                   READY   STATUS    RESTARTS   AGE
pod/rc-xiuxian-7jm98   1/1     Running   0          8s
pod/rc-xiuxian-9nmsz   1/1     Running   0          8s
pod/rc-xiuxian-vkfp6   1/1     Running   0          8s

NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
service/kubernetes    ClusterIP   10.200.0.1       <none>        443/TCP   19h
service/xiuxian-svc   ClusterIP   10.200.40.21     <none>        80/TCP    8s
```

### 2. 접근 테스트

```bash
[root@master rc]# for i in 1 2 3 4 5 6; do curl -s http://10.200.40.21 | grep -oE '<h1[^>]*>[^<]*</h1>'; sleep 0.5; done
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
```

### 3. RC 이미지 이름 수정

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"
      - image: harbor:443/dawn/apps:v1
[root@master rc]# sed -i 's|dawn/apps:v1|dawn/apps:v2|' 02-rc-xiuxian-update.yaml   # 설정 수정
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian configured
service/xiuxian-svc unchanged
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"   # RC 이미지 템플릿 수정 완료
      - image: harbor:443/dawn/apps:v2
[root@master rc]# kubectl get pods -o wide  # 그러나 이전 Pod는 자동으로 삭제되지 않음
NAME               READY   STATUS    RESTARTS   AGE    IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-7jm98   1/1     Running   0          42s    10.100.2.57   worker02   <none>           <none>
rc-xiuxian-9nmsz   1/1     Running   0          42s    10.100.2.58   worker02   <none>           <none>
rc-xiuxian-vkfp6   1/1     Running   0          42s    10.100.1.60   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"  # 이미지는 업데이트되지 않음
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
```

`kubectl apply`는 RC에 대해 `configured`를 반환하고 RC의 template은 v2로 업데이트되었지만, 실행 중인 Pod는 재생성되지 않고 여전히 v1을 사용합니다. 이것이 RC와 Deployment의 핵심 차이점입니다 (RC는 롤링 업데이트 미지원).

### 4. 수동으로 Pod를 삭제하여 새 템플릿 재생성 트리거

```bash
[root@master rc]# kubectl delete pods --all  # 수동으로 기존 Pod 삭제
pod "rc-xiuxian-7jm98" deleted
pod "rc-xiuxian-9nmsz" deleted
pod "rc-xiuxian-vkfp6" deleted
[root@master rc]# kubectl get pods -o wide  # 자동으로 새 Pod가 생성되며 새 Pod는 새 이미지 버전을 사용함
NAME               READY   STATUS    RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-8jtfd   1/1     Running   0          10s   10.100.2.59   worker02   <none>           <none>
rc-xiuxian-ff8cv   1/1     Running   0          10s   10.100.1.61   worker01   <none>           <none>
rc-xiuxian-mfqp9   1/1     Running   0          10s   10.100.1.62   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
```

```bash
[root@master rc]# for i in 1 2 3; do curl -s http://10.200.40.21 | grep -oE '<title>[^<]*</title>|<h1[^>]*>[^<]*</h1>'; done
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
```

페이지가 "녹색 제목의 v1"에서 "빨간색 제목의 v2"로 바뀌며 새 이미지가 적용됨



참고:

1. RC 리소스는 선언적 업데이트를 지원하지 않으며, Pod를 수동으로 삭제해야 새 템플릿을 사용할 수 있습니다.

2. 위처럼 모든 Pod를 직접 삭제하는 방식은 권장되지 않습니다. 이 실습에서는 성공했으나 실제로는 새 이미지가 시작되지 않거나 이미지를 가져올 수 없거나 시작 후 버그가 발생하는 상황이 발생할 수 있습니다.
