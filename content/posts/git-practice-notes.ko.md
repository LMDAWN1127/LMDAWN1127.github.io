---
title: "Git 실전 노트: 설치부터 기본 명령어와 브랜치 관리까지"
date: 2026-10-01T01:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Git", "버전 관리"]
summary: "설치와 기본 명령어, 브랜치 운영, 충돌 해결까지 다루는 Git 실습 기록."
showToc: true
---

## 01. Git 설치 및 저장소 초기화

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

## 02. Git 명령어

```bash
1. 저장소 상태 확인하기 (항상 작업 트리를 깨끗하게 유지)
[root@gitlab dawn]#git status
# On branch master
#
# Initial commit
#
nothing to commit (create/copy files and use "git add" to track)

2. 일반 파일 생성하기
[root@gitlab dawn]#touch a.txt

3. 작업 트리의 내용을 스테이징하기
[root@gitlab dawn]#git add a.txt
# git add . 는 작업 트리의 모든 내용을 스테이징 영역에 올린다
[root@gitlab dawn]#git add .

4. 스테이징 영역의 내용 삭제하기
[root@gitlab dawn]#git rm --cached a.txt
rm 'a.txt'

5. 스테이징 후 로컬 저장소에 커밋하기
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

# git commit -m 뒤에 메시지를 붙여 로컬 저장소에 커밋한다
[root@gitlab dawn]#git commit -m "create a.txt"
[master (root-commit) b65d348] create a.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 a.txt

상태 확인:
[root@gitlab dawn]#git status
# On branch master
nothing to commit, working directory clean

파일 생성          touch a.txt
스테이징          git add a.txt
로컬 저장소에 커밋             git commit -m "xxx"

2. git 으로 삭제하기

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

참고: 작업 트리 파일을 스테이징한 뒤 취소하려면 스테이징 영역에서 제거한다
[root@gitlab dawn]#touch c.txt
[root@gitlab dawn]#git add c.txt
[root@gitlab dawn]#git rm --cached c.txt
rm 'c.txt'

3. 작업 트리 내용 복구하기
[root@gitlab dawn]#git reset HEAD b.txt
[root@gitlab dawn]#git checkout -- b.txt

4. git diff 로 비교하기
git diff  작업 트리와 스테이징 영역의 차이를 비교한다
[root@gitlab dawn]#git diff
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

git diff --cached 스테이징 영역과 로컬 저장소의 차이를 비교한다
[root@gitlab dawn]#git diff --cached
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

5. 파일 이름 변경하기
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

6. 특정 스냅샷으로 롤백하기
모든 스냅샷 확인:
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

git reset --hard 로 롤백하기
[root@gitlab dawn]#git reset --hard b65d348
HEAD is now at b65d348 create a.txt
[root@gitlab dawn]#ll
total 0
-rw-r--r-- 1 root root 0 Jun 11 12:12 a.txt

7. 지금까지의 모든 커밋 작업 확인:
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

Git 브랜치
1. 브랜치 목록 확인하기 (* 는 현재 브랜치)
[root@gitlab dawn]#git branch
* master
2. 브랜치 생성하기
[root@gitlab dawn]#git branch dev
[root@gitlab dawn]#git branch
  dev
* master

3. dev 브랜치로 전환하기
[root@gitlab dawn]#git checkout dev
Switched to branch 'dev'
[root@gitlab dawn]#git branch
* dev
  master

4. 브랜치에서 파일을 만들고 로컬 저장소에 커밋하기
[root@gitlab dawn]#touch aa.txt
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "newfile aa.txt"
[dev 2694c7f] newfile aa.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

5. 브랜치 병합하기
먼저 master 브랜치로 되돌아간다
[root@gitlab dawn]#git checkout master
Switched to branch 'master'
[root@gitlab dawn]#git branch
  dev
* master
dev 브랜치를 master 에 병합한다
[root@gitlab dawn]#git merge dev
Updating ae6585c..2694c7f
Fast-forward
 aa.txt | 0
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

6. 기능 구현이 끝나면 브랜치를 즉시 삭제한다 (원격 브랜치에 뒤처지기 때문)
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 2694c7f).
[root@gitlab dawn]#git branch
* master

7. 충돌 병합
----------------------------------
파일 내용을 수정했다고 해서 병합이 막히는 것은 아니다
master 브랜치의 파일을 수정해 bbbbb 를 추가한다
[root@gitlab dawn]#vim b.txt 
aaaaa
bbbbb

한 번의 명령으로 dev 브랜치 생성과 전환을 동시에 할 수 있다
[root@gitlab dawn]#git checkout -b dev
Switched to a new branch 'dev'
[root@gitlab dawn]#
[root@gitlab dawn]#
[root@gitlab dawn]#git branch
* dev
  master

b.txt 의 내용을 수정한다
[root@gitlab dawn]#vim b.txt 
aaaaa
bbccc

로컬 저장소에 커밋하기
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "modifle bbbccc"

master 브랜치로 돌아가 dev 브랜치를 병합한다
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

충돌이 발생하는 경우
dev 브랜치 생성하기
[root@gitlab dawn]#git branch dev

master 브랜치에서 b.txt 의 3번째 줄을 수정한다
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
bbbbb
[root@gitlab dawn]#git commit -am "modifile b.txt bbbbb"
[master ae4ab87] modifile b.txt bbbbb
 1 file changed, 1 insertion(+)

dev 브랜치로 전환해 b.txt 의 3번째 줄을 수정한다
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
ccccc

로컬 저장소에 커밋하기
[root@gitlab dawn]#git commit -am "modifile b.txt ccccc"
[dev 925c06c] modifile b.txt ccccc
 1 file changed, 1 insertion(+)

master 브랜치로 전환해 브랜치를 병합한다
[root@gitlab dawn]#git checkout master
Switched to branch 'master'

[root@gitlab dawn]#git branch
  dev
* master
[root@gitlab dawn]#git merge dev
Auto-merging b.txt
CONFLICT (content): Merge conflict in b.txt
Automatic merge failed; fix conflicts and then commit the result.

파일을 확인하면 충돌 표시가 보인다
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
<<<<<<< HEAD
bbbbb
=======
ccccc
>>>>>>> dev

수동으로 충돌을 해결해 한쪽만 남기거나 모두 남긴다
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

병합 후 dev 브랜치를 삭제한다
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 925c06c).
```
