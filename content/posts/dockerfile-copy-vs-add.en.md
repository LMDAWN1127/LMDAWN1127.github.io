---
title: "COPY vs ADD in Dockerfile: A Detailed Comparison"
date: 2026-07-30T10:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "Containerization", "DevOps"]
categories: ["Container Tech"]
description: "COPY and ADD can both copy files, but their behaviors differ greatly. This article explains the difference through side-by-side comparisons and examples."
summary: "Both COPY and ADD can copy files, but they differ in fundamental ways. This article breaks down the differences and helps you write better Dockerfiles."
showToc: true
TocOpen: true
---

#### 1. Basic Syntax

The syntax is almost identical, but the behavior is very different:

```dockerfile
# COPY - pure file copy, no extra processing
COPY [--chown=<user>:<group>] <src>... <dest>

# ADD - supports auto-extraction and remote URLs, but with unpredictable behavior
ADD [--chown=<user>:<group>] <src>... <dest>
```

#### 2. Auto-Extracting Archives

***ADD*** automatically extracts local archives, while ***COPY*** does not:

```dockerfile
# ADD auto-extracts .tar.gz
ADD app.tar.gz /opt/app/
# Result: contents are extracted into /opt/app/

# COPY only copies the file itself
COPY app.tar.gz /opt/app/
# Result: /opt/app/app.tar.gz remains an archive
```

Supported archive formats: `.tar`, `.tar.gz` / `.tgz`, `.tar.bz2`, `.tar.xz`

> If you want to copy an archive without extracting it, you must use COPY.

#### 3. Remote URL Downloads

***ADD*** can download files directly from a URL; ***COPY*** does not:

```dockerfile
# ADD can fetch a remote file (not recommended)
ADD https://example.com/app.tar.gz /opt/

# COPY does not support URLs
COPY https://example.com/app.tar.gz /opt/  # Error!
```

> Prefer `RUN + curl` over ADD for remote downloads: ADD downloads don't benefit from build cache, can't handle errors, and don't verify integrity.

```dockerfile
# Recommended: RUN + curl
RUN curl -fsSL -o /tmp/app.tar.gz https://example.com/app.tar.gz \
    && tar -xzf /tmp/app.tar.gz -C /opt/ \
    && rm /tmp/app.tar.gz
```

#### 4. Auto-Creating Directories

Both automatically create missing intermediate directories:

```dockerfile
# If /etc/myapp/config/ doesn't exist, it will be created automatically
COPY app.conf /etc/myapp/config/
ADD app.conf /etc/myapp/config/

# No need for manual mkdir
# RUN mkdir -p /etc/myapp/config   ← unnecessary
```

#### 5. Build Cache Behavior

```dockerfile
# COPY - strictly matches file content; cache is only invalidated when content changes
COPY config/app.conf /etc/app/

# ADD - cache stays valid as long as the archive content is the same
ADD app.tar.gz /opt/app/
```

| Scenario | COPY | ADD |
|----------|------|-----|
| File content changes | Cache invalidated | Cache invalidated |
| File metadata changes | Cache invalidated | Cache invalidated |
| Same archive content | N/A | Cache valid |

#### 6. Feature Comparison

| Feature | COPY | ADD |
|---------|------|-----|
| Copy local files | ✅ | ✅ |
| Copy directories | ✅ | ✅ |
| Wildcard support | ✅ | ✅ |
| Auto-create directories | ✅ | ✅ |
| Auto-extract archives | ❌ | ✅ |
| Remote URL support | ❌ | ✅ |
| Clarity of intent | ✅ High | ❌ Low |
| Recommended | ✅ Default | ⚠️ Specific cases |

#### 7. When to Use Each

**Use COPY for:**

```dockerfile
# Copy config files
COPY nginx.conf /etc/nginx/nginx.conf

# Copy application code
COPY src/ /app/src/
COPY package.json /app/

# Copy a binary from a multi-stage build
COPY --from=builder /app/build/app /usr/local/bin/
```

**Use ADD only when auto-extraction is needed:**

```dockerfile
# Reasonable use of ADD
ADD node-v18.17.0-linux-x64.tar.gz /usr/local/

# Don't use ADD for regular files
ADD app.conf /etc/app/  # ← use COPY instead
```

#### 8. Best Practices

```dockerfile
# Rule 1: default to COPY
COPY requirements.txt /app/          # ✅
ADD requirements.txt /app/           # ❌ unnecessary

# Rule 2: use ADD only when extraction is needed
ADD node-v18.tar.gz /usr/local/      # ✅ extraction needed

# Rule 3: use RUN + curl for remote files
RUN curl -fsSL -o /tmp/app.tar.gz https://example.com/app.tar.gz \
    && tar -xzf /tmp/app.tar.gz -C /opt/ \
    && rm /tmp/app.tar.gz            # ✅
ADD https://example.com/app.tar.gz /opt/  # ❌

# Rule 4: use .dockerignore to shrink the build context
# .dockerignore
# .git
# node_modules
# *.md
# .env

# Rule 5: order COPY statements to leverage cache
COPY package.json package-lock.json ./  # dependencies first (rarely change)
RUN npm ci --production
COPY . .                                # source code last (changes often)
```

#### 9. Common Pitfalls

```dockerfile
# Pitfall 1: unexpected auto-extraction
ADD app.tar.gz /opt/app/
# You expected a file copy, but got an extracted directory

# Pitfall 2: remote files can't be cached
ADD https://github.com/user/repo/releases/download/v1.0/app.tar.gz /tmp/
# Every build re-downloads

# Pitfall 3: ownership issues
COPY --chown=app:app src/ /app/src/    # specify the owner explicitly
```

#### 10. Decision Tree

```
Need to copy a file?
├── Local archive that needs extraction?
│   └── Use ADD
├── Local regular file?
│   └── Use COPY
└── Remote file?
    └── Use RUN + curl
```
