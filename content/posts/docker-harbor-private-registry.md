---
title: "私有镜像仓库harbor实战"
date: 2026-10-29T15:09:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "从零搭建两套私有镜像仓库：先用 docker registry 轻量级方案完成镜像的部署、推送、下载与删除（含手动删元数据 + GC 回收存储），再部署企业级 VMware Harbor（HTTP 模式），演示 hosts 解析、insecure-registries 配置、新建项目、三种 docker login 方式、镜像推送/拉取/删除全流程，最后用对比表总结 registry 与 Harbor 在体积、部署、WebUI、项目管理、删除与适用场景上的差异。"
---

# 私有镜像仓库harbor实战

**实验目的**：掌握 docker registry 轻量级私有仓库与 VMware Harbor 企业级私有仓库的部署、推送、下载、删除全流程。

---

## 一、私有镜像仓库的优势

1. 拉取镜像速度快；
2. 便于用户获取镜像；
3. 安全，内部使用。

## 二、私有镜像解决方案

| 方案                          | 说明                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| **官方仓库**                  | Docker Hub，国内被墙，需要梯子                               |
| **docker registry**（不推荐） | Docker 官方开源镜像仓库，启动起来 20MB 左右，非常轻量，但使用起来比较复杂、不利于管理 |
| **VMware Harbor**（企业推荐） | 基于 docker registry 二次开发，开源了 harbor 仓库            |
| **第三方仓库**                | 阿里云、华为云、各种云平台等                                 |

---

## 第一部分：docker registry环境搭建并推送镜像

### 1.1 部署 docker registry

```bash
root@docker01:~# docker run -dp 5000:5000 --restart=always --name dawn-registry -v /var/lib/registry registry
Unable to find image 'registry:latest' locally
latest: Pulling from library/registry
7b229517ed22: Pull complete
9cf9c5d068e4: Pull complete
30513d5b3b2d: Pull complete
7a0bafd2eac6: Pull complete
b6d795448ea0: Pull complete
Digest: sha256:d4032d4cc323c1731c707931ecada07a53076eac38e3b61ae57533f170f2c6c3
Status: Downloaded newer image for registry:latest
ec44574ca8f2ce62f9a701bafb9641c3b65b2b7ed28c631f3d49651a25b8c67c

root@docker01:~# docker ps --filter name=dawn-registry --format '{{.Names}} {{.Status}} {{.Ports}}'
dawn-registry Up 0.0.0.0:5000->5000/tcp, :::5000->5000/tcp
```

### 1.2 访问 WebUI

```
http://11.0.1.121:5000/v2/_catalog
```

初始返回（还没有任何镜像）：

```json
{"repositories":[]}
```

### 1.3 客户端配置不安全的存储库

docker 默认走 https 协议，而私有 registry 是 http，因此要让 docker 信任 http 协议，需要配置 `insecure-registries`。

```bash
root@docker02:~# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000"]
}
root@docker02:~# systemctl restart docker
root@docker02:~# docker info | grep "Insecure Registries" -A 3
 Insecure Registries:
  11.0.1.121:5000
  127.0.0.0/8
```

### 1.4 打包镜像

```bash
root@docker02:~# docker tag mysql:8.4.1-oracle 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
root@docker02:~# docker images | grep dawn-db
11.0.1.121:5000/dawn-db/mysql    8.4.1-oracle   da8f2a99cf39   2 years ago   583MB
```

### 1.5 推送镜像到私有仓库

```bash
root@docker02:~# docker push 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
The push refers to repository [11.0.1.121:5000/dawn-db/mysql]
2f75bcd245fd: Pushed
3ea6a92c9182: Pushed
2606c15a4838: Pushed
987e49e8d588: Pushed
fde3e91c5c9e: Pushed
...
8.4.1-oracle: digest: sha256:03a538f365c14f3ed9354f678707525a027f00720c134376a3c78cdcbf844344 size: 2411
```

### 1.6 再次查看 WebUI

```
http://11.0.1.121:5000/v2/_catalog
```

此时能看到：

```json
{"repositories":["dawn-db/mysql"]}
```

表示上传镜像成功。

---

## 第二部分：docker registry的镜像下载

### 2.1 配置私有仓库地址

```bash
root@docker01:~/haha# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000"]
}
root@docker01:~/haha# systemctl restart docker
root@docker01:~/haha# docker info | grep "Insecure Registries" -A 3
 Insecure Registries:
  11.0.1.121:5000
  127.0.0.0/8
```

### 2.2 下载镜像

```bash
root@docker01:~/haha# docker pull 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
8.4.1-oracle: Pulling from dawn-db/mysql
Digest: sha256:03a538f365c14f3ed9354f678707525a027f00720c134376a3c78cdcbf844344
Status: Downloaded newer image for 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle

root@docker01:~/haha# docker image ls 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
REPOSITORY                           TAG            IMAGE ID       CREATED        SIZE
11.0.1.121:5000/dawn-db/mysql        8.4.1-oracle   da8f2a99cf39   2 years ago    583MB
```

**registry 的缺点**：下载时除非用户知道镜像叫什么名称，否则用户根本不知道镜像叫什么、在哪，使用起来不太方便。这也是后面要引入 Harbor 的原因。

---

## 第三部分：docker registry的镜像删除

### 3.1 删除镜像的元数据

```bash
root@docker01:~/haha# docker exec -it dawn-registry sh
/ # cd /var/lib/registry/docker/registry/v2/
/var/lib/registry/docker/registry/v2 # ls -l
total 8
drwxr-xr-x    3 root     root          4096 Oct 29 05:52 blobs
drwxr-xr-x    3 root     root          4096 Oct 29 05:52 repositories
/var/lib/registry/docker/registry/v2 # du -sh *
161.8M  blobs
164.0K  repositories
/var/lib/registry/docker/registry/v2 # ls repositories/
dawn-db
/var/lib/registry/docker/registry/v2 # rm -rf repositories/dawn-db/
/var/lib/registry/docker/registry/v2 # ls repositories/
/var/lib/registry/docker/registry/v2 # du -sh *
161.8M  blobs
4.0K   repositories
```

删除 `repositories/` 下的元数据后，`blobs`（镜像实际数据层）并没有被删除，空间仍未释放。

### 3.2 清理镜像的数据以回收存储空间

```bash
/var/lib/registry/docker/registry/v2 # registry garbage-collect /etc/distribution/config.yml
0 blobs marked, 12 blobs and 0 manifests eligible for deletion
blob eligible for deletion: sha256:eafccfd1ea14e7a7cc14a17f7e177399149b675253070b5149a41068b6989f1e
INFO[0000] Deleting blob: /docker/registry/v2/blobs/sha256/ea/eafccfd1ea14...
/var/lib/registry/docker/registry/v2 # du -sh *
52.0K  blobs
4.0K   repositories
```

执行 `garbage-collect` 后，`blobs` 从 161.8M 降到 52.0K，存储空间成功回收。

删除镜像时比较麻烦：需要先手动删除元数据，再执行 GC 回收数据，两步操作，这也是 registry 不利于管理的一个体现。

---

## 第四部分：部署基于harbor的HTTP案例

### 4.1 下载 harbor

```bash
root@docker02:~# ls -lh harbor-offline-installer-v2.7.4.tgz
-rw-r--r-- 1 root root 721M Oct 29 05:59 harbor-offline-installer-v2.7.4.tgz
```

### 4.2 解压软件包

```bash
root@docker02:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
root@docker02:~# ls /dawn/softwares/harbor/
common.sh  harbor.v2.7.4.tar.gz  harbor.yml.tmpl  install.sh  LICENSE  prepare
```

### 4.3 准备数据目录

```bash
root@docker02:~# mkdir -pv /dawn/data/harbor
mkdir: created directory '/dawn/data'
mkdir: created directory '/dawn/data/harbor'
```

### 4.4 准备配置文件

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# cp harbor.yml.tmpl harbor.yml
root@docker02:/dawn/softwares/harbor# vim harbor.yml
...
# 指定harbor服务器的地址
hostname: harbor.dawn.com

# 注释掉https功能
#https:
#  # https port for harbor, default is 443
#  port: 443
#  # The path of cert and key files for nginx
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

# 修改harbor的admin用户密码
harbor_admin_password: 1

# 指定数据的存储目录
data_volume: /dawn/data/harbor
```

### 4.5 开始安装 harbor

```bash
root@docker02:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
Loaded image: goharbor/trivy-adapter-photon:v2.7.4
Loaded image: goharbor/prepare:v2.7.4
Loaded image: goharbor/harbor-core:v2.7.4
Loaded image: goharbor/registry-photon:v2.7.4
Loaded image: goharbor/notary-server-photon:v2.7.4
Loaded image: goharbor/nginx-photon:v2.7.4
Loaded image: goharbor/notary-signer-photon:v2.7.4
Loaded image: goharbor/chartmuseum-photon:v2.7.4
Loaded image: goharbor/harbor-portal:v2.7.4
Loaded image: goharbor/harbor-log:v2.7.4
Loaded image: goharbor/harbor-db:v2.7.4
Loaded image: goharbor/harbor-exporter:v2.7.4

[Step 3]: preparing environment ...
[Step 4]: preparing harbor configs ...
Generated configuration file: /config/portal/nginx.conf
...
[Step 5]: starting Harbor ...
 Network harbor_harbor  Creating
 ...
 ✔ ----Harbor has been installed and started successfully.----
```

install.sh 安装过程会依次完成：

1. 检查 docker、docker-compose 环境是否安装；
2. 导入 harbor 所需的镜像（`docker load`）；
3. 准备 docker-compose.yaml 及 common 目录（`prepare` 脚本）；
4. 启动 docker-compose。

### 4.6 访问 WebUI

http://11.0.1.122/harbor/projects

![image-20261029144827534](/images/docker-harbor-private-registry/image-20261029144827534.png)

安装完成后验证：

```bash
root@docker02:/dawn/softwares/harbor# docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
nginx               Up (health: starting)    0.0.0.0:80->8080/tcp
harbor-jobservice   Up (health: starting)
harbor-core         Up (health: starting)
harbor-db           Up (health: starting)
redis               Up (health: starting)
harbor-portal       Up (health: starting)
registry            Up (health: starting)
registryctl         Up (health: starting)
chartmuseum         Up (health: starting)
harbor-log          Up (health: starting)    127.0.0.1:1514->10514/tcp
```

Harbor 由 10 个容器组成：nginx（门户反代）、harbor-core（核心）、harbor-db（PostgreSQL 数据库）、redis（缓存）、harbor-portal（前端 UI）、registry（镜像仓库）、registryctl、chartmuseum、jobservice、harbor-log（日志）。

---

## 第五部分：harbor实现镜像的推送

### 5.1 添加本地的 hosts 文件解析

```bash
root@docker01:~# echo 11.0.1.122 harbor.dawn.com >> /etc/hosts
root@docker01:~# grep harbor /etc/hosts
11.0.1.122 harbor.dawn.com
```

### 5.2 添加镜像的 http 模式

```bash
root@docker01:~# vim /etc/docker/daemon.json
{
  "registry-mirrors": [
      "https://docker.m.daocloud.io"
  ],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
```

### 5.3 重启 docker 服务

```bash
root@docker01:~# systemctl restart docker
root@docker01:~# docker info | grep "Insecure Registries" -A 4
 Insecure Registries:
  11.0.1.121:5000
  harbor.dawn.com
  127.0.0.0/8
```

### 5.4 harbor 仓库新建项目

在 WebUI 中新建项目 `dawn-games`：

![image-20261029145115418](/images/docker-harbor-private-registry/image-20261029145115418.png)

### 5.5 打包测试镜像

```bash
root@docker01:~# docker tag dawn-games:v2.16 harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
root@docker01:~# docker images | grep 'dawn-games/dawn-games'
harbor.dawn.com/dawn-games/dawn-games   motuo-v0.1   fc30411c280a   17 hours ago   17.8MB
```

### 5.6 登录 harbor 仓库

三种登录方式：

```bash
# 方式一：交互式登录
root@docker01:~# docker login harbor.dawn.com
Username: admin
Password:
Login Succeeded

# 方式二：-p 参数登录（会提示不安全）
root@docker01:~# docker login -u admin -p 1 harbor.dawn.com
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded

# 方式三：--password-stdin 安全登录（推荐）
root@docker01:~# echo 1 | docker login -u admin --password-stdin harbor.dawn.com
Login Succeeded
```

登录后密码会存储在本地，使用完退出登录：

```bash
root@docker01:~# more /root/.docker/config.json
{
    "auths": {
        "harbor.dawn.com": {
            "auth": "YWRtaW46MQ=="
        }
    }
}

# 解密可看到明文用户名密码
root@docker01:~# echo YWRtaW46MQ== | base64 -d | more
admin:1
```

### 5.7 推送镜像到私有仓库

```bash
root@docker01:~# docker push harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
The push refers to repository [harbor.dawn.com/dawn-games/dawn-games]
c051b9573618: Pushed
d71c57700c5d: Pushed
1912927f1150: Pushed
74cacacc6bfe: Pushed
78561cef0761: Pushed
motuo-v0.1: digest: sha256:96e5e4e6d2745d53695d5afe62f39ccdbaa1b546ca24824cda36d6e9a2e583a9 size: 1778
```

### 5.8 查看 WebUI

http://harbor.dawn.com/harbor/projects/2/repositories/dawn-games

![image-20261029150418021](/images/docker-harbor-private-registry/image-20261029150418021.png)

此时在 `dawn-games` 项目下能看到仓库 `dawn-games/dawn-games`，内含 `motuo-v0.1` 镜像。

### 5.9 退出登录

```bash
root@docker01:~# docker logout harbor.dawn.com
Removing login credentials for harbor.dawn.com

root@docker01:~# more /root/.docker/config.json
{
    "auths": {}
}
```

---

## 第六部分：harbor实现镜像的下载

### 6.1 配置 hosts 解析

```bash
root@docker02:/dawn/softwares/harbor# echo "11.0.1.122 harbor.dawn.com" >> /etc/hosts
```

### 6.2 配置 docker 不安全的存储库

```bash
root@docker02:/dawn/softwares/harbor# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
root@docker02:/dawn/softwares/harbor# systemctl restart docker
```

### 6.3 拉取镜像

（本项目 `dawn-games` 已设为 public，无需登录即可拉取）

```bash
root@docker02:/dawn/softwares/harbor# docker pull harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
motuo-v0.1: Pulling from dawn-games/dawn-games
c6a83fedfae6: Pull complete
9f5c3ad3fbc9: Pull complete
c44cfb6f2bc3: Pull complete
ac2ad8f66d49: Pull complete
0a45d138de7a: Pull complete
bdbb7eaafb83: Pull complete
0095e166c007: Pull complete
Digest: sha256:96e5e4e6d2745d53695d5afe62f39ccdbaa1b546ca24824cda36d6e9a2e583a9
Status: Downloaded newer image for harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1

root@docker02:/dawn/softwares/harbor# docker images | grep 'dawn-games/dawn-games'
harbor.dawn.com/dawn-games/dawn-games   motuo-v0.1   fc30411c280a   17 hours ago   17.8MB
```

---

## 第七部分：harbor实现镜像的删除

![image-20261029150928929](/images/docker-harbor-private-registry/image-20261029150928929.png)

镜像的删除在 Harbor 的 WebUI 中操作即可（可视化、简单直观），这是 Harbor 相比 registry 的一大优势——不再需要手动删元数据 + 执行 GC 两步操作。

---

## 第八部分：registry vs harbor对比

| 对比项   | docker registry           | VMware Harbor              |
| -------- | ------------------------- | -------------------------- |
| 体积     | 约20MB，轻量              | 720MB 安装包，重           |
| 部署     | 单容器 `docker run`       | 10 个容器 + docker-compose |
| WebUI    | 无（只有 JSON API）       | 完整可视化 WebUI           |
| 项目管理 | 无                        | 支持项目、用户、角色、配额 |
| 镜像删除 | 手动删元数据 + GC（两步） | WebUI 一键删除             |
| 适用场景 | 简单内网临时使用          | 企业级生产环境             |
