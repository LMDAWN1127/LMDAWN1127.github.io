---
title: "Jenkins 分布式构建与 Slave 节点配置"
date: 2026-10-13T09:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "分布式构建", "Slave", "CI/CD"]
showToc: true
summary: "记录将 nexus 服务器配置为 Jenkins Slave 节点的完整过程：拷贝 sonar/maven 工具链、建立 SSH 信任、处理 agent 端 Java 版本过旧导致启动失败的坑，以及在 Jenkins UI 指定 JavaPath、调整 master 并发调度实现 master/slave 并行构建。"
---

## 1.分布式构建介绍

如果项目需要定期集成，同时每次集成都需要较长时间。如果都运行在master服务器上，会消耗过多资源，导致其他项目搁置无法集成，这时就需要在建立多台设备，并配置作为slave机器来为master提供负载服务。

## 2.部署分布式服务器

找一台或者目前已有的服务器配置为slave端（当前使用nexus服务器作为slave测试）

在nexus上安装java jdk git和nexus客户端（如已安装则略过）

```bash
[root@nexus ~]# yum -y install java git
```

复制jenkins上已配置好的客户端到此服务器sonar和maven

jenkins服务器操作

```bash
# 优化java.sh脚本
# 原来
code_dir='/var/lib/jenkins/workspace/java_job/target/*.war'
# 改成
code_dir="$WORKSPACE/target/*.war"

[root@jenkins ~]#scp -r /usr/local/sonar  11.0.1.203:/usr/local/
[root@jenkins ~]#scp -r /usr/local/maven/ 11.0.1.203:/usr/local/
[root@nexus ~]#mkdir /server/scripts -p
[root@jenkins ~]#scp /server/scripts/*  11.0.1.203:/server/scripts/
[root@jenkins ~]#ssh-copy-id -i .ssh/id_rsa.pub 11.0.1.203
```

把从节点的公钥上传至gitlab 拥有下载代码的权限

```bash
[root@nexus ~]#ssh-keygen
[root@nexus ~]#cat .ssh/id_rsa.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCzCEs3V2MqRK8BO/ewSoUcjXTkdEj/c1vBz8UOLYgkKK+Jh/MvV71nsCeohy5slQ2phTE6DXFAwfm54FBDL2Wy4THL3tGmZH0sLHa0xg3d8MLjknXWVqizyX8V0SxALcJ9hTj1v0BlB8F1U60DCKqoScezJ7ZDKtbSS2Q4niARjSGxlcAYxLgb3mUr0BX+HHqtiBw+lGW2Q/wRMcCue0WFmYLN9jxiOxNIJ4xPQ6G6gHzpHsGJYyhIM/SKctbGMpqgTvideHqOzThYQGaiLo9DFu7p9QSc3wAHRxE8kyZlmNKEzknebFx+pbQwMzZ7Za0I5c1PTHPmPqhuDOGaXUBZ root@nexus
```

![image-20261012203953185](/images/jenkins-distributed-build-image-20261012203953185.png)

点击系统管理 -> 节点管理 -> 新建节点

![image-20261012204603430](/images/jenkins-distributed-build-image-20261012204603430.png)

![image-20261012204904326](/images/jenkins-distributed-build-image-20261012204904326.png)

```bash
[root@jenkins ~]#cat .ssh/id_rsa
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAvpGo/zRMBymiBKzBApVWLhtyblq/Qg+16bjuWGeiX7TJjXQD
zK70tJlqj+Eg8k+v5XtI9URpAOPBrIqxEnzKlyr80kneQLoSD5lAA7RjzSulUnoj
CsqFoIjQRS5+kSDgHFyNDLma2EDCyc/pDmK+pBfXpv+jHxUKy5LfQ8yJZ0fW+wjC
8g5zzmfBRuuNA6ql9LGfBvotr+NVV/3O0RiFgIBISWPpIjEuXA8VpU39pPIaGZod
FSGvxvQMJ725JclIhOAAnfRrRCRucVyc3nZ+6tP2IH69uk9vbfikk90pcq1yGhGx
AuVsCDMpghCQwjzwhs6i47FmvuHWyYaBDNWn1QIDAQABAoIBABpNFirqt9eBOng0
s4q8u6EvbpKmeaEPdAbm3BZdbz6QQAUCzwdv2hwW1Gs5IgfvUZJ1enNHVsqlpHRA
zAGGMZu9dhk70q3SQG3gs8IPInsNnAqPCskRfHHUkBIMQbGb/PJNH7Zy41kXTwr1
Y+/1VuRk2gGVZJkEmXHROnksAIa9WYhr9BD8p+hDjjmiaK8uD2E/mIIWhnWWuxUd
fsrlVnu0Vtdwei5wvvCTwguaJMeMsgZvVlu4rt6HMdmS1KCVJYKNBCtQ6BCcmWHt
3G3Lz23S5LibvoJFRMzIrwQop6nFkm7BErYTJf/UBWwOOVPzXCIFNsQFpm1l/DwQ
/G1skF0CgYEA32q6BSwSIOquH8gxN+HApznPv6U1U05V0ZatZA/hGv0Bf658NsEm
URO4VcEI2xKOhr8BoNFWvt0eTCiM3kKB4ZoBrggVulfxH+9R8m1RHRNOXGm8nfe7
UOTwtSrQwQBdUlI82sHnsS+Dh3+dGFpDCF6DXVElU6RDMbFmI7vy/psCgYEA2lyO
WjvRj6FBuc1HYqUFPCN9milx93HoEKbHJoFcgq7jf4++o9VtF9UKkZsvwWqjYees
7QziRjZkf8/2WOF5U2WhtKVK96MTPVdpGj+Nchkecvs1vPuAiBqNDK4Wr979VRDW
sRaDLRPlLMbTqUCH3zswyUmghmFkxpp7xN1hok8CgYEAqJ0OuVqSb/9N3LSk2Kzr
TgnmjZes0Ct9v0k9oRgO5uRtniRcoKJTPbtpUmb2PQgbQvyiyPFUy4VsGUQ9VHzT
MyWdAPAfHdzDITvoF9OC9TOd30b50CqoVxwBwmkG1bJlu/xO6zaOmv3mAXxBXqC4
mHdkIyhbyG1fPQDKuktdz+MCgYEApBJll+FYjd5xv0VCPRmXfF+CccJwcqfw4goe
m40Z0MvN/rwoV3v3M7AM9+kuEdupldf5NEi5AF7AVtUQ2inY+tPjlBOa58VtoGq8
e0+DXVcIbQbakvw60Il6sCtiupUHrtIvLvKmb8mCKone4k6tiQs1lhkvd6lYim3r
T7m0MbsCgYALDbkebVxvLgEdRc4F4IIkM5wYhEurR//kZqJXDHQCrzeUKKXMnXm5
rSQVgN9RrOF7W6Fbcwa0WljA77moNLfqh9o8AGPybCGLigiNJyjH+ZQa8Kydsyn+
d+B6pUXKtJO6lPaz9/t+N3YNqQgL9zs3Bd5Nris7YsgPBJhiszy3GQ==
-----END RSA PRIVATE KEY-----
```

![image-20261012205242807](/images/jenkins-distributed-build-image-20261012205242807.png)

![image-20261012205353047](/images/jenkins-distributed-build-image-20261012205353047.png)

![image-20261012205810623](/images/jenkins-distributed-build-image-20261012205810623.png)

这里由于agent端Java版本太老所以导致代理启动失败

![image-20261012211254648](/images/jenkins-distributed-build-image-20261012211254648.png)

```bash
# 在11.0.1.203上面装Java 11
[root@nexus ~]#yum install -y java-11-openjdk
[root@nexus ~]#alternatives --install /usr/bin/java java /usr/lib/jvm/jre-11/bin/java 200000
[root@nexus ~]#alternatives --set java /usr/lib/jvm/jre-11/bin/java
[root@nexus ~]#java -version
openjdk version "11.0.23" 2024-04-16 LTS
OpenJDK Runtime Environment (Red_Hat-11.0.23.0.9-2.el7_9) (build 11.0.23+9-LTS)
OpenJDK 64-Bit Server VM (Red_Hat-11.0.23.0.9-2.el7_9) (build 11.0.23+9-LTS, mixed mode, sharing)
```

在JenkinsUI给节点指定用Java 11启动：
节点列表 → node1-11.0.1.203 → 配置 → 展开 高级 → JavaPath

![image-20261012211208591](/images/jenkins-distributed-build-image-20261012211208591.png)

启动成功

![image-20261012211905825](/images/jenkins-distributed-build-image-20261012211905825.png)

![image-20261012211928955](/images/jenkins-distributed-build-image-20261012211928955.png)

从节点的公钥复制给web01和web02，实现免密

```bash
[root@nexus ~]#ssh-copy-id -i .ssh/id_rsa.pub 11.0.1.8
/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: ".ssh/id_rsa.pub"
The authenticity of host '11.0.1.8 (11.0.1.8)' can't be established.
ECDSA key fingerprint is SHA256:Ldn1vBzBEFxynXs0qBNr0XzJ2lTx/0caMuK5yJtb+Zo.
ECDSA key fingerprint is MD5:3d:1d:28:3f:33:ec:ee:c1:69:83:af:14:a3:7f:79:ac.
Are you sure you want to continue connecting (yes/no)? yes
/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed
/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys
root@11.0.1.8's password:

Number of key(s) added: 1

Now try logging into the machine, with:   "ssh '11.0.1.8'"
and check to make sure that only the key(s) you wanted were added.

[root@nexus ~]#ssh-copy-id -i .ssh/id_rsa.pub 11.0.1.7
/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: ".ssh/id_rsa.pub"
The authenticity of host '11.0.1.7 (11.0.1.7)' can't be established.
ECDSA key fingerprint is SHA256:Ldn1vBzBEFxynXs0qBNr0XzJ2lTx/0caMuK5yJtb+Zo.
ECDSA key fingerprint is MD5:3d:1d:28:3f:33:ec:ee:c1:69:83:af:14:a3:7f:79:ac.
Are you sure you want to continue connecting (yes/no)? yes
/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed
/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys
root@11.0.1.7's password:
Number of key(s) added: 1
Now try logging into the machine, with:   "ssh '11.0.1.7'"
and check to make sure that only the key(s) you wanted were added.
```

手动做一次git克隆yes验证

```bash
[root@nexus ~]#git clone git@11.0.1.200:dawn/java.git
```

将master节点修改成以下用法，这样构建的时候就不会调度到master节点上了，然后测试一下slave可用性

![image-20261013124412663](/images/jenkins-distributed-build-image-20261013124412663.png)

测试构建成功

![image-20261013130537790](/images/jenkins-distributed-build-image-20261013130537790.png)



将master节点配置修改回来，同时都修改并发为2

![image-20261013132030828](/images/jenkins-distributed-build-image-20261013132030828.png)

![image-20261013132055722](/images/jenkins-distributed-build-image-20261013132055722.png)

构建执行状态显示master和node1同时执行

![image-20261013131936147](/images/jenkins-distributed-build-image-20261013131936147.png)
