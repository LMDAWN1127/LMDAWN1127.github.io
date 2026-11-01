---
title: "K8S ReplicaSet 및 Deployment 컨트롤러 실전: 레플리카 제어, 롤링 업데이트 및 롤백 메커니즘"
date: 2026-11-01T11:28:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "ReplicaSet", "Deployment"]
showToc: true
summary: "Kubernetes의 ReplicaSet 및 Deployment 컨트롤러에 대한 심층 실전 가이드입니다. matchLabels 및 matchExpressions 라벨 셀렉터의 기존 Pod 입양(Adoption) 메커니즘, Recreate 및 RollingUpdate 배포 전략(maxSurge 및 maxUnavailable 심층 분석), 그리고 선언적/명령형 롤아웃 업데이트와 다중 버전 롤백 전체 프로세스를 상세히 다룹니다."
---

# K8S ReplicaSet 및 Deployment 컨트롤러 실전: 레플리카 제어, 롤링 업데이트 및 롤백 메커니즘

## 1. rs 컨트롤러

### 1. 역할

Pod의 복제본(Replica) 제어를 구현할 수 있으며, rc 리소스에 비해 기능이 더 강력하고 경량입니다.

### 2. 사례 1——rs로 rc와 유사한 기능 구현

작업 디렉터리 `/dawn/manifests/rs/`

```bash
[root@master rs]# cat 01-rs-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian
spec:
  # Pod의 복제본 수 지정
  replicas: 3
  # Pod 연결 방식 정의
  selector:
    # 라벨 기반으로 Pod 연결
    matchLabels:
      apps: xiuxian
  # Pod 템플릿 정의
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

```bash
[root@master rs]# kubectl apply -f 01-rs-xiuxian-matchLabels.yaml
replicaset.apps/rs-xiuxian created
[root@master rs]# kubectl get rs -o wide
NAME         DESIRED   CURRENT   READY   AGE   CONTAINERS   IMAGES                    SELECTOR
rs-xiuxian   3         3         3       6s    c1           harbor:443/dawn/apps:v1   apps=xiuxian
[root@master rs]# kubectl get pods --show-labels
NAME               READY   STATUS    RESTARTS   AGE   LABELS
rs-xiuxian-gdq7b   1/1     Running   0          6s    apps=xiuxian,version=v1
rs-xiuxian-m9xqr   1/1     Running   0          6s    apps=xiuxian,version=v1
rs-xiuxian-rcdnr   1/1     Running   0          6s    apps=xiuxian,version=v1
```

3개의 Pod가 모두 Running 상태이며 라벨이 템플릿과 일치합니다. rc와 마찬가지로 matchLabels 동등 기반 셀렉터가 복제본 제어를 완료했습니다.

### 3. 사례 2——rs가 rc보다 우수한 기능 (matchExpressions 입양)

#### 3.1 테스트 환경 준비

먼저 `kubectl run`을 사용하여 4개의 베어(Bare) Pod를 생성하고 서로 다른 라벨을 부여합니다.

k8s v1.23의 `kubectl run`은 기본적으로 Pod가 아닌 Deployment를 생성하므로, 베어 Pod를 생성하려면 `--restart=Never`를 추가해야 합니다.

```bash
[root@master ~]# kubectl run xiuxian01 --image=harbor:443/dawn/apps:v1 --restart=Never
pod/xiuxian01 created
[root@master ~]# kubectl run xiuxian02 --image=harbor:443/dawn/apps:v2 --restart=Never
pod/xiuxian02 created
[root@master ~]# kubectl run xiuxian03 --image=harbor:443/dawn/apps:v3 --restart=Never
pod/xiuxian03 created
[root@master ~]# kubectl label pod xiuxian01 apps=v1
pod/xiuxian01 labeled
[root@master ~]# kubectl label pod xiuxian02 apps=v2
pod/xiuxian02 labeled
[root@master ~]# kubectl label pod xiuxian03 apps=v3
pod/xiuxian03 labeled
[root@master ~]# kubectl get pods --show-labels
NAME        READY   STATUS    RESTARTS   AGE   LABELS
xiuxian01   1/1     Running   0          9s    apps=v1,run=xiuxian01
xiuxian02   1/1     Running   0          8s    apps=v2,run=xiuxian02
xiuxian03   1/1     Running   0          8s    apps=v3,run=xiuxian03
[root@master ~]# kubectl run xiuxian04 --image=harbor:443/dawn/apps:v2 --restart=Never
pod/xiuxian04 created
[root@master ~]# kubectl label pod xiuxian04 apps=v4
pod/xiuxian04 labeled
[root@master ~]# kubectl get pods --show-labels
NAME        READY   STATUS    RESTARTS   AGE     LABELS
xiuxian01   1/1     Running   0          13s     apps=v1,run=xiuxian01
xiuxian02   1/1     Running   0          12s     apps=v2,run=xiuxian02
xiuxian03   1/1     Running   0          12s     apps=v3,run=xiuxian03
xiuxian04   1/1     Running   0          4s      apps=v4,run=xiuxian04
```

#### 3.2 rs 리소스 생성

```bash
[root@master rs]# cat 02-rs-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: rs-xiuxian-matchexpressions
spec:
  # Pod의 복제본 수 지정
  replicas: 5
  # Pod 연결 방식 정의
  selector:
    # 라벨 표현식 기반으로 Pod 연결
    matchExpressions:
      # 라벨의 key를 나타냄
    - key: apps
      # 라벨의 value를 나타냄
      values:
      - v1
      - v2
      - v3
      # key와 value 간의 관계 지정: In, NotIn, Exists, DoesNotExist
      #   In:
      #      key 값이 반드시 value 목록 내에 존재해야 함.
      #   NotIn:
      #      In의 반대.
      #   Exists:
      #      key만 존재하면 되며 value는 무관 (value 필드 생략 가능).
      #   DoesNotExist:
      #      지정된 key가 존재하지 않아야 함 (Exists의 반대, value 필드 생략 가능).
      operator: In
  # Pod 템플릿 정의
  template:
    metadata:
      labels:
        apps: v1
        school: czu
        class: computer01
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

```bash
[root@master rs]# kubectl apply -f 02-rs-xiuxian-matchExpressions.yaml
replicaset.apps/rs-xiuxian-matchexpressions created
[root@master rs]# kubectl get pods --show-labels
NAME                                READY   STATUS    RESTARTS   AGE     LABELS
rs-xiuxian-matchexpressions-cdhjw   1/1     Running   0          6s      apps=v1,class=computer01,school=czu
rs-xiuxian-matchexpressions-q8s66   1/1     Running   0          6s      apps=v1,class=computer01,school=czu
xiuxian01                           1/1     Running   0          27s     apps=v1,run=xiuxian01
xiuxian02                           1/1     Running   0          26s     apps=v2,run=xiuxian02
xiuxian03                           1/1     Running   0          26s     apps=v3,run=xiuxian03
xiuxian04                           1/1     Running   0          18s     apps=v4,run=xiuxian04
```

이것이 바로 rs가 rc보다 우수한 점입니다: RS는 5개의 복제본을 선언했지만 새로 생성된 Pod는 2개(`cdhjw`, `q8s66`)뿐입니다. `matchExpressions`의 집합 기반 셀렉터 `apps In (v1,v2,v3)`가 이미 존재하던 xiuxian01/02/03을 입양(Adopt)했기 때문입니다(기존 Pod 3개 + 신규 Pod 2개 = 5개). 반면 xiuxian04의 라벨은 `apps=v4`로 In 목록에 없으므로 입양되지 않습니다.

입양 동작은 ownerReferences로 실증됩니다:

```bash
[root@master rs]# kubectl get pod xiuxian01 -o jsonpath='{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}'
ReplicaSet/rs-xiuxian-matchexpressions
```

```bash
[root@master rs]# kubectl describe rs rs-xiuxian-matchexpressions | head -12
Name:         rs-xiuxian-matchexpressions
Namespace:    default
Selector:     apps in (v1,v2,v3)
Labels:       <none>
Annotations:  <none>
Replicas:     5 current / 5 desired
Pods Status:  5 Running / 0 Waiting / 0 Succeeded / 0 Failed
Pod Template:
  Labels:  apps=v1
           class=computer01
           school=czu
```

RS를 삭제하면 입양된 Pod들도 연쇄(Cascade) 삭제되며(xiuxian01/02/03이 RS와 함께 사라짐), 입양되지 않은 xiuxian04는 "고아"가 되어 별도로 삭제해야 합니다:

```bash
[root@master rs]# kubectl delete -f 02-rs-xiuxian-matchExpressions.yaml && kubectl delete pod xiuxian04
replicaset.apps "rs-xiuxian-matchexpressions" deleted
pod "xiuxian04" deleted
```

## 2. deploy 컨트롤러

### 1. 역할

서비스 배포에 사용되며, 내부적으로 rs를 기반으로 Pod 복제본 수를 제어하고 Pod를 직접 제어하지는 않습니다. rc 및 rs에 비해 deploy는 선언적 업데이트를 지원합니다.

### 2. 사례 1——matchLabels 기반 매칭

```bash
[root@master deploy]# cat 01-deploy-xiuxian-matchLabels.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian
spec:
  # Pod의 복제본 수 지정
  replicas: 3
  # Pod 연결 방식 정의
  selector:
    # 라벨 기반으로 Pod 연결
    matchLabels:
      apps: xiuxian
  # Pod 템플릿 정의
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2
```

### 3. 사례 2——matchExpressions 기반 매칭

```bash
[root@master deploy]# cat 02-deloy-xiuxian-matchExpressions.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deploy-xiuxian-matchexpressions
spec:
  # Pod의 복제본 수 지정
  replicas: 5
  # Pod 연결 방식 정의
  selector:
    # 라벨 표현식 기반으로 Pod 연결
    matchExpressions:
      # 라벨의 key를 나타냄
    - key: apps
      # 라벨의 value를 나타냄
      values:
      - v1
      - v2
      - v3
      # key와 value 간의 관계 지정: In, NotIn, Exists, DoesNotExist
      operator: In
  # Pod 템플릿 정의
  template:
    metadata:
      labels:
        apps: v1
        school: czu
        class: computer01
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v1
```

### 4. 테스트 검증

```bash
[root@master deploy]# kubectl apply -f 01-deploy-xiuxian-matchLabels.yaml
deployment.apps/deloy-xiuxian created
[root@master deploy]# kubectl apply -f 02-deloy-xiuxian-matchExpressions.yaml
deployment.apps/deploy-xiuxian-matchexpressions created
[root@master deploy]# kubectl get deploy,rs,pods
NAME                                              READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/deloy-xiuxian                     3/3     3            3           8s
deployment.apps/deploy-xiuxian-matchexpressions   5/5     5            5           8s

NAME                                                        DESIRED   CURRENT   READY   AGE
replicaset.apps/deloy-xiuxian-598b97f7f                     3         3         3       8s
replicaset.apps/deploy-xiuxian-matchexpressions-c89bdf6fc   5         5         5       8s

NAME                                                  READY   STATUS    RESTARTS   AGE
pod/deloy-xiuxian-598b97f7f-5s69q                     1/1     Running   0          8s
pod/deloy-xiuxian-598b97f7f-gg5lf                     1/1     Running   0          8s
pod/deloy-xiuxian-598b97f7f-npw2r                     1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-9xwnz   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-fch47   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-lj9ck   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-q5wbp   1/1     Running   0          8s
pod/deploy-xiuxian-matchexpressions-c89bdf6fc-xbt7n   1/1     Running   0          8s
```

**Deployment → ReplicaSet → Pod**. 각 Deployment 아래에 자동으로 RS가 생성되며(이름에 pod-template-hash 접미사가 붙음), Pod 이름에는 다시 랜덤 접미사가 추가됩니다. Deployment는 Pod를 직접 관리하지 않으며 모든 것은 RS를 통해 중계됩니다.

## 3. deployments의 Recreate 업그레이드 전략

먼저 위의 두 Deployment를 정리합니다(선택기 `apps: xiuxian`이 아래의 update 배포와 충돌하여 Pod가 잘못 입양되는 것을 방지). 그런 다음 Recreate 전략을 적용합니다:

```bash
[root@master deploy]# kubectl delete -f 01-deploy-xiuxian-matchLabels.yaml -f 02-deloy-xiuxian-matchExpressions.yaml
deployment.apps "deloy-xiuxian" deleted
deployment.apps "deploy-xiuxian-matchexpressions" deleted
[root@master deploy]# cat 03-deploy-update-Recreate.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian-update
spec:
  # 업그레이드 전략
  strategy:
    # 업그레이드 유형 지정, "Recreate" 또는 "RollingUpdate"
    #   Recreate:
    #     모든 이전 Pod를 삭제한 후 새 Pod를 생성함. 권장하지 않음.
    type: Recreate
  replicas: 3
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v3
         # 이미지 풀 정책 지정, 유효값: Always, Never, IfNotPresent
         #    Never:
         #      로컬에 이미지가 있으면 기동을 시도하고, 없어도 원격에서 당겨오지 않음.
         #    IfNotPresent:
         #      로컬에 이미지가 있으면 기동하고, 없으면 원격 저장소에서 풀함.
         #    Always:
         #      로컬 이미지가 있어도 원격 저장소의 다이제스트와 대조하여 일치하면 로컬 캐시를 사용하고, 불일치하면 새로 풀함.
         #      로컬에 이미지가 없으면 원격 저장소에서 직접 풀함.
         #
         # 기본 정책은 이미지 태그에 따라 결정됨:
         #    태그가 "latest"인 경우 기본값은 "Always";
         #    태그가 "latest"가 아닌 경우 기본값은 "IfNotPresent"
         imagePullPolicy: Always

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-deploy
spec:
  type: ClusterIP
  clusterIP: 10.200.0.80
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

```bash
[root@master deploy]# kubectl apply -f 03-deploy-update-Recreate.yaml
deployment.apps/deloy-xiuxian-update created
service/xiuxian-svc-deploy created
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 0 out of 3 new replicas have been updated...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 0 of 3 updated replicas are available...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 1 of 3 updated replicas are available...
Waiting for deployment "deloy-xiuxian-update" rollout to finish: 2 of 3 updated replicas are available...
deployment "deloy-xiuxian-update" successfully rolled out
[root@master deploy]# kubectl get pods -o wide
NAME                                   READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
deloy-xiuxian-update-57969ff46-9gfzg   1/1     Running   0          2s    10.100.1.77   worker01   <none>           <none>
deloy-xiuxian-update-57969ff46-fzmmj   1/1     Running   0          2s    10.100.1.78   worker01   <none>           <none>
deloy-xiuxian-update-57969ff46-zkfp9   1/1     Running   0          2s    10.100.2.76   worker02   <none>           <none>
[root@master deploy]# kubectl get svc xiuxian-svc-deploy
NAME                 TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)   AGE
xiuxian-svc-deploy   ClusterIP   10.200.0.80   <none>        80/TCP    3s
```

Recreate 전략으로 처음에 3개의 v3 Pod를 배포했습니다. Service는 yaml에 하드코딩된 `clusterIP: 10.200.0.80`으로 주소를 고정했습니다—Service 서브넷 대역 내에서 유휴 IP를 지정하여 서비스 엔트리포인트를 고정할 수 있습니다.

## 4. deployments의 RollingUpdate 업그레이드 전략

동일한 Deployment를 RollingUpdate 전략으로 변경: 복제본 3→5, 이미지 v3→v2, `maxSurge: 2`, `maxUnavailable: 1`:

```bash
[root@master deploy]# cat 03-deploy-update-RollingUpdate.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-xiuxian-update
spec:
  # 업그레이드 전략
  strategy:
    # 업그레이드 유형 지정, "Recreate" 또는 "RollingUpdate"
    #   Recreate:
    #     모든 이전 Pod를 삭제한 후 새 Pod를 생성함. 권장하지 않음.
    #   RollingUpdate:
    #     롤링 업데이트. Pod 일부를 점진적으로 업데이트하여 이전 Pod를 순차 교체함 (기본값).
    type: RollingUpdate
    # 롤링 업데이트 전략 정의. "type: RollingUpdate"일 때만 유효.
    rollingUpdate:
      # 업그레이드 진행 중 원래 복제본 수보다 초과하여 기동할 수 있는 최대 Pod 수.
      # 백분율과 숫자를 지원하며 미지정 시 기본값은 "25%".
      maxSurge: 2
      # 업그레이드 진행 중 사용할 수 없는 최대 Pod 수.
      # 백분율과 숫자를 지원하며 미지정 시 기본값은 "25%".
      maxUnavailable: 1
  replicas: 5
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
        version: v1
    spec:
       containers:
       - name: c1
         image: harbor:443/dawn/apps:v2
         imagePullPolicy: Always

---

apiVersion: v1
kind: Service
metadata:
  name: xiuxian-svc-deploy
spec:
  type: ClusterIP
  clusterIP: 10.200.0.80
  selector:
    apps: xiuxian
  ports:
  - port: 80
    targetPort: 80
```

apply 직후 연속으로 상태를 캡처하면 롤링 진행 과정이 한눈에 파악됩니다:

```bash
[root@master deploy]# kubectl apply -f 03-deploy-update-RollingUpdate.yaml
deployment.apps/deloy-xiuxian-update configured
service/xiuxian-svc-deploy unchanged
[root@master deploy]# kubectl get pods -o wide        # t0: 새 RS의 Pod 스케줄링 시작
NAME                                    READY   STATUS              RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-57969ff46-9gfzg    1/1     Running             0          17s   10.100.1.77   worker01
deloy-xiuxian-update-57969ff46-bfgf9    0/1     ContainerCreating   0          0s    <none>        worker02
deloy-xiuxian-update-57969ff46-fzmmj    1/1     Running             0          17s   10.100.1.78   worker01
deloy-xiuxian-update-57969ff46-zjmt2    0/1     ContainerCreating   0          0s    <none>        worker01
deloy-xiuxian-update-57969ff46-zkfp9    1/1     Running             0          17s   10.100.2.76   worker02
deloy-xiuxian-update-76dd8844b9-8p9pj   0/1     Pending             0          0s    <none>        <none>
deloy-xiuxian-update-76dd8844b9-cvhkc   0/1     Pending             0          0s    <none>        worker02
[root@master deploy]# kubectl get pods -o wide        # t+2s: 새 Pod 기동, 이전 Pod 종료 시작
NAME                                    READY   STATUS              RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-57969ff46-9gfzg    1/1     Running             0          19s   10.100.1.77   worker01
deloy-xiuxian-update-57969ff46-bfgf9    0/1     Terminating         0          2s    <none>        worker02
deloy-xiuxian-update-57969ff46-fzmmj    1/1     Running             0          19s   10.100.1.78   worker01
deloy-xiuxian-update-57969ff46-zjmt2    0/1     Terminating         0          2s    10.100.1.79   worker01
deloy-xiuxian-update-57969ff46-zkfp9    1/1     Running             0          19s   10.100.2.76   worker02
deloy-xiuxian-update-76dd8844b9-8p9pj   1/1     Running             0          2s    10.100.1.80   worker01
deloy-xiuxian-update-76dd8844b9-cvhkc   0/1     ContainerCreating   0          2s    <none>        worker02
deloy-xiuxian-update-76dd8844b9-nf74j   0/1     ContainerCreating   0          2s    <none>        worker02
deloy-xiuxian-update-76dd8844b9-tc9j4   0/1     ContainerCreating   0          0s    <none>        worker01
[root@master deploy]# kubectl get pods -o wide        # t+5s: 이전 Pod 전체 종료, 새 Pod 5개 준비 완료
NAME                                    READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-76dd8844b9-8p9pj   1/1     Running   0          5s    10.100.1.80   worker01
deloy-xiuxian-update-76dd8844b9-cvhkc   1/1     Running   0          5s    10.100.2.79   worker02
deloy-xiuxian-update-76dd8844b9-nf74j   1/1     Running   0          5s    10.100.2.78   worker02
deloy-xiuxian-update-76dd8844b9-tc9j4   1/1     Running   0          3s    10.100.1.81   worker01
deloy-xiuxian-update-76dd8844b9-xrr4n   1/1     Running   0          3s    10.100.2.80   worker02
```

**t0**: 복제본을 3개에서 5개로 확장하면서 이전 RS(`57969ff46`, v3)가 먼저 2개의 Pod(`bfgf9`, `zjmt2`)를 추가 보충하고, 동시에 새 RS(`76dd8844b9`, v2)의 Pod가 Pending 상태로 진입합니다. 이것이 바로 원하는 복제본 수보다 최대 2개 초과 가능한 `maxSurge: 2`의 동작입니다.

**t+2s**: 신규 및 이전 버전이 공존하며 총 Pod 수는 7개(기대치 5 + surge 2)로 `maxSurge`를 엄격히 준수합니다. 이전 Pod가 `Terminating`되기 시작하며, 이는 `maxUnavailable: 1`이 제어하는 롤링 리듬에 부합합니다.

**t+5s**: 이전 RS의 Pod가 모두 종료되고 5개의 새 Pod가 모두 Running 상태가 되어 롤링 업데이트가 완료되었습니다.

```bash
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update
deployment "deloy-xiuxian-update" successfully rolled out
[root@master deploy]# kubectl get rs
NAME                              DESIRED   CURRENT   READY   AGE
deloy-xiuxian-update-57969ff46    0         0         0       38s
deloy-xiuxian-update-76dd8844b9   5         5         5       21s
[root@master deploy]# kubectl rollout history deploy deloy-xiuxian-update
deployment.apps/deloy-xiuxian-update
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
```

이전 RS는 0으로 축소되었지만 객체는 유지됩니다 (revision 1 = Recreate의 v3, revision 2 = RollingUpdate의 v2).

## 5. deploy를 통한 반응형 업데이트 및 롤백 구현

update 배포를 정리한 후 시연을 위해 특별히 준비한 `deloy-xiuxian-update-strategy`를 생성합니다 (3개 복제본, v1, 기본 RollingUpdate):

```bash
[root@master deploy]# kubectl delete -f 03-deploy-update-RollingUpdate.yaml
deployment.apps "deloy-xiuxian-update" deleted
service "xiuxian-svc-deploy" deleted
[root@master deploy]# kubectl apply -f 04-deploy-xiuxian-update-strategy.yaml
deployment.apps/deloy-xiuxian-update-strategy created
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 1. 반응형 애플리케이션 업데이트

```bash
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v3
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v1
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl rollout status deploy deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 2. 애플리케이션 배포 이력 버전 확인

```bash
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
3         <none>
```

히스토리 버전이 2부터 시작하고 1이 보이지 않는 현상—이는 명령어 오류가 아니라 템플릿 재사용으로 인한 revision 재부여 때문입니다. 세 번째 업데이트(v1으로 복귀)의 템플릿이 revision 1과 완전히 일치하여, Deployment가 revision 1의 ReplicaSet(`65987b5db8`)을 직접 재사용하고 revision 번호를 3으로 덮어씀으로써 revision 1이 "사라진" 것입니다.

### 3. 현재 애플리케이션의 배포 상태 확인

```bash
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
```

### 4. 업데이트 일시 중지

```bash
[root@master deploy]# kubectl rollout pause deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy paused
```

일시 중지만으로는 직관적이지 않으므로, 일시 중지 상태에서 이미지를 한 번 더 변경하여 pause가 실제로 업데이트를 "보류"했음을 확인합니다—spec은 이미 v2로 변경되었지만 Pod는 전혀 움직이지 않습니다:

```bash
[root@master deploy]# kubectl set image deploy deloy-xiuxian-update-strategy c1=harbor:443/dawn/apps:v2
deployment.apps/deloy-xiuxian-update-strategy image updated
[root@master deploy]# kubectl get pods -o wide
NAME                                             READY   STATUS    RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-strategy-65987b5db8-5smhl   1/1     Running   0          23s   10.100.2.84   worker02
deloy-xiuxian-update-strategy-65987b5db8-wcrn2   1/1     Running   0          24s   10.100.1.86   worker01
deloy-xiuxian-update-strategy-65987b5db8-wk2xd   1/1     Running   0          26s   10.100.2.83   worker02
$ echo -n 'spec 이미지: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
spec镜像: harbor:443/dawn/apps:v2
```

spec은 이미 v2이지만, Pod는 여전히 모두 v1의 `65987b5db8` 상태입니다.

### 5. 업데이트 재개

```bash
[root@master deploy]# kubectl rollout resume deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy resumed
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
Waiting for deployment "deloy-xiuxian-update-strategy" rollout to finish: 1 out of 3 new replicas have been updated...
...
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl get pods -o wide
NAME                                             READY   STATUS        RESTARTS   AGE   IP            NODE
deloy-xiuxian-update-strategy-65987b5db8-wcrn2   1/1     Terminating   0          28s   10.100.1.86   worker01
deloy-xiuxian-update-strategy-76dd8844b9-7lc7s   1/1     Running       0          1s    10.100.2.86   worker02
deloy-xiuxian-update-strategy-76dd8844b9-qskbf   1/1     Running       0          4s    10.100.1.87   worker01
deloy-xiuxian-update-strategy-76dd8844b9-v469q   1/1     Running       0          3s    10.100.2.85   worker02
```

resume 후 보류되었던 업데이트가 즉시 진행되어 v2(새 RS `76dd8844b9`)로 롤링됩니다. 이 해시는 위의 update 배포의 v2 RS와 동일합니다—pod-template-hash는 어느 Deployment에 속하는지와 무관하게 오직 Pod 템플릿 내용에 의해서만 결정되므로, 템플릿이 동일한 RS의 해시는 반드시 동일합니다.

### 6. 이전 버전으로 롤백

```bash
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
4         <none>
5         <none>
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
2         <none>
5         <none>
6         <none>
```

undo를 실행할 때마다 이전 버전의 템플릿이 새 revision으로 재배포됩니다 (revision 번호가 증가하고 기존 번호는 재사용되어 덮어씌워짐). 따라서 히스토리 목록의 번호가 건너뛰게 됩니다: 2,4,5 → 2,5,6.

### 7. 특정 버전으로 롤백

```bash
[root@master deploy]# kubectl rollout undo deployment deloy-xiuxian-update-strategy --to-revision=2
deployment.apps/deloy-xiuxian-update-strategy rolled back
[root@master deploy]# kubectl rollout status deployment deloy-xiuxian-update-strategy
deployment "deloy-xiuxian-update-strategy" successfully rolled out
[root@master deploy]# kubectl rollout history deployment deloy-xiuxian-update-strategy
deployment.apps/deloy-xiuxian-update-strategy
REVISION  CHANGE-CAUSE
5         <none>
6         <none>
7         <none>
[root@master deploy]# echo -n '최종 이미지: ' && kubectl get deploy deloy-xiuxian-update-strategy -o jsonpath='{.spec.template.spec.containers[0].image}'
最终镜像: harbor:443/dawn/apps:v3
```

revision 2는 v3였으며, 롤백 후 현재 이미지가 실제로 v3로 확인되어 실험이 완결되었습니다. 이 시점에서 `--revision=2`의 상세를 다시 조회하면 `unable to find the specified revision` 오류가 발생합니다—revision 2의 RS가 이후의 undo에 의해 재사용되면서 7번으로 변경되었기 때문입니다 (`kubectl rollout history --revision=7`을 실행해야 해당 v3 템플릿을 확인할 수 있음).
