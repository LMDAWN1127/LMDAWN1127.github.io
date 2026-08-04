---
title: "Dockerfile 中 COPY 与 ADD 的区别详解"
date: 2026-07-30T10:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "容器化", "DevOps"]
categories: ["容器技术"]
description: "COPY 和 ADD 都能复制文件，但行为差异很大。本文通过对比和示例讲清两者区别。"
summary: "COPY 和 ADD 都可以复制文件，但它们有本质区别。本文详解两者差异，助你写出更好的 Dockerfile。"
showToc: true
TocOpen: true
---

#### 1. 基本语法

两者语法几乎一样，但行为差异很大：

```dockerfile
# COPY - 纯粹的文件复制，不做任何额外处理
COPY [--chown=<user>:<group>] <src>... <dest>

# ADD - 支持自动解压和远程 URL，但行为不可预测
ADD [--chown=<user>:<group>] <src>... <dest>
```

#### 2. 自动解压压缩文件

***ADD*** 会自动解压本地压缩包，***COPY*** 不会：

```dockerfile
# ADD 自动解压 .tar.gz
ADD app.tar.gz /opt/app/
# 结果：/opt/app/ 下是解压后的内容

# COPY 只复制文件本身
COPY app.tar.gz /opt/app/
# 结果：/opt/app/app.tar.gz 是原始压缩包
```

支持的压缩格式：`.tar`、`.tar.gz`/`.tgz`、`.tar.bz2`、`.tar.xz`

> 如果你想复制压缩包本身而不解压，必须用 COPY。

#### 3. 远程 URL 下载

***ADD*** 可以直接从 URL 下载文件，***COPY*** 不支持：

```dockerfile
# ADD 可以下载远程文件（但不推荐）
ADD https://example.com/app.tar.gz /opt/

# COPY 不支持 URL
COPY https://example.com/app.tar.gz /opt/  # 报错！
```

> 推荐用 `RUN + curl` 替代 ADD 下载远程文件，因为 ADD 下载无法利用构建缓存、无法做错误处理、无法验证完整性。

```dockerfile
# 推荐：RUN + curl
RUN curl -fsSL -o /tmp/app.tar.gz https://example.com/app.tar.gz \
    && tar -xzf /tmp/app.tar.gz -C /opt/ \
    && rm /tmp/app.tar.gz
```

#### 4. 自动创建目录

两者都会自动创建不存在的中间目录：

```dockerfile
# 如果 /etc/myapp/config/ 不存在，会自动创建
COPY app.conf /etc/myapp/config/
ADD app.conf /etc/myapp/config/

# 不需要手动 mkdir
# RUN mkdir -p /etc/myapp/config   ← 多余
```

#### 5. 构建缓存行为

```dockerfile
# COPY - 严格匹配文件内容，内容变了才缓存失效
COPY config/app.conf /etc/app/

# ADD - 压缩文件内容相同时缓存仍然有效
ADD app.tar.gz /opt/app/
```

| 场景 | COPY | ADD |
|------|------|-----|
| 文件内容变化 | 缓存失效 | 缓存失效 |
| 文件元数据变化 | 缓存失效 | 缓存失效 |
| 压缩文件内容相同 | N/A | 缓存有效 |

#### 6. 功能对比

| 特性 | COPY | ADD |
|------|------|-----|
| 复制本地文件 | ✅ | ✅ |
| 复制目录 | ✅ | ✅ |
| 支持通配符 | ✅ | ✅ |
| 自动创建目录 | ✅ | ✅ |
| 自动解压压缩文件 | ❌ | ✅ |
| 支持远程 URL | ❌ | ✅ |
| 语义清晰度 | ✅ 高 | ❌ 低 |
| 推荐使用 | ✅ 首选 | ⚠️ 特定场景 |

#### 7. 使用场景

**COPY 适用于：**

```dockerfile
# 复制配置文件
COPY nginx.conf /etc/nginx/nginx.conf

# 复制应用代码
COPY src/ /app/src/
COPY package.json /app/

# 多阶段构建中复制二进制
COPY --from=builder /app/build/app /usr/local/bin/
```

**ADD 仅适用于需要自动解压的场景：**

```dockerfile
# 合理使用 ADD
ADD node-v18.17.0-linux-x64.tar.gz /usr/local/

# 普通文件不要用 ADD
ADD app.conf /etc/app/  # ← 用 COPY 代替
```

#### 8. 最佳实践

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

#### 9. 常见陷阱

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

#### 10. 选择决策

```
需要复制文件？
├── 本地压缩文件且需要解压？
│   └── 用 ADD
├── 本地普通文件？
│   └── 用 COPY
└── 远程文件？
    └── 用 RUN + curl
```
