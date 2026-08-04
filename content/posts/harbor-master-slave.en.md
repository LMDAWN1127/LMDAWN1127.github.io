---
title: "Harbor Active-Standby Deployment: From Installation to HTTPS and Replication"
date: 2026-08-04
categories: ["Container Tech", "DevOps"]
tags: ["Harbor", "Docker", "Image Registry", "Replication", "HTTPS"]
summary: "Complete guide to deploying Harbor enterprise Docker registry with active-standby architecture, HTTP/HTTPS modes, self-signed certificates, and cross-host replication."
weight: 1
---

# Harbor Active-Standby Deployment

## Environment Setup

**Operating System:** CentOS 8.4 64bit

**Harbor Version:** harbor-offline-installer-v2.11.1.tgz

**Docker Compose:** docker-compose-linux-x86_64

| Role | Hostname | IP Address |
|------|----------|------------|
| Primary Harbor | Harbor01 | 192.168.8.161 |
| Standby Harbor | Harbor02 | 192.168.8.162 |
| Docker Host | web01 | 192.168.8.188 |

Harbor is an open-source enterprise Docker Registry project by VMware, built on the official Docker Registry with added features like management UI, role-based access control (RBAC), AD/LDAP integration, and audit logging. Each Harbor component runs as a Docker container, deployed using Docker Compose.

---

## Part 1: Deploy Primary Harbor (HTTP Mode, No Certificates)

> This method is suitable for internal networks where Harbor is accessed directly via HTTP without SSL certificates.

### 1. Install Docker

```bash
# Remove existing yum repo files
rm -rf /etc/yum.repos.d/*

# Download repo file from Alibaba Cloud mirror
curl -o /etc/yum.repos.d/CentOS-Base.repo https://mirrors.aliyun.com/repo/Centos-8.repo

# Install Docker CE
yum install -y yum-utils
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker and enable on boot
systemctl enable docker.service --now
```

### 2. Configure Docker Mirror

```bash
vim /etc/docker/daemon.json
```

Enter the following content:

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

### 3. Install Docker Compose and Harbor

```bash
# Place docker-compose and harbor offline packages in /data
ls /data
# docker-compose-linux-x86_64  harbor-offline-installer-v2.11.1.tgz

# Install docker-compose
cp /data/docker-compose-linux-x86_64 /usr/local/bin/docker-compose
chmod a+x /usr/local/bin/docker-compose

# Extract harbor
tar -zxvf /data/harbor-offline-installer-v2.11.1.tgz -C /usr/local/
```

### 4. Modify Harbor Configuration

```bash
cd /usr/local/harbor/
cp harbor.yml.tmpl harbor.yml
vim harbor.yml
```

Modify the following key settings:

```yaml
hostname: 192.168.8.161

http:
  port: 80

# Comment out the entire https section (not needed for HTTP mode)
#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: Harbor12345

data_volume: /images
```

> Leave all other settings at their defaults.

### 5. Run Installation

```bash
./install.sh
```

After installation, access `http://192.168.8.161` in your browser and log in with admin / Harbor12345.

![Harbor Login Interface](/images/harbor/image1.png)

### 6. Create Users and Projects

Create user1 in the Harbor Web UI:

![Create User](/images/harbor/image2.png)

Log in as user1:

![user1 Login](/images/harbor/image3.png)

Create a new project (e.g., openssh) as user1:

![New Project](/images/harbor/image4.png)

### 7. Test Image Push and Pull

On the Docker host (web01):

```bash
# Log in to Harbor
docker login 192.168.8.161
Username: user1
Password:
# Login Succeeded

# Tag the image
docker tag nginx:latest 192.168.8.161/openssh/nginx:latest

# Push to Harbor
docker push 192.168.8.161/openssh/nginx:latest
```

After successful push, the image appears in Harbor:

![Image Upload Success](/images/harbor/image5.png)

```bash
# Remove local image and pull again
docker image rm -f 192.168.8.161/openssh/nginx:latest
docker pull 192.168.8.161/openssh/nginx:latest
```

Harbor shows download count +1 after pull:

![Download Count](/images/harbor/image6.png)

---

## Part 2: Deploy Standby Harbor

The standby deployment is identical to the primary, just change the hostname to the standby IP.

```bash
vim /usr/local/harbor/harbor.yml
```

```yaml
hostname: 192.168.8.162
```

After deployment, access `http://192.168.8.162` and create user2:

![Standby Login](/images/harbor/image7.png)

![Create user2](/images/harbor/image8.png)

Log in to standby Harbor as user2:

![user2 Login](/images/harbor/image9.png)

---

## Part 3: Configure Active-Standby Replication

### 1. Create Replication Endpoint on Primary

Log in to primary Harbor as admin, go to **Administration → Registries**, and create a new endpoint:

![Administration](/images/harbor/image10.png)

Enter standby information:

- Endpoint URL: `http://192.168.8.162`
- Access ID / Access Secret: user2 credentials

![New Endpoint](/images/harbor/image11.png)

![Endpoint Details](/images/harbor/image12.png)

Creation successful:

![Endpoint Created](/images/harbor/image13.png)

### 2. Create Replication Policy

Go to **Administration → Replications**, create a new replication policy:

![Replication Management](/images/harbor/image14.png)

- Destination Registry: Select Harbor02
- Mode: Event-Based (or other modes)

![Configure Policy](/images/harbor/image15.png)

![Sync Success](/images/harbor/image16.png)

### 3. Verify Sync Results

Push more images from Docker host to primary:

```bash
docker tag httpd:2.4 192.168.8.161/openssh/httpd:2.4
docker push 192.168.8.161/openssh/httpd:2.4

docker tag mysql:5.7 192.168.8.161/openssh/mysql:5.7
docker push 192.168.8.161/openssh/mysql:5.7
```

Check primary images:

![Primary Images](/images/harbor/image17.png)

Check standby images (auto-synced):

![Standby Images](/images/harbor/image18.png)

The standby shows synced images from primary, confirming active-standby replication is working.

Note: Images that existed on primary before configuring replication need manual sync.

---

## Part 4: Enable HTTPS (Self-Signed Certificate)

> For production or public network access, HTTPS is recommended. Here's the complete self-signed certificate workflow.

### 1. Generate CA and Server Certificates

On the Harbor server:

```bash
mkdir -p /data/cert && cd /data/cert

# Generate CA private key
openssl genrsa -out ca.key 4096

# Generate CA certificate (valid for 10 years)
openssl req -x509 -new -nodes -sha512 -days 3650 \
  -subj "/C=CN/CN=HarborRootCA" \
  -key ca.key \
  -out ca.crt

# Generate server private key
openssl genrsa -out harbor.key 4096

# Generate server certificate request (CN = Harbor IP or domain)
openssl req -sha512 -new \
  -subj "/C=CN/CN=192.168.8.161" \
  -key harbor.key \
  -out harbor.csr
```

### 2. Configure Certificate Extensions

Create `v3.ext` file with SAN (Subject Alternative Name):

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

> `IP.1` must match Harbor's actual access address, otherwise Docker client will report certificate domain mismatch errors.

### 3. Sign Server Certificate

```bash
openssl x509 -req -sha512 -days 3650 \
  -extfile v3.ext \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -in harbor.csr \
  -out harbor.crt
```

### 4. Enable HTTPS in Harbor Configuration

```bash
vim /usr/local/harbor/harbor.yml
```

Uncomment the https section and update certificate paths:

```yaml
hostname: 192.168.8.161

https:
  port: 443
  certificate: /data/cert/harbor.crt
  private_key: /data/cert/harbor.key
```

> hostname must match `IP.1` in `v3.ext`.

### 5. Redeploy Harbor

```bash
cd /usr/local/harbor/
docker-compose down
./prepare
docker-compose up -d
```

> Warning: Do NOT use `docker-compose down -v`, as `-v` deletes named volumes, causing loss of Harbor database and user data.

Access via `https://192.168.8.161` after deployment.

### 6. Configure Docker Clients to Trust Certificate

Execute on every machine that needs to push/pull images:

```bash
# Create certificate directory (name must be Harbor IP or domain)
mkdir -p /etc/docker/certs.d/192.168.8.161

# Copy CA certificate to the directory
# Method 1: scp from Harbor server
scp root@192.168.8.161:/data/cert/ca.crt /etc/docker/certs.d/192.168.8.161/

# Method 2: Manually copy the ca.crt file content

# Restart Docker
systemctl restart docker

# Test login
docker login 192.168.8.161
# Enter admin and password, "Login Succeeded" indicates success
```

---

## Part 5: FAQ

**Q: Can I switch between HTTP and HTTPS modes?**

Yes. Modify the https section in `harbor.yml`, then re-run `./install.sh`. Switching from HTTP to HTTPS requires generating certificates first; switching back to HTTP requires commenting out the https section.

**Q: Docker client reports "x509: certificate relies on legacy Common Name field" when logging into HTTPS Harbor?**

This means the certificate lacks SAN (Subject Alternative Name). Regenerate the certificate ensuring `v3.ext` contains `IP.1=<Harbor IP>` and sign with `-extfile v3.ext`.

**Q: How to troubleshoot replication failures?**

Check network connectivity between primary and standby, verify the target registry credentials, and ensure the user has write permission to the target project.
