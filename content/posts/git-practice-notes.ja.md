---
title: "Git 実践ノート：インストール・基本コマンド・ブランチ管理"
date: 2026-10-01T01:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["DevOps", "Git", "バージョン管理"]
summary: "インストールから基本コマンド、ブランチ運用、コンフリクト解決までを網羅した Git 実践メモ。"
showToc: true
---

## 01. Git のインストールとリポジトリの初期化

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

## 02. Git コマンド

```bash
1. リポジトリの状態を確認する（常にクリーンに保つ）
[root@gitlab dawn]#git status
# On branch master
#
# Initial commit
#
nothing to commit (create/copy files and use "git add" to track)

2. 通常のファイルを作成する
[root@gitlab dawn]#touch a.txt

3. 作業ツリーの内容をステージングする
[root@gitlab dawn]#git add a.txt
# git add . は作業ツリーの全内容をステージング領域に追加する
[root@gitlab dawn]#git add .

4. ステージング領域の内容を削除する
[root@gitlab dawn]#git rm --cached a.txt
rm 'a.txt'

5. ステージングしてローカルリポジトリにコミットする
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

# git commit -m にメッセージを付けてローカルリポジトリにコミットする
[root@gitlab dawn]#git commit -m "create a.txt"
[master (root-commit) b65d348] create a.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 a.txt

状態を確認:
[root@gitlab dawn]#git status
# On branch master
nothing to commit, working directory clean

ファイル作成       touch a.txt
ステージング       git add a.txt
ローカルリポジトリにコミット   git commit -m "xxx"

2. git での削除

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

注意: 作業ツリーのファイルをステージングした後に取り消したい場合は、ステージング領域から削除する
[root@gitlab dawn]#touch c.txt
[root@gitlab dawn]#git add c.txt
[root@gitlab dawn]#git rm --cached c.txt
rm 'c.txt'

3. 作業ツリーの内容を復元する
[root@gitlab dawn]#git reset HEAD b.txt
[root@gitlab dawn]#git checkout -- b.txt

4. git での差分確認
git diff  作業ツリーとステージング領域の差分を比較する
[root@gitlab dawn]#git diff
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

git diff --cached ステージング領域とローカルリポジトリの差分を比較する
[root@gitlab dawn]#git diff --cached
diff --git a/b.txt b/b.txt
index e69de29..ccc3e7b 100644
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1 @@
+aaaaa

5. ファイル名の変更
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

6. 任意のスナップショットにロールバックする
すべてのスナップショットを表示:
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

git reset --hard でロールバックする
[root@gitlab dawn]#git reset --hard b65d348
HEAD is now at b65d348 create a.txt
[root@gitlab dawn]#ll
total 0
-rw-r--r-- 1 root root 0 Jun 11 12:12 a.txt

7. 過去のすべての操作履歴を確認する:
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

Git ブランチ
1. ブランチ一覧を表示する（* は現在のブランチ）
[root@gitlab dawn]#git branch
* master
2. ブランチを作成する
[root@gitlab dawn]#git branch dev
[root@gitlab dawn]#git branch
  dev
* master

3. dev ブランチに切り替える
[root@gitlab dawn]#git checkout dev
Switched to branch 'dev'
[root@gitlab dawn]#git branch
* dev
  master

4. ブランチ上でファイルを作成し、ローカルリポジトリにコミットする
[root@gitlab dawn]#touch aa.txt
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "newfile aa.txt"
[dev 2694c7f] newfile aa.txt
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

5. ブランチをマージする
まず master ブランチに戻る
[root@gitlab dawn]#git checkout master
Switched to branch 'master'
[root@gitlab dawn]#git branch
  dev
* master
dev ブランチを master にマージする
[root@gitlab dawn]#git merge dev
Updating ae6585c..2694c7f
Fast-forward
 aa.txt | 0
 1 file changed, 0 insertions(+), 0 deletions(-)
 create mode 100644 aa.txt

6. 機能を作り終えたらすぐにブランチを削除する（リモートブランチより遅れるため）
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 2694c7f).
[root@gitlab dawn]#git branch
* master

7. コンフリクトの解決
----------------------------------
ファイルの内容を変更しても必ずしもマージを妨げるわけではない
master ブランチのファイルを編集して bbbbb を追加する
[root@gitlab dawn]#vim b.txt 
aaaaa
bbbbb

1 つのコマンドで dev ブランチの作成と切り替えを同時に行える
[root@gitlab dawn]#git checkout -b dev
Switched to a new branch 'dev'
[root@gitlab dawn]#
[root@gitlab dawn]#
[root@gitlab dawn]#git branch
* dev
  master

b.txt の内容を編集する
[root@gitlab dawn]#vim b.txt 
aaaaa
bbccc

ローカルリポジトリにコミットする
[root@gitlab dawn]#git add .
[root@gitlab dawn]#git commit -m "modifle bbbccc"

master ブランチに戻って dev ブランチをマージする
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

コンフリクトが発生するケース
dev ブランチを作成する
[root@gitlab dawn]#git branch dev

master ブランチで b.txt の 3 行目を編集する
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
bbbbb
[root@gitlab dawn]#git commit -am "modifile b.txt bbbbb"
[master ae4ab87] modifile b.txt bbbbb
 1 file changed, 1 insertion(+)

dev ブランチに切り替えて b.txt の 3 行目を編集する
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
ccccc

ローカルリポジトリにコミットする
[root@gitlab dawn]#git commit -am "modifile b.txt ccccc"
[dev 925c06c] modifile b.txt ccccc
 1 file changed, 1 insertion(+)

master ブランチに切り替えてブランチをマージする
[root@gitlab dawn]#git checkout master
Switched to branch 'master'

[root@gitlab dawn]#git branch
  dev
* master
[root@gitlab dawn]#git merge dev
Auto-merging b.txt
CONFLICT (content): Merge conflict in b.txt
Automatic merge failed; fix conflicts and then commit the result.

ファイルを確認すると競合が表示される
[root@gitlab dawn]#cat b.txt
aaaaa
iiiii
<<<<<<< HEAD
bbbbb
=======
ccccc
>>>>>>> dev

手動で競合を解決し、片方だけ、あるいは両方を残す
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

マージ後に dev ブランチを削除する
[root@gitlab dawn]#git branch -d dev
Deleted branch dev (was 925c06c).
```
