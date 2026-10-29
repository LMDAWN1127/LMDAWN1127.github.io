---
title: "从 docker registry 迁移镜像到 Harbor 与双 Harbor 同步实战"
date: 2026-10-29T20:04:45+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本文实战演示将 docker registry 中的镜像迁移到 Harbor 仓库，以及两个 Harbor 之间的镜像同步。第一部分通过 Harbor 的 pull 复制规则，把 registry 里的 `dawn-games/**` 镜像同步到本地 Harbor 项目；第二部分在 docker01、docker02 两个节点分别部署 Harbor，并配置 Harbor→Harbor 的 pull 模式复制规则，实现双 Harbor 镜像同步，最后修改客户端 daemon.json 并验证。"
---

# 从 docker registry 迁移镜像到 Harbor 与双 Harbor 同步实战

## 一、docker registry 迁移镜像到 harbor 仓库

### 1. docker registry 准备测试镜像

```bash
root@docker01:~# docker tag dawn-games:motuo-v0.1 11.0.1.121:5000/dawn-games/motuo:v0.1
root@docker01:~# docker push 11.0.1.121:5000/dawn-games/motuo:v0.1
The push refers to repository [11.0.1.121:5000/dawn-games/motuo]
v0.1: digest: sha256:7d82ead138ecd7aac243397261c10db595d4dfec4768c810747de3d92fed52d3 size: 1569

root@docker01:~# docker push 11.0.1.121:5000/dawn-games/doudizhu:v0.1
The push refers to repository [11.0.1.121:5000/dawn-games/doudizhu]
71fd8b81ea67: Mounted from dawn-games/motuo
v0.1: digest: sha256:adabbc8e7ea0bc5858223c414832e3fdd21bffb4a78ece88c6b67895b0eec9a0 size: 1571

root@docker01:~# docker push 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
The push refers to repository [11.0.1.121:5000/dawn-db/mysql]
...
8.4.1-oracle: digest: sha256:ed172c8a1e69201bdf4aa92521781f8c50ebc57a1ed1bbaff51de7232d81fb45 size: 2411
```

### 2. 访问 WebUI 测试验证

浏览器访问 `http://11.0.1.121:5000/v2/_catalog`，返回：

```json
{"repositories":["dawn-db/mysql","dawn-games/doudizhu","dawn-games/motuo"]}
```

![image-20261029183043727](/images/docker-registry-to-harbor-migration/image-20261029183043727.png)

### 3. 新建目标

![image-20261029190918435](/images/docker-registry-to-harbor-migration/image-20261029190918435.png)

### 4. 新建复制规则

创建 pull 模式复制规则，从 registry 同步 `dawn-games/**` 到本地 `dawn-games` 项目

![image-20261029191121516](/images/docker-registry-to-harbor-migration/image-20261029191121516.png)

### 5. 手动触发并验证拉取成功

![image-20261029191158194](/images/docker-registry-to-harbor-migration/image-20261029191158194.png)

同步完成后，dawn-games 项目下的镜像被设置为私有项目，需登录后才能拉取。

### 6. 将镜像仓库设置为公开

![image-20261029192604436](/images/docker-registry-to-harbor-migration/image-20261029192604436.png)

---

## 二、harbor 的镜像同步（双 harbor）

### 1. docker01 节点新建 harbor 仓库

**1.1 拷贝软件包**

```bash
root@docker02:~# scp harbor-offline-installer-v2.7.4.tgz 11.0.1.121:~
```

**1.2 解压软件包**

```bash
root@docker01:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
```

**1.3 生成配置文件**

```bash
root@docker01:~# cd /dawn/softwares/harbor/
root@docker01:/dawn/softwares/harbor# cp harbor.yml{.tmpl,}
```

**1.4 修改 harbor 配置文件**

```yaml
hostname: 11.0.1.121

#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: 1

data_volume: /dawn/data/harbor
```

**1.5 安装 harbor**

```bash
root@docker01:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
✔ ----Harbor has been installed and started successfully.----

root@docker01:/dawn/softwares/harbor# docker ps --format '{{.Names}} {{.Status}}'
nginx Up (healthy)
harbor-core Up (healthy)
harbor-db Up (healthy)
redis Up (healthy)
harbor-portal Up (healthy)
registry Up (healthy)
registryctl Up (healthy)
chartmuseum Up (healthy)
harbor-jobservice Up (healthy)
harbor-log Up (healthy)
```

### 2. 在 docker02 节点新建 harbor 仓库

docker02 已经部署 harbor（hostname `harbor.dawn.com`），此处复用。

### 3. 在 docker02 节点新建复制规则（harbor → harbor，pull 模式）

先在 docker02 harbor 创建指向 docker01 harbor 的 registry endpoint：

![image-20261029195149633](/images/docker-registry-to-harbor-migration/image-20261029195149633.png)

再创建 pull 复制规则，从 docker01-harbor 同步 `dawn-linux/**`：

![image-20261029195222043](/images/docker-registry-to-harbor-migration/image-20261029195222043.png)

### 4. 修改客户端配置文件

```bash
root@docker02:~# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com", "11.0.1.121"]
}
root@docker02:~# systemctl restart docker
```

docker02 本机也部署了 harbor，重启 docker 会连带杀掉本机 harbor 容器，需 `cd /dawn/softwares/harbor && docker-compose up -d` 恢复。

### 5. 手动触发复制

![image-20261029195251514](/images/docker-registry-to-harbor-migration/image-20261029195251514.png)