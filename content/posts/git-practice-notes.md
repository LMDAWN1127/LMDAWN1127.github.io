---
title: "Git 实战笔记：安装配置、常用命令与分支管理"
date: 2026-10-01T01:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Git", "版本控制"]
summary: "从安装配置到常用命令，再到分支管理与冲突合并，一份完整的 Git 实操记录。"
showToc: true
---

## 01.安装git并初始化仓库

```bash
[root@gitlab ~]#yum install -y git
[root@gitlab ~]#git --version
git version 1.8.3.1
[root@gitlab ~]#git config --global user.name "dawn"
[root@gitlab ~]#git config --global user.email "dawn@mail.com"
[root@gitlab ~]#git config --global color.ui true
[root@gitlab ~]#cat .gitconfig
[user]
        name = dawn
        email = dawn@mail.com
[color]
        ui = true
[root@gitlab ~]#mkdir dawn
[root@gitlab ~]#cd dawn
[root@gitlab dawn]#ll
total 0
[root@gitlab dawn]#git init
Initialized empty Git repository in /root/dawn/.git/
[root@gitlab dawn]#ll
total 0
[root@gitlab dawn]#ll -a
total 0
drwxr-xr-x  3 root root  18 Jun 11 10:57 .
dr-xr-x---. 4 root root 174 Jun 11 10:57 ..
drwxr-xr-x  7 root root 119 Jun 11 10:57 .git
```

## 02.Git命令

```bash
1.查看仓库的状态(时刻保证仓库的干净)
[root@gitlab dawn]#git status
# On branch master
#
# Initial commit
#
nothing to commit (create/copy files and use "git add" to track)

2.创建普通文件
[root@gitlab dawn]#touch a.txt

3.将工作区的内容提交到暂存区
[root@gitlab dawn]#git add a.txt
#git add .表示所有工作区的内容提交到暂存区
[root@gitlab dawn]#git add .

4.删除暂存区的内容
[root@gitlab dawn]#git rm --cached a.txt
rm 'a.txt'

5.提交到暂存区和本地仓库
[root@gitlab dawn]#git add a.txt
[root@gitlab dawn]#git status
# On branch master
#
# Initial commit
#
# Changes to be committed:
#   (use "git rm --cached <file>..." to unstage)
#
#   new file:   a.txt
#

#使用git commit -m描述 提交到本地仓库
[root@gitlab dawn]#git commit -m "create a.txt"
[master (root-commit) b65d348] create a.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 a.txt

查看状态:
[root@gitlab dawn]#git status
# On branch master
nothing to commit, working directory clean

创建文件       touch a.txt 
提交到暂存区   git add a.txt
提交到本地仓库 git commit -m "xxx"

2.git删除

[root@gitlab dawn]#git rm a.txt
rm 'a.txt'
[root@gitlab dawn]#git status
# On branch master
# Changes to be committed:
#   (use "git reset HEAD <file>..." to unstage)
#
#   deleted:    a.txt
#
[root@gitlab dawn]#git commit -m "del a.txt"
[master 41fc71b] del a.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 delete mode 100644 a.txt
[root@gitlab dawn]#git status
# On branch master
nothing to commit, working directory clean

注意: 如果工作区的文件提交到了暂存区域反悔了,删除暂存区的内容
[root@gitlab dawn]#touch c.txt
[root@gitlab dawn]#git add c.txt
[root@gitlab dawn]#git rm --cached c.txt
rm 'c.txt'

3.恢复工作区内容
[root@gitlab dawn]#git reset HEAD b.txt
[root@gitlab dawn]#git checkout -- b.txt

4.git比对
git diff  比对的是工作区域和暂存区域的不同
[root@gitlab dawn]#git diff
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

git diff --cached 比对的是暂存区和本地仓库的不同
[root@gitlab dawn]#git diff --cached
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

5.改名
[root@gitlab dawn]#git mv b.txt  b.bak
[root@gitlab dawn]#git status
# On branch master
# Changes to be committed:
#   (use "git reset HEAD <file>..." to unstage)
#
#   renamed:    b.txt -> b.bak
#
[root@gitlab dawn]#git commit -m "newname b.txt-->b.bak"
[master 55335a7] newname b.txt-->b.bak
 1 file changed, 0 insertions(+), 0 deletions(-)
 rename b.txt => b.bak (100%)
[root@gitlab dawn]#git status
# On branch master
nothing to commit, working directory clean

6.指定回滚到哪个快照
显示所有的快照:
[root@gitlab dawn]#git log --oneline
ae6585c xx
55335a7 newname b.txt-->b.bak
09ffe53 modifile b.txt
043a297 newfile b.txt
41fc71b del a.txt
b65d348 create a.txt
[root@gitlab dawn]#ll
total 8
-rw-r--r-- 1 root root 6 Jun 11 12:10 b.bak
-rw-r--r-- 1 root root 6 Jun 11 12:07 b.txt

使用git reset --hard 回滚
[root@gitlab dawn]#git reset --hard b65d348
HEAD is now at b65d348 create a.txt
[root@gitlab dawn]#ll
total 0
-rw-r--r-- 1 root root 0 Jun 11 12:12 a.txt

7.查看历史所有的提交动作:
[root@gitlab dawn]#git reflog
b65d348 HEAD@{0}: reset: moving to b65d348
ae6585c HEAD@{1}: commit: xx
55335a7 HEAD@{2}: commit: newname b.txt-->b.bak
09ffe53 HEAD@{3}: commit: modifile b.txt
043a297 HEAD@{4}: commit: newfile b.txt
41fc71b HEAD@{5}: commit: del a.txt
b65d348 HEAD@{6}: commit (initial): create a.txt
[root@gitlab dawn]#git reset --hard ae6585c
HEAD is now at ae6585c xx
[root@gitlab dawn]#ll
total 8
-rw-r--r-- 1 root root 6 Jun 11 12:16 b.bak
-rw-r--r-- 1 root root 6 Jun 11 12:16 b.txt

Git分支
1.查看git分支 *表示当前所在的分支
[root@gitlab dawn]#git branch
* master
2.创建分支
[root@gitlab dawn]#git branch dev
[root@gitlab dawn]#git branch
  dev
* master

3.切换到dev分支
[root@gitlab dawn]#git checkout dev
Switched to branch 'dev'
[root@gitlab dawn]#git branch
* dev
  master

4.分支创建文件并且提交到本地仓库
[root@gitlab dawn]#touch aa.txt
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "newfile aa.txt"
[dev 2694c7f] newfile aa.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

5.合并分支
先切换回master分支
[root@gitlab dawn]#git checkout master
Switched to branch 'master'
[root@gitlab dawn]#git branch
  dev
* master
合并dev分支到master分支
[root@gitlab dawn]#git merge dev
Updating ae6585c..2694c7f
Fast-forward
 aa.txt | 0
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

6.分支写完功能后立刻删除(因为代码会落后于远程分支)
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 2694c7f).
[root@gitlab dawn]#git branch
* master

7.冲突合并
----------------------------------
修改文件的内容不影响分支的合并
修改主干分支的文件增加bbbbb
[root@gitlab dawn]#vim b.txt 
aaaaa
bbbbb

使用一条命令可以直接创建并切换到dev分支
[root@gitlab dawn]#git checkout -b dev
Switched to a new branch 'dev'
[root@gitlab dawn]#
[root@gitlab dawn]#
[root@gitlab dawn]#git branch
* dev
  master

修改b.txt的内容
[root@gitlab dawn]#vim b.txt 
aaaaa
bbccc

提交到本地仓库
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "modifle bbbccc"

返回到master分支将dev分支合并
[root@gitlab dawn]#git checkout master
Switched to branch 'master'
[root@gitlab dawn]#git branch
  dev
* master
[root@gitlab dawn]#cat b.txt 
aaaaa
bbbbb
[root@gitlab dawn]#git merge dev
Updating f56faba..dc17f6d
Fast-forward
 b.txt | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
[root@gitlab dawn]#cat b.txt
aaaaa
bbccc
------------------------------------------------------

影响冲突合并的案例
创建dev分支
[root@gitlab dawn]#git branch dev

在master分支修改b.txt第3行
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
bbbbb
[root@gitlab dawn]#git commit -am "modifile b.txt bbbbb"
[master ae4ab87] modifile b.txt bbbbb
 1 file changed, 1 insertion(+)

在切换到dev分支修改b.txt第3行
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
ccccc

提交到本地仓库
[root@gitlab dawn]#git commit -am "modifile b.txt ccccc"
[dev 925c06c] modifile b.txt ccccc
 1 file changed, 1 insertion(+)

在切换到master分支进行分支合并
[root@gitlab dawn]#git checkout master
Switched to branch 'master'

[root@gitlab dawn]#git branch
  dev
* master
[root@gitlab dawn]#git merge dev
Auto-merging b.txt
CONFLICT (content): Merge conflict in b.txt
Automatic merge failed; fix conflicts and then commit the result.

查看文件显示代码冲突
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
<<<<<<< HEAD
bbbbb
=======
ccccc
>>>>>>> dev

手动解决代码冲突 留下一行或者全部留下
[root@gitlab dawn]#vim b.txt 
aaaaa
iiiii
bbbbb
ccccc

[root@gitlab dawn]#git commit -am "merge dev"
[master 325eef2] merge dev
[root@gitlab dawn]#
[root@gitlab dawn]#
[root@gitlab dawn]#git status
# On branch master
nothing to commit, working directory clean
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
bbbbb
ccccc

合并后删除dev分支
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 925c06c).
```
