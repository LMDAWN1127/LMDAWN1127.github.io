---
title: "K8S 외부 서비스 연동 실전: 수동 Endpoints 로 독립 MySQL 매핑 및 WordPress 전체 연동"
date: 2026-11-01T21:30:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "MySQL", "Endpoints", "Service", "WordPress", "MetalLB"]
showToc: true
summary: "Kubernetes 클러스터 외부의 스테이트풀 서비스를 안전하게 편입하는 실전 가이드: Selector 없는 Service 와 수동 Endpoints 를 조합하여 독립 호스트의 MySQL 인스턴스를 클러스터 내로 연결하고, 동적 Host 설정을 주입한 3개 복제본의 WordPress 를 배포하여 MetalLB 부터 외부 데이터베이스까지의 전체 경로 읽기/쓰기를 검증합니다."
---

# K8S 외부 서비스 연동 실전: 수동 Endpoints 로 독립 MySQL 매핑 및 WordPress 전체 연동

---

## 1. MySQL 컨테이너 시작

클러스터 외부의 harbor 노드에서 `--network host` 옵션을 사용하여 직접 MySQL 컨테이너를 실행합니다 (K8S 를 거치지 않으며, Pod IP 를 점유하지 않음):

```bash
[root@harbor ~]# docker run -d --network host --name mysql-server -e MYSQL_ROOT_PASSWORD=dawn -e MYSQL_DATABASE=dawn_wp -e MYSQL_USER=dawn -e MYSQL_PASSWORD=123 harbor:443/dawn-db/mysql:8.3.0-oracle
522d39cef2e365592b5f1b0e46eaf577c37e80018048fd299cc7c905c2dc9818

[root@harbor ~]# docker ps --format 'table {{.Names}}	{{.Status}}'
NAMES               STATUS
mysql-server        Up 10 seconds
nginx               Up 7 hours (healthy)

[root@harbor ~]# ss -ntl | grep -E '3306|33060'
LISTEN 0      151                *:3306             *:*
LISTEN 0      70                 *:33060            *:*
```

MySQL 8.3 은 최초 시작 시 데이터 디렉터리를 초기화해야 하므로, 3306 포트가 수신 대기 상태가 되기까지 일정 시간이 소요됩니다.

데이터베이스 및 사용자 확인:

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

`dawn@%` 와 `root@%` 의 host 는 `%` 로 설정되어 있어 임의의 IP 에서의 접속을 허용합니다. 이는 K8S Pod(10.100.x.x 대역)가 클러스터 외부의 MySQL 에 연결하기 위한 필수 전제 조건입니다.

---

## 2. K8S 클러스터에서 외부 서비스를 매핑하는 ep 리소스 생성

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

Selector 없는 svc 와 수동 ep 로 외부 IP 를 지정함으로써, 클러스터 내부의 Pod 는 `dawn-mysql` 이라는 단일 도메인만으로 클러스터 외부의 MySQL 에 접근할 수 있습니다.

---

## 3. Deployment 리소스 생성 (WordPress 3개 복제본)

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

이후 NodePort 접근 문제를 해결하기 위해 `WORDPRESS_CONFIG_EXTRA` 를 보완하여 다시 apply 하면, Deployment 가 롤링 업데이트를 수행하며 Pod 템플릿 해시가 변경됩니다:

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

`WORDPRESS_DB_HOST=dawn-mysql` 은 2단계에서 생성한 svc 이름입니다. Pod 내부에서 연결하는 "데이터베이스"는 실제로는 svc 이며, ep 에 의해 클러스터 외부의 실제 MySQL 로 포워딩됩니다.

---

## 4. WordPress 를 노출하는 Service 생성

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

## 5. WebUI 접속 및 전체 경로 검증

### 5.1 설치 페이지 접속

```bash
[root@master ~]# curl -s -i http://11.0.1.166/ | head -8
HTTP/1.1 302 Found
Server: Apache/2.4.69 (Debian)
X-Powered-By: PHP/8.3.36
X-Redirect-By: WordPress
Location: http://11.0.1.166/wp-admin/install.php
```

### 5.2 설치 완료 (DB 쓰기를 통한 연결성 검증)

단순히 설치 페이지가 열리는 것만으로는 데이터베이스 통신이 정상임을 증명하지 못합니다 (WP 설치 화면은 DB 가 없어도 표시될 수 있음).

![image-20261101211337965](/images/k8s-external-mysql-endpoints-wordpress-image-20261101211337965.png)

### 5.3 근거: 데이터가 클러스터 외부 MySQL 에 저장됨

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

11개의 WP 테이블이 클러스터 외부 MySQL 의 `dawn_wp` 데이터베이스에 모두 정상 생성되었으며, 사이트 제목 `DAWN WP` 가 데이터베이스에서 직접 조회됩니다.

### 5.4 NodePort 검증

```bash
[root@master ~]# curl -s -o /dev/null -w '231:30080 = %{http_code}
' http://11.0.1.231:30080/
231:30080 = 200
```

브라우저 접속:

NodePort: http://11.0.1.231:30080/ , http://11.0.1.232:30080/ , http://11.0.1.233:30080/

![image-20261101212530581](/images/k8s-external-mysql-endpoints-wordpress-image-20261101212530581.png)

데이터베이스는 완전히 K8S 외부에 위치하며, 클러스터 내부에서는 "Selector 없는 svc + 수동 ep" 메커니즘을 통해 외부 서비스를 투명하게 연동하여 Pod 측에서는 아무런 차이 없이 사용할 수 있습니다.
