---
title: "CentOS Deployment Guide for Claude Code: Full Walkthrough"
date: 2026-07-04T05:00:00+08:00
draft: false
author: "DAWN"
tags: ["Claude Code", "CentOS", "AI", "Deployment"]
categories: ["Tech Tutorials"]
description: "Deploy Claude Code on CentOS from scratch — covers Node.js installation, API key configuration, and common troubleshooting."
summary: "Claude Code is Anthropic's CLI tool that lets you interact with Claude AI directly from the terminal to complete coding tasks. This guide walks through the full deployment process on CentOS."
showToc: true
TocOpen: true
---

#### 1. Requirements

- **OS**: CentOS 7 / 8 / Stream 9
- **Node.js**: v18 or higher
- **RAM**: 2 GB or more recommended
- **Network**: Access to the Anthropic API

#### 2. Install Node.js

```bash
# Add the NodeSource repository
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -

# Install Node.js
sudo yum install -y nodejs

# Verify
node -v
npm -v
```

> If the Node.js version is too old, use nvm to manage versions:
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
> source ~/.bashrc
> nvm install 20
> nvm use 20
> ```

#### 3. Install Claude Code

```bash
# Global install
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
```

> Two ways to fix permission issues:
> ```bash
> # Option 1: sudo
> sudo npm install -g @anthropic-ai/claude-code
>
> # Option 2: change the npm global prefix (recommended)
> mkdir -p ~/.npm-global
> npm config set prefix "~/.npm-global"
> echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
> source ~/.bashrc
> ```

#### 4. Configure the API Key

```bash
# Option 1: environment variable (recommended)
echo 'export ANTHROPIC_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc

# Verify
echo $ANTHROPIC_API_KEY
```

> Option 2: just run `claude` — it will prompt you for the API key on first launch.

#### 5. Basic Usage

```bash
# Start an interactive session
cd /path/to/your/project
claude

# Ask a question directly (non-interactive)
claude -p "Write a Python script that counts the number of files in the current directory"

# Analyze code
cat main.py | claude -p "Analyze potential issues in this code"

# View or edit configuration
claude config

# Update to the latest version
claude update
```

| Command | Description |
|---------|-------------|
| `claude` | Start an interactive session |
| `claude -p "question"` | Ask directly in non-interactive mode |
| `claude config` | View or edit configuration |
| `claude update` | Update to the latest version |

#### 6. Network Troubleshooting

If connecting to the Anthropic API times out:

```bash
# Configure a proxy
export https_proxy="http://your-proxy:port"
export http_proxy="http://your-proxy:port"

# Test connectivity
curl -s https://api.anthropic.com/ | head -5
```

#### 7. Security Tips

```bash
# Never hard-code the API key — always use an environment variable
echo 'export ANTHROPIC_API_KEY="sk-ant-xxx"' >> ~/.bashrc  # ✅
# ANTHROPIC_API_KEY=sk-ant-xxx written in code  # ❌

# Restrict file permissions
chmod 600 ~/.bashrc

# Check for leaks
grep -r "ANTHROPIC_API_KEY" --include="*.py" --include="*.js" .
```
