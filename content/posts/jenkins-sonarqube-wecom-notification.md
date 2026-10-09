---
title: "Jenkins 集成 SonarQube 质量门禁与企业微信通知"
date: 2026-10-09T16:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "SonarQube", "企业微信", "CI/CD"]
showToc: true
summary: "在 Jenkins 中集成 SonarQube 质量门禁做代码扫描，并配合企业微信(WeCom)实现构建结果与变更日志的自动通知，打通质量卡点与团队触达。"
---

## 01 .Jenkins集成SonarQube

### 一. jenkins上配置SonarQube服务端

![image-20261002171200675](/images/jenkins-sonarqube-wecom-notification-image-20261002171200675.png)

将Build Steps和执行shell调换位置，Build Steps在上面，执行shell在下面

![image-20261002171410469](/images/jenkins-sonarqube-wecom-notification-image-20261002171410469.png)

![image-20261002171720878](/images/jenkins-sonarqube-wecom-notification-image-20261002171720878.png)

![image-20261002171905642](/images/jenkins-sonarqube-wecom-notification-image-20261002171905642.png)

1.Name定义

2.URL添加SonarQube的地址 token添加一个secret text 填写之前安装SonarQube的Token

![image-20261002172312971](/images/jenkins-sonarqube-wecom-notification-image-20261002172312971.png)

![image-20261002172909893](/images/jenkins-sonarqube-wecom-notification-image-20261002172909893.png)

![image-20261002173002907](/images/jenkins-sonarqube-wecom-notification-image-20261002173002907.png)

### 二. Jekins配置sonar客户端的位置

jenkins配置执行sonar-scanner命令的家目录，让jenkins能找到该命令 系统管理->全局工具配置

![image-20261002173321188](/images/jenkins-sonarqube-wecom-notification-image-20261002173321188.png)

![image-20261002174406122](/images/jenkins-sonarqube-wecom-notification-image-20261002174406122.png)

### 三. 项目中集成SonarQube

![](/images/jenkins-sonarqube-wecom-notification-img_p49_2_273.png)

![](/images/jenkins-sonarqube-wecom-notification-img_p50_1_278.png)

```bash
[root@gitlab game]#vim index.html
....
                    ['魂斗罗v5', 'roms/Contra1(U)30.nes'],
...
[root@gitlab game]#git commit -am "v5"
[main c03f21c] v5
 1 file changed, 1 insertion(+), 1 deletion(-)
[root@gitlab game]#git push -u origin main
Counting objects: 5, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 273 bytes | 0 bytes/s, done.
Total 3 (delta 2), reused 0 (delta 0)
To git@11.0.1.200:dawn/game.git
   d0cef87..c03f21c  main -> main
Branch main set up to track remote branch main from origin.
```

自动推送成功

![image-20261002180751968](/images/jenkins-sonarqube-wecom-notification-image-20261002180751968.png)

## 02. Jenkins集成微信

### 一. 集成微信介绍

jenkins集成微信，测试环境流程，开发写完代码直接提交到gitlab，自动触发Jenkins执行构建，运行结果可以直接展示在测试平台，每次发版的测试版本信息可以通过Jenkins发送到企业微信通知相关项目人员。

### 二. 注册企业微信公众号

网址: https://mp.weixin.qq.com/

![image-20261002183759363](/images/jenkins-sonarqube-wecom-notification-image-20261002183759363.png)

选择完成后把下面信息进行完善->使用自己微信扫描二维码进行管理后-点注册

![](/images/jenkins-sonarqube-wecom-notification-image-20261002183502204.png)

注册成功登陆后点击应用管理->创建应用

上传一张log->填写应用名称-可见范围->创建应用-保存好agentld和secret写入py脚本

![image-20261002184557305](/images/jenkins-sonarqube-wecom-notification-image-20261002184557305.png)

![image-20261002185358852](/images/jenkins-sonarqube-wecom-notification-image-20261002185358852.png)

### 三. 修改py脚本信息

```bash
#1. 上传脚本到/server/scripts 
[root@jenkins ~]# mkdir -p /server/scripts
[root@jenkins ~]# cd /server/scripts
[root@jenkins scripts]#ll
total 4
-rw-r--r-- 1 root root 2008 Oct  2 18:59 jenkins_notify.py
```

![image-20261002191311651](/images/jenkins-sonarqube-wecom-notification-image-20261002191311651.png)

![image-20261009135456446](/images/jenkins-sonarqube-wecom-notification-image-20261009135456446.png)

![image-20261009135635405](/images/jenkins-sonarqube-wecom-notification-image-20261009135635405.png)

### 四. 本地执行脚本测试

```bash
[root@jenkins ~]#yum -y install python-pip
[root@jenkins ~]#wget https://bootstrap.pypa.io/pip/2.7/get-pip.py
[root@jenkins ~]#python get-pip.py
[root@jenkins ~]#pip2.7 install requests
[root@jenkins scripts]#python jenkins_notify.py 11 /etc/hosts game
[变更日志] : 127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4

[变更日志] : 127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6

{"errcode":0,"errmsg":"ok","msgid":"cpB2NxqCi8uaKeFHyR1iukyQoHK88hteL3ZQ36qc1J-s6dxwr9nVl5U1rnbiYNHHMEhpIkDaLTfEWfIwu7JVlRs_bPedgINU2lOaYHsoih9vWaXL-BAMnxRfc6wD5f19"}
[root@jenkins scripts]#python jenkins_notify.py 11.0.1.201 /etc/hosts game
[变更日志] : 127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4

[变更日志] : 127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6

{"errcode":0,"errmsg":"ok","msgid":"cpB2NxqCi8uaKeFHyR1iukyQoHK88hteL3ZQ36qc1J_hJhqCw0rb1QjAxDrJIwd1leNF0jHEWgispRPFbstm-I_VCKgfsRHM266lQO-Mvzg0XD0JGP2Vi-cc9yPN98Fd"}
```

![image-20261009141459785](/images/jenkins-sonarqube-wecom-notification-image-20261009141459785.png)

### 五. 集成到Jenkins

安装第三方插件:

1.由于jenkins没有官网的插件来完成此功能，所以我们只能用网络上一些开源的插件

github下载代码
https://github.com/daniel-beck/changelog-environment-plugin
解压到某个目录-> 进入目录执行以下操作
cd 到 changelog-environment-plugin-master 下，执行
mvn verify
时间较长，会在changelog-environment-plugin-master/target/下有个changelog-environment.hpi文件，上传到jenkins即可使用

2.安装插件

![image-20261009144119185](/images/jenkins-sonarqube-wecom-notification-image-20261009144119185.png)

3.重启Jenkins服务

```bash
[root@jenkins scripts]#systemctl restart jenkins
```

4.集成到jenkins

进入到项目:

```bash
Entry Format中添加 %3$s(at %4$s via %1$s)，参数分别为ChangeLog内容，时间，提交人。
Date Format中添加 yyyy-MM-dd HH:mm:ss 就是时间格式。
```

![image-20261009144842556](/images/jenkins-sonarqube-wecom-notification-image-20261009144842556.png)

```bash
复制执行命令
echo "==========Start Notify=============="
echo ${SCM_CHANGELOG} > /tmp/${JOB_NAME}_change.log
python /server/scripts/jenkins_notify.py ${BUILD_URL} /tmp/${JOB_NAME}_change.log ${JOB_NAME}
rm -fv /tmp/${JOB_NAME}_change.log
```

![image-20261009145238717](/images/jenkins-sonarqube-wecom-notification-image-20261009145238717.png)

5.测试效果

```bash
[root@gitlab game]#git add .
[root@gitlab game]#git commit -am "v8"
[main 77d13e2] v8
 1 file changed, 1 insertion(+), 1 deletion(-)
[root@gitlab game]#git push -u origin main
Counting objects: 5, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 270 bytes | 0 bytes/s, done.
Total 3 (delta 2), reused 0 (delta 0)
To git@11.0.1.200:dawn/game.git
   bb52c00..77d13e2  main -> main
Branch main set up to track remote branch main from origin.
```

![image-20261009150956394](/images/jenkins-sonarqube-wecom-notification-image-20261009150956394.png)
