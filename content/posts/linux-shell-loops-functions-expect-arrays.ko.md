---
title: "Shell 프로그래밍 실전 (3편): 루프 제어, 함수 모듈화, expect 자동화 및 배열 통계"
date: 2026-11-05T14:57:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Shell 환경에서의 for 및 while 루프 순회와 백그라운드 병렬 네트워크 고속 스캔을 종합 분석합니다. break/continue/exit 제어 흐름, 모듈식 함수 설계, expect 기반 대화형 SSH 공개키 무인 자동 배포를 심층 실습하고, 일반 배열과 연관 배열을 활용한 그룹 집계, 빈도 통계 및 중복 방지 추첨 알고리즘을 구축합니다."
---

# Shell 프로그래밍 실전 (3편): 루프 제어, 함수 모듈화, expect 자동화 및 배열 통계

---

## 1. for 루프 및 대량 운영 관리 실전

`for` 루프는 반복 횟수가 미리 정해져 있거나 고정된 목록 항목을 순회할 때 적합합니다.

### 1. for 루프 문법 구조
```bash
for 变量名 in 取值列表; do
    循环动作指令集合
done
```
값 목록은 **공백 또는 줄바꿈**으로 구분되며, 숫자, 문자열, Shell 시퀀스, 명령 대체 또는 파일 내용이 될 수 있습니다.

### 2. 다양한 순회 방식
#### (1) 시퀀스 및 수치 순회
```bash
[root@zabbix ~]# for i in {1..3}; do echo "第 $i 次循环"; done
第 1 次循环
第 2 次循环
第 3 次循环
```

#### (2) 명령 실행 결과 순회 (백틱 또는 `$()` 사용)
```bash
[root@zabbix ~]# for host in $(cat /etc/hosts | awk '{print $1}'); do
    echo "Host IP: $host"
done
```

---

### 3. 실전 예제 1: 시스템 사용자 일괄 생성 및 관리
`zabbix`에서 `dawn1`부터 `dawn5`까지 사용자를 자동 생성:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/batch_user.sh
#!/bin/bash
for i in {1..5}; do
    user="dawn$i"
    id $user &>/dev/null
    if [ $? -ne 0 ]; then
        useradd $user
        echo "123456" | passwd --stdin $user &>/dev/null
        echo "用户 $user 创建成功"
    else
        echo "用户 $user 已存在，跳过创建"
    fi
done
EOF
[root@zabbix ~]# chmod +x /root/batch_user.sh
[root@zabbix ~]# /root/batch_user.sh
用户 dawn1 创建成功
用户 dawn2 创建成功
用户 dawn3 创建成功
用户 dawn4 创建成功
用户 dawn5 创建成功
```

---

### 4. 실전 예제 2: LAN 내 멀티프로세스 고동시성 호스트 생존 탐색
Bash 백그라운드 서브프로세스 `&` 및 `wait`를 결합하여 초 단위의 서브넷 IP 연결 상태 스캔 구현:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/fast_ping.sh
#!/bin/bash
NET="11.0.1"
echo "开始扫描 $NET.0/24 网段存活主机..."
for i in $(seq 1 100); do
    {
        ip="$NET.$i"
        ping -c 1 -W 1 "$ip" &>/dev/null
        if [ $? -eq 0 ]; then
            echo "[ ONLINE ] 主机 $ip 存活"
        fi
    } &
done
wait
echo "扫描完毕！"
EOF
[root@zabbix ~]# chmod +x /root/fast_ping.sh
```

---

## 2. while 루프 및 루프 제어 흐름 전환

`while` 루프는 조건이 참인 동안 계속 실행되며, 조건이 충족될 때까지의 폴링 및 파일의 라인 단위 순차 읽기에 적합합니다.

### 1. while 문법 구조 및 조건 루프
```bash
while [ 条件表达式 ]; do
    执行指令集合
done
```

1부터 100까지의 누적 합:
```bash
[root@zabbix ~]# i=1; sum=0
[root@zabbix ~]# while [ $i -le 100 ]; do
    let sum+=i
    let i++
done
[root@zabbix ~]# echo "1到100累加和: $sum"
1到100累加和: 5050
```

---

### 2. 실전 예제: while을 통한 파일 라인 단위 읽기
표준 라인 읽기 문법: `while read line; do ... done < 파일`:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/batch_add_from_file.sh
#!/bin/bash
# 格式：用户名 密码
cat << 'DATA' > /tmp/users.txt
dawn_ops 123456
dawn_dev 654321
DATA

while read username password; do
    id "$username" &>/dev/null
    if [ $? -ne 0 ]; then
        useradd "$username"
        echo "$password" | passwd --stdin "$username" &>/dev/null
        echo "用户 $username 添加成功"
    fi
done < /tmp/users.txt
EOF
[root@zabbix ~]# chmod +x /root/batch_add_from_file.sh
```

---

### 3. break, continue, exit 흐름 제어
- `exit [code]`: 전체 스크립트를 **즉시 종료**하고 상태 코드(0~255)를 반환합니다.
- `break`: 현재 루프 전체를 **즉시 탈출**하여 루프 외부의 다음 코드를 실행합니다.
- `continue`: 현재 순회 차수를 **즉시 건너뛰고** 다음 반복의 조건 검사로 진입합니다.

비교 시연:
```bash
# break 예시: 3을 만나면 이후 순회를 즉시 종료
[root@zabbix ~]# for i in {1..5}; do
    [ $i -eq 3 ] && break
    echo $i
done
1
2

# continue 예시: 3을 건너뛰고 다음 항목 순회 계속
[root@zabbix ~]# for i in {1..5}; do
    [ $i -eq 3 ] && continue
    echo $i
done
1
2
4
5
```

---

## 3. Shell 함수 모듈화 및 아키텍처

함수(Function)는 재사용 가능한 코드 블록으로 대형 스크립트의 모듈식 설계 기반이 됩니다.

### 1. 함수 선언 문법
3가지 선언 방식(방식 1이 가장 표준적이며 권장됨):
```bash
# 방식 1
func_name() {
    指令集合
}

# 방식 2
function func_name() {
    指令集合
}

# 방식 3
function func_name {
    指令集合
}
```

### 2. 함수 매개변수 및 로컬 변수 유효 범위
- **함수 내부 `$1`, `$2`**: 해당 함수에 전달된 1번째, 2번째 인수를 나타내며, 스크립트 외부의 위치 매개변수와는 **다릅니다**.
- **로컬 변수 `local`**: 함수 내부에서 `local 변수명=값`으로 선언하여 변수의 유효 범위를 함수 수명 주기 내로 한정하여 전역 변수 오염을 방지합니다.

```bash
[root@zabbix ~]# cat << 'EOF' > /root/fun_test.sh
#!/bin/bash
test_scope() {
    local name="local_dawn"
    echo "函数内部 name: $name"
}
name="global_dawn"
test_scope
echo "函数外部 name: $name"
EOF
[root@zabbix ~]# sh /root/fun_test.sh
函数内部 name: local_dawn
函数外部 name: global_dawn
```

---

### 3. 함수 반환값 (return vs. echo)
- `return [0-255]`: 호출자에게 **실행 상태 코드**를 반환하는 데 사용되며 `$?`로 확인합니다.
- `echo`: 호출자에게 **데이터나 계산 결과**를 출력하는 데 사용되며 명령 대체 `var=$(func)`로 캡처합니다.

```bash
[root@zabbix ~]# cat << 'EOF' > /root/calc.sh
#!/bin/bash
add() {
    echo $[$1 + $2]
}
result=$(add 50 70)
echo "计算结果为: $result"
EOF
[root@zabbix ~]# sh /root/calc.sh
计算结果为: 120
```

---

### 4. 실전 예제: 서비스 및 URL 상태 확인 함수 캡슐화 `fun.sh`
`zabbix`에서 작성:
```bash
[root@zabbix ~]# cat /root/fun.sh
#!/bin/bash
check_url() {
    curl -I -s -m 3 -o /dev/null "$1"
    if [ $? -eq 0 ]; then
        echo "$1 is OK"
    else
        echo "$1 is DOWN"
    fi
}
check_url www.baidu.com
[root@zabbix ~]# /root/fun.sh
www.baidu.com is OK
```

---

## 4. expect 기반 대화형 자동화 및 공개키 배포

비밀번호 없는 로그인이 설정되지 않은 환경에서 `expect`는 가상 터미널(PTY)을 통해 대화형 도구(`ssh`, `passwd`, `sftp` 등)와의 자동 데이터 송수신을 처리합니다.

### 1. expect 핵심 명령어
| 명령어 | 기능 설명 |
| :--- | :--- |
| `spawn` | 새로운 프로세스를 시작하고 해당 입출력을 expect가 제어 |
| `expect "string"` | 출력을 모니터링하여 특정 대상 문자열(정규식 지원)이 나타날 때까지 대기 |
| `send "data\r"` | 사용자 키 입력을 시뮬레이션(`\r`은 Enter) |
| `interact` | 세션 제어권을 사용자 키보드로 넘겨 수동 조작 허용 |
| `expect eof` | 대상 하위 프로세스가 종료되고 EOF 신호가 수신될 때까지 대기 |
| `set timeout n` | 매칭 대기 제한 시간(초) 설정 (`-1`은 무제한 대기) |

---

### 2. 실전 예제: SSH 공개키 일괄 자동 배포
`sshpass`와 `expect`를 결합하여 클러스터 호스트 간의 무인 인증 통로 구성:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/distribute_key.sh
#!/bin/bash
# 1. 本地生成密钥对
[ ! -f ~/.ssh/id_rsa ] && ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa

# 2. 目标集群主机列表
CLUSTER_IPS="11.0.1.7 11.0.1.71 101.133.147.148"
PASSWORD="000000"

for ip in $CLUSTER_IPS; do
    echo "正在向 $ip 分发公钥..."
    /usr/bin/expect <<-EOF
        set timeout 5
        spawn ssh-copy-id -o StrictHostKeyChecking=no root@$ip
        expect {
            "yes/no" { send "yes\r"; exp_continue }
            "password:" { send "$PASSWORD\r" }
        }
        expect eof
EOF
done
EOF
[root@zabbix ~]# chmod +x /root/distribute_key.sh
```

---

## 5. Shell 배열 및 고급 데이터 통계

Bash는 두 가지 유형의 배열을 지원합니다:
1. **일반 배열(Indexed Arrays)**: **정수 인덱스** 사용 (0부터 시작).
2. **연관 배열(Associative Arrays)**: **문자열 키** 사용 (Bash 4.0+, `declare -A`로 명시적 선언 필요).

### 1. 일반 배열 기본 조작
```bash
# 선언 및 할당
[root@zabbix ~]# array=(11.0.1.7 11.0.1.71 101.133.147.148)

# 모든 요소 및 모든 인덱스 가져오기
[root@zabbix ~]# echo "所有元素: ${array[@]}"
所有元素: 11.0.1.7 11.0.1.71 101.133.147.148
[root@zabbix ~]# echo "所有下标: ${!array[@]}"
所有下标: 0 1 2

# 배열 길이(요소 개수) 가져오기
[root@zabbix ~]# echo "数组长度: ${#array[@]}"
数组长度: 3
```

---

### 2. 연관 배열 및 빈도 집계 모델
연관 배열은 Shell에서 그룹 집계 및 빈도 통계를 수행하기 위한 가장 강력한 도구입니다.

통계 모델 핵심 로직:
```bash
declare -A count_dict
let count_dict[元素名]++
```

#### 실전 예제 1: 텍스트 파일 내 성별 분포 집계
`dawn` 호스트에서 `/root/sex.txt` 내용 분류 및 집계:
```bash
[root@dawn ~]# cat /root/sex.txt
male
female
male
male
female

[root@dawn ~]# cat << 'EOF' > /root/count_sex.sh
#!/bin/bash
declare -A sex_stat
while read line; do
    [ -z "$line" ] && continue
    let sex_stat["$line"]++
done < /root/sex.txt

echo "=== 性别统计结果 ==="
for k in "${!sex_stat[@]}"; do
    echo "$k: ${sex_stat[$k]} 次"
done
EOF
[root@dawn ~]# chmod +x /root/count_sex.sh
[root@dawn ~]# /root/count_sex.sh
=== 性别统计结果 ===
female: 2 次
male: 3 次
```

---

#### 실전 예제 2: Nginx 접속 로그 내 클라이언트 IP 요청 빈도 집계
연관 배열을 활용하여 `/var/log/nginx/access.log`에서 유니크 IP별 접속 횟수 집계:
```bash
[root@dawn ~]# cat << 'EOF' > /root/count_nginx_ip.sh
#!/bin/bash
declare -A ip_counts
while read line; do
    ip=$(echo "$line" | awk '{print $1}')
    [ -n "$ip" ] && let ip_counts["$ip"]++
done < /var/log/nginx/access.log

echo "=== Nginx 访问 IP 频次统计 ==="
for ip in "${!ip_counts[@]}"; do
    printf "%-18s 访问次数: %d\n" "$ip" "${ip_counts[$ip]}"
done
EOF
[root@dawn ~]# chmod +x /root/count_nginx_ip.sh
[root@dawn ~]# /root/count_nginx_ip.sh
=== Nginx 访问 IP 频次统计 ===
11.0.1.1           访问次数: 16
11.0.1.2           访问次数: 1
11.0.1.3           访问次数: 1
192.168.1.10       访问次数: 2
```

---

#### 실전 예제 3: 자동 추첨 및 중복 방지 제비뽑기 프로그램
`$RANDOM`과 배열을 결합하여 중복 없는 난수 배정 모델 구축:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/lottery.sh
#!/bin/bash
> /tmp/lottery_record.txt
echo "=== 集群运维抽奖系统 (输入 'ok' 结束) ==="

while true; do
    read -p "请输入抽奖人姓名: " name
    [ "$name" == "ok" ] && break
    [ -z "$name" ] && continue

    while true; do
        num=$((RANDOM % 100 + 1))
        # 중복 방지
        if ! grep -qw "$num" /tmp/lottery_record.txt; then
            echo "$num" >> /tmp/lottery_record.txt
            echo "抽奖人: $name, 获得号码: $num"
            break
        fi
    done
done

echo "=== 抽奖排行榜 Top 3 ==="
sort -rnk2 /tmp/lottery_record.txt 2>/dev/null | head -n 3
EOF
[root@zabbix ~]# chmod +x /root/lottery.sh
```
