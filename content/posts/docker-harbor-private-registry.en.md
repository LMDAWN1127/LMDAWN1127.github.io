---
title: "Hands-on with Private Image Registries: docker registry and VMware Harbor"
date: 2026-10-29T15:09:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Build two private image registries from scratch: first use the lightweight docker registry to complete image deployment, push, pull, and delete (including manually deleting metadata + GC to reclaim storage); then deploy the enterprise-grade VMware Harbor (HTTP mode), demonstrating hosts resolution, insecure-registries configuration, creating a project, three docker login methods, and the full image push/pull/delete flow; finally summarize the differences between registry and Harbor in size, deployment, WebUI, project management, deletion, and use cases with a comparison table."
---

# Hands-on with Private Image Registries: docker registry and VMware Harbor

**Objective**: Master the full workflow of deploying, pushing, pulling, and deleting images for both the lightweight docker registry and the enterprise-grade VMware Harbor private registries.

---

## 1. Advantages of a Private Image Registry

1. Fast image pulling;
2. Easy for users to fetch images;
3. Secure, for internal use.

## 2. Private Registry Solutions

| Solution                          | Description                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| **Official Registry**                  | Docker Hub; blocked in mainland China, requires a proxy                               |
| **docker registry** (not recommended) | Docker's official open-source image registry; about 20MB when started, very lightweight, but more complex to use and harder to manage |
| **VMware Harbor** (recommended for enterprise) | Developed on top of docker registry; the harbor repository is open-sourced            |
| **Third-party Registry**                | Alibaba Cloud, Huawei Cloud, various cloud platforms, etc.                                 |

---

## Part 1: Building the docker registry Environment and Pushing Images

### 1.1 Deploy docker registry

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

### 1.2 Access the WebUI

```
http://11.0.1.121:5000/v2/_catalog
```

Initial response (no images yet):

```json
{"repositories":[]}
```

### 1.3 Configure the Client's Insecure Registry

By default docker uses the https protocol, while a private registry uses http; to make docker trust the http protocol you need to configure `insecure-registries`.

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

### 1.4 Tag the Image

```bash
root@docker02:~# docker tag mysql:8.4.1-oracle 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
root@docker02:~# docker images | grep dawn-db
11.0.1.121:5000/dawn-db/mysql    8.4.1-oracle   da8f2a99cf39   2 years ago   583MB
```

### 1.5 Push the Image to the Private Registry

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

### 1.6 Check the WebUI Again

```
http://11.0.1.121:5000/v2/_catalog
```

At this point you can see:

```json
{"repositories":["dawn-db/mysql"]}
```

This indicates the image upload succeeded.

---

## Part 2: Pulling Images from docker registry

### 2.1 Configure the Private Registry Address

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

### 2.2 Pull the Image

```bash
root@docker01:~/haha# docker pull 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
8.4.1-oracle: Pulling from dawn-db/mysql
Digest: sha256:03a538f365c14f3ed9354f678707525a027f00720c134376a3c78cdcbf844344
Status: Downloaded newer image for 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle

root@docker01:~/haha# docker image ls 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
REPOSITORY                           TAG            IMAGE ID       CREATED        SIZE
11.0.1.121:5000/dawn-db/mysql        8.4.1-oracle   da8f2a99cf39   2 years ago    583MB
```

**Drawback of registry**: when pulling, unless the user knows the image name, they have no idea what the image is called or where it is, which is inconvenient. This is also why Harbor is introduced later.

---

## Part 3: Deleting Images from docker registry

### 3.1 Delete the Image Metadata

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

After deleting the metadata under `repositories/`, the `blobs` (the actual image data layers) are not deleted, and the space is still not reclaimed.

### 3.2 Clean Up Image Data to Reclaim Storage

```bash
/var/lib/registry/docker/registry/v2 # registry garbage-collect /etc/distribution/config.yml
0 blobs marked, 12 blobs and 0 manifests eligible for deletion
blob eligible for deletion: sha256:eafccfd1ea14e7a7cc14a17f7e177399149b675253070b5149a41068b6989f1e
INFO[0000] Deleting blob: /docker/registry/v2/blobs/sha256/ea/eafccfd1ea14...
/var/lib/registry/docker/registry/v2 # du -sh *
52.0K  blobs
4.0K   repositories
```

After running `garbage-collect`, `blobs` dropped from 161.8M to 52.0K, and the storage space was successfully reclaimed.

Deleting an image is troublesome: you must first manually delete the metadata, then run GC to reclaim data, a two-step operation, which is another example of registry being hard to manage.

---

## Part 4: Deploying Harbor over HTTP

### 4.1 Download Harbor

```bash
root@docker02:~# ls -lh harbor-offline-installer-v2.7.4.tgz
-rw-r--r-- 1 root root 721M Oct 29 05:59 harbor-offline-installer-v2.7.4.tgz
```

### 4.2 Extract the Package

```bash
root@docker02:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
root@docker02:~# ls /dawn/softwares/harbor/
common.sh  harbor.v2.7.4.tar.gz  harbor.yml.tmpl  install.sh  LICENSE  prepare
```

### 4.3 Prepare the Data Directory

```bash
root@docker02:~# mkdir -pv /dawn/data/harbor
mkdir: created directory '/dawn/data'
mkdir: created directory '/dawn/data/harbor'
```

### 4.4 Prepare the Configuration File

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# cp harbor.yml.tmpl harbor.yml
root@docker02:/dawn/softwares/harbor# vim harbor.yml
...
# Specify the Harbor server address
hostname: harbor.dawn.com

# Comment out the https feature
#https:
#  # https port for harbor, default is 443
#  port: 443
#  # The path of cert and key files for nginx
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

# Change the Harbor admin user password
harbor_admin_password: 1

# Specify the data storage directory
data_volume: /dawn/data/harbor
```

### 4.5 Start Installing Harbor

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

The install.sh process completes the following steps in order:

1. Check whether docker and docker-compose are installed;
2. Import the images Harbor needs (`docker load`);
3. Prepare docker-compose.yaml and the common directory (`prepare` script);
4. Start docker-compose.

### 4.6 Access the WebUI

http://11.0.1.122/harbor/projects

![image-20261029144827534](/images/docker-harbor-private-registry/image-20261029144827534.png)

After installation, verify:

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

Harbor consists of 10 containers: nginx (portal reverse proxy), harbor-core (core), harbor-db (PostgreSQL database), redis (cache), harbor-portal (frontend UI), registry (image registry), registryctl, chartmuseum, jobservice, and harbor-log (logs).

---

## Part 5: Pushing Images to Harbor

### 5.1 Add Local hosts File Resolution

```bash
root@docker01:~# echo 11.0.1.122 harbor.dawn.com >> /etc/hosts
root@docker01:~# grep harbor /etc/hosts
11.0.1.122 harbor.dawn.com
```

### 5.2 Add the Image's HTTP Mode

```bash
root@docker01:~# vim /etc/docker/daemon.json
{
  "registry-mirrors": [
      "https://docker.m.daocloud.io"
  ],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
```

### 5.3 Restart the Docker Service

```bash
root@docker01:~# systemctl restart docker
root@docker01:~# docker info | grep "Insecure Registries" -A 4
 Insecure Registries:
  11.0.1.121:5000
  harbor.dawn.com
  127.0.0.0/8
```

### 5.4 Create a New Project in the Harbor Registry

Create a new project `dawn-games` in the WebUI:

![image-20261029145115418](/images/docker-harbor-private-registry/image-20261029145115418.png)

### 5.5 Tag the Test Image

```bash
root@docker01:~# docker tag dawn-games:v2.16 harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
root@docker01:~# docker images | grep 'dawn-games/dawn-games'
harbor.dawn.com/dawn-games/dawn-games   motuo-v0.1   fc30411c280a   17 hours ago   17.8MB
```

### 5.6 Log In to the Harbor Registry

Three login methods:

```bash
# Method 1: Interactive login
root@docker01:~# docker login harbor.dawn.com
Username: admin
Password:
Login Succeeded

# Method 2: Login with -p (warns it is insecure)
root@docker01:~# docker login -u admin -p 1 harbor.dawn.com
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded

# Method 3: Secure login with --password-stdin (recommended)
root@docker01:~# echo 1 | docker login -u admin --password-stdin harbor.dawn.com
Login Succeeded
```

After login the password is stored locally; log out when finished:

```bash
root@docker01:~# more /root/.docker/config.json
{
    "auths": {
        "harbor.dawn.com": {
            "auth": "YWRtaW46MQ=="
        }
    }
}

# Decrypt to see the plaintext username and password
root@docker01:~# echo YWRtaW46MQ== | base64 -d | more
admin:1
```

### 5.7 Push the Image to the Private Registry

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

### 5.8 View the WebUI

http://harbor.dawn.com/harbor/projects/2/repositories/dawn-games

![image-20261029150418021](/images/docker-harbor-private-registry/image-20261029150418021.png)

At this point, under the `dawn-games` project you can see the repository `dawn-games/dawn-games`, which contains the `motuo-v0.1` image.

### 5.9 Log Out

```bash
root@docker01:~# docker logout harbor.dawn.com
Removing login credentials for harbor.dawn.com

root@docker01:~# more /root/.docker/config.json
{
    "auths": {}
}
```

---

## Part 6: Pulling Images from Harbor

### 6.1 Configure hosts Resolution

```bash
root@docker02:/dawn/softwares/harbor# echo "11.0.1.122 harbor.dawn.com" >> /etc/hosts
```

### 6.2 Configure Docker's Insecure Registry

```bash
root@docker02:/dawn/softwares/harbor# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
root@docker02:/dawn/softwares/harbor# systemctl restart docker
```

### 6.3 Pull the Image

(This project `dawn-games` is already set to public, so it can be pulled without logging in)

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

## Part 7: Deleting Images from Harbor

![image-20261029150928929](/images/docker-harbor-private-registry/image-20261029150928929.png)

Image deletion is done in Harbor's WebUI (visual and intuitive), which is a major advantage of Harbor over registry -- no longer needing the two-step manual metadata deletion + GC.

---

## Part 8: registry vs Harbor Comparison

| Comparison Item   | docker registry           | VMware Harbor              |
| -------- | ------------------------- | -------------------------- |
| Size     | About 20MB, lightweight              | 720MB installer, heavy           |
| Deployment     | Single container `docker run`       | 10 containers + docker-compose |
| WebUI    | None (only JSON API)       | Full visual WebUI           |
| Project Management | None                        | Supports projects, users, roles, quotas |
| Image Deletion | Manually delete metadata + GC (two steps) | WebUI one-click delete             |
| Use Case | Simple internal temporary use          | Enterprise production environment             |
