---
title: "Kubernetes 블루-그린 배포 및 카나리 릴리스 실전: 3가지 배포 전략 비교"
date: 2026-10-31T20:05:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Service", "ReplicationController", "BlueGreen", "Canary"]
showToc: true
summary: "Kubernetes 환경에서 블루-그린 배포, 카나리 배포, A/B 테스트 3가지 릴리스 전략을 심층 비교합니다. 이중 ReplicationController와 Service 라벨 셀렉터 교체(apps: xiuxian -> apps: green)를 통한 무중단 즉각 트래픽 전환의 블루-그린 배포 실전과, 이중 라벨 설계(비즈니스 라벨 school: czu 및 버전 라벨 apps: v1/v2)와 레플리카 수 점진적 조절을 통한 카나리 릴리스 전 과정을 상세히 기록합니다."
---

# Kubernetes 블루-그린 배포 및 카나리 릴리스 실전: 3가지 배포 전략 비교

## 1. 3가지 배포 전략 비교

| 전략 | 특징 | 단점 |
| --- | --- | --- |
| 블루-그린 배포 | 두 개(블루, 그린) 환경을 동시 배포하지만, 오직 한 세트의 환경만 외부 서비스를 제공 | 한 세트의 환경이 유휴 상태로 대기 |
| 카나리 배포 (카나리아/그레이) | 점진적으로 교체하며 한 번에 전체를 변경하지 않음. 애플리케이션 일부를 업그레이드하여 테스트하고 신/구 버전이 단기 공존 후 최종적으로 신규 버전으로 전체 교체 | 업데이트 범위를 세밀하게 제어하기 어려움 |
| A/B 테스트 | 특정 사용자 그룹이 새 버전에 접근할 수 있도록 허용 | 별도 컴포넌트 구축 필요 (예: Istio 활용) |

Kubernetes에서 3가지 배포 방식을 구현하는 핵심 로직:

**블루-그린**: ① 컨트롤러를 통해 blue 버전 생성; ② svc를 blue 버전 Pod에 연결; ③ 컨트롤러를 통해 green 버전 생성; ④ svc 라벨 셀렉터를 green 버전으로 수정.

**카나리**: ① 컨트롤러를 통해 구버전 애플리케이션 생성, 라벨 2세트 설정(`apps: v1` + `type: xiuxian`), 레플리카 3; ② svc를 공통 비즈니스 라벨(`type: xiuxian`)에 연결; ③ 컨트롤러를 통해 신버전 애플리케이션 생성, 동일하게 라벨 2세트(`apps: v2` + `type: xiuxian`), 레플리카 1; ④ 구버전 레플리카 3→0, 신버전 레플리카 1→3으로 스케일.

**A/B**: 사용자 속성에 따른 트래픽 라우팅을 위해 Istio 등의 컴포넌트가 필요하며, 본 환경에는 미구축 상태이므로 개념 비교로만 기재.

## 2. 블루-그린 배포 실전

작업 디렉토리 `/dawn/manifests/01-blue-green/`, 총 3개의 매니페스트.

### 1. 블루 버전 배포

```bash
[root@master 01-blue-green]# cat 01-blue-xiuxian-v1.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-blue
spec:
  replicas: 3
  selector:
    apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

```bash
[root@master 01-blue-green]# cat 02-svc-xiuxian.yaml
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
    targetPort: 80
[root@master 01-blue-green]# kubectl apply -f .
replicationcontroller/xiuxian-blue created
service/xiuxian-svc created
[root@master 01-blue-green]# kubectl get pods -l apps=xiuxian -o wide
NAME                 READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-blue-fh7v9   1/1     Running   0          23s   10.100.2.61   worker02   <none>           <none>
xiuxian-blue-phnjx   1/1     Running   0          24s   10.100.1.63   worker01   <none>           <none>
xiuxian-blue-pznkf   1/1     Running   0          23s   10.100.1.64   worker01   <none>           <none>
```

### 2. 접근 테스트

```bash
[root@master 01-blue-green]# kubectl get svc xiuxian-svc
NAME          TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc   ClusterIP   10.200.250.148   <none>        80/TCP    4s
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

10회 요청 모두 v1에 적중하며 블루 버전이 단독으로 트래픽을 처리합니다.

### 3. 그린 버전 배포

```bash
[root@master 01-blue-green]# cat 03-green-xiuxian-v2.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-green
spec:
  replicas: 3
  selector:
    apps: green
  template:
    metadata:
      labels:
        apps: green
    spec:
      containers:
      - image: harbor:443/dawn/apps:v2
        name: xiuxian
```

```bash
[root@master 01-blue-green]# kubectl apply -f 03-green-xiuxian-v2.yaml
replicationcontroller/xiuxian-green created
[root@master 01-blue-green]# kubectl get pods -o wide -l apps=green
NAME                  READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-green-4xgc6   1/1     Running   0          8s    10.100.2.62   worker02   <none>           <none>
xiuxian-green-9cghm   1/1     Running   0          8s    10.100.1.65   worker01   <none>           <none>
xiuxian-green-bcbjs   1/1     Running   0          8s    10.100.2.63   worker02   <none>           <none>
```

현재 블루와 그린 두 세트 총 6개의 Pod가 모두 Running 상태이지만, svc 셀렉터는 여전히 `apps: xiuxian`이므로 트래픽은 여전히 블루 버전으로만 향합니다. 루프 요청으로 재검증:

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
      8 DAWN apps v1
```

8회 요청 모두 여전히 v1이며, 그린 버전은 "배포되었으나 서비스는 제공하지 않는" 대기 상태입니다. 이는 블루-그린 배포의 단점인 "한 세트 환경의 유휴 대기"를 직관적으로 보여주며, 동시에 언제든 즉시 안전하게 롤백할 수 있는 이유이기도 합니다.

### 4. 버전 전환

svc 셀렉터를 수정하여 블루를 주석 처리하고 그린으로 교체합니다:

```bash
[root@master 01-blue-green]# sed -i 's|^    apps: xiuxian|    # apps: xiuxian\n    apps: green|' 02-svc-xiuxian.yaml
[root@master 01-blue-green]# cat 02-svc-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    # apps: xiuxian
    apps: green
  ports:
  - port: 80
    targetPort: 80
[root@master 01-blue-green]# kubectl apply -f 02-svc-xiuxian.yaml
service/xiuxian-svc configured
[root@master 01-blue-green]# kubectl describe svc xiuxian-svc
Name:              xiuxian-svc
Namespace:         default
Labels:            <none>
Annotations:       <none>
Selector:          apps=green
Type:              ClusterIP
IP Family Policy:  SingleStack
IP Families:       IPv4
IP:                10.200.250.148
IPs:               10.200.250.148
Port:              <unset>  80/TCP
TargetPort:        80/TCP
Endpoints:         10.100.1.65:80,10.100.2.62:80,10.100.2.63:80
Session Affinity:  None
Events:            <none>
```

`Selector`가 `apps=xiuxian`에서 `apps=green`으로 변경;

`Endpoints`가 3개의 블루 Pod에서 3개의 그린 Pod로 즉각 핫스왑;

ClusterIP는 10.200.250.148로 동일하게 유지되어 클라이언트는 아무런 설정 변경 없이 무중단으로 접근 가능합니다.

루프 검증 시 트래픽이 완전히 그린 버전으로 전환되었습니다:

```bash
[root@master 01-blue-green]# while true; do curl -s 10.200.250.148 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v2
```

10회 요청 모두 v2에 도달하며 전환이 완료되었습니다. 만약 새 버전에 이상이 발생하면 svc 셀렉터를 다시 `apps: xiuxian`으로 변경 후 apply하기만 하면 즉시 롤백됩니다. 블루 Pod는 여전히 정상 동작 중이기 때문입니다.

### 5. 테스트 환경 정리

```bash
[root@master 01-blue-green]# kubectl delete -f .
replicationcontroller "xiuxian-blue" deleted
service "xiuxian-svc" deleted
replicationcontroller "xiuxian-green" deleted
[root@master 01-blue-green]# kubectl get all
NAME                 TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/kubernetes   ClusterIP   10.200.0.1     <none>        443/TCP   22h
```

## 3. 카나리 배포 실전

작업 디렉토리 `/dawn/manifests/02-huidu/`, 총 3개의 매니페스트. 핵심 설계는 이중 라벨 구조입니다: `apps: v1/v2`로 버전을 구분하고 `school: czu`를 공통 비즈니스 라벨로 사용합니다. svc가 `school: czu`를 선택함으로써 신/구 버전의 Pod가 동시에 Endpoints에 진입하고 레플리카 비율에 따라 트래픽이 분산됩니다.

### 1. 구버전 배포

```bash
[root@master 02-huidu]# cat 01-old-xiuxian-v1.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-old
spec:
  replicas: 3
  selector:
    apps: v1
  template:
    metadata:
      labels:
        apps: v1
        school: czu
    spec:
      containers:
      - image: harbor:443/dawn/apps:v1
        name: xiuxian
```

```bash
[root@master 02-huidu]# cat 02-svc-xiuxian.yaml
apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc
spec:
  type: ClusterIP
  selector:
    school: czu
  ports:
  - port: 80
    targetPort: 80
[root@master 02-huidu]# kubectl apply -f .
replicationcontroller/xiuxian-old created
service/xiuxian-svc created
[root@master 02-huidu]# kubectl get pods -l apps=v1 -o wide
NAME                READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-old-gd5lf   1/1     Running   0          8s    10.100.1.66   worker01   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          8s    10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          8s    10.100.2.64   worker02   <none>           <none>
[root@master 02-huidu]# kubectl get svc
NAME          TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
kubernetes    ClusterIP   10.200.0.1      <none>        443/TCP   3d
xiuxian-svc   ClusterIP   10.200.28.1     <none>        80/TCP    17s
```

### 2. 애플리케이션 테스트

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.5; done
     10 DAWN apps v1
```

10회 요청 모두 v1으로 전송되며 구버전이 정상 동작합니다.

### 3. 신버전 배포

```bash
[root@master 02-huidu]# cat 03-new-xiuxian-v2.yaml
```

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: xiuxian-new
spec:
  replicas: 1
  selector:
    apps: v2
  template:
    metadata:
      labels:
        apps: v2
        school: czu
    spec:
      containers:
      - image: harbor:443/dawn/apps:v2
        name: xiuxian
```

```bash
[root@master 02-huidu]# kubectl apply -f 03-new-xiuxian-v2.yaml
replicationcontroller/xiuxian-new created
[root@master 02-huidu]# kubectl get pods -o wide -l apps=v2
NAME                READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          8s    10.100.1.67   worker01   <none>           <none>
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          8s      10.100.1.67   worker01   <none>           <none>
xiuxian-old-gd5lf   1/1     Running   0          2m25s   10.100.1.66   worker01   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          2m25s   10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          2m25s   10.100.2.64   worker02   <none>           <none>
```

신버전 1개 레플리카가 온라인 상태가 되었습니다. `-l school`로 조회하면 4개의 Pod 모두 `school=czu` 라벨을 달고 svc 백엔드에 연결된 것을 확인할 수 있습니다.

### 4. Pod 접근 현황 관찰

이 시점에 신버전과 구버전이 공존하는 현상이 발생합니다. 8초간 루프 접근:

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     20 DAWN apps v1
      6 DAWN apps v2
```

v1 20회 + v2 6회로 약 23%의 트래픽이 신규 버전으로 전달되며, 레플리카 비율(신규 1개 / 전체 4개 = 25%)과 거의 일치합니다.

### 5. 신규 버전으로 점진적 구버전 교체

구버전 레플리카 3→0, 신버전 1→3으로 3단계에 걸쳐 진행합니다.

**1단계: 구 3→2, 신 1→2**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=2
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl scale rc xiuxian-new --replicas=2
replicationcontroller/xiuxian-new scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          117s    10.100.1.67   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          6s      10.100.2.66   worker02   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          4m14s   10.100.2.65   worker02   <none>           <none>
xiuxian-old-n8cwh   1/1     Running   0          4m14s   10.100.2.64   worker02   <none>           <none>
```

신/구 2:2 비율로 트래픽이 거의 반반으로 분산됩니다.

**2단계: 구 2→1, 신 2→3**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=1
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl scale rc xiuxian-new --replicas=3
replicationcontroller/xiuxian-new scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          2m44s   10.100.1.67   worker01   <none>           <none>
xiuxian-new-b97q2   1/1     Running   0          6s      10.100.1.68   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          53s     10.100.2.66   worker02   <none>           <none>
xiuxian-old-kw86b   1/1     Running   0          5m1s     10.100.2.65   worker02   <none>           <none>
```

신/구 1:3 비율로 신버전이 약 75%의 트래픽을 감당합니다.

**3단계: 구 1→0**

```bash
[root@master 02-huidu]# kubectl scale rc xiuxian-old --replicas=0
replicationcontroller/xiuxian-old scaled
[root@master 02-huidu]# kubectl get pods -o wide -l school
NAME                READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
xiuxian-new-b6gbc   1/1     Running   0          3m47s   10.100.1.67   worker01   <none>           <none>
xiuxian-new-b97q2   1/1     Running   0          69s     10.100.1.68   worker01   <none>           <none>
xiuxian-new-xldbm   1/1     Running   0          116s    10.100.2.66   worker02   <none>           <none>
[root@master 02-huidu]# kubectl get rc
NAME          DESIRED   CURRENT   READY   AGE
xiuxian-new   3         3         3       3m47s
xiuxian-old   0         0         0       6m4s
```

### 6. 결과 데이터 관찰

클러스터에는 v2 버전만 남아있으며 구버전 레플리카는 0이 됩니다.

```bash
[root@master 02-huidu]# while true; do curl -s 10.200.28.1 | grep -o "DAWN apps v[12]"; sleep 0.3; done
     17 DAWN apps v2
[root@master 02-huidu]# kubectl get endpoints xiuxian-svc
NAME          ENDPOINTS                                      AGE
xiuxian-svc   10.100.1.67:80,10.100.1.68:80,10.100.2.66:80   7m32s
```

17회 요청 모두 v2로 전송되고 Endpoints에는 3개의 신버전 Pod만 남아 카나리 배포가 완료되었습니다.
