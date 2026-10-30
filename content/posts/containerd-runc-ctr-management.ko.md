---
title: "containerd 컨테이너 런타임 구축과 runc/ctr 관리 실전"
date: 2026-10-30T10:31:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "이 실습에서는 먼저 docker02 노드의 Docker 바이너리를 제거한 뒤, containerd 1.7.20 런타임（cri-containerd-cni 압축 해제, systemd 유닛 설치, config.toml 에서 SystemdCgroup 활성화 및 sandbox_image 교체）을 구축하고 runc 1.1.12 와 ctr 클라이언트를 설치한다. 이후 ctr 로 이미지 풀/태그, 컨테이너 생성/시작/일시정지/재개/삭제, 네임스페이스 관리, 그리고 docker01 Harbor（HTTP, 비 TLS）로의 이미지 푸시 및 풀 전체 작업을 시연한다."
---

# containerd 컨테이너 런타임 구축과 runc/ctr 관리 실전

## 제1부 containerd 컨테이너 관리 도구

Docker 제거

```bash
root@docker02:~# systemctl stop docker
root@docker02:~# rm -f /lib/systemd/system/docker.service /etc/systemd/system/docker.service
root@docker02:~# systemctl daemon-reload
root@docker02:~# rm -f /usr/bin/docker /usr/bin/dockerd /usr/bin/docker-init /usr/bin/docker-proxy /usr/bin/docker-compose
root@docker02:~# rm -f /usr/bin/containerd /usr/bin/ctr /usr/bin/runc
root@docker02:~# which docker dockerd containerd ctr runc
(비어 있음, 모두 제거됨)
```

Docker 는 바이너리 방식으로 설치되었으며（`/dawn/softwares/docker/` 에 심볼릭 링크）. 제거란 심볼릭 링크와 systemd 서비스를 삭제하는 것입니다. 원본 바이너리는 `/dawn/softwares/docker/` 에 백업으로 보관됩니다.

### 1. containerd 다운로드

```bash
root@docker02:~# wget https://github.com/containerd/containerd/releases/download/v1.7.20/cri-containerd-cni-1.7.20-linux-amd64.tar.gz
root@docker02:~# ls -lh cri-containerd-cni-1.7.20-linux-amd64.tar.gz
-rw-r--r-- 1 root root 143M Jul 18 2024 cri-containerd-cni-1.7.20-linux-amd64.tar.gz
```

### 2. 패키지 압축 해제

```bash
root@docker02:~# tar xf cri-containerd-cni-1.7.20-linux-amd64.tar.gz
```

### 3. containerd 런타임 파일을 호스트 지정 경로로 복사

```bash
root@docker02:~# cp usr/local/bin/containerd /usr/local/bin/
root@docker02:~# cp usr/local/bin/containerd-shim /usr/local/bin/
root@docker02:~# cp usr/local/bin/containerd-shim-runc-v1 /usr/local/bin/
root@docker02:~# cp usr/local/bin/containerd-shim-runc-v2 /usr/local/bin/
root@docker02:~# cp usr/local/bin/ctr /usr/bin/
root@docker02:~# cp usr/local/bin/crictl /usr/bin/
root@docker02:~# containerd --version
containerd github.com/containerd/containerd v1.7.20 8fc6bcff51318944179630522a095cc9dbf9f353
```

### 4. containerd systemd 유닛 파일 복사

```bash
root@docker02:~# cp etc/systemd/system/containerd.service /usr/lib/systemd/system/
```

### 5. containerd 설정 파일 생성 및 수정

```bash
root@docker02:~# mkdir -p /etc/containerd
root@docker02:~# containerd config default > /etc/containerd/config.toml
root@docker02:~# sed -ri 's#(SystemdCgroup = )false#\1true#' /etc/containerd/config.toml
root@docker02:~# sed -i 's#registry.k8s.io/pause:3.8#uhub.service.ucloud.cn/dawn/pause:3.8#' /etc/containerd/config.toml
root@docker02:~# grep SystemdCgroup /etc/containerd/config.toml
            SystemdCgroup = true
root@docker02:~# grep sandbox_image /etc/containerd/config.toml
    sandbox_image = "uhub.service.ucloud.cn/dawn/pause:3.8"
```

### 6. containerd 서비스 시작

```bash
root@docker02:~# systemctl enable --now containerd
Created symlink /etc/systemd/system/multi-user.target.wants/containerd.service → /lib/systemd/system/containerd.service.
root@docker02:~# systemctl status containerd | head -4
● containerd.service - containerd container runtime
   Loaded: loaded (/lib/systemd/system/containerd.service; enabled; vendor preset: enabled)
   Active: active (running)
```

### 7. ctr 클라이언트 도구 복사 및 버전 확인

```bash
root@docker02:~# ctr --version
ctr github.com/containerd/containerd v1.7.20
root@docker02:~# ctr version
Client:
  Version:  v1.7.20
  Revision: 8fc6bcff51318944179630522a095cc9dbf9f353
  Go version: go1.21.12
Server:
  Version:  v1.7.20
  Revision: 8fc6bcff51318944179630522a095cc9dbf9f353
  UUID: 732b5e18-1bb3-4792-a7ef-2e6687016e2e
```

---

## 제2부 runc 설치와 ctr 도구 관리 실전

### 1. runc 다운로드

```bash
root@docker02:~# wget https://github.com/opencontainers/runc/releases/download/v1.1.12/runc.amd64
root@docker02:~# ls -lh runc.amd64
-rw-r--r-- 1 root root 11M Jan 23 2024 runc.amd64
```

### 2. runc 를 PATH 로 이동하고 실행 권한 부여

```bash
root@docker02:~# mv runc.amd64 /usr/bin/runc
root@docker02:~# chmod +x /usr/bin/runc
root@docker02:~# runc --version
runc version 1.1.12
commit: v1.1.12-0-g51d5e946
spec: 1.0.2-dev
go: go1.20.13
libseccomp: 2.5.4
```

### 3. ctr 기본: 이미지 관리

**3.1 이미지 목록 조회（초기 비어 있음）**

```bash
root@docker02:~# ctr images ls
REF TYPE DIGEST SIZE PLATFORMS LABELS
```

**3.2 이미지 풀**

```bash
root@docker02:~# ctr images pull uhub.service.ucloud.cn/dawn/apps:v1
...
elapsed: 3.5 s  total: 8.9 Mi (2.5 MiB/s)
unpacking linux/amd64 sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c...
done: 585.870274ms

root@docker02:~# ctr images ls
REF                                                       TYPE                                                 DIGEST                                                                  SIZE    PLATFORMS   LABELS
uhub.service.ucloud.cn/dawn/apps:v1 application/vnd.docker.distribution.manifest.v2+json sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c 9.6 MiB linux/amd64 -
```

### 4. ctr 실전: 컨테이너 관리

**4.1 컨테이너 생성 및 시작**

```bash
root@docker02:~# ctr containers create uhub.service.ucloud.cn/dawn/apps:v1 xiuxian
root@docker02:~# ctr containers ls
CONTAINER    IMAGE                                                        RUNTIME
xiuxian      uhub.service.ucloud.cn/dawn/apps:v1    io.containerd.runc.v2

root@docker02:~# ctr task start -d xiuxian
root@docker02:~# ctr task ls
TASK       PID      STATUS
xiuxian    64464    RUNNING
```

**4.2 컨테이너의 호스트 PID 확인**

```bash
root@docker02:~# ps -ef | grep 64464 | grep -v grep
root       64464   64444  0 09:47 ?  00:00:00 nginx: master process nginx -g daemon off;
systemd+   64502   64464  0 09:47 ?  00:00:00 nginx: worker process
systemd+   64503   64464  0 09:47 ?  00:00:00 nginx: worker process
```

**4.3 컨테이너 내 명령 실행**

```bash
root@docker02:~# ctr task exec --exec-id 1 xiuxian ps -ef
PID   USER     TIME  COMMAND
    1 root      0:00 nginx: master process nginx -g daemon off;
   33 nginx     0:00 nginx: worker process
   34 nginx     0:00 nginx: worker process
   35 root      0:00 ps -ef
```

**4.4 컨테이너 일시정지 및 재개**

```bash
root@docker02:~# ctr tasks pause xiuxian
root@docker02:~# ctr task ls
TASK       PID      STATUS
xiuxian    64464    PAUSED

root@docker02:~# ctr tasks resume xiuxian
root@docker02:~# ctr task ls
TASK       PID      STATUS
xiuxian    64464    RUNNING
```

**4.5 컨테이너 중지 및 삭제**

```bash
root@docker02:~# ctr task kill xiuxian
root@docker02:~# ctr task rm xiuxian
root@docker02:~# ctr containers rm xiuxian
root@docker02:~# ctr task ls
TASK    PID    STATUS
```

실행 중인 컨테이너를 삭제하려면 먼저 `ctr task kill`（또는 `ctr task rm -f`）로 태스크를 중지한 다음, `ctr task rm` 로 태스크를, `ctr containers rm` 로 컨테이너를 삭제해야 합니다. 순서를 바꾸면 `task must be stopped before deletion` 오류가 발생합니다.

### 5. ctr 네임스페이스 관리

```bash
root@docker02:~# ctr namespaces ls
NAME    LABELS
default

root@docker02:~# ctr ns create dawn-dawn
root@docker02:~# ctr ns ls
NAME      LABELS
dawn-dawn
default
```

네임스페이스를 삭제하기 전에 그 안이 비어 있어야 합니다（이미지 없음, 컨테이너 없음）. 그렇지 않으면 `must be empty` 오류가 발생합니다.

### 6. ctr 로 Harbor 에서 이미지 푸시/풀

**6.1 이미지에 태그 부여 및 docker01 Harbor 로 푸시**

```bash
root@docker02:~# ctr images tag uhub.service.ucloud.cn/dawn/apps:v1 11.0.1.121/dawn-games/xiuxian:v1
root@docker02:~# ctr images push --platform linux/amd64 --plain-http -u admin:1 11.0.1.121/dawn-games/xiuxian:v1
manifest-sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c: done
config-sha256:f28fd43be4ad41fc768dcc3629f8479d1443df01ada10ac9a771314e4fdef599: done
elapsed: 0.8 s  total: 9.4 Ki (11.7 KiB/s)
```

**6.2 Harbor 에서 이미지 풀하여 검증**

```bash
root@docker02:~# ctr images rm 11.0.1.121/dawn-games/xiuxian:v1
root@docker02:~# ctr images pull --plain-http 11.0.1.121/dawn-games/xiuxian:v1
...
unpacking linux/amd64 sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c...
done: 6.182696ms
```

ctr 에서 HTTP（비 TLS）레지스트리로 푸시/풀하려면 명시적으로 `--plain-http` 플래그가 필요하며, 인증은 `-u admin:1` 을 사용합니다. ctr 은 Docker 와 달리 로컬에 없는 이미지를 원격에서 자동으로 풀어오지 않습니다.