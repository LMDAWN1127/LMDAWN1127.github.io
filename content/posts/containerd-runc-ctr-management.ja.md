---
title: "containerd コンテナランタイムの導入と runc/ctr による管理実践"
date: 2026-10-30T10:31:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "本実践ではまず docker02 ノードの Docker バイナリをアンインストールし、containerd 1.7.20 ランタイム（cri-containerd-cni の展開、systemd ユニットの設置、config.toml で SystemdCgroup を有効化し sandbox_image を置換）を導入、さらに runc 1.1.12 と ctr クライアントをインストールする。その後、ctr によるイメージのプルとタグ付け、コンテナの作成/起動/一時停止/再開/削除、名前空間管理、および docker01 の Harbor（HTTP、非 TLS）へのプッシュとプルの一連の操作を実演する。"
---

# containerd コンテナランタイムの導入と runc/ctr による管理実践

## 第1部 containerd コンテナ管理ツール

Docker のアンインストール

```bash
root@docker02:~# systemctl stop docker
root@docker02:~# rm -f /lib/systemd/system/docker.service /etc/systemd/system/docker.service
root@docker02:~# systemctl daemon-reload
root@docker02:~# rm -f /usr/bin/docker /usr/bin/dockerd /usr/bin/docker-init /usr/bin/docker-proxy /usr/bin/docker-compose
root@docker02:~# rm -f /usr/bin/containerd /usr/bin/ctr /usr/bin/runc
root@docker02:~# which docker dockerd containerd ctr runc
(空、すべてアンインストール済み)
```

Docker はバイナリ方式でインストールされており（`/dawn/softwares/docker/` へのシンボリックリンク）。アンインストールとはシンボリックリンクと systemd サービスを削除することです。元のバイナリは `/dawn/softwares/docker/` にバックアップとして残されます。

### 1. containerd のダウンロード

```bash
root@docker02:~# wget https://github.com/containerd/containerd/releases/download/v1.7.20/cri-containerd-cni-1.7.20-linux-amd64.tar.gz
root@docker02:~# ls -lh cri-containerd-cni-1.7.20-linux-amd64.tar.gz
-rw-r--r-- 1 root root 143M Jul 18 2024 cri-containerd-cni-1.7.20-linux-amd64.tar.gz
```

### 2. パッケージの展開

```bash
root@docker02:~# tar xf cri-containerd-cni-1.7.20-linux-amd64.tar.gz
```

### 3. containerd ランタイムファイルのホスト所定パスへのコピー

```bash
root@docker02:~# cp usr/local/bin/containerd /usr/local/bin/
root@docker02:~# cp usr/local/bin/containerd-shim /usr/local/bin/
root@docker02:~# cp usr/local/bin/containerd-shim-runc-v1 /usr/local/bin/
root@docker02:~# cp usr/local/bin/containerd-shim-runc-v2 /usr/local/bin/
root@docker02:~# cp usr/local/bin/ctr /usr/bin/
root@docker02:~# cp usr/local/bin/crictl /usr/bin/
root@docker02:~# containerd --version
containerd github.com/containerd/containerd v1.7.20 8fc6bcff51318944179630522a095cc9dbf9f353
```

### 4. containerd の systemd ユニットファイルのコピー

```bash
root@docker02:~# cp etc/systemd/system/containerd.service /usr/lib/systemd/system/
```

### 5. containerd 設定ファイルの生成と修正

```bash
root@docker02:~# mkdir -p /etc/containerd
root@docker02:~# containerd config default > /etc/containerd/config.toml
root@docker02:~# sed -ri 's#(SystemdCgroup = )false#\1true#' /etc/containerd/config.toml
root@docker02:~# sed -i 's#registry.k8s.io/pause:3.8#uhub.service.ucloud.cn/dawn/pause:3.8#' /etc/containerd/config.toml
root@docker02:~# grep SystemdCgroup /etc/containerd/config.toml
            SystemdCgroup = true
root@docker02:~# grep sandbox_image /etc/containerd/config.toml
    sandbox_image = "uhub.service.ucloud.cn/dawn/pause:3.8"
```

### 6. containerd サービスの起動

```bash
root@docker02:~# systemctl enable --now containerd
Created symlink /etc/systemd/system/multi-user.target.wants/containerd.service → /lib/systemd/system/containerd.service.
root@docker02:~# systemctl status containerd | head -4
● containerd.service - containerd container runtime
   Loaded: loaded (/lib/systemd/system/containerd.service; enabled; vendor preset: enabled)
   Active: active (running)
```

### 7. ctr クライアントツールのコピーとバージョン確認

```bash
root@docker02:~# ctr --version
ctr github.com/containerd/containerd v1.7.20
root@docker02:~# ctr version
Client:
  Version:  v1.7.20
  Revision: 8fc6bcff51318944179630522a095cc9dbf9f353
  Go version: go1.21.12
Server:
  Version:  v1.7.20
  Revision: 8fc6bcff51318944179630522a095cc9dbf9f353
  UUID: 732b5e18-1bb3-4792-a7ef-2e6687016e2e
```

---

## 第2部 runc のインストールと ctr ツールによる管理実践

### 1. runc のダウンロード

```bash
root@docker02:~# wget https://github.com/opencontainers/runc/releases/download/v1.1.12/runc.amd64
root@docker02:~# ls -lh runc.amd64
-rw-r--r-- 1 root root 11M Jan 23 2024 runc.amd64
```

### 2. runc を PATH に移動し実行権限を付与

```bash
root@docker02:~# mv runc.amd64 /usr/bin/runc
root@docker02:~# chmod +x /usr/bin/runc
root@docker02:~# runc --version
runc version 1.1.12
commit: v1.1.12-0-g51d5e946
spec: 1.0.2-dev
go: go1.20.13
libseccomp: 2.5.4
```

### 3. ctr の基本：イメージ管理

**3.1 イメージ一覧の表示（初期は空）**

```bash
root@docker02:~# ctr images ls
REF TYPE DIGEST SIZE PLATFORMS LABELS
```

**3.2 イメージのプル**

```bash
root@docker02:~# ctr images pull uhub.service.ucloud.cn/dawn/apps:v1
...
elapsed: 3.5 s  total: 8.9 Mi (2.5 MiB/s)
unpacking linux/amd64 sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c...
done: 585.870274ms

root@docker02:~# ctr images ls
REF                                                       TYPE                                                 DIGEST                                                                  SIZE    PLATFORMS   LABELS
uhub.service.ucloud.cn/dawn/apps:v1 application/vnd.docker.distribution.manifest.v2+json sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c 9.6 MiB linux/amd64 -
```

### 4. ctr 実践：コンテナ管理

**4.1 コンテナの作成と起動**

```bash
root@docker02:~# ctr containers create uhub.service.ucloud.cn/dawn/apps:v1 xiuxian
root@docker02:~# ctr containers ls
CONTAINER    IMAGE                                                        RUNTIME
xiuxian      uhub.service.ucloud.cn/dawn/apps:v1    io.containerd.runc.v2

root@docker02:~# ctr task start -d xiuxian
root@docker02:~# ctr task ls
TASK       PID      STATUS
xiuxian    64464    RUNNING
```

**4.2 コンテナに対応するホスト PID の確認**

```bash
root@docker02:~# ps -ef | grep 64464 | grep -v grep
root       64464   64444  0 09:47 ?  00:00:00 nginx: master process nginx -g daemon off;
systemd+   64502   64464  0 09:47 ?  00:00:00 nginx: worker process
systemd+   64503   64464  0 09:47 ?  00:00:00 nginx: worker process
```

**4.3 コンテナ内でのコマンド実行**

```bash
root@docker02:~# ctr task exec --exec-id 1 xiuxian ps -ef
PID   USER     TIME  COMMAND
    1 root      0:00 nginx: master process nginx -g daemon off;
   33 nginx     0:00 nginx: worker process
   34 nginx     0:00 nginx: worker process
   35 root      0:00 ps -ef
```

**4.4 コンテナの一時停止と再開**

```bash
root@docker02:~# ctr tasks pause xiuxian
root@docker02:~# ctr task ls
TASK       PID      STATUS
xiuxian    64464    PAUSED

root@docker02:~# ctr tasks resume xiuxian
root@docker02:~# ctr task ls
TASK       PID      STATUS
xiuxian    64464    RUNNING
```

**4.5 コンテナの停止と削除**

```bash
root@docker02:~# ctr task kill xiuxian
root@docker02:~# ctr task rm xiuxian
root@docker02:~# ctr containers rm xiuxian
root@docker02:~# ctr task ls
TASK    PID    STATUS
```

実行中のコンテナを削除するには、まず `ctr task kill`（または `ctr task rm -f`）でタスクを停止し、次に `ctr task rm` でタスクを、`ctr containers rm` でコンテナを削除する必要があります。順序を逆にすると `task must be stopped before deletion` と報告されます。

### 5. ctr の名前空間管理

```bash
root@docker02:~# ctr namespaces ls
NAME    LABELS
default

root@docker02:~# ctr ns create dawn-dawn
root@docker02:~# ctr ns ls
NAME      LABELS
dawn-dawn
default
```

名前空間を削除する前に、その中が空（イメージなし、コンテナなし）であることを確認する必要があります。そうでないと `must be empty` と報告されます。

### 6. ctr で Harbor からのイメージプッシュ／プル

**6.1 イメージへのタグ付けと docker01 Harbor へのプッシュ**

```bash
root@docker02:~# ctr images tag uhub.service.ucloud.cn/dawn/apps:v1 11.0.1.121/dawn-games/xiuxian:v1
root@docker02:~# ctr images push --platform linux/amd64 --plain-http -u admin:1 11.0.1.121/dawn-games/xiuxian:v1
manifest-sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c: done
config-sha256:f28fd43be4ad41fc768dcc3629f8479d1443df01ada10ac9a771314e4fdef599: done
elapsed: 0.8 s  total: 9.4 Ki (11.7 KiB/s)
```

**6.2 Harbor からのイメージプルによる検証**

```bash
root@docker02:~# ctr images rm 11.0.1.121/dawn-games/xiuxian:v1
root@docker02:~# ctr images pull --plain-http 11.0.1.121/dawn-games/xiuxian:v1
...
unpacking linux/amd64 sha256:3bee216f250cfd2dbda1744d6849e27118845b8f4d55dda3ca3c6c1227cc2e5c...
done: 6.182696ms
```

ctr で HTTP（非 TLS）レジストリに対してプッシュ／プルするには明示的に `--plain-http` フラグが必要で、認証は `-u admin:1` を使用します。ctr は Docker と異なり、ローカルに存在しないイメージを自動的にリモートからプルすることはありません。