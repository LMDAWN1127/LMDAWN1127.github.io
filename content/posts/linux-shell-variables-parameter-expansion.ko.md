---
title: "Shell 프로그래밍 실전 (1편): 스크립트 작성 표준, 변수 분류 및 문자열 슬라이싱/치환"
date: 2026-11-05T14:30:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "엔터프라이즈 환경에서의 Shell 스크립트 작성 규칙과 실행 메커니즘을 체계적으로 정리합니다. 전역 환경변수, 로컬 변수, 특수 위치 매개변수($0~$9, $#, $*, $@, $?)를 심층 분석하고, Bash 내장 문자열 슬라이싱, 길이 측정, 패턴 삭제 및 치환 기법을 상세히 다룹니다."
---

# Shell 프로그래밍 실전 (1편): 스크립트 작성 표준, 변수 분류 및 문자열 슬라이싱/치환

---

## 1. Shell 및 스크립트 개발 표준

### 1. Shell과 Shell 스크립트의 이해
- **Shell**: 명령어 해석기. 사용자가 터미널에 입력한 명령을 받아 운영체제 커널(Kernel)에 전달하고, 커널이 하드웨어를 스케줄링하여 실행한 결과를 다시 터미널에 반환합니다.
  - **대화형 Shell**: 사용자가 터미널에 명령어를 입력하면 즉시 실행되어 결과를 반환합니다.
  - **비대화형 Shell**: 스크립트 파일 또는 파이프에서 일괄 명령어를 연속적으로 읽어 사람의 개입 없이 실행합니다.
- **Shell 스크립트(Script)**: 일련의 Linux 명령어, 제어문(조건문, 반복문), 함수 등을 업무 로직에 맞게 텍스트 파일에 구성하여 해석기가 실행하는 프로그램 파일입니다.

Linux 기본 인터프리터는 Bash입니다:
```bash
[root@dawn ~]# echo $SHELL
/bin/bash
```

### 2. 엔터프라이즈급 Shell 스크립트 작성 규약
1. **확장자 통일**: 스크립트 파일명은 반드시 `.sh`로 끝나도록 작성하며, 직관적인 이름을 부여합니다(예: `check_disk.sh`).
2. **인터프리터 선언**: 첫 번째 라인에 표준 형식인 Shebang(`#!/bin/bash`)을 명시해야 합니다.
3. **메타 정보 주석**: 스크립트 상단에 작성자, 작성일, 기능 설명 및 버전 정보를 기재합니다.
4. **명확한 코드 주석**: 핵심 로직, 복잡한 정규식 및 주요 함수에는 주석을 명확히 작성합니다.
5. **반각 영문 기호 사용**: 모든 따옴표(`""`, `''`), 백틱, 괄호(`[]`, `[[]]`, `{}`, `()`), 세미콜론 및 콜론은 영문 반각 문자를 사용합니다.
6. **쌍으로 이루어진 기호 즉시 작성**: 괄호나 따옴표는 작성 시 한 번에 열고 닫아 구문 오류를 방지합니다.

### 3. 첫 번째 Shell 스크립트 작성 및 3가지 실행 방식
`web01`(`11.0.1.7`) 호스트의 `/server/scripts/dawn01` 디렉터리에 `test.sh`를 생성합니다:
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/test.sh
#!/bin/bash
echo "hehe"
EOF
```

#### 실행 방식 1: 인터프리터를 통한 직접 실행 (실행 권한 불필요)
```bash
[root@web01 dawn01]# sh /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# bash /server/scripts/dawn01/test.sh
hehe
```

#### 실행 방식 2: 경로를 통한 직접 실행 (+x 실행 권한 필수)
```bash
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/test.sh
[root@web01 dawn01]# /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# ./test.sh
hehe
```

#### 실행 방식 3: source 또는 점(.)을 통한 실행 (현재 부모 Shell에 로드)
```bash
[root@web01 dawn01]# . /server/scripts/dawn01/test.sh
hehe
[root@web01 dawn01]# source /server/scripts/dawn01/test.sh
hehe
```

> **핵심 메커니즘 차이**:
>
> - 방식 1과 방식 2는 **서브셸(Subshell)**에서 실행됩니다. 스크립트 내부 변수는 스크립트 종료 시 자동으로 소멸되며 현재 터미널 환경에 영향을 미치지 않습니다.
> - 방식 3(`source` 또는 `.`)은 **현재 부모 Shell**에서 직접 실행됩니다. 스크립트 내 정의된 변수 및 환경 변경 사항이 현재 터미널 환경에 그대로 유지됩니다.

---

## 2. Shell 변수 분류 및 정의 규칙

### 1. 변수의 개념 및 분류
고정된 식별자를 통해 동적이거나 가변적인 값을 나타내는 것을 변수라고 합니다.
- **전역 변수(환경 변수)**: 시스템 내장 또는 `export`로 내보낸 변수로, 현재 부모 Shell 및 파생된 모든 자식 Subshell에 적용됩니다.
- **지역 변수(일반 변수)**: 사용자 정의 변수로, 선언된 현재 Shell 세션 또는 스크립트 내부로 유효 범위가 한정됩니다.

### 2. 변수 수명 주기 및 설정 파일
- **임시 변수**: 터미널에서 `name=dawn` 또는 `export name=dawn`으로 직접 선언하며 터미널 종료 시 만료됩니다.
- **영구 변수**: 시스템 또는 사용자 설정 파일에 저장합니다:
  - `/etc/profile`: 모든 사용자의 로그인 시 로드(가장 보편적)
  - `~/.bash_profile`: 현재 사용자의 로그인 시 로드
  - `~/.bashrc`: 현재 사용자가 새 Bash 인스턴스를 실행할 때 로드
  - `/etc/bashrc`: 비로그인 Shell 시작 시 시스템 전역 로드

### 3. 변수 정의 규칙 및 할당 유형
#### (1) 명명 규칙
영문자, 숫자, 밑줄로 구성되며, **숫자로 시작할 수 없습니다**. 등호 `=` 양쪽에 **공백이 있어서는 안 됩니다**. 환경 변수는 대문자(예: `NGINX_PORT`), 일반 변수는 소문자 또는 스네이크 표기법(예: `user_age`)을 권장합니다.

#### (2) 문자열 할당 (작은따옴표 vs 큰따옴표)
- **작은따옴표 `''`**: 보이는 그대로 취급되며, 내부의 특수 문자(`$`, `\` 포함)가 일반 텍스트로 처리되어 변수가 확장되지 않습니다.
- **큰따옴표 `""`**: 약한 참조로, 내부의 변수 확장, 명령 대체 및 이스케이프 문자를 해석합니다.
```bash
[root@web01 ~]# name="dawn"
[root@web01 ~]# test_single='name: $name'
[root@web01 ~]# echo $test_single
name: $name

[root@web01 ~]# test_double="name: $name"
[root@web01 ~]# echo $test_double
name: dawn
```

#### (3) 변수 결합 및 중괄호 격리
변수 뒤에 바로 다른 문자가 이어질 경우, 경계를 명확히 하기 위해 변수명을 `{}`로 감싸야 합니다:
```bash
[root@web01 ~]# ip="11.0.1.7"
[root@web01 ~]# host="web01"
[root@web01 ~]# echo "$ip_$host"
web01
[root@web01 ~]# echo "${ip}_$host"
11.0.1.7_web01
```

#### (4) 명령 실행 결과 할당 (백틱 vs `$()`)
시스템 명령의 출력을 캡처하여 변수에 할당할 때 `$()` 사용을 권장합니다:
```bash
[root@web01 ~]# count=$(cat /etc/passwd | wc -l)
[root@web01 ~]# echo $count
27

# 동적 시간 변수
[root@web01 ~]# now_time=$(date +%F_%H-%M-%S)
[root@web01 ~]# echo $now_time
2026-11-04_12-40-00
```

---

## 3. Shell 위치 매개변수 및 내장 특수 변수

### 1. 핵심 위치 매개변수
| 변수명 | 의미 및 기능 |
| :--- | :--- |
| `$0` | 현재 실행 중인 스크립트 파일명 (경로로 실행 시 전체 경로 포함) |
| `$1` ~ `$9` | 스크립트에 전달된 1번째부터 9번째 위치 인수 |
| `${10}` ~ `${n}` | 10번째 이상의 위치 인수 (중괄호 `{}` 필수) |
| `$#` | 스크립트에 전달된 위치 인수의 총 개수 |
| `$*` | 모든 위치 인수. 큰따옴표 `"$*"`로 감쌀 경우 하나의 단일 문자열 `"$1 $2 ..."`로 취급 |
| `$@` | 모든 위치 인수. 큰따옴표 `"$@"`로 감쌀 경우 각 인수를 독립된 문자열 `"$1" "$2" ...`로 유지 |
| `$?` | 직전에 실행된 명령어의 종료 상태 코드 (`0`은 성공, `0`이 아니면 실패) |
| `$$` | 현재 실행 중인 Shell 스크립트의 프로세스 PID |
| `$!` | 가장 최근에 백그라운드로 실행된 프로세스의 PID |
| `$_` | 이전 명령어의 마지막 인수 |

### 2. 위치 매개변수 실습 검증
`web01` 호스트에서 다중 인수 출력 스크립트를 작성합니다:
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/pos.sh
#!/bin/bash
echo "脚本名称 \$0: $0"
echo "第 1 个参数 \$1: $1"
echo "第 2 个参数 \$2: $2"
echo "第 10 个参数 \${10}: ${10}"
echo "参数总数 \$#: $#"
EOF
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/pos.sh
[root@web01 dawn01]# /server/scripts/dawn01/pos.sh {a..z}
脚本名称 $0: /server/scripts/dawn01/pos.sh
第 1 个参数 $1: a
第 2 个参数 $2: b
第 10 个参数 ${10}: j
参数总数 $#: 26
```

### 3. 큰따옴표 루프 순회 시 `$*`와 `$@`의 결정적 차이
```bash
[root@web01 dawn01]# set -- "I am" dawn 18

# "$*"는 전체를 하나의 문자열로 취급
[root@web01 dawn01]# for i in "$*"; do echo "$i"; done
I am dawn 18

# "$@"는 각 인수를 개별 요소로 유지
[root@web01 dawn01]# for i in "$@"; do echo "$i"; done
I am
dawn
18
```

---

## 4. Shell 매개변수 전달 방식 실전

자동화 운영 관리에서 외부 데이터를 스크립트에 전달하는 주요 3가지 방식입니다:

### 1. 명령줄 직접 위치 인수 전달
자동화 스케줄링, Crontab 정기 작업 및 백그라운드 스크립트에 적합합니다:
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/url.sh
#!/bin/bash
[ $# -ne 1 ] && echo "Usage: $0 <domain>" && exit 1
ping -c 1 -W 1 "$1" &>/dev/null
if [ $? -eq 0 ]; then
    echo "主机 $1: 网络畅通 (ONLINE)"
else
    echo "主机 $1: 无法访问 (OFFLINE)"
fi
EOF
[root@web01 dawn01]# chmod +x /server/scripts/dawn01/url.sh
[root@web01 dawn01]# /server/scripts/dawn01/url.sh 11.0.1.71
主机 11.0.1.71: 网络畅通 (ONLINE)
```

### 2. 내부 변수 명시적 재할당 전달
`$1`, `$2`를 의미 있는 내부 변수에 할당하여 가독성과 유지보수성을 향상시킵니다:
```bash
[root@web01 dawn01]# cat << 'EOF' > /server/scripts/dawn01/user_info.sh
#!/bin/bash
username="$1"
userage="$2"
echo "Username is: $username, Age is: $userage"
EOF
[root@web01 dawn01]# sh /server/scripts/dawn01/user_info.sh dawn 25
Username is: dawn, Age is: 25
```

### 3. `read`를 이용한 대화형 입력 전달
대화형 설치 마법사나 셋업 스크립트에 적합합니다 (`-p` 프롬프트 안내, `-t` 타임아웃, `-s` 비밀번호 마스킹 지원):
```bash
[root@web01 dawn02]# cat /server/scripts/dawn02/name.sh
#!/bin/bash
read -p "请输入你的姓名和年龄: " name age
echo "name=$name"
echo "age=$age"
```

---

## 5. 고급 문자열 처리: 슬라이싱, 길이 측정, 삭제 및 치환

Bash 내장 파라미터 확장 문법을 활용하면 외부 명령(awk, sed, cut 등)을 호출하지 않고도 빠르고 효율적으로 문자열을 처리할 수 있습니다.

### 1. 문자열 슬라이싱 추출 `${var:start:length}`
```bash
[root@web01 dawn02]# name="I am dawn"
[root@web01 dawn02]# echo ${name:2}      # 인덱스 2부터 끝까지 추출
am dawn
[root@web01 dawn02]# echo ${name:2:2}    # 인덱스 2부터 2글자 추출
am
[root@web01 dawn02]# echo ${name:5:8}    # 인덱스 5부터 8글자 추출
dawn
```

### 2. 문자열 길이 측정
#### 방식 1: 내장 문법 `${#var}` (가장 효율적, 권장)
```bash
[root@web01 dawn02]# echo ${#name}
13
```

#### 방식 2: 외부 명령과의 비교
```bash
[root@web01 dawn02]# echo -n "$name" | wc -c
13
[root@web01 dawn02]# expr length "$name"
13
[root@web01 dawn02]# echo "$name" | awk '{print length}'
13
```

---

### 3. 패턴 삭제 (접두사 및 접미사 잘라내기)
- `${var#pattern}`: 앞에서부터 검색하여 **최단 일치** 항목 삭제
- `${var##pattern}`: 앞에서부터 검색하여 **최장 일치(탐욕적)** 항목 삭제
- `${var%pattern}`: 뒤에서부터 검색하여 **최단 일치** 항목 삭제
- `${var%%pattern}`: 뒤에서부터 검색하여 **최장 일치(탐욕적)** 항목 삭제

```bash
[root@web01 dawn02]# url="www.baidu.com"

# 앞에서부터 삭제
[root@web01 dawn02]# echo ${url#*.}     # 첫 번째 점까지 삭제
baidu.com
[root@web01 dawn02]# echo ${url##*.}    # 마지막 점까지 최장 삭제
com

# 뒤에서부터 삭제
[root@web01 dawn02]# echo ${url%.*}     # 마지막 점 이후 내용 삭제
www.baidu
[root@web01 dawn02]# echo ${url%%.*}    # 첫 번째 점 이후 모든 내용 최장 삭제
www

# 운영 실전: 디스크 사용률에서 퍼센트 기호(%) 제거
[root@web01 dawn02]# disk_use=$(df -h | awk '/\/$/{print $(NF-1)}')
[root@web01 dawn02]# echo $disk_use
13%
[root@web01 dawn02]# echo ${disk_use%\%}
13
```

---

### 4. 문자열 내용 치환
- `${var/old/new}`: 일치하는 **첫 번째** 문자열만 치환
- `${var//old/new}`: 일치하는 **모든** 문자열을 전역 치환

```bash
[root@web01 dawn02]# url="www.baidu.com"
[root@web01 dawn02]# echo ${url/baidu/dark}
www.dark.com

[root@web01 dawn02]# echo ${url/w/W}
Www.baidu.com
[root@web01 dawn02]# echo ${url//w/W}
WWW.baidu.com
```

---

### 5. 기본값 설정 및 대체 평가
| 표현식 | 변수 값이 있고 비어있지 않은 경우 | 변수가 정의되지 않았거나 빈 경우 |
| :--- | :--- | :--- |
| `${var:-word}` | `$var`의 실제 값 반환 | `word`를 반환하지만 `$var`는 **변경하지 않음** |
| `${var:=word}` | `$var`의 실제 값 반환 | `word`를 반환하고 **`$var`에 `word`를 할당함** |
| `${var:?word}` | `$var`의 실제 값 반환 | `word`를 표준 에러로 출력하고 **실행을 중단 종료** |
| `${var:+word}` | `word` 반환 | 빈 값 반환 (변수 존재 여부 테스트용) |

검증 예시:
```bash
[root@web01 dawn02]# unset my_port
[root@web01 dawn02]# echo ${my_port:-8080}
8080
[root@web01 dawn02]# echo $my_port
# 원래 변수는 여전히 비어있음

[root@web01 dawn02]# echo ${my_port:=8080}
8080
[root@web01 dawn02]# echo $my_port
8080
# 원래 변수에 기본값 8080이 성공적으로 할당됨
```
