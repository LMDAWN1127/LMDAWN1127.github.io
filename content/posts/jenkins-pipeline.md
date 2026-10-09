---
title: "Jenkins Pipeline 流水线"
date: 2026-10-09T19:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "Pipeline", "CI/CD", "Jenkinsfile"]
showToc: true
summary: "从 CI/CD 与 Pipeline as Code 概念讲起，拆解 Node/Stage/Step，并用一份 Jenkinsfile 把「拉取代码 → SonarQube 扫描 → 打包 → 部署」的发布流程落地为可维护的流水线。"
---

## Pipeline流水线

### 一. CI/CD持续集成/持续部署

1. 持续集成(Continuous integration)是一种软件开发实践，即团队开发成员经常集成它们的工作，通过每个成员每天至少集成一次，也就意味着每天可能会发生多次集成。每次集成都通过自动化的构建（包括编译，发布，自动化测试）来验证，从而尽早地发现集成错误。

2. 持续部署（continuous deployment）是通过自动化的构建、测试和部署循环来快速交付高质量的产品。某种程度上代表了一个开发团队工程化的程度，毕竟快速运转的互联网公司人力成本会高于机器，投资机器优化开发流程化相对也提高了人的效率。

3. 持续交付 Continuous Delivery:频繁地将软件的新版本，交付给质量团队或者用户，以供评审尽早发现生产环境中存在的问题；如果评审通过，代码就进入生产阶段。

4. 敏捷思想中提出的这三个观点：通过技术手段自动化这三个工作，加快交付速度。

### 二.pipeline介绍

1. 什么是pipeline

Jenkins 2.0的精髓是Pipeline as Code，是帮助Jenkins实现CI到CD转变的重要角色。什么是Pipeline，简单来说，就是一套运行于 Jenkins上的工作流框架，将原本独立运行于单个或者多个节点的任务连接起来，实现单个任务难以完成的复杂发布流程。Pipeline的实现方式是一套Groovy DSL，任何发布流程都可以表述为一段Groovy脚本，并且Jenkins支持从代码库直接读取脚本，从而实现了Pipeline as Code的理念。

2. Pipeline 概念

Pipeline 是一个用户定义的 CD 流水线模式。Pipeline 代码定义了通常包含构建、测试和发布步骤的完整的构建过程。

3. Node

node 是一个机器，它是 Jenkins 环境的一部分，并且能够执行 Pipeline。同时，node 代码块也是脚本式 Pipeline 语法的关键特性。

4. Stage

Stage 块定义了在整个 Pipeline 中执行的概念上不同的任务子集（例如“构建”，“测试”和“部署”阶段），许多插件使用它来可视化或呈现 Jenkins 管道状态/进度。

5. Step

一项任务。从根本上讲，一个步骤告诉 Jenkins 在特定时间点（或过程中的“步骤”）要做什么。例如，使用 sh step：sh 'make' 可以执行 make 这个 shell 命令。

### 三.Pipeline 重构发布流程

![image-20261009162501349](/images/jenkins-pipeline-image-20261009162501349.png)

![image-20261009171900583](/images/jenkins-pipeline-image-20261009171900583.png)

![image-20261009172125709](/images/jenkins-pipeline-image-20261009172125709.png)

pipeline示例代码，做一个简单测试

```bash
pipeline{
    agent any
    stages{
        stage("get code"){
           steps{
               echo "get code from scm"
           }
        }
        stage("package"){
            steps{
                echo "packge code"
            }
        }
        stage("deploy"){
            steps{
                echo "deploy packge to node1"
            }
        }
    }
}
```

构建成功

![image-20261009172438843](/images/jenkins-pipeline-image-20261009172438843.png)

如果想更直观一点的话，可以打开Blue Ocean看板

![image-20261009182024289](/images/jenkins-pipeline-image-20261009182024289.png)

看板效果

![image-20261009182054685](/images/jenkins-pipeline-image-20261009182054685.png)

用Pipeline重构前面的发布流程

```bash
[root@jenkins ~]#vim /usr/local/sonar/conf/sonar-scanner.properties
sonar.host.url=http://11.0.1.202:9000
sonar.login=a3bd8e829343edabbbc58fefe0d3e97fdb12268b
sonar.sourceEncoding=UTF-8
```

![image-20261009182803077](/images/jenkins-pipeline-image-20261009182803077.png)

```bash
[root@gitlab game]#vim Jenkinsfile
pipeline{
    agent any
    stages{
        stage("get code"){
           steps{
                echo "get code"
           }
        }
        stage("unit test"){
           steps{
                sh '/usr/local/sonar/bin/sonar-scanner -Dsonar.projectKey=html  -Dsonar.projectName=${JOB_NAME} -Dsonar.sources=.'
           }
        }
        stage("package"){
            steps{
                sh 'tar zcf /opt/web-${BUILD_ID}.tar.gz ./* --exclude=./git --exclude=Jenkinsfile'
            }
        }
        stage("deploy"){
            steps{
                sh 'ssh 11.0.1.7 "cd /root/ && mkdir web-${BUILD_ID}"'
                sh 'scp /opt/web-${BUILD_ID}.tar.gz 11.0.1.7:/root/web-${BUILD_ID}'
                sh 'ssh 11.0.1.7 "cd /root/web-${BUILD_ID} && tar xf web-${BUILD_ID}.tar.gz && rm -rf web-${BUILD_ID}.tar.gz"'
                sh 'ssh 11.0.1.7 "cd /root && rm -rf game && ln -s web-${BUILD_ID} game"'
            }
        }
    }
}
[root@gitlab game]#git commit -am "new Jenkinsfile"
[main ca6f632] new Jenkinsfile
 1 file changed, 2 insertions(+), 1 deletion(-)
[root@gitlab game]#git push -u origin main
Counting objects: 5, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 317 bytes | 0 bytes/s, done.
Total 3 (delta 2), reused 0 (delta 0)
To git@11.0.1.200:dawn/game.git
   ce0d6dc..ca6f632  main -> main
Branch main set up to track remote branch main from origin.
```

![image-20261009185657061](/images/jenkins-pipeline-image-20261009185657061.png)
