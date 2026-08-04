---
title: "Harbor 主备部署实战：从安装到 HTTPS 与主备复制"
date: 2026-08-04
categories: ["容器技术", "DevOps"]
tags: ["Harbor", "Docker", "镜像仓库", "主备复制", "HTTPS"]
summary: "完整记录 Harbor 企业级镜像仓库的主备部署过程，涵盖 HTTP/HTTPS 双模式安装、自签名证书配置、跨主机主备复制等核心运维技能。"
weight: 1
---

# Harbor 主备部署

## 环境准备

**操作系统：** CentOS 8.4 64bit

**Harbor 版本：** harbor-offline-installer-v2.11.1.tgz

**Docker Compose：** docker-compose-linux-x86_64

| 角色 | 主机名 | IP 地址 |
|------|--------|---------|
| 主 Harbor | Harbor01 | 192.168.8.161 |
| 备 Harbor | Harbor02 | 192.168.8.162 |
| Docker 主机 | web01 | 192.168.8.188 |

Harbor 是 VMware 公司开源的企业级 Docker Registry 项目，以 Docker 官方 Registry 为基础，提供了管理 UI、基于角色的访问控制（RBAC）、AD/LDAP 集成和审计日志等企业功能，同时原生支持中文。Harbor 的每个组件都以 Docker 容器形式构建，使用 Docker Compose 进行部署。

---

## 一、部署主 Harbor（HTTP 模式，不使用证书）

> 此方式适用于内网环境，通过 HTTP 直接访问 Harbor，无需配置 SSL 证书。

### 1. 安装 Docker

```bash
# 删除所有已存在的 yum 仓库文件
rm -rf /etc/yum.repos.d/*

# 从阿里云镜像站下载 yum 仓库文件
curl -o /etc/yum.repos.d/CentOS-Base.repo https://mirrors.aliyun.com/repo/Centos-8.repo

# 安装 Docker CE
yum install -y yum-utils
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 启动 Docker 并设置开机自启
systemctl enable docker.service --now
```

### 2. 配置 Docker 加速器

```bash
vim /etc/docker/daemon.json
```

写入以下内容：

```json
{
  "registry-mirrors": [
    "https://37564ea7e7cc4824a5049fd666807c27.mirror.swr.myhuaweicloud.com"
  ],
  "insecure-registries": ["http://192.168.8.161"]
}
```

```bash
systemctl daemon-reload
systemctl restart docker.service
```

### 3. 安装 Docker Compose 和 Harbor

```bash
# 将 docker-compose 和 harbor 离线包放到 /data 目录
ls /data
# docker-compose-linux-x86_64  harbor-offline-installer-v2.11.1.tgz

# 安装 docker-compose
cp /data/docker-compose-linux-x86_64 /usr/local/bin/docker-compose
chmod a+x /usr/local/bin/docker-compose

# 解压 harbor
tar -zxvf /data/harbor-offline-installer-v2.11.1.tgz -C /usr/local/
```

### 4. 修改 Harbor 配置

```bash
cd /usr/local/harbor/
cp harbor.yml.tmpl harbor.yml
vim harbor.yml
```

修改以下关键配置：

```yaml
hostname: 192.168.8.161

http:
  port: 80

# 将 https 段落全部注释掉（HTTP 模式不需要证书）
#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: Harbor12345

data_volume: /images
```

> 其余配置保持默认即可。

### 5. 执行安装

```bash
./install.sh
```

安装完成后，浏览器访问 `http://192.168.8.161`，使用 admin / Harbor12345 登录。

![Harbor 登录界面](/images/harbor/image1.png)

### 6. 创建用户和项目

在 Harbor Web 界面中创建用户 user1：

![创建用户](/images/harbor/image2.png)

使用 user1 身份登录：

![user1 登录](/images/harbor/image3.png)

以user1身份新建项目（如 openssh）：

![新建项目](/images/harbor/image4.png)

### 7. 测试镜像推送和拉取

在 Docker 主机（web01）上操作：

```bash
# 登录 Harbor
docker login 192.168.8.161
Username: user1
Password:
# Login Succeeded

# 给镜像打标签
docker tag nginx:latest 192.168.8.161/openssh/nginx:latest

# 推送到 Harbor
docker push 192.168.8.161/openssh/nginx:latest
```

推送成功后可在 Harbor 中看到该镜像：

![镜像上传成功](/images/harbor/image5.png)

```bash
# 删除本地镜像后重新拉取
docker image rm -f 192.168.8.161/openssh/nginx:latest
docker pull 192.168.8.161/openssh/nginx:latest
```

拉取后 Harbor 会显示下载次数 +1：

![下载计数](/images/harbor/image6.png)

---

## 二、部署备 Harbor

备端部署方法与主端完全一致，只需将 hostname 改为备端 IP。

```bash
vim /usr/local/harbor/harbor.yml
```

```yaml
hostname: 192.168.8.162
```

部署完成后访问 `http://192.168.8.162`，创建 user2 用户：

![备端登录](/images/harbor/image7.png)

![创建 user2](/images/harbor/image8.png)

使用 user2 登录备端 Harbor：

![user2 登录](/images/harbor/image9.png)

---

## 三、配置主备复制

### 1. 在主端新建复制目标

使用 admin 登录主端 Harbor，进入 **系统管理 → 仓库管理**，新建目标：

![系统管理](/images/harbor/image10.png)

填写备端信息：

- 端点 URL：`http://192.168.8.162`
- 访问 ID / 访问密钥：user2 的账号密码

![新建目标](/images/harbor/image11.png)

![目标详情](/images/harbor/image12.png)

创建成功：

![目标创建成功](/images/harbor/image13.png)

### 2. 创建复制策略

进入 **系统管理 → 复制管理**，新建复制策略：

![复制管理](/images/harbor/image14.png)

- 目标仓库：选择刚创建的 Harbor02
- 模式：事件驱动（也可选其他）

![配置策略](/images/harbor/image15.png)

![同步成功](/images/harbor/image16.png)

### 3. 验证同步结果

在 Docker 主机上推送更多镜像到主端：

```bash
docker tag httpd:2.4 192.168.8.161/openssh/httpd:2.4
docker push 192.168.8.161/openssh/httpd:2.4

docker tag mysql:5.7 192.168.8.161/openssh/mysql:5.7
docker push 192.168.8.161/openssh/mysql:5.7
```

查看主端镜像：

![主端镜像](/images/harbor/image17.png)

查看备端镜像（已自动同步）：

![备端镜像](/images/harbor/image18.png)

备端能看到主端同步过来的镜像，说明主备复制配置成功。

注：同步之前主端已经存在的镜像需要手动同步。

---

## 四、启用 HTTPS（自签名证书方式）

> 如果需要在生产环境或跨公网使用 Harbor，建议启用 HTTPS。以下为使用 OpenSSL 自签名证书的完整流程。

### 1. 生成 CA 证书和服务器证书

在 Harbor 服务器上执行：

```bash
mkdir -p /data/cert && cd /data/cert

# 生成 CA 私钥
openssl genrsa -out ca.key 4096

# 生成 CA 证书（有效期 10 年）
openssl req -x509 -new -nodes -sha512 -days 3650 \
  -subj "/C=CN/CN=HarborRootCA" \
  -key ca.key \
  -out ca.crt

# 生成服务器私钥
openssl genrsa -out harbor.key 4096

# 生成服务器证书请求（CN 填写 Harbor 的 IP 或域名）
openssl req -sha512 -new \
  -subj "/C=CN/CN=192.168.8.161" \
  -key harbor.key \
  -out harbor.csr
```

### 2. 配置证书扩展信息

创建 `v3.ext` 文件，指定 SAN（Subject Alternative Name）：

```bash
cat > v3.ext <<-EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
IP.1=192.168.8.161
EOF
```

> `IP.1` 必须与 Harbor 的实际访问地址一致，否则 Docker 客户端登录时会报证书域名不匹配的错误。

### 3. 签发服务器证书

```bash
openssl x509 -req -sha512 -days 3650 \
  -extfile v3.ext \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -in harbor.csr \
  -out harbor.crt
```

### 4. 修改 Harbor 配置启用 HTTPS

```bash
vim /usr/local/harbor/harbor.yml
```

取消 https 部分的注释，并修改证书路径：

```yaml
hostname: 192.168.8.161

https:
  port: 443
  certificate: /data/cert/harbor.crt
  private_key: /data/cert/harbor.key
```

> hostname 必须和 `v3.ext` 中的 `IP.1` 保持一致。

### 5. 重新部署 Harbor

```bash
cd /usr/local/harbor/
docker-compose down
./prepare
docker-compose up -d
```

> 注意：不要使用 `docker-compose down -v`，`-v` 会删除 named volumes，导致 Harbor 数据库和用户数据丢失。

部署完成后通过 `https://192.168.8.161` 访问。

### 6. 配置 Docker 客户端信任证书

每台需要拉取/推送镜像的机器都要执行：

```bash
# 创建证书目录（目录名必须是 Harbor 的 IP 或域名）
mkdir -p /etc/docker/certs.d/192.168.8.161

# 将 CA 证书复制到该目录
# 方式一：从 Harbor 服务器 scp
scp root@192.168.8.161:/data/cert/ca.crt /etc/docker/certs.d/192.168.8.161/

# 方式二：手动复制，将 /data/cert/ca.crt 文件内容写入上述目录

# 重启 Docker
systemctl restart docker

# 测试登录
docker login 192.168.8.161
# 输入 admin 和密码，显示 Login Succeeded 即成功
```

---

## 五、常见问题

**Q：HTTP 模式和 HTTPS 模式能否切换？**

可以。修改 `harbor.yml` 中的 https 配置段落后，重新执行 `./install.sh` 即可。从 HTTP 切换到 HTTPS 需要先生成证书；从 HTTPS 切回 HTTP 则需要注释掉 https 段。

**Q：Docker 客户端登录 HTTPS Harbor 报 "x509: certificate relies on legacy Common Name field" 怎么办？**

这是因为证书没有配置 SAN（Subject Alternative Name）。重新生成证书时确保 `v3.ext` 中包含 `IP.1=<Harbor的IP>`，并用 `-extfile v3.ext` 参数签发。

**Q：主备复制失败怎么排查？**

检查主备两端的网络连通性、目标端仓库配置中的用户名密码是否正确、以及目标端对应用户是否有项目写入权限。
