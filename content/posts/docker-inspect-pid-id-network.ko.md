---
title: "Docker 실전: inspect로 컨테이너 PID・ID・네트워크 정보 확인"
date: 2026-10-26T13:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker container inspect -f 와 Go 템플릿을 사용해 컨테이너의 PID・ID・IP 주소・게이트웨이・MAC 주소를 추출합니다."
---

# Docker 실전: inspect로 컨테이너 PID・ID・네트워크 정보 확인

## 1. 컨테이너 프로세스 ID(PID) 확인

```bash
root@docker02:~# docker container inspect -f "{{ .State.Pid }}" c1
4800
```

## 2. 컨테이너 ID 확인

```bash
root@docker02:~# docker container inspect -f "{{ .Id }}" c1
ece223aa9840347b908016a8b665f68ac87185aceea0a8ab3ccd508de90c12b5
```

## 3. IP 주소 정보 확인

```bash
root@docker02:~# docker container inspect -f "{{ .NetworkSettings.IPAddress }}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ .NetworkSettings.Networks.bridge.IPAddress }}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .IPAddress }}{{end}}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .Gateway }}{{end}}" c1
172.17.0.1
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .MacAddress }}{{end}}" c1
02:42:ac:11:00:05
```

## 4. 가장 최근에 생성된 컨테이너의 IP 주소 확인

```bash
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" `docker container ps -lq`
172.17.0.5
```
