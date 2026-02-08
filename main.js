const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const simpleGit = require('simple-git');
const { autoUpdater } = require('electron-updater');

let mainWindow;
const BOUNDS_FILE = 'window-bounds.json';

function getDataDir() {
  return app.getPath('userData');
}

function getBoundsPath() {
  return path.join(getDataDir(), BOUNDS_FILE);
}

function loadWindowBounds() {
  try {
    const p = getBoundsPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const workArea = screen.getPrimaryDisplay().workArea;
      const { width, height, x, y, isMaximized } = data;
      if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) {
        const bounded = {
          width: Math.min(width, workArea.width),
          height: Math.min(height, workArea.height),
          x: Number.isFinite(x) ? Math.max(workArea.x, x) : undefined,
          y: Number.isFinite(y) ? Math.max(workArea.y, y) : undefined,
          isMaximized: !!isMaximized
        };
        return bounded;
      }
    }
  } catch (e) {}
  const workArea = screen.getPrimaryDisplay().workArea;
  const w = Math.min(1200, Math.floor(workArea.width * 0.7));
  const h = Math.min(750, Math.floor(workArea.height * 0.7));
  return {
    width: w,
    height: h,
    x: workArea.x + Math.floor((workArea.width - w) / 2),
    y: workArea.y + Math.floor((workArea.height - h) / 2),
    isMaximized: false
  };
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const bounds = mainWindow.getBounds();
    const dir = path.dirname(getBoundsPath());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getBoundsPath(), JSON.stringify({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized
    }), 'utf-8');
  } catch (e) {}
}

function createWindow() {
  const bounds = loadWindowBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    fullscreenable: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#f8fafc'
  });
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (bounds.isMaximized) {
      mainWindow.maximize();
    }
  });

  let saveBoundsTimer;
  mainWindow.on('resize', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveWindowBounds, 500);
  });
  mainWindow.on('move', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveWindowBounds, 500);
  });
  mainWindow.on('close', () => {
    saveWindowBounds();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile('index.html');
}

// 配置自动更新
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// 检查更新
function checkForUpdates() {
  if (process.env.NODE_ENV === 'development') return;
  
  autoUpdater.checkForUpdates().catch(() => {
    // 静默处理错误
  });
}

// 更新事件处理
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking', message: '正在检查更新...' });
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'available',
      message: `发现新版本 v${info.version}`,
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  }
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'not-available', message: '已是最新版本' });
  }
});

autoUpdater.on('error', (err) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'error', message: `更新检查失败: ${err.message}` });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', {
      percent: Math.round(progressObj.percent),
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      message: '更新已下载完成，将在重启后安装',
      version: info.version
    });
  }
});

app.whenReady().then(() => {
  createWindow();
  // 延迟检查更新，避免影响启动速度
  setTimeout(checkForUpdates, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ========== IPC 处理程序 ==========

// 更新相关IPC
ipcMain.handle('check-for-updates', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall(false);
  return { success: true };
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 选择文件夹
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// 用户 .ssh 目录（密钥默认所在文件夹）
function getSshDir() {
  return path.join(app.getPath('home'), '.ssh');
}

ipcMain.handle('get-ssh-dir', async () => getSshDir());

// 自动检测默认私钥（id_ed25519 / id_rsa）
ipcMain.handle('detect-default-ssh-key', async () => {
  const dir = getSshDir();
  if (!fs.existsSync(dir)) return null;
  for (const name of ['id_ed25519', 'id_rsa']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
});

// 选择文件（defaultPath 如传入则对话框直接打开该目录，用于密钥时传 .ssh）
ipcMain.handle('select-file', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: defaultPath || app.getPath('documents'),
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

// 窗口控制
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// 打开文件夹
ipcMain.handle('open-folder', async (event, folderPath) => {
  const platform = process.platform;
  let command;
  
  if (platform === 'win32') {
    command = `explorer "${folderPath}"`;
  } else if (platform === 'darwin') {
    command = `open "${folderPath}"`;
  } else {
    command = `xdg-open "${folderPath}"`;
  }
  
  exec(command, () => {
    // 静默处理错误
  });
});

function getConfigPath() {
  return path.join(getDataDir(), 'config.json');
}

// 读取配置文件
ipcMain.handle('load-config', async () => {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    // 静默处理错误
  }
  return null;
});

// 保存配置文件
ipcMain.handle('save-config', async (event, config) => {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    // 静默处理错误
    return false;
  }
});

// simple-git getRemotes(true) 返回数组 [{ name, refs: { fetch, push } }]，取第一个 URL
function getFirstRemoteUrl(remotes) {
  if (!remotes) return '';
  const first = Array.isArray(remotes) ? remotes[0] : remotes[Object.keys(remotes)[0]];
  if (!first || !first.refs) return '';
  const r = first.refs;
  return (r.fetch || r.push || '').trim();
}

// 获取仓库列表
ipcMain.handle('get-repos', async (event, repoPaths) => {
  if (!Array.isArray(repoPaths) || repoPaths.length === 0) return [];

  const repos = [];
  for (const repoPath of repoPaths) {
    if (!repoPath || !fs.existsSync(repoPath)) continue;
    const gitPath = path.join(repoPath, '.git');
    if (!fs.existsSync(gitPath) || !fs.statSync(repoPath).isDirectory()) continue;

    const name = path.basename(repoPath);
    let remoteUrl = '';
    let currentBranch = '无分支';
    let status = { files: [], modified: [], staged: [], untracked: [] };
    
    try {
      const git = simpleGit(repoPath);
      try {
        remoteUrl = getFirstRemoteUrl(await git.getRemotes(true));
      } catch (e) {}
      try {
        const branches = await git.branchLocal();
        currentBranch = branches.current || currentBranch;
      } catch (e) {}
      try {
        status = await git.status();
      } catch (e) {}
      
      const files = status.files || [];
      const modified = status.modified || [];
      const staged = status.staged || [];
      const untracked = status.untracked || [];
      
      repos.push({
        name,
        path: repoPath,
        branch: currentBranch,
        remoteUrl,
        platform: detectPlatform(remoteUrl),
        hasChanges: files.length > 0,
        modified: modified.length,
        staged: staged.length,
        untracked: untracked.length
      });
    } catch (error) {
      repos.push({
        name,
        path: repoPath,
        branch: '空仓库',
        remoteUrl: '',
        platform: '未知',
        hasChanges: false,
        modified: 0,
        staged: 0,
        untracked: 0
      });
    }
  }
  return repos;
});

// 检测平台（支持 gh-proxy.com / ghproxy 等代理 URL）
function detectPlatform(url) {
  if (!url) return '未知';
  const urlLower = url.toLowerCase();
  // 代理拉取的 URL 形如 https://gh-proxy.com/https://github.com/xxx/repo.git，整段包含 github
  if (urlLower.includes('gh-proxy.com') || urlLower.includes('ghproxy.net') || urlLower.includes('ghproxy.com')) {
    return 'GitHub';
  }
  if (urlLower.includes('github.com') || urlLower.includes('github.io')) {
    return 'GitHub';
  }
  if (urlLower.includes('gitee.com')) return 'Gitee';
  if (urlLower.includes('gitcode.net')) return 'GitCode';
  if (urlLower.includes('gitlab.com') || urlLower.includes('gitlab.io')) return 'GitLab';
  return '其他';
}

// 获取仓库详细信息
ipcMain.handle('get-repo-info', async (event, repoPath) => {
  const name = path.basename(repoPath);
  const fallback = {
    name,
    path: repoPath,
    branch: '空仓库',
    remoteUrl: '',
    platform: '未知',
    status: { modified: 0, staged: 0, untracked: 0, files: [] },
    lastCommit: null
  };
  
  try {
    const git = simpleGit(repoPath);
    let remoteUrl = '';
    let branch = '无分支';
    let status = { modified: [], staged: [], untracked: [], files: [] };
    let logResult = { latest: null };
    
    try {
      remoteUrl = getFirstRemoteUrl(await git.getRemotes(true));
    } catch (e) {}
    
    try {
      const branches = await git.branchLocal();
      branch = branches.current || branch;
    } catch (e) {}
    
    try {
      status = await git.status();
    } catch (e) {}
    
    try {
      logResult = await git.log({ maxCount: 1 });
    } catch (e) {}
    
    const mod = status.modified || [];
    const st = status.staged || [];
    const unt = status.untracked || [];
    const files = status.files || [];
    
    return {
      name,
      path: repoPath,
      branch,
      remoteUrl,
      platform: detectPlatform(remoteUrl),
      status: {
        modified: mod.length,
        staged: st.length,
        untracked: unt.length,
        files
      },
      lastCommit: logResult.latest ? { message: logResult.latest.message, date: logResult.latest.date } : null
    };
  } catch (error) {
    return { ...fallback, error: error.message };
  }
});

// Git 操作：添加文件
ipcMain.handle('git-add', async (event, repoPath, files = []) => {
  try {
    const git = simpleGit(repoPath);
    if (files.length === 0) {
      await git.add('.');
    } else {
      await git.add(files);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Git 操作：设置用户信息
ipcMain.handle('git-set-user', async (event, repoPath, username, email) => {
  try {
    const git = simpleGit(repoPath);
    if (username) await git.addConfig('user.name', username);
    if (email) await git.addConfig('user.email', email);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Git 操作：提交（自动追加：文件数、变更类型、行数 +ins -del）
ipcMain.handle('git-commit', async (event, repoPath, message) => {
  try {
    const git = simpleGit(repoPath);
    const status = await git.status();
    const mod = status.modified || [];
    const staged = status.staged || [];
    const untracked = status.untracked || [];
    const files = status.files || [];

    let summary = '';
    const parts = [];
    if (mod.length) parts.push(`${mod.length} 修改`);
    if (untracked.length) parts.push(`${untracked.length} 新增`);
    const deleted = files.filter(f => (f.working_dir || f.index) === 'D').length;
    if (deleted) parts.push(`${deleted} 删除`);

    let insertions = 0;
    let deletions = 0;
    try {
      const diff = await git.diffSummary(['--cached']);
      if (diff && typeof diff.insertions === 'number') insertions = diff.insertions;
      if (diff && typeof diff.deletions === 'number') deletions = diff.deletions;
    } catch (e) {}

    if (insertions || deletions) parts.push(`+${insertions} -${deletions} 行`);
    if (parts.length) summary = ` [${parts.join(', ')}]`;

    const fullMessage = (message.trim() || 'Update') + summary;
    await git.commit(fullMessage);
    return { success: true, message: fullMessage };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Git 操作：推送（支持SSH和代理）
ipcMain.handle('git-push', async (event, repoPath, remote = 'origin', branch = null, config = null) => {
  try {
    const git = simpleGit(repoPath);
    const branches = await git.branchLocal();
    const targetBranch = branch || branches.current;
    
    if (config) setupGitEnvironment(config);
    await git.push(remote, targetBranch);
    clearGitEnvironment();
    
    return { success: true };
  } catch (error) {
    clearGitEnvironment();
    return { success: false, error: error.message };
  }
});

// Git 操作：拉取（支持SSH和代理）
ipcMain.handle('git-pull', async (event, repoPath, remote = 'origin', branch = null, config = null) => {
  try {
    const git = simpleGit(repoPath);
    const branches = await git.branchLocal();
    const targetBranch = branch || branches.current;
    
    if (config) setupGitEnvironment(config);
    await git.pull(remote, targetBranch);
    clearGitEnvironment();
    
    return { success: true };
  } catch (error) {
    clearGitEnvironment();
    return { success: false, error: error.message };
  }
});

// Git 操作：克隆（支持SSH和代理）
ipcMain.handle('git-clone', async (event, url, targetPath, options = {}, config = null) => {
  try {
    if (config) {
      setupGitEnvironment(config);
      url = processRemoteUrl(url, detectPlatform(url), config);
    }
    const git = simpleGit();
    await git.clone(url, targetPath, options);
    clearGitEnvironment();
    
    return { success: true };
  } catch (error) {
    clearGitEnvironment();
    return { success: false, error: error.message };
  }
});

// Stash：暂存列表、暂存、恢复
ipcMain.handle('git-stash-list', async (event, repoPath) => {
  try {
    const git = simpleGit(repoPath);
    const list = await git.stashList();
    return { success: true, list: list.all || [] };
  } catch (error) {
    return { success: false, error: error.message, list: [] };
  }
});

ipcMain.handle('git-stash', async (event, repoPath, message = '') => {
  try {
    const git = simpleGit(repoPath);
    await git.stash(['push', '-m', message || 'stash']);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('git-stash-pop', async (event, repoPath) => {
  try {
    const git = simpleGit(repoPath);
    await git.stash(['pop']);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 执行 Git 命令（用于复杂操作）
ipcMain.handle('exec-git', async (event, repoPath, command, args = []) => {
  return new Promise((resolve) => {
    const gitProcess = spawn('git', [command, ...args], {
      cwd: repoPath,
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    gitProcess.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout: stdout,
        stderr: stderr,
        code: code
      });
    });
    
    gitProcess.on('error', (error) => {
      resolve({
        success: false,
        error: error.message
      });
    });
  });
});

// 同步时忽略的目录/文件（.git 与依赖等）
const SYNC_IGNORE = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env', '.env',
  'dist', 'build', '.next', '.nuxt', '.cache', 'coverage', '.nyc_output',
  '.idea', '.vscode', '.vs', '*.pyc', '.DS_Store', 'Thumbs.db'
]);

function shouldSyncIgnore(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  for (const ignore of SYNC_IGNORE) {
    if (ignore.startsWith('*')) {
      if (lower.endsWith(ignore.slice(1))) return true;
    } else if (lower === ignore || lower.endsWith('.' + ignore)) return true;
  }
  return false;
}

function copyDirWithIgnore(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  const items = fs.readdirSync(srcDir);
  for (const item of items) {
    if (shouldSyncIgnore(item)) continue;
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      copyDirWithIgnore(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 同步仓库：优先远程 pull，否则忽略 .git/依赖 后复制
ipcMain.handle('sync-repos', async (event, mainRepoPath, subordinateRepoPath, commitMessage, mainConfig = null, subConfig = null) => {
  try {
    const mainGit = simpleGit(mainRepoPath);
    const subGit = simpleGit(subordinateRepoPath);

    let mainRemoteUrl = '';
    let subRemoteUrl = '';
    try {
      mainRemoteUrl = getFirstRemoteUrl(await mainGit.getRemotes(true)).replace(/\/$/, '');
      subRemoteUrl = getFirstRemoteUrl(await subGit.getRemotes(true)).replace(/\/$/, '');
    } catch (e) { /* ignore */ }

    const sameRemote = mainRemoteUrl && subRemoteUrl && mainRemoteUrl === subRemoteUrl;

    await mainGit.add('.');
    const status = await mainGit.status();
    const mod = status.modified || [];
    const unt = status.untracked || [];
    const summary = (mod.length || unt.length) ? ` [${mod.length} 修改, ${unt.length} 新增]` : '';

    if (mainConfig && mainConfig.username && mainConfig.email) {
      await mainGit.addConfig('user.name', mainConfig.username);
      await mainGit.addConfig('user.email', mainConfig.email);
    }
    await mainGit.commit(commitMessage + summary);

    if (mainConfig) setupGitEnvironment(mainConfig);
    await mainGit.push('origin');
    clearGitEnvironment();

    if (sameRemote) {
      if (subConfig) setupGitEnvironment(subConfig);
      await subGit.pull('origin');
      clearGitEnvironment();
      return { success: true };
    }

    const items = fs.readdirSync(subordinateRepoPath);
    for (const item of items) {
      if (item === '.git') continue;
      const itemPath = path.join(subordinateRepoPath, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) fs.rmSync(itemPath, { recursive: true, force: true });
      else fs.unlinkSync(itemPath);
    }

    const mainItems = fs.readdirSync(mainRepoPath);
    for (const item of mainItems) {
      if (shouldSyncIgnore(item)) continue;
      const srcPath = path.join(mainRepoPath, item);
      const destPath = path.join(subordinateRepoPath, item);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        copyDirWithIgnore(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }

    await subGit.add('.');
    if (subConfig && subConfig.username && subConfig.email) {
      await subGit.addConfig('user.name', subConfig.username);
      await subGit.addConfig('user.email', subConfig.email);
    }
    await subGit.commit(commitMessage + summary);
    if (subConfig) setupGitEnvironment(subConfig);
    await subGit.push('origin');
    clearGitEnvironment();
    return { success: true };
  } catch (error) {
    clearGitEnvironment();
    return { success: false, error: error.message };
  }
});

// 检查 Git 是否安装
ipcMain.handle('check-git', async () => {
  return new Promise((resolve) => {
    exec('git --version', (error, stdout) => {
      resolve({
        installed: !error,
        version: error ? null : stdout.trim()
      });
    });
  });
});

// 设置Git环境（SSH和代理）
function setupGitEnvironment(config) {
  if (config.auth_type === 'ssh' && config.ssh_key_path) {
    let sshKey = config.ssh_key_path;
    if (sshKey.endsWith('.pub')) sshKey = sshKey.slice(0, -4);
    
    if (fs.existsSync(sshKey)) {
      const sshCommand = process.platform === 'win32' 
        ? `ssh -i "${sshKey}" -o StrictHostKeyChecking=no`
        : `ssh -i ${sshKey} -o StrictHostKeyChecking=no`;
      process.env.GIT_SSH_COMMAND = sshCommand;
    }
  }
  
  if (config.use_proxy && config.proxy_url) {
    const proxy = config.proxy_url;
    if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
      process.env.HTTP_PROXY = `http://${proxy}`;
      process.env.HTTPS_PROXY = `http://${proxy}`;
    } else {
      process.env.HTTP_PROXY = proxy;
      process.env.HTTPS_PROXY = proxy;
    }
  }
  
  if (config.username && config.email) {
    const git = simpleGit();
    git.addConfig('user.name', config.username);
    git.addConfig('user.email', config.email);
  }
}

// 清理Git环境
function clearGitEnvironment() {
  ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'GIT_SSH_COMMAND'].forEach(key => {
    delete process.env[key];
  });
}

// 处理远程URL（转换SSH、添加认证、代理）
function processRemoteUrl(url, platform, config) {
  if (!url || !config) return url;
  
  // SSH转换
  if (config.auth_type === 'ssh' && (url.startsWith('http://') || url.startsWith('https://'))) {
    // 转换为SSH格式
    const urlMatch = url.match(/https?:\/\/(?:www\.)?([^\/]+)\/(.+)/);
    if (urlMatch) {
      const host = urlMatch[1];
      let repoPath = urlMatch[2];
      if (repoPath.endsWith('.git')) {
        repoPath = repoPath.slice(0, -4);
      }
      url = `git@${host}:${repoPath}.git`;
    }
  }
  
  // HTTPS认证（在URL中添加用户名和token）
  if (config.auth_type === 'password' && url.startsWith('https://') && config.password) {
    const urlMatch = url.match(/https:\/\/([^\/]+)\/(.+)/);
    if (urlMatch) {
      const host = urlMatch[1];
      const repoPath = urlMatch[2];
      const username = config.username || 'token';
      url = `https://${username}:${config.password}@${host}/${repoPath}`;
    }
  }
  
  // 代理处理（gh-proxy.com等）
  if (config.use_proxy && config.proxy_url && url.startsWith('https://')) {
    const proxy = config.proxy_url;
    if (proxy.includes('gh-proxy.com') || proxy.includes('ghproxy')) {
      if (!url.startsWith(proxy)) {
        url = `${proxy.replace(/\/$/, '')}/${url}`;
      }
    }
  }
  
  return url;
}
