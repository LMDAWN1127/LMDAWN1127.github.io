---
title: "Docker 실전: 이미지 마이그레이션 - 오프라인 save/load 전송과 태그 지정"
date: 2026-10-23T15:24:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker save 로 이미지를 내보내고 SSH 로 오프라인 전송한 뒤 md5sum 으로 무결성을 검증하고, docker load 로 가져와 다시 태그를 지정합니다. save/load 가 IMAGE ID 를 유지함을 보이고, 여러 이미지 한 번에 내보내기, 두 가지 가져오기 형식, 이미지 일괄 삭제 방법을 다룹니다."
---

# Docker 실전: 이미지 마이그레이션 - 오프라인 save/load 전송과 태그 지정

## 이미지 로컬 마이그레이션 및 태그 지정

1. 이미지 내보내기 (docker02)

```bash
# docker save 두 가지 형식은 동등함: -o <파일> 과 > 리다이렉션
root@docker02:~# docker save -o /tmp/nginx-1304.tar uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker02:~# ls -lh /tmp/nginx-1304.tar
-rw------- 1 root root 158M Oct 23 06:20 nginx-1304.tar
root@docker02:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

2. 로컬 마이그레이션 (docker02 -> docker01)

먼저 SSH 키 기반 상호 신뢰를 설정한다

```bash
root@docker02:~# ssh-keygen
root@docker02:~# ssh-copy-id 11.0.1.121
```

docker02에서 scp로 전송

```bash
root@docker02:~# scp /tmp/nginx-1304.tar 11.0.1.121:/tmp/
```

docker01에서 무결성 검증 (소스 md5와 일치)

```bash
root@docker01:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

3. 이미지 가져오기 (docker01)

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
Loaded image: uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker01:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
```

IMAGE ID `886dbea595a1` 은 docker02의 소스 이미지와 정확히 일치합니다 - save/load 마이그레이션은 이미지 자체를 변경하지 않습니다

4. 태그 지정

```bash
root@docker01:~# docker tag uhub.service.ucloud.cn/dawn/nginx:1.30.4 dawn/nginx:v1.30.4
root@docker01:~# docker images dawn/nginx
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
dawn/nginx   v1.30.4   886dbea595a1   2 months ago   161MB
```

5. 동작 테스트

```bash
root@docker01:~# docker run -d -p 85:80 --name web-test dawn/nginx:v1.30.4
461a06c0feb9cfbd23e5f49148a49de247d2aeb9ab3986a1c2d662ce412d084d
root@docker01:~# docker ps
NAMES      IMAGE                STATUS         PORTS
web-test   dawn/nginx:v1.30.4   Up 2 seconds   0.0.0.0:85->80/tcp, :::85->80/tcp
root@docker01:~# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:85/
HTTP 200
```



6. 여러 이미지를 한 번에 내보내기

```bash
root@docker02:~# docker save $(docker images --format '{{.Repository}}:{{.Tag}}') > all-images.tar
```

7. 이미지를 가져오는 두 가지 방법

  방법 1:

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
```

  방법 2:

```bash
root@docker01:~# docker image load < /tmp/nginx-1304.tar
```

방법 2에서 프롬프트가 적게 뜨는 이유는 이미 가져왔기 때문입니다. 같은 효과를 보려면 먼저 삭제한 뒤 가져오면 됩니다.

8. 이미지를 일괄 삭제하는 방법

  방법 1:

```bash
root@docker01:~# docker image rm `docker image ls -q`
```

  방법 2:

```bash
root@docker01:~# docker rmi `docker image ls -q`
```
