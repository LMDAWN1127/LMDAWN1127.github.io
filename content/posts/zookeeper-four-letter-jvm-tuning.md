---
title: "ZooKeeper 四字命令与 JVM 调优实战"
date: 2026-10-22T13:40:00+08:00
draft: false
categories: ["DevOps"]
tags: ["ZooKeeper"]
showToc: true
summary: "ZooKeeper 四字命令实战：srvr/ruok/conf 查看运行时状态与集群配置，以及 JVM 堆内存调优（ZK_SERVER_HEAP）全流程验证与生产容量建议。"
---

## zookeeper的四字监控

```bash
root@elk03:~# echo srvr | nc 11.0.1.113 2181
Zookeeper version: 3.8.4-9316c2a7a97e1666d8f4593f34dd6fc36ecc436c, built on 2024-02-12 22:16 UTC
Latency min/avg/max: 0/3.5191/342
Received: 265
Sent: 264
Connections: 1
Outstanding: 0
Zxid: 0x70000001b
Mode: leader
Node count: 10
Proposal sizes last/min/max: 48/36/101
root@elk03:~# echo ruok | nc 11.0.1.113 2181
imok
root@elk03:~# echo conf | nc 11.0.1.113 2181
clientPort=2181
secureClientPort=-1
dataDir=/dawn/data/zk/version-2
dataDirSize=134221314
dataLogDir=/dawn/data/zk/version-2
dataLogSize=134221314
tickTime=2000
maxClientCnxns=60
minSessionTimeout=4000
maxSessionTimeout=40000
clientPortListenBacklog=-1
serverId=3
initLimit=5
syncLimit=2
electionAlg=3
electionPort=6888
quorumPort=5888
peerType=0
membership:
server.1=11.0.1.111:5888:6888:participant
server.2=11.0.1.112:5888:6888:participant
server.3=11.0.1.113:5888:6888:participant
version=0
```

## zookeeper集群调优

### 1. 所有节点修改JVM的堆(heap)内存大小

```bash
root@elk01:~# grep ^ZK_SERVER_HEAP /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkEnv.sh
ZK_SERVER_HEAP="${ZK_SERVER_HEAP:-1000}"
root@elk01:~# sed -i '/^ZK_SERVER_HEAP/s#1000#128#' /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkEnv.sh
root@elk01:~# grep ^ZK_SERVER_HEAP /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkEnv.sh
ZK_SERVER_HEAP="${ZK_SERVER_HEAP:-128}"
root@elk02:~# sed -i '/^ZK_SERVER_HEAP/s#1000#128#' /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkEnv.sh
root@elk02:~# grep ^ZK_SERVER_HEAP /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkEnv.sh
ZK_SERVER_HEAP="${ZK_SERVER_HEAP:-128}"
root@elk03:~# sed -i '/^ZK_SERVER_HEAP/s#1000#128#' /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkEnv.sh
root@elk03:~# grep ^ZK_SERVER_HEAP /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/zkEnv.sh
ZK_SERVER_HEAP="${ZK_SERVER_HEAP:-128}"
```

### 2. 重启zookeeper集群

```bash
root@elk01:~# systemctl restart zk.service
root@elk02:~# systemctl restart zk.service
root@elk03:~# systemctl restart zk.service
```

### 3. 查看堆内存是否修改成功

```bash
root@elk01:~# ps -ef | grep zookeeper | grep -i xmx
root       10028       1  3 13:06 ?        00:00:01 /usr/share/elasticsearch/jdk/bin/java -Dzookeeper.log.dir=/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../logs -Dzookeeper.log.file=zookeeper--server-elk01.log -XX:+HeapDumpOnOutOfMemoryError -XX:OnOutOfMemoryError=kill -9 %p -cp /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../zookeeper-server/target/classes:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../build/classes:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../zookeeper-server/target/lib/*.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../build/lib/*.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/zookeeper-prometheus-metrics-3.8.4.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/zookeeper-jute-3.8.4.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/zookeeper-3.8.4.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/snappy-java-1.1.10.5.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/slf4j-api-1.7.30.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/simpleclient_servlet-0.9.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/simpleclient_hotspot-0.9.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/simpleclient_common-0.9.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/simpleclient-0.9.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-transport-native-unix-common-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-transport-native-epoll-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-transport-classes-epoll-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-transport-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-resolver-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-handler-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-common-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-codec-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/netty-buffer-4.1.105.Final.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/metrics-core-4.1.12.1.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/logback-core-1.2.13.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/logback-classic-1.2.13.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jline-2.14.6.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jetty-util-ajax-9.4.53.v20231009.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jetty-util-9.4.53.v20231009.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jetty-servlet-9.4.53.v20231009.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jetty-server-9.4.53.v20231009.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jetty-security-9.4.53.v20231009.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jetty-io-9.4.53.v20231009.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jetty-http-9.4.53.v20231009.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/javax.servlet-api-3.1.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jackson-databind-2.15.2.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jackson-core-2.15.2.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/jackson-annotations-2.15.2.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/commons-io-2.11.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/commons-cli-1.5.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../lib/audience-annotations-0.12.0.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../zookeeper-*.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../zookeeper-server/src/main/resources/lib/*.jar:/dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf: -Xmx128m -Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.local.only=false org.apache.zookeeper.server.quorum.QuorumPeerMain /dawn/softwares/apache-zookeeper-3.8.4-bin/bin/../conf/zoo.cfg
```

生产环境中，建议2-4GB即可，因为数据并不会大量存储在zookeeper集群。实际工作中，zookeeper主要是用于配置中心，注册中心。