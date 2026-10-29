---
title: "Migrating Images from docker registry to Harbor and Syncing Between Two Harbors"
date: 2026-10-29T20:04:45+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "This hands-on walkthrough migrates images from a docker registry into a Harbor registry and syncs images between two Harbor instances. Part 1 uses Harbor's pull replication rule to sync the `dawn-games/**` images from the registry into a local Harbor project. Part 2 deploys Harbor on both the docker01 and docker02 nodes, then configures a Harbor-to-Harbor pull-mode replication rule to achieve two-Harbor image sync, finally modifying the client daemon.json and verifying."
---

# Migrating Images from docker registry to Harbor and Syncing Between Two Harbors

## 1. Migrating Images from docker registry to the Harbor Registry

### 1. Preparing Test Images in docker registry

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

### 2. Accessing the WebUI for Testing and Verification

Open `http://11.0.1.121:5000/v2/_catalog` in a browser; the response is:

```json
{"repositories":["dawn-db/mysql","dawn-games/doudizhu","dawn-games/motuo"]}
```

![image-20261029183043727](/images/docker-registry-to-harbor-migration/image-20261029183043727.png)

### 3. Creating the Target

![image-20261029190918435](/images/docker-registry-to-harbor-migration/image-20261029190918435.png)

### 4. Creating the Replication Rule

Create a pull-mode replication rule that syncs `dawn-games/**` from the registry to the local `dawn-games` project

![image-20261029191121516](/images/docker-registry-to-harbor-migration/image-20261029191121516.png)

### 5. Manually Triggering and Verifying a Successful Pull

![image-20261029191158194](/images/docker-registry-to-harbor-migration/image-20261029191158194.png)

After synchronization, the images under the dawn-games project are set to a private project and require login before they can be pulled.

### 6. Setting the Image Repository to Public

![image-20261029192604436](/images/docker-registry-to-harbor-migration/image-20261029192604436.png)

---

## 2. Harbor Image Sync (Dual Harbor)

### 1. Creating a Harbor Registry on the docker01 Node

**1.1 Copy the package**

```bash
root@docker02:~# scp harbor-offline-installer-v2.7.4.tgz 11.0.1.121:~
```

**1.2 Extract the package**

```bash
root@docker01:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
```

**1.3 Generate the configuration file**

```bash
root@docker01:~# cd /dawn/softwares/harbor/
root@docker01:/dawn/softwares/harbor# cp harbor.yml{.tmpl,}
```

**1.4 Modify the Harbor configuration file**

```yaml
hostname: 11.0.1.121

#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: 1

data_volume: /dawn/data/harbor
```

**1.5 Install Harbor**

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

### 2. Creating a Harbor Registry on the docker02 Node

docker02 already has Harbor deployed (hostname `harbor.dawn.com`); we reuse it here.

### 3. Creating a Replication Rule on the docker02 Node (Harbor → Harbor, pull mode)

First, create a registry endpoint in the docker02 Harbor that points to the docker01 Harbor:

![image-20261029195149633](/images/docker-registry-to-harbor-migration/image-20261029195149633.png)

Then create a pull replication rule that syncs `dawn-linux/**` from docker01-harbor:

![image-20261029195222043](/images/docker-registry-to-harbor-migration/image-20261029195222043.png)

### 4. Modifying the Client Configuration File

```bash
root@docker02:~# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com", "11.0.1.121"]
}
root@docker02:~# systemctl restart docker
```

The docker02 host also has Harbor deployed; restarting docker will also kill the local Harbor containers, so you must run `cd /dawn/softwares/harbor && docker-compose up -d` to recover them.

### 5. Manually Triggering Replication

![image-20261029195251514](/images/docker-registry-to-harbor-migration/image-20261029195251514.png)