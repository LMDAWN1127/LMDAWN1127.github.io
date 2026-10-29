---
title: "Docker 実戦：バイナリでの導入とワンクリックスクリプト導入"
date: 2026-10-23T12:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker を 3 つの方法で導入します。apt パッケージマネージャー、公式の静的バイナリ (ダウンロード/展開/コピー/起動)、および自动化スクリプト (導入とアンインストール)。バイナリ導入のきれいな削除方法も解説します。"
---

# Docker 実戦：バイナリでの導入とワンクリックスクリプト導入

## 1. パッケージマネージャーで Docker をインストール

Ubuntu を例に、apt パッケージマネージャーでインストールするのが最も簡単で、1 コマンドで完了します:

```bash
root@docker01:~# apt update && apt install -y docker.io
```

この方法でインストールされるバージョンは Ubuntu のリポジトリで決まり、クイック検証に適しています。最新版や特定のバージョンをインストールするには、Docker 公式ドキュメントに従ってリポジトリを追加して docker-ce をインストールするか、下記のバイナリ導入方式を使います。

  参考リンク:

  https://docs.docker.com/engine/install/ubuntu/

## 2. バイナリで Docker 環境を導入

1. パッケージをダウンロード

```bash
root@docker01:~# wget https://download.docker.com/linux/static/stable/x86_64/docker-27.0.3.tgz
```

2. パッケージを展開

```bash
root@docker01:~# tar xf docker-27.0.3.tgz
```

3. PATH にコピー

```bash
root@docker01:~# cp docker/* /usr/bin/
```

4. Docker を起動

```bash
root@docker01:~# dockerd
```

5. Docker のバージョンを確認

```bash
root@docker01:~# docker version
Client:
 Version:           27.0.3
 API version:       1.46
 Go version:        go1.21.11
 Git commit:        7d4bcd8
 Built:             Sat Jun 29 00:01:25 2024
 OS/Arch:           linux/amd64
 Context:           default

Server: Docker Engine - Community
 Engine:
  Version:          27.0.3
  API version:      1.46 (minimum version 1.24)
  Go version:       go1.21.11
  Git commit:       662f78c
  Built:            Sat Jun 29 00:03:05 2024
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v1.7.18
  GitCommit:        ae71819c4f5e67bb4d5ae76a6b735f29cc25774e
 runc:
  Version:          1.1.13
  GitCommit:        v1.1.13-0-g58aa920
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

## 3. バイナリの Docker 環境をアンインストール

> 注意: 以下のアンインストールコマンドは、カレントディレクトリ配下の docker フォルダを巡回して /usr/bin 内の関連ファイルを削除します。実行前に、docker-27.0.3.tgz を展開したときに生成された docker ディレクトリに入ってください。

1. Docker サービスを停止

```bash
root@docker01:~# pkill dockerd
```

  サービス停止後、バージョンを再度確認すると次のメッセージが表示されます:

  Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?

2. Docker 関連のプログラムを削除

```bash
root@docker01:~# for i in `ls docker`;do rm -f /usr/bin/$i ;done
```

3. 検証

```bash
root@docker01:~# docker
-bash: /usr/bin/docker: No such file or directory
```

## 4. スクリプトで Docker 環境を導入またはアンインストール

ディレクトリを作成

```bash
root@docker01:~# mkdir -pv /dawn/softwares
```

パッケージをダウンロード

Alist ファイルサーバー (https://www.dawncloud.top/dawn) から自動化インストールパッケージ dawn-autoinstall-docker-docker-compose.tar.gz (約 158MB) をダウンロードします。以下の図のようになります:

![image-20261023111049752](/images/docker-binary-script-install-image-20261023111049752.png)

パッケージを展開

```bash
root@docker01:~# cd /dawn/softwares/
root@docker01:/dawn/softwares# tar xf dawn-autoinstall-docker-docker-compose.tar.gz
```

Docker をインストール

```bash
root@docker01:/dawn/softwares# ./install-docker.sh i
```

Docker のバージョンを確認

```bash
root@docker01:/dawn/softwares# docker version
Client:
 Version:           27.0.3
 API version:       1.46
 Go version:        go1.21.11
 Git commit:        7d4bcd8
 Built:             Sat Jun 29 00:01:25 2024
 OS/Arch:           linux/amd64
 Context:           default

Server: Docker Engine - Community
 Engine:
  Version:          27.0.3
  API version:      1.46 (minimum version 1.24)
  Go version:       go1.21.11
  Git commit:       662f78c
  Built:            Sat Jun 29 00:03:05 2024
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v1.7.18
  GitCommit:        ae71819c4f5e67bb4d5ae76a6b735f29cc25774e
 runc:
  Version:          1.1.13
  GitCommit:        v1.1.13-0-g58aa920
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

Docker をアンインストール

```bash
root@docker01:/dawn/softwares# ./install-docker.sh r
```
