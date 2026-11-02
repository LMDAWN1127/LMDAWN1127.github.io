---
title: "K8S Pod 스케줄링 완벽 실전: 직접 스케줄링, 노드/Pod 소프트·하드 어피니티 및 테인트·톨러레이션(Taints & Tolerations) 심층 분석"
date: 2026-11-02T16:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Scheduler", "NodeAffinity", "PodAffinity", "Taints", "Tolerations", "Pod"]
showToc: true
summary: "Kubernetes Pod 스케줄링 전략과 기반 동작 메커니즘 완벽 가이드: nodeName 스케줄러 우회 및 네트워크 포트 충돌 방지 트러블슈팅, Taints(NoSchedule/PreferNoSchedule/NoExecute)와 정밀/와일드카드 Tolerations 실전 테스트, NodeAffinity 소프트/하드 제약 조건과 가중치 폴백(Fallback), 사용자 정의 토폴로지 dc 기반의 PodAffinity 근접 배치 및 PodAntiAffinity 고가용성 분산 배치 실습."
---

# K8S Pod 스케줄링 완벽 실전: 직접 스케줄링, 노드/Pod 소프트·하드 어피니티 및 테인트·톨러레이션(Taints & Tolerations) 심층 분석

---

## 1. Pod 스케줄링

### 1.1 nodeName — 스케줄러 우회

```yaml
# 直接指定节点，调度器完全不参与
spec:
  nodeName: worker01
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

**위험성:** 스케줄러의 모든 보호 메커니즘(리소스 잔여량 검사, Pod 상한선, 테인트 톨러레이션 등)을 우회합니다. 복제 컨트롤러와 `nodeName` 의 조합은 Pod 스톰(Storm)을 유발하기 쉽습니다(후술).

### 1.2 hostNetwork

```yaml
spec:
  hostNetwork: true           # Pod使用宿主机网络栈，IP=节点IP
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
```

2C/3G 클러스터에서 5개 복제본(replicas)을 배포한 실제 결과:

```bash
[root@master ~]# kubectl get pods -l apps=xiuxian | grep scheduler-hostnetwork
scheduler-hostnetwork-599fc8dd56-qkphn   1/1   Running            0   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-2vjsj   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-kptnl   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-hvpqf   0/1   CrashLoopBackOff   8    64m   11.0.1.233   worker02
scheduler-hostnetwork-599fc8dd56-xtm6n   0/1   CrashLoopBackOff   10   72m   11.0.1.233   worker02
```

1개 Running + 4개 CrashLoopBackOff — nginx 오류: `bind() to [::]:80 failed (98: Address in use)`. 동일 노드에서 `hostNetwork` 의 80번 포트는 단 하나의 Pod 만 바인딩할 수 있습니다.

### 1.3 hostPort

```yaml
spec:
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
    ports:
    - containerPort: 80
      hostPort: 8080             # 同节点不能两个Pod绑同端口
```

5개 복제본: 2개 Running (각 노드의 hostPort 8080을 하나씩 점유) + 3개 Pending (동일 노드 내 포트 충돌 또는 사용 가능한 포트를 가진 노드 부재).

### 1.4 resources

```yaml
spec:
  containers:
  - name: c1
    image: harbor:443/dawn/apps:v2
    resources:
      requests:                  # 决定可调度性
        cpu: 0.5
        memory: 200Mi
      limits:                    # 可超售
        cpu: 4
        memory: 8Gi
```

5개 복제본이 각각 0.5 CPU 를 요청. 2코어 worker01(전체 CPU requests 의 약 80% 점유)에서 3~4개 생성 후 스케줄링 한계에 도달합니다. `limits` 는 스케줄링 계산에 관여하지 않습니다.

---

## 2. 테인트(Taints)

노드에 부여하는 제약 조건. 문법: `key[=value]:effect`.

### 2.1 세 가지 Effect

| Effect | 신규 Pod 스케줄링 | 기존 Pod | 삭제 명령어 |
| --- | --- | --- | --- |
| **NoSchedule** | 금지 | 영향 없음 | `kubectl taint node N key-` |
| **PreferNoSchedule** | 가급적 회피 | 영향 없음 | `kubectl taint node N key=val:PreferNoSchedule-` |
| **NoExecute** | 금지 | 즉시 축출(Evict) | `kubectl taint node N key=val:NoExecute-` |

### 2.2 현재 테인트 확인

```bash
[root@master ~]# kubectl describe nodes | grep Taints
Taints:             node-role.kubernetes.io/master:NoSchedule
Taints:             <none>
Taints:             <none>
```

master 노드에는 기본적으로 NoSchedule 이 설정되어 있습니다(일반 Pod 가 master 에 배포되지 않는 이유).

### 2.3 NoSchedule 테인트 설정

```bash
[root@master ~]# kubectl get pods -o wide | grep scheduler-resources
scheduler-resources-requests-...-229dr   1/1   Running   14m   10.100.2.40   worker02
scheduler-resources-requests-...-fhv2v   1/1   Running   14m   10.100.1.77   worker01
# 5个Pod分布在两worker

[root@master ~]# kubectl taint node worker02 school=dawn:NoSchedule
node/worker02 tainted

[root@master ~]# kubectl describe nodes | grep Taints
Taints:   node-role.kubernetes.io/master:NoSchedule
Taints:   <none>
Taints:   school=dawn:NoSchedule                    # worker02 新增

[root@master ~]# kubectl get pods -o wide | grep scheduler-resources
# 已有的worker02 Pod不受影响（NoSchedule不驱逐旧Pod）
```

신규 Pod 배포 테스트 (Deployment scheduler-taints, replicas: 5):

```bash
[root@master ~]# kubectl apply -f 05-scheduler-taints.yaml
deployment.apps/scheduler-taints created

[root@master ~]# kubectl get pods -o wide | grep scheduler-taints-
scheduler-taints-...-bs8kn   1/1   Running   8s   10.100.1.79   worker01
scheduler-taints-...-lxv7m   1/1   Running   8s   10.100.1.82   worker01
scheduler-taints-...-mtl4x   1/1   Running   8s   10.100.1.81   worker01
scheduler-taints-...-wsbfk   1/1   Running   8s   10.100.1.83   worker01
scheduler-taints-...-xnrxg   1/1   Running   8s   10.100.1.80   worker01
```

전부 worker01 에 배포됨 —— worker02 는 NoSchedule 에 의해 신규 Pod 배포를 거부합니다.

### 2.4 테인트 삭제

```bash
[root@master ~]# kubectl taint node worker02 school-
node/worker02 untainted
```

### 2.5 테인트 수정

```bash
[root@master ~]# kubectl taint node worker02 school=dawn:NoSchedule
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule --overwrite
node/worker02 modified
# 同 key + 同 effect = 同一污点，改 value 需 --overwrite
```

### 2.6 단일 노드에 다중 테인트 부여

```bash
[root@master ~]# kubectl taint node worker02 school=dawn:PreferNoSchedule
node/worker02 tainted
[root@master ~]# kubectl taint node worker02 class=dawn:PreferNoSchedule
node/worker02 tainted

[root@master ~]# kubectl describe nodes | grep Taints -A 2 | grep worker02 -A 2
Taints:   school=yitiantian:NoSchedule
          class=dawn:PreferNoSchedule
          school=dawn:PreferNoSchedule
```

effect 가 다르면 key 와 value 가 동일해도 서로 다른 테인트로 취급됩니다.

effect 가 동일하고 value 만 변경할 때는 동일한 테인트로 취급되므로 `--overwrite` 가 필요합니다.

```bash
# 验证：同 key=school 但不同 value → 同污点，--overwrite 改值
[root@master ~]# kubectl taint node worker02 school=dark:PreferNoSchedule --overwrite
node/worker02 modified

# 验证：同 key=class，但 effect 不同 → 不同污点，无需 overwrite
[root@master ~]# kubectl taint node worker02 class=dawn:NoSchedule
node/worker02 tainted

# worker02 当前污点：
Taints:   class=dawn:NoSchedule
          school=yitiantian:NoSchedule
          class=dawn:PreferNoSchedule
          school=dark:PreferNoSchedule
```

### 2.7 PreferNoSchedule 검증

테인트를 정리하고 PreferNoSchedule 만 남김:

```bash
[root@master ~]# kubectl taint node worker02 class-                    # 删除所有 class 污点
[root@master ~]# kubectl taint node worker02 school=yitiantian:NoSchedule-  # 精确删除
[root@master ~]# kubectl describe nodes | grep Taints -A 2
# worker02 只剩 school=dark:PreferNoSchedule
```

대규모 복제본 Deployment 생성 (replicas: 8, resource requests 0.5cpu/200Mi):

```bash
[root@master ~]# kubectl apply -f 06-scheduler-PreferNoSchedule.yaml
deployment.apps/scheduler-taints-prefernoschedule created

# 8 个 Pod：worker01(4) + master(2) + worker02(2)
# worker02 仍有 Pod —— PreferNoSchedule 是软污点，资源紧时仍可调度
```

### 2.8 NoExecute 검증

테인트를 초기화한 후 5개 복제본 배포:

```bash
[root@master ~]# kubectl describe nodes | grep Taints
# all <none> (除 master)

[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml
deployment.apps/scheduler-taints-noschedule-noexecute created

# 5 Pod: 3 on worker01 + 2 on worker02
```

NoExecute 부여:

```bash
[root@master ~]# kubectl taint node worker01 school=dawn:NoExecute
node/worker01 tainted

# worker01 上 3 个 Pod 立即被驱逐，全部重调度到 worker02
[root@master ~]# kubectl get pods -o wide | grep noschedule-noexecute
# 全部 5 个 Pod 现在都在 worker02
```

10개 복제본으로 확장 —— 전부 worker02 로 배포됨 (worker01 에는 신규 Pod 미배포):

```bash
[root@master ~]# kubectl apply -f 05-scheduler-taints-NoSchedule.yaml  # replicas: 10
deployment.apps/scheduler-taints-noschedule-noexecute configured
# 10/10 Pod 全部在 worker02
```

NoExecute 는 매우 강력하여 신규 Pod 를 거부할 뿐만 아니라 기존 Pod 도 즉시 강제 축출합니다. 불가피한 경우가 아니면 NoSchedule 사용을 권장합니다.

---

## 3. 톨러레이션(Tolerations)

### 3.1 명시적 정밀 톨러레이션

환경: master(NoSchedule), worker01(school=dawn:NoExecute), worker02(class=dawn:NoSchedule + school=yitiantain:PreferNoSchedule)

```yaml
# /dawn/manifests/scheduler/07-scheduler-tolerations.yaml
spec:
  template:
    spec:
      tolerations:
      - key: class
        value: dawn
        effect: NoSchedule                   # 容忍 worker02
      - key: school
        value: yitiantain
        effect: PreferNoSchedule             # 容忍 worker02
      - key: school
        value: dawn
        effect: NoExecute                    # 容忍 worker01
      - key: node-role.kubernetes.io/master
        effect: NoSchedule                   # 容忍 master
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/07-scheduler-tolerations.yaml
deployment.apps/scheduler-tolerations created

[root@master ~]# kubectl get pods -o wide | grep scheduler-tolerations
scheduler-tolerations-...-2xjxc   1/1   Running   29s   10.100.2.65    worker02
scheduler-tolerations-...-cwjg9   1/1   Running   29s   10.100.1.110   worker01
scheduler-tolerations-...-gdtrw   1/1   Running   29s   10.100.1.111   worker01
scheduler-tolerations-...-hj86k   1/1   Running   29s   10.100.2.64    worker02
scheduler-tolerations-...-rnpn9   1/1   Running   29s   10.100.0.10    master
```

5개 Pod 가 master + worker01 + worker02 3개 노드에 고루 분산 — 각 노드의 테인트에 대응하는 toleration 이 완벽히 매칭되었습니다.

### 3.2 operator: Exists — 모든 테인트 무조건 수용

```yaml
# /dawn/manifests/scheduler/08-scheduler-tolerations-ignore-taints.yaml
spec:
  template:
    spec:
      tolerations:
      - operator: Exists    # 不写 key/value，无视一切污点
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/08-scheduler-tolerations-ignore-taints.yaml
deployment.apps/scheduler-tolerations-ignore-taints created

[root@master ~]# kubectl get pods -o wide | grep ignore-taints
scheduler-tolerations-ignore-taints-...-cqfpq   1/1   Running   7s   10.100.1.114   worker01
scheduler-tolerations-ignore-taints-...-plwwk   1/1   Running   7s   10.100.1.115   worker01
scheduler-tolerations-ignore-taints-...-qjwfd   1/1   Running   7s   10.100.2.69    worker02
scheduler-tolerations-ignore-taints-...-qkvw6   1/1   Running   7s   10.100.0.12    master
scheduler-tolerations-ignore-taints-...-v7f4f   1/1   Running   7s   10.100.2.68    worker02
```

5개 Pod 가 3개 노드 전체에 자유롭게 배치됨 — 노드에 어떠한 테인트가 존재하더라도 전면 수용합니다.

---

## 4. nodeSelector — 노드 레이블 기반의 정적 스케줄링

### 4.1 노드 레이블 설정

모든 노드에 `school=dawn` 을 부여한 후 worker01 의 레이블을 제거하여 "레이블이 있는 노드에만 배치" 시뮬레이션:

```bash
[root@master ~]# kubectl label nodes --all school=dawn
node/master labeled
node/worker01 labeled
node/worker02 labeled

[root@master ~]# kubectl label nodes worker01 school-
node/worker01 unlabeled

[root@master ~]# kubectl get nodes -l school=dawn --show-labels | awk '{print $1, $5}'
master school=dawn
worker02 school=dawn
```

현재 테인트 환경 (master 에는 NoSchedule 이 있으므로 Pod 에 tolerations 가 있어야 배포 가능):

```bash
[root@master ~]# kubectl describe nodes | grep Taints -A 1
Taints:             node-role.kubernetes.io/master:NoSchedule    # master
Taints:             <none>                                       # worker01
Taints:             <none>                                       # worker02
```

### 4.2 nodeSelector DaemonSet 배포

```yaml
# /dawn/manifests/scheduler/09-scheduler-nodeSelector.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: scheduler-nodeselector
spec:
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule              # 容忍 master 污点
      nodeSelector:
        school: dawn               # 只调度到有此标签的节点
      containers:
      - name: xiuxian
        image: harbor:443/dawn/apps:v1
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/09-scheduler-nodeSelector.yaml
daemonset.apps/scheduler-nodeselector created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide | grep scheduler-nodeselector
scheduler-nodeselector-f8mlw   1/1   Running   0   18s   10.100.0.18    master
scheduler-nodeselector-wcsnw   1/1   Running   0   18s   10.100.2.226   worker02
```

**결론:** master 와 worker02 에 각각 1개씩 Pod 가 실행됨(`school=dawn` 레이블 보유), worker01 에는 Pod 가 없음(레이블 제거됨). DaemonSet 의 tolerations 로 인해 master 노드에도 정상 배치됩니다.

---

## 5. nodeAffinity 하드 제약 조건 — requiredDuringSchedulingIgnoredDuringExecution

### 5.1 nodeSelector 와 동등한 단일값 In 매칭

```yaml
# /dawn/manifests/scheduler/10-scheduler-nodeAffinity.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: scheduler-nodeaffinity
spec:
  selector:
    matchLabels:
      apps: xiuxian
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: school
                values:
                - "dawn"
                operator: In                # In / NotIn / Exists / DoesNotExist / Gt / Lt
      containers:
      - name: xiuxian
        image: harbor:443/dawn/apps:v1
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/10-scheduler-nodeAffinity.yaml
daemonset.apps/scheduler-nodeaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide | grep scheduler-nodeaffinity
scheduler-nodeaffinity-2bfq9   1/1   Running   0   5s   10.100.0.19    master
scheduler-nodeaffinity-bzdgk   1/1   Running   0   5s   10.100.2.227   worker02
```

**결론:** nodeSelector 와 완전히 동일한 결과 — 단일값 `In` 연산자는 nodeSelector 의 일치 비교와 동일합니다. nodeAffinity 의 진가는 다양한 연산자(NotIn/Exists/Gt/Lt)와 소프트 제약 조건 지원에 있습니다.

### 5.2 다중값 In 매칭 (동일한 key 에 여러 value 매칭)

먼저 worker02 레이블을 `dawn` 에서 `dark` 로 변경:

```bash
[root@master ~]# kubectl label nodes worker02 school=dark --overwrite
node/worker02 labeled

# 当前标签分布
master:   school=dawn
worker01: 无 school 标签
worker02: school=dark
```

Deployment 생성 (replicas: 5, In ["dawn", "dark"]):

```yaml
# /dawn/manifests/scheduler/11-scheduler-deploy-nodeAffinity.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduler-deploy-nodeaffinity
spec:
  replicas: 5
  selector:
    matchLabels:
      apps: xiuxian
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: school
                values:
                - "dawn"
                - "dark"
                operator: In
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/11-scheduler-deploy-nodeAffinity.yaml
deployment.apps/scheduler-deploy-nodeaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep deploy-nodeaffinity
scheduler-deploy-nodeaffinity-5f98fb44b5-cmwd2   1/1   Running   8s    10.100.2.228   worker02
scheduler-deploy-nodeaffinity-5f98fb44b5-pf72t   1/1   Running   8s    10.100.2.230   worker02
scheduler-deploy-nodeaffinity-5f98fb44b5-t5nps   1/1   Running   8s    10.100.0.21    master
scheduler-deploy-nodeaffinity-5f98fb44b5-vpnxx   1/1   Running   8s    10.100.0.20    master
scheduler-deploy-nodeaffinity-5f98fb44b5-wkct5   1/1   Running   8s    10.100.2.229   worker02
```

**결론:** 5개 Pod 가 레이블 값에 따라 분배됨 — master 에 2개(dawn) + worker02 에 3개(dark). 다중값 In 은 "OR" 논리로 동작합니다.

---

## 6. nodeAffinity 소프트 제약 조건 — preferredDuringSchedulingIgnoredDuringExecution

### 6.1 하드 제약 vs 소프트 제약

| 하드 제약 조건 (required) | 소프트 제약 조건 (preferred) |
| --- | --- |
| 조건 미충족 시 → Pod 는 무기한 Pending | 조건 미충족 시 → 다른 가용 노드로 폴백(Fallback) |
| nodeSelector 도 하드 제약 조건에 해당 | nodeAffinity 만 지원 |
| 반드시 충족해야 하는 요건(GPU, 데이터 지역성 등)에 적합 | "선호하지만 필수는 아닌" 요건에 적합 |

### 6.2 레이블 미일치 시 폴백 동작

먼저 `school` 레이블을 전면 제거:

```bash
[root@master ~]# kubectl label nodes --all school-
node/master unlabeled
node/worker01 not labeled
node/worker02 unlabeled
```

preferred 설정이 포함된 Deployment 생성 (replicas: 4, weight 10 + 40):

```yaml
# /dawn/manifests/scheduler/12-scheduler-deploy-preferred-nodeAffinity.yaml
spec:
  replicas: 4
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - preference:
              matchExpressions:
              - key: school
                values: ["dawn"]
                operator: In
            weight: 10
          - preference:
              matchExpressions:
              - key: school
                values: ["dark"]
                operator: In
            weight: 40
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
        resources:
          requests: {cpu: 0.5, memory: 200Mi}
          limits: {cpu: 4, memory: 8Gi}
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/12-scheduler-deploy-preferred-nodeAffinity.yaml
deployment.apps/scheduler-deploy-nodeaffinity-preferred created

# 无标签 → 自动 fallback 到全部节点
[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep preferred
scheduler-deploy-nodeaffinity-preferred-...-bwht9   1/1   Running   6s   10.100.1.103   worker01
scheduler-deploy-nodeaffinity-preferred-...-nqfkv   1/1   Running   6s   10.100.0.22    master
scheduler-deploy-nodeaffinity-preferred-...-tm9sp   1/1   Running   6s   10.100.2.231   worker02
scheduler-deploy-nodeaffinity-preferred-...-vt7nf   1/1   Running   6s   10.100.1.102   worker01
```

4개 Pod 가 3개 노드 전체에 고루 분산됨 — 소프트 제약 조건이 맞지 않을 경우 사용 가능한 노드로 자동 폴백합니다.

### 6.3 레이블 부여 후 가중치 분배 검증

```bash
[root@master ~]# kubectl label nodes worker01 school=dawn
[root@master ~]# kubectl label nodes master school=yitiantian
[root@master ~]# kubectl label nodes worker02 school=dark

[root@master ~]# kubectl scale deploy scheduler-deploy-nodeaffinity-preferred --replicas=8
deployment.apps/scheduler-deploy-nodeaffinity-preferred scaled

# 结果分布
# worker02: 3 Pods  → weight=40 (dark)
# worker01: 3 Pods  → weight=10 (dawn)
# master:   2 Pods  → yitiantian 不在偏好列表，但 fallback 仍可调度
```

**결론:** weight=40 인 `dark` 가 가장 많은 Pod 를 유인합니다. `yitiantian` 은 어떤 선호 목록에도 없지만 폴백으로 인해 Pod 가 정상 배치됩니다. 프로덕션 활용 사례: 동일 AZ 우선 배치, 타 AZ 로 폴백.

---

## 7. podAffinity — Pod 친화성 (근접 배치)

### 7.1 동작 원리

`podAffinity` 는 노드가 아닌 Pod 간의 관계를 다룹니다. `topologyKey` 는 토폴로지 범위를 지정합니다: `kubernetes.io/hostname` = 노드 단위, `topology.kubernetes.io/zone` = AZ 단위, 또는 `dc` 와 같은 사용자 정의 레이블.

### 7.2 dc 레이블 부여

```bash
[root@master ~]# kubectl label nodes master dc=jiuxianqiao
[root@master ~]# kubectl label nodes worker01 dc=lugu
[root@master ~]# kubectl label nodes worker02 dc=zhaowei

[root@master ~]# kubectl get nodes -l dc --show-labels --no-headers | awk '{print $1, $5}'
master dc=jiuxianqiao
worker01 dc=lugu
worker02 dc=zhaowei
```

### 7.3 podAffinity Deployment 생성

```yaml
# /dawn/manifests/scheduler/13-scheduler-podAffinity.yaml
spec:
  replicas: 5
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - topologyKey: dc
            labelSelector:
              matchLabels:
                apps: xiuxian          # Pod 必须与 apps=xiuxian 的"老朋友"在同 dc
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
        resources:
          requests: {cpu: 0.5, memory: 200Mi}
          limits: {cpu: 4, memory: 8Gi}
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/13-scheduler-podAffinity.yaml
deployment.apps/scheduler-podaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep scheduler-podaffinity
scheduler-podaffinity-677cf58498-ng47c   1/1   Running   2m   10.100.1.109   worker01(lugu)
scheduler-podaffinity-677cf58498-pg2s2   1/1   Running   2m   10.100.2.234   worker02(zhaowei)
scheduler-podaffinity-677cf58498-svks4   1/1   Running   2m   10.100.2.235   worker02(zhaowei)
```

---

## 8. podAntiAffinity — Pod 반친화성 (토폴로지 분산 배치)

### 8.1 동작 원리

`podAntiAffinity` 는 `podAffinity` 의 반대 개념으로, 특정 레이블을 가진 Pod 와 동일한 토폴로지 내에 함께 배치되는 것을 회피합니다. 대표적 시나리오: 고가용성 구성 — 동일 애플리케이션의 복제본이 단일 머신, 랙, 가용영역에 집중되는 현상 방지.

### 8.2 반친화 Deployment 생성

```yaml
# /dawn/manifests/scheduler/14-scheduler-podAntiAffinity.yaml
spec:
  replicas: 5
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - topologyKey: dc
            labelSelector:
              matchExpressions:
              - key: apps
                values: ["xiuxian"]
                operator: In
      containers:
      - name: c1
        image: harbor:443/dawn/apps:v2
        resources:
          requests: {cpu: 0.5, memory: 200Mi}
          limits: {cpu: 4, memory: 8Gi}
```

### 8.3 실행 결과

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/scheduler/14-scheduler-podAntiAffinity.yaml
deployment.apps/scheduler-podantiaffinity created

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide --no-headers | grep scheduler-podantiaffinity
scheduler-podantiaffinity-848c88bf5-2tfvx   0/1   Pending   0   42s   <none>   <none>
scheduler-podantiaffinity-848c88bf5-dmwsm   0/1   Pending   0   42s   <none>   <none>
scheduler-podantiaffinity-848c88bf5-lh2rl   1/1   Running   0   42s   10.100.0.24   master(jiuxianqiao)
scheduler-podantiaffinity-848c88bf5-lhk5m   0/1   Pending   0   42s   <none>   <none>
scheduler-podantiaffinity-848c88bf5-rfb96   0/1   Pending   0   42s   <none>   <none>
```

상세 스케줄링 이벤트:

```bash
[root@master ~]# kubectl describe pod scheduler-podantiaffinity-848c88bf5-2tfvx | grep Events -A 5
Events:
  Warning  FailedScheduling  42s   default-scheduler
           0/3 nodes available: 2 didn't match pod anti-affinity rules, 1 Insufficient cpu.
  Warning  FailedScheduling  23s   default-scheduler
           0/3 nodes available: 3 node(s) didn't match pod anti-affinity rules.
```

**단계별 분석:**

1. 1번째 Pod 는 master(jiuxianqiao)에 배치됨 — 해당 dc 에는 아직 `xiuxian` Pod 가 없으므로 성공.
2. 기존 `ds-xiuxian` 이 worker01(lugu)과 worker02(zhaowei)를 점유 중 → 반친화 규칙으로 인해 이 두 dc 가 즉시 제외됨.
3. 2번째 이후의 Pod 는 3개 dc 모두에 `xiuxian` Pod 가 존재함을 발견 → `3 node(s) didn't match pod anti-affinity rules` → 전부 Pending 상태로 대기.

**결론:** `podAntiAffinity.requiredDuringScheduling...` 은 각 `dc` 토폴로지 내에 `apps=xiuxian` Pod 가 최대 1개만 상주함을 보장합니다. 기존 `ds-xiuxian` 으로 인해 5개 복제본 중 1개 Running + 4개 Pending 으로 제한됩니다.

---

## 9. 스케줄링 전략 선정 가이드 매트릭스

| 시나리오 | 권장 전략 | 핵심 설정 파라미터 |
| --- | --- | --- |
| 특정 레이블 노드에 필수 배치 | nodeSelector | `nodeSelector: {gpu: "nvidia"}` |
| 다중 조건으로 노드 선택 또는 제외 | nodeAffinity required | `operator: In/NotIn` |
| 선호하되 필수는 아닌 유연한 배치 | nodeAffinity preferred | `weight: 1-100` |
| 연관 애플리케이션 Pod 간 근접 집약 | podAffinity required | `topologyKey` + `matchLabels` |
| 동일 앱 Pod 간 분산 배치 (고가용성) | podAntiAffinity required | `topologyKey` + `matchExpressions` |
| 노드에 신규 Pod 배치 거부 | Taint: NoSchedule | `kubectl taint node N key=val:NoSchedule` |
| 노드에서 모든 Pod 즉시 축출 | Taint: NoExecute | `kubectl taint node N key=val:NoExecute` |
| 모든 노드 테인트를 전면 수용 | Toleration: Exists | `operator: Exists` |
