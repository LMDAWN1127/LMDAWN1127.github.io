---
title: "Docker 安装实战：二进制部署与一键脚本部署"
date: 2026-10-23T12:30:00+08:00
draft: false
tags: ["Docker"]
---

# Docker 安装实战：二进制部署与一键脚本部署

## 1. docker基于包的方式安装

以 Ubuntu 为例，通过 apt 包管理方式安装最为简单，一条命令即可完成：

```bash
root@docker01:~# apt update && apt install -y docker.io
```

这种方式安装的版本由 Ubuntu 软件源决定，适合快速验证；如需安装最新版本或指定版本，可参照 Docker 官方文档添加软件源后安装 docker-ce，或使用下面的二进制部署方式。

  参考链接:

  https://docs.docker.com/engine/install/ubuntu/

## 2. 二进制部署docker环境

1. 下载软件包

```bash
root@docker01:~# wget https://download.docker.com/linux/static/stable/x86_64/docker-27.0.3.tgz
```

2. 解压软件包

```bash
root@docker01:~# tar xf docker-27.0.3.tgz
```

3. 拷贝到PATH变量

```bash
root@docker01:~# cp docker/* /usr/bin/
```

4. 启动docker

```bash
root@docker01:~# dockerd
```

5. 查看docker的版本号

```bash
root@docker01:~# docker version
Client:
 Version:           27.0.3
 API version:       1.46
 Go version:        go1.21.11
 Git commit:        7d4bcd8
 Built:             Sat Jun 29 00:01:25 2024
 OS/Arch:           linux/amd64
 Context:           default

Server: Docker Engine - Community
 Engine:
  Version:          27.0.3
  API version:      1.46 (minimum version 1.24)
  Go version:       go1.21.11
  Git commit:       662f78c
  Built:            Sat Jun 29 00:03:05 2024
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v1.7.18
  GitCommit:        ae71819c4f5e67bb4d5ae76a6b735f29cc25774e
 runc:
  Version:          1.1.13
  GitCommit:        v1.1.13-0-g58aa920
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

## 3. 卸载二进制的docker环境

> 注意：下面的卸载命令通过遍历当前目录下的 docker 文件夹来删除 /usr/bin 中的相关文件，执行前需先进入当初解压 docker-27.0.3.tgz 时生成的 docker 目录。

1. 停止docker服务

```bash
root@docker01:~# pkill dockerd
```

  停止服务后，再次查看版本会出现如下的提示

  Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?

2. 卸载docker相关的程序

```bash
root@docker01:~# for i in `ls docker`;do rm -f /usr/bin/$i ;done
```

3. 验证

```bash
root@docker01:~# docker
-bash: /usr/bin/docker: No such file or directory
```

## 4. 基于脚本部署或卸载docker环境

创建目录

```bash
root@docker01:~# mkdir -pv /dawn/softwares
```

下载软件包

从 Alist 文件服务器（https://www.dawncloud.top/dawn ）下载自动化安装包 dawn-autoinstall-docker-docker-compose.tar.gz（约 158MB），如下图所示：

![image-20261023111049752](/images/docker-binary-script-install-image-20261023111049752.png)

解压软件包

```bash
root@docker01:~# cd /dawn/softwares/
root@docker01:/dawn/softwares# tar xf dawn-autoinstall-docker-docker-compose.tar.gz
```

安装docker

```bash
root@docker01:/dawn/softwares# ./install-docker.sh i
```

查看docker的版本号

```bash
root@docker01:/dawn/softwares# docker version
Client:
 Version:           27.0.3
 API version:       1.46
 Go version:        go1.21.11
 Git commit:        7d4bcd8
 Built:             Sat Jun 29 00:01:25 2024
 OS/Arch:           linux/amd64
 Context:           default

Server: Docker Engine - Community
 Engine:
  Version:          27.0.3
  API version:      1.46 (minimum version 1.24)
  Go version:       go1.21.11
  Git commit:       662f78c
  Built:            Sat Jun 29 00:03:05 2024
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v1.7.18
  GitCommit:        ae71819c4f5e67bb4d5ae76a6b735f29cc25774e
 runc:
  Version:          1.1.13
  GitCommit:        v1.1.13-0-g58aa920
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

卸载docker

```bash
root@docker01:/dawn/softwares# ./install-docker.sh r
```
