---
title: "K8S ReplicationController 선언적 업데이트 제한 실전: 템플릿을 변경해도 Pod가 자동 갱신되지 않는 이유"
date: 2026-10-31T19:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "본 글에서는 Kubernetes 환경에서 ReplicationController (RC)의 선언적 업데이트 지원 제한을 실습을 통해 검증합니다. 먼저 3개 복제본을 가진 RC와 ClusterIP Service를 배포하여 v1 버전을 확인합니다. 이어 YAML 파일의 이미지 태그를 v2로 변경하고 kubectl apply를 실행하지만, RC 템플릿만 갱신될 뿐 실행 중인 Pod는 v1 상태를 유지합니다. 마지막으로 Pod를 수동 삭제하여 RC가 새 템플릿(v2)으로 Pod를 재생성하도록 유도하고, RC와 Deployment의 근본적인 제어 루프 차이를 살펴봅니다."
---

# K8S ReplicationController 선언적 업데이트 제한 실전: 템플릿을 변경해도 Pod가 자동 갱신되지 않는 이유

Kubernetes에서 `ReplicationController`(약칭 RC)는 지정된 수의 Pod 복제본이 항시 안정적으로 실행되도록 보장하기 위해 설계된 초기 컨트롤러입니다. `kubectl apply`를 통한 선언적 관리를 익힌 초보자들은 흔히 RC 템플릿의 이미지를 수정하면 Deployment처럼 자동 롤링 업데이트가 일어날 것이라 오해하곤 합니다.

본 글에서는 완전한 실습 과정을 통해 ReplicationController의 선언적 업데이트 한계와 Pod 재생성 메커니즘을 상세히 다룹니다.

---

## 1. 환경 준비 및 초기 버전(v1) 배포

### 1.1 매니페스트 작성

RC 설정 파일인 `02-rc-xiuxian-update.yaml`을 작성하고 복제본 3개와 연결될 ClusterIP Service를 정의합니다:

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

### 1.2 리소스 생성 및 상태 확인

`kubectl apply`로 리소스를 생성하고 3개의 Pod가 Running 상태인지 확인합니다:

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

---

## 2. 초기 버전 접근 테스트

Service의 ClusterIP `10.200.40.21`로 연속 요청을 보냅니다:

```bash
[root@master rc]# for i in 1 2 3 4 5 6; do curl -s http://10.200.40.21 | grep -oE '<h1[^>]*>[^<]*</h1>'; sleep 0.5; done
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
<h1 style="color: green">凡人修仙传 v1 </h1>
```

녹색 제목의 "凡人修仙传 v1" 응답이 반환되며 초기 배포가 정상 동작함을 확인할 수 있습니다.

---

## 3. RC 이미지 버전 수정 및 업데이트 동작 관찰

### 3.1 매니페스트 수정 및 적용

이미지 태그를 `v1`에서 `v2`로 수정하고 `kubectl apply`를 다시 실행합니다:

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"
      - image: harbor:443/dawn/apps:v1
[root@master rc]# sed -i 's|dawn/apps:v1|dawn/apps:v2|' 02-rc-xiuxian-update.yaml   # 설정 수정
[root@master rc]# kubectl apply -f 02-rc-xiuxian-update.yaml 
replicationcontroller/rc-xiuxian configured
service/xiuxian-svc unchanged
```

### 3.2 RC 템플릿과 실제 실행 중인 Pod 검사

RC 객체의 yaml을 확인하면 템플릿 자체는 정상적으로 변경되었습니다:

```bash
[root@master rc]# kubectl get rc rc-xiuxian -o yaml | grep -e "- image:"   # RC 이미지 템플릿 수정 완료
      - image: harbor:443/dawn/apps:v2
```

이어 실행 중인 Pod 목록을 확인합니다:

```bash
[root@master rc]# kubectl get pods -o wide  # 그러나 기존 Pod는 자동으로 삭제되거나 갱신되지 않음
NAME               READY   STATUS    RESTARTS   AGE    IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-7jm98   1/1     Running   0          42s    10.100.2.57   worker02   <none>           <none>
rc-xiuxian-9nmsz   1/1     Running   0          42s    10.100.2.58   worker02   <none>           <none>
rc-xiuxian-vkfp6   1/1     Running   0          42s    10.100.1.60   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"  # 실제 Pod 이미지는 여전히 v1
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
    - image: harbor:443/dawn/apps:v1
```

> **핵심 원리 분석**:  
> `kubectl apply`는 RC에 대해 `configured`를 반환했고 RC 내부 템플릿도 `v2`로 업데이트되었습니다. 그러나 **실행 중이던 Pod는 재생성되지 않고 여전히 v1 이미지를 서비스**합니다.  
> 이는 RC와 Deployment의 본질적인 차이입니다. RC에는 사양 변경을 감지하여 점진적으로 교체하는 롤링 업데이트(RollingUpdate) 메커니즘이 없습니다.

---

## 4. Pod 수동 삭제를 통한 새 템플릿 재배포 유도

### 4.1 기존 Pod 삭제

RC의 주된 책임은 '복제본 수의 유지'(현재 기대치: 3개)입니다. 기존 Pod가 삭제되면 복제본 부족을 감지하고 **가장 최신의 Pod Template**(v2)을 기반으로 새 Pod를 띄웁니다:

```bash
[root@master rc]# kubectl delete pods --all  # 기존 Pod 수동 삭제
pod "rc-xiuxian-7jm98" deleted
pod "rc-xiuxian-9nmsz" deleted
pod "rc-xiuxian-vkfp6" deleted
```

### 4.2 새로 생성된 Pod 및 이미지 버전 확인

```bash
[root@master rc]# kubectl get pods -o wide  # RC가 새 Pod를 자동 생성
NAME               READY   STATUS    RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES
rc-xiuxian-8jtfd   1/1     Running   0          10s   10.100.2.59   worker02   <none>           <none>
rc-xiuxian-ff8cv   1/1     Running   0          10s   10.100.1.61   worker01   <none>           <none>
rc-xiuxian-mfqp9   1/1     Running   0          10s   10.100.1.62   worker01   <none>           <none>
[root@master rc]# kubectl get pods -o yaml  | grep -e "- image:"
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
    - image: harbor:443/dawn/apps:v2
```

### 4.3 서비스 접근 재검증

```bash
[root@master rc]# for i in 1 2 3; do curl -s http://10.200.40.21 | grep -oE '<title>[^<]*</title>|<h1[^>]*>[^<]*</h1>'; done
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
<title>DAWN apps v2</title>
<h1 style="color: red">凡人修仙传 v2 </h1>
```

응답 화면이 녹색(v1)에서 빨간색(v2)으로 전환되며 새 이미지가 정상 반영되었음을 확인합니다.

---

## 5. 요약 및 운영 환경 교훈

1. **RC의 본질은 '복제본 수 유지'이지 '버전 관리'가 아님**:  
   RC 컨트롤러 루프는 `selector`에 매칭되는 Pod 수와 `spec.replicas`의 일치 여부만 판단합니다. 일치한다면 정상으로 보고 실행 중인 사양 차이를 무시합니다.
2. **운영 환경에서 '모든 Pod 일괄 삭제'는 금물**:  
   본 실습에서는 `kubectl delete pods --all`을 사용했으나, 실제 운영 환경에서는 전면 서비스 장애(Downtime)가 발생하며 새 이미지 기동 실패 시 복구 불능 상태에 빠질 수 있습니다.
3. **Deployment 적극 활용**:  
   RC는 구시대 리소스로 현재는 Deployment + ReplicaSet 사용이 표준입니다. Deployment는 선언적 롤링 업데이트, 카나리아 배포, 배포 일시 중지 및 즉각적인 롤백(`rollout undo`)을 자체 지원합니다.
