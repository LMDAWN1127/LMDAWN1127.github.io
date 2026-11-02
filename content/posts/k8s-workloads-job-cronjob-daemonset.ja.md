---
title: "K8S ワークロード実践解説：Job・CronJob・DaemonSet の深層（MySQL バックアップ・リストア実機演習付き）"
date: 2026-11-02T16:05:00+08:00
draft: false
categories: ["Kubernetes"]
tags: ["Kubernetes", "Job", "CronJob", "DaemonSet", "MySQL", "Workloads"]
showToc: true
summary: "Kubernetes におけるバッチ処理およびデーモン型ワークロードの仕組みを徹底解剖：円周率計算 Job による backoffLimit リトライ仕様の検証から、Job ＋ デュアル NFS ボリュームによる外部 MySQL の自動バックアップと異環境復元実機演習、CronJob の周期実行検証、DaemonSet のノード Taint によるスケジューリング挙動のトラブルシューティングまで網羅。"
---

# K8S ワークロード実践解説：Job・CronJob・DaemonSet の深層（MySQL バックアップ・リストア実機演習付き）

---

## 一、Job コントローラ

### 1.1 ユースケース

ワンオフ（1回限り）タスク：バックアップ、データ移行、バッチ計算。コンテナ内のタスクは1回のみ実行され、終了コードにかかわらず Pod レベルで再起動しません。

### 1.2 perl イメージのインポート

```bash
[root@master ~]# docker run -d --name perlbuilder alpine:3.20.2 sleep 600
[root@master ~]# docker exec perlbuilder sh -c 'echo https://mirrors.aliyun.com/alpine/v3.20/main/ > /etc/apk/repositories && apk update && apk add --no-cache perl'
(2/2) Installing perl (5.38.5-r0)
OK: 48 MiB in 16 packages

[root@master ~]# docker exec perlbuilder perl -Mbignum=bpi -wle 'print bpi(80)'
3.1415926535897932384626433832795028841971693993751058209749445923078164062862090

[root@master ~]# docker commit -c 'CMD ["perl"]' perlbuilder perl:5.34.0
[root@master ~]# docker tag perl:5.34.0 harbor:443/dawn-troubleshooting/perl:5.34.0
[root@master ~]# docker push harbor:443/dawn-troubleshooting/perl:5.34.0
```

### 1.3 円周率計算 Job — backoffLimit の検証

**マニフェスト：** `/dawn/manifests/jobs/01-jobs-pi.yaml`

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: dawn-jobs-pi
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: pi
        image: harbor:443/dawn-troubleshooting/perl:5.34.0
        command: ["perl", "-Mbignum=bpi", "-wle", "print bpi(2000)"]
  backoffLimit: 4                        # 最多重试4次，每次重试是新Pod
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/jobs/01-jobs-pi.yaml
job.batch/dawn-jobs-pi created

[root@master ~]# kubectl get jobs dawn-jobs-pi
NAME           COMPLETIONS   DURATION   AGE
dawn-jobs-pi   1/1           9s         25s

[root@master ~]# kubectl get pod -l job-name=dawn-jobs-pi -o wide
NAME                 READY   STATUS      RESTARTS   AGE   IP            NODE
dawn-jobs-pi-675qb   0/1     Completed   0          25s   10.100.1.85   worker01

[root@master ~]# kubectl logs dawn-jobs-pi-675qb | head -c 500
3.141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067982148086513282306647093844609550582231725359408128481117450284102701938521105559644622948954930381964428810975665933446128475648233786783165271201909145648566923460348610454326648213393607260249141273724587006606315588174881520920962829254091715364367892590360011330530548820466521384146951941511609433057270365759591953092186117381932611793105118548074462379962749567351885752724891227938183011949
```

Pod の状態は `Completed`（`restartPolicy: Never` → 終了後に再起動しない）。ログには円周率 π の正確な 2000 桁が出力されます。

---

## 二、Job による MySQL バックアップとリストア

### 2.1 外部 MySQL のマッピング（Endpoints + Service）

クラスタ外の MySQL（Harbor ホスト 11.0.1.250:3306、ユーザー dawn / パスワード 123）を、セレクタなし Service ＋ 手動 Endpoints によってクラスタ内 DNS に組み込みます：

```yaml
# /dawn/manifests/jobs/01-ep-svc-mysql.yaml
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
[root@master ~]# kubectl apply -f /dawn/manifests/jobs/01-ep-svc-mysql.yaml
endpoints/dawn-mysql created
service/dawn-mysql created

[root@master ~]# kubectl get ep,svc dawn-mysql
NAME                   ENDPOINTS           AGE
endpoints/dawn-mysql   11.0.1.250:3306     96m
NAME                 TYPE        CLUSTER-IP       PORT(S)
service/dawn-mysql   ClusterIP   10.200.149.185   3306/TCP
```

クラスタ内の Pod は DNS 名 `dawn-mysql` を介して外部 MySQL にアクセス可能になります。

### 2.2 NFS マウントによるバックアップ Job

```yaml
# /dawn/manifests/jobs/02-jobs-backup-mysql.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: dawn-mysql-backup
spec:
  template:
    spec:
      volumes:
      - name: db
        nfs:
          server: 11.0.1.231
          path: /dawn/data/nfs-server/backup/mysql80
      containers:
      - name: mysql
        image: harbor:443/dawn-db/mysql:8.3.0-oracle
        volumeMounts:
        - name: db
          mountPath: /data
        command:
        - /bin/bash
        - -c
        - "mysqldump -u dawn -p123 -h dawn-mysql --databases dawn_wp > /data/wordpress.sql"
      restartPolicy: Never
  backoffLimit: 0
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/jobs/02-jobs-backup-mysql.yaml
job.batch/dawn-mysql-backup created

[root@master ~]# kubectl get job dawn-mysql-backup
NAME                COMPLETIONS   DURATION   AGE
dawn-mysql-backup   1/1           5s         96m

[root@master ~]# ls -la /dawn/data/nfs-server/backup/mysql80/wordpress.sql
-rw-r--r-- 1 root root 34240 Nov  2 12:33 wordpress.sql
```

### 2.3 内部 MySQL のデプロイ ＋ MetalLB LoadBalancer

```yaml
# /dawn/manifests/jobs/03-deploy-mysql.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deloy-mysql
spec:
  replicas: 1
  selector:
    matchLabels:
      apps: mysql
  template:
    metadata:
      labels:
        apps: mysql
    spec:
      containers:
      - name: db
        image: harbor:443/dawn-db/mysql:8.3.0-oracle
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: dawn
---
apiVersion: v1
kind: Service
metadata:
  name: dawn-mysql-svc
spec:
  type: LoadBalancer
  loadBalancerIP: 11.0.1.170
  selector:
    apps: mysql
  ports:
  - port: 3306
    targetPort: 3306
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/jobs/03-deploy-mysql.yaml
deployment.apps/deloy-mysql created
service/dawn-mysql-svc created

[root@master ~]# kubectl get deploy,svc deloy-mysql dawn-mysql-svc
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
deloy-mysql    1/1     1            1           94m
NAME             TYPE           CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
dawn-mysql-svc   LoadBalancer   10.200.65.95   11.0.1.170    3306:30688/TCP   94m
```

### 2.4 クライアント接続テスト

Harbor ホスト（11.0.1.250）から MetalLB External IP（11.0.1.170）経由で内部 MySQL に接続：

```bash
[root@harbor ~]# docker exec -it mysql-server mysql -h 11.0.1.170 -u root -pdawn
mysql> SHOW DATABASES;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
+--------------------+
4 rows in set (0.00 sec)
```

初期状態ではシステム DB 4 つのみが存在し、`dawn_wp` はまだリストアされていません。

### 2.5 データリストア

```yaml
# /dawn/manifests/jobs/04-jobs-recover-mysql.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: dawn-mysql-recover
spec:
  template:
    spec:
      volumes:
      - name: db
        nfs:
          server: 11.0.1.231
          path: /dawn/data/nfs-server/backup/mysql80
      containers:
      - name: mysql
        image: harbor:443/dawn-db/mysql:8.3.0-oracle
        command:
        - /bin/bash
        - -c
        - "mysql -u root -pdawn -h dawn-mysql-svc < /data/wordpress.sql"
        env:
        - name: MYSQL_ALLOW_EMPTY_PASSWORD
          value: "yes"
        volumeMounts:
        - name: db
          mountPath: /data
      restartPolicy: Never
  backoffLimit: 0
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/jobs/04-jobs-recover-mysql.yaml
job.batch/dawn-mysql-recover created

[root@master ~]# kubectl get job dawn-mysql-recover
NAME                 COMPLETIONS   DURATION   AGE
dawn-mysql-recover   1/1           6s         52s
```

### 2.6 リストア結果の検証

```bash
[root@master ~]# kubectl exec deloy-mysql-7745cc6d46-jh9xn -- mysql -u root -pdawn -e "SHOW DATABASES;"
Database
dawn_wp          # 已恢复
information_schema
mysql
performance_schema
sys

[root@master ~]# kubectl exec deloy-mysql-7745cc6d46-jh9xn -- mysql -u root -pdawn dawn_wp -e "SHOW TABLES;"
Tables_in_dawn_wp
wp_commentmeta
wp_comments
wp_links
wp_options
wp_postmeta
wp_posts
wp_term_relationships
wp_term_taxonomy
wp_termmeta
wp_terms
wp_usermeta
wp_users         # 12张WordPress标准表

[root@master ~]# kubectl exec deloy-mysql-7745cc6d46-jh9xn -- mysql -u root -pdawn dawn_wp -e "SELECT * FROM wp_users;"
+----+------------+------------------------------------+---------------+---------------------+----------+---------------------+---------------------+-------------+--------------+
| ID | user_login | user_pass                          | user_nicename | user_email          | user_url | user_registered     | user_activation_key | user_status | display_name |
+----+------------+------------------------------------+---------------+---------------------+----------+---------------------+---------------------+-------------+--------------+
|  1 | admin      | $P$Bs9fI27IB8QW7VYBTcD8hLuXbg2P38/ | admin         | admin@dawn.com      | ...      | 2024-08-06 01:48:14 |                     |           0 | admin        |
+----+------------+------------------------------------+---------------+---------------------+----------+---------------------+---------------------+-------------+--------------+
```

WordPress の 12 テーブルがすべて復元され、admin ユーザーのレコードも完全に復旧。

---

### 2.7 応用実践：複数 DB バックアップ・リストアとデュアル NFS ボリューム演習

1. WordPress データベースを K8S クラスタ外に配置し、WordPress 本体をクラスタ内に展開
2. テスト用 DB を作成：`CREATE DATABASE dawn; CREATE TABLE student(id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL, hobby VARCHAR(255) NOT NULL);`
3. 氏名と趣味を含むテストデータを最低 3 件挿入
4. 外部データベースをバックアップ後、K8S 内に MySQL をデプロイしてリストア
5. 外部から student テーブルのデータが完全に復元されているかを検証

#### 1. 権限付与

```bash
mysql> SHOW GRANTS FOR dawn;
+------------------------------------------------------------+
| Grants for dawn@%                                          |
+------------------------------------------------------------+
| GRANT USAGE ON *.* TO `dawn`@`%`                          |
| GRANT ALL PRIVILEGES ON `dawn\_wp`.* TO `dawn`@`%`       |
+------------------------------------------------------------+

mysql> GRANT ALL PRIVILEGES ON `dawn`.* TO `dawn`@`%`;
Query OK, 0 rows affected (0.00 sec)

mysql> SHOW GRANTS FOR dawn;
+------------------------------------------------------------+
| Grants for dawn@%                                          |
+------------------------------------------------------------+
| GRANT USAGE ON *.* TO `dawn`@`%`                          |
| GRANT ALL PRIVILEGES ON `dawn`.* TO `dawn`@`%`           |
| GRANT ALL PRIVILEGES ON `dawn\_wp`.* TO `dawn`@`%`       |
+------------------------------------------------------------+
```

#### 2. 複数 DB バックアップスクリプト

```bash
# /dawn/data/nfs-server/scripts/backup.sh
#!/bin/bash
mysqldump -u dawn -p123 -h dawn-mysql --databases dawn_wp > /data/wordpress-`date +%F`.sql
mysqldump -u dawn -p123 -h dawn-mysql --databases dawn > /data/dawn-`date +%F`.sql
sleep 10
```

#### 3. デュアル NFS ボリューム Job

```yaml
# /dawn/manifests/jobs/05-jobs-backup-mysql-multiple.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: dawn-mysql-backup-multiple
spec:
  template:
    spec:
      volumes:
      - name: db
        nfs:
          server: 11.0.1.231
          path: /dawn/data/nfs-server/backup/mysql80
      - name: scripts
        nfs:
          server: 11.0.1.231
          path: /dawn/data/nfs-server/scripts/
      containers:
      - name: mysql
        image: harbor:443/dawn-db/mysql:8.3.0-oracle
        volumeMounts:
        - name: db
          mountPath: /data
        - name: scripts
          mountPath: /scripts
        command:
        - /bin/bash
        - -x
        - /scripts/backup.sh
      restartPolicy: Never
  backoffLimit: 0
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/jobs/05-jobs-backup-mysql-multiple.yaml
job.batch/dawn-mysql-backup-multiple created

[root@master ~]# kubectl get job dawn-mysql-backup-multiple
NAME                         COMPLETIONS   DURATION   AGE
dawn-mysql-backup-multiple   1/1           14s        95m

[root@master ~]# ls -la /dawn/data/nfs-server/backup/mysql80/
-rw-r--r-- 1 root root  2287 Nov  2 12:34 dawn-2026-11-02.sql
-rw-r--r-- 1 root root 34240 Nov  2 12:34 wordpress-2026-11-02.sql
-rw-r--r-- 1 root root 34240 Nov  2 12:33 wordpress.sql
```

#### 4. dawn データベースのリストア

```yaml
# /dawn/manifests/jobs/06-jobs-recover-dawn.yaml
# 关键：mysql -u root -pdawn -h dawn-mysql-svc < $(ls -t /data/dawn-*.sql | head -1)
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/jobs/06-jobs-recover-dawn.yaml
job.batch/dawn-mysql-recover-dawn created

[root@master ~]# kubectl get job dawn-mysql-recover-dawn
NAME                      COMPLETIONS   DURATION   AGE
dawn-mysql-recover-dawn   1/1           6s         52s
```

#### 5. student テーブルの検証

```bash
[root@master ~]# kubectl exec deloy-mysql-7745cc6d46-jh9xn -- mysql -u root -pdawn dawn -e "SELECT * FROM student;"
id   name       hobby
1    张黎明     云原生运维
2    李白       写诗
3    张三丰     太极拳
```

---

## 三、CronJob コントローラ

Job コントローラを定期的に呼び出し、ワンオフタスクを実行します。

```yaml
# /dawn/manifests/cj/01-cj-hello.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: hello
spec:
  schedule: "* * * * *"              # 每分钟调度一次
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: hello
            image: harbor:443/dawn-linux/alpine:3.20.2
            imagePullPolicy: IfNotPresent
            command:
            - /bin/sh
            - -c
            - date; echo Hello from the Kubernetes cluster
          restartPolicy: OnFailure
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/cj/01-cj-hello.yaml
cronjob.batch/hello created

[root@master ~]# kubectl get cj,jobs,pods | grep hello
NAME                  SCHEDULE    SUSPEND   ACTIVE   LAST SCHEDULE   AGE
cronjob.batch/hello   * * * * *   False     0        20s             2m28s

NAME                       COMPLETIONS   DURATION   AGE
job.batch/hello-28715472   1/1           4s         2m20s
job.batch/hello-28715473   1/1           4s         80s
job.batch/hello-28715474   1/1           3s         20s

[root@master ~]# kubectl logs hello-28715472
Mon Nov  2 05:12:01 UTC 2026
Hello from the Kubernetes cluster

[root@master ~]# kubectl logs hello-28715473
Mon Nov  2 05:13:00 UTC 2026     # 时间递增一分钟
Hello from the Kubernetes cluster
```

---

## 四、DaemonSet コントローラ

各 worker ノードに Pod が必ず1つだけ稼働することを保証。代表的な用途：Filebeat、Node-Exporter、flannel、kube-proxy。

```yaml
# /dawn/manifests/ds/01-ds-web.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ds-xiuxian
spec:
  selector:
    matchLabels:
      apps: xiuxian
  template:
    metadata:
      labels:
        apps: xiuxian
    spec:
      containers:
      - name: xiuxian
        image: harbor:443/dawn/apps:v1
```

```bash
[root@master ~]# kubectl apply -f /dawn/manifests/ds/01-ds-web.yaml
daemonset.apps/ds-xiuxian created

[root@master ~]# kubectl get ds ds-xiuxian
NAME         DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
ds-xiuxian   2         2         2       2            2           <none>          81m

[root@master ~]# kubectl get pods -l apps=xiuxian -o wide | grep ds-xiuxian
ds-xiuxian-jrwzg   1/1   Running   0   10.100.1.212   worker01
ds-xiuxian-nhlpk   1/1   Running   0   10.100.2.141   worker02
```

master に Pod が配置されない理由：master ノードに `node-role.kubernetes.io/master:NoSchedule` 汚点（Taint）が付与されており、DaemonSet のテンプレートに対応する tolerations が設定されていないためです。
