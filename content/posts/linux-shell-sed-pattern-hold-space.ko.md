---
title: "Linux sed 스트림 편집기 실전: Pattern Space 및 Hold Space"
date: 2026-11-04T14:10:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "sed", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux 삼총사 중 하나인 sed 스트림 편집기의 핵심 아키텍처를 심층 분석하고, 주요 옵션과 편집 동작을 체계적으로 정리하며, 패턴 공간(Pattern Space)과 홀드 공간(Hold Space)의 상호작용 메커니즘을 상세히 다룹니다. 기업 실무 사례를 바탕으로 다중 편집, 조건 반전 선택 및 구성 파일 일괄 정리 기법을 해설합니다."
---

# Linux sed 스트림 편집기 실전: Pattern Space 및 Hold Space

sed(Stream Editor)는 텍스트 내용을 한 줄씩 처리하는 비대화형 스트림 편집기입니다.

텍스트를 처리할 때 sed는 현재 처리 중인 행을 "패턴 공간"(Pattern Space)이라는 임시 버퍼에 저장합니다. 그런 다음 지정된 sed 명령으로 버퍼의 내용을 처리하고, 처리가 완료되면 버퍼 내용을 화면으로 출력합니다. 이후 다음 행을 읽어 들여 처리하며, 파일 끝까지 이 사이클을 반복합니다. `-i` 매개변수를 사용하거나 리디렉션을 통해 출력을 저장하지 않는 한 sed는 원본 파일을 수정하지 않습니다.

---

## 일, sed 구문 형식 및 핵심 매개변수

### 1. 명령 기본 형식
```bash
sed [options] 'command' file(s)
```

### 2. sed 정규 표현식 지원
sed는 정규 표현식을 사용한 행 또는 텍스트 패턴 매칭을 지원합니다:
- **기본 메타 문자 세트(BRE)**: `^`, `$`, `.`, `*`, `[]`, `[^]`, `\<`, `\>`, `\(\)`, `\{\}`
- **확장 메타 문자 세트(ERE)**: `?`, `+`, `{ }`, `|`, `( )` (`sed -r`을 사용하거나 기본 모드에서 백슬래시 이스케이프 `\+` 필요)

### 3. sed 옵션 매개변수(options)
- `-e`: 다중 항목 편집 허용(한 줄의 명령에서 여러 편집 스크립트 실행)
- `-n`: 기본 패턴 공간 출력 억제(일반적으로 `p` 명령과 함께 사용)
- `-i`: 소스 파일 내용 직접 수정
- `-r`: 확장 정규 표현식(ERE) 지원(`+`, `?`, `()` 등의 기호 이스케이프 불필요)

### 4. sed 내장 명령 동작
| 명령 | 설명 |
| :--- | :--- |
| `p` | 패턴 공간의 내용 출력 |
| `a` | 현재 행 아래에 텍스트 추가 |
| `i` | 현재 행 위에 텍스트 삽입 |
| `c` | 현재 행 전체를 새 텍스트로 치환 수정 |
| `d` | 패턴 공간의 내용을 삭제하고 즉시 다음 행 읽기 |
| `n` | 다음 입력 행을 읽어 들이고 다음 명령부터 처리 시작 |
| `w` | 매칭된 행을 외부 새 파일에 기록 |
| `!` | 선택된 행 이외의 모든 행에 대해 명령 실행(반전 선택) |
| `h` | 패턴 공간(Pattern Space)의 내용을 홀드 공간(Hold Space)에 덮어쓰기 |
| `H` | 패턴 공간의 내용을 홀드 공간에 추가 |
| `g` | 홀드 공간의 내용을 가져와 패턴 공간에 덮어쓰기 |
| `G` | 홀드 공간의 내용을 가져와 패턴 공간 뒤에 추가 |
| `x` | 패턴 공간과 홀드 공간의 내용 교환 |

---

## 이, 기본 편집 작업: 다중 편집 및 CRUD

테스트 샘플은 `dawn` 호스트의 `/root/passwd` 및 `/etc/hosts`를 예로 듭니다

### 1. 다중 항목 편집 작업
#### 방법 1: 파이프라인 캐스케이드 처리
```bash
[root@dawn ~]# sed '1,9d' /root/passwd | sed 's#root#dawn#g'
```

#### 방법 2: `-e` 매개변수 조합 사용
```bash
[root@dawn ~]# sed -e '1,9d' -e 's#root#dawn#g' /root/passwd
```

---

### 2. 출력 명령 `p`
#### (1) halt와 매칭되는 행 출력
```bash
[root@dawn ~]# sed -n '/halt/p' /root/passwd
halt:x:7:0:halt:/sbin:/sbin/halt
```

#### (2) 두 번째 행 출력
```bash
[root@dawn ~]# sed -n '2p' /root/passwd
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) 마지막 행 출력
```bash
[root@dawn ~]# sed -n '$p' /root/passwd
```

---

### 3. 추가 명령 `a` 및 삽입 명령 `i`
- `a`(append): 대상 행 아래에 내용 추가
- `i`(insert): 대상 행 위에 내용 삽입

#### (1) 2번째 행 아래에 새 설정 추가
```bash
[root@dawn ~]# sed '2a listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
listen 80;
daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) 2번째 행 위에 새 설정 삽입
```bash
[root@dawn ~]# sed '2i listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
listen 80;
bin:x:1:1:bin:/bin:/sbin/nologin
```

---

### 4. 전체 행 치환 명령 `c`
#### (1) 행 번호 지정 전체 행 치환
```bash
[root@dawn ~]# sed '7c SELINUX=Disabled' /etc/selinux/config
```

#### (2) 정규식 매칭 위치 지정 후 전체 행 치환
```bash
[root@dawn ~]# sed '/^SELINUX=/c SELINUX=Disabled' /etc/selinux/config
```

#### (3) 기업 실무: 비대화형 시스템 구성 수정
```bash
[root@dawn ~]# sed -ri '/UseDNS/cUseDNS no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/GSSAPIAuthentication/c#GSSAPIAuthentication no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/^SELINUX=/cSELINUX=disabled' /etc/selinux/config
```

---

### 5. 삭제 명령 `d`
#### (1) 특정 단일 행 삭제(예: 3번째 행, 원본 파일에는 영향 없음)
```bash
[root@dawn ~]# sed '3d' /root/passwd
```

#### (2) 3번째 행부터 마지막 행까지 삭제
```bash
[root@dawn ~]# sed '3,$d' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) 마지막 행 삭제
```bash
[root@dawn ~]# sed '$d' /root/passwd
```

#### (4) 모든 내용 삭제
```bash
[root@dawn ~]# sed '1,$d' /root/passwd
```

#### (5) 지정된 패턴 매칭 행 삭제
```bash
[root@dawn ~]# sed '/mail/d' /root/passwd
```

---

### 6. 파일 쓰기 명령 `w`
#### (1) 매칭된 행을 새 파일에 쓰기
```bash
[root@dawn ~]# sed -n '/root/w newfile' /root/passwd
[root@dawn ~]# cat newfile
root:x:0:0:root:/root:/bin/bash
```

#### (2) 2번째 행을 개별 추출하여 새 파일에 쓰기
```bash
[root@dawn ~]# sed -n '2w newfile' /root/passwd
```

---

### 7. 다중 행 처리 명령 `n`
`n`은 다음 행을 패턴 공간으로 읽어 들여 후속 명령이 다음 행에 적용되도록 합니다

#### (1) root 행 매칭 후 root 다음 행 삭제
```bash
[root@dawn ~]# sed '/root/{n;d}' /root/passwd
```

#### (2) root 행 매칭 후 다음 행의 내용 치환
```bash
[root@dawn ~]# sed '/root/{n; s/bin/dawn/}' /root/passwd
```

---

## 삼, 고급 아키텍처: Pattern Space 및 Hold Space 원리 심층 분석

### 1. sed 실행 흐름 메커니즘
sed는 스트림 지향 라인 편집기입니다. 스트림 지향이란 표준 입력을 받아 한 줄씩 읽어 들여 표준 출력으로 내보내는 것을 의미합니다.

구체적인 과정은 다음과 같습니다: sed는 처리할 행을 임시 버퍼(패턴 공간 Pattern Space)로 읽어 들이고, sed 스크립트의 명령이 순차적으로 이 버퍼에 적용됩니다. 모든 명령 처리가 완료되면 버퍼 내용을 화면에 출력하고 Pattern Space를 비웁니다. 그런 다음 다음 행을 읽어 들이며 파일 끝까지 위 사이클을 반복합니다.

### 2. Pattern Space 및 Hold Space 개념
- **Pattern Space(패턴 공간)**: **작업장**에 해당하며, sed는 현재 읽어 들인 행을 여기에 두고 가공 처리합니다.
- **Hold Space(홀드 공간)**: **창고**에 해당하며, 가공 처리 중 임시 반제품 데이터를 보관하는 데 사용됩니다.

### 3. 고급 공간 조작 명령
- `h`: Pattern Space 내용을 Hold Space에 덮어쓰기
- `H`: Pattern Space 내용을 Hold Space에 추가
- `g`: Hold Space 내용을 가져와 Pattern Space에 덮어쓰기
- `G`: Hold Space 내용을 가져와 Pattern Space에 추가
- `x`: Pattern Space와 Hold Space의 내용 상호 교환

### 4. 공간 조작 클래식 실전 사례

#### 사례 1: 1번째 행을 홀드 영역에 쓰고 마지막 행 치환
```bash
[root@dawn ~]# sed '1h;$g' /etc/hosts
```

#### 사례 2: 1번째 행을 홀드 영역에 쓰고 마지막 행 뒤에 추가 호출
```bash
[root@dawn ~]# sed '1h;$G' /etc/hosts
```

#### 사례 3: 1번째 행을 삭제하여 홀드 영역에 보관한 후 마지막 행 뒤에 추가
```bash
[root@dawn ~]# sed -r '1{h;d};$G' /etc/hosts
```

#### 사례 4: 1번째 행을 홀드 영역에 쓰고 2번째 행부터 모두 1번째 행으로 치환
```bash
[root@dawn ~]# sed -r '1h;2,$g' /etc/hosts
```

#### 사례 5: 파일 역순 정렬 실전 `sed '1!G;h;$!d'`
- `1!G`: 첫 번째 행에서는 G 추가를 실행하지 않고(첫 줄에 불필요한 빈 줄바꿈 방지), 두 번째 행부터 홀드 영역 내용 추가.
- `h`: 현재 패턴 공간 내용을 홀드 영역에 저장.
- `$!d`: 마지막 행을 제외하고 각 행 처리 완료 후 패턴 공간을 비우고 출력하지 않음.

```bash
[root@dawn ~]# cat << EOF > /root/num.txt
1 1 1
2 2 2
3 3 3
EOF

[root@dawn ~]# sed '1!G;h;$!d' /root/num.txt
3 3 3
2 2 2
1 1 1
```

---

## 사, 조건 반전 선택 및 고급 정규식 치환

### 1. 반전 선택 명령 `!`
#### 3번째 행을 제외한 모든 행 삭제
```bash
[root@dawn ~]# sed -r '3!d' /etc/hosts
```

---

### 2. 매칭 치환 명령 `s` 고급
- 구문: `s/pattern/replacement/flags`
- 주요 flags:
  - `g`: 행 내 모든 일치 항목 전역 치환
  - `i`: 대소문자 구분 없이 매칭
  - `&`: 이전 정규식에서 매칭된 전체 내용을 나타냄

#### (1) 각 행에서 처음 나타나는 문자 치환
```bash
[root@dawn ~]# sed 's/root/alice/' /root/passwd
```

#### (2) 행 시작 일치 항목만 치환
```bash
[root@dawn ~]# sed 's/^root/alice/' /root/passwd
```

#### (3) 매칭 행 뒤에 지정된 문자열 추가(`&` 사용)
```bash
[root@dawn ~]# sed -r 's/[0-9][0-9]$/& .5/' /root/passwd
```

#### (4) 전역 치환 및 대소문자 무시
```bash
[root@dawn ~]# sed -r 's/root/alice/g' /root/passwd
[root@dawn ~]# sed -r 's/root/alice/gi' /root/passwd
```

#### (5) 정규식 그룹화 및 역참조(Backreference)
소괄호 `()`로 그룹화하고 역참조는 `\1`, `\2`로 호출합니다:
```bash
[root@dawn ~]# sed -r 's#(root)#\1-alice#g' /root/passwd
```

시스템 IP 주소 추출 실전:
```bash
[root@dawn ~]# ip addr show eth0 | grep "inet " | sed -r 's#^.*inet ([0-9.]+)/.*$#\1#'
101.133.147.148
```

#### (6) 경로 치환 구분 기호 팁
치환 내용에 다량의 슬래시 `/`(예: 파일 경로)가 포함된 경우 일반 구분 기호 `/` 대신 `#` 또는 `@`를 사용하는 것이 좋습니다:
```bash
[root@dawn ~]# sed -r 's#/etc/abc/456#/dev/null#g' a.txt
[root@dawn ~]# sed -r 's@/etc/abc/456@/dev/null@g' a.txt
```

---

## 오, 구성 파일 일괄 정리 및 주석 관리

테스트 샘플 `/root/file` 내용은 다음과 같습니다:
```bash
[root@dawn ~]# cat /root/file
# This is a sample config
   # Tabbed comment
#Another comment

listen 80;
server_name localhost;
```

### 1. 주석 행 및 빈 행 필터링 및 삭제
#### (1) 행 시작 `#` 주석 삭제(공백이나 탭이 포함된 주석은 삭제 불가)
```bash
[root@dawn ~]# sed '/^#/d' /root/file
```

#### (2) 탭 또는 공백으로 시작하는 주석 행 정확히 삭제
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d' /root/file
```

#### (3) 내용 없는 빈 행 삭제
```bash
[root@dawn ~]# sed -r '/^[ \t]*$/d' /root/file
```

#### (4) 모든 주석 행 및 순수 빈 행 원클릭 삭제(엔터프라이즈 빈번 사용)
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d; /^[ \t]*$/d' /root/file
listen 80;
server_name localhost;
```
동일한 구문:
```bash
[root@dawn ~]# sed -r '/^[ \t]*($|#)/d' /root/file
listen 80;
server_name localhost;
```

---

### 2. 주석 문자 일괄 추가 및 관리
#### (1) 2번째 행부터 4번째 행까지 `#` 주석 추가
```bash
[root@dawn ~]# sed '2,4s/^/#/' /root/file
```

#### (2) 들여쓰기 행에 표준화된 주석 추가
```bash
[root@dawn ~]# sed -r '2,5s/^[ \t]*#*/# /' /root/file
```
