---
title: "K8S と Jenkins による CI/CD 継続的インテグレーション実践：Harbor 連携・パラメータ付きビルド・ワンクリックデプロイとロールバック"
date: 2026-11-01T15:58:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Jenkins", "CI/CD", "Harbor"]
showToc: true
summary: "Kubernetes と Jenkins を用いたエンドツーエンド CI/CD パイプラインの完全実践ガイド。Jenkins のオフライン導入とプラグイン一括適用、Docker とプライベート Harbor 証明書連携、kubectl によるクラスタ接続、Freestyle ジョブ、文字列・選択・Git タグによるパラメータ付きビルド、Deployment ローリングアップデートおよびワンクリックロールバックを完全網羅。"
---

# K8S と Jenkins による CI/CD 継続的インテグレーション実践：Harbor 連携・パラメータ付きビルド・ワンクリックデプロイとロールバック


## 一、Jenkins 環境の構築

### 1. タイムゾーンの設定

```bash
[root@jenkins ~]# ln -svf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
'/etc/localtime' -> '/usr/share/zoneinfo/Asia/Shanghai'
```

### 2. JDK 17 のインストール

```bash
[root@jenkins ~]# mkdir -pv /dawn/softwares
[root@jenkins ~]# tar xf /dawn/softwares/jdk-17_linux-x64_bin.tar.gz -C /dawn/softwares/
[root@jenkins ~]# cat /etc/profile.d/jdk.sh
export JAVA_HOME=/dawn/softwares/jdk-17.0.8
export PATH=/dawn/softwares/jdk-17.0.8/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[root@jenkins ~]# source /etc/profile.d/jdk.sh
[root@jenkins ~]# java --version
java 17.0.8 2023-07-18 LTS
Java(TM) SE Runtime Environment (build 17.0.8+9-LTS-211)
Java HotSpot(TM) 64-Bit Server VM (build 17.0.8+9-LTS-211, mixed mode, sharing)
```

### 2. fontconfig および依存関係のインストール

```bash
[root@jenkins ~]# apt-get update
[root@jenkins ~]# apt-get -y install fontconfig
```

### 3. Jenkins のインストール（オフライン deb）

```bash
[root@jenkins ~]# dpkg -i /dawn/softwares/jenkins_2.426.3_all.deb
```

### 4. Jenkins 起動スクリプトの修正

```bash
[root@jenkins ~]# vim /lib/systemd/system/jenkins.service
```

変更内容：

`User=root`（変更前: jenkins）

`Group=root`（変更前: jenkins）

`Environment="JENKINS_HOME=/var/lib/jenkins"` の次の行に `Environment="JAVA_HOME=/dawn/softwares/jdk-17.0.8"` を追加

```bash
[root@jenkins ~]# systemctl daemon-reload
[root@jenkins ~]# systemctl restart jenkins
[root@jenkins ~]# systemctl is-active jenkins
active
```

### 5. 初期管理者パスワードの取得

```bash
[root@jenkins ~]# cat /var/lib/jenkins/secrets/initialAdminPassword
20286530dae640598368e97991038d70
```

### 6. プラグインのインストール（オフラインパッケージ一括インポート）

```bash
[root@jenkins ~]# mkdir -p /var/lib/jenkins/plugins
[root@jenkins ~]# tar xf /dawn/softwares/dawn-jenkins211-plugins.tar.gz -C /var/lib/jenkins/plugins/
[root@jenkins ~]# ls /var/lib/jenkins/plugins/ | wc -l
148
[root@jenkins ~]# systemctl restart jenkins
```

148 個のプラグインを一括インポート（Git、Pipeline、Webhook、Ansible、Email、DingTalk、Git Parameter などを含む）。個別インストールの手間を省きます。

### 7. ミラーサイト加速の設定と検索エンジン URL の変更

```bash
[root@jenkins ~]# sed -i.bak 's#updates.jenkins.io/download#mirror.tuna.tsinghua.edu.cn/jenkins#g' /var/lib/jenkins/updates/default.json
[root@jenkins ~]# sed -i 's#www.google.com#www.baidu.com#g' /var/lib/jenkins/updates/default.json
```

アップデートサイト URL：`https://mirror.tuna.tsinghua.edu.cn/jenkins/updates/update-center.json`

### 8. Jenkins WebUI へのアクセス

ブラウザで `http://11.0.1.211:8080` を開き、初期パスワードでログインして初期設定を完了します

![image-20261101124229979](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101124229979.png)

![image-20261101124339269](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101124339269.png)

![image-20261101124859837](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101124859837.png)

![image-20261101124913764](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101124913764.png)

![image-20261101125034345](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101125034345.png)

![image-20261101130525508](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101130525508.png)

## 二、Jenkins ノードへの Docker インストールと Harbor 連携

### 1. Docker のインストール（バイナリオフラインパッケージ）

```bash
[root@jenkins ~]# tar xf dawn-docker-compose-binary-install.tar.gz
[root@jenkins ~]# chmod +x install-docker.sh
[root@jenkins ~]# ./install-docker.sh install
Docker Compose version v2.23.0
安装成功...
```

### 2. Harbor 名前解決レコードの追加

```bash
[root@jenkins ~]# echo '11.0.1.250 harbor' >> /etc/hosts
```

### 3. Harbor 自作クライアント証明書のコピー

```bash
[root@jenkins ~]# apt-get install -y sshpass
[root@jenkins ~]# mkdir -p /etc/docker/certs.d/harbor
[root@jenkins ~]# sshpass -p '000000' scp -o StrictHostKeyChecking=no root@11.0.1.250:/dawn/softwares/harbor/certs/docker-client/* /etc/docker/certs.d/harbor/
[root@jenkins ~]# ll /etc/docker/certs.d/harbor/
total 20
-rw-r--r-- 1 root root 2037 Oct 31 21:01 ca.crt
-rw-r--r-- 1 root root 2102 Oct 31 21:01 harbor.cert
-rw------- 1 root root 3272 Oct 31 21:01 harbor.key
```

Docker 再起動後に有効化：

```bash
[root@jenkins ~]# systemctl restart docker
[root@jenkins ~]# ln -sf /etc/docker/certs.d/harbor /etc/docker/certs.d/harbor:443
```

### 4. Harbor へのログイン

```bash
[root@jenkins ~]# docker login harbor:443 -u admin -p Harbor12345
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded
```

### 5. Harbor プロジェクトの作成

![image-20261101133716003](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101133716003.png)

## 三、Jenkins ノードへの kubectl インストールと K8S 接続

### 1. kubectl のインストール

```bash
[root@jenkins ~]# mv kubectl-1.23.17 /usr/local/sbin/kubectl
[root@jenkins ~]# chmod +x /usr/local/sbin/kubectl
[root@jenkins ~]# kubectl version --client
Client Version: version.Info{Major:"1", Minor:"23", GitVersion:"v1.23.17", ...}
```

### 2. K8S master からの kubeconfig コピー

```bash
[root@jenkins ~]# mkdir -pv ~/.kube/
[root@jenkins ~]# sshpass -p '000000' scp -o StrictHostKeyChecking=no 11.0.1.231:/root/.kube/config ~/.kube/
[root@jenkins ~]# kubectl get nodes
NAME       STATUS   ROLES                  AGE   VERSION
master     Ready    control-plane,master   32h   v1.23.17
worker01   Ready    <none>                 32h   v1.23.17
worker02   Ready    <none>                 32h   v1.23.17
```

3 つのノードがすべて Ready となり、Jenkins から K8S を直接操作可能になりました

## 四、開発者によるコード作成とプッシュのシミュレーション

Jenkins 本体のベア git リポジトリを使用：`/dawn/repos/yiliao-dawn.git`

### 1. プロジェクトソースコードの解凍

```bash
[root@jenkins ~]# unzip dawn-yiliao.zip -d dawn-yiliao-src/
[root@jenkins ~]# cd dawn-yiliao-src
[root@jenkins dawn-yiliao-src]# ll
total 224
drwxr-xr-x 5 root root 4096 Aug  2 16:22 ./
-rw-r--r-- 1 root root 16458 Jun 13  2019 about.html
-rw-r--r-- 1 root root 20149 Jun 13  2019 album.html
-rw-r--r-- 1 root root 29627 Jun 29  2019 index.html
...
drwxr-xr-x 2 root root 4096 Sep 19  2022 css/
drwxr-xr-x 5 root root 4096 Sep 19  2022 images/
drwxr-xr-x 2 root root 4096 Sep 19  2022 js/
```

### 2. Dockerfile の作成

```bash
[root@jenkins dawn-yiliao-src]# cat Dockerfile
FROM harbor:443/dawn/apps:v1

MAINTAINER dawn

LABEL auther=dawn \
      school=czu \
      class=computer01

EXPOSE 80

WORKDIR /usr/share/nginx/html/

ADD . /usr/share/nginx/html/
```

### 3. Git の初期化とプッシュ

```bash
[root@jenkins dawn-yiliao-src]# git config --global user.name "jenkins"
[root@jenkins dawn-yiliao-src]# git config --global user.email "admin@dawn.com"
[root@jenkins dawn-yiliao-src]# git init
[root@jenkins dawn-yiliao-src]# git add .
[root@jenkins dawn-yiliao-src]# git commit -m 'init yiliao v1'
[root@jenkins dawn-yiliao-src]# mkdir -p /dawn/repos
[root@jenkins dawn-yiliao-src]# git clone --bare . /dawn/repos/yiliao-dawn.git
```

## 五、K8S 上での医療プロジェクトのデプロイ

```bash
[root@jenkins ~]# kubectl create namespace yiliao
namespace/yiliao created

[root@jenkins ~]# kubectl create deploy deploy-yiliao --image=harbor:443/dawn-jenkins/yiliao:v1 --replicas=3 -n yiliao
deployment.apps/deploy-yiliao created

[root@jenkins ~]# kubectl expose deploy deploy-yiliao --port=80 --target-port=80 --type=NodePort --name=yiliao-svc -n yiliao \
>   --overrides='{"spec":{"ports":[{"port":80,"targetPort":80,"nodePort":30080}]}}'
service/yiliao-svc exposed

[root@jenkins ~]# kubectl rollout status deploy deploy-yiliao -n yiliao --timeout=60s
deployment "deploy-yiliao" successfully rolled out

[root@jenkins ~]# kubectl get pods,svc -n yiliao -o wide
NAME                                READY   STATUS    RESTARTS   AGE    IP            NODE
pod/deploy-yiliao-9968fc7c8-4mz5t   1/1     Running   0          5m3s   10.100.1.92   worker01
pod/deploy-yiliao-9968fc7c8-92rxw   1/1     Running   0          5m3s   10.100.2.93   worker02
pod/deploy-yiliao-9968fc7c8-lgnf9   1/1     Running   0          5m3s   10.100.1.91   worker01

NAME                 TYPE       CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
service/yiliao-svc   NodePort   10.200.113.198   <none>        80:30080/TCP   0s
```

**アクセス確認テスト**

```bash
[root@jenkins ~]# curl -s http://11.0.1.233:30080 | grep '<title>'
    <title>某某医疗器械有限公司</title>
```

![image-20261031213245460](/images/k8s-jenkins-cicd-pipeline-practice/image-20261031213245460.png)

## 六、Jenkins によるイメージビルドと Harbor へのプッシュ

### 1. 手動ビルドテスト

```bash
[root@jenkins dawn-yiliao-src]# docker build -t harbor:443/dawn-jenkins/yiliao:v1 .
Successfully built 9295379ea4af
Successfully tagged harbor:443/dawn-jenkins/yiliao:v1

[root@jenkins dawn-yiliao-src]# docker push harbor:443/dawn-jenkins/yiliao:v1
v1: digest: sha256:ec4de8a336e1dd2cafc89b717b4223576a3549b01fa8094375f4826b47fb4628

[root@jenkins dawn-yiliao-src]# docker images | grep yiliao
harbor:443/dawn-jenkins/yiliao   v1    9295379ea4af   ...   23.2MB
```

## 七、Jenkins による K8S アプリケーションのワンクリック更新（完全な CI/CD フロー）

### 1. Jenkins ジョブの作成

ジョブ名 `dawn-yiliao-cicd`（フリースタイルプロジェクト）、Shell ビルド手順：

```bash
cd /root/dawn-yiliao-src && \
docker image build -t harbor:443/dawn-jenkins/yiliao:v2 . && \
docker push harbor:443/dawn-jenkins/yiliao:v2 && \
kubectl -n yiliao set image deploy deploy-yiliao yiliao=harbor:443/dawn-jenkins/yiliao:v2
```

![image-20261101131513057](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101131513057.png)

### 2. コード変更のシミュレーション（v2）

`index.html` のタイトルを修正し、v2 イメージをビルドして K8S を更新：

```bash
[root@jenkins dawn-yiliao-src]# sed -i 's|<title>.*</title>|<title>某某医疗器械有限公司 v2</title>|' index.html
[root@jenkins dawn-yiliao-src]# git add . && git commit -m 'v2: update title'
[root@jenkins dawn-yiliao-src]# git push /dawn/repos/yiliao-dawn.git master
[root@jenkins dawn-yiliao-src]# docker build -t harbor:443/dawn-jenkins/yiliao:v2 .
Successfully built f52deb20e604
Successfully tagged harbor:443/dawn-jenkins/yiliao:v2

[root@jenkins dawn-yiliao-src]# docker push harbor:443/dawn-jenkins/yiliao:v2
v2: digest: sha256:c408f20094f32717fd915e6e3c1cf52ccebe8db32e4d88a8319a781e3696da7b

[root@jenkins dawn-yiliao-src]# kubectl -n yiliao set image deploy deploy-yiliao yiliao=harbor:443/dawn-jenkins/yiliao:v2
deployment.apps/deploy-yiliao image updated

[root@jenkins dawn-yiliao-src]# kubectl rollout status deploy deploy-yiliao -n yiliao --timeout=60s
Waiting for deployment "deploy-yiliao" rollout to finish:
  0 out of 3 new replicas have been updated...
  1 out of 3 new replicas have been updated...
  2 out of 3 new replicas have been updated...
  ...1 old replicas are pending termination...
deployment "deploy-yiliao" successfully rolled out
```

### 3. 更新の検証

```bash
[root@jenkins ~]# curl -s http://11.0.1.233:30080 | grep '<title>'
    <title>某某医疗器械有限公司 v2</title>
```

![image-20261031213345524](/images/k8s-jenkins-cicd-pipeline-practice/image-20261031213345524.png)

コード修正 → docker build → push → kubectl ローリングアップデート → ページ反映確認

## 八、Jenkins のカスタム文字列パラメータによるバージョンビルド

Jenkins ジョブに「文字列パラメータ」変数 `version` を追加し、スクリプトを以下に変更：

```bash
/root/update-version.sh ${version} && cd /root/dawn-yiliao-src && docker image build -t harbor:443/dawn-jenkins/yiliao:${version} . && docker push harbor:443/dawn-jenkins/yiliao:${version} && kubectl -n yiliao set image deploy deploy-yiliao yiliao=harbor:443/dawn-jenkins/yiliao:${version}
```

![image-20261101140126666](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101140126666.png)

![image-20261101140343863](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101140343863.png)

![image-20261101143058811](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101143058811.png)

![image-20261101143126144](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101143126144.png)

## 九、Jenkins のカスタム選択パラメータによるバージョンビルド

ジョブに「選択パラメータ」変数 `tag`（`v1`, `v2`, `v3` などの選択肢）を追加。スクリプトはパラメータ形式に対応。

```bash
/root/update-version.sh ${tag} && cd /root/dawn-yiliao-src && docker image build -t harbor:443/dawn-jenkins/yiliao:${tag} . && docker push harbor:443/dawn-jenkins/yiliao:${tag} && kubectl -n yiliao set image deploy deploy-yiliao yiliao=harbor:443/dawn-jenkins/yiliao:${tag}
```

![image-20261101143226628](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101143226628.png)

![image-20261101143301448](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101143301448.png)

![image-20261101145629765](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101145629765.png)

![image-20261101145647916](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101145647916.png)

## 十、Jenkins の Git パラメータに基づくビルド

「Git Parameter」変数 `release`（リビジョン/タグタイプ）を追加し、tag ごとのビルドを実現。

![image-20261101153329059](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101153329059.png)

![image-20261101153443152](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101153443152.png)

![image-20261101153345999](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101153345999.png)

## 十一、Jenkins によるロールバックの実装

Jenkins 自体は直接ロールバックを実行しません。ロールバックは K8S Deployment の機能です。ジョブスクリプトから呼び出すことができます：

```bash
kubectl rollout undo deploy deploy-yiliao -n yiliao
```

または Jenkins で別途「ロールバック」ジョブを作成し、`kubectl rollout undo` を利用してワンクリックロールバックを実現します

![image-20261101153739385](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101153739385.png)

![image-20261101153815674](/images/k8s-jenkins-cicd-pipeline-practice/image-20261101153815674.png)