---
title: "K8S Troubleshooting Trio in Practice: kubectl explain, cp and logs"
date: 2026-10-30T19:44:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Kubernetes"]
showToc: true
summary: "This article covers the three commands I reach for most when troubleshooting K8S. First build a troubleshooting test image that exits immediately, then use kubectl explain to read the OpenAPI Schema straight from the API Server and find out where a field belongs (no internet needed). Next, override the image's default CMD with command + args in the Pod definition so a one-shot container stays running and can be inspected with exec. Finally, kubectl cp copies files both ways between the host and a Pod (config in, logs out), and kubectl logs is the first thing to check when a Pod misbehaves — it is how you track down CrashLoopBackOff."
---

# K8S Troubleshooting Trio in Practice: kubectl explain, cp and logs

---

## 1. Preparation: Build the troubleshooting Test Image

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

The image's default CMD is `ls -l /dawn-xixi` — a command that exits immediately. Later we override it in the Pod definition so the container keeps running.

---

## 2. kubectl explain — The Documentation Built Into K8S

`kubectl explain` works offline: it reads the resource's OpenAPI Schema straight from the API Server:

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

In real troubleshooting, if you forget whether `volumeMounts` belongs under `containers` or under `spec`, you can check it this way:

```bash
[root@master ~]# kubectl explain pods.spec.containers.volumeMounts
```

---

## 3. Troubleshooting Pod

### 3.1 Overriding CMD

The `dawn-xixi:v0.1` image built earlier runs `ls -l /dawn-xixi` by default and exits right away — the container ends up `Completed` and you cannot `exec` into it.

Override it with `command` + `args` in the Pod definition, using `tail -f /etc/hosts` so the container keeps running:

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

### 3.2 kubectl cp (Copying Files)

```bash
# Host -> Pod
[root@master pods]# kubectl cp /etc/os-release www.dawn.com-dawn-002:/os-release
[root@master pods]# kubectl exec www.dawn.com-dawn-002 -- ls -l /os-release
lrwxrwxrwx  1 root  root  21 Oct 30 08:48 /os-release -> ../usr/lib/os-release

# Pod -> Host
[root@master pods]# kubectl cp www.dawn.com-dawn-002:/dawn-xixi/ ./xixi_tmp
[root@master pods]# ls -la ./xixi_tmp/
total 8
drwxr-xr-x 2 root root 4096 Oct 30 16:48 .
drwxr-xr-x 3 root root 4096 Oct 30 16:48 ..
```

Copy host config files into the container, copy container logs out for analysis — a two-way channel.

### 3.3 kubectl logs (Reading Logs)

```bash
[root@master pods]# kubectl logs www.dawn.com-dawn-002
# Kubernetes-managed hosts file.
127.0.0.1	localhost
::1	localhost ip6-localhost ip6-loopback
fe00::0	ip6-localnet
fe00::0	ip6-mcastprefix
```

When a Pod dies, `kubectl logs` is the first thing to look at — it is how you pin down CrashLoopBackOff.