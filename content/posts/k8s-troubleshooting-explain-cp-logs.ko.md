---
title: "K8S 트러블슈팅 3종 세트 실전: kubectl explain, cp, logs"
date: 2026-10-30T19:44:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "이 글은 K8S 일상 트러블슈팅에서 가장 자주 쓰는 세 명령을 정리한다. 먼저 실행 즉시 종료되는 troubleshooting 테스트 이미지를 빌드하고, kubectl explain 으로 API Server 의 OpenAPI Schema 를 직접 읽어 필드가 어디에 속하는지 확인한다（네트워크 불필요）. 다음으로 Pod 정의의 command + args 로 이미지 기본 CMD 를 덮어써 한 번 실행되고 끝나는 컨테이너를 상주시켜 exec 로 조사할 수 있게 한다. 마지막으로 kubectl cp 로 호스트와 Pod 사이를 양방향으로 파일 복사하고（설정은 넣고, 로그는 밖으로）, Pod 이상 시 가장 먼저 볼 kubectl logs —— CrashLoopBackOff 는 이것으로 찾아낸다."
---

# K8S 트러블슈팅 3종 세트 실전: kubectl explain, cp, logs

---

## 1. 준비: troubleshooting 테스트 이미지 빌드

```bash
[root@master ~]# mkdir -p /dawn/dockerfile/troubleshooting
[root@master ~]# cat > /dawn/dockerfile/troubleshooting/Dockerfile << 'EOF'
FROM harbor:443/dawn-linux/alpine:3.20.2
RUN mkdir /dawn-xixi
CMD ["ls","-l","/dawn-xixi"]
EOF

[root@master ~]# cd /dawn/dockerfile/troubleshooting
[root@master ~]# docker build -t harbor:443/dawn-troubleshooting/dawn-xixi:v0.1 .
Successfully built f8e96cb77a91

[root@master ~]# docker push harbor:443/dawn-troubleshooting/dawn-xixi:v0.1
v0.1: digest: sha256:43ed7f4b... size: 734
```

이 이미지의 기본 CMD 는 `ls -l /dawn-xixi` —— 실행 즉시 종료되는 명령이다. 뒤에서 Pod 정의에서 이를 덮어써 컨테이너를 계속 실행시킨다.

---

## 2. kubectl explain —— K8S 내장 문서

`kubectl explain` 은 네트워크를 쓰지 않고 API Server 의 리소스 OpenAPI Schema 를 직접 읽는다:

```bash
[root@master ~]# kubectl explain pods
KIND:     Pod
VERSION:  v1
DESCRIPTION:
     Pod is a collection of containers that can run on a host.

[root@master ~]# kubectl explain pods.metadata
KIND:     Pod
VERSION:  v1
RESOURCE: metadata <Object>
DESCRIPTION:
     Standard object's metadata.
```

실제 장애 대응에서, 예를 들어 `volumeMounts` 가 `containers` 아래인지 `spec` 아래인지 헷갈릴 때 이 방법으로 확인할 수 있다:

```bash
[root@master ~]# kubectl explain pods.spec.containers.volumeMounts
```

---

## 3. Troubleshooting Pod

### 3.1 CMD 덮어쓰기

앞서 빌드한 `dawn-xixi:v0.1` 이미지는 기본적으로 `ls -l /dawn-xixi` 를 실행하고 바로 종료된다 —— 컨테이너 상태가 `Completed` 가 되어 `exec` 로 들어가 조사할 수 없다.

Pod 정의의 `command` + `args` 로 `tail -f /etc/hosts` 를 덮어써 컨테이너를 계속 실행시킨다:

```yaml
# 05-pods-Troubleshooting.yaml
apiVersion: v1
kind: Pod
metadata:
  name: www.dawn.com-dawn-002
spec:
  nodeName: worker01
  containers:
  - image: harbor:443/dawn-troubleshooting/dawn-xixi:v0.1
    name: mylinux
    command:
    - tail
    - -f
    args:
    - /etc/hosts
```

```bash
[root@master pods]# kubectl apply -f 05-pods-Troubleshooting.yaml
pod/www.dawn.com-dawn-002 created

[root@master pods]# kubectl get pods -o wide
NAME                       READY   STATUS    RESTARTS   AGE   IP            NODE
www.dawn.com-dawn-002   1/1     Running   0          5s    10.100.1.10   worker01
```

### 3.2 kubectl cp（파일 복사）

```bash
# 호스트 → Pod
[root@master pods]# kubectl cp /etc/os-release www.dawn.com-dawn-002:/os-release
[root@master pods]# kubectl exec www.dawn.com-dawn-002 -- ls -l /os-release
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 /os-release -> ../usr/lib/os-release

# Pod → 호스트
[root@master pods]# kubectl cp www.dawn.com-dawn-002:/dawn-xixi/ ./xixi_tmp
[root@master pods]# ls -la ./xixi_tmp/
total 8
drwxr-xr-x 2 root root 4096 Oct 30 16:48 .
drwxr-xr-x 3 root root 4096 Oct 30 16:48 ..
```

호스트 설정 파일을 컨테이너로 복사하고, 컨테이너 로그를 밖으로 복사해 분석한다 —— 양방향 채널.

### 3.3 kubectl logs（로그 확인）

```bash
[root@master pods]# kubectl logs www.dawn.com-dawn-002
# Kubernetes-managed hosts file.
127.0.0.1	localhost
::1	localhost ip6-localhost ip6-loopback
fe00::0	ip6-localnet
fe00::0	ip6-mcastprefix
```

Pod 가 죽었을 때 가장 먼저 보는 것은 `kubectl logs` —— CrashLoopBackOff 는 이것으로 위치를 특정한다.