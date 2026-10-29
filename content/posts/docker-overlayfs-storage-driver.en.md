---
title: "Docker in Practice: OverlayFS Union Mounts and the Storage Driver Explained"
date: 2026-10-26T21:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "How the Docker OverlayFS storage driver works: the lower/upper/work directories and the LowerDir/Upperdir/MergedDir layers (including the init layer), and copy-on-write into the read-write layer; then a manual mount -t overlay demo of layering and read-only behavior, and finally docker run to confirm that a container is backed by overlay2."
---

# Docker in Practice: OverlayFS Union Mounts and the Storage Driver Explained

## 1. OverlayFS Overview

OverlayFS is a stacked filesystem. It relies on and is built on top of other filesystems (for example ext4fs and xfs); it does not take part in dividing the disk space structure, it merely "merges together" the files or directories of the existing filesystem, and finally shows the user the "merged" files as if they were in the same level of directory. This is union mount technology. Compared with AUFS (the storage technology used in early versions <1.12), OverlayFS is faster and simpler to implement.

The Linux kernel provides two OverlayFS drivers for Docker: Overlay and Overlay2. Overlay2 is an improvement over Overlay and is more efficient in terms of Inode utilization.

But Overlay has environment requirements:

(1) Docker version 17.06.02+;

(2) The host filesystem must be EXT4 or XFS.

How OverlayFS is implemented:

OverlayFS is implemented through three directories: the lower directory, the upper directory and the work directory.

lower:

It generally corresponds to read-only data.

upper:

A directory that supports read and write operations.

work:

This directory is the working base directory; after mounting, a work subdirectory is created automatically (in actual testing, that directory is not removed after a manual unmount)

This directory is mainly a working directory that stores temporary results or intermediate data.

Its contents are invisible to the user during use; the unified view finally presented to the user once the union mount completes is called the merged directory.

The OverlayFS structure is divided into three layers: LowerDir, Upperdir, MergedDir

### LowerDir (read-only)

A read-only image layer, which in fact is the rootfs.

When building an image with a Dockerfile, the image layer can be split into many layers, so there will be many corresponding lowerdir entries (from the source image).

Lower consists of two layers:

(1) The system init

```bash
1. After a container starts, the lower layer cannot be modified by default, but users sometimes need to change the hostname and domain name resolution, so files from the init layer are added (hostname, resolv.conf, hosts, mtab and so on) to solve this kind of problem;
2. The modifications only take effect for the current container, and when docker commit turns it into an image, the init layer is not committed;
3. The directory where init files are stored is /var/lib/docker/overlay2/<init_id>/diff
```

(2) The container image layer

Data that cannot be modified.

### Upperdir (read-write)

upperdir is a layer above lowerdir, and it is the read-write layer. It is created when the container starts, and every modification to the container happens in this layer - for example log files written when the container starts, or temporary files written by an application.

### MergedDir (presentation)

The merged directory is the container mount point; every file visible from the user perspective is presented from this layer.

## 2. OverlayFS Walkthrough

### 2.1 Create the working directories

```bash
root@docker02:~# mkdir -pv /dawn/lower{0..2} /dawn/{uppper,work,merged}
mkdir: created directory '/dawn/lower0'
mkdir: created directory '/dawn/lower1'
mkdir: created directory '/dawn/lower2'
mkdir: created directory '/dawn/uppper'
mkdir: created directory '/dawn/work'
mkdir: created directory '/dawn/merged'
```

### 2.2 Mount the filesystem

```bash
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,upperdir=/dawn/uppper,workdir=/dawn/work  /dawn/merged/
```

### 2.3 Check the mount information

```bash
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
```

### 2.4 Write initial data into the lower layer

```bash
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:48 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/lower1:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/lower2:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/merged:
total 8
drwxr-xr-x 1 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
root@docker02:~# cp /etc/hosts /dawn/lower0/
root@docker02:~# cp /etc/issue /dawn/lower1/
root@docker02:~# cp /etc/resolv.conf /dawn/lower2/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:48 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 20
drwxr-xr-x 1 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.5 Write initial data into the upper layer

```bash
root@docker02:~# cp /etc/hostname /dawn/uppper/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:49 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 24
drwxr-xr-x 1 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.6 Write data into the merged directory and observe that it actually lands in the upper layer

```bash
root@docker02:~# cp /etc/fstab /dawn/merged/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:49 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 28
drwxr-xr-x 1 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  657 Oct 26 12:49 fstab
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 16
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  657 Oct 26 12:49 fstab
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.7 Remount, but without mounting the upperdir layer

```bash
root@docker02:~# umount /dawn/merged
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,workdir=/dawn/work  /dawn/merged/
```

### 2.8 Writing data fails again because there is no write layer

```bash
root@docker02:~# cp /etc/os-release /dawn/merged/
cp: cannot create regular file '/dawn/merged/os-release': Read-only file system
```

## 3. Docker Uses OverlayFS Under the Hood

```bash
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
root@docker02:~# docker run -d --name c1 uhub.service.ucloud.cn/dawn/apps:v1
d751a64952e703e04b3ca48bb4e4a757d9cf561ae2fb7883956e9c097c793569
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
overlay          48G   12G   34G  26% /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged
root@docker02:~# docker inspect -f "{{.GraphDriver.Data.MergedDir}}" c1
/var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged
root@docker02:~# docker inspect -f "{{.GraphDriver.Data.UpperDir}}" c1
/var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/diff
root@docker02:~# docker exec c1 touch /haha.log  # Complete the write operation
root@docker02:~# ls /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/diff  # Obviously, the data was written to the read-write layer
etc  haha.log  run  var
root@docker02:~# ls /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged/
bin  docker-entrypoint.d   etc       home  media  opt   root  sbin  sys  usr
dev  docker-entrypoint.sh  haha.log  lib   mnt    proc  run   srv   tmp  var
root@docker02:~# chroot /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged /bin/sh
/ # ls /
bin                   haha.log              opt                   srv
dev                   home                  proc                  sys
docker-entrypoint.d   lib                   root                  tmp
docker-entrypoint.sh  media                 run                   usr
etc                   mnt                   sbin                  var
/ #
```
