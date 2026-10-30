---
title: "K8S 排障三板斧实战：kubectl explain、cp 与 logs"
date: 2026-10-30T19:44:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "本文总结 K8S 日常排障最常用的三个命令。先构建一个执行完立即退出的 troubleshooting 测试镜像，再用 kubectl explain 直接读取 API Server 的 OpenAPI Schema 查字段归属（无需联网查文档）；随后用 Pod 定义中的 command + args 覆盖镜像默认 CMD，把一次性退出的容器改成长驻运行以便 exec 排查；最后演示 kubectl cp 在宿主机与 Pod 之间双向拷贝文件（拷配置进去、拷日志出来），以及 Pod 异常时第一手要看的 kubectl logs——CrashLoopBackOff 就靠它定位。"
---

# K8S 排障三板斧实战：kubectl explain、cp 与 logs

---

## 1. 准备工作：构建troubleshooting测试镜像

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

这个镜像的默认 CMD 是 `ls -l /dawn-xixi`——一个执行完立即退出的命令。后面要在 Pod 定义中覆盖它，让容器保持运行。

---

## 2. kubectl explain——K8S 自带的文档

`kubectl explain` 不联网，直接读取 API Server 中资源的 OpenAPI Schema：

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

实际排障时，比如忘了 `volumeMounts` 应该放在 `containers` 下还是 `spec` 下，可以通过此方法查看：

```bash
[root@master ~]# kubectl explain pods.spec.containers.volumeMounts
```

---

## 3. Troubleshooting Pod

### 3.1 覆盖 CMD

之前构建的 `dawn-xixi:v0.1` 镜像默认执行 `ls -l /dawn-xixi`，跑完就退出——容器状态变成 `Completed`，没法 `exec` 进去排查。

用 Pod 定义中的 `command` + `args` 覆盖成 `tail -f /etc/hosts`，让容器一直运行：

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

### 3.2 kubectl cp（文件拷贝）

```bash
# 宿主机 → Pod
[root@master pods]# kubectl cp /etc/os-release www.dawn.com-dawn-002:/os-release
[root@master pods]# kubectl exec www.dawn.com-dawn-002 -- ls -l /os-release
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 /os-release -> ../usr/lib/os-release

# Pod → 宿主机
[root@master pods]# kubectl cp www.dawn.com-dawn-002:/dawn-xixi/ ./xixi_tmp
[root@master pods]# ls -la ./xixi_tmp/
total 8
drwxr-xr-x 2 root root 4096 Oct 30 16:48 .
drwxr-xr-x 3 root root 4096 Oct 30 16:48 ..
```

宿主机配置文件拷进容器，容器日志拷出来分析——双向通道。

### 3.3 kubectl logs（查看日志）

```bash
[root@master pods]# kubectl logs www.dawn.com-dawn-002
# Kubernetes-managed hosts file.
127.0.0.1	localhost
::1	localhost ip6-localhost ip6-loopback
fe00::0	ip6-localnet
fe00::0	ip6-mcastprefix
```

Pod 挂了第一个看的就是 `kubectl logs`——CrashLoopBackOff 靠它定位。