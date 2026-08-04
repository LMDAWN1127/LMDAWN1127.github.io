---
title: "Dockerfile에서 COPY와 ADD의 차이점 완벽 정리"
date: 2026-07-30T10:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "컨테이너화", "DevOps"]
categories: ["컨테이너 기술"]
description: "COPY와 ADD 모두 파일을 복사할 수 있지만 동작 방식에 큰 차이가 있습니다. 이 글에서는 비교와 예제를 통해 두 명령어의 차이점을 명확하게 설명합니다."
summary: "COPY와 ADD 모두 파일을 복사할 수 있지만 근본적인 차이가 있습니다. 이 글에서는 두 명령어의 차이점을 상세히 분석하여 더 나은 Dockerfile을 작성할 수 있도록 도와드립니다."
showToc: true
TocOpen: true
---

#### 1. 기본 문법

두 명령어의 문법은 거의 동일하지만 동작 방식에 큰 차이가 있습니다:

```dockerfile
# COPY - 순수한 파일 복사, 추가 처리를 하지 않음
COPY [--chown=<user>:<group>] <src>... <dest>

# ADD - 자동 압축 해제 및 원격 URL을 지원하지만 예측 불가능한 동작 가능
ADD [--chown=<user>:<group>] <src>... <dest>
```

#### 2. 압축 파일 자동 해제

***ADD***는 로컬 압축 파일을 자동으로 해제하지만 ***COPY***는 그렇지 않습니다:

```dockerfile
# ADD는 .tar.gz를 자동 해제
ADD app.tar.gz /opt/app/
# 결과: /opt/app/ 아래에 압축이 해제된 내용

# COPY는 파일 자체만 복사
COPY app.tar.gz /opt/app/
# 결과: /opt/app/app.tar.gz는 원본 압축 파일
```

지원하는 압축 형식: `.tar`, `.tar.gz`/`.tgz`, `.tar.bz2`, `.tar.xz`

> 압축 파일을 그대로 복사하고 해제하지 않으려면 반드시 COPY를 사용해야 합니다.

#### 3. 원격 URL 다운로드

***ADD***는 URL에서 직접 파일을 다운로드할 수 있지만 ***COPY***는 지원하지 않습니다:

```dockerfile
# ADD는 원격 파일 다운로드 가능 (하지만 권장하지 않음)
ADD https://example.com/app.tar.gz /opt/

# COPY는 URL을 지원하지 않음
COPY https://example.com/app.tar.gz /opt/  # 오류 발생!
```

> ADD로 원격 파일을 다운로드하는 대신 `RUN + curl`을 사용하는 것을 추천합니다. ADD 다운로드는 빌드 캐시를 활용할 수 없고, 오류 처리가 불가능하며, 무결성 검증도 할 수 없기 때문입니다.

```dockerfile
# 추천: RUN + curl
RUN curl -fsSL -o /tmp/app.tar.gz https://example.com/app.tar.gz \
    && tar -xzf /tmp/app.tar.gz -C /opt/ \
    && rm /tmp/app.tar.gz
```

#### 4. 디렉터리 자동 생성

두 명령어 모두 존재하지 않는 중간 디렉터리를 자동으로 생성합니다:

```dockerfile
# /etc/myapp/config/가 존재하지 않으면 자동 생성
COPY app.conf /etc/myapp/config/
ADD app.conf /etc/myapp/config/

# 수동으로 mkdir 불필요
# RUN mkdir -p /etc/myapp/config   ← 불필요
```

#### 5. 빌드 캐시 동작

```dockerfile
# COPY - 파일 내용을 엄격하게 비교, 내용이 변경되어야 캐시 무효화
COPY config/app.conf /etc/app/

# ADD - 압축 파일 내용이 동일하면 캐시 유지
ADD app.tar.gz /opt/app/
```

| 상황 | COPY | ADD |
|------|------|-----|
| 파일 내용 변경 | 캐��� 무효화 | 캐시 무효화 |
| 파일 메타데이터 변경 | 캐시 무효화 | 캐시 무효화 |
| 압축 파일 내용 동일 | N/A | 캐시 유지 |

#### 6. 기능 비교

| 기능 | COPY | ADD |
|------|------|-----|
| 로컬 파일 복사 | ✅ | ✅ |
| 디렉터리 복사 | ✅ | ✅ |
| 와일드카드 지원 | ✅ | ✅ |
| 디렉터리 자동 생성 | ✅ | ✅ |
| 압축 파일 자동 해제 | ❌ | ✅ |
| 원격 URL 지원 | ❌ | ✅ |
| 의미 명확성 | ✅ 높음 | ❌ 낮음 |
| 사용 권장 | ✅ 우선 사용 | ⚠️ 특정 상황 |

#### 7. 사용 사례

**COPY에 적합한 경우:**

```dockerfile
# 설정 파일 복사
COPY nginx.conf /etc/nginx/nginx.conf

# 애플리케이션 코드 복사
COPY src/ /app/src/
COPY package.json /app/

# 멀티스테이지 빌드에서 바이너리 복사
COPY --from=builder /app/build/app /usr/local/bin/
```

**ADD는 자동 압축 해제가 필요한 경우에만 사용:**

```dockerfile
# ADD의 적절한 사용
ADD node-v18.17.0-linux-x64.tar.gz /usr/local/

# 일�� 파일에는 ADD를 사용하지 마세요
ADD app.conf /etc/app/  # ← COPY로 대체
```

#### 8. 모범 사례

```dockerfile
# 규칙 1: 기본적으로 COPY 사용
COPY requirements.txt /app/          # ✅
ADD requirements.txt /app/           # ❌ 불필요

# 규칙 2: 압축 해제가 필요할 때만 ADD 사용
ADD node-v18.tar.gz /usr/local/      # ✅ 압축 해제 필요

# 규칙 3: 원격 파일은 RUN + curl 사용
RUN curl -fsSL -o /tmp/app.tar.gz https://example.com/app.tar.gz \
    && tar -xzf /tmp/app.tar.gz -C /opt/ \
    && rm /tmp/app.tar.gz            # ✅
ADD https://example.com/app.tar.gz /opt/  # ❌

# 규칙 4: .dockerignore로 컨텍스트 축소
# .dockerignore
# .git
# node_modules
# *.md
# .env

# 규칙 5: COPY 순서를 적절히 배치하여 캐시 활용
COPY package.json package-lock.json ./  # 의존성 먼저 복사 (변경 적음)
RUN npm ci --production
COPY . .                                # 코드 나중에 복사 (변경 많음)
```

#### 9. 흔한 함정

```dockerfile
# 함정 1: 의도치 않은 자동 압축 해제
ADD app.tar.gz /opt/app/
# 파일을 복사했다고 생각했지만 실제로는 디렉터리로 해제됨

# 함정 2: 원격 파일 캐시 불가
ADD https://github.com/user/repo/releases/download/v1.0/app.tar.gz /tmp/
# 매 빌드마다 다시 다운로드

# 함정 3: 권한 문제
COPY --chown=app:app src/ /app/src/    # 소유자 지정
```

#### 10. 선택 결정

```
파일 복사가 필요한가?
├── 로컬 압축 파일이며 해제가 필요한가?
│   └── ADD 사용
├── 로컬 일반 파일인가?
│   └── COPY 사용
└── 원격 파일인가?
    └── RUN + curl 사용
```
