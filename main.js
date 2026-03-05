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

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const CHECK_TIMEOUT_MS = 30000;

function sendUpdateStatus(status, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', status, { ...payload });
  }
}

function sendUpdateLog(message, level = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-log', { message, level });
  }
}

function formatErrorForLog(err) {
  if (!err) return '未知错误';
  const msg = err.message || String(err);
  const stack = err.stack;
  if (!stack || stack === msg) return msg;
  const lines = stack.split('\n').slice(0, 8);
  return `[错误] ${msg}\n${lines.join('\n')}`;
}

let isCheckingUpdate = false;

function checkForUpdatesWithTimeout() {
  if (isCheckingUpdate) {
    return Promise.reject(new Error('更新检查正在进行中，请勿重复调用'));
  }
  
  return new Promise((resolve, reject) => {
    isCheckingUpdate = true;
    let timeoutId;
    let resolved = false;
    
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      resolved = true;
      isCheckingUpdate = false;
    };

    const onUpdateAvailable = (info) => {
      if (resolved) return;
      sendUpdateLog(`更新: 发现新版本 v${info.version}`, 'info');
      cleanup();
      removeListeners();
      sendUpdateStatus('available', {
        message: `发现新版本 v${info.version}`,
        version: info.version,
        releaseNotes: info.releaseNotes
      });
      resolve(info);
    };

    const onUpdateNotAvailable = () => {
      if (resolved) return;
      sendUpdateLog('更新: 已是最新版本', 'info');
      cleanup();
      removeListeners();
      sendUpdateStatus('not-available', { message: '已是最新版本' });
      resolve(null);
    };

    const onError = (err) => {
      if (resolved) return;
      sendUpdateLog(formatErrorForLog(err), 'error');
      cleanup();
      removeListeners();
      sendUpdateStatus('error', { message: err.message || '检查更新失败' });
      reject(err);
    };

    const removeListeners = () => {
      try {
        autoUpdater.removeAllListeners('update-available');
        autoUpdater.removeAllListeners('update-not-available');
        autoUpdater.removeAllListeners('error');
      } catch (e) {}
    };

    // 先清理所有之前的监听器，避免重复
    removeListeners();
    
    // 设置新的监听器（使用 once 确保只触发一次）
    autoUpdater.once('update-available', onUpdateAvailable);
    autoUpdater.once('update-not-available', onUpdateNotAvailable);
    autoUpdater.once('error', onError);

    // 设置超时
    timeoutId = setTimeout(() => {
      if (resolved) return;
      cleanup();
      removeListeners();
      reject(new Error('检查更新超时，请检查网络'));
    }, CHECK_TIMEOUT_MS);

    // 调用检查更新
    autoUpdater.checkForUpdates().catch((err) => {
      if (resolved) return;
      cleanup();
      removeListeners();
      reject(err);
    });
  });
}

async function performUpdateCheck() {
  sendUpdateLog('更新: 检查中', 'info');
  await checkForUpdatesWithTimeout();
  sendUpdateLog('更新: 检查完成', 'info');
}

function doCheckForUpdates() {
  if (!app.isPackaged || process.env.NODE_ENV === 'development') return;
  setImmediate(() => {
    performUpdateCheck().catch((err) => {
      sendUpdateLog(formatErrorForLog(err), 'error');
      sendUpdateStatus('error', { message: err.message || '检查更新失败' });
    });
  });
}

// 全局事件监听器已移除，改为在 checkForUpdatesWithTimeout 中按需添加

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const percent = Math.max(0, Math.min(100, progressObj.percent || 0));
    const transferred = progressObj.transferred || 0;
    const total = progressObj.total || 0;
    sendUpdateLog(`更新: 下载进度 ${Math.round(percent)}% (${transferred}/${total})`, 'info');
    mainWindow.webContents.send('update-progress', {
      percent: Math.round(percent),
      transferred: transferred,
      total: total
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateLog(`更新: 下载完成 v${info.version}`, 'info');
  sendUpdateStatus('downloaded', { message: '更新已下载完成', version: info.version });
});

app.whenReady().then(() => {
  createWindow();
  // 初始化代理拦截器（但不立即启用，只在直连失败时启用）
  setImmediate(doCheckForUpdates);
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

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { success: true, skipped: true, reason: 'unpacked' };
  sendUpdateLog('更新: 开始检查', 'info');
  try {
    await performUpdateCheck();
    return { success: true };
  } catch (err) {
    sendUpdateLog(formatErrorForLog(err), 'error');
    sendUpdateStatus('error', { message: err.message || '检查更新失败' });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    sendUpdateLog('更新: 开始下载', 'info');
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e) {
    sendUpdateLog(formatErrorForLog(e), 'error');
    return { success: false, error: e.message };
  }
});

ipcMain.handle('install-update', async () => {
  sendUpdateLog('更新: 即将退出并安装', 'info');
  autoUpdater.quitAndInstall(false);
  return { success: true };
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

function clearUpdateCache() {
  const cleared = [];
  const userData = app.getPath('userData');
  const tryRemove = (dir) => {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
        cleared.push(dir);
      }
    } catch (e) {}
  };
  tryRemove(path.join(userData, 'pending'));
  tryRemove(path.join(userData, 'Caches', 'com.github.electron.updater'));
  tryRemove(path.join(userData, 'Caches', 'electron-updater'));
  return { success: true, cleared };
}

ipcMain.handle('clear-update-cache', () => clearUpdateCache());

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

function getSshDir() {
  return path.join(app.getPath('home'), '.ssh');
}

ipcMain.handle('get-ssh-dir', async () => getSshDir());

ipcMain.handle('detect-default-ssh-key', async () => {
  const dir = getSshDir();
  if (!fs.existsSync(dir)) return null;
  for (const name of ['id_ed25519', 'id_rsa']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
});

ipcMain.handle('select-file', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: defaultPath || app.getPath('documents'),
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

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
  
  exec(command, () => {});
});

function getConfigPath() {
  return path.join(getDataDir(), 'config.json');
}

ipcMain.handle('load-config', async () => {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {}
  return null;
});

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
    return false;
  }
});

function getFirstRemoteUrl(remotes) {
  if (!remotes) return '';
  const first = Array.isArray(remotes) ? remotes[0] : remotes[Object.keys(remotes)[0]];
  if (!first || !first.refs) return '';
  const r = first.refs;
  return (r.fetch || r.push || '').trim();
}

async function getRepoBasicInfo(git) {
  let remoteUrl = '';
  let branch = '无分支';
  let status = { modified: [], staged: [], untracked: [], files: [] };
  
  try { remoteUrl = getFirstRemoteUrl(await git.getRemotes(true)); } catch (e) {}
  try { const b = await git.branchLocal(); branch = b.current || branch; } catch (e) {}
  try { status = await git.status(); } catch (e) {}
  
  return {
    remoteUrl,
    branch,
    modified: (status.modified || []).length,
    staged: (status.staged || []).length,
    untracked: (status.untracked || []).length,
    files: status.files || []
  };
}

ipcMain.handle('get-repos', async (event, repoPaths) => {
  if (!Array.isArray(repoPaths) || repoPaths.length === 0) return [];

  const repos = [];
  for (const repoPath of repoPaths) {
    if (!repoPath || !fs.existsSync(repoPath)) continue;
    const gitPath = path.join(repoPath, '.git');
    if (!fs.existsSync(gitPath) || !fs.statSync(repoPath).isDirectory()) continue;

    const name = path.basename(repoPath);
    
    try {
      const git = simpleGit(repoPath);
      const info = await getRepoBasicInfo(git);
      
      repos.push({
        name,
        path: repoPath,
        branch: info.branch,
        remoteUrl: info.remoteUrl,
        platform: detectPlatform(info.remoteUrl),
        hasChanges: info.files.length > 0,
        modified: info.modified,
        staged: info.staged,
        untracked: info.untracked
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

function detectPlatform(url) {
  if (!url) return '未知';
  const urlLower = url.toLowerCase();
  if (urlLower.includes('github.com') || urlLower.includes('github.io')) return 'GitHub';
  if (urlLower.includes('gitee.com')) return 'Gitee';
  if (urlLower.includes('gitcode.net') || urlLower.includes('gitcode.com')) return 'GitCode';
  if (urlLower.includes('gitlab.com') || urlLower.includes('gitlab.io')) return 'GitLab';
  return '其他';
}

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
    const info = await getRepoBasicInfo(git);
    
    let lastCommit = null;
    try {
      const logResult = await git.log({ maxCount: 1 });
      if (logResult.latest) {
        lastCommit = { message: logResult.latest.message, date: logResult.latest.date };
      }
    } catch (e) {}
    
    return {
      name,
      path: repoPath,
      branch: info.branch,
      remoteUrl: info.remoteUrl,
      platform: detectPlatform(info.remoteUrl),
      status: {
        modified: info.modified,
        staged: info.staged,
        untracked: info.untracked,
        files: info.files
      },
      lastCommit
    };
  } catch (error) {
    return { ...fallback, error: error.message };
  }
});

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

ipcMain.handle('git-set-user', async (event, repoPath, username, email) => {
  try {
    const git = simpleGit(repoPath);
    if (username) await git.addConfig('user.name', username, false);
    if (email) await git.addConfig('user.email', email, false);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function generateCommitSummary(status) {
  const mod = status.modified || [];
  const untracked = status.untracked || [];
  const files = status.files || [];

  const parts = [];
  if (mod.length) parts.push(`${mod.length} 修改`);
  if (untracked.length) parts.push(`${untracked.length} 新增`);
  const deleted = files.filter(f => (f.working_dir || f.index) === 'D').length;
  if (deleted) parts.push(`${deleted} 删除`);

  return parts.length ? ` [${parts.join(', ')}]` : '';
}

ipcMain.handle('git-commit', async (event, repoPath, message) => {
  try {
    const git = simpleGit(repoPath);
    const status = await git.status();
    const summary = generateCommitSummary(status);

    let insertions = 0;
    let deletions = 0;
    try {
      const diff = await git.diffSummary(['--cached']);
      if (diff && typeof diff.insertions === 'number') insertions = diff.insertions;
      if (diff && typeof diff.deletions === 'number') deletions = diff.deletions;
    } catch (e) {}

    const lineChanges = insertions || deletions ? ` +${insertions} -${deletions} 行` : '';
    const fullMessage = (message.trim() || 'Update') + summary + lineChanges;
    await git.commit(fullMessage);
    return { success: true, message: fullMessage };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function buildGitEnvOverrides(config) {
  if (!config || typeof config !== 'object') return {};
  const env = {};

  if (config.auth_type === 'ssh' && config.ssh_key_path) {
    let sshKey = config.ssh_key_path;
    if (sshKey.endsWith('.pub')) sshKey = sshKey.slice(0, -4);
    if (fs.existsSync(sshKey)) {
      env.GIT_SSH_COMMAND = process.platform === 'win32'
        ? `ssh -i "${sshKey}" -o StrictHostKeyChecking=no`
        : `ssh -i ${sshKey} -o StrictHostKeyChecking=no`;
    }
  }

  if (config.use_proxy && config.proxy_url) {
    const proxy = String(config.proxy_url);
    const normalized = proxy.startsWith('http://') || proxy.startsWith('https://')
      ? proxy
      : `http://${proxy}`;
    env.HTTP_PROXY = normalized;
    env.HTTPS_PROXY = normalized;
    env.http_proxy = normalized;
    env.https_proxy = normalized;
  }

  return env;
}

function runGitCommand(repoPath, args, envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: repoPath || undefined,
      shell: true,
      env: { ...process.env, ...(envOverrides || {}) }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code
      });
    });
    child.on('error', (error) => {
      resolve({ success: false, error: error.message, stdout, stderr });
    });
  });
}

ipcMain.handle('git-push', async (event, repoPath, remote = 'origin', branch = null, config = null) => {
  try {
    const git = simpleGit(repoPath);
    const branches = await git.branchLocal();
    const targetBranch = branch || branches.current;
    const envOverrides = buildGitEnvOverrides(config);
    const result = await runGitCommand(repoPath, ['push', remote, targetBranch], envOverrides);
    if (!result.success) throw new Error(result.stderr || result.error || 'git push 失败');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('git-pull', async (event, repoPath, remote = 'origin', branch = null, config = null) => {
  try {
    const git = simpleGit(repoPath);
    const branches = await git.branchLocal();
    const targetBranch = branch || branches.current;
    const envOverrides = buildGitEnvOverrides(config);
    const result = await runGitCommand(repoPath, ['pull', remote, targetBranch], envOverrides);
    if (!result.success) throw new Error(result.stderr || result.error || 'git pull 失败');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('git-clone', async (event, url, targetPath, options = {}, config = null) => {
  try {
    if (config) url = processRemoteUrl(url, config);
    const envOverrides = buildGitEnvOverrides(config);
    const args = ['clone', url, targetPath];
    if (options && typeof options === 'object') {
      // 保留扩展点：如需传入 --depth 等，可在此映射
    }
    const result = await runGitCommand(rootDir, args, envOverrides);
    if (!result.success) throw new Error(result.stderr || result.error || 'git clone 失败');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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

ipcMain.handle('exec-git', async (event, repoPath, command, args = []) => {
  return runGitCommand(repoPath, [command, ...(args || [])]);
});

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

ipcMain.handle('sync-repos', async (event, mainRepoPath, subordinateRepoPath, commitMessage, mainConfig = null, subConfig = null) => {
  try {
    const mainGit = simpleGit(mainRepoPath);
    const subGit = simpleGit(subordinateRepoPath);

    let mainRemoteUrl = '';
    let subRemoteUrl = '';
    try {
      mainRemoteUrl = getFirstRemoteUrl(await mainGit.getRemotes(true)).replace(/\/$/, '');
      subRemoteUrl = getFirstRemoteUrl(await subGit.getRemotes(true)).replace(/\/$/, '');
    } catch (e) {}

    const sameRemote = mainRemoteUrl && subRemoteUrl && mainRemoteUrl === subRemoteUrl;

    await mainGit.add('.');
    const status = await mainGit.status();
    const summary = generateCommitSummary(status);

    let insertions = 0;
    let deletions = 0;
    try {
      const diff = await mainGit.diffSummary(['--cached']);
      if (diff && typeof diff.insertions === 'number') insertions = diff.insertions;
      if (diff && typeof diff.deletions === 'number') deletions = diff.deletions;
    } catch (e) {}

    const lineChanges = insertions || deletions ? ` +${insertions} -${deletions} 行` : '';

    if (mainConfig?.username && mainConfig?.email) {
      await mainGit.addConfig('user.name', mainConfig.username, false);
      await mainGit.addConfig('user.email', mainConfig.email, false);
    }
    const fullMessage = commitMessage + summary + lineChanges;
    await mainGit.commit(fullMessage);

    {
      const envOverrides = buildGitEnvOverrides(mainConfig);
      const pushRes = await runGitCommand(mainRepoPath, ['push', 'origin'], envOverrides);
      if (!pushRes.success) throw new Error(pushRes.stderr || pushRes.error || '主仓库 push 失败');
    }

    if (sameRemote) {
      const envOverrides = buildGitEnvOverrides(subConfig);
      const pullRes = await runGitCommand(subordinateRepoPath, ['pull', 'origin'], envOverrides);
      if (!pullRes.success) throw new Error(pullRes.stderr || pullRes.error || '从仓库 pull 失败');
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
    const userConfig = subConfig?.username && subConfig?.email
      ? subConfig
      : mainConfig?.username && mainConfig?.email
        ? mainConfig
        : null;
    if (!userConfig) throw new Error('请先配置平台的用户名和邮箱');

    await subGit.addConfig('user.name', userConfig.username, false);
    await subGit.addConfig('user.email', userConfig.email, false);
    await subGit.commit(fullMessage);

    {
      const envOverrides = buildGitEnvOverrides(subConfig);
      const pushRes = await runGitCommand(subordinateRepoPath, ['push', 'origin'], envOverrides);
      if (!pushRes.success) throw new Error(pushRes.stderr || pushRes.error || '从仓库 push 失败');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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

// 注意：不要修改 process.env（并发操作会互相覆盖）。
// 统一使用 buildGitEnvOverrides + runGitCommand 为每次 git 调用注入独立环境变量。

function processRemoteUrl(url, config) {
  if (!url || !config) return url;
  
  if (config.auth_type === 'ssh' && (url.startsWith('http://') || url.startsWith('https://'))) {
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
  
  if (config.auth_type === 'password' && url.startsWith('https://') && config.password) {
    const urlMatch = url.match(/https:\/\/([^\/]+)\/(.+)/);
    if (urlMatch) {
      const host = urlMatch[1];
      const repoPath = urlMatch[2];
      const username = config.username || 'token';
      url = `https://${username}:${config.password}@${host}/${repoPath}`;
    }
  }
  
  return url;
}
