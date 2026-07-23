import { reactive, computed } from 'vue';
import Fuse from 'fuse.js';
import { invoke } from '../utils/ipc.js';
import { useToast } from './useToast.js';

const PLATFORMS = ['GitHub', 'Gitee', 'GitCode', 'GitLab', '其他'];

const FILE_CHANGE = {
  added: { icon: 'file-add', label: '新增' },
  modified: { icon: 'file-edit', label: '修改' },
  deleted: { icon: 'file-del', label: '删除' },
  renamed: { icon: 'file-ren', label: '重命名' },
  unknown: { icon: 'file', label: '' }
};

function sanitizeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const cleaned = {};
  for (const key of Object.keys(config)) {
    const value = config[key];
    if (
      value !== undefined &&
      value !== null &&
      typeof value !== 'function' &&
      typeof value !== 'symbol' &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    ) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function getFileChangeType(file) {
  const idx = String(file.index ?? '').trim();
  const wrk = String(file.working_dir ?? '').trim();
  if (idx === 'D' || wrk === 'D') return FILE_CHANGE.deleted;
  if (idx === 'R' || wrk === 'R' || idx.includes('R') || wrk.includes('R')) return FILE_CHANGE.renamed;
  if (idx === 'A' || wrk === '?' || wrk === '??') return FILE_CHANGE.added;
  if (idx === 'M' || wrk === 'M') return FILE_CHANGE.modified;
  return FILE_CHANGE.unknown;
}

function buildChangeSummaryFromStatus(status) {
  if (!status?.files?.length) return '';
  const counts = { modified: 0, added: 0, deleted: 0, renamed: 0 };
  for (const f of status.files) {
    const t = getFileChangeType(f);
    if (t === FILE_CHANGE.modified) counts.modified++;
    else if (t === FILE_CHANGE.added) counts.added++;
    else if (t === FILE_CHANGE.deleted) counts.deleted++;
    else if (t === FILE_CHANGE.renamed) counts.renamed++;
  }
  const parts = [];
  if (counts.modified) parts.push(`${counts.modified} 修改`);
  if (counts.added) parts.push(`${counts.added} 新增`);
  if (counts.deleted) parts.push(`${counts.deleted} 删除`);
  if (counts.renamed) parts.push(`${counts.renamed} 重命名`);
  return parts.length ? ` [${parts.join(', ')}]` : '';
}

function basenamePath(p) {
  const parts = String(p || '').split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || p || '未知仓库';
}

function placeholderReposFromPaths(paths) {
  return (paths || []).map((repoPath) => ({
    name: basenamePath(repoPath),
    path: repoPath,
    branch: '加载中…',
    remoteUrl: '',
    platform: '…',
    hasChanges: false,
    modified: 0,
    staged: 0,
    untracked: 0,
    deleted: 0,
    renamed: 0,
    loading: true
  }));
}

const state = reactive({
  repoPaths: [],
  repos: [],
  currentRepo: null,
  selectionNonce: 0,
  platformConfig: {},
  syncConfig: { sync_groups: {}, repo_to_group: {} },
  theme: 'light',
  autoRefreshEnabled: true,
  autoRefreshInterval: 30000,
  updateProxyPort: '',
  isRefreshing: false,
  isBootstrapping: true,
  panelSizes: null,
  appVersion: '',
  searchTerm: '',
  commitMessage: '',
  repoInfo: null,
  logs: [],
  modal: null,
  busy: false
});

let autoRefreshTimer = null;
let logSeq = 0;

export function useAppStore() {
  const { showMessage } = useToast();

  const filteredRepos = computed(() => {
    const term = state.searchTerm.trim();
    if (!term) return state.repos;
    const fuse = new Fuse(state.repos, {
      keys: ['name', 'platform', 'branch', 'remoteUrl'],
      threshold: 0.38,
      ignoreLocation: true
    });
    return fuse.search(term).map((r) => r.item);
  });

  function log(message, level = 'info') {
    state.logs.push({
      id: ++logSeq,
      message: String(message),
      level,
      time: new Date().toLocaleTimeString('zh-CN')
    });
    if (state.logs.length > 500) state.logs.splice(0, state.logs.length - 500);
  }

  function clearLogs() {
    state.logs = [];
  }

  function formatRepoPrefix(repoName) {
    return `[${repoName || state.currentRepo?.name || '未选择'}]`;
  }

  function logRepo(repoName, message, level = 'info') {
    log(`${formatRepoPrefix(repoName)} ${message}`, level);
  }

  function showRepoMessage(repoName, message, type = 'info') {
    showMessage(`${formatRepoPrefix(repoName)} ${message}`, type);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    saveConfig();
    const label = state.theme === 'light' ? '白天' : '夜晚';
    log(`已切换到${label}模式`, 'success');
    showMessage(`已切换到${label}模式`, 'success');
  }

  async function saveConfig() {
    const config = {
      repo_paths: state.repoPaths.slice(),
      platform_configs: Object.fromEntries(
        Object.entries({ ...state.platformConfig }).map(([k, v]) => [k, sanitizeConfig(v)])
      ),
      sync_config: JSON.parse(JSON.stringify(state.syncConfig || { sync_groups: {}, repo_to_group: {} })),
      theme: state.theme,
      autoRefreshEnabled: state.autoRefreshEnabled,
      autoRefreshInterval: state.autoRefreshInterval,
      update_proxy_port: state.updateProxyPort || '',
      panel_sizes: state.panelSizes ? [...state.panelSizes] : undefined
    };
    await invoke('save-config', config);
  }

  async function loadConfig() {
    const config = (await invoke('load-config')) || {};
    state.repoPaths = config.repo_paths || [];
    state.platformConfig = config.platform_configs || {};
    state.syncConfig = config.sync_config || { sync_groups: {}, repo_to_group: {} };
    state.theme = config.theme || 'light';
    state.autoRefreshEnabled = config.autoRefreshEnabled !== undefined ? config.autoRefreshEnabled : true;
    state.autoRefreshInterval = config.autoRefreshInterval || 30000;
    state.updateProxyPort = config.update_proxy_port != null ? String(config.update_proxy_port) : '';
    state.panelSizes = Array.isArray(config.panel_sizes) ? config.panel_sizes : null;
    applyTheme(state.theme);
    // 先用路径占位填满列表，避免加载期间空白/布局塌陷
    if (state.repoPaths.length > 0) {
      state.repos = placeholderReposFromPaths(state.repoPaths);
      await refreshRepoList(true);
    }
  }

  function getRepoRole(repoName) {
    if (!state.syncConfig.repo_to_group?.[repoName]) return null;
    const group = state.syncConfig.sync_groups[state.syncConfig.repo_to_group[repoName]];
    if (!group) return null;
    if (group.main === repoName) return 'main';
    if (group.subordinates?.includes(repoName)) return 'subordinate';
    return null;
  }

  function getSubordinates(mainRepoName) {
    const groupId = state.syncConfig.repo_to_group?.[mainRepoName];
    if (!groupId) return [];
    const group = state.syncConfig.sync_groups[groupId];
    if (!group || group.main !== mainRepoName) return [];
    return group.subordinates || [];
  }

  function getRepoConfigFor(repo) {
    const platform = repo?.platform || 'GitHub';
    return sanitizeConfig(state.platformConfig[platform] || {});
  }

  function setDefaultCommitMessage(status) {
    const dateStr = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    state.commitMessage = `Update: ${dateStr}${buildChangeSummaryFromStatus(status)}`;
  }

  function checkRepoSelected() {
    if (!state.currentRepo) {
      showMessage('请先选择一个仓库', 'warning');
      return false;
    }
    if (state.currentRepo.loading) {
      showMessage('仓库信息仍在加载，请稍候', 'info');
      return false;
    }
    return true;
  }

  async function refreshRepoList(silent = false) {
    if (state.isRefreshing) return;
    state.isRefreshing = true;
    const previousPath = state.currentRepo?.path;
    const nonce = state.selectionNonce;
    try {
      const paths = state.repoPaths.slice();
      if (!paths.length) {
        state.repos = [];
        state.currentRepo = null;
        state.repoInfo = null;
        if (!silent) log('仓库列表为空', 'info');
        return;
      }
      state.repos = (await invoke('get-repos', paths)) || [];
      if (previousPath && nonce === state.selectionNonce) {
        const found = state.repos.find((r) => r.path === previousPath);
        if (found) state.currentRepo = found;
      }
      if (state.currentRepo && !state.currentRepo.loading) await updateCurrentRepoInfo(true);
      if (!silent) log(`已加载 ${state.repos.length} 个仓库`, 'success');
    } catch (error) {
      log(`刷新失败: ${error.message}`, 'error');
    } finally {
      state.isRefreshing = false;
    }
  }

  async function updateCurrentRepoInfo(silent = false) {
    if (!state.currentRepo) {
      state.repoInfo = null;
      return;
    }
    try {
      const info = await invoke('get-repo-info', state.currentRepo.path);
      state.repoInfo = info;
      const repo = state.repos.find((r) => r.path === state.currentRepo.path);
      if (repo && info?.status) {
        Object.assign(repo, {
          modified: info.status.modified || 0,
          staged: info.status.staged || 0,
          untracked: info.status.untracked || 0,
          deleted: info.status.deleted || 0,
          renamed: info.status.renamed || 0,
          hasChanges: (info.status.files || []).length > 0
        });
      }
      const cur = state.commitMessage.trim();
      if (!cur || /^Update:/.test(cur)) setDefaultCommitMessage(info.status);
    } catch (error) {
      if (!silent) log(`获取仓库信息失败: ${error.message}`, 'error');
    }
  }

  async function selectRepo(repo) {
    if (!repo || repo.loading) return;
    const latest = state.repos.find((r) => r.path === repo.path) || repo;
    state.selectionNonce++;
    state.currentRepo = latest;
    log(`已选择仓库: ${latest.name}`, 'info');
    await updateCurrentRepoInfo();
  }

  async function addRepo() {
    const folder = await invoke('select-folder');
    if (!folder) return;
    const check = await invoke('is-git-repo', folder);
    if (!check?.ok) {
      showMessage('该目录不是 Git 仓库（无 .git）', 'warning');
      log('添加失败：所选目录不是 Git 仓库', 'warning');
      return;
    }
    if (state.repoPaths.includes(folder)) {
      showMessage('该仓库已在列表中', 'info');
      return;
    }
    state.repoPaths.push(folder);
    await saveConfig();
    await refreshRepoList();
    log(`已添加仓库: ${folder}`, 'success');
    showMessage('已添加仓库', 'success');
  }

  async function removeRepoFromList(repoPath) {
    const confirmed = await openConfirm('确认移除', '从列表中移除此仓库？（不会删除电脑上的文件）');
    if (!confirmed) return;
    state.repoPaths = state.repoPaths.filter((p) => p !== repoPath);
    if (state.currentRepo?.path === repoPath) {
      state.selectionNonce++;
      state.currentRepo = null;
      state.repoInfo = null;
    }
    await saveConfig();
    await refreshRepoList(true);
    log('已从列表移除仓库', 'info');
  }

  async function reorderRepoPaths(newPaths) {
    if (!Array.isArray(newPaths) || newPaths.length !== state.repoPaths.length) return;
    const same = newPaths.every((p, i) => p === state.repoPaths[i]);
    if (same) return;
    state.repoPaths = newPaths;
    await saveConfig();
    await refreshRepoList(true);
    log('仓库顺序已调整', 'info');
  }

  function openModal(modal) {
    state.modal = modal;
  }

  function closeModal() {
    state.modal = null;
  }

  function openConfirm(title, message) {
    return new Promise((resolve) => {
      openModal({
        type: 'confirm',
        title,
        message,
        resolve: (ok) => {
          closeModal();
          resolve(!!ok);
        }
      });
    });
  }

  function openInput(title, message, defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
      openModal({
        type: 'input',
        title,
        message,
        defaultValue,
        placeholder,
        resolve: (value) => {
          closeModal();
          resolve(value);
        }
      });
    });
  }

  async function getCommitMessage() {
    let message = state.commitMessage.trim();
    if (!message || message.startsWith('Update:')) {
      const defaultValue = message || `Update: ${new Date().toLocaleString('zh-CN')}`;
      const input = await openInput('提交信息', '请输入提交信息:', defaultValue, '提交信息');
      if (!input) return null;
      message = input;
    }
    return message;
  }

  async function executeCommit(repoPath, message, config) {
    if (config?.username && config?.email) {
      await invoke('git-set-user', repoPath, config.username, config.email);
    }
    const commitResult = await invoke('git-commit', repoPath, message);
    if (!commitResult.success) throw new Error(commitResult.error);
    return commitResult;
  }

  function oneLine(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  async function runCommitFlow({ push = false } = {}) {
    if (state.busy || !checkRepoSelected()) return;
    const repo = state.currentRepo;
    const nonce = state.selectionNonce;
    const message = await getCommitMessage();
    if (!message) return;
    state.busy = true;
    const actionLabel = push ? '提交并推送' : '提交';
    logRepo(repo.name, `开始${actionLabel}`, 'info');
    logRepo(repo.name, `拟提交信息: ${oneLine(message)}`, 'info');
    try {
      const config = getRepoConfigFor(repo);
      const result = await executeCommit(repo.path, message, config);
      const realMsg = result.message || message;
      logRepo(repo.name, `提交成功: ${oneLine(realMsg)}`, 'success');
      if (push) {
        logRepo(repo.name, '开始推送到 origin...', 'info');
        const pushResult = await invoke('git-push', repo.path, 'origin', null, config);
        if (!pushResult.success) throw new Error(pushResult.error);
        logRepo(repo.name, `推送成功（提交: ${oneLine(realMsg)}）`, 'success');
      }
      showRepoMessage(repo.name, `${actionLabel}成功`, 'success');
      if (nonce === state.selectionNonce) setDefaultCommitMessage();
      await refreshRepoList(true);
    } catch (error) {
      logRepo(repo.name, `${actionLabel}失败: ${error.message}`, 'error');
      showRepoMessage(repo.name, `${actionLabel}失败: ${error.message}`, 'error');
    } finally {
      state.busy = false;
    }
  }

  async function quickCommit() {
    await runCommitFlow({ push: false });
  }

  async function commitAndPush() {
    await runCommitFlow({ push: true });
  }

  async function commitAndSync() {
    if (state.busy || !checkRepoSelected()) return;
    const mainRepo = state.currentRepo;
    const role = getRepoRole(mainRepo.name);
    const subordinates = role === 'main' ? getSubordinates(mainRepo.name) : [];
    if (role !== 'main' || subordinates.length === 0) {
      logRepo(mainRepo.name, '当前不是主仓库或无从仓库，改为普通推送', 'info');
      await commitAndPush();
      return;
    }
    const nonce = state.selectionNonce;
    const message = await getCommitMessage();
    if (!message) return;
    state.busy = true;
    logRepo(mainRepo.name, `开始同步推送 -> ${subordinates.join(', ')}`, 'info');
    logRepo(mainRepo.name, `拟提交信息: ${oneLine(message)}`, 'info');
    try {
      const config = getRepoConfigFor(mainRepo);
      const subList = [];
      for (const subName of subordinates) {
        const subRepo = state.repos.find((r) => r.name === subName);
        if (!subRepo?.path || subRepo.loading) {
          logRepo(mainRepo.name, `从仓库「${subName}」未就绪，跳过`, 'warning');
          continue;
        }
        let subConfig = sanitizeConfig(state.platformConfig[subRepo.platform] || {});
        if ((!subConfig.username || !subConfig.email) && config.username && config.email) {
          subConfig = { ...subConfig, username: config.username, email: config.email };
        }
        subList.push({ path: subRepo.path, name: subRepo.name, config: subConfig });
      }
      if (subList.length === 0) {
        logRepo(mainRepo.name, '没有可同步的从仓库，改为普通推送', 'warning');
        state.busy = false;
        await commitAndPush();
        return;
      }

      const syncResult = await invoke('sync-repos', mainRepo.path, subList, message, config);
      const realMsg = oneLine(syncResult.message || message);

      if (syncResult.message) {
        logRepo(mainRepo.name, `实际提交信息: ${realMsg}`, 'info');
      }

      for (const r of syncResult.results || []) {
        const label = r.name || r.path || '从仓库';
        if (r.success) {
          const detail = r.detail || (r.mode === 'pull' ? '同远程已 pull' : '同步完成');
          const msgPart = r.commitMessage ? `；提交: ${oneLine(r.commitMessage)}` : '';
          logRepo(mainRepo.name, `从仓库「${label}」${detail}${msgPart}`, 'success');
        } else {
          logRepo(mainRepo.name, `从仓库「${label}」失败: ${r.error || '未知错误'}`, 'error');
        }
      }

      if (!syncResult.success) {
        throw new Error(syncResult.error || '同步失败');
      }

      const okCount = (syncResult.results || []).filter((r) => r.success).length;
      const total = (syncResult.results || []).length;
      logRepo(mainRepo.name, `同步完成 ${okCount}/${total}；提交信息: ${realMsg}`, 'success');
      showRepoMessage(mainRepo.name, `同步完成 ${okCount}/${total}\n${realMsg}`, 'success');
      if (nonce === state.selectionNonce) setDefaultCommitMessage();
      await refreshRepoList(true);
    } catch (error) {
      logRepo(mainRepo.name, `同步失败: ${error.message}`, 'error');
      showRepoMessage(mainRepo.name, `同步失败: ${error.message}`, 'error');
    } finally {
      state.busy = false;
    }
  }

  async function withErrorHandling(fn, successMsg, errorMsg, onSuccess = null) {
    try {
      const result = await fn();
      if (result?.success === false) throw new Error(result.error);
      if (successMsg) {
        log(successMsg, 'success');
        showMessage(successMsg, 'success');
      }
      if (onSuccess) await onSuccess();
      return result;
    } catch (error) {
      const msg = errorMsg ? `${errorMsg}: ${error.message}` : error.message;
      log(msg, 'error');
      showMessage(msg, 'error');
      return null;
    }
  }

  async function pullChanges() {
    if (!checkRepoSelected()) return;
    const repo = state.currentRepo;
    logRepo(repo.name, '开始拉取...', 'info');
    const config = getRepoConfigFor(repo);
    await withErrorHandling(
      () => invoke('git-pull', repo.path, 'origin', null, config),
      `${formatRepoPrefix(repo.name)} 拉取成功`,
      `${formatRepoPrefix(repo.name)} 拉取失败`,
      () => refreshRepoList(true)
    );
  }

  async function pullChangesForce() {
    if (!checkRepoSelected()) return;
    const ok = await openConfirm(
      '强制拉取',
      '将丢弃本地未提交修改并重置到远程分支，确定继续？'
    );
    if (!ok) return;
    const repo = state.currentRepo;
    logRepo(repo.name, '强制拉取（fetch + reset --hard）...', 'warning');
    await withErrorHandling(
      async () => {
        const fetchRes = await invoke('exec-git', repo.path, 'fetch', ['origin']);
        if (!fetchRes.success) throw new Error(fetchRes.stderr || fetchRes.error || 'fetch 失败');
        const branchRes = await invoke('exec-git', repo.path, 'rev-parse', ['--abbrev-ref', 'HEAD']);
        const branch = String(branchRes.stdout || '').trim() || 'main';
        return invoke('exec-git', repo.path, 'reset', ['--hard', `origin/${branch}`]);
      },
      `${formatRepoPrefix(repo.name)} 强制拉取成功`,
      `${formatRepoPrefix(repo.name)} 强制拉取失败`,
      () => refreshRepoList(true)
    );
  }

  async function pushChanges() {
    if (!checkRepoSelected()) return;
    const repo = state.currentRepo;
    const config = getRepoConfigFor(repo);
    logRepo(repo.name, '开始推送...', 'info');
    await withErrorHandling(
      () => invoke('git-push', repo.path, 'origin', null, config),
      `${formatRepoPrefix(repo.name)} 推送成功`,
      `${formatRepoPrefix(repo.name)} 推送失败`,
      () => refreshRepoList(true)
    );
  }

  async function stashChanges() {
    if (!checkRepoSelected()) return;
    const msg = (await openInput('暂存', '暂存说明（可选）:', '', 'stash message')) || 'stash';
    const repo = state.currentRepo;
    await withErrorHandling(
      () => invoke('git-stash', repo.path, msg),
      `${formatRepoPrefix(repo.name)} 暂存成功`,
      `${formatRepoPrefix(repo.name)} 暂存失败`,
      () => refreshRepoList(true)
    );
  }

  async function stashPop() {
    if (!checkRepoSelected()) return;
    const repo = state.currentRepo;
    await withErrorHandling(
      () => invoke('git-stash-pop', repo.path),
      `${formatRepoPrefix(repo.name)} 恢复暂存成功`,
      `${formatRepoPrefix(repo.name)} 恢复暂存失败`,
      () => refreshRepoList(true)
    );
  }

  async function createBranch() {
    if (!checkRepoSelected()) return;
    const name = await openInput('创建分支', '请输入新分支名称:', '', '分支名称');
    if (!name?.trim()) return;
    const repo = state.currentRepo;
    logRepo(repo.name, `创建分支: ${name}`, 'info');
    const result = await invoke('exec-git', repo.path, 'checkout', ['-b', name.trim()]);
    if (result.success) {
      logRepo(repo.name, `分支 ${name} 创建成功`, 'success');
      showRepoMessage(repo.name, '分支创建成功！', 'success');
      await refreshRepoList(true);
    } else {
      const err = result.stderr || result.error || '创建分支失败';
      logRepo(repo.name, `创建分支失败: ${err}`, 'error');
      showRepoMessage(repo.name, `创建分支失败: ${err}`, 'error');
    }
  }

  async function switchBranch() {
    if (!checkRepoSelected()) return;
    const repo = state.currentRepo;
    const branchResult = await invoke('exec-git', repo.path, 'branch', []);
    if (!branchResult.success) {
      showMessage(branchResult.stderr || '获取分支失败', 'error');
      return;
    }
    const branches = String(branchResult.stdout || '')
      .split('\n')
      .map((l) => l.replace(/^\*?\s*/, '').trim())
      .filter(Boolean);
    openModal({
      type: 'switch-branch',
      title: '切换分支',
      branches,
      onSelect: async (branchName) => {
        closeModal();
        const result = await invoke('exec-git', repo.path, 'checkout', [branchName]);
        if (result.success) {
          showRepoMessage(repo.name, `已切换到 ${branchName}`, 'success');
          await refreshRepoList(true);
        } else {
          showMessage(result.stderr || result.error || '切换失败', 'error');
        }
      }
    });
  }

  async function viewLog() {
    if (!checkRepoSelected()) return;
    const repo = state.currentRepo;
    const result = await invoke('exec-git', repo.path, 'log', ['--oneline', '--graph', '--decorate', '-20']);
    openModal({
      type: 'pre',
      title: `提交日志 ${formatRepoPrefix(repo.name)}`,
      content: result.stdout || result.stderr || '暂无日志',
      closeOnly: true
    });
  }

  async function viewDiff() {
    if (!checkRepoSelected()) return;
    const repo = state.currentRepo;
    const result = await invoke('exec-git', repo.path, 'diff', []);
    openModal({
      type: 'pre',
      title: `文件差异 ${formatRepoPrefix(repo.name)}`,
      content: result.stdout || '暂无差异',
      closeOnly: true
    });
  }

  async function openRepoFolder(repoPath) {
    await invoke('open-folder', repoPath || state.currentRepo?.path);
  }

  function startAutoRefresh() {
    if (!state.autoRefreshEnabled) return;
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
      if (!state.isRefreshing && state.repoPaths.length > 0) refreshRepoList(true);
    }, state.autoRefreshInterval);
    log(`自动刷新已启动（间隔 ${state.autoRefreshInterval / 1000} 秒）`, 'info');
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  async function initApp() {
    state.isBootstrapping = true;
    try {
      state.appVersion = await invoke('get-app-version');
      log(`向日葵Git仓库管理 v${state.appVersion} 已启动`, 'success');
      const gitCheck = await invoke('check-git');
      if (!gitCheck.installed) {
        log('警告：未检测到 Git，请先安装 Git', 'warning');
        showMessage('未检测到 Git，请先安装', 'warning');
      } else {
        log(`Git: ${gitCheck.version}`, 'success');
      }
      await loadConfig();
      setDefaultCommitMessage();
      startAutoRefresh();
    } finally {
      state.isBootstrapping = false;
    }
  }

  return {
    state,
    PLATFORMS,
    FILE_CHANGE,
    filteredRepos,
    getFileChangeType,
    sanitizeConfig,
    showMessage,
    log,
    clearLogs,
    toggleTheme,
    saveConfig,
    loadConfig,
    getRepoRole,
    getSubordinates,
    getRepoConfigFor,
    setDefaultCommitMessage,
    refreshRepoList,
    updateCurrentRepoInfo,
    selectRepo,
    addRepo,
    removeRepoFromList,
    reorderRepoPaths,
    openModal,
    closeModal,
    openConfirm,
    openInput,
    quickCommit,
    commitAndPush,
    commitAndSync,
    pullChanges,
    pullChangesForce,
    pushChanges,
    stashChanges,
    stashPop,
    createBranch,
    switchBranch,
    viewLog,
    viewDiff,
    openRepoFolder,
    initApp,
    stopAutoRefresh,
    checkRepoSelected
  };
}
