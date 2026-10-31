---
title: "K8S Pod 포트 노출과 SVC 멀티포트 매핑 실전: hostPort, 멀티포트 매핑 그리고 targetPort 이름 매칭"
date: 2026-10-31T18:29:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 K8S 에서 Pod 포트 노출과 SVC 멀티포트 매핑 두 가지를 다룬다. 전반부는 hostPort 로 컨테이너 80 포트를 Pod 가 있는 노드의 8888 로 직접 매핑해 SVC 없이 외부에서 컨테이너에 직접 도달한다. Windows 에서 접근 테스트가 성공하고, hostPort 와 NodePort 를 비교한다（hostPort 는 Pod 가 있는 노드에서만 동작하고 Pod 가 옮겨지면 주소도 바뀐다. NodePort 는 모든 노드의 같은 포트를 여는 Service 라서 옮겨져도 영향이 없다）. 후반부는 80/TCP 와 53/UDP 를 동시에 노출하는 Pod 를 쓰고 SVC 로 멀티포트 매핑한 뒤 PORT(S) 열과 describe 의 TargetPort/Endpoints 를 확인한다. 마지막으로 kubectl patch 로 targetPort 를 이름 매칭으로 바꿔, 컨테이너 포트 번호가 바뀌어도 이름만 같으면 SVC 가 계속 추적함을 검증한다."
---

# K8S Pod 포트 노출과 SVC 멀티포트 매핑 실전: hostPort, 멀티포트 매핑 그리고 targetPort 이름 매칭

## 1. Pod 포트 노출로 서비스 접근（hostPort）

### 1.1 리소스 매니페스트 작성

```bash
[root@master pods]# cat 15-pods-xiuxian-ports.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-ports
  namespace: default
spec:
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
    # Pod 의 포트 매핑 설정
    ports:
      # 노출할 컨테이너 포트 지정
    - containerPort: 80
      # 호스트의 IP 주소 지정
      hostIP: 0.0.0.0
      # 호스트의 포트 번호 지정
      hostPort: 8888
      # 포트에 별칭을 부여. 유일해야 함
      name: web
      # 컨테이너 포트의 프로토콜 지정. 유효값: UDP,TCP,SCTP, 기본값 TCP
      protocol: TCP
    - containerPort: 53
      name: dns
      protocol: UDP
```

### 1.2 리소스 생성 후 어떤 노드에 스케줄됐는지 확인

```bash
[root@master pods]# kubectl apply -f 15-pods-xiuxian-ports.yaml 
pod/xiuxian-ports created
[root@master pods]# kubectl get pods -o wide
NAME            READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-ports   1/1     Running   0          9s    10.100.2.56   worker02   <none>           <none>
```

### 1.3 Windows 에서 접근 테스트

![image-20261031164202786](/images/k8s-pod-ports-svc-multiport/image-20261031164202786.png)

hostPort 동작. 컨테이너 80 포트가 worker02 의 8888 로 매핑되어 SVC 를 거치지 않고 외부에서 컨테이너로 직접 도달한다



hostPort vs NodePort: hostPort 는 컨테이너 포트를 단일 노드 포트로 직접 매핑하므로 Pod 가 있는 노드에서만 동작하고 Pod 가 옮겨지면 주소도 따라 바뀐다. NodePort 는 Service 가 모든 노드의 같은 포트를 열어 Pod 이동이 접근에 영향을 주지 않는다. 운영에서는 SVC/NodePort 를 권장하고 hostPort 는 디버깅용이다.

---

## 2. SVC 의 멀티포트 매핑

### 2.1 리소스 매니페스트 작성

```bash
[root@master pods]# cat 16-pods-xiuxian-ports-svc.yaml 
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xiuxian-ports-svc
  labels:
    apps: xiuxian
spec:
  containers:
  - image: harbor:443/dawn/apps:v1
    name: xiuxian
    ports:
    - containerPort: 80
      # 이 이름은 서비스를 식별하기 위한 것. 업무 이름도 가능
      name: web
      protocol: TCP
    - containerPort: 53
      name: dns
      protocol: UDP

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
    # svc 의 포트 이름은 백엔드 포트 이름과 일치시키는 것을 권장.
  - port: 80
    # 지정하는 것은 Pod 의 포트 이름. Pod 의 containerPort 를 바꿔도 연동되지 않는다.
    name: web
  - port: 53
    name: dns
    protocol: UDP
```

### 2.2 리소스 생성 후 관찰

```bash
[root@master pods]# kubectl apply -f 16-pods-xiuxian-ports-svc.yaml 
pod/xiuxian-ports-svc created
service/xiuxian-svc created
[root@master pods]# 
[root@master pods]# kubectl get pods,svc -o wide
NAME                    READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
pod/xiuxian-ports-svc   1/1     Running   0          6s      10.100.1.59   worker01   <none>           <none>

NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)         AGE   SELECTOR
service/kubernetes    ClusterIP   10.200.0.1       <none>        443/TCP         19h   <none>
service/xiuxian-svc   ClusterIP   10.200.166.210   <none>        80/TCP,53/UDP   6s    apps=xiuxian
```

SVC 의 `PORT(S)` 열에 `80/TCP,53/UDP` 가 동시에 표시된다 —— 멀티포트 매핑 동작

```bash
[root@master pods]# kubectl describe svc xiuxian-svc
Name:              xiuxian-svc
Namespace:         default
Selector:          apps: xiuxian
Type:              ClusterIP
IP:                10.200.166.210
Port:              web  80/TCP
TargetPort:        80/TCP
Endpoints:         10.100.1.59:80
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.1.59:53
Session Affinity:  None
```

```bash
[root@master pods]# curl -s http://10.200.166.210 | grep -oE '<title>[^<]*</title>'
<title>DAWN apps v1</title>
```

### 2.3 targetPort 를 이름으로 매칭

`targetPort: web`（숫자가 아니라 이름으로 매칭）. SVC 에 패치를 적용해 시연한다:

```bash
[root@master pods]# kubectl patch svc xiuxian-svc --type='json' \
  -p '[{"op":"add","path":"/spec/ports/0/targetPort","value":"web"}]'
service/xiuxian-svc patched
[root@master pods]# kubectl describe svc xiuxian-svc | grep -E 'Port:|TargetPort:|Endpoints:'
Port:              web  80/TCP
TargetPort:        web/TCP          # 이름 매칭 동작
Endpoints:         10.100.1.59:80
Port:              dns  53/UDP
TargetPort:        53/UDP
Endpoints:         10.100.1.59:53
[root@master pods]# curl -s http://10.200.166.210 | grep -oE '<title>[^<]*</title>'
<title>DAWN apps v1</title>         # 접근에 영향 없음
```

`targetPort: web` 은 이름으로 매칭한다. 컨테이너 포트 번호가 바뀌어도 이름 `web` 만 그대로면 SVC 가 자동으로 따라간다. 포트 이름이 컨테이너 포트 번호와 SVC 설정을 느슨하게 결합시킨다