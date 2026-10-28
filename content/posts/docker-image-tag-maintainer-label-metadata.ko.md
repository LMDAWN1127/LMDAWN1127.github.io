---
title: "Docker 실전: MAINTAINER와 LABEL로 이미지 태그 달기 및 메타데이터 조회"
date: 2026-10-28T19:40:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "실제 dawn-games 이미지를 예로 들어, Dockerfile에 비권장 MAINTAINER와 공식 권장 LABEL로 작성자/학교/이메일 메타데이터를 기록하고, docker image inspect -f로 .Author와 .Config.Labels를 읽어 확인한 뒤 --network host로 컨테이너를 시작해 호스트 네트워크로 접근합니다. 스크린샷 포함."
---

# Docker 실전: MAINTAINER와 LABEL로 이미지 태그 달기 및 메타데이터 조회

이미지에 태그를 다는 것은 배포 워크플로의 기본입니다. 실제 `dawn-games` 이미지를 예로 들어, 이 글은 (이제 사용이 권장되지 않는) `MAINTAINER` 명령과 더 표준적인 `LABEL` 명령으로 Dockerfile에 작성자, 학교, 이메일 등의 메타데이터를 기록합니다. 빌드 후 `docker image inspect -f '{{.Author}}'` / `'{{.Config.Labels.xxx}}'` 로 해당 필드를 다시 읽어 확인하고, `--network host`로 컨테이너를 바로 시작해 호스트 네트워크로 접근해 검증합니다. (접속 화면 스크린샷 포함)

## 이미지에 태그 달기

### 1. Dockerfile 작성

```dockerfile
FROM alpine:3.20.2

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/tanke

ADD code/dawn-tanke.tar.gz /usr/share/nginx/html/tanke

COPY config/games.conf /etc/nginx/http.d/default.conf

# 저작권, 작성자 정보, 이메일, 회사 홈페이지 등을 선언. 가독성이 떨어져 사용이 권장되지 않음.
MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

# 공식 권장 방식은 MAINTAINER 대신 LABEL 명령 사용
LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

CMD ["nginx","-g","daemon off;"]
```

### 2. nginx 설정 파일

```json
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tanke;
    server_name   game01.dawn.com;
}
```

### 3. 이미지 빌드

```bash
cd /dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS
docker image build -t dawn-games:v2.8 .
```

```bash
Sending build context to Docker daemon  1.622MB
Step 1/7 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 2/7 : RUN ... apk add nginx ... mkdir -pv /usr/share/nginx/html/tanke
 ---> 2a68b3185350
Step 3/7 : ADD code/dawn-tanke.tar.gz /usr/share/nginx/html/tanke
 ---> 9b1dba3f40f1
Step 4/7 : COPY config/games.conf /etc/nginx/http.d/default.conf
 ---> 58cf04d5506f
Step 5/7 : MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha
 ---> df0daa469d88
Step 6/7 : LABEL school=czu class=computer01 auther=dawn email=... office=...
 ---> 5dd0fd143c26
Step 7/7 : CMD ["nginx","-g","daemon off;"]
 ---> dbe04590110b
Successfully tagged dawn-games:v2.8
```

---

### 4. 이미지 메타데이터 조회

Author 확인(MAINTAINER가 기록)

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Author}}' dawn-games:v2.8
dawn 123456@dawn.com www.dawn.com xixi haha
```

Labels 특정 필드 확인

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Config.Labels.auther}}' dawn-games:v2.8
dawn
```

전체 Labels 확인(JSON 형식)

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-LABELS# docker image inspect -f '{{json .Config.Labels}}' dawn-games:v2.8
{"auther":"dawn","class":"computer01","email":"123456@dawn.com","office":"www.dawn.com","school":"czu"}
```

### 5. 컨테이너 시작 및 테스트

```bash
docker container run -d --name games --network host dawn-games:v2.8
```

`--network host`로 시작하면 컨테이너가 호스트의 80 포트를 바로 사용하며 포트 매핑이 필요 없습니다.

**브라우저 접속**:

```
# 로컬 hosts에 추가:
11.0.1.121  game01.dawn.com

# 브라우저:
http://game01.dawn.com/
```

![image-20261028194608894](/images/docker-image-tag-maintainer-label-metadata-image-20261028194608894.png)
