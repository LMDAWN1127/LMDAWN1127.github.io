---
title: "Docker in Practice: Inspecting Container PID, ID and Network Info with inspect"
date: 2026-10-26T13:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Use docker container inspect -f with Go templates to pull a container's PID, ID, IP address, gateway and MAC address."
---

# Docker in Practice: Inspecting Container PID, ID and Network Information with inspect

## 1. Inspecting the container's process ID (PID)

```bash
root@docker02:~# docker container inspect -f "{{ .State.Pid }}" c1
4800
```

## 2. Inspecting the container ID

```bash
root@docker02:~# docker container inspect -f "{{ .Id }}" c1
ece223aa9840347b908016a8b665f68ac87185aceea0a8ab3ccd508de90c12b5
```

## 3. Inspecting IP address information

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

## 4. Inspecting the IP address of the most recently created container

```bash
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" `docker container ps -lq`
172.17.0.5
```
