---
title: "Linux awk 텍스트 분석 핵심 가이드: 문법 원리부터 Nginx 접속 로그 통계까지"
date: 2026-11-05T13:56:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "awk", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux 핵심 텍스트 처리 도구인 awk를 체계적으로 분석합니다. 작동 메커니즘과 수명 주기(BEGIN/BODY/END), 핵심 내장 변수 및 printf 포맷 출력, 패턴 매칭과 조건/반복문 제어, 그리고 연관 배열을 활용한 11가지 엔터프라이즈급 Nginx 접속 로그 통계 실전 사례를 다룹니다."
---

# Linux awk 텍스트 분석 핵심 가이드: 문법 원리부터 Nginx 접속 로그 통계까지

`awk`는 Linux/Unix 환경에서 패턴 스캐닝 및 데이터 추출을 위해 특별히 설계된 강력한 텍스트 스트림 처리 도구이자 프로그래밍 언어입니다.

awk의 입력은 표준 입력, 외부 파일 또는 명령 파이프 출력에서 가져올 수 있으며, 프로덕션 자동화 및 대용량 로그(Nginx, Apache, MySQL 로그 등) 분석에서 핵심적인 역할을 수행합니다.

---

## 1. awk 작동 메커니즘 및 문법 구조

### 1. awk 데이터 처리 워크플로우
1. **라인 단위 스캔**: 입력 스트림을 위에서 아래로 한 줄씩 읽어 들여 전체 라인 내용을 내부 변수 `$0`에 할당합니다.
2. **필드 분할**: 필드 구분 기호(`FS` 변수 또는 `-F` 옵션으로 지정, 기본값은 공백 또는 탭)에 따라 각 라인을 분해하여 각각 `$1`, `$2`, ..., `$NF`에 할당합니다.
3. **패턴 매칭**: 패턴(Pattern) 조건과 일치하는 라인을 찾습니다. 패턴을 지정하지 않으면 기본적으로 모든 라인과 일치합니다.
4. **동작 실행**: 해당하는 중괄호 `{action}` 동작을 실행합니다. 동작을 지정하지 않으면 기본적으로 전체 라인을 표준 출력으로 출력합니다.

### 2. 표준 문법 형식
```bash
awk [options] 'commands' filenames
awk [options] -f awk-script-file filenames
```

### 3. options 핵심 옵션 및 명령 단계
- `-F`: 입력 필드 구분 기호 지정(기본값: 공백 또는 Tab)
- `-v`: 사용자 정의 변수 사전 정의

awk 실행 수명 주기는 세 단계로 나뉩니다:
```
行处理前（初始化）        逐行处理阶段             所有行处理完成后
   BEGIN { }          Pattern { action }             END { }
```

#### (1) BEGIN 블록(파일을 읽기 전에 실행)
변수 초기화, 보고서 헤더 출력, 또는 파일을 읽지 않고 수학 연산을 수행할 때 자주 사용됩니다:
```bash
[root@dawn ~]# awk 'BEGIN{print 1/2}'
0.5
```

필드 구분 기호 수정:
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"} {print $1}' /root/passwd
```

출력 필드 구분 기호(`OFS`) 설정:
```bash
[root@dawn ~]# awk 'BEGIN{FS=":"; OFS="---"} {print $1,$3}' /root/passwd
root---0
bin---1
```

실행 흐름 검증:
```bash
[root@dawn ~]# awk 'BEGIN{print "--- START ---"} {print $0} END {print "--- END ---"}' /etc/hosts
--- START ---
127.0.0.1   localhost localhost.localdomain
::1         localhost localhost.localdomain
--- END ---
```

---

## 2. awk 내부 변수 및 포맷 출력

### 1. 핵심 내부 변수 요약
| 변수명 | 설명 |
| :--- | :--- |
| `$0` | 현재 전체 레코드(전체 라인 내용) 저장 |
| `$1` ~ `$NF` | 현재 레코드에서 분할된 1번째 열부터 마지막 열까지의 필드 |
| `NF` | Number of Fields, 현재 라인의 총 필드 수 |
| `NR` | Number of Records, 처리된 레코드의 총 라인 번호(여러 파일에 걸쳐 누적) |
| `FNR` | File Number of Records, 현재 파일 내에서의 라인 번호(파일마다 1부터 시작) |
| `FS` | Field Separator, 입력 필드 구분 기호(기본값: 공백/탭) |
| `OFS` | Output Field Separator, 출력 필드 구분 기호(기본값: 공백, 쉼표 `,`로 트리거) |
| `RS` | Record Separator, 입력 레코드 구분 기호(기본값: 줄바꿈 `\n`) |
| `ORS` | Output Record Separator, 출력 레코드 구분 기호(기본값: 줄바꿈 `\n`) |

### 2. 내부 변수 클래식 실습
#### (1) `$0`과 `NR` 라인 번호
```bash
[root@dawn ~]# awk '{print NR, $0}' /root/passwd | head -n 3
1 root:x:0:0:root:/root:/bin/bash
2 bin:x:1:1:bin:/bin:/sbin/nologin
3 daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) 여러 파일에서 `NR`과 `FNR`의 차이
```bash
[root@dawn ~]# awk '{print "NR="NR, "FNR="FNR, $1}' /etc/hosts /root/file
NR=1 FNR=1 127.0.0.1
NR=2 FNR=2 ::1
NR=3 FNR=1 #
NR=4 FNR=2 #
```

#### (3) 마지막 열 `$NF`와 다중 구분 기호
```bash
[root@dawn ~]# awk -F: '{print NF, $NF}' /root/passwd | head -n 3
7 /bin/bash
7 /sbin/nologin
7 /sbin/nologin
```

집합 구분 기호 지원(공백 또는 콜론으로 동시 분할):
```bash
[root@dawn ~]# awk -F"[ :]" '{print NF, $1, $2}' /root/passwd | head -n 3
7 root x
7 bin x
7 daemon x
```

### 3. print와 printf 포맷 함수
- `print`: 마지막에 줄바꿈 문자를 자동으로 추가합니다.
- `printf`: C 언어 포맷 사양을 엄격히 준수하며 자동 줄바꿈을 하지 않습니다(명시적으로 `\n` 필요). 좌측 정렬 `-` 및 고정 길이 출력을 지원합니다.

```bash
[root@dawn ~]# awk -F: '{printf "%-15s %-10s %-15s\n", $1, $3, $NF}' /root/passwd | head -n 5
root            0          /bin/bash      
bin             1          /sbin/nologin  
daemon          2          /sbin/nologin  
adm             3          /sbin/nologin  
lp              4          /sbin/nologin  
```

---

## 3. 패턴 동작, 표현식 및 조건/반복문

### 1. 패턴 매칭 및 관계 연산자
awk는 정규 표현식 매칭(`~` 포함, `!~` 미포함) 및 숫자 관계 비교(`<`, `<=`, `==`, `!=`, `>=`, `>`)를 지원합니다:

```bash
# root로 시작하는 라인 매칭
[root@dawn ~]# awk '/^root/' /root/passwd

# 1번째 열에 root가 포함되고 UID가 15 이하인 라인 매칭
[root@dawn ~]# awk -F: '$1 ~ /root/ && $3 <= 15' /root/passwd
root:x:0:0:root:/root:/bin/bash

# 로그인 셸이 /bin/bash인 사용자 매칭
[root@dawn ~]# awk -F: '$7 == "/bin/bash" {print $1, $3}' /root/passwd
root 0
```

### 2. datafile 다중 열 데이터 처리 예시
테스트 샘플 `/root/datafile`:
```text
northwest       NW      Charles Dennison        25833   0.25    0.5     0.75
western         WE      Sharon Gray             27548   0.1     0.2     0.3
southwest       SW      Lewis Dalsass           19835   0.15    0.25    0.35
southern        SO      Clara Allen             17087   0.05    0.15    0.25
southeast       SE      Kirk Sanchez            23842   0.2     0.3     0.4
eastern         EA      Peter Guenther          28537   0.3     0.4     0.5
northeast       NE      Richard Phillips        22442   0.25    0.35    0.45
north           NO      Ralph Morgan            14525   0.1     0.2     0.3
central         CT      Ann Stephens            29375   0.35    0.45    0.55
```

실전 명령어:
```bash
[root@dawn ~]# awk '/west/' /root/datafile
[root@dawn ~]# awk '/^north/' /root/datafile
[root@dawn ~]# awk '$3 ~ /^north/' /root/datafile
[root@dawn ~]# awk '{print $3, $2}' /root/datafile
[root@dawn ~]# awk '$2 !~ /E/{print $1, $2}' /root/datafile
```

### 3. 조건문(if-else) 및 카운트 통계
```bash
[root@dawn ~]# awk -F: '{
    if ($3 == 0) {
        admin++
    } else if ($3 > 0 && $3 < 1000) {
        sys++
    } else {
        normal++
    }
}
END {
    print "管理员数量: " admin
    print "系统用户数量: " sys
    print "普通用户数量: " normal
}' /root/passwd
管理员数量: 1
系统用户数量: 24
普通用户数量: 0
```

### 4. 반복문(while 및 for)
```bash
# while 반복문
[root@dawn ~]# awk 'BEGIN{ i=1; while(i<=5){print i; i++} }'

# for 반복문을 통한 필드 순회
[root@dawn ~]# awk -F: 'NR==1 { for(i=1; i<=NF; i++) print "第"i"列:", $i }' /root/passwd
第1列: root
第2列: x
第3列: 0
第4列: 0
第5列: root
第6列: /root
第7列: /bin/bash
```

---

## 4. awk 연관 배열 및 엔터프라이즈 Nginx 로그 분석

### 1. 연관 배열 원리
awk에서 배열은 연관 배열(Associative Arrays)이며, 인덱스는 임의의 문자열 또는 숫자일 수 있습니다.

문법 모델: `array[key]++`는 해당 key를 스캔할 때마다 해당 key에 매핑된 카운터를 1씩 증가시킵니다. `END` 블록에서 `for (k in array)` 루프를 통해 모든 키를 순회합니다.

#### 시스템 사용자 로그인 셸 종류 분포 통계
```bash
[root@dawn ~]# awk -F: '{shells[$NF]++} END{for(i in shells){print i, shells[i]}}' /root/passwd
/bin/bash 1
/sbin/nologin 23
/sbin/halt 1
```

---

### 2. 엔터프라이즈 Nginx 로그 분석 11가지 실전 사례

표준 로그 형식 규격:
```text
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                 '$status $body_bytes_sent "$http_referer" '
                 '"$http_user_agent" "$http_x_forwarded_for"';
```
테스트 로그 경로: `/var/log/nginx/access.log`

#### (1) 2018년 1월 25일 하루 전체 PV 방문 총량 계산
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{pv++} END{print "总PV量:", pv}' /var/log/nginx/access.log
总PV量: 20
```

#### (2) 10:00 ~ 10:05 구간의 PV 방문량 통계
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00"{pv++} END{print "区间PV:", pv}' /var/log/nginx/access.log
区间PV: 7
```

#### (3) 하루 전체 방문량이 가장 많은 Top 10 IP 통계
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
16 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (4) 특정 시간대 내 가장 많이 방문한 Top IP 통계
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:10:00"{ips[$1]++} END{for(i in ips){print ips[i], i}}' /var/log/nginx/access.log | sort -rn | head -n 10
4 11.0.1.1
2 192.168.1.10
1 11.0.1.3
1 11.0.1.2
```

#### (5) 방문 횟수 10회 초과 고빈도 클라이언트 IP 통계
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{ips[$1]++} END{for(i in ips){if(ips[i] > 10){print i, "访问次数:", ips[i]}}}' /var/log/nginx/access.log
11.0.1.1 访问次数: 16
```

#### (6) 가장 많이 방문된 Top 10 페이지($request Top 10) 통계
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{urls[$7]++} END{for(u in urls){print urls[u], u}}' /var/log/nginx/access.log | sort -rn | head -n 10
2 /index.html
1 /test.png
1 /login
1 /doc
1 /api/v1
1 /app.js
1 /about.html
```

#### (7) 각 URL 요청별 소비된 총 대역폭 계산($body_bytes_sent 누적)
```bash
[root@dawn ~]# awk '/25\/Jan\/2018/{req[$7]++; size[$7]+=$10} END{for(u in req){print req[u], u, size[u]" Bytes"}}' /var/log/nginx/access.log | sort -rn | head -n 10
2 /index.html 2048 Bytes
1 /test.png 2048 Bytes
1 /login 512 Bytes
1 /doc 4096 Bytes
1 /api/v1 128 Bytes
1 /app.js 0 Bytes
1 /about.html 1024 Bytes
```

#### (8) 각 IP 요청별 HTTP 상태 코드 분포 통계
```bash
[root@dawn ~]# awk '{ip_code[$1" "$9]++} END{for(ic in ip_code){print ip_code[ic], ic}}' /var/log/nginx/access.log | sort -rn | head -n 10
15 11.0.1.1 200
2 192.168.1.10 200
1 192.168.1.10 404
1 11.0.1.3 500
1 11.0.1.2 404
1 11.0.1.1 304
```

#### (9) 404 상태 코드 발생 횟수 통계
```bash
[root@dawn ~]# awk '$9 == "404"{count++} END{print "404 错误总数:", count}' /var/log/nginx/access.log
404 错误总数: 1
```

#### (10) 특정 시간대 내 404 이상 요청 통계
```bash
[root@dawn ~]# awk '$4 >= "[25/Jan/2018:10:00:00" && $4 <= "[25/Jan/2018:10:05:00" && $9 == "404"{count++} END{print "该时段404数:", count}' /var/log/nginx/access.log
该时段404数: 1
```

#### (11) 웹사이트 전체 HTTP 상태 코드 종합 분포 통계
```bash
[root@dawn ~]# awk '{code[$9]++} END{for(s in code){print "状态码 " s ":", code[s] " 次"}}' /var/log/nginx/access.log
状态码 200: 17 次
状态码 304: 1 次
状态码 404: 1 次
状态码 500: 1 次
```
