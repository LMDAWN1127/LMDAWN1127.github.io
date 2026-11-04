---
title: "Linux 기초 실전: 정규 표현식(BRE/ERE) 및 grep 텍스트 필터링"
date: 2026-11-04T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "Regex", "grep", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux 운영 관리의 기본 정규 표현식(BRE)과 확장 정규 표현식(ERE)을 체계적으로 정리하고, dawn 호스트에서 14가지 핵심 실전 사례를 통해 grep 텍스트 필터링 명령어를 깊이 있게 분석합니다."
---

# Linux 기초 실전: 정규 표현식(BRE/ERE) 및 grep 텍스트 필터링

정규 표현식(Regular Expression, 약칭 RE)은 검색 과정에서 지정된 문자와 일치하는 패턴을 찾는 데 사용되는 문자 패턴입니다.

대부분의 프로그램에서 정규 표현식은 두 개의 슬래시 사이에 위치합니다. 예를 들어 `/l[oO]ve/`는 슬래시로 둘러싸인 정규 표현식으로, 검색 대상 라인의 어느 위치에서든 동일한 패턴과 일치합니다. 정규 표현식에서 메타 문자는 가장 중요한 개념입니다.

### 정규 표현식의 역할
1. Linux 삼총사의 핵심 기초: `grep`, `sed`, `awk`
2. 대량의 문자열 파일에 대한 비대화형 자동화 구성 및 수정
3. 관련 문자열의 빠른 필터링, 패턴 매칭 및 특정 텍스트 라인 추출

### 정규 표현식 주의사항
1. 정규 표현식은 매우 광범위하게 응용되며 다양한 프로그래밍 언어(PHP, Python, Java, Go 등)에 존재합니다.
2. 정규 표현식과 Shell 와일드카드(Wildcards)는 본질적인 차이가 있습니다. 와일드카드는 주로 파일명 매칭(Bash가 해석)에 사용되고, 정규 표현식은 파일 내부의 텍스트 내용 매칭에 사용됩니다.

---

## 일, 기본 정규 표현식(BRE) 및 확장 정규 표현식(ERE)

메타 문자(Metacharacters)는 특정한 기능적 의미가 부여된 특수 문자입니다.

| 정규 표현식 | 설명 |
| :--- | :--- |
| `\` | 이스케이프 문자, 특수 문자를 이스케이프하여 특수한 문법적 의미를 무시 |
| `^` | 행의 시작과 일치; awk에서는 문자열의 시작을 나타냄 |
| `$` | 행의 끝과 일치; awk에서는 문자열의 끝을 나타냄 |
| `^$` | 빈 라인 매칭을 나타냄 |
| `.` | 줄바꿈 문자 `\n`을 제외한 모든 단일 문자와 일치 |
| `.*` | 임의 길이의 모든 문자와 일치(탐욕적 매칭) |
| `[ ]` | 문자 세트, 대괄호 안에 포함된 임의의 한 문자와 일치 |
| `[^ ]` | 부정 문자 세트, 대괄호 외부의 임의의 한 문자와 일치 |
| `[ - ]` | 대괄호로 지정된 범위 내의 임의의 한 문자와 일치(예: `[a-z]`, `[0-9]`) |
| `?` | 이전 항목과 0회 또는 1회 일치(확장 정규식, grep에서는 `-E` 필요) |
| `+` | 이전 항목과 1회 이상 일치(확장 정규식, grep에서는 `-E` 필요) |
| `*` | 이전 항목과 0회 이상 일치 |
| `( )` | 그룹화 표현식, 매칭 또는 역참조를 위한 하위 문자열 생성 |
| `{ n }` | 이전 항목과 정확히 n회 일치(n은 0 이상의 정수) |
| `{ n, }` | 이전 항목과 최소 n회 일치 |
| `{ n,m }` | 이전 항목과 최소 n회, 최대 m회 일치(n <= m) |
| `|` | 논리합(OR), 수직선 양쪽의 임의 항목과 일치(예: `ab(c|d)`는 `abc` 또는 `abd`와 일치) |

### POSIX 특정 문자 클래스
- `[[:space:]]`: 모든 공백 문자(스페이스, 탭 등)와 일치
- `[[:digit:]]`: 숫자와 일치(`[0-9]`와 동일)
- `[[:lower:]]`: 소문자와 일치(`[a-z]`와 동일)
- `[[:upper:]]`: 대문자와 일치(`[A-Z]`와 동일)
- `[[:alpha:]]`: 모든 대소문자와 일치(`[a-zA-Z]`와 동일)

---

## 이, grep 정규 표현식 14가지 실전 사례

```bash
[root@dawn ~]# cat /root/test.txt
I am czu student!
I study linux.
test

I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 1. m으로 시작하는 라인 필터링
```bash
[root@dawn ~]# grep "^m" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
```

### 2. m으로 끝나는 라인 필터링
```bash
[root@dawn ~]# grep "m$" /root/test.txt
our site is http:www.dawn.com
```

### 3. 빈 라인 제외 및 라인 번호 출력
`-v` 매개변수는 반전 매칭을 나타내며, `-n` 매개변수는 해당 라인 번호를 표시합니다:
```bash
[root@dawn ~]# grep -vn "^$" /root/test.txt
1:I am czu student!
2:I study linux.
3:test
5:I like badminton ball ,billiard ball and chinese chess!
6:my blog is https://lmdawn1127.github.io
7:our site is http:www.dawn.com
8:my qq num is 3252408778
9:not 88888888.
```

### 4. 임의의 단일 문자 매칭(빈 라인 제외)
```bash
[root@dawn ~]# grep "." /root/test.txt
I am czu student!
I study linux.
test
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 5. 모든 문자 매칭(빈 라인 포함)
```bash
[root@dawn ~]# grep ".*" /root/test.txt
I am czu student!
I study linux.
test

I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 6. 단일 임의 문자 매칭
점 `.`은 줄바꿈을 제외한 모든 단일 문자와 일치합니다. 예를 들어 `c`로 시작하고 `u`로 끝나며 가운데에 임의의 단일 문자가 있는 패턴과 일치:
```bash
[root@dawn ~]# grep "c.u" /root/test.txt
I am czu student!
```
`d.wn`과도 일치할 수 있습니다(dawn이 포함된 라인 매칭):
```bash
[root@dawn ~]# grep "d.wn" /root/test.txt
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 7. 점 `.`으로 끝나는 라인 매칭
마침표는 정규식에서 특수 메타 문자이므로 리터럴 값을 일치시키려면 `\`를 사용하여 이스케이프해야 합니다:
```bash
[root@dawn ~]# grep "\.$" /root/test.txt
I study linux.
not 88888888.
```

### 8. 연속 매칭된 내용 정확히 추출(-o 매개변수)
`-o` 매개변수는 각 행에서 정확히 매칭된 문자만 출력하며, 빈 라인 필터링과 결합됩니다:
```bash
[root@dawn ~]# grep -o "8*" /root/test.txt | grep -v "^$"
8
8
88888888
```

### 9. 지정된 문자 세트([abc])가 포함된 라인 매칭
```bash
[root@dawn ~]# grep "[abc]" /root/test.txt
I am czu student!
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
```

### 10. 숫자([0-9])가 포함된 라인 매칭
```bash
[root@dawn ~]# grep "[0-9]" /root/test.txt
my blog is https://lmdawn1127.github.io
my qq num is 3252408778
not 88888888.
```

### 11. 소문자([a-z])가 포함된 라인 매칭
```bash
[root@dawn ~]# grep "[a-z]" /root/test.txt
I am czu student!
I study linux.
test
I like badminton ball ,billiard ball and chinese chess!
my blog is https://lmdawn1127.github.io
our site is http:www.dawn.com
my qq num is 3252408778
not 88888888.
```

### 12. 반복 문자 매칭(BRE 모드에서 \{3\} 사용)
기본 정규 표현식에서는 중괄호를 백슬래시로 이스케이프해야 합니다(연속된 3개의 8 매칭):
```bash
[root@dawn ~]# grep "8\{3\}" /root/test.txt
not 88888888.
```

### 13. 숫자 8이 3~5회 반복 출현(ERE 모드)
`-E`를 사용하여 확장 정규 표현식을 활성화하면 중괄호 이스케이프가 필요하지 않습니다:
```bash
[root@dawn ~]# grep -E "8{3,5}" /root/test.txt
not 88888888.
```

### 14. 최소 1회 이상 출현 매칭(+ 또는 {1,})
```bash
[root@dawn ~]# grep -E "8{1,}" /root/test.txt
my qq num is 3252408778
not 88888888.
```
`+` 메타 문자를 사용하는 것과 동일합니다:
```bash
[root@dawn ~]# grep -E "8+" /root/test.txt
my qq num is 3252408778
not 88888888.
```
