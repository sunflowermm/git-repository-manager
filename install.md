# 安装说明

## 如果遇到安装错误

### 方法1：使用国内镜像（推荐）

已配置 `.npmrc` 文件，使用国内镜像源加速下载。

```bash
npm install
```

### 方法2：清理后重新安装

```bash
# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# Windows PowerShell
Remove-Item -Recurse -Force node_modules, package-lock.json

# 重新安装
npm install
```

### 方法3：使用 yarn（如果 npm 有问题）

```bash
# 安装 yarn（如果未安装）
npm install -g yarn

# 使用 yarn 安装
yarn install
```

### 方法4：手动设置镜像

```bash
npm config set registry https://registry.npmmirror.com
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install
```

## 常见错误解决

### EPERM 错误（权限问题）

1. 以管理员身份运行终端
2. 关闭可能占用文件的程序（如 VS Code、文件管理器）
3. 删除 `node_modules` 后重新安装

### ECONNRESET 错误（网络问题）

1. 使用国内镜像（已配置 `.npmrc`）
2. 检查网络连接
3. 重试安装命令

### Electron 下载失败

1. 手动下载 Electron：https://npmmirror.com/mirrors/electron/
2. 设置环境变量：
   ```bash
   set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
   ```
