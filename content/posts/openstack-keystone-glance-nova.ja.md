---
title: "OpenStack 中核サービス詳細解説：Keystone 認証・Nova コンピュート・Glance/Swift イメージストレージ"
date: 2026-10-05T00:21:00+08:00
draft: false
categories: ["OpenStack"]
tags: ["OpenStack", "Keystone", "Glance", "Nova", "Endpoint", "イメージサービス"]
summary: "OpenStack の 3 大中核サービスを整理：Keystone のマルチドメイン対応・service/endpoint 登録・ポリシーファイルによる権限制御、Nova の各モジュール（api/scheduler/conductor/compute/novncproxy）とメッセージキュー・差分ディスク、そして Glance イメージサービスの Swift オブジェクトストレージ化。"
---

# Keystone サービス

OpenStack のマルチドメイン対応

```bash
[root@Controller ~]# vim /etc/openstack-dashboard/local_settings
OPENSTACK_KEYSTONE_MULTIDOMAIN_SUPPORT = True
```

![image-20261004230313993](/images/openstack-kgn/image-20261004230313993.png)

システム内の全サービスを一覧表示

```bash
[root@Controller ~(keystone_admin)]# openstack service list
```

Keystone アドレスと API インターフェース

```text
OS_AUTH_URL=http://192.168.100.10:5000/v3
```

![](/images/openstack-kgn/img-03.png)

1. 全てのサービスは Keystone のアドレスを知っています。ユーザートークンが有効かを Keystone に検証してもらう必要があるためです
2. Keystone は全てのサービスのアドレスを知っています。全てのサービスは作成時に Keystone へ登録を行うためです

エンドポイントアドレス

```bash
[root@Controller ~(keystone_admin)]# openstack endpoint list
```

各サービスには 3 つのエンドポイントアドレスがあり、これら 3 つの URL は同じでも異なっていても構いません

public url — 外部ユーザーがアクセスする URL アドレス

admin url — 管理者がアクセスする URL アドレス

internal url — 内部コンポーネント間でアクセスする URL アドレス

**クラウドサーバー提供の流れ**

1. ユーザーは Keystone にユーザー名とパスワードを送信してリクエストします。認証が成功すると Keystone はトークンを発行し、ユーザーはそのトークンを使って nova-api にクラウドサーバー作成リクエストを送ります
2. nova-api は Keystone に助けを求め、そのトークンが有効かどうかを検証してもらい、成功すれば結果が返されます
3. nova-api はリクエストを nova-compute ホストに送信します
4. nova-compute ホストはユーザーのリクエスト情報に基づいてクラウドサーバーを作成し、結果を nova-api に返します
5. nova-api は結果をユーザーに返します。クラウドサーバーの作成が完了し、そのホスト情報はデータベースに記録されます

nova-api にサーバー作成リクエストを送る際、私は nova-api のアドレスを知りません。しかし Keystone のアドレスは知っています。Keystone に nova-api のアドレスを問い合わせます。Keystone は全サービスのエンドポイントアドレスを保持しているため、私は Keystone のアドレスだけ知っていればよいのです。以下は Keystone のアドレスを調べ、そこから他のアドレスを引く方法です。

```bash
[root@Controller ~(keystone_zlm)]# grep -E "^connection\s*=.*keystone" /etc/keystone/*.conf
/etc/keystone/keystone.conf:connection=mysql+pymysql://keystone_admin:c3fa63522e1f4586@192.168.100.10/keystone
# 用户名：keystone_admin 
# 密码：c3fa63522e1f4586
[root@Controller ~(keystone_zlm)]# mysql -u keystone_admin  -p -D keystone
Enter password:
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 15494
Server version: 10.3.27-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [keystone]> SELECT s.type AS service_type,
    ->        e.interface,
    ->        e.url
    -> FROM endpoint e
    -> JOIN service s ON e.service_id = s.id
    -> ORDER BY s.type, e.interface;
+----------------+-----------+--------------------------------------------------+
| service_type   | interface | url                                              |
+----------------+-----------+--------------------------------------------------+
| alarming       | admin     | http://192.168.100.10:8042                       |
| alarming       | internal  | http://192.168.100.10:8042                       |
| alarming       | public    | http://192.168.100.10:8042                       |
| cloudformation | admin     | http://192.168.100.10:8000/v1                    |
| cloudformation | internal  | http://192.168.100.10:8000/v1                    |
| cloudformation | public    | http://192.168.100.10:8000/v1                    |
| compute        | admin     | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| compute        | internal  | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| compute        | public    | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| identity       | admin     | http://192.168.100.10:5000                       |
| identity       | internal  | http://192.168.100.10:5000                       |
| identity       | public    | http://192.168.100.10:5000                       |
| image          | admin     | http://192.168.100.10:9292                       |
| image          | internal  | http://192.168.100.10:9292                       |
| image          | public    | http://192.168.100.10:9292                       |
| metering       | admin     | http://192.168.100.10:8777                       |
| metering       | internal  | http://192.168.100.10:8777                       |
| metering       | public    | http://192.168.100.10:8777                       |
| metric         | admin     | http://192.168.100.10:8041                       |
| metric         | internal  | http://192.168.100.10:8041                       |
| metric         | public    | http://192.168.100.10:8041                       |
| network        | admin     | http://192.168.100.10:9696                       |
| network        | internal  | http://192.168.100.10:9696                       |
| network        | public    | http://192.168.100.10:9696                       |
| object-store   | admin     | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| object-store   | internal  | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| object-store   | public    | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| orchestration  | admin     | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| orchestration  | internal  | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| orchestration  | public    | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| placement      | admin     | http://192.168.100.10:8778/placement             |
| placement      | internal  | http://192.168.100.10:8778/placement             |
| placement      | public    | http://192.168.100.10:8778/placement             |
| volumev2       | admin     | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev2       | internal  | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev2       | public    | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev3       | admin     | http://192.168.100.10:8776/v3/%(tenant_id)s      |
| volumev3       | internal  | http://192.168.100.10:8776/v3/%(tenant_id)s      |
| volumev3       | public    | http://192.168.100.10:8776/v3/%(tenant_id)s      |
+----------------+-----------+--------------------------------------------------+
39 rows in set (0.001 sec)

MariaDB [keystone]> SELECT s.type AS service_type,
    ->        e.interface,
    ->        e.url
    -> FROM endpoint e
    -> JOIN service s ON e.service_id = s.id
    -> WHERE e.interface = 'public'
    -> ORDER BY s.type;
+----------------+-----------+--------------------------------------------------+
| service_type   | interface | url                                              |
+----------------+-----------+--------------------------------------------------+
| alarming       | public    | http://192.168.100.10:8042                       |
| cloudformation | public    | http://192.168.100.10:8000/v1                    |
| compute        | public    | http://192.168.100.10:8774/v2.1/%(tenant_id)s    |
| identity       | public    | http://192.168.100.10:5000                       |
| image          | public    | http://192.168.100.10:9292                       |
| metering       | public    | http://192.168.100.10:8777                       |
| metric         | public    | http://192.168.100.10:8041                       |
| network        | public    | http://192.168.100.10:9696                       |
| object-store   | public    | http://192.168.100.10:8080/v1/AUTH_%(tenant_id)s |
| orchestration  | public    | http://192.168.100.10:8004/v1/%(tenant_id)s      |
| placement      | public    | http://192.168.100.10:8778/placement             |
| volumev2       | public    | http://192.168.100.10:8776/v2/%(tenant_id)s      |
| volumev3       | public    | http://192.168.100.10:8776/v3/%(tenant_id)s      |
+----------------+-----------+--------------------------------------------------+
13 rows in set (0.000 sec)

MariaDB [keystone]>
```

OpenStack デプロイ時のサービス作成

1. データベースに入り、データベース（例: glance）を作成します
2. データベースユーザー glance を作成し、glance データベース内の全テーブルに対する ALL（参照・追加・更新・削除）権限を付与します
3. glance サービスを作成し、glance-api のアドレス（エンドポイントアドレス）をデータベースに登録します

ユーザーが glance-api にアクセスする必要がある場合、Keystone にリクエストを送り、Keystone データベースから glance api のエンドポイントアドレスを検索します

```bash
#示例 如果将zlm用户加入admin角色，那他就拥有了admin角色权限
[root@Controller ~(keystone_admin)]# openstack role add --user zlm --project LMandMY_HOME admin
```

ユーザーが nova-api にリクエストを送ると、nova-api は Keystone にユーザー身份とトークンの有効期限を検証させます。ユーザーにクラウドサーバー作成権限があるかは判定しません。権限の有無は各サービスのポリシーファイルに依存します

```bash
[root@Controller nova]# cd /etc/openstack-dashboard/
[root@Controller openstack-dashboard]# ls
cinder_policy.json  keystone_policy.json  neutron_policy.json  nova_policy.json
glance_policy.json  local_settings        nova_policy.d
[root@Controller nova(keystone_user)]# cp /etc/openstack-dashboard/glance_policy.json /etc/glance/policy.json
[root@Controller nova(keystone_user)]# openstack image create --container-format bare
--disk-format qcow2 --file /root/cirros-0.3.5-x86_64-disk.img --public    test2
[root@Controller nova(keystone_user)]# chgrp glance /etc/glance/policy.json
[root@Controller nova(keystone_user)]# systemctl restart openstack-glance-api.service
```

# Nova サービス

コントローラーノード

nova-api モジュール

nova-scheduler モジュール

nova-conductor モジュール

nova-novncproxy モジュール

コンピュートノード

nova-compute モジュール

**nova-api**

外部に公開する REST インターフェースの処理を担当

渡されたパラメーターの妥当性検証と制約チェックを行います

リクエストされたリソースのクォータ（quota）を検証し予約します

リソースの作成・更新・削除・照会など

仮想マシンのライフサイクルの入口

水平方向にスケールアウトしてデプロイ可能

**nova-conductor**

nova-compute のデータベース直接アクセスを切り離します。ユーザーがクラウドサーバーの作成を申請し作成が成功すると、nova-conductor モジュールがクラウドサーバー情報をデータベースに書き込みます

database — そのコンポーネントに関連する情報（クラウドサーバー情報、イメージ情報、ネットワーク情報など）を保存します

**nova-scheduler**

OpenStack 環境に複数の Compute ノードがある場合、ユーザーがクラウドサーバーを作成すると nova-scheduler モジュールが各 compute ホストの重みに基づいて、そのサーバーをどのコンピュートノードで動かすかを決定します

HAProxy がロードバランシングを提供します。ユーザーが nova-api にアクセスすると、リクエストはまず HAProxy に渡され、各 nova-api の負荷状況に応じてどの API ノードに送るかが決定されます

![](/images/openstack-kgn/img-01.png)

MQ — Message Queue（メッセージキュー）

1 つのコンポーネントが複数のモジュールを持つ場合、モジュール間のやり取りはメッセージキューを経由して輻輳制御などを行います

1000 人のユーザーが nova-api にリクエストを送った場合

nova-api はリクエストを nova-compute に送信します

nova-api はこれら 1000 件のリクエストをメッセージキューに送り、メッセージキューは各 compute ホストのメッセージ消費状況と処理進捗に応じて、それらを順序立てて nova-compute ノードに配信して処理させます

**nova-compute**

実際に仮想マシンを動作させるモジュール

**nova-novncproxy**

動作原理：nova-compute ホストは稼働中の仮想マシンごとに VNC Server のポートを 1 つ開きます

nova-compute ホストはそのポートを外部に公開してはいけません。公開するとインターネット上のホストがそのポートと仮想マシンにアクセスできてしまいます

この問題を解決するため、コントローラーノード上で nova-novncproxy サービスを起動して外部に提供します。ユーザーがその仮想マシンのコンソールにアクセスすると、まず nova-novncproxy にリクエストが送られ、提供された情報（仮想マシンの UUID、トークンなど）からその仮想マシンがどの nova-compute 上で動いているかを検索し、その Compute ホストへリクエストを転送します。

VNC で仮想マシンを開く仕組み

vncserver — 5900 番ポート

vncviewer — vncviewer

クライアントに vncviewer をインストールする必要はなく、その機能はブラウザの HTML に組み込まれています（noVNC プロトコル）

# **Glance と Swift サービス**

一、クラウドサーバーのデプロイ：

ユーザーがクラウドサーバーのデプロイ指令を送り検証を通過すると、nova-compute ホストは glance イメージサーバーからイメージをローカル（クラウドサーバーはローカルにデプロイ）にダウンロードします — /var/lib/nova/instances/_base/

クラウドサーバーが起動すると差分ディスクが生成され、新しく書き込まれたデータはその差分ディスクに保存されます

![](/images/openstack-kgn/img-04.png)

実験：glance イメージを glance のローカルディスクではなく Swift オブジェクトストレージに保存する

```bash
[root@Controller ~]# cd /etc/glance/
[root@Controller glance]# cp glance-api.conf glance-api.conf.bak
[root@Controller ~]# vim /etc/glance/glance-api.conf
3057 stores=file,http,swift
3111 default_store=swift
3982 swift_store_region = RegionOne
4032 swift_store_endpoint_type = publicURL
4090 swift_store_container = public
4118 swift_store_large_object_size = 5120
4142 swift_store_large_object_chunk_size = 100
4160 swift_store_create_container_on_put = True
4182 swift_store_multi_tenant = True
4230 swift_store_admin_tenants = services
4382 swift_store_auth_version = 2
4391 swift_store_auth_address = http://192.168.100.10:5000/v3
4399 swift_store_user = zlm
4408 swift_store_key = 000000
[root@Controller ~]# systemctl restart openstack-glance-api.service
```

備考：zlm ユーザーは swiftOperator ロールを付与されて初めて Swift への操作権限を持ちます

![image-20261005001440979](/images/openstack-kgn/image-20261005001440979.png)
