---
title: "containerd 容器运行时部署与 runc/ctr 管理实战"
date: 2026-10-30T10:31:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本文实战演示在 docker02 节点卸载 Docker 二进制后，部署 containerd 1.7.20 容器运行时（含 cri-containerd-cni 解压、systemd 服务、config.toml 开启 SystemdCgroup 与替换 sandbox_image），并安装 runc 1.1.12 与 ctr 客户端；随后用 ctr 完成镜像拉取/打 tag、容器创建/启动/暂停恢复/删除、命名空间管理，以及向 docker01 的 Harbor（HTTP 非 TLS）推送与拉取镜像的完整操作。"
---

# containerd 容器运行时部署与 runc/ctr 管理实战

## 一、containerd 容器管理工具

卸载 docker

```bash
root@docker02:~# systemctl stop docker
root@docker02:~# rm -f /lib/systemd/system/docker.service /etc/systemd/system/docker.service
root@docker02:~# systemctl daemon-reload
root@docker02:~# rm -f /usr/bin/docker /usr/bin/dockerd /usr/bin/docker-init /usr/bin/docker-proxy /usr/bin/docker-compose
root@docker02:~# rm -f /usr/bin/containerd /usr/bin/ctr /usr/bin/runc
root@docker02:~# which docker dockerd containerd ctr runc
(空，已全部卸载)
```

docker 为二进制方式安装（软链接指向 `/dawn/softwares/docker/`），卸载即移除软链接与 systemd 服务；原始二进制保留在 `/dawn/softwares/docker/` 作备份

### 1. 下载 containerd

```bash
root@docker02:~# wget https://github.com/containerd/containerd/releases/download/v1.7.20/cri-containerd-cni-1.7.20-linux-amd64.tar.gz
root@docker02:~# ls -lh cri-containerd-cni-1.7.20-linux-amd64.tar.gz
-rw-r--r-- 1 root root 143M Jul 18 2024 cri-containerd-cni-1.7.20-linux-amd64.tar.gz
```

### 2. 解压软件包

```bash
root@docker02:~# tar xf cri-containerd-cni-1.7.20-linux-amd64.tar.gz
```

### 3. 拷贝 containerd 运行时文件到宿主机指定路径

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

### 4. 拷贝 containerd 的 systemd 配置文件

```bash
root@docker02:~# cp etc/systemd/system/containerd.service /usr/lib/systemd/system/
```

### 5. 生成并修改 containerd 配置文件

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

### 6. 启动 containerd 服务

```bash
root@docker02:~# systemctl enable --now containerd
Created symlink /etc/systemd/system/multi-user.target.wants/containerd.service → /lib/systemd/system/containerd.service.
root@docker02:~# systemctl status containerd | head -4
● containerd.service - containerd container runtime
   Loaded: loaded (/lib/systemd/system/containerd.service; enabled; vendor preset: enabled)
   Active: active (running)
```

### 7. 拷贝 ctr 客户端工具并查看版本

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

## 二、安装 runC 与 ctr 工具管理实战

### 1. 下载 runc

```bash
root@docker02:~# wget https://github.com/opencontainers/runc/releases/download/v1.1.12/runc.amd64
root@docker02:~# ls -lh runc.amd64
-rw-r--r-- 1 root root 11M Jan 23 2024 runc.amd64
```

### 2. 移动 runc 到 PATH 并加执行权限

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

### 3. ctr 工具管理镜像基础

**3.1 查看镜像列表（初始为空）**

```bash
root@docker02:~# ctr images ls
REF TYPE DIGEST SIZE PLATFORMS LABELS
```

**3.2 拉取镜像**

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

### 4. ctr 工具管理容器实战

**4.1 创建并启动容器**

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

**4.2 查看容器对应的宿主机 PID**

```bash
root@docker02:~# ps -ef | grep 64464 | grep -v grep
root       64464   64444  0 09:47 ?  00:00:00 nginx: master process nginx -g daemon off;
systemd+   64502   64464  0 09:47 ?  00:00:00 nginx: worker process
systemd+   64503   64464  0 09:47 ?  00:00:00 nginx: worker process
```

**4.3 在容器中执行命令**

```bash
root@docker02:~# ctr task exec --exec-id 1 xiuxian ps -ef
PID   USER     TIME  COMMAND
    1 root      0:00 nginx: master process nginx -g daemon off;
   33 nginx     0:00 nginx: worker process
   34 nginx     0:00 nginx: worker process
   35 root      0:00 ps -ef
```

**4.4 暂停与恢复容器**

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

**4.5 停止并删除容器**

```bash
root@docker02:~# ctr task kill xiuxian
root@docker02:~# ctr task rm xiuxian
root@docker02:~# ctr containers rm xiuxian
root@docker02:~# ctr task ls
TASK    PID    STATUS
```

删除运行中的容器必须先 `ctr task kill`（或 `ctr task rm -f`）停止任务，再 `ctr task rm` 删任务、`ctr containers rm` 删容器，顺序不能颠倒，否则报 `task must be stopped before deletion`。

### 5. ctr 命名空间管理

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

删除命名空间前必须保证其下为空（无镜像、无容器），否则报 `must be empty`。

### 6. ctr 从 harbor 仓库推送或拉取镜像

**6.1 给镜像打 tag 并推送到 docker01 harbor**

```bash
root@docker02:~# ctr images tag uhub.service.ucloud.cn/dawn/apps:v1 11.0.1.121/dawn-games/xiuxian:v1
root@docker02:~# ctr images push --platform linux/amd64 --plain-http -u admin:1 11.0.1.121/dawn-games/xiuxian:v1
manifest-sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c: done
config-sha256:f28fd43be4ad41fc768dcc3629f8479d1443df01ada10ac9a771314e4fdef599: done
elapsed: 0.8 s  total: 9.4 Ki (11.7 KiB/s)
```

**6.2 从 harbor 拉取镜像验证**

```bash
root@docker02:~# ctr images rm 11.0.1.121/dawn-games/xiuxian:v1
root@docker02:~# ctr images pull --plain-http 11.0.1.121/dawn-games/xiuxian:v1
...
unpacking linux/amd64 sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c...
done: 6.182696ms
```

ctr 的 push/pull 对 HTTP（非 TLS）仓库需显式加 `--plain-http`，认证用 `-u admin:1`；ctr 不像 docker 会自动去远程拉取本地不存在的镜像。