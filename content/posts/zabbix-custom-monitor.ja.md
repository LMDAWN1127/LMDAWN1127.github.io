---
title: "Zabbix カスタム監視"
date: 2026-09-23T18:30:00+08:00
draft: false
categories: ["Zabbix", "監視・運用"]
tags: ["Zabbix", "カスタム監視", "UserParameter", "トリガー", "値マッピング"]
summary: "Zabbix カスタム監視の実践 — UserParameter でログインユーザー数やメモリ空き率などの独自メトリクスを収集し、zabbix_get で検証、Web UI で監視項目・値マッピング・トリガー（複数条件トリガー含む）を追加してカスタムアラートを実現します。"
---

## 1. ログインユーザー数を取得する

```bash
[root@web02 ~]#w
 17:44:18 up  1:17,  2 users,  load average: 0.01, 0.02, 0.05
USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
root     pts/0    11.0.1.1         16:31   11:46   0.07s  0.07s -bash
root     pts/1    11.0.1.52        17:07    2.00s  0.04s  0.00s w
[root@web02 ~]#w|awk 'NR==1{print $4}'
2
```

## 2. Zabbix の監視項目として定義する

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf 
UserParameter=login_number,w|awk 'NR==1{print $4}'
# zabbix_agentd -p で項目の文法チェックができます
[root@web02 ~]#zabbix_agentd -p|grep login_number
login_number                                  [t|2]
# クライアントを再起動
[root@web02 ~]# systemctl restart zabbix-agent.service
```

## 3. Zabbix サーバー側で収集・監視する

サーバーからコマンドラインで、監視項目を通じてユーザー定義の値が取得できるかテストします。

```bash
# zabbix-get コマンドをインストール
[root@zabbix ~]# yum -y install zabbix-get
[root@zabbix ~]#zabbix_get -s 172.16.1.8 -k login_number
2
```

Web ページで監視項目を追加する

![](/images/p13_img93.png)

![](/images/p13_img94.png)

![](/images/p14_img101.png)

監視項目を確認する

![](/images/p15_img104.png)

![](/images/p15_img106.png)

## 4. TCP 22 ポートの生存を監視する

監視したい情報に合わせてキー値を選択します。

TCP ポートが LISTEN 状態かどうかを確認します。戻り値: 0 - 待ち受けなし; 1 - 待ち受け中。

![](/images/p16_img111.png)

![](/images/p16_img113.png)

web02 の sshd サービスを停止する

```bash
[root@web02 ~]# systemctl stop sshd
```

![](/images/p16_img114.png)

## 5. 表示用のカスタム値マッピングを設定する

![](/images/p17_img119.png)

![](/images/p17_img120.png)

![](/images/p18_img124.png)

値マッピングを適用する

![](/images/p18_img126.png)

![](/images/p19_img129.png)

## 6. サーバーメモリ使用率のカスタム監視

手順 1: カスタム項目を定義し、空き率を取得する

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf
UserParameter=login_number,w|awk 'NR==1{print $4}'
UserParameter=mem_free,free|awk 'NR==2{print $NF/$2*100}'
[root@web02 ~]# systemctl restart zabbix-agent.service 
[root@web02 ~]#zabbix_agentd -p|grep mem_free
mem_free                                      [t|79.8753]
```

手順 2: サーバー側でキー値の取得をテストし、監視項目を追加する

```bash
[root@zabbix ~]#zabbix_get -s 172.16.1.8 -k mem_free
79.9775
```

![](/images/p20_img135.png)

![](/images/p20_img136.png)

## 7. 空きメモリにトリガーを設定する

空きメモリ率が 20% を下回った場合にアラートを発報します。

![](/images/p20_img139.png)

![](/images/p21_img144.png)

![](/images/p21_img145.png)

![](/images/p22_img148.png)

テスト: swap パーティションを無効にする

```bash
[root@web02 ~]# swapoff  -a
```

dd でストレステストを実行しメモリを消費する

```bash
[root@web02 ~]# dd if=/dev/zero of=/dev/null bs=1200M count=2048
```

![](/images/p23_img152.png)

## 8. 複数条件トリガーを設定する

両方の条件が同時に満たされた場合にのみアラートを発報します。

swap 空き率を追加する

```bash
[root@web02 ~]# cat /etc/zabbix/zabbix_agentd.d/system.conf
UserParameter=login_number,w|awk 'NR==1{print $4}'
UserParameter=mem_free,free|awk 'NR==2{print $NF/$2*100}'
UserParameter=swap_free,free -m|awk 'NR==3{print $3/$2*100}'
```

![](/images/p24_img158.png)

![](/images/p24_img160.png)

トリガー設定を変更する

![](/images/p25_img163.png)

その後、再度 dd ストレステストを実行して結果を確認します。
