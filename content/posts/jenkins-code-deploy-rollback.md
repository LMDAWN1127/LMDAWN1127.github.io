---
title: "Jenkins 代码发布与回滚"
date: 2026-10-10T17:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Jenkins", "代码发布", "回滚", "Git Parameter"]
showToc: true
summary: "基于 GitLab 打 tag 标记稳定版本，配合 Jenkins Git Parameter 插件做参数化构建，用一份 deploy/rollback 脚本实现按版本号发布与一键回滚。"
---

## 代码发布和回滚

代码发布前，先将之前测试流程的触发器关闭

![image-20261010132314793](/images/jenkins-code-deploy-rollback-image-20261010132314793.png)

### 1.将稳定版本的main打标签 tag

```bash
[root@gitlab game]#vim index.html 修改为v1.0.1
[root@gitlab game]#git commit -am "v1.0.1"
#为当前的仓库的代码打tag
[root@gitlab game]#git tag -a v1.0.1 -m "v1.0.1"
```

### 2.将tag提交到gitlab的game项目中

```bash
推送tag到远程仓库
[root@gitlab game]#git push -u origin v1.0.1
```

### 3.jenkins获取gitlab中的tag

```bash
jenkins需要通过使用 git parameter插件获取项目中tag版本号信息
注: 接下来安装插件、在可选插件中搜索Git Parameter 直接安装即可，已安装则忽略次步骤
进入到项目把前面的参数化去掉重新选择使用git parameter
```

![image-20261010141127373](/images/jenkins-code-deploy-rollback-image-20261010141127373.png)

### 4.新建一个任务，只用于代码发布和回滚

![image-20261010141412307](/images/jenkins-code-deploy-rollback-image-20261010141412307.png)

![image-20261010142246376](/images/jenkins-code-deploy-rollback-image-20261010142246376.png)

![image-20261010142408299](/images/jenkins-code-deploy-rollback-image-20261010142408299.png)

![image-20261010143634022](/images/jenkins-code-deploy-rollback-image-20261010143634022.png)

```bash
[root@jenkins scripts]#vim deploy.sh
#!/bin/sh
CODE_DIR=`pwd`
WEB_DIR="/code/"

get_code_tar(){
        cd $CODE_DIR && tar zcf /opt/web-$git_version.tar.gz ./*
}

scp_code_web(){
        scp /opt/web-$git_version.tar.gz 11.0.1.7:$WEB_DIR
}

code_tarxf(){
        ssh 11.0.1.7 "cd $WEB_DIR &&mkdir web-$git_version && tar xf web-$git_version.tar.gz -C web-$git_version"

}
ln_html(){
         ssh 11.0.1.7 "cd $WEB_DIR && rm -rf html && ln -s web-$git_version html"
}

main(){

        get_code_tar;
        scp_code_web;
        code_tarxf;
        ln_html;
}
main
```

测试构建，为了演示效果，先删除web服务器/code/目录内容

```bash
[root@web01 code]#rm -fr *
```

![image-20261010144308537](/images/jenkins-code-deploy-rollback-image-20261010144308537.png)

![image-20261010145323057](/images/jenkins-code-deploy-rollback-image-20261010145323057.png)

![image-20261010145400714](/images/jenkins-code-deploy-rollback-image-20261010145400714.png)

![image-20261010155653874](/images/jenkins-code-deploy-rollback-image-20261010155653874.png)

```bash
[root@web01 code]#ll
total 7740
lrwxrwxrwx 1 root root      10 Oct 10 15:56 html -> web-v1.0.1
drwxr-xr-x 6 root root     126 Oct 10 15:56 web-v1.0.1
-rw-r--r-- 1 root root 7922995 Oct 10 15:56 web-v1.0.1.tar.gz
```

更新版本（多推送几个版本进行测试）

![image-20261010160543288](/images/jenkins-code-deploy-rollback-image-20261010160543288.png)

![image-20261010160648501](/images/jenkins-code-deploy-rollback-image-20261010160648501.png)

![image-20261010160629307](/images/jenkins-code-deploy-rollback-image-20261010160629307.png)

使用参数化构建中的选项参数

![image-20261010161800412](/images/jenkins-code-deploy-rollback-image-20261010161800412.png)

![image-20261010162057663](/images/jenkins-code-deploy-rollback-image-20261010162057663.png)

![image-20261010162126570](/images/jenkins-code-deploy-rollback-image-20261010162126570.png)

优化发布和回滚操作

```bash
#!/bin/sh
CODE_DIR=`pwd`
WEB_DIR="/code/"

get_code_tar(){
        cd $CODE_DIR && tar zcf /opt/web-$git_version.tar.gz ./*
}

scp_code_web(){
        scp /opt/web-$git_version.tar.gz 11.0.1.7:$WEB_DIR
}

code_tarxf(){
        ssh 11.0.1.7 "cd $WEB_DIR &&mkdir web-$git_version && tar xf web-$git_version.tar.gz -C web-$git_version"

}
ln_html(){
         ssh 11.0.1.7 "cd $WEB_DIR && rm -rf html && ln -s web-$git_version html"
}

main(){

        get_code_tar;
        scp_code_web;
        code_tarxf;
        ln_html;
}
if [ $game = "deploy" ];then
    main
elif [ $game = "rollback" ];then
    ln_html
fi
```

这样发布过的版本就可以直接rollback，不用deploy，可以减少重复构建，不用重新执行整个main函数，只需要执行ln_html就可以了

### 5.拉取对应的版本

![image-20261010173721185](/images/jenkins-code-deploy-rollback-image-20261010173721185.png)
