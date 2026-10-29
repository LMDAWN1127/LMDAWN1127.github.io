---
title: "Docker 실전: 컨테이너 데이터 영속화 - bind 마운트와 볼륨(Volume)"
date: 2026-10-26T15:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "-v 로 호스트 경로를 컨테이너에 마운트하고 여러 컨테이너가 같은 마운트 지점을 공유하며 하나의 컨테이너에 여러 마운트 지점을 붙이고 rw/ro 권한을 지정합니다. 그리고 docker volume 생성·조회·삭제, 익명 볼륨, 실행 중 컨테이너 재마운트까지 다룹니다."
---

# Docker 실전: 컨테이너 데이터 영속화 - bind 마운트와 볼륨(Volume)

## 호스트 경로를 컨테이너의 지정 경로에 마운트

```bash
root@docker02:~# vim /dawn/index.html
root@docker02:~# docker run -d --name c1 -v /dawn:/usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1
9dc72299ea7f17af4855f062abaf7435616ef6c74bb5f0a6898e1d003a010f18
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" `docker container ps -lq`
172.17.0.2
root@docker02:~# curl 172.17.0.2
11111
root@docker02:~# echo 22222 > /dawn/index.html
root@docker02:~# curl 172.17.0.2
22222
```

1.컨테이너를 삭제해도 호스트의 마운트 디렉터리는 삭제되지 않습니다

2.컨테이너 마운트 지점에 기존 데이터가 있으면 호스트의 데이터 디렉터리가 그 데이터를 그대로 덮어씁니다

## 여러 컨테이너가 같은 호스트 마운트 지점을 마운트

1. 호스트 경로를 지정해 마운트

```bash
root@docker02:~# docker run -d --name c1 -v /dawn:/usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1
d7b219e242d5c7c798b4e3357244c85acf015e17f3b2d4b3d802d9b120e63e1a
root@docker02:~# docker run -d --name c2 -v /dawn:/usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1
880a27243b8c97c8977aff0de16b3e9bee88ebd6b7316f2208c2941cde0b40ce
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" c1
172.17.0.2
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" c2
172.17.0.3
root@docker02:~# curl 172.17.0.2
22222
root@docker02:~# curl 172.17.0.3
22222
root@docker02:~# cat /dawn/index.html
22222
```

2. --volumes-from 으로 지정 컨테이너와 동일한 마운트 정보 적용

```bash
root@docker02:~# docker run -d --name c1 -v /dawn:/usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1
29f119ce48616b932a4d9000de3299d0e8e7096e0747e768fb892ab074427b6d
root@docker02:~# docker run -d --name c2 --volumes-from c1 uhub.service.ucloud.cn/dawn/apps:v1
05185cfebcfbd86e08db1401ace5e75b362afc1127bcbc238f990d1706e6a8e7
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" c1
172.17.0.2
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" c2
172.17.0.3
root@docker02:~# curl 172.17.0.2
22222
root@docker02:~# curl 172.17.0.3
22222
```

## 하나의 컨테이너에 여러 마운트 지점 마운트

```bash
root@docker02:~# mkdir /dawn01
root@docker02:~# mkdir /dawn02
root@docker02:~# docker run -d --name c3 -v /dawn:/usr/share/nginx/html -v /dawn01:/dawn-xixi -v /dawn02:/dawn-haha uhub.service.ucloud.cn/dawn/apps:v1
353af2613c1448e7dfadfdba1041f72945d1934ecb0811a313a518bd3519c5c9
root@docker02:~# ll /dawn01/
total 8
drwxr-xr-x  2 root root 4096 Oct 26 06:49 ./
drwxr-xr-x 23 root root 4096 Oct 26 06:49 ../
root@docker02:~# ll /dawn02/
total 8
drwxr-xr-x  2 root root 4096 Oct 26 06:49 ./
drwxr-xr-x 23 root root 4096 Oct 26 06:49 ../
root@docker02:~# ll /dawn/
total 16
drwxr-xr-x  3 root root 4096 Oct 26 05:53 ./
drwxr-xr-x 23 root root 4096 Oct 26 06:49 ../
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
root@docker02:~# echo 55555 > /dawn01/1.txt
root@docker02:~# echo 66666 > /dawn02/2.txt
root@docker02:~# docker exec  c3 ls -l /dawn-xixi
total 4
-rw-r--r--    1 root     root             6 Oct 26 06:51 1.txt
root@docker02:~# docker exec  c3 ls -l /dawn-haha
total 4
-rw-r--r--    1 root     root             6 Oct 26 06:51 2.txt
root@docker02:~# docker run -d --name c4 --volumes-from c3 uhub.service.ucloud.cn/dawn/apps:v1
40fe02b04b339ef564ec8540c0549f401d1665d3800ac3e57db7c13cd12663c2
root@docker02:~# docker exec c4 cat /dawn-haha/2.txt
66666
root@docker02:~# docker exec c4 cat /dawn-xixi/1.txt
55555
root@docker02:~# docker exec c4 cat /usr/share/nginx/html/index.html
22222
```

## docker 가 이미 한동안 실행 중인데 데이터 영속화를 하지 않은 경우의 해결책

1. 실행 중에 생성된 데이터를 호스트로 복사
2. 호스트 경로를 지정해 컨테이너 재시작

## 컨테이너가 호스트를 마운트할 때 권한 지정

1. 읽기-쓰기 권한 지정

```bash
root@docker02:~# docker run -d --name c1 -v /dawn/:/usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1 5fed23d6bb02a8b0650acbafa0b9dd959339dffdcd34607acef36a78bc201437
root@docker02:~# docker run -d --name c2 -v /dawn/:/usr/share/nginx/html:rw uhub.service.ucloud.cn/dawn/apps:v1
762e90548a14cad027cd3f94c8deb84bc87c08adb9e7bdb8ebdf8e1a4bb45683
```

2. 읽기 전용 권한 지정

```bash
root@docker02:~# docker run -d --name c3 -v /dawn/:/usr/share/nginx/html:ro uhub.service.ucloud.cn/dawn/apps:v1
091d6907c24c455d8ce397a50c773b41b741a833b4e6d789fd5dfd2ca0ec2ba9
```

3. 검증

```bash
root@docker02:~# ll /dawn/
total 16
drwxr-xr-x  3 root root 4096 Oct 26 05:53 ./
drwxr-xr-x 23 root root 4096 Oct 26 06:49 ../
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
root@docker02:~# cp /etc/os-release /dawn/
root@docker02:~# ll /dawn/
total 20
drwxr-xr-x  3 root root 4096 Oct 26 06:56 ./
drwxr-xr-x 23 root root 4096 Oct 26 06:49 ../
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
root@docker02:~# docker exec c1 touch /usr/share/nginx/html/c1.log
root@docker02:~# docker exec c2 touch /usr/share/nginx/html/c2.log
root@docker02:~# docker exec c3 touch /usr/share/nginx/html/c3.log
touch: /usr/share/nginx/html/c3.log: Read-only file system
root@docker02:~# ll /dawn/
total 20
drwxr-xr-x  3 root root 4096 Oct 26 06:57 ./
drwxr-xr-x 23 root root 4096 Oct 26 06:49 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
```

## docker 볼륨 마운트

### 1.로컬 볼륨 조회

```bash
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     1aa6a1a69d5dc375862070af184e29335dc34ae5fb10fafc7d548daad4260168
local     2f1fd03cab99d05a839a492f5c95fb161aca85ea2454101cc218d6f1e42cedaa
local     03b7fcac7c3b4342ebfbc30f8cfd9872eb3e37d14b086c38b4508f914352af47
local     4f21314d00f81aa8e2602c5cf13f92199967c5cb08e422ad3bebb7909f4e1d14
local     5a14814efb8fd7eccea7986b150dd5893cc500114f5074e704127e592645be0c
local     5df54fdc8f541f414489d6648c576fdc6b51e92ea66cd1a12116d68abe7bb987
local     6acf0d816c484044214fed50a041e77f27111aaa4e80ea14252696b42abdca9c
local     6ccb99a68f4c888aebe79f2196266c713511bddaf0d3d21545fa1eac585f871d
local     7b72da3e0b562abb76482916a5bd8b09fd09400f95af4eac82c89bb62eee0362
local     97bfd6400f83d77fdfe4190f3f05e7d42f060b855b958bc6e1fd8909ef260792
local     129f941c623b5f129158a157141964141cfce2b4faaeab9ddca5161b0e35cf5b
local     177a235b8dae1e84b5ee0a09e1025414777d3d1ef6b84bb73c30b2a346362596
local     324a8640bac0220d9f80cd664e09e35613a6f20bd13633e4ce061f0193afdd4a
local     393d36a9d56b513d2cdf9abc7d0181ca11cd4e9ec9b388644f2505242dc892ee
local     810a7ec58ced6bb8f20c144db33736acf92c361542c86917a9ef114a49ad6768
local     6299a60b7ceed381722c4b9b3a6340a71bfd472d58bfb501113a6de68e957bd5
local     92600aaeca94744a65879c38ccd7874fc2df7cb0930ae84df1d7bc89872a6f0f
local     3596452d8c63f02d6e5211c7fcadab1f944ef4c05d02fb30cc8b5f3925feed6e
local     09604792dc9d2856dcc654a167b2e8c28a6ee88757dbd59e9989a8bcc9d32218
local     a3afb776eb9ceb23c7ca22405cdfacbfdc93af6eb5464e2a3013c3d5d5a54f54
local     a9810c165214877d03c65f76dbee272900bf028e25d50c46953e7e6961d7363d
local     b57176656b56d5dd2cffc5bcd122f5ad1fd2e2bc8289e5c0d5423ed443bf86ac
local     bd6618b999c35522c7d57aa85824cb42338341f25336102fbd8c0ee7cedf13c7
local     bec95ac5ae37e190139beedb24ca429036e024ddab4ae1d80657473c3a935e05
local     c055b89130852d33d8beafae9eb82828934de011d0ba3add27934ec2d3218437
local     c9198570b372abc7df7c00605fa01686107f6a800fbb6853a911fe875529d781
local     dd99c780efbf91f663784e200dc0b836d8b3fa3b99b0daccdd0653d114cfc5f0
local     e55dcd4d0479faab5edd4b501297cb9a768ef85bcdc62f37fd51858a53a9f5fd
local     e9739e1e24477f3f0802535ab8cef1ec770da778f779573e6eb1f38fd1105914
local     f5171a0edd2a77d796244fe807e40ecc0b7aa5c2f28958dbed961495d96e2191
root@docker02:~# docker volume prune -f
Deleted Volumes:
129f941c623b5f129158a157141964141cfce2b4faaeab9ddca5161b0e35cf5b
810a7ec58ced6bb8f20c144db33736acf92c361542c86917a9ef114a49ad6768
a3afb776eb9ceb23c7ca22405cdfacbfdc93af6eb5464e2a3013c3d5d5a54f54
c9198570b372abc7df7c00605fa01686107f6a800fbb6853a911fe875529d781
177a235b8dae1e84b5ee0a09e1025414777d3d1ef6b84bb73c30b2a346362596
5a14814efb8fd7eccea7986b150dd5893cc500114f5074e704127e592645be0c
e9739e1e24477f3f0802535ab8cef1ec770da778f779573e6eb1f38fd1105914
2f1fd03cab99d05a839a492f5c95fb161aca85ea2454101cc218d6f1e42cedaa
4f21314d00f81aa8e2602c5cf13f92199967c5cb08e422ad3bebb7909f4e1d14
7b72da3e0b562abb76482916a5bd8b09fd09400f95af4eac82c89bb62eee0362
a9810c165214877d03c65f76dbee272900bf028e25d50c46953e7e6961d7363d
b57176656b56d5dd2cffc5bcd122f5ad1fd2e2bc8289e5c0d5423ed443bf86ac
3596452d8c63f02d6e5211c7fcadab1f944ef4c05d02fb30cc8b5f3925feed6e
5df54fdc8f541f414489d6648c576fdc6b51e92ea66cd1a12116d68abe7bb987
dd99c780efbf91f663784e200dc0b836d8b3fa3b99b0daccdd0653d114cfc5f0
f5171a0edd2a77d796244fe807e40ecc0b7aa5c2f28958dbed961495d96e2191
09604792dc9d2856dcc654a167b2e8c28a6ee88757dbd59e9989a8bcc9d32218
1aa6a1a69d5dc375862070af184e29335dc34ae5fb10fafc7d548daad4260168
6299a60b7ceed381722c4b9b3a6340a71bfd472d58bfb501113a6de68e957bd5
97bfd6400f83d77fdfe4190f3f05e7d42f060b855b958bc6e1fd8909ef260792
bec95ac5ae37e190139beedb24ca429036e024ddab4ae1d80657473c3a935e05
c055b89130852d33d8beafae9eb82828934de011d0ba3add27934ec2d3218437
6acf0d816c484044214fed50a041e77f27111aaa4e80ea14252696b42abdca9c
bd6618b999c35522c7d57aa85824cb42338341f25336102fbd8c0ee7cedf13c7
e55dcd4d0479faab5edd4b501297cb9a768ef85bcdc62f37fd51858a53a9f5fd
03b7fcac7c3b4342ebfbc30f8cfd9872eb3e37d14b086c38b4508f914352af47
393d36a9d56b513d2cdf9abc7d0181ca11cd4e9ec9b388644f2505242dc892ee
6ccb99a68f4c888aebe79f2196266c713511bddaf0d3d21545fa1eac585f871d
92600aaeca94744a65879c38ccd7874fc2df7cb0930ae84df1d7bc89872a6f0f
324a8640bac0220d9f80cd664e09e35613a6f20bd13633e4ce061f0193afdd4a

Total reclaimed space: 6.157GB
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
```

### 2.볼륨 생성

#### 2.1 익명 볼륨 생성 (랜덤 볼륨)

```bash
root@docker02:~# docker volume create
3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24
```

#### 2.2 사용자 지정 이름의 볼륨 생성

```bash
root@docker02:~# docker volume create dawn
dawn
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24
local     dawn
```

#### 2.3 하위 저장 디렉터리 확인

```bash
root@docker02:~# ll /var/lib/docker/volumes/
total 64
drwx-----x  4 root root   4096 Oct 26 07:04 ./
drwx--x--- 13 root root   4096 Oct 26 05:53 ../
drwx-----x  3 root root   4096 Oct 26 07:04 3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24/
brw-------  1 root root 253, 0 Oct 26 05:53 backingFsBlockDev
drwx-----x  3 root root   4096 Oct 26 07:04 dawn/
-rw-------  1 root root  65536 Oct 26 07:04 metadata.db
```

### 3.볼륨 상세 정보 조회

```bash
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24
local     dawn
root@docker02:~# docker volume inspect 3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24
[
    {
        "CreatedAt": "2026-10-26T07:04:36Z",
        "Driver": "local",
        "Labels": {
            "com.docker.volume.anonymous": ""
        },
        "Mountpoint": "/var/lib/docker/volumes/3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24/_data",
        "Name": "3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24",
        "Options": null,
        "Scope": "local"
    }
]
root@docker02:~# docker volume inspect dawn
[
    {
        "CreatedAt": "2026-10-26T07:04:55Z",
        "Driver": "local",
        "Labels": null,
        "Mountpoint": "/var/lib/docker/volumes/dawn/_data",
        "Name": "dawn",
        "Options": null,
        "Scope": "local"
    }
]
```

### 4.볼륨 삭제

#### 4.1 지정한 볼륨 삭제

```bash
root@docker02:~# docker volume rm  3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24
3b6c448ba84a63ff4a2ed251ce3004c45b5473039e57a2736aebfcfb8a716c24
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     dawn

# 컨테이너 삭제 시 익명 볼륨도 함께 삭제하려면 -v 옵션을 사용합니다
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     7a09accfed6a12409f6c41200b997fec38447a01fc78537c8d87e0944dfd5be4
local     dawn
root@docker02:~# docker container rm -fv `docker container ps -qa`
995f1d1e5523
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     dawn
```

#### 4.2 사용하지 않는 모든 볼륨 삭제

```bash
root@docker02:~# docker volume prune -a
WARNING! This will remove all local volumes not used by at least one container.
Are you sure you want to continue? [y/N] y
Deleted Volumes:
dawn

Total reclaimed space: 0B
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
root@docker02:~# ll /var/lib/docker/volumes/
total 56
drwx-----x  2 root root   4096 Oct 26 07:18 ./
drwx--x--- 13 root root   4096 Oct 26 05:53 ../
brw-------  1 root root 253, 0 Oct 26 05:53 backingFsBlockDev
-rw-------  1 root root  65536 Oct 26 07:18 metadata.db
```

### 5.컨테이너를 실행해 기존 볼륨 마운트

#### 5.1 사전에 볼륨 생성

```bash
root@docker02:~# docker volume create dawn
dawn
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     dawn
root@docker02:~# docker volume inspect dawn
[
    {
        "CreatedAt": "2026-10-26T07:21:15Z",
        "Driver": "local",
        "Labels": null,
        "Mountpoint": "/var/lib/docker/volumes/dawn/_data",
        "Name": "dawn",
        "Options": null,
        "Scope": "local"
    }
]
root@docker02:~# echo www.dawncloud.top > /var/lib/docker/volumes/dawn/_data/index.html
root@docker02:~# ll /var/lib/docker/volumes/dawn/_data/
total 12
drwxr-xr-x 2 root root 4096 Oct 26 07:22 ./
drwx-----x 3 root root 4096 Oct 26 07:21 ../
-rw-r--r-- 1 root root   18 Oct 26 07:22 index.html
```

#### 5.2 컨테이너를 실행해 기존 볼륨 사용

```bash
root@docker02:~# docker run -d --name c1 -v dawn:/usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1
584aa8abd987405397b9277a8a843dce81159fa8e824bde35b86b0b4bb0e8388
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" c1
172.17.0.2
root@docker02:~# curl 172.17.0.2
www.dawncloud.top
```

### 6.컨테이너를 실행해 존재하지 않는 볼륨 마운트

```bash
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
root@docker02:~# docker run -d --name c2 -v dawn:/usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1
9285f3acca3ec0b7f0ac8753dd04b0f7cfae16b6a8407714db62e08ece6d163e
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     dawn
```

### 7.볼륨을 지정하지 않으면 익명 볼륨이 랜덤하게 생성됨

```bash
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
root@docker02:~# docker run -d --name c1 -v /usr/share/nginx/html uhub.service.ucloud.cn/dawn/apps:v1
d03cea0f4da53f4b7bc03ba3876170090ee3a2dae3343faa7cbd46314381fcd0
root@docker02:~# docker volume ls
DRIVER    VOLUME NAME
local     ac965873f9ca872aa25138ecc3c6459f61ffce050fe153c6a53d2804229d7a5c
```

### 8.컨테이너 마운트 지점 조회

```bash
root@docker02:~# docker container inspect -f "{{range .Mounts }}컨테이너 마운트 경로: {{.Destination}} 호스트 경로: {{.Source}}{{end}}" c1
```

  컨테이너 마운트 경로: /usr/share/nginx/html 

  호스트 경로: /var/lib/docker/volumes/ac965873f9ca872aa25138ecc3c6459f61ffce050fe153c6a53d2804229d7a5c/_data



1.볼륨이 컨테이너에 사용되고 있다면 컨테이너가 중지된 상태라도 "docker volume prune -f" 로는 데이터를 지울 수 없으므로 이 명령은 사용되지 않는 볼륨만 삭제할 수 있습니다;

2.컨테이너 시작 시 볼륨이 없으면 자동으로 생성됩니다;

3.볼륨을 지정하지 않으면 익명 볼륨이 랜덤하게 생성됩니다;

4.볼륨이 없고 컨테이너의 기존 마운트 지점에 데이터가 있으면 이전 데이터가 볼륨으로 복사됩니다;

5.볼륨이 있으면 컨테이너 마운트 지점에 기존 데이터가 있어도 그대로 덮어씁니다;

6.실행 중인 컨테이너의 마운트 정보를 확인하려면 "docker container inspect" 로 더 자세히 확인할 수 있습니다.
