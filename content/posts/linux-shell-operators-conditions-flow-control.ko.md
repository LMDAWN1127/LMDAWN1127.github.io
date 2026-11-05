---
title: "Shell 프로그래밍 실전 (2편): 수치 연산, 조건 테스트 및 case 흐름 제어"
date: 2026-11-05T14:38:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux 환경에서의 6가지 수치 연산 방식(expr, $(()), $[], let, bc, awk)을 심층 분석합니다. test, [], [[]] 조건 테스트 및 정규식 매칭을 체계적으로 다루고, if-elif 다중 분기를 활용한 디스크 모니터링 알림과 OS 버전 판별을 구현하며, case 문을 통해 대화형 메뉴, Nginx 서비스 관리 스크립트 및 Jumpserver(경유지 서버) 핵심 아키텍처를 구축합니다."
---

# Shell 프로그래밍 실전 (2편): 수치 연산, 조건 테스트 및 case 흐름 제어

---

## 1. Linux 환경에서의 6가지 수치 연산 방법

Bash는 기본적으로 모든 변수를 문자열 타입으로 처리합니다. 수학 연산을 수행하려면 전용 연산 구문이나 외부 유틸리티를 사용해야 합니다.

### 1. `expr` 정수 연산 및 매개변수 유효성 검사
- `expr`는 사칙연산을 지원하지만, **연산자 양쪽에 반드시 공백이 있어야 합니다**;
- 곱셈 기호 `*`는 Shell 와일드카드이므로 역슬래시 `\*`로 이스케이프해야 합니다;
- 종료 상태 코드 `$?`를 활용하여 입력값이 정수인지 검증하는 데 널리 활용됩니다.

```bash
[root@web01 dawn02]# expr 1 + 1
2
[root@web01 dawn02]# expr 10 \* 2
20
[root@web01 dawn02]# expr 10 / 2 \* 3 - 5
10

# 전달된 매개변수가 정수인지 검증
[root@web01 dawn02]# expr 1 + 10 &>/dev/null; echo $?
0
[root@web01 dawn02]# expr 1 + hehe &>/dev/null; echo $?
2
```

### 2. `$(( ))` 산술 확장 (가장 보편적이며 최고 성능)
Bash 내장 문법입니다. 내부 변수에서 `$` 접두사를 생략할 수 있고, 곱셈 기호 이스케이프가 불필요하며, 연산자 양쪽 공백도 자유롭습니다:
```bash
[root@web01 dawn02]# echo $((10 * 10 - 2 + 5))
103
[root@web01 dawn02]# a=10; b=20
[root@web01 dawn02]# echo $((a * b))
200
```

### 3. `$[ ]` 산술 표현식
`$(( ))`와 유사하게 기본적인 정수 연산을 지원합니다:
```bash
[root@web01 dawn02]# echo $[10 * 10]
100
[root@web01 dawn02]# echo $[a + b]
30
```

### 4. `let` 연산 및 증감 연산자
루프 카운터 및 변수 누적에 주로 사용되며 간결한 문법을 제공합니다:
```bash
[root@web01 dawn02]# let i++
[root@web01 dawn02]# echo $i
1
[root@web01 dawn02]# let i+=10
[root@web01 dawn02]# echo $i
11
```

**전위 및 후위 증감 연산자 차이**:
`let c=a++`는 할당 후 증가; `let d=++b`는 증가 후 할당.

### 5. `bc` 임의 정밀도 계산기 (부동 소수점 연산 지원)
파이프를 통해 수식을 `bc`에 전달하여 소수점 및 정밀도 스케일 계산을 지원합니다:
```bash
[root@web01 ~]# echo "10 + 10.5" | bc
20.5
[root@web01 ~]# echo "scale=2; 10 / 3" | bc
3.33
```

### 6. `awk` 수치 연산
awk의 `BEGIN` 블록을 활용하여 부동 소수점 연산을 수행합니다:
```bash
[root@web01 ~]# awk 'BEGIN{printf "%.2f\n", 10/3}'
3.33
```

---

### 실전 예제: 2개 매개변수 사칙연산 계산기 `count.sh`
`web01`(`/server/scripts/dawn02/count.sh`)에서 작성:
```bash
[root@web01 dawn02]# cat << 'EOF' > /server/scripts/dawn02/count.sh
#!/bin/bash
# 传参计数脚本
[ $# -ne 2 ] && echo "请输入俩参数" && exit 50
expr $1 + $2 &>/dev/null
[ $? -ne 0 ] && echo "请输入整数" && exit 100
echo "$1+$2=$[$1+$2]"
echo "$1-$2=$[$1-$2]"
echo "$1*$2=$[$1*$2]"
echo "$1/$2=$[$1/$2]"
EOF
[root@web01 dawn02]# chmod +x /server/scripts/dawn02/count.sh
[root@web01 dawn02]# /server/scripts/dawn02/count.sh 10 20
10+20=30
10-20=-10
10*20=200
10/20=0
```

---

## 2. 조건 테스트 표현식: test, [ ], [[ ]]

조건 테스트는 평가 결과에 따라 상태 코드 `0`(참/성공) 또는 `0`이 아닌 값(거짓/실패)을 반환합니다.

### 1. 파일 상태 테스트
| 테스트 플래그 | 설명 |
| :--- | :--- |
| `-f file` | 일반 파일이며 존재하는지 판별 |
| `-d dir` | 디렉터리이며 존재하는지 판별 |
| `-e path` | 파일 또는 디렉터리가 존재하는지 판별 |
| `-r file` | 현재 사용자에게 읽기 권한이 있는지 판별 |
| `-w file` | 현재 사용자에게 쓰기 권한이 있는지 판별 |
| `-x file` | 현재 사용자에게 실행 권한이 있는지 판별 |
| `-s file` | 파일이 존재하고 파일 크기가 0 바이트 초과인지 판별 |

```bash
[root@web01 ~]# [ -f /etc/hosts ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ -d /etc ] && echo 成立 || echo 不成立
成立
[root@web01 ~]# [ ! -f /etc/not_exist ] && echo 成立
成立
```

### 2. 문자열 비교
| 테스트 표현식 | 설명 |
| :--- | :--- |
| `str1 = str2` 또는 `==` | 두 문자열이 같은지 판별 |
| `str1 != str2` | 두 문자열이 같지 않은지 판별 |
| `-z str` | 문자열 길이가 0인지 판별 (빈 문자열이면 참) |
| `-n str` | 문자열 길이가 0이 아닌지 판별 (비어있지 않으면 참) |

```bash
[root@web01 dawn02]# [ "$SHELL" == "/bin/bash" ] && echo 成立
成立

# 변수가 비어있는지 확인
[root@web01 dawn02]# unset my_var
[root@web01 dawn02]# [ -z "$my_var" ] && echo "变量为空"
变量为空
[root@web01 dawn02]# my_var="dawn"
[root@web01 dawn02]# [ -n "$my_var" ] && echo "变量非空: $my_var"
变量非空: dawn
```

### 3. 정규 표현식 매칭 `[[ =~ ]]`
이중 대괄호 `[[ ]]`를 사용하여 확장 정규 표현식 패턴 매칭을 지원합니다:
```bash
[root@web01 ~]# [[ root =~ ^r ]] && echo 成立
成立

# 입력값이 순수 숫자인지 검증
[root@web01 ~]# age=25
[root@web01 ~]# [[ "$age" =~ ^[0-9]+$ ]] && echo "是纯数字" || echo "非法输入"
是纯数字
```

### 4. 수치 관계 비교
단일 대괄호 `[ ]` 내에서 수치 비교는 반드시 관계 연산자를 사용해야 합니다:
- `-eq` (같음)
- `-ne` (같지 않음)
- `-gt` (초과)
- `-ge` (이상)
- `-lt` (미만)
- `-le` (이하)

```bash
[root@web01 dawn02]# [ 10 -gt 5 ] && echo 成立
成立
[root@web01 dawn02]# [ 10 -eq 10 -a 5 -lt 8 ] && echo "多条件满足"
多条件满足
```

---

## 3. if 조건 분기 및 점검 알림 실전

### 1. if 문 문법 구조
#### (1) 단일 분기 구조
```bash
if [ 조건식 ]; then
    실행 명령어 집합
fi
```

#### (2) 이중 분기 구조
```bash
if [ 조건식 ]; then
    명령어 집합 A
else
    명령어 집합 B
fi
```

#### (3) 다중 분기 구조
```bash
if [ 조건식 1 ]; then
    명령어 집합 1
elif [ 조건식 2 ]; then
    명령어 집합 2
else
    기본 대체 명령어 집합
fi
```

---

### 2. 실전 예제 1: 디스크 사용률 모니터링 경보 스크립트 `disk.sh`
`web01`(`11.0.1.7`)에서 루트 파티션 사용률 모니터링:
```bash
[root@web01 dawn02]# cat /server/scripts/dawn02/disk.sh
#!/bin/bash
disk_use=$(df -h | awk '/\/$/{print $(NF-1)}' | tr -d '%')
if [ $disk_use -gt 80 ]; then
    echo "Warning: Disk usage is ${disk_use}%!"
else
    echo "Disk usage is normal: ${disk_use}%"
fi
[root@web01 dawn02]# /server/scripts/dawn02/disk.sh
Disk usage is normal: 13%
```

---

### 3. 실전 예제 2: 운영체제 버전 식별 및 저장소 자동 설정 `os.sh`
`zabbix`(`11.0.1.71`)에서 환경 자동 판별 스크립트 작성:
```bash
[root@zabbix ~]# cat /root/os.sh
#!/bin/bash
os_ver=$(cat /etc/redhat-release | awk '{print $4}' | awk -F. '{print $1}')
if [ "$os_ver" == "7" ]; then
    echo "Current OS is CentOS 7"
elif [ "$os_ver" == "8" ]; then
    echo "Current OS is CentOS 8"
else
    echo "Other OS"
fi
[root@zabbix ~]# /root/os.sh
Current OS is CentOS 7
```

---

## 4. case 제어문 및 서비스 관리 스크립트

분기 조건이 많을 때 `case` 문은 중첩된 `if-elif`보다 가독성이 높고 효율적입니다.

### 1. case 문법 구조
```bash
case "$변수" in
    패턴 1)
        실행 명령 1
        ;;
    패턴 2|패턴 3)
        실행 명령 2
        ;;
    *)
        일치하지 않을 때의 기본 명령
        ;;
esac
```

---

### 2. 실전 예제 1: 시스템 하드웨어 정보 대화형 점검 메뉴
```bash
[root@zabbix ~]# cat << 'EOF' > /root/sys_info.sh
#!/bin/bash
show_menu() {
    echo -e " \033[33m 1. 查看磁盘空间 \033[0m"
    echo -e " \033[33m 2. 查看内存占用 \033[0m"
    echo -e " \033[33m 3. 查看系统负载 \033[0m"
    echo -e " \033[33m 4. 查看在线用户 \033[0m"
    echo -e " \033[33m q. 退出程序 \033[0m"
}
show_menu
while true; do
    read -p "请输入选项编号: " choice
    case "$choice" in
        1)
            df -h
            ;;
        2)
            free -m
            ;;
        3)
            uptime
            ;;
        4)
            w
            ;;
        q|quit|exit)
            echo "感谢使用，退出脚本！"
            exit 0
            ;;
        *)
            echo "输入有误，请输入 [1-4|q]！"
            show_menu
            ;;
    esac
done
EOF
[root@zabbix ~]# chmod +x /root/sys_info.sh
```

---

### 3. 실전 예제 2: Nginx 서비스 수명 주기 관리 스크립트
운영 환경에서 직접 컴파일한 서비스를 표준화된 서비스 형태로 제어:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/nginx_ctl.sh
#!/bin/bash
[ -f /etc/init.d/functions ] && . /etc/init.d/functions
NGINX_BIN="/usr/sbin/nginx"

case "$1" in
    start)
        $NGINX_BIN &>/dev/null
        if [ $? -eq 0 ]; then
            action "Starting Nginx:" /bin/true
        else
            action "Starting Nginx:" /bin/false
        fi
        ;;
    stop)
        $NGINX_BIN -s stop &>/dev/null
        if [ $? -eq 0 ]; then
            action "Stopping Nginx:" /bin/true
        else
            action "Stopping Nginx:" /bin/false
        fi
        ;;
    reload)
        $NGINX_BIN -s reload &>/dev/null
        action "Reloading Nginx:" /bin/true
        ;;
    status)
        netstat -lntup | grep -q ":80 "
        if [ $? -eq 0 ]; then
            echo "Nginx is running (Port 80 is listening)."
        else
            echo "Nginx is stopped."
        fi
        ;;
    restart)
        $NGINX_BIN -s stop &>/dev/null
        sleep 1
        $NGINX_BIN &>/dev/null
        action "Restarting Nginx:" /bin/true
        ;;
    *)
        echo "Usage: $0 {start|stop|reload|restart|status}"
        exit 1
        ;;
esac
EOF
[root@zabbix ~]# chmod +x /root/nginx_ctl.sh
```

---

### 4. 실전 예제 3: Jumpserver 경유지 서버 아키텍처 구현
case 문과 무한 루프를 활용하여 접근 권한이 제어된 터미널 운영 경유지 서버 구축:
```bash
[root@zabbix ~]# cat << 'EOF' > /root/jumpserver.sh
#!/bin/bash
WEB01=11.0.1.7
ZABBIX=11.0.1.71
DAWN=101.133.147.148

trap "echo ' 提示：禁止通过 Ctrl+C 中断跳板机！'" INT TSTP HUP

clear
echo "=========================================="
echo "          DAWN 集群自动化跳板系统          "
echo "=========================================="
echo " 1) 连接 Web01 服务器 (11.0.1.7)"
echo " 2) 连接 Zabbix 监控服务器 (11.0.1.71)"
echo " 3) 连接 Dawn 阿里云外网节点 (101.133.147.148)"
echo " q) 退出当前登录"
echo "=========================================="

while true; do
    read -p "请选择需要接入的服务器 [1-3|q]: " target
    case "$target" in
        1)
            echo "Connecting to web01..."
            ssh -o StrictHostKeyChecking=no root@$WEB01
            ;;
        2)
            echo "Connecting to zabbix..."
            ssh -o StrictHostKeyChecking=no root@$ZABBIX
            ;;
        3)
            echo "Connecting to dawn..."
            ssh -o StrictHostKeyChecking=no root@$DAWN
            ;;
        q|exit)
            echo "安全登出，再见！"
            exit 0
            ;;
        *)
            echo "无效选项，请重新输入！"
            ;;
    esac
done
EOF
[root@zabbix ~]# chmod +x /root/jumpserver.sh
```
