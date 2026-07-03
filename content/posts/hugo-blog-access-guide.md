# Hugo 博客访问手册

## 创建时间
2026-07-03

## 博客信息
- **博客标题**: 我的博客
- **GitHub 仓库**: https://github.com/LMDAWN1127/LMDAWN1127.github.io
- **部署分支**: gh-pages
- **主题**: PaperMod

---

## 🌐 在线访问地址

### GitHub Pages（推荐）
**https://LMDAWN1127.github.io/**

### 文章页面
**https://LMDAWN1127.github.io/posts/my-first-post/**

---

## 📝 首次访问配置指南

### 步骤 1: 访问 GitHub 仓库
打开浏览器，访问：
```
https://github.com/LMDAWN1127/LMDAWN1127.github.io
```

### 步骤 2: 进入 Settings
1. 点击仓库页面顶部的 **Settings** 选项卡
2. 或者直接访问：https://github.com/LMDAWN1127/LMDAWN1127.github.io/settings

### 步骤 3: 找到 Pages 设置
1. 在左侧菜单中找到 **Code and automation** 部分
2. 点击 **Pages**
3. 或者直接访问：https://github.com/LMDAWN1127/LMDAWN1127.github.io/settings/pages

### 步骤 4: 设置部署源
1. **Source**: 选择 `Deploy from a branch`
2. **Branch**:
   - 第一个下拉框：选择 `gh-pages`
   - 第二个下拉框：选择 `/ (root)`
3. 点击 **Save** 按钮

### 步骤 5: 等待部署
- GitHub 会自动开始部署你的网站
- 通常需要 **1-5 分钟**
- 部署完成后，页面顶部会显示绿色提示：
  > "Your site is live at https://LMDAWN1127.github.io/"

### 步骤 6: 访问博客
打开浏览器，访问：
```
https://LMDAWN1127.github.io/
```

---

## 🔗 所有访问地址汇总

| 类型 | 地址 | 说明 |
|------|------|------|
| GitHub Pages（主站） | https://LMDAWN1127.github.io/ | 在线访问，推荐使用 |
| 文章页面 | https://LMDAWN1127.github.io/posts/my-first-post/ | 第一篇博客文章 |
| GitHub 仓库 | https://github.com/LMDAWN1127/LMDAWN1127.github.io | 源代码和配置 |
| 仓库设置 | https://github.com/LMDAWN1127/LMDAWN1127.github.io/settings | 仓库设置页面 |
| Pages 设置 | https://github.com/LMDAWN1127/LMDAWN1127.github.io/settings/pages | GitHub Pages 配置 |
| 部署状态 | https://github.com/LMDAWN1127/LMDAWN1127.github.io/actions | 查看部署状态 |
| gh-pages 分支 | https://github.com/LMDAWN1127/LMDAWN1127.github.io/tree/gh-pages | 部署文件 |

---

## 🏠 本地访问地址

### 服务器信息
- **服务器地址**: 192.168.100.30
- **操作系统**: Ubuntu 22.04.5 LTS

### 本地访问地址
| 类型 | 地址 | 说明 |
|------|------|------|
| 本地首页 | http://192.168.100.30:1313/ | 服务器本地访问 |
| 本地文章页面 | http://192.168.100.30:1313/posts/my-first-post/ | 本地文章页面 |

### 启动本地服务器
```bash
# 切换到 root 用户
sudo -i

# 进入 Hugo 项目目录
cd /root/myblog

# 启动开发服务器
hugo server --bind 0.0.0.0 --baseURL http://192.168.100.30:1313/
```

---

## ⏰ 注意事项

### 1. 部署时间
- GitHub Pages 部署需要 **1-5 分钟**
- 首次部署可能需要更长时间
- 请耐心等待

### 2. 首次访问
- 首次访问可能会有短暂延迟
- 如果看不到内容，请等待几分钟后刷新

### 3. 缓存问题
- 如果看不到更新，尝试以下方法：
  - 清除浏览器缓存
  - 使用无痕/隐私模式访问
  - 按 `Ctrl + F5` 强制刷新

### 4. HTTPS
- GitHub Pages 默认使用 HTTPS
- 证书由 GitHub 自动管理
- 无需手动配置

### 5. 自定义域名
- 当前使用默认域名：`LMDAWN1127.github.io`
- 如需自定义域名，需要在 Pages 设置中配置

---

## 🔧 故障排除

### 问题 1: 访问 404 错误
**可能原因**:
- GitHub Pages 未配置
- 部署未完成
- 分支名称错误

**解决方案**:
1. 检查 Pages 设置是否正确
2. 确认选择了 `gh-pages` 分支
3. 等待 5 分钟后重试

### 问题 2: 页面样式丢失
**可能原因**:
- 资源文件未正确加载
- 缓存问题

**解决方案**:
1. 强制刷新页面（Ctrl + F5）
2. 清除浏览器缓存
3. 检查浏览器控制台是否有错误

### 问题 3: 更新后看不到变化
**可能原因**:
- GitHub Pages 缓存
- 浏览器缓存

**解决方案**:
1. 等待 5-10 分钟
2. 清除浏览器缓存
3. 使用无痕模式访问

### 问题 4: 部署失败
**可能原因**:
- GitHub Actions 配置错误
- 分支不存在

**解决方案**:
1. 访问 https://github.com/LMDAWN1127/LMDAWN1127.github.io/actions
2. 查看失败的部署日志
3. 检查 gh-pages 分支是否存在

### 问题 5: 无法访问 GitHub Pages
**可能原因**:
- 网络问题
- DNS 解析问题

**解决方案**:
1. 检查网络连接
2. 尝试使用其他网络
3. 清除 DNS 缓存

---

## 📋 快速访问清单

### ✅ 首次访问步骤
- [ ] 访问 GitHub 仓库：https://github.com/LMDAWN1127/LMDAWN1127.github.io
- [ ] 进入 Settings → Pages
- [ ] 选择 `gh-pages` 分支
- [ ] 点击 Save
- [ ] 等待 1-5 分钟
- [ ] 访问 https://LMDAWN1127.github.io/

### ✅ 日常访问
- [ ] 直接访问 https://LMDAWN1127.github.io/
- [ ] 查看文章：https://LMDAWN1127.github.io/posts/my-first-post/

### ✅ 本地访问
- [ ] 启动本地服务器
- [ ] 访问 http://192.168.100.30:1313/

---

## 📖 博客内容

### 当前文章
- **标题**: My First Post
- **链接**: https://LMDAWN1127.github.io/posts/my-first-post/
- **状态**: 已发布

### 发布新文章
```bash
# 1. 登录服务器
ssh zlm@192.168.100.30

# 2. 切换到 root 用户
sudo -i

# 3. 创建新文章
cd /root/myblog
hugo new posts/new-post-name.md

# 4. 编辑文章
vim content/posts/new-post-name.md

# 5. 构建网站
hugo --minify

# 6. 部署到 GitHub Pages
cp -r public/* /root/myblog-deploy/
cd /root/myblog-deploy
git add .
git commit -m "Add new post"
git push origin gh-pages
```

---

## 🔐 安全提醒

### GitHub Token
- Token 已用于部署，请妥善保管
- 建议定期更换 Token
- 不要将 Token 分享给他人

### 服务器访问
- 服务器密码：000000（建议修改）
- 建议使用 SSH 密钥认证
- 定期更新系统和软件

---

## 📞 获取帮助

### GitHub 文档
- GitHub Pages 官方文档：https://docs.github.com/en/pages
- Hugo 官方文档：https://gohugo.io/documentation/

### 常见问题
- GitHub Pages 部署问题：https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-github-pages-build-errors
- Hugo 构建问题：https://gohugo.io/troubleshooting/

---

## 📝 更新日志

### 2026-07-03
- 初始创建博客
- 修复 Hugo 配置警告
- 修复主题模板警告
- 发布第一篇文章
- 部署到 GitHub Pages

---

## 总结

你的 Hugo 博客已经成功部署到 GitHub Pages！

**主站地址**: https://LMDAWN1127.github.io/

**首次访问**需要配置 GitHub Pages，按照上面的步骤操作即可。

**日常访问**直接打开浏览器访问主站地址即可。

如有问题，请参考故障排除部分或查看 GitHub 文档。
