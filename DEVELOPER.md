# 开发者文档

> 📖 本文档仅面向开发者，用户无需关注

## 📦 发布新版本到 GitHub

### 前置准备

1. **配置 GitHub Token**
   
   在项目根目录创建 `.env` 文件，填入你的 GitHub Token：
   ```
   GH_TOKEN=你的token
   ```
   
   > 💡 **提示**：`.env` 文件已在 `.gitignore` 中，不会被提交到仓库
   
   **获取 Token：**
   - 访问：https://github.com/settings/tokens
   - 点击 "Generate new token (classic)"
   - 勾选 `repo` 权限
   - 生成并复制 Token

### 发布步骤

1. **更新版本号**
   
   编辑 `package.json`，修改版本号：
   ```json
   {
     "version": "2.6.0"
   }
   ```

2. **构建并发布**
   
   **方式一：构建并发布（推荐）**
   ```bash
   # Windows 64位（推荐）
   pnpm run publish:win64
   
   # Windows 32位
   pnpm run publish:win32
   ```
   
   > 💡 **提示**：发布命令会自动读取 `.env` 文件中的 `GH_TOKEN`
   
   **方式二：仅构建（不发布）**
   ```bash
   # 仅构建，不发布到 GitHub
   pnpm run build:win64
   ```

3. **验证发布**
   
   构建完成后，访问：
   https://github.com/sunflowermm/git-repository-manager/releases
   
   确认：
   - ✅ 新版本 Release 已创建
   - ✅ 安装包（.exe）已上传
   - ✅ 更新清单文件（latest.yml）已生成

### 发布后

- ✅ 用户安装的应用会自动检查更新
- ✅ 发现新版本时会自动提示用户
- ✅ 用户确认后自动下载并安装

### 配置说明

**仓库信息**（已配置，无需修改）：
- Owner: `sunflowermm`
- Repo: `git-repository-manager`
- 更新服务器：GitHub Releases

### 常见问题

**Q: 构建成功但没有发布到 GitHub？**
- 确认使用了 `pnpm run publish:win64` 而不是 `pnpm run build:win64`
- 检查 `.env` 文件中的 `GH_TOKEN` 是否正确
- 确认 Token 有 `repo` 权限
- 检查网络连接
- 如果 `.env` 文件不生效，可以手动设置环境变量：
  ```bash
  # Windows PowerShell
  $env:GH_TOKEN="你的token"
  pnpm run publish:win64
  ```

**Q: 首次发布失败？**
- 首次发布可能需要手动在 GitHub 创建一个 Release
- 或使用 `--publish always` 参数强制发布

**Q: 如何测试更新功能？**
- 发布一个测试版本（如 v2.5.1）
- 安装旧版本应用
- 启动应用，应该会自动检测到新版本

---

> 💡 **提示**：发布后，用户的应用会自动检查并提示更新，无需手动操作。
