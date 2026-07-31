const { app, BrowserWindow, ipcMain, dialog, screen, session } = require('electron');
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#f1f5f9'
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

  const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'ui-dist', 'index.html'));
  }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
// 避免本机环境残留的无效 GH_TOKEN 导致 GitHub 下载被当成未授权而返回 404
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;

const CHECK_TIMEOUT_MS = 20000;
let isCheckingUpdate = false;
const UPDATE_PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'];

function loadAppConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
  } catch (e) {}
  return {};
}

function getUpdateProxyPort() {
  const port = parseInt(loadAppConfig().update_proxy_port, 10);
  return (port > 0 && port <= 65535) ? port : 0;
}

/** electron-updater 走独立分区 session，只改 defaultSession 不会生效 */
function getUpdateSessions() {
  const list = [session.defaultSession];
  try {
    const updaterSes = autoUpdater.netSession;
    if (updaterSes && updaterSes !== session.defaultSession) list.push(updaterSes);
  } catch (_) {}
  return list;
}

function clearUpdateProxyEnv() {
  for (const key of UPDATE_PROXY_ENV_KEYS) delete process.env[key];
}

function applyUpdateProxyEnv(port) {
  const url = `http://127.0.0.1:${port}`;
  process.env.HTTP_PROXY = url;
  process.env.HTTPS_PROXY = url;
  process.env.http_proxy = url;
  process.env.https_proxy = url;
  process.env.ALL_PROXY = url;
  process.env.all_proxy = url;
  process.env.NO_PROXY = '127.0.0.1,localhost,::1';
  process.env.no_proxy = '127.0.0.1,localhost,::1';
}

/** @param {'proxy'|'system'|'direct'} mode */
async function setUpdateNetworkMode(mode) {
  const sessions = getUpdateSessions();
  if (mode === 'proxy') {
    const port = getUpdateProxyPort();
    if (!port) return false;
    const proxyRules = `http=127.0.0.1:${port};https=127.0.0.1:${port}`;
    for (const ses of sessions) {
      await ses.setProxy({ proxyRules, proxyBypassRules: '<local>' });
      try { ses.closeAllConnections(); } catch (_) {}
    }
    applyUpdateProxyEnv(port);
    return true;
  }
  if (mode === 'system') {
    for (const ses of sessions) {
      await ses.setProxy({ mode: 'system' });
      try { ses.closeAllConnections(); } catch (_) {}
    }
    clearUpdateProxyEnv();
    return true;
  }
  for (const ses of sessions) {
    await ses.setProxy({ mode: 'direct' });
    try { ses.closeAllConnections(); } catch (_) {}
  }
  clearUpdateProxyEnv();
  return true;
}

async function probeLocalProxyPort(port, timeoutMs = 1500) {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    socket.on('connect', () => clearTimeout(timer));
  });
}

function shortUpdateError(err) {
  const raw = String(err?.message || err || '未知错误');
  if (/latest\.yml/i.test(raw) && /404|Cannot find/i.test(raw)) {
    return '无法获取更新清单 latest.yml（网络/代理或发行附件未就绪）';
  }
  if (/timeout|ETIMEDOUT|timed out/i.test(raw)) {
    return '检查更新超时，请检查网络或代理';
  }
  if (/ENOTFOUND|ECONNREFUSED|net::/i.test(raw)) {
    return '网络连接失败，请检查网络或代理';
  }
  // 截断 electron-updater 超长堆栈，避免刷屏
  const firstLine = raw.split(/\r?\n/)[0].trim();
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
}

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
  return `[错误] ${shortUpdateError(err)}`;
}

/** 有端口：本地代理 → 系统代理 → 直连；无端口：系统代理 → 直连 */
function getUpdateNetworkAttempts() {
  const port = getUpdateProxyPort();
  const attempts = [];
  if (port) attempts.push({ mode: 'proxy', label: `代理 ${port}`, port });
  attempts.push({ mode: 'system', label: '系统代理' });
  attempts.push({ mode: 'direct', label: '直连' });
  return attempts;
}

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

    const removeListeners = () => {
      try {
        autoUpdater.removeAllListeners('update-available');
        autoUpdater.removeAllListeners('update-not-available');
        autoUpdater.removeAllListeners('error');
      } catch (e) {}
    };

    const onUpdateAvailable = async (info) => {
      if (resolved) return;
      sendUpdateLog(`更新: 发现新版本 v${info.version}`, 'info');
      let releaseNotes = info.releaseNotes;
      if (!releaseNotes || (typeof releaseNotes === 'string' && !releaseNotes.trim())) {
        try {
          const configPath = path.join(app.getAppPath(), 'update-config.json');
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config?.baseUrl) {
              const res = await fetch(config.baseUrl + 'releaseNotes.md');
              if (res?.ok) releaseNotes = await res.text();
            }
          }
        } catch (e) {}
      }
      cleanup();
      removeListeners();
      sendUpdateStatus('available', {
        message: `发现新版本 v${info.version}`,
        version: info.version,
        releaseNotes: releaseNotes || ''
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
      cleanup();
      removeListeners();
      reject(err);
    };

    removeListeners();
    autoUpdater.once('update-available', onUpdateAvailable);
    autoUpdater.once('update-not-available', onUpdateNotAvailable);
    autoUpdater.once('error', onError);

    timeoutId = setTimeout(() => {
      if (resolved) return;
      cleanup();
      removeListeners();
      reject(new Error('检查更新超时，请检查网络'));
    }, CHECK_TIMEOUT_MS);

    autoUpdater.checkForUpdates().catch((err) => {
      if (resolved) return;
      cleanup();
      removeListeners();
      reject(err);
    });
  });
}

async function performUpdateCheck() {
  const attempts = getUpdateNetworkAttempts();
  let lastErr = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.mode === 'proxy') {
      const up = await probeLocalProxyPort(attempt.port);
      if (!up) {
        sendUpdateLog(`更新: 代理 ${attempt.port} 端口未监听，跳过`, 'warning');
        continue;
      }
      sendUpdateLog(`更新: 已启用本地代理 127.0.0.1:${attempt.port}（含 updater session）`, 'info');
    }
    await setUpdateNetworkMode(attempt.mode);
    sendUpdateLog(`更新: 检查中（${attempt.label}）`, 'info');
    try {
      await checkForUpdatesWithTimeout();
      sendUpdateLog('更新: 检查完成', 'info');
      return;
    } catch (err) {
      lastErr = err;
      const more = i < attempts.length - 1;
      sendUpdateLog(
        `更新: ${attempt.label}失败（${shortUpdateError(err)}）${more ? '，尝试下一种方式' : ''}`,
        more ? 'warning' : 'error'
      );
    }
  }

  throw lastErr || new Error('检查更新失败');
}

function doCheckForUpdates() {
  if (!app.isPackaged || process.env.NODE_ENV === 'development') return;
  setImmediate(() => {
    performUpdateCheck().catch((err) => {
      sendUpdateLog(formatErrorForLog(err), 'error');
      sendUpdateStatus('error', { message: shortUpdateError(err) });
    });
  });
}

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const percent = Math.max(0, Math.min(100, progressObj.percent || 0));
    const transferred = progressObj.transferred || 0;
    const total = progressObj.total || 0;
    const bytesPerSecond = progressObj.bytesPerSecond || 0;
    sendUpdateLog(`更新: 下载进度 ${Math.round(percent)}% (${transferred}/${total})${bytesPerSecond ? `，${bytesPerSecond} B/s` : ''}`, 'info');
    mainWindow.webContents.send('update-progress', {
      percent: Math.round(percent),
      transferred,
      total,
      bytesPerSecond
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateLog(`更新: 下载完成 v${info.version}`, 'info');
  sendUpdateStatus('downloaded', { message: '更新已下载完成', version: info.version });
});

app.whenReady().then(() => {
  createWindow();
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
    sendUpdateStatus('error', { message: shortUpdateError(err) });
    return { success: false, error: shortUpdateError(err) };
  }
});

ipcMain.handle('download-update', async () => {
  const attempts = getUpdateNetworkAttempts();
  let lastErr = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.mode === 'proxy') {
      const up = await probeLocalProxyPort(attempt.port);
      if (!up) {
        sendUpdateLog(`更新: 代理 ${attempt.port} 端口未监听，跳过下载尝试`, 'warning');
        continue;
      }
    }
    await setUpdateNetworkMode(attempt.mode);
    sendUpdateLog(`更新: 开始下载（${attempt.label}）`, 'info');
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (e) {
      lastErr = e;
      const more = i < attempts.length - 1;
      sendUpdateLog(
        `更新: 下载${attempt.label}失败（${shortUpdateError(e)}）${more ? '，尝试下一种方式' : ''}`,
        more ? 'warning' : 'error'
      );
    }
  }

  return { success: false, error: shortUpdateError(lastErr) };
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

ipcMain.handle('is-git-repo', async (_event, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) return { ok: false };
    const gitPath = path.join(folderPath, '.git');
    return { ok: fs.existsSync(gitPath) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('join-path', async (_event, ...parts) => {
  return path.join(...parts.filter((p) => typeof p === 'string'));
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
  let status = { files: [], staged: [] };

  try { remoteUrl = getFirstRemoteUrl(await git.getRemotes(true)); } catch (e) {}
  try { const b = await git.branchLocal(); branch = b.current || branch; } catch (e) {}
  try { status = await git.status(); } catch (e) {}

  const counts = countChangeTypes(status);
  const files = (status.files || []).map((f) => ({
    path: String(f.path || ''),
    index: String(f.index ?? ''),
    working_dir: String(f.working_dir ?? ''),
    from: f.from ? String(f.from) : undefined
  }));
  return {
    remoteUrl: String(remoteUrl || ''),
    branch: String(branch || '无分支'),
    modified: counts.modified,
    staged: (status.staged || []).length,
    untracked: counts.added,
    deleted: counts.deleted,
    renamed: counts.renamed,
    files
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
        untracked: info.untracked,
        deleted: info.deleted,
        renamed: info.renamed
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
        untracked: 0,
        deleted: 0,
        renamed: 0
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
    status: { modified: 0, staged: 0, untracked: 0, deleted: 0, renamed: 0, files: [] },
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
    
    let insertions = 0;
    let deletions = 0;
    try {
      ({ insertions, deletions } = await getWorkingTreeLineChanges(git, repoPath, { files: info.files }));
    } catch (_) {}

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
        deleted: info.deleted,
        renamed: info.renamed,
        files: info.files,
        insertions,
        deletions
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
      await git.add(['-A']);
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

/** 根据 index/working_dir 判断变更类型（与 renderer.getFileChangeType 对齐） */
function classifyFileChange(file) {
  const idx = String(file?.index ?? '').trim();
  const wrk = String(file?.working_dir ?? '').trim();
  if (idx === 'D' || wrk === 'D') return 'deleted';
  if (idx === 'R' || wrk === 'R' || idx.includes('R') || wrk.includes('R')) return 'renamed';
  if (idx === 'A' || wrk === '?' || wrk === '??') return 'added';
  if (idx === 'M' || wrk === 'M') return 'modified';
  return 'unknown';
}

function countChangeTypes(status) {
  const counts = { modified: 0, added: 0, deleted: 0, renamed: 0 };
  for (const f of status?.files || []) {
    const t = classifyFileChange(f);
    if (counts[t] !== undefined) counts[t]++;
  }
  return counts;
}

function generateCommitSummary(status) {
  const counts = countChangeTypes(status);
  const parts = [];
  if (counts.modified) parts.push(`${counts.modified} 修改`);
  if (counts.added) parts.push(`${counts.added} 新增`);
  if (counts.deleted) parts.push(`${counts.deleted} 删除`);
  if (counts.renamed) parts.push(`${counts.renamed} 重命名`);
  return parts.length ? ` [${parts.join(', ')}]` : '';
}

/** 去掉正文里已有的自动摘要/行数，避免重复拼接 */
function stripAutoCommitMeta(message) {
  return String(message || '')
    .replace(/\s*\[[^\]]*(?:✏️|➕|🗑️|🔄|\d+\s*修改|\d+\s*新增|\d+\s*删除|\d+\s*重命名)[^\]]*\]/g, '')
    .replace(/\s*\+\d+\s+-\d+\s+行\s*$/g, '')
    .trim();
}

function parseNumstat(raw) {
  let insertions = 0;
  let deletions = 0;
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\t/);
    if (parts.length < 2) continue;
    const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
    const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
    if (!Number.isNaN(ins)) insertions += ins;
    if (!Number.isNaN(del)) deletions += del;
  }
  return { insertions, deletions };
}

function countTextFileLines(filePath) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return 0;
    const buf = fs.readFileSync(filePath);
    if (buf.includes(0)) return 0;
    const text = buf.toString('utf8');
    if (!text) return 0;
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.split('\n');
    return normalized.endsWith('\n') ? Math.max(parts.length - 1, 0) : parts.length;
  } catch (_) {
    return 0;
  }
}

/** 从暂存区 numstat 统计增删行（含新增/删除文件） */
async function getLineChangesFromCached(git) {
  try {
    return parseNumstat(await git.raw(['diff', '--cached', '--numstat']));
  } catch (_) {
    try {
      const diff = await git.diffSummary(['--cached']);
      return {
        insertions: diff?.insertions || 0,
        deletions: diff?.deletions || 0
      };
    } catch (_) {
      return { insertions: 0, deletions: 0 };
    }
  }
}

/** 工作区相对 HEAD 的行数预览（含未跟踪新文件），用于默认提交信息 */
async function getWorkingTreeLineChanges(git, repoPath, status) {
  let insertions = 0;
  let deletions = 0;
  try {
    ({ insertions, deletions } = parseNumstat(await git.raw(['diff', 'HEAD', '--numstat'])));
  } catch (_) {
    try {
      const unstaged = parseNumstat(await git.raw(['diff', '--numstat']));
      const staged = parseNumstat(await git.raw(['diff', '--cached', '--numstat']));
      insertions = unstaged.insertions + staged.insertions;
      deletions = unstaged.deletions + staged.deletions;
    } catch (_) {}
  }

  for (const f of status?.files || []) {
    const wrk = String(f.working_dir ?? '').trim();
    if (wrk !== '?' && wrk !== '??') continue;
    const rel = String(f.path || '').trim();
    if (!rel) continue;
    insertions += countTextFileLines(path.join(repoPath, rel));
  }

  return { insertions, deletions };
}

/** 拼接完整提交信息：正文 + 摘要 + 行数 */
function buildFullCommitMessage(rawMessage, summary, insertions, deletions) {
  const base = stripAutoCommitMeta(rawMessage) || 'Update';
  const lineChanges = (insertions || deletions) ? ` +${insertions} -${deletions} 行` : '';
  return base + summary + lineChanges;
}

function statusHasChanges(status, insertions = 0, deletions = 0) {
  const counts = countChangeTypes(status);
  return counts.modified + counts.added + counts.deleted + counts.renamed > 0
    || insertions > 0 || deletions > 0;
}

/**
 * 暂存并提交（统一生成真实提交信息）
 * @returns {{ success:boolean, message?:string, error?:string, skipped?:boolean, insertions?:number, deletions?:number }}
 */
async function stageAndCommit(git, rawMessage, userConfig = null, { allowEmpty = false } = {}) {
  await git.add(['-A']);
  const status = await git.status();
  const summary = generateCommitSummary(status);
  const { insertions, deletions } = await getLineChangesFromCached(git);
  const fullMessage = buildFullCommitMessage(rawMessage, summary, insertions, deletions);

  if (!statusHasChanges(status, insertions, deletions)) {
    if (allowEmpty) {
      return { success: true, skipped: true, message: fullMessage, insertions, deletions };
    }
    return { success: false, error: '没有可提交的变更', message: fullMessage };
  }

  if (userConfig?.username && userConfig?.email) {
    await git.addConfig('user.name', userConfig.username, false);
    await git.addConfig('user.email', userConfig.email, false);
  }

  await git.commit(fullMessage);
  return { success: true, message: fullMessage, insertions, deletions };
}

ipcMain.handle('git-commit', async (event, repoPath, message) => {
  try {
    const git = simpleGit(repoPath);
    return await stageAndCommit(git, message);
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
    const parentDir = path.dirname(targetPath) || process.cwd();
    const args = ['clone', url, targetPath];
    if (options && typeof options === 'object') {
      // 保留扩展点：如需传入 --depth 等，可在此映射
    }
    const result = await runGitCommand(parentDir, args, envOverrides);
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

/** 主仓应同步的路径：已跟踪 + 未忽略的未跟踪（尊重 .gitignore，不含本地业务 Core 等） */
async function listSyncablePaths(repoPath) {
  const git = simpleGit(repoPath);
  const raw = await git.raw(['ls-files', '-c', '-o', '--exclude-standard', '-z']);
  return String(raw || '')
    .split('\0')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((rel) => {
      const top = rel.split(/[/\\]/)[0];
      return !shouldSyncIgnore(top);
    });
}

function wipeWorkingTreeKeepGit(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git') continue;
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function copyListedFiles(mainRepoPath, subPath, relPaths) {
  for (const rel of relPaths) {
    const src = path.join(mainRepoPath, rel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
    const dest = path.join(subPath, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/** 清掉从仓里「已被 .gitignore 忽略但仍在索引中」的历史污染 */
async function untrackIgnoredFiles(git) {
  let raw = '';
  try {
    raw = await git.raw(['ls-files', '-i', '--exclude-standard', '-z']);
  } catch (_) {
    return 0;
  }
  const files = String(raw || '').split('\0').map((s) => s.trim()).filter(Boolean);
  if (!files.length) return 0;

  const chunkSize = 40;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    await git.raw(['rm', '-r', '--cached', '-q', '--', ...chunk]);
  }
  return files.length;
}

/**
 * 同步主仓库到从仓库（支持多从仓）
 * @returns {{success:boolean, error?:string, message?:string, results?:Array}}
 */
ipcMain.handle('sync-repos', async (event, mainRepoPath, subordinates, commitMessage, mainConfig = null, legacySubConfig = null) => {
  const subList = Array.isArray(subordinates)
    ? subordinates
    : typeof subordinates === 'string' && subordinates
      ? [{ path: subordinates, config: legacySubConfig || {} }]
      : [];

  try {
    const mainGit = simpleGit(mainRepoPath);
    const mainCommit = await stageAndCommit(mainGit, commitMessage, mainConfig);
    if (!mainCommit.success) {
      return { success: false, error: mainCommit.error || '主仓库提交失败', message: mainCommit.message };
    }

    const fullMessage = mainCommit.message;
    const envOverrides = buildGitEnvOverrides(mainConfig);
    const pushRes = await runGitCommand(mainRepoPath, ['push', 'origin'], envOverrides);
    if (!pushRes.success) {
      return {
        success: false,
        error: pushRes.stderr || pushRes.error || '主仓库 push 失败',
        message: fullMessage
      };
    }

    if (subList.length === 0) {
      return { success: true, message: fullMessage, results: [] };
    }

    let mainRemoteUrl = '';
    try {
      mainRemoteUrl = getFirstRemoteUrl(await mainGit.getRemotes(true)).replace(/\/$/, '');
    } catch (e) {}

    const syncPaths = await listSyncablePaths(mainRepoPath);

    const results = [];
    for (const item of subList) {
      const subPath = item?.path;
      const subName = item?.name || path.basename(subPath || '') || subPath;
      const subConfig = item?.config || {};
      try {
        if (!subPath || !fs.existsSync(subPath)) {
          throw new Error('从仓库路径无效或不存在');
        }
        const subGit = simpleGit(subPath);
        let subRemoteUrl = '';
        try {
          subRemoteUrl = getFirstRemoteUrl(await subGit.getRemotes(true)).replace(/\/$/, '');
        } catch (e) {}

        const sameRemote = !!(mainRemoteUrl && subRemoteUrl && mainRemoteUrl === subRemoteUrl);
        const effectiveConfig = subConfig || mainConfig;

        if (sameRemote) {
          const subEnv = buildGitEnvOverrides(effectiveConfig);
          const pullRes = await runGitCommand(subPath, ['pull', 'origin'], subEnv);
          if (!pullRes.success) throw new Error(pullRes.stderr || pullRes.error || '从仓库 pull 失败');
          results.push({
            path: subPath,
            name: subName,
            success: true,
            mode: 'pull',
            detail: '同远程，已 pull',
            commitMessage: fullMessage
          });
          continue;
        }

        wipeWorkingTreeKeepGit(subPath);
        copyListedFiles(mainRepoPath, subPath, syncPaths);

        const dropped = await untrackIgnoredFiles(subGit);
        const userConfig = effectiveConfig?.username && effectiveConfig?.email
          ? effectiveConfig
          : mainConfig?.username && mainConfig?.email
            ? mainConfig
            : null;
        if (!userConfig) throw new Error('请先配置平台的用户名和邮箱');

        const subCommit = await stageAndCommit(subGit, fullMessage, userConfig, { allowEmpty: true });
        if (!subCommit.success) throw new Error(subCommit.error || '从仓库提交失败');

        const subEnv = buildGitEnvOverrides(effectiveConfig);
        const subPushRes = await runGitCommand(subPath, ['push', 'origin'], subEnv);
        if (!subPushRes.success) throw new Error(subPushRes.stderr || subPushRes.error || '从仓库 push 失败');

        results.push({
          path: subPath,
          name: subName,
          success: true,
          mode: subCommit.skipped ? 'copy-push' : 'copy-commit',
          detail: subCommit.skipped
            ? `文件已同步${dropped ? `（已剔除 ${dropped} 个误跟踪忽略项）` : ''}，工作区无新增变更，已推送`
            : `已提交并推送${dropped ? `（已剔除 ${dropped} 个误跟踪忽略项）` : ''}`,
          commitMessage: subCommit.skipped ? fullMessage : subCommit.message
        });
      } catch (subErr) {
        results.push({
          path: subPath,
          name: subName,
          success: false,
          mode: 'error',
          error: subErr?.message ?? String(subErr),
          commitMessage: fullMessage
        });
      }
    }

    const allOk = results.every((r) => r.success);
    return {
      success: allOk,
      error: allOk ? undefined : results.find((r) => !r.success)?.error,
      message: fullMessage,
      results
    };
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
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
