const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// 全局状态（仓库为按路径逐个添加，存本地配置）
let state = {
    repoPaths: [],
    repos: [],
    currentRepo: null,
    platformConfig: {},
    syncConfig: { sync_groups: {}, repo_to_group: {} },
    theme: 'light',
    autoRefreshEnabled: true,
    autoRefreshInterval: 30000, // 30秒自动刷新
    isRefreshing: false
};

// 自动刷新定时器
let autoRefreshTimer = null;

// DOM 元素缓存（性能优化）
let elements = {};

// 初始化DOM元素缓存
function initElements() {
    elements = {
        repoList: document.getElementById('repo-list'),
        searchInput: document.getElementById('search-input'),
        repoInfo: {
            name: document.getElementById('info-name'),
            platform: document.getElementById('info-platform'),
            branch: document.getElementById('info-branch'),
            role: document.getElementById('info-role'),
            remote: document.getElementById('info-remote'),
            auth: document.getElementById('info-auth')
        },
        commitMessage: document.getElementById('commit-message'),
        logContainer: document.getElementById('log-container'),
        changesList: document.getElementById('changes-list'),
        themeIcon: document.getElementById('theme-icon'),
        buttons: {
            addRepo: document.getElementById('btn-add-repo'),
            refresh: document.getElementById('btn-refresh'),
            platformConfig: document.getElementById('btn-platform-config'),
            syncConfig: document.getElementById('btn-sync-config'),
            clone: document.getElementById('btn-clone'),
            batch: document.getElementById('btn-batch'),
            help: document.getElementById('btn-help'),
            update: document.getElementById('btn-update'),
            clearUpdateCache: document.getElementById('btn-clear-update-cache'),
            theme: document.getElementById('btn-theme'),
            commit: document.getElementById('btn-commit'),
            commitPush: document.getElementById('btn-commit-push'),
            commitSync: document.getElementById('btn-commit-sync'),
            refreshChanges: document.getElementById('btn-refresh-changes'),
            pull: document.getElementById('btn-pull'),
            push: document.getElementById('btn-push'),
            stash: document.getElementById('btn-stash'),
            stashPop: document.getElementById('btn-stash-pop'),
            createBranch: document.getElementById('btn-create-branch'),
            switchBranch: document.getElementById('btn-switch-branch'),
            viewLog: document.getElementById('btn-view-log'),
            viewDiff: document.getElementById('btn-view-diff'),
            openFolder: document.getElementById('btn-open-folder'),
            clearLog: document.getElementById('btn-clear-log')
        }
    };
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    initNotificationSystem();
    setupWindowControls();
    await init();
    setupEventListeners();
    setDefaultCommitMessage();
    startAutoRefresh();
});

// 窗口控制
function setupWindowControls() {
    const btnMinimize = document.getElementById('btn-minimize');
    const btnMaximize = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');
    
    if (btnMinimize) {
        btnMinimize.addEventListener('click', () => ipcRenderer.invoke('window-minimize'));
    }
    
    if (btnMaximize) {
        btnMaximize.addEventListener('click', () => ipcRenderer.invoke('window-maximize'));
        setInterval(async () => {
            const isMaximized = await ipcRenderer.invoke('window-is-maximized');
            btnMaximize.textContent = isMaximized ? '❐' : '□';
        }, 200);
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', () => ipcRenderer.invoke('window-close'));
    }
}

// 窗口关闭前停止自动刷新
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});

// 初始化应用
async function init() {
    const appVersion = await ipcRenderer.invoke('get-app-version');
    log(`🌻 向日葵Git仓库管理 v${appVersion} 已启动`, 'success');
    
    // 检查 Git
    const gitCheck = await ipcRenderer.invoke('check-git');
    if (!gitCheck.installed) {
        log('⚠️ 警告：未检测到 Git，请先安装 Git', 'warning');
    } else {
        log(`✓ Git: ${gitCheck.version}`, 'success');
    }
    
    // 加载配置
    await loadConfig();
    
    // 监听更新事件
    setupUpdateListeners();
}

// 加载配置
async function loadConfig() {
    const config = await ipcRenderer.invoke('load-config') || {};
    state.repoPaths = config.repo_paths || [];
    state.platformConfig = config.platform_configs || {};
    state.syncConfig = config.sync_config || { sync_groups: {}, repo_to_group: {} };
    state.theme = config.theme || 'light';
    state.autoRefreshEnabled = config.autoRefreshEnabled !== undefined ? config.autoRefreshEnabled : true;
    state.autoRefreshInterval = config.autoRefreshInterval || 30000;
    if (state.repoPaths.length > 0) await refreshRepoList();
    applyTheme(state.theme);
}


// 保存配置
async function saveConfig() {
    const config = {
        repo_paths: state.repoPaths,
        platform_configs: Object.fromEntries(
            Object.entries(state.platformConfig).map(([k, v]) => [k, sanitizeConfig(v)])
        ),
        sync_config: state.syncConfig,
        theme: state.theme,
        autoRefreshEnabled: state.autoRefreshEnabled,
        autoRefreshInterval: state.autoRefreshInterval
    };
    await ipcRenderer.invoke('save-config', config);
}

function setupEventListeners() {
    const btn = elements.buttons;
    
    btn.addRepo?.addEventListener('click', addRepo);
    btn.refresh?.addEventListener('click', refreshRepoList);
    btn.platformConfig?.addEventListener('click', openPlatformConfig);
    btn.syncConfig?.addEventListener('click', openSyncConfig);
    btn.clone?.addEventListener('click', openCloneDialog);
    btn.batch?.addEventListener('click', openBatchDialog);
    btn.help?.addEventListener('click', showHelp);
    btn.update?.addEventListener('click', checkForUpdates);
    btn.clearUpdateCache?.addEventListener('click', clearUpdateCache);
    btn.theme?.addEventListener('click', toggleTheme);
    btn.commit?.addEventListener('click', quickCommit);
    btn.commitPush?.addEventListener('click', commitAndPush);
    btn.commitSync?.addEventListener('click', commitAndSync);
    btn.refreshChanges?.addEventListener('click', refreshChanges);
    btn.pull?.addEventListener('click', pullChanges);
    btn.push?.addEventListener('click', pushChanges);
    btn.stash?.addEventListener('click', stashChanges);
    btn.stashPop?.addEventListener('click', stashPop);
    btn.createBranch?.addEventListener('click', createBranch);
    btn.switchBranch?.addEventListener('click', switchBranch);
    btn.viewLog?.addEventListener('click', viewLog);
    btn.viewDiff?.addEventListener('click', viewDiff);
    btn.openFolder?.addEventListener('click', () => {
        if (checkRepoSelected()) openRepoFolder(state.currentRepo.path);
    });
    btn.clearLog?.addEventListener('click', () => {
        elements.logContainer && (elements.logContainer.innerHTML = '');
    });
    
    elements.searchInput?.addEventListener('input', filterRepos);
}

// 添加仓库（选择单个项目目录，路径存本地）
async function addRepo() {
    const folder = await ipcRenderer.invoke('select-folder');
    if (!folder) return;
    const gitPath = path.join(folder, '.git');
    const hasGit = fs.existsSync(gitPath);
    if (!hasGit) {
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

// 从列表移除仓库（仅移除记录，不删磁盘）
async function removeRepoFromList(repoPath, e) {
    if (e) e.stopPropagation();
    const confirmed = await showConfirmModal('确认移除', '从列表中移除此仓库？（不会删除电脑上的文件）');
    if (!confirmed) return;
    state.repoPaths = state.repoPaths.filter(p => p !== repoPath);
    if (state.currentRepo && state.currentRepo.path === repoPath) state.currentRepo = null;
    saveConfig();
    refreshRepoList();
    log('已从列表移除仓库', 'info');
}

// 刷新仓库列表
async function refreshRepoList(silent = false) {
    if (state.isRefreshing) return;
    
    if (!state.repoPaths || state.repoPaths.length === 0) {
        state.repos = [];
        renderRepoList();
        if (!silent) log('添加仓库后可在此查看', 'info');
        return;
    }
    
    state.isRefreshing = true;
    const previousCurrentRepoPath = state.currentRepo?.path;
    
    try {
        state.repos = await ipcRenderer.invoke('get-repos', state.repoPaths);
        
        if (previousCurrentRepoPath) {
            const currentRepo = state.repos.find(r => r.path === previousCurrentRepoPath);
            if (currentRepo) state.currentRepo = currentRepo;
        }
        
        renderRepoList();
        
        if (state.currentRepo) {
            try {
                const repoInfo = await ipcRenderer.invoke('get-repo-info', state.currentRepo.path);
                updateRepoStatus(state.currentRepo.path, repoInfo);
                updateRepoInfo(repoInfo);
            } catch (error) {
                // 静默处理
            }
        }
        
        if (!silent) log(`已加载 ${state.repos.length} 个仓库`, 'success');
    } catch (error) {
        if (!silent) log(`刷新失败: ${error.message}`, 'error');
    } finally {
        state.isRefreshing = false;
    }
}

// 启动自动刷新
function startAutoRefresh() {
    if (!state.autoRefreshEnabled) return;
    
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    
    autoRefreshTimer = setInterval(() => {
        if (!state.isRefreshing && state.repoPaths.length > 0) {
            refreshRepoList(true);
        }
    }, state.autoRefreshInterval);
    
    log(`自动刷新已启动（间隔 ${state.autoRefreshInterval / 1000} 秒）`, 'info');
}

// 停止自动刷新
function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
        log('自动刷新已停止', 'info');
    }
}

// 渲染仓库列表（性能优化：使用DocumentFragment）
function renderRepoList() {
    if (!elements.repoList) return;
    
    elements.repoList.innerHTML = '';
    
    if (state.repos.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = '暂无仓库<br><small>点击「添加仓库」加入项目</small>';
        elements.repoList.appendChild(emptyState);
        return;
    }
    
    const searchTerm = elements.searchInput ? elements.searchInput.value.toLowerCase() : '';
    const filteredRepos = state.repos.filter(repo => 
        repo.name.toLowerCase().includes(searchTerm)
    );
    
    // 使用DocumentFragment优化性能
    const fragment = document.createDocumentFragment();
    
    filteredRepos.forEach(repo => {
        const li = document.createElement('li');
        li.className = 'repo-item';
        if (state.currentRepo && state.currentRepo.path === repo.path) {
            li.classList.add('active');
        }
        
        const changes = repo.modified + repo.staged + repo.untracked;
        const hasChanges = changes > 0;
        const role = getRepoRole(repo.name);
        
        const branchText = repo.branch || '无分支';
        
        // 使用 DOM API 创建元素，避免 XSS
        const body = document.createElement('div');
        body.className = 'repo-item-body';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'repo-name';
        nameDiv.textContent = repo.name;
        body.appendChild(nameDiv);
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'repo-meta';
        
        const platformBadge = document.createElement('span');
        platformBadge.className = 'repo-badge badge-platform';
        platformBadge.textContent = repo.platform;
        metaDiv.appendChild(platformBadge);
        
        const branchSpan = document.createElement('span');
        branchSpan.className = 'repo-branch';
        branchSpan.textContent = branchText;
        metaDiv.appendChild(branchSpan);
        
        if (role) {
            const roleBadgeEl = document.createElement('span');
            roleBadgeEl.className = role === 'main' ? 'repo-badge badge-main' : 'repo-badge badge-sub';
            roleBadgeEl.textContent = role === 'main' ? '主' : '从';
            metaDiv.appendChild(roleBadgeEl);
        }
        
        if (hasChanges) {
            const changesBadgeEl = document.createElement('span');
            changesBadgeEl.className = 'repo-badge badge-changes';
            changesBadgeEl.textContent = changes;
            metaDiv.appendChild(changesBadgeEl);
        }
        
        body.appendChild(metaDiv);
        li.appendChild(body);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon repo-remove-btn';
        removeBtn.title = '从列表移除';
        removeBtn.textContent = '✕';
        li.appendChild(removeBtn);
        
        li.dataset.repoPath = repo.path;
        li.dataset.repoName = repo.name;
        
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!e.target.closest('.repo-remove-btn')) {
                selectRepo(repo);
            }
        });
        
        li.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!e.target.closest('.repo-remove-btn')) {
                openRepoFolder(repo.path);
            }
        });
        
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeRepoFromList(repo.path, e);
        });
        
        fragment.appendChild(li);
    });
    
    elements.repoList.appendChild(fragment);
}

let filterTimer = null;
function filterRepos() {
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(renderRepoList, 0);
}

// 更新仓库状态信息（辅助函数）
function updateRepoStatus(repoPath, repoInfo) {
    const updatedRepo = state.repos.find(r => r.path === repoPath);
    if (updatedRepo && repoInfo?.status) {
        Object.assign(updatedRepo, {
            modified: repoInfo.status.modified || 0,
            staged: repoInfo.status.staged || 0,
            untracked: repoInfo.status.untracked || 0
        });
        if (state.currentRepo?.path === repoPath) {
            state.currentRepo = updatedRepo;
            renderRepoList();
        }
    }
}

// 选择仓库
async function selectRepo(repo) {
    const latestRepo = state.repos.find(r => r.path === repo.path) || repo;
    state.currentRepo = latestRepo;
    renderRepoList();
    
    log(`已选择仓库: ${latestRepo.name}`, 'info');
    
    try {
        const repoInfo = await ipcRenderer.invoke('get-repo-info', latestRepo.path);
        updateRepoStatus(latestRepo.path, repoInfo);
        updateRepoInfo(repoInfo);
    } catch (error) {
        log(`获取仓库信息失败: ${error.message}`, 'error');
    }
}

// 更新仓库信息显示
function updateRepoInfo(repoInfo) {
    const platform = repoInfo.platform || '未知';
    const config = state.platformConfig[platform] || {};
    const role = getRepoRole(repoInfo.name);
    
    elements.repoInfo.name.textContent = repoInfo.name || '-';
    elements.repoInfo.platform.textContent = platform;
    elements.repoInfo.branch.textContent = repoInfo.branch || '-';
    elements.repoInfo.role.textContent = role === 'main' ? '主仓库' : role === 'subordinate' ? '从仓库' : '无';
    elements.repoInfo.remote.textContent = repoInfo.remoteUrl || '-';
    elements.repoInfo.auth.textContent = config.auth_type === 'ssh' ? 'SSH密钥' : config.auth_type === 'password' ? '账号密码/Token' : '-';
    
    if (repoInfo.status) renderChanges(repoInfo.status);
}

// 渲染文件变更列表
function renderChanges(status) {
    if (!elements.changesList) return;
    
    elements.changesList.innerHTML = '';
    
    if (!status || !status.files || status.files.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = '暂无变更';
        elements.changesList.appendChild(emptyState);
        return;
    }
    
    // 使用DocumentFragment优化性能
    const fragment = document.createDocumentFragment();
    
    status.files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'change-item';
        
        let icon = '📄';
        const statusType = file.index || file.working_dir || '';
        if (statusType === 'A' || statusType === '??') icon = '➕';
        else if (statusType === 'M' || statusType === ' M') icon = '✏️';
        else if (statusType === 'D' || statusType === ' D') icon = '🗑️';
        else if (statusType === 'R' || statusType === ' R') icon = '🔄';
        
        item.innerHTML = `
            <span class="change-icon">${icon}</span>
            <span class="change-path">${file.path}</span>
        `;
        fragment.appendChild(item);
    });
    
    elements.changesList.appendChild(fragment);
}

// 检查是否已选择仓库
function checkRepoSelected() {
    if (!state.currentRepo) {
        showMessage('请先选择一个仓库', 'warning');
        return false;
    }
    return true;
}

// 清理配置对象，确保可序列化
function sanitizeConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
    
    const cleaned = {};
    for (const key in config) {
        const value = config[key];
        if (value !== undefined && value !== null && 
            typeof value !== 'function' && typeof value !== 'symbol' &&
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

// 获取当前仓库的平台配置
function getCurrentRepoConfig() {
    if (!state.currentRepo) return {};
    const platform = state.currentRepo.platform || 'GitHub';
    const config = state.platformConfig[platform] || {};
    return sanitizeConfig(config);
}

// 获取仓库角色
function getRepoRole(repoName) {
    if (!state.syncConfig.repo_to_group?.[repoName]) return null;
    const group = state.syncConfig.sync_groups[state.syncConfig.repo_to_group[repoName]];
    if (!group) return null;
    if (group.main === repoName) return 'main';
    if (group.subordinates?.includes(repoName)) return 'subordinate';
    return null;
}

// 打开仓库文件夹
async function openRepoFolder(repoPath) {
    await ipcRenderer.invoke('open-folder', repoPath);
}

// 获取提交信息（统一处理）
async function getCommitMessage() {
    let message = elements.commitMessage.value.trim();
    if (!message || message.startsWith('Update:')) {
        const defaultValue = `Update: ${new Date().toLocaleString('zh-CN')}`;
        const input = await showInputModal('提交信息', '请输入提交信息:', defaultValue, '提交信息');
        if (!input) return null;
        message = input;
    }
    return message;
}

// 执行提交操作（统一处理）
async function executeCommit(repoPath, message, config) {
    if (config?.username && config?.email) {
        await ipcRenderer.invoke('git-set-user', repoPath, config.username, config.email);
    }
    
    const addResult = await ipcRenderer.invoke('git-add', repoPath);
    if (!addResult.success) {
        throw new Error(addResult.error);
    }
    
    const commitResult = await ipcRenderer.invoke('git-commit', repoPath, message);
    if (!commitResult.success) {
        throw new Error(commitResult.error);
    }
    
    return commitResult;
}

// 刷新当前仓库信息
async function refreshCurrentRepo() {
    await refreshRepoList();
    if (state.currentRepo) {
        const updatedRepo = state.repos.find(r => r.path === state.currentRepo.path);
        if (updatedRepo) {
            state.currentRepo = updatedRepo;
            renderRepoList();
            // 更新仓库详细信息
            try {
                const repoInfo = await ipcRenderer.invoke('get-repo-info', state.currentRepo.path);
                updateRepoStatus(state.currentRepo.path, repoInfo);
                updateRepoInfo(repoInfo);
            } catch (error) {
                // 静默处理
            }
        }
    }
}

// 快速提交
async function quickCommit() {
    if (!checkRepoSelected()) return;
    
    const message = await getCommitMessage();
    if (!message) return;
    
    log(`开始提交: ${message}`, 'info');
    
    try {
        const config = getCurrentRepoConfig();
        const commitResult = await executeCommit(state.currentRepo.path, message, config);
        
        log(`提交成功: ${commitResult.message}`, 'success');
        showMessage('提交成功！', 'success');
        
        setDefaultCommitMessage();
        await refreshCurrentRepo();
    } catch (error) {
        log(`提交失败: ${error.message}`, 'error');
        showMessage(`提交失败: ${error.message}`, 'error');
    }
}

// 提交并推送
async function commitAndPush() {
    if (!checkRepoSelected()) return;
    
    const message = await getCommitMessage();
    if (!message) return;
    
    log(`开始提交并推送: ${message}`, 'info');
    
    try {
        const config = getCurrentRepoConfig();
        
        // 提交
        const commitResult = await executeCommit(state.currentRepo.path, message, config);
        log(`提交成功: ${commitResult.message}`, 'success');
        
        // 推送
        log('开始推送到远程...', 'info');
        const pushResult = await ipcRenderer.invoke('git-push', state.currentRepo.path, 'origin', null, config);
        if (!pushResult.success) {
            throw new Error(pushResult.error);
        }
        
        log('推送成功！', 'success');
        showMessage('提交并推送成功！', 'success');
        
        setDefaultCommitMessage();
        await refreshCurrentRepo();
    } catch (error) {
        log(`操作失败: ${error.message}`, 'error');
        showMessage(`操作失败: ${error.message}`, 'error');
    }
}

// 拉取变更
async function pullChanges() {
    if (!checkRepoSelected()) return;
    
    log('开始拉取...', 'info');
    try {
        const config = getCurrentRepoConfig();
        const result = await ipcRenderer.invoke('git-pull', state.currentRepo.path, 'origin', null, config);
        if (result.success) {
            log('拉取成功', 'success');
            showMessage('拉取成功！', 'success');
            await refreshCurrentRepo();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        log(`拉取失败: ${error.message}`, 'error');
        showMessage(`拉取失败: ${error.message}`, 'error');
    }
}

// 推送变更
async function pushChanges() {
    if (!checkRepoSelected()) return;
    
    log('开始推送...', 'info');
    try {
        const config = getCurrentRepoConfig();
        const result = await ipcRenderer.invoke('git-push', state.currentRepo.path, 'origin', null, config);
        if (result.success) {
            log('推送成功', 'success');
            showMessage('推送成功！', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        log(`推送失败: ${error.message}`, 'error');
        showMessage(`推送失败: ${error.message}`, 'error');
    }
}

async function stashChanges() {
    if (!checkRepoSelected()) return;
    const msg = (await showInputModal('暂存变更', '暂存说明（可选）:', '', '可选：输入暂存说明')) || '';
    log('正在暂存变更...', 'info');
    try {
        const result = await ipcRenderer.invoke('git-stash', state.currentRepo.path, msg);
        if (result.success) {
            log('暂存成功', 'success');
            showMessage('暂存成功', 'success');
            await refreshCurrentRepo();
        } else throw new Error(result.error);
    } catch (error) {
        log(`暂存失败: ${error.message}`, 'error');
        showMessage(`暂存失败: ${error.message}`, 'error');
    }
}

async function stashPop() {
    if (!checkRepoSelected()) return;
    log('正在恢复暂存...', 'info');
    try {
        const result = await ipcRenderer.invoke('git-stash-pop', state.currentRepo.path);
        if (result.success) {
            log('恢复暂存成功', 'success');
            showMessage('恢复暂存成功', 'success');
            await refreshCurrentRepo();
        } else throw new Error(result.error);
    } catch (error) {
        log(`恢复暂存失败: ${error.message}`, 'error');
        showMessage(`恢复暂存失败: ${error.message}`, 'error');
    }
}

// 提交并同步
async function commitAndSync() {
    if (!checkRepoSelected()) return;
    
    const role = getRepoRole(state.currentRepo.name);
    if (role !== 'main') {
        await commitAndPush();
        return;
    }
    
    const subordinates = getSubordinates(state.currentRepo.name);
    if (subordinates.length === 0) {
        await commitAndPush();
        return;
    }
    
    const message = await getCommitMessage();
    if (!message) return;
    
    log(`开始同步推送: ${state.currentRepo.name} -> ${subordinates.join(', ')}`, 'info');
    
    try {
        const config = getCurrentRepoConfig();
        
        // 提交并推送主仓库
        await executeCommit(state.currentRepo.path, message, config);
        const pushResult = await ipcRenderer.invoke('git-push', state.currentRepo.path, 'origin', null, config);
        if (!pushResult.success) throw new Error(pushResult.error);
        
        log('主仓库推送成功，开始同步到从仓库...', 'success');
        
        // 同步到从仓库
        const syncResults = [];
        for (const subName of subordinates) {
            const subRepo = state.repos.find(r => r.name === subName);
            const subPath = subRepo ? subRepo.path : null;
            if (!subPath) {
                log(`从仓库 ${subName} 未在列表中，跳过`, 'warning');
                continue;
            }
            const subPlatform = subRepo ? subRepo.platform : 'GitHub';
            let subConfig = sanitizeConfig(state.platformConfig[subPlatform] || {});
            
            // 如果从仓库配置缺少用户信息，使用主仓库配置
            if ((!subConfig.username || !subConfig.email) && config.username && config.email) {
                subConfig = { ...subConfig, username: config.username, email: config.email };
            }
            
            const syncResult = await ipcRenderer.invoke('sync-repos', state.currentRepo.path, subPath, message, config, subConfig);
            if (!syncResult.success) {
                log(`同步到 ${subName} 失败: ${syncResult.error}`, 'error');
                syncResults.push({ name: subName, success: false, error: syncResult.error });
            } else {
                log(`同步到 ${subName} 成功`, 'success');
                syncResults.push({ name: subName, success: true });
            }
        }
        
        const successCount = syncResults.filter(r => r.success).length;
        const failCount = syncResults.length - successCount;
        
        if (failCount === 0) {
            log('同步完成！', 'success');
            showMessage(`同步推送完成！\n主仓库: ${state.currentRepo.name}\n从仓库: ${subordinates.join(', ')}`, 'success');
        } else {
            log(`同步完成，但有 ${failCount} 个失败`, 'warning');
            showMessage(`同步部分完成\n成功: ${successCount}, 失败: ${failCount}`, 'warning');
        }
        
        setDefaultCommitMessage();
        await refreshCurrentRepo();
    } catch (error) {
        log(`同步失败: ${error.message}`, 'error');
        showMessage(`同步失败: ${error.message}`, 'error');
    }
}

// 获取从仓库列表
function getSubordinates(mainRepoName) {
    const groupId = state.syncConfig.repo_to_group?.[mainRepoName];
    if (!groupId) return [];
    const group = state.syncConfig.sync_groups[groupId];
    if (!group || group.main !== mainRepoName) return [];
    return group.subordinates || [];
}

// 设置默认提交信息
function setDefaultCommitMessage() {
    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    elements.commitMessage.value = `Update: ${dateStr}`;
}

// 平台配置对话框
function openPlatformConfig() {
    showModal('平台配置', createPlatformConfigContent(), async () => {
        await saveConfig();
        showMessage('配置已保存', 'success');
    });
}

// 转义 HTML 属性值
function escapeAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// 创建平台配置内容
function createPlatformConfigContent() {
    const platforms = ['GitHub', 'Gitee', 'GitCode', 'GitLab', '其他'];
    let html = '<div class="platform-tabs">';
    
    platforms.forEach((platform, index) => {
        html += `<button class="tab-btn ${index === 0 ? 'active' : ''}" data-platform="${platform}">${platform}</button>`;
    });
    html += '</div>';
    
    platforms.forEach((platform, index) => {
        const config = state.platformConfig[platform] || {};
        const authType = config.auth_type || 'ssh';
        const isSSH = authType === 'ssh';
        const isPassword = authType === 'password';
        
        html += `
            <div class="platform-panel" data-platform="${platform}" style="display: ${index === 0 ? 'block' : 'none'}">
                <div class="form-group">
                    <label class="form-label">认证方式</label>
                    <select class="form-select" data-field="auth_type" data-platform="${platform}">
                        <option value="ssh" ${authType === 'ssh' ? 'selected' : ''}>SSH密钥</option>
                        <option value="password" ${authType === 'password' ? 'selected' : ''}>账号密码/Token</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">账户</label>
                    <input type="text" class="form-input" data-field="username" data-platform="${platform}" value="${config.username || ''}" placeholder="账户名">
                </div>
                <div class="form-group" data-password-only="${platform}" style="display: ${isPassword ? 'block' : 'none'}">
                    <label class="form-label">密码/Token</label>
                    <input type="password" class="form-input" data-field="password" data-platform="${platform}" value="${config.password || ''}" placeholder="Personal Access Token">
                </div>
                <div class="form-group">
                    <label class="form-label">邮箱</label>
                    <input type="text" class="form-input" data-field="email" data-platform="${platform}" value="${config.email || ''}" placeholder="your@email.com">
                </div>
                <div class="form-group" data-ssh-only="${platform}" style="display: ${isSSH ? 'block' : 'none'}">
                    <label class="form-label">SSH 私钥</label>
                    <div class="ssh-key-row">
                        <input type="text" class="form-input" data-field="ssh_key_path" data-platform="${platform}" value="${escapeAttr(config.ssh_key_path || '')}" placeholder="未填则自动识别 ~/.ssh 下的密钥" readonly>
                        <button class="btn btn-secondary" type="button" onclick="selectSSHKey('${platform}')">浏览</button>
                        <button class="btn btn-secondary" type="button" onclick="clearSSHKey('${platform}')">清除</button>
                    </div>
                    <small class="form-hint">点击「浏览」会直接打开 .ssh 目录</small>
                </div>
                ${platform === 'GitHub' ? `
                <div class="form-group" data-password-only="${platform}" style="display: ${isPassword ? 'block' : 'none'}">
                    <label style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" class="form-checkbox" data-field="use_proxy" data-platform="${platform}" ${config.use_proxy ? 'checked' : ''}>
                        <span>使用代理（HTTPS 拉取/推送更顺畅）</span>
                    </label>
                </div>
                <div class="form-group" data-proxy-only="${platform}" style="display: ${config.use_proxy && isPassword ? 'block' : 'none'}">
                    <label class="form-label">代理地址</label>
                    <select class="form-select" data-field="proxy_preset" data-platform="${platform}" style="margin-bottom:8px;">
                        <option value="">自定义（下方填写）</option>
                        <option value="https://ghproxy.net/" ${(config.proxy_url || '').includes('ghproxy.net') ? 'selected' : ''}>ghproxy.net</option>
                        <option value="https://gh-proxy.com/" ${(config.proxy_url || '').includes('gh-proxy.com') ? 'selected' : ''}>gh-proxy.com</option>
                        <option value="https://mirror.ghproxy.com/" ${(config.proxy_url || '').includes('mirror.ghproxy') ? 'selected' : ''}>mirror.ghproxy.com</option>
                    </select>
                    <input type="text" class="form-input" data-field="proxy_url" data-platform="${platform}" value="${escapeAttr(config.proxy_url || 'https://ghproxy.net/')}" placeholder="如 https://ghproxy.net/">
                </div>
                ` : ''}
            </div>
        `;
    });
    
    return html;
}

// 选择 SSH 密钥：对话框直接打开 ~/.ssh，选后写入 state 并更新UI
window.selectSSHKey = async function(platform) {
    const sshDir = await ipcRenderer.invoke('get-ssh-dir');
    const filePath = await ipcRenderer.invoke('select-file', sshDir);
    if (!filePath) return;
    
    if (!state.platformConfig[platform]) state.platformConfig[platform] = {};
    state.platformConfig[platform].ssh_key_path = filePath;
    
    const input = document.querySelector(`input[data-field="ssh_key_path"][data-platform="${platform}"]`);
    if (input) input.value = filePath;
};

// 清除 SSH 密钥路径
window.clearSSHKey = function(platform) {
    if (!state.platformConfig[platform]) state.platformConfig[platform] = {};
    delete state.platformConfig[platform].ssh_key_path;
    
    const input = document.querySelector(`input[data-field="ssh_key_path"][data-platform="${platform}"]`);
    if (input) input.value = '';
};

// 同步配置对话框
function openSyncConfig() {
    showModal('同步配置', createSyncConfigContent(), async () => {
        await saveConfig();
        showMessage('同步配置已保存', 'success');
        if (state.currentRepo) {
            await selectRepo(state.currentRepo);
        }
    });
    
    // 设置主仓库选择变化时，自动从从仓库列表中移除主仓库
    setTimeout(() => {
        const mainRepoSelect = document.getElementById('sync-main-repo');
        if (mainRepoSelect) {
            mainRepoSelect.addEventListener('change', updateSubordinateReposList);
            updateSubordinateReposList(); // 初始化
        }
    }, 100);
}

// 更新从仓库列表：移除主仓库选项
function updateSubordinateReposList() {
    const mainRepo = document.getElementById('sync-main-repo')?.value;
    const container = document.getElementById('sync-subordinate-repos');
    if (!container) return;
    
    container.innerHTML = state.repos
        .filter(r => !mainRepo || r.name !== mainRepo)
        .map(r => `
            <label style="display: block; margin-bottom: 8px;">
                <input type="checkbox" value="${r.name}" class="form-checkbox">
                <span>${r.name}</span>
            </label>
        `).join('');
}

// 创建同步配置内容
function createSyncConfigContent() {
    let html = `
        <div class="form-group">
            <label class="form-label">主仓库</label>
            <select class="form-select" id="sync-main-repo">
                <option value="">选择主仓库</option>
                ${state.repos.map(r => `<option value="${r.name}">${r.name}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">从仓库（可多选）</label>
            <div id="sync-subordinate-repos" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px;">
                ${state.repos.map(r => `
                    <label style="display: block; margin-bottom: 8px;">
                        <input type="checkbox" value="${r.name}" class="form-checkbox">
                        <span>${r.name}</span>
                    </label>
                `).join('')}
            </div>
        </div>
        <div class="form-group">
            <button class="btn btn-primary" onclick="saveSyncGroup()">保存同步组</button>
            <button class="btn btn-secondary" onclick="clearSyncGroups()" style="margin-left: 10px;">清空所有同步组</button>
        </div>
        <div class="form-group">
            <label class="form-label">当前同步组</label>
            <div id="sync-groups-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px;">
                ${renderSyncGroups()}
            </div>
        </div>
    `;
    return html;
}

// 渲染同步组列表
function renderSyncGroups() {
    const groups = state.syncConfig.sync_groups;
    if (!groups || Object.keys(groups).length === 0) {
        return '<div class="empty-state">暂无同步组</div>';
    }
    
    return Object.entries(groups).map(([groupId, group]) => `
        <div style="padding: 10px; margin-bottom: 10px; background: var(--bg-tertiary); border-radius: 6px;">
            <div><strong>主仓库:</strong> ${group.main}</div>
            <div><strong>从仓库:</strong> ${group.subordinates?.join(', ') || '无'}</div>
            <button class="btn btn-danger" style="margin-top: 8px; padding: 5px 10px; font-size: 12px;" onclick="removeSyncGroup('${groupId}')">删除</button>
        </div>
    `).join('');
}

// 保存同步组
window.saveSyncGroup = function() {
    const mainRepo = document.getElementById('sync-main-repo').value;
    if (!mainRepo) {
        showMessage('请选择主仓库', 'warning');
        return;
    }
    
    const checkboxes = document.querySelectorAll('#sync-subordinate-repos input[type="checkbox"]:checked');
    const subordinates = Array.from(checkboxes).map(cb => cb.value);
    
    if (subordinates.length === 0) {
        showMessage('请至少选择一个从仓库', 'warning');
        return;
    }
    
    const groupId = `group_${Date.now()}`;
    
    if (state.syncConfig.repo_to_group?.[mainRepo]) {
        delete state.syncConfig.sync_groups[state.syncConfig.repo_to_group[mainRepo]];
    }
    
    subordinates.forEach(sub => {
        const oldGroupId = state.syncConfig.repo_to_group?.[sub];
        if (oldGroupId) {
            const oldGroup = state.syncConfig.sync_groups[oldGroupId];
            if (oldGroup?.subordinates) {
                oldGroup.subordinates = oldGroup.subordinates.filter(s => s !== sub);
                if (oldGroup.subordinates.length === 0) {
                    delete state.syncConfig.sync_groups[oldGroupId];
                }
            }
        }
    });
    
    if (!state.syncConfig.sync_groups) state.syncConfig.sync_groups = {};
    if (!state.syncConfig.repo_to_group) state.syncConfig.repo_to_group = {};
    
    state.syncConfig.sync_groups[groupId] = { main: mainRepo, subordinates };
    state.syncConfig.repo_to_group[mainRepo] = groupId;
    subordinates.forEach(sub => { state.syncConfig.repo_to_group[sub] = groupId; });
    
    document.getElementById('sync-groups-list').innerHTML = renderSyncGroups();
    showMessage('同步组已保存', 'success');
};

// 删除同步组
window.removeSyncGroup = async function(groupId) {
    const confirmed = await showConfirmModal('确认删除', '确定要删除这个同步组吗？');
    if (!confirmed) return;
    
    const group = state.syncConfig.sync_groups[groupId];
    if (group) {
        delete state.syncConfig.repo_to_group[group.main];
        group.subordinates?.forEach(sub => {
            delete state.syncConfig.repo_to_group[sub];
        });
    }
    
    delete state.syncConfig.sync_groups[groupId];
    document.getElementById('sync-groups-list').innerHTML = renderSyncGroups();
    showMessage('同步组已删除', 'success');
};

// 清空所有同步组
window.clearSyncGroups = async function() {
    const confirmed = await showConfirmModal('确认清空', '确定要清空所有同步组吗？');
    if (!confirmed) return;
    
    state.syncConfig.sync_groups = {};
    state.syncConfig.repo_to_group = {};
    document.getElementById('sync-groups-list').innerHTML = renderSyncGroups();
    showMessage('所有同步组已清空', 'success');
};

// 克隆仓库对话框（选择克隆目标目录，克隆后自动加入列表）
async function openCloneDialog() {
    showModal('克隆仓库', createCloneDialogContent(), async () => {
        const url = document.getElementById('clone-url').value.trim();
        const platform = document.getElementById('clone-platform').value;
        const localName = document.getElementById('clone-name').value.trim();
        const targetDir = document.getElementById('clone-target-dir').value.trim();
        
        if (!url) {
            showMessage('请输入仓库URL', 'warning');
            return false; // 验证失败，不关闭窗口
        }
        if (!targetDir) {
            showMessage('请选择克隆目标目录', 'warning');
            return false; // 验证失败，不关闭窗口
        }
        
        const config = sanitizeConfig(state.platformConfig[platform] || {});
        const repoName = localName || url.split('/').pop().replace(/\.git$/, '');
        const targetPath = path.join(targetDir, repoName);
        
        log(`开始克隆仓库: ${url} -> ${targetPath}`, 'info');
        
        try {
            const result = await ipcRenderer.invoke('git-clone', url, targetPath, {}, config);
            if (!result.success) throw new Error(result.error);
            
            if (!state.repoPaths.includes(targetPath)) {
                state.repoPaths.push(targetPath);
                await saveConfig();
            }
            log('克隆成功，已加入仓库列表', 'success');
            showMessage('克隆成功！', 'success');
            await refreshRepoList();
        } catch (error) {
            log(`克隆失败: ${error.message}`, 'error');
            showMessage(`克隆失败: ${error.message}`, 'error');
        }
    });
}

// 创建克隆对话框内容
function createCloneDialogContent() {
    const platforms = ['GitHub', 'Gitee', 'GitCode', 'GitLab', '其他'];
    
    return `
        <div class="form-group">
            <label class="form-label">选择平台</label>
            <select class="form-select" id="clone-platform">
                ${platforms.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">仓库URL</label>
            <input type="text" class="form-input" id="clone-url" placeholder="https://github.com/user/repo.git 或 git@github.com:user/repo.git">
            <small style="color: var(--text-secondary); font-size: 12px; margin-top: 5px; display: block;">
                支持 HTTPS、SSH 及 gh-proxy.com 等代理
            </small>
        </div>
        <div class="form-group">
            <label class="form-label">克隆到目录</label>
            <div style="display: flex; gap: 8px;">
                <input type="text" class="form-input" id="clone-target-dir" placeholder="选择目标文件夹" readonly>
                <button class="btn btn-secondary" onclick="pickCloneTargetDir()">选择</button>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">本地文件夹名（可选）</label>
            <input type="text" class="form-input" id="clone-name" placeholder="留空则使用仓库名">
        </div>
    `;
}

window.pickCloneTargetDir = async function() {
    const folder = await ipcRenderer.invoke('select-folder');
    if (folder) document.getElementById('clone-target-dir').value = folder;
};

// 批量操作对话框
function openBatchDialog() {
    if (state.repos.length === 0) {
        showMessage('没有可操作的仓库', 'warning');
        return;
    }
    
    showModal('批量操作', createBatchDialogContent(), async () => {
        const selectedRepos = Array.from(document.querySelectorAll('#batch-repos input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        
        if (selectedRepos.length === 0) {
            showMessage('请至少选择一个仓库', 'warning');
            return false; // 验证失败，不关闭窗口
        }
        
        const operation = document.getElementById('batch-operation').value;
        
        log(`开始批量${getOperationName(operation)}: ${selectedRepos.length} 个仓库`, 'info');
        
        let successCount = 0;
        let failCount = 0;
        
        for (const repoName of selectedRepos) {
            const repo = state.repos.find(r => r.name === repoName);
            if (!repo) continue;
            
            try {
                let result;
                switch (operation) {
                    case 'commit':
                        const batchPlatform = repo.platform || 'GitHub';
                        const batchConfig = state.platformConfig[batchPlatform] || {};
                        if (batchConfig.username && batchConfig.email) {
                            await ipcRenderer.invoke('git-set-user', repo.path, batchConfig.username, batchConfig.email);
                        }
                        result = await ipcRenderer.invoke('git-add', repo.path);
                        if (result.success) {
                            result = await ipcRenderer.invoke('git-commit', repo.path, `Batch update: ${new Date().toLocaleString('zh-CN')}`);
                        }
                        break;
                    case 'push':
                        const pushPlatform = repo.platform || 'GitHub';
                        const pushConfig = sanitizeConfig(state.platformConfig[pushPlatform] || {});
                        result = await ipcRenderer.invoke('git-push', repo.path, 'origin', null, pushConfig);
                        break;
                    case 'pull':
                        const pullPlatform = repo.platform || 'GitHub';
                        const pullConfig = sanitizeConfig(state.platformConfig[pullPlatform] || {});
                        result = await ipcRenderer.invoke('git-pull', repo.path, 'origin', null, pullConfig);
                        break;
                    default:
                        continue;
                }
                
                if (result.success) {
                    successCount++;
                    log(`${repoName}: ${getOperationName(operation)}成功`, 'success');
                } else {
                    failCount++;
                    log(`${repoName}: ${getOperationName(operation)}失败 - ${result.error}`, 'error');
                }
            } catch (error) {
                failCount++;
                log(`${repoName}: ${getOperationName(operation)}失败 - ${error.message}`, 'error');
            }
        }
        
        showMessage(`批量操作完成！成功: ${successCount}, 失败: ${failCount}`, successCount > 0 ? 'success' : 'error');
        await refreshRepoList();
    });
}

// 获取操作名称
function getOperationName(operation) {
    const names = {
        'commit': '提交',
        'push': '推送',
        'pull': '拉取'
    };
    return names[operation] || operation;
}

// 创建批量操作对话框内容
function createBatchDialogContent() {
    return `
        <div class="form-group">
            <label class="form-label">选择操作</label>
            <select class="form-select" id="batch-operation">
                <option value="commit">批量提交</option>
                <option value="push">批量推送</option>
                <option value="pull">批量拉取</option>
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">选择仓库（可多选）</label>
            <div id="batch-repos" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px;">
                ${state.repos.map(r => `
                    <label style="display: block; margin-bottom: 8px;">
                        <input type="checkbox" value="${r.name}" class="form-checkbox" checked>
                        <span>${r.name} (${r.platform})</span>
                    </label>
                `).join('')}
            </div>
            <div style="margin-top: 10px;">
                <button class="btn btn-secondary" onclick="selectAllBatchRepos()" style="padding: 5px 10px; font-size: 12px;">全选</button>
                <button class="btn btn-secondary" onclick="deselectAllBatchRepos()" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;">全不选</button>
            </div>
        </div>
    `;
}

// 全选批量操作仓库
window.selectAllBatchRepos = function() {
    document.querySelectorAll('#batch-repos input[type="checkbox"]').forEach(cb => cb.checked = true);
};

// 全不选批量操作仓库
window.deselectAllBatchRepos = function() {
    document.querySelectorAll('#batch-repos input[type="checkbox"]').forEach(cb => cb.checked = false);
};

// 显示帮助
function showHelp() {
    const helpContent = `
        <div style="max-height: 500px; overflow-y: auto; font-size: 13px; line-height: 1.6;">
            <h3 style="color: var(--primary); margin-bottom: 12px; font-size: 16px;">🌻 向日葵Git仓库管理</h3>
            <h4 style="margin-top: 15px; margin-bottom: 8px; font-size: 14px;">快速开始</h4>
            <ol style="padding-left: 20px;">
                <li>点击「添加仓库」选择任意位置的 Git 项目目录（路径会保存到本地）</li>
                <li>配置平台认证信息（SSH 密钥或 Token，GitHub 可配代理）</li>
                <li>在列表中选择仓库进行操作</li>
            </ol>
            <h4 style="margin-top: 15px; margin-bottom: 8px; font-size: 14px;">核心功能</h4>
            <ul style="padding-left: 20px;">
                <li>一键提交（自动添加变更摘要）</li>
                <li>提交并推送/同步</li>
                <li>批量操作（提交、推送、拉取）</li>
                <li>分支操作（创建、切换、合并）</li>
                <li>主从仓库同步</li>
            </ul>
            <h4 style="margin-top: 15px; margin-bottom: 8px; font-size: 14px;">注意事项</h4>
            <ul style="padding-left: 20px; color: var(--warning);">
                <li>SSH 密钥须选择私钥文件（不带 .pub）</li>
                <li>确保 Git 已正确安装</li>
                <li>同步：同远程则直接 pull，否则忽略 .git/依赖目录后复制并推送</li>
            </ul>
        </div>
    `;
    showModal('使用帮助', helpContent, null, false);
}

// 显示模态框
// options: { primaryLabel?, cancelLabel? } 用于自定义主按钮/取消按钮文案
function showModal(title, content, onConfirm, showCancel = true, options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('modal-content');
    const primaryLabel = options.primaryLabel ?? (onConfirm ? '确定' : '关闭');
    const cancelLabel = options.cancelLabel ?? '取消';

    let html = `<div class="modal-header">${title}</div><div class="modal-body">${content}</div><div class="modal-footer">`;

    if (showCancel && onConfirm) {
        html += `<button class="btn btn-secondary" onclick="closeModal()">${cancelLabel}</button>`;
    }

    if (onConfirm) {
        html += `<button class="btn btn-primary" onclick="confirmModal()">${primaryLabel}</button>`;
    } else {
        html += `<button class="btn btn-primary" onclick="closeModal()">${primaryLabel}</button>`;
    }

    html += `</div>`;
    modalContent.innerHTML = html;
    
    if (onConfirm) {
        window.confirmModal = async () => {
            try {
                const result = await onConfirm();
                // 如果 onConfirm 返回 false，则不关闭窗口（用于验证失败等情况）
                if (result !== false) {
                    closeModal();
                }
            } catch (error) {
                log(`Modal confirm error: ${error.message}`, 'error');
                closeModal();
            }
        };
    }
    
    if (content.includes('platform-tabs')) {
        setTimeout(() => {
            setupPlatformTabs();
            setupPlatformFormHandlers();
            setupPlatformAutoSshKey();
        }, 100);
    }
    
    overlay.style.display = 'flex';
    
    // 点击遮罩层关闭（只保留一个事件监听器）
    const closeOnOverlay = (e) => {
        if (e.target === overlay) {
            closeModal();
            overlay.removeEventListener('click', closeOnOverlay);
        }
    };
    overlay.addEventListener('click', closeOnOverlay);
}

// 关闭模态框
window.closeModal = function() {
    document.getElementById('modal-overlay').style.display = 'none';
    window.confirmModal = null;
};

// 显示输入模态框（替代 prompt）
function showInputModal(title, message, defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
        const content = `
            <div class="form-group">
                <label class="form-label">${message}</label>
                <input type="text" class="form-input" id="input-modal-value" value="${escapeAttr(defaultValue)}" placeholder="${escapeAttr(placeholder)}" style="width: 100%; margin-top: 8px;">
            </div>
        `;
        
        let resolved = false;
        showModal(title, content, async () => {
            const input = document.getElementById('input-modal-value');
            const value = input ? input.value.trim() : '';
            if (!resolved) {
                resolved = true;
                resolve(value || null);
            }
        }, true);
        
        // 自动聚焦输入框
        setTimeout(() => {
            const input = document.getElementById('input-modal-value');
            if (input) {
                input.focus();
                input.select();
                // 支持回车确认
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (window.confirmModal) {
                            window.confirmModal();
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        if (!resolved) {
                            resolved = true;
                            closeModal();
                            resolve(null);
                        }
                    }
                });
            }
        }, 100);
    });
}

// 显示确认模态框（替代 confirm）
function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        const content = `<div class="form-group"><p style="margin: 0; color: var(--text-primary);">${message}</p></div>`;
        
        let resolved = false;
        const handleConfirm = async () => {
            if (!resolved) {
                resolved = true;
                closeModal();
                resolve(true);
            }
        };
        
        showModal(title, content, handleConfirm, true);
        
        // 支持 ESC 取消
        const handleEscape = (e) => {
            if (e.key === 'Escape' && !resolved) {
                e.preventDefault();
                resolved = true;
                closeModal();
                document.removeEventListener('keydown', handleEscape);
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // 清理：当模态框关闭时移除事件监听器
        const overlay = document.getElementById('modal-overlay');
        const observer = new MutationObserver(() => {
            if (overlay.style.display === 'none') {
                document.removeEventListener('keydown', handleEscape);
                observer.disconnect();
            }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
    });
}

// 设置平台标签页
function setupPlatformTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.platform-panel');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.dataset.platform;
            
            // 切换标签
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 切换面板
            panels.forEach(p => {
                p.style.display = p.dataset.platform === platform ? 'block' : 'none';
            });
        });
    });
    
    // 设置认证方式切换显示/隐藏相关字段
    document.querySelectorAll('select[data-field="auth_type"]').forEach(select => {
        const updateAuthFields = () => {
            const platform = select.dataset.platform;
            const isSSH = select.value === 'ssh';
            const isPassword = select.value === 'password';
            
            // SSH相关字段
            const sshGroup = document.querySelector(`div[data-ssh-only="${platform}"]`);
            if (sshGroup) sshGroup.style.display = isSSH ? 'block' : 'none';
            
            // 密码/Token字段
            const passwordGroup = document.querySelector(`div[data-password-only="${platform}"]`);
            if (passwordGroup) passwordGroup.style.display = isPassword ? 'block' : 'none';
            
            // GitHub代理字段（仅在密码模式下显示）
            if (platform === 'GitHub') {
                const proxyGroup = document.querySelector(`div[data-proxy-only="${platform}"]`);
                if (proxyGroup) {
                    const useProxy = document.querySelector(`input[data-field="use_proxy"][data-platform="${platform}"]`);
                    proxyGroup.style.display = (isPassword && useProxy?.checked) ? 'block' : 'none';
                }
            }
        };
        
        select.addEventListener('change', updateAuthFields);
        // 初始化时也执行一次
        updateAuthFields();
    });
    
    // 设置代理显示
    document.querySelectorAll('input[data-field="use_proxy"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const platform = checkbox.dataset.platform;
            const authSelect = document.querySelector(`select[data-field="auth_type"][data-platform="${platform}"]`);
            const isPassword = authSelect?.value === 'password';
            const proxyGroup = document.querySelector(`div[data-proxy-only="${platform}"]`);
            if (proxyGroup) {
                proxyGroup.style.display = (isPassword && checkbox.checked) ? 'block' : 'none';
            }
        });
    });
}

// 打开平台配置时：若某平台未填密钥路径，自动检测 ~/.ssh 下的 id_ed25519 / id_rsa 并填入
async function setupPlatformAutoSshKey() {
    const defaultPath = await ipcRenderer.invoke('detect-default-ssh-key');
    if (!defaultPath) return;
    
    document.querySelectorAll('input[data-field="ssh_key_path"]').forEach(input => {
        if (!input.value && input.dataset.platform) {
            const platform = input.dataset.platform;
            if (!state.platformConfig[platform]) state.platformConfig[platform] = {};
            state.platformConfig[platform].ssh_key_path = defaultPath;
            input.value = defaultPath;
        }
    });
}

// 设置平台表单处理器
function setupPlatformFormHandlers() {
    document.querySelectorAll('.form-input, .form-select, .form-checkbox').forEach(input => {
        input.addEventListener('change', () => {
            const platform = input.dataset.platform;
            const field = input.dataset.field;
            if (!platform || !field) return;
            
            if (!state.platformConfig[platform]) state.platformConfig[platform] = {};
            
            if (input.type === 'checkbox') {
                state.platformConfig[platform][field] = input.checked;
            } else {
                state.platformConfig[platform][field] = input.value;
                // 代理预设选择时自动填充代理URL
                if (field === 'proxy_preset' && input.value) {
                    state.platformConfig[platform].proxy_url = input.value;
                    const urlInput = document.querySelector(`input[data-field="proxy_url"][data-platform="${platform}"]`);
                    if (urlInput) urlInput.value = input.value;
                }
            }
        });
    });
}

// 显示消息（改进为更好的通知系统）
let notificationQueue = [];
let notificationContainer = null;

function initNotificationSystem() {
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.className = 'notification-container';
        document.body.appendChild(notificationContainer);
    }
}

function showMessage(message, type = 'info') {
    initNotificationSystem();
    
    const icons = {
        error: '❌',
        success: '✓',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.textContent = icons[type] || icons.info;
    notification.appendChild(icon);
    
    const messageEl = document.createElement('span');
    messageEl.className = 'notification-message';
    messageEl.textContent = message;
    notification.appendChild(messageEl);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.textContent = '✕';
    notification.appendChild(closeBtn);
    
    notificationContainer.appendChild(notification);
    
    // 触发动画
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });
    
    // 自动关闭
    const autoClose = setTimeout(() => {
        removeNotification(notification);
    }, type === 'error' ? 5000 : type === 'success' ? 3000 : 4000);
    
    // 手动关闭
    closeBtn.addEventListener('click', () => {
        clearTimeout(autoClose);
        removeNotification(notification);
    });
    
    notificationQueue.push(notification);
}

function removeNotification(notification) {
    notification.classList.remove('show');
    notification.classList.add('hide');
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
        notificationQueue = notificationQueue.filter(n => n !== notification);
    }, 300);
}

let logBuffer = [];
let logTimer = null;

function log(message, level = 'info') {
    if (!elements.logContainer) return;
    const time = new Date().toLocaleTimeString('zh-CN');
    logBuffer.push({ message, level, time });
    if (logTimer) clearTimeout(logTimer);
    logTimer = setTimeout(flushLogs, 0);
}

function flushLogs() {
    if (!elements.logContainer || logBuffer.length === 0) return;
    
    const fragment = document.createDocumentFragment();
    
    logBuffer.forEach(({ message, level, time }) => {
        const entry = document.createElement('div');
        entry.className = `log-entry ${level}`;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${time}]`;
        entry.appendChild(timeSpan);
        entry.appendChild(document.createTextNode(message));
        fragment.appendChild(entry);
    });
    
    elements.logContainer.appendChild(fragment);
    
    // 限制日志条数（性能优化：只检查一次）
    const entries = elements.logContainer.querySelectorAll('.log-entry');
    if (entries.length > 500) {
        const toRemove = entries.length - 500;
        for (let i = 0; i < toRemove; i++) {
            entries[i].remove();
        }
    }
    
    // 滚动到底部（使用requestAnimationFrame优化）
    requestAnimationFrame(() => {
        elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    });
    
    logBuffer = [];
    logTimer = null;
}

// 应用主题（热加载，立即生效）
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (elements.themeIcon) {
        elements.themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
    }
}

// 主题切换
function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    saveConfig();
    log(`已切换到${state.theme === 'light' ? '白天' : '夜晚'}模式`, 'success');
    showMessage(`已切换到${state.theme === 'light' ? '白天' : '夜晚'}模式`, 'success');
}

// 刷新文件变更
async function refreshChanges() {
    if (!checkRepoSelected()) return;
    
    try {
        const repoInfo = await ipcRenderer.invoke('get-repo-info', state.currentRepo.path);
        if (repoInfo.status) {
            renderChanges(repoInfo.status);
            log('文件变更已刷新', 'success');
        }
    } catch (error) {
        log(`刷新失败: ${error.message}`, 'error');
    }
}


// 创建分支
async function createBranch() {
    if (!checkRepoSelected()) return;
    
    const branchName = await showInputModal('创建分支', '请输入新分支名称:', '', '分支名称');
    if (!branchName || !branchName.trim()) return;
    
    log(`创建分支: ${branchName}`, 'info');
    try {
        const result = await ipcRenderer.invoke('exec-git', state.currentRepo.path, 'checkout', ['-b', branchName.trim()]);
        if (result.success) {
            log(`分支 ${branchName} 创建成功`, 'success');
            showMessage('分支创建成功！', 'success');
            await refreshCurrentRepo();
        } else {
            throw new Error(result.stderr || result.error || '创建分支失败');
        }
    } catch (error) {
        log(`创建分支失败: ${error.message}`, 'error');
        showMessage(`创建分支失败: ${error.message}`, 'error');
    }
}

// 切换分支
async function switchBranch() {
    if (!checkRepoSelected()) return;
    
    try {
        // 获取当前分支和所有分支
        const branchResult = await ipcRenderer.invoke('exec-git', state.currentRepo.path, 'branch', []);
        if (!branchResult.success) {
            throw new Error(branchResult.stderr || branchResult.error || '获取分支列表失败');
        }
        
        const branches = branchResult.stdout.split('\n').map(b => b.trim()).filter(b => b);
        const currentBranch = branches.find(b => b.startsWith('*'))?.replace('*', '').trim() || '未知';
        const branchList = branches.map(b => b.replace('*', '').trim()).join('\n');
        
        const message = `当前分支: ${currentBranch}\n\n所有分支:\n${branchList}\n\n请输入要切换的分支名称:`;
        const branchName = await showInputModal('切换分支', message, currentBranch, '分支名称');
        if (!branchName || branchName.trim() === currentBranch) return;
        
        log(`切换分支: ${branchName}`, 'info');
        const result = await ipcRenderer.invoke('exec-git', state.currentRepo.path, 'checkout', [branchName.trim()]);
        if (result.success) {
            log(`已切换到分支 ${branchName}`, 'success');
            showMessage('切换分支成功！', 'success');
            await refreshCurrentRepo();
        } else {
            throw new Error(result.stderr || result.error || '切换分支失败');
        }
    } catch (error) {
        log(`切换分支失败: ${error.message}`, 'error');
        showMessage(`切换分支失败: ${error.message}`, 'error');
    }
}

// 查看日志
async function viewLog() {
    if (!checkRepoSelected()) return;
    
    log('获取提交日志...', 'info');
    try {
        const result = await ipcRenderer.invoke('exec-git', state.currentRepo.path, 'log', ['--oneline', '--graph', '--decorate', '-20']);
        if (result.success) {
            const logContent = result.stdout || '暂无提交记录';
            showModal('提交日志', `<pre style="font-family: Consolas, monospace; font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">${logContent}</pre>`, null, false);
        } else {
            throw new Error(result.stderr || result.error || '获取日志失败');
        }
    } catch (error) {
        log(`查看日志失败: ${error.message}`, 'error');
        showMessage(`查看日志失败: ${error.message}`, 'error');
    }
}

// 查看差异
async function viewDiff() {
    if (!checkRepoSelected()) return;
    
    log('获取文件差异...', 'info');
    try {
        const result = await ipcRenderer.invoke('exec-git', state.currentRepo.path, 'diff', []);
        if (result.success) {
            const diffContent = result.stdout || '暂无差异';
            showModal('文件差异', `<pre style="font-family: Consolas, monospace; font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">${diffContent}</pre>`, null, false);
        } else {
            throw new Error(result.stderr || result.error || '获取差异失败');
        }
    } catch (error) {
        log(`查看差异失败: ${error.message}`, 'error');
        showMessage(`查看差异失败: ${error.message}`, 'error');
    }
}

// ========== 自动更新 ==========

let updateDownloading = false;
let updateListenersSetup = false;
const CHECK_WATCHDOG_MS = 15000;
let updateCheckWatchdogTimer = null;

function clearUpdateCheckWatchdog() {
    if (updateCheckWatchdogTimer) {
        clearTimeout(updateCheckWatchdogTimer);
        updateCheckWatchdogTimer = null;
    }
}

function setupUpdateListeners() {
    if (updateListenersSetup) return;
    updateListenersSetup = true;
    ipcRenderer.on('update-status', (e, status, payload) => {
        const data = { status, ...(payload || {}) };
        handleUpdateStatus(data);
    });
    ipcRenderer.on('update-progress', handleUpdateProgress);
    ipcRenderer.on('update-log', (e, { message, level }) => {
        if (message) log(message, level || 'info');
    });
}

function handleUpdateStatus(data) {
    if (!data || typeof data !== 'object') return;
    const status = data.status;
    const { message, version, releaseNotes } = data;
    clearUpdateCheckWatchdog();
    log(`更新: 收到状态 ${String(status ?? '(未知)')}`, 'info');
    if (status === undefined || status === null) {
        log(`更新: 调试 data.keys=${Object.keys(data).join(',')}`, 'info');
    }
    switch (status) {
        case 'available':
            log(`检查完成：发现新版本 v${version}`, 'info');
            showUpdateAvailableDialog(version, releaseNotes);
            break;
        case 'not-available':
            log('检查完成：已是最新版本', 'info');
            showMessage('已是最新版本', 'success');
            break;
        case 'error':
            log(message || '检查更新失败', 'error');
            showMessage(message || '检查更新失败', 'error');
            break;
        case 'downloaded':
            log(`更新: 已下载 v${version}，弹窗选择重启`, 'info');
            showUpdateDownloadedDialog(version);
            break;
    }
}

let _lastLoggedProgressPct = -1;
function handleUpdateProgress(progress) {
    const bar = document.getElementById('update-progress-bar');
    const text = document.getElementById('update-progress-text');
    if (!bar || !text) return;
    const pct = progress.percent || 0;
    bar.style.width = `${pct}%`;
    text.textContent = `${pct}% (${formatBytes(progress.transferred || 0)}/${formatBytes(progress.total || 0)})`;
    if (pct >= 100 && _lastLoggedProgressPct < 100) {
        _lastLoggedProgressPct = 100;
        log('更新: 下载进度 100%', 'info');
    }
}

// 格式化字节数
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 渲染 Markdown 为 HTML
function renderMarkdown(md) {
    if (!md) return '';
    
    let html = md
        .replace(/^# (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h5>$1</h5>')
        .replace(/^\*\* (.+)$/gm, '<li>$1</li>')
        .replace(/^- (.+)$/gm, '<li>$1</li>');
    
    const lines = html.split('\n');
    const result = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            if (inList) {
                result.push('</ul>');
                inList = false;
            }
            continue;
        }
        
        if (line.startsWith('<li>')) {
            if (!inList) {
                result.push('<ul>');
                inList = true;
            }
            result.push(line);
        } else {
            if (inList) {
                result.push('</ul>');
                inList = false;
            }
            if (line.startsWith('<h') || line.startsWith('<p')) {
                result.push(line);
            } else if (!line.match(/^<[hul]/)) {
                result.push(`<p>${line}</p>`);
            } else {
                result.push(line);
            }
        }
    }
    
    if (inList) {
        result.push('</ul>');
    }
    
    return result.join('\n');
}

function showUpdateAvailableDialog(version, releaseNotes) {
    const notesHtml = releaseNotes ? `
        <div class="update-notes-wrap">
            <div class="update-notes">${renderMarkdown(releaseNotes)}</div>
        </div>
    ` : '';
    const content = `
        <div class="form-group">
            <div class="update-banner">
                <span class="update-banner__icon">🎉</span>
                <p class="update-banner__text">发现新版本 <strong class="update-banner__version">v${version}</strong></p>
            </div>
            ${notesHtml}
            <p class="update-dialog-desc">点击「安装」下载更新，完成后可立即重启或稍后关闭时自动安装。</p>
        </div>
    `;
    showModal('发现新版本', content, async () => {
        closeModal();
        showUpdateProgressModal();
        requestAnimationFrame(() => { downloadUpdate(); });
        return false;
    }, true, { primaryLabel: '安装', cancelLabel: '取消' });
}

function showUpdateProgressModal() {
    const html = `
        <div class="form-group">
            <p class="update-progress-wrap__label">正在下载更新...</p>
            <div class="update-progress-track">
                <div id="update-progress-bar" class="update-progress-bar"></div>
            </div>
            <p id="update-progress-text" class="update-progress-text">0%</p>
        </div>
    `;
    showModal('下载更新', html, null, false);
}

function showUpdateDownloadedDialog(version) {
    if (document.getElementById('update-progress-bar')) closeModal();
    updateDownloading = false;
    const content = `
        <div class="form-group">
            <div class="update-banner update-banner--success">
                <span class="update-banner__icon">✅</span>
                <p class="update-banner__text">更新 <strong class="update-banner__version">v${version}</strong> 已下载完成</p>
            </div>
            <p class="update-dialog-desc">点击「立即重启」应用更新，或选「稍后」在关闭/下次启动时自动安装。</p>
        </div>
    `;
    showModal('更新已就绪', content, () => installUpdate(), true, { primaryLabel: '立即重启', cancelLabel: '稍后' });
}

async function clearUpdateCache() {
    log('更新: 清除缓存请求', 'info');
    try {
        const result = await ipcRenderer.invoke('clear-update-cache');
        if (result.success) {
            log(`更新: 已清除缓存${result.cleared?.length ? ` (${result.cleared.length} 项)` : ''}`, 'info');
            showMessage('已清除更新缓存，可重新点击「检查更新」', 'success');
        }
    } catch (e) {
        log(`清除缓存失败: ${e.message}`, 'error');
        showMessage(`清除缓存失败: ${e.message}`, 'error');
    }
}

async function checkForUpdates() {
    clearUpdateCheckWatchdog();
    log('正在检查更新...', 'info');
    try {
        const result = await ipcRenderer.invoke('check-for-updates');
        if (result.skipped) {
            log('更新: 未打包环境，已跳过', 'info');
            showMessage('当前为未打包环境，已跳过更新检查', 'info');
            return;
        }
        if (!result.success) {
            const msg = result.error || '检查更新失败';
            log(msg, 'error');
            showMessage(msg, 'error');
            return;
        }
        log('更新: 已发起检查，看门狗 15s', 'info');
        updateCheckWatchdogTimer = setTimeout(() => {
            updateCheckWatchdogTimer = null;
            log('更新: 看门狗超时，未收到主进程结果', 'error');
            showMessage('检查更新超时，请重试', 'error');
        }, CHECK_WATCHDOG_MS);
    } catch (e) {
        const msg = e.message || '检查更新失败';
        log(msg, 'error');
        showMessage(msg, 'error');
    }
}

async function downloadUpdate() {
    if (updateDownloading) {
        showMessage('更新正在下载中...', 'info');
        return;
    }
    updateDownloading = true;
    _lastLoggedProgressPct = -1;
    log('更新: 开始下载', 'info');
    try {
        const result = await ipcRenderer.invoke('download-update');
        if (!result.success) throw new Error(result.error || '下载更新失败');
    } catch (e) {
        updateDownloading = false;
        if (document.getElementById('update-progress-bar')) closeModal();
        const msg = e.message || '下载更新失败';
        log(msg, 'error');
        showMessage(msg, 'error');
    }
}

async function installUpdate() {
    log('更新: 执行安装并重启', 'info');
    try {
        await ipcRenderer.invoke('install-update');
    } catch (e) {
        log(`安装更新失败: ${e.message}`, 'error');
        showMessage(`安装更新失败: ${e.message}`, 'error');
    }
}