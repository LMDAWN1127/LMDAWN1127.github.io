---
title: "Docker Installation in Practice: Binary Deployment and One-Click Script Deployment"
date: 2026-10-23T12:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Install Docker three ways: via the apt package manager, from official static binaries (download/extract/copy/start), and with an automation script (install and uninstall). Also covers how to cleanly remove the binary install."
---

# Docker Installation in Practice: Binary Deployment and One-Click Script Deployment

## 1. Installing Docker via the package manager

Taking Ubuntu as an example, installing via the apt package manager is the simplest approach - a single command does it:

```bash
root@docker01:~# apt update && apt install -y docker.io
```

The version installed this way is determined by the Ubuntu repositories and is good for quick validation. To install the latest or a specific version, follow Docker's official docs to add the repository and install docker-ce, or use the binary deployment method below.

  Reference:

  https://docs.docker.com/engine/install/ubuntu/

## 2. Deploying the Docker environment from binaries

1. Download the package

```bash
root@docker01:~# wget https://download.docker.com/linux/static/stable/x86_64/docker-27.0.3.tgz
```

2. Extract the package

```bash
root@docker01:~# tar xf docker-27.0.3.tgz
```

3. Copy into the PATH

```bash
root@docker01:~# cp docker/* /usr/bin/
```

4. Start Docker

```bash
root@docker01:~# dockerd
```

5. Check the Docker version

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

## 3. Uninstalling the binary Docker environment

> Note: the uninstall commands below delete the relevant files in /usr/bin by iterating over the docker folder in the current directory. Before running them, first enter the docker directory that was created when you extracted docker-27.0.3.tgz.

1. Stop the Docker service

```bash
root@docker01:~# pkill dockerd
```

  After stopping the service, checking the version again shows the following message:

  Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?

2. Remove the Docker-related programs

```bash
root@docker01:~# for i in `ls docker`;do rm -f /usr/bin/$i ;done
```

3. Verify

```bash
root@docker01:~# docker
-bash: /usr/bin/docker: No such file or directory
```

## 4. Deploying or uninstalling the Docker environment with a script

Create the directory

```bash
root@docker01:~# mkdir -pv /dawn/softwares
```

Download the package

Download the automation package dawn-autoinstall-docker-docker-compose.tar.gz (about 158MB) from the Alist file server (https://www.dawncloud.top/dawn), as shown below:

![image-20261023111049752](/images/docker-binary-script-install-image-20261023111049752.png)

Extract the package

```bash
root@docker01:~# cd /dawn/softwares/
root@docker01:/dawn/softwares# tar xf dawn-autoinstall-docker-docker-compose.tar.gz
```

Install Docker

```bash
root@docker01:/dawn/softwares# ./install-docker.sh i
```

Check the Docker version

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

Uninstall Docker

```bash
root@docker01:/dawn/softwares# ./install-docker.sh r
```
