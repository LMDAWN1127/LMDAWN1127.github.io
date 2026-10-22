---
title: "ZooKeeper 图形化管理实战：zkWeb 部署与基本使用"
date: 2026-10-22T13:15:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ZooKeeper"]
showToc: true
summary: "借助 zkWeb 图形化工具管理 ZooKeeper 集群：JDK 8 准备、jar 方式启动、连接集群配置，以及节点写入/增删、连接与集群状态查看。"
---

## 以图形化的方式管理zk集群

### 1. 解压jdk软件包

```bash
root@elk01:~# tar xf jdk-8u291-linux-x64.tar.gz -C /dawn/softwares/
```

### 2. 验证JDK版本

```bash
root@elk01:~# /dawn/softwares/jdk1.8.0_291/bin/java -version
java version "1.8.0_291"
Java(TM) SE Runtime Environment (build 1.8.0_291-b10)
Java HotSpot(TM) 64-Bit Server VM (build 25.291-b10, mixed mode)
```

### 3. 运行jar包

```bash
root@elk01:~# /dawn/softwares/jdk1.8.0_291/bin/java -jar zkWeb-v1.2.1.jar 
```

### 4. 访问zkWeb UI界面

http://11.0.1.111:8099/#

![image-20261022122648796](/images/zookeeper-gui-management-image-20261022122648796.png)

### 5.添加配置信息

![image-20261022123252051](/images/zookeeper-gui-management-image-20261022123252051.png)

### 6.基本管理和使用

![image-20261022123346981](/images/zookeeper-gui-management-image-20261022123346981.png)

写入数据

![image-20261022123540541](/images/zookeeper-gui-management-image-20261022123540541.png)

添加和删除节点

![image-20261022123744853](/images/zookeeper-gui-management-image-20261022123744853.png)

查看连接状态和ZK状态

![image-20261022123932594](/images/zookeeper-gui-management-image-20261022123932594.png)