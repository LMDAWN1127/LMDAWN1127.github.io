---
title: "CentOS에서 Claude Code 배포 전체 가이드"
date: 2026-07-04T05:00:00+08:00
draft: false
author: "DAWN"
tags: ["Claude Code", "CentOS", "AI", "배포"]
categories: ["기술 튜토리얼"]
description: "CentOS에서 Claude Code를 처음부터 배포하는 방법으로, Node.js 설치, API Key 설정, 자주 발생하는 문제 해결 방법을 다룹니다."
summary: "Claude Code는 Anthropic이 출시한 CLI 도구로, 터미널에서 직접 Claude AI와 상호작용하여 코딩 작업을 완료할 수 있습니다. 이 글에서는 CentOS에서의 배포 전체 과정을 소개합니다."
showToc: true
TocOpen: true
---

#### 1. 환경 요구사항

- **운영체제**: CentOS 7/8/Stream 9
- **Node.js**: v18 이상
- **메모리**: 2GB 이상 권장
- **네트워크**: Anthropic API 접근 가능해야 함

#### 2. Node.js 설치

```bash
# NodeSource 저장소 설치
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -

# Node.js 설치
sudo yum install -y nodejs

# 확인
node -v
npm -v
```

> Node.js 버전이 너무 낮으면 nvm으로 버전을 관리하세요:
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
> source ~/.bashrc
> nvm install 20
> nvm use 20
> ```

#### 3. Claude Code 설치

```bash
# 전역 설치
npm install -g @anthropic-ai/claude-code

# 확인
claude --version
```

> 권한 문제가 발생하면 두 가지 해결 방법이 있습니다:
> ```bash
> # 방법 1: sudo
> sudo npm install -g @anthropic-ai/claude-code
>
> # 방법 2: npm 전역 디렉터리 변경 (추천)
> mkdir -p ~/.npm-global
> npm config set prefix "~/.npm-global"
> echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
> source ~/.bashrc
> ```

#### 4. API Key 설정

```bash
# 방법 1: 환경 변수 (추천)
echo 'export ANTHROPIC_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc

# 확인
echo $ANTHROPIC_API_KEY
```

> 방법 2: `claude`를 직접 실행하면 최초 실행 시 API Key 입력을 요청합니다.

#### 5. 기본 사용법

```bash
# 대화형 세션 시작
cd /path/to/your/project
claude

# 직접 질문하기 (비대화형 모드)
claude -p "현재 디렉터리의 모든 파일 개수를 세는 Python 스크립트를 작성해줘"

# 코드 분석
cat main.py | claude -p "이 코드의 잠재적 문제점을 분석해줘"

# 설정 확인/수정
claude config

# 최신 버전으로 업데이트
claude update
```

| 명령어 | 설명 |
|------|------|
| `claude` | 대화형 세션 시작 |
| `claude -p "질문"` | 직접 질문, 비대화형 모드 |
| `claude config` | 설정 확인/수정 |
| `claude update` | 최신 버전으로 업데이트 |

#### 6. 네트워크 문제 해결

Anthropic API 연결이 타임아웃되는 경우:

```bash
# 프록시 설정
export https_proxy="http://your-proxy:port"
export http_proxy="http://your-proxy:port"

# 연결 테스트
curl -s https://api.anthropic.com/ | head -5
```

#### 7. 보안 권장사항

```bash
# API Key를 하드코딩하지 말고 항상 환경 변수를 사용하세요
echo 'export ANTHROPIC_API_KEY="sk-ant-xxx"' >> ~/.bashrc  # ✅
# ANTHROPIC_API_KEY=sk-ant-xxx 코드에 직접 작성  # ❌

# 파일 권한 제한
chmod 600 ~/.bashrc

# 유출 여부 확인
grep -r "ANTHROPIC_API_KEY" --include="*.py" --include="*.js" .
```
