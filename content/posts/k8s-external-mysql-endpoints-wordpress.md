---
title: "K8S 外部服务收编实战：手工 Endpoints 映射独立 MySQL 与 WordPress 全链路联动"
date: 2026-11-01T21:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "MySQL", "Endpoints", "Service", "WordPress", "MetalLB"]
showToc: true
summary: "深入演示 Kubernetes 集群外部有状态服务收编实操：通过无 Selector 的 Service 搭配手工 Endpoints 将独立宿主机 MySQL 实例引入集群内，部署 3 副本 WordPress 并注入动态 Host 修复 NodePort 访问，打通从 MetalLB 到外部数据库的全链路读写验证。"
---

# K8S 外部服务收编实战：手工 Endpoints 映射独立 MySQL 与 WordPress 全链路联动

---

## 一、启动 MySQL 容器

在集群外的 harbor 节点上直接以 `--network host` 跑 MySQL 容器（不经过 K8S，不占 Pod IP）：

```bash
[root@harbor ~]# docker run -d --network host --name mysql-server -e MYSQL_ROOT_PASSWORD=dawn -e MYSQL_DATABASE=dawn_wp -e MYSQL_USER=dawn -e MYSQL_PASSWORD=123 harbor:443/dawn-db/mysql:8.3.0-oracle
522d39cef2e365592b5f1b0e46eaf577c37e80018048fd299cc7c905c2dc9818

[root@harbor ~]# docker ps --format 'table {{.Names}}\t{{.Status}}'
NAMES               STATUS
mysql-server        Up 10 seconds
nginx               Up 7 hours (healthy)

[root@harbor ~]# ss -ntl | grep -E '3306|33060'
LISTEN 0      151                *:3306             *:*
LISTEN 0      70                 *:33060            *:*
```

MySQL 8.3 首次启动要初始化数据目录，需要等一段时间后 3306 才监听

验证库与用户：

```bash
[root@harbor ~]# docker exec -it mysql-server mysql -pdawn
mysql> SHOW DATABASES;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| dawn_wp            |
| performance_schema |
| sys                |
+--------------------+
5 rows in set (0.01 sec)

mysql> SELECT user,host,plugin FROM mysql.user;
+------------------+-----------+-----------------------+
| user             | host      | plugin                |
+------------------+-----------+-----------------------+
| dawn             | %         | caching_sha2_password |
| root             | %         | caching_sha2_password |
| mysql.infoschema | localhost | caching_sha2_password |
| mysql.session    | localhost | caching_sha2_password |
| mysql.sys        | localhost | caching_sha2_password |
| root             | localhost | caching_sha2_password |
+------------------+-----------+-----------------------+
6 rows in set (0.01 sec)
```

`dawn@%` 和 `root@%` 的 host 是 `%`——允许任意 IP 连接，这是 K8S Pod（10.100.x.x 网段）能连上集群外 MySQL 的前提

---

## 二、K8S 集群创建 ep 资源映射外部服务

```bash
[root@master 02-ep-MySQL]# cat 01-ep-svc-mysql.yaml
```

```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: dawn-mysql
subsets:
- addresses:
  - ip: 11.0.1.250
  ports:
  - port: 3306
    name: mysql

---

apiVersion: v1
kind: Service
metadata:
  name: dawn-mysql
spec:
  type: ClusterIP
  ports:
  - port: 3306
    name: mysql
```

```bash
[root@master 02-ep-MySQL]# kubectl apply -f 01-ep-svc-mysql.yaml
endpoints/dawn-mysql created
service/dawn-mysql created

[root@master 02-ep-MySQL]# kubectl describe -f 01-ep-svc-mysql.yaml
Name:         dawn-mysql
Namespace:    default
Subsets:
  Addresses:          11.0.1.250
  NotReadyAddresses:  <none>
  Ports:
    Name   Port  Protocol
    ----   ----  --------
    mysql  3306  TCP
```

```
Name:              dawn-mysql
Selector:          <none>
Type:              ClusterIP
IP:                10.200.106.229
Port:              mysql  3306/TCP
Endpoints:         11.0.1.250:3306
```

svc 不写 Selector + 手工 ep 指定外部 IP，集群内 Pod 直接用一个域名 `dawn-mysql` 就能访问集群外的 MySQL

---

## 三、创建 deploy 资源（wordpress 3 副本）

```bash
[root@master 02-ep-MySQL]# cat 02-deploy-wordpress.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deploy-wordpress
spec:
  replicas: 3
  selector:
    matchLabels:
      apps: wp
  template:
    metadata:
      labels:
        apps: wp
    spec:
      containers:
      - image: harbor:443/dawn-web/wordpress:latest
        name: wp
        env:
        - name: WORDPRESS_DB_HOST
          value: dawn-mysql
        - name: WORDPRESS_DB_NAME
          value: dawn_wp
        - name: WORDPRESS_DB_USER
          value: dawn
        - name: WORDPRESS_DB_PASSWORD
          value: "123"
        # 动态站点地址：跟随请求的 Host（LB IP / NodePort 均可访问）
        - name: WORDPRESS_CONFIG_EXTRA
          value: |
            define('WP_HOME','http://'.$_SERVER['HTTP_HOST']);
            define('WP_SITEURL','http://'.$_SERVER['HTTP_HOST']);
```

```bash
[root@master 02-ep-MySQL]# kubectl apply -f 02-deploy-wordpress.yaml
deployment.apps/deploy-wordpress created

[root@master 02-ep-MySQL]# kubectl rollout status deploy deploy-wordpress
deployment "deploy-wordpress" successfully rolled out

[root@master 02-ep-MySQL]# kubectl get pods -o wide --show-labels -l apps=wp
NAME                                READY   STATUS    RESTARTS   AGE   IP             NODE       LABELS
deploy-wordpress-7c56894bf8-6cvjw   1/1     Running   0          27s   10.100.1.139   worker01   apps=wp,pod-template-hash=7c56894bf8
deploy-wordpress-7c56894bf8-gxj42   1/1     Running   0          27s   10.100.2.135   worker02   apps=wp,pod-template-hash=7c56894bf8
deploy-wordpress-7c56894bf8-m28kd   1/1     Running   0          27s   10.100.1.138   worker01   apps=wp,pod-template-hash=7c56894bf8
```

后面补`WORDPRESS_CONFIG_EXTRA`修复NodePort坑时再次apply，Deployment 做滚动更新，Pod 模板哈希随之变化：

```bash
# 后补 WORDPRESS_CONFIG_EXTRA 后再次 apply
[root@master 02-ep-MySQL]# kubectl apply -f 02-deploy-wordpress.yaml
deployment.apps/deploy-wordpress configured

[root@master 02-ep-MySQL]# kubectl rollout status deploy deploy-wordpress
deployment "deploy-wordpress" successfully rolled out

[root@master 02-ep-MySQL]# kubectl get pods -l apps=wp
NAME                                READY   STATUS    RESTARTS   AGE
deploy-wordpress-5748f7c87-5xsh5   1/1     Running   0          3m34s
deploy-wordpress-5748f7c87-gdm7x   1/1     Running   0          3m37s
deploy-wordpress-5748f7c87-k8zbs   1/1     Running   0          3m29s

# exec进新Pod验证环境变量真实生效
[root@master 02-ep-MySQL]# kubectl exec deploy-wordpress-5748f7c87-5xsh5 -- printenv | grep WORDPRESS_CONFIG_EXTRA
WORDPRESS_CONFIG_EXTRA=define('WP_HOME','http://'.$_SERVER['HTTP_HOST']);
define('WP_SITEURL','http://'.$_SERVER['HTTP_HOST']);
```

`WORDPRESS_DB_HOST=dawn-mysql` 就是第二步建的 svc 名——Pod 里连“数据库”其实连的是 svc，由 ep 转发到集群外的真实 MySQL

---

## 四、创建 svc 暴露 wordpress

```bash
[root@master 02-ep-MySQL]# cat 03-svc-lb-wp.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: wp-svc-lb
spec:
  type: LoadBalancer
  loadBalancerIP: 11.0.1.166
  selector:
    apps: wp
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30080
```

```bash
[root@master 02-ep-MySQL]# kubectl apply -f 03-svc-lb-wp.yaml
service/wp-svc-lb created

[root@master 02-ep-MySQL]# kubectl describe svc wp-svc-lb
LoadBalancer Ingress:     11.0.1.166
Port:                     <unset>  80/TCP
TargetPort:               80/TCP
NodePort:                 <unset>  30080/TCP
Endpoints:                10.100.1.138:80,10.100.1.139:80,10.100.2.135:80
Events:
  Normal  IPAllocated   metallb-controller  Assigned IP ["11.0.1.166"]
  Normal  nodeAssigned  metallb-speaker     announcing from node "worker02" with protocol "layer2"
```

---

## 五、访问WebUI并验证全链路

### 5.1 访问安装页

```bash
[root@master ~]# curl -s -i http://11.0.1.166/ | head -8
HTTP/1.1 302 Found
Server: Apache/2.4.69 (Debian)
X-Powered-By: PHP/8.3.36
X-Redirect-By: WordPress
Location: http://11.0.1.166/wp-admin/install.php
```

### 5.2 完成安装（写库验证 DB 连通）

仅打开安装页不能证明数据库通（WP 安装页无需 DB 也能显示）

![image-20261101211337965](/images/k8s-external-mysql-endpoints-wordpress-image-20261101211337965.png)

### 5.3 证据：数据落在集群外的 MySQL

```bash
[root@harbor ~]# docker exec -i mysql-server mysql -uroot -pdawn -e 'SHOW TABLES IN dawn_wp;'
+-----------------------+
| Tables_in_dawn_wp     |
+-----------------------+
| wp_commentmeta        |
| wp_comments           |
| wp_links              |
| wp_options            |
| wp_postmeta           |
| wp_posts              |
| wp_term_relationships |
| wp_term_taxonomy      |
| wp_termmeta           |
| wp_terms              |
| wp_usermeta           |
| wp_users              |
+-----------------------+

[root@harbor ~]# docker exec -i mysql-server mysql -uroot -pdawn -N -e 'SELECT option_value FROM dawn_wp.wp_options WHERE option_name="blogname";'
DAWN WP
```

11 张 WP 表全部创建在集群外 MySQL 的 dawn_wp 库里，站点标题 `DAWN WP` 从库内直接读出

### 5.4 NodePort 验证

```bash
[root@master ~]# curl -s -o /dev/null -w '231:30080 = %{http_code}\n' http://11.0.1.231:30080/
231:30080 = 200
```

浏览器访问：

NodePort：http://11.0.1.231:30080/ 、http://11.0.1.232:30080/ 、http://11.0.1.233:30080/

![image-20261101212530581](/images/k8s-external-mysql-endpoints-wordpress-image-20261101212530581.png)

数据库完全在 K8S 之外，集群内通过“无 selector svc + 手工 ep”这套机制把外部服务收编进来，Pod 侧无感知
