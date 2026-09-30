---
title: "Git in Practice: Installation, Essential Commands, and Branch Management"
date: 2026-10-01T01:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Git", "Version Control"]
summary: "A hands-on Git walkthrough covering installation, everyday commands, branch workflows, and conflict resolution."
showToc: true
---

## 01. Install Git and Initialize a Repository

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

## 02. Git Commands

```bash
1. Check repository status (always keep the working tree clean)
[root@gitlab dawn]#git status
# On branch master
#
# Initial commit
#
nothing to commit (create/copy files and use "git add" to track)

2. Create a plain file
[root@gitlab dawn]#touch a.txt

3. Stage the working tree content
[root@gitlab dawn]#git add a.txt
# git add . stages everything in the working tree
[root@gitlab dawn]#git add .

4. Remove content from the staging area
[root@gitlab dawn]#git rm --cached a.txt
rm 'a.txt'

5. Stage it and commit to the local repository
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

# commit to the local repository with git commit -m plus a message
[root@gitlab dawn]#git commit -m "create a.txt"
[master (root-commit) b65d348] create a.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 a.txt

Check status:
[root@gitlab dawn]#git status
# On branch master
nothing to commit, working directory clean

Create a file     touch a.txt
Stage             git add a.txt
Commit to local repo         git commit -m "xxx"

2. Deleting with git

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

Note: if you regret staging a file, remove it from the staging area
[root@gitlab dawn]#touch c.txt
[root@gitlab dawn]#git add c.txt
[root@gitlab dawn]#git rm --cached c.txt
rm 'c.txt'

3. Restore the working tree content
[root@gitlab dawn]#git reset HEAD b.txt
[root@gitlab dawn]#git checkout -- b.txt

4. Diffing with git
git diff  compares the working tree against the staging area
[root@gitlab dawn]#git diff
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

git diff --cached compares the staging area against the local repository
[root@gitlab dawn]#git diff --cached
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

5. Renaming a file
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

6. Roll back to a specific snapshot
Show all snapshots:
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

Roll back with git reset --hard
[root@gitlab dawn]#git reset --hard b65d348
HEAD is now at b65d348 create a.txt
[root@gitlab dawn]#ll
total 0
-rw-r--r-- 1 root root 0 Jun 11 12:12 a.txt

7. View all historical actions:
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

Git branches
1. List branches (* marks the current branch)
[root@gitlab dawn]#git branch
* master
2. Create a branch
[root@gitlab dawn]#git branch dev
[root@gitlab dawn]#git branch
  dev
* master

3. Switch to the dev branch
[root@gitlab dawn]#git checkout dev
Switched to branch 'dev'
[root@gitlab dawn]#git branch
* dev
  master

4. Create a file on the branch and commit it to the local repository
[root@gitlab dawn]#touch aa.txt
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "newfile aa.txt"
[dev 2694c7f] newfile aa.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

5. Merging branches
First switch back to the master branch
[root@gitlab dawn]#git checkout master
Switched to branch 'master'
[root@gitlab dawn]#git branch
  dev
* master
Merge the dev branch into master
[root@gitlab dawn]#git merge dev
Updating ae6585c..2694c7f
Fast-forward
 aa.txt | 0
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

6. Delete the branch right after finishing the feature (it falls behind the remote branch)
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 2694c7f).
[root@gitlab dawn]#git branch
* master

7. Merge conflicts
----------------------------------
Editing a file does not necessarily block the merge
Edit the file on the master branch and add bbbbb
[root@gitlab dawn]#vim b.txt 
aaaaa
bbbbb

Create and switch to the dev branch with a single command
[root@gitlab dawn]#git checkout -b dev
Switched to a new branch 'dev'
[root@gitlab dawn]#
[root@gitlab dawn]#
[root@gitlab dawn]#git branch
* dev
  master

Edit the content of b.txt
[root@gitlab dawn]#vim b.txt 
aaaaa
bbccc

Commit to the local repository
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "modifle bbbccc"

Switch back to master and merge the dev branch
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

A case that triggers a merge conflict
Create the dev branch
[root@gitlab dawn]#git branch dev

On the master branch, edit line 3 of b.txt
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
bbbbb
[root@gitlab dawn]#git commit -am "modifile b.txt bbbbb"
[master ae4ab87] modifile b.txt bbbbb
 1 file changed, 1 insertion(+)

Switch to the dev branch and edit line 3 of b.txt
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
ccccc

Commit to the local repository
[root@gitlab dawn]#git commit -am "modifile b.txt ccccc"
[dev 925c06c] modifile b.txt ccccc
 1 file changed, 1 insertion(+)

Switch back to master and merge the branch
[root@gitlab dawn]#git checkout master
Switched to branch 'master'

[root@gitlab dawn]#git branch
  dev
* master
[root@gitlab dawn]#git merge dev
Auto-merging b.txt
CONFLICT (content): Merge conflict in b.txt
Automatic merge failed; fix conflicts and then commit the result.

Inspect the file to see the conflict markers
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
<<<<<<< HEAD
bbbbb
=======
ccccc
>>>>>>> dev

Resolve the conflict manually, keeping one side or both
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

Delete the dev branch after merging
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 925c06c).
```
