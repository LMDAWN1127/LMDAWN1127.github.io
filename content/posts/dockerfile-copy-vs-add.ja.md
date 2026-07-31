---
title: "Dockerfile における COPY と ADD の違いを詳しく解説"
date: 2026-07-30T10:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "コンテナ化", "DevOps"]
categories: ["コンテナ技術"]
description: "COPY と ADD はどちらもファイルをコピーできますが、動作に大きな違いがあります。本記事では比較とサンプルを通じて両者の違いを明確に解説します。"
summary: "COPY と ADD はどちらもファイルをコピーできますが、本質的な違いがあります。本記事では両者の違いを詳しく解説し、より良い Dockerfile を書くための助けとします。"
showToc: true
TocOpen: true
---

#### 1. 基本構文

両者の構文はほぼ同じですが、動作には大きな違いがあります：

```dockerfile
# COPY - 纯粹的文件复制，不做任何额外处理
COPY [--chown=<user>:<group>] <src>... <dest>

# ADD - 支持自动解压和远程 URL，但行为不可预测
ADD [--chown=<user>:<group>] <src>... <dest>
```

#### 2. 圧縮ファイルの自動解凍

***ADD*** はローカルの圧縮ファイルを自動的に解凍しますが、***COPY*** は解凍しません：

```dockerfile
# ADD 自动解压 .tar.gz
ADD app.tar.gz /opt/app/
# 结果：/opt/app/ 下是解压后的内容

# COPY 只复制文件本身
COPY app.tar.gz /opt/app/
# 结果：/opt/app/app.tar.gz 是原始压缩包
```

対応する圧縮形式：`.tar`、`.tar.gz`/`.tgz`、`.tar.bz2`、`.tar.xz`

> 圧縮ファイル自体を解凍せずにコピーしたい場合は、COPY を使う必要があります。

#### 3. リモート URL のダウンロード

***ADD*** は URL から直接ファイルをダウンロードできますが、***COPY*** はサポートしていません：

```dockerfile
# ADD 可以下载远程文件（但不推荐）
ADD https://example.com/app.tar.gz /opt/

# COPY 不支持 URL
COPY https://example.com/app.tar.gz /opt/  # 报错！
```

> リモートファイルのダウンロードには `RUN + curl` で ADD を代替することを推奨します。ADD によるダウンロードはビルドキャッシュを利用できず、エラーハンドリングもなく、整合性の検証もできないためです。

```dockerfile
# 推荐：RUN + curl
RUN curl -fsSL -o /tmp/app.tar.gz https://example.com/app.tar.gz \
    && tar -xzf /tmp/app.tar.gz -C /opt/ \
    && rm /tmp/app.tar.gz
```

#### 4. ディレクトリの自動作成

どちらも存在しない中間ディレクトリを自動的に作成します：

```dockerfile
# 如果 /etc/myapp/config/ 不存在，会自动创建
COPY app.conf /etc/myapp/config/
ADD app.conf /etc/myapp/config/

# 不需要手动 mkdir
# RUN mkdir -p /etc/myapp/config   ← 多余
```

#### 5. ビルドキャッシュの動作

```dockerfile
# COPY - 严格匹配文件内容，内容变了才缓存失效
COPY config/app.conf /etc/app/

# ADD - 压缩文件内容相同时缓存仍然有效
ADD app.tar.gz /opt/app/
```

| シナリオ | COPY | ADD |
|------|------|-----|
| ファイル内容の変化 | キャッシュ無効 | キャッシュ無効 |
| ファイルメタデータの変化 | キャッシュ無効 | キャッシュ無効 |
| 圧縮ファイルの内容が同じ | N/A | キャッシュ有効 |

#### 6. 機能比較

| 特性 | COPY | ADD |
|------|------|-----|
| ローカルファイルのコピー | ✅ | ✅ |
| ディレクトリのコピー | ✅ | ✅ |
| ワイルドカードのサポート | ✅ | ✅ |
| ディレクトリの自動作成 | ✅ | ✅ |
| 圧縮ファイルの自動解凍 | ❌ | ✅ |
| リモート URL のサポート | ❌ | ✅ |
| 意味の明確さ | ✅ 高 | ❌ 低 |
| 推奨使用 | ✅ 第一選択 | ⚠️ 特定シナリオ |

#### 7. 使用シナリオ

**COPY が適しているケース：**

```dockerfile
# 复制配置文件
COPY nginx.conf /etc/nginx/nginx.conf

# 复制应用代码
COPY src/ /app/src/
COPY package.json /app/

# 多阶段构建中复制二进制
COPY --from=builder /app/build/app /usr/local/bin/
```

**ADD は自動解凍が必要なシナリオのみに適しています：**

```dockerfile
# 合理使用 ADD
ADD node-v18.17.0-linux-x64.tar.gz /usr/local/

# 普通文件不要用 ADD
ADD app.conf /etc/app/  # ← 用 COPY 代替
```

#### 8. ベストプラクティス

```dockerfile
# 规则 1：默认用 COPY
COPY requirements.txt /app/          # ✅
ADD requirements.txt /app/           # ❌ 没必要

# 规则 2：只在需要解压时用 ADD
ADD node-v18.tar.gz /usr/local/      # ✅ 需要解压

# 规则 3：远程文件用 RUN + curl
RUN curl -fsSL -o /tmp/app.tar.gz https://example.com/app.tar.gz \
    && tar -xzf /tmp/app.tar.gz -C /opt/ \
    && rm /tmp/app.tar.gz            # ✅
ADD https://example.com/app.tar.gz /opt/  # ❌

# 规则 4：用 .dockerignore 减少上下文
# .dockerignore
# .git
# node_modules
# *.md
# .env

# 规则 5：合理安排 COPY 顺序利用缓存
COPY package.json package-lock.json ./  # 先复制依赖（变化少）
RUN npm ci --production
COPY . .                                # 再复制代码（变化多）
```

#### 9. よくある落とし穴

```dockerfile
# 陷阱 1：意外的自动解压
ADD app.tar.gz /opt/app/
# 你以为复制了文件，实际解压成了目录

# 陷阱 2：远程文件无法缓存
ADD https://github.com/user/repo/releases/download/v1.0/app.tar.gz /tmp/
# 每次构建都重新下载

# 陷阱 3：权限问题
COPY --chown=app:app src/ /app/src/    # 指定所有者
```

#### 10. 選択の判断基準

```
需要复制文件？
├── 本地压缩文件且需要解压？
│   └── 用 ADD
├── 本地普通文件？
│   └── 用 COPY
└── 远程文件？
    └── 用 RUN + curl
```
