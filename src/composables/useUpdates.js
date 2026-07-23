import { on } from '../utils/ipc.js';
import { invoke } from '../utils/ipc.js';

let listenersBound = false;
let storeRef = null;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  const value = n / Math.pow(k, i);
  return `${i === 0 ? Math.round(value) : Math.round(value * 100) / 100} ${sizes[i]}`;
}

function handleStatus(status, payload = {}) {
  const { log, showMessage, openModal } = storeRef;
  const data = { status, ...payload };
  if (status === 'available') {
    log(`检查完成：发现新版本 v${data.version}`, 'info');
    openModal({
      type: 'update-available',
      title: '发现新版本',
      version: data.version,
      releaseNotes: data.releaseNotes || '',
      closeOnOverlay: false
    });
  } else if (status === 'not-available') {
    log('检查完成：已是最新版本', 'info');
    showMessage('已是最新版本', 'success');
  } else if (status === 'error') {
    log(data.message || '检查更新失败', 'error');
    showMessage(data.message || '检查更新失败', 'error');
  } else if (status === 'downloaded') {
    log(`更新: 已下载 v${data.version}`, 'info');
    openModal({
      type: 'update-downloaded',
      title: '更新已就绪',
      version: data.version,
      closeOnOverlay: false
    });
  }
}

function handleProgress(progress) {
  const modal = storeRef.state.modal;
  if (modal?.type === 'update-progress') {
    modal.percent = Math.max(0, Math.min(100, progress.percent || 0));
    modal.text = progress.total
      ? `${Math.round(modal.percent)}% (${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`
      : `${Math.round(modal.percent)}%`;
    if (progress.bytesPerSecond) {
      modal.text += `，速度 ${formatBytes(progress.bytesPerSecond)}/s`;
    }
  }
}

export function setupUpdates(store) {
  storeRef = store;
  if (listenersBound) return;
  listenersBound = true;
  on('update-status', (status, payload) => handleStatus(status, payload));
  on('update-progress', (progress) => handleProgress(progress));
  on('update-log', ({ message, level }) => {
    if (message) storeRef.log(message, level || 'info');
  });
}

export async function checkForUpdates() {
  const { log, showMessage } = storeRef;
  log('正在检查更新...', 'info');
  try {
    const result = await invoke('check-for-updates');
    if (result.skipped) {
      log('更新: 未打包环境，已跳过', 'info');
      showMessage('当前为未打包环境，已跳过更新检查', 'info');
      return;
    }
    if (!result.success) showMessage(result.error || '检查更新失败', 'error');
  } catch (e) {
    showMessage(e.message || '检查更新失败', 'error');
  }
}

export async function clearUpdateCache() {
  const result = await invoke('clear-update-cache');
  if (result.success) {
    storeRef.log('更新: 已清除缓存', 'info');
    storeRef.showMessage('已清除更新缓存，可重新检查更新', 'success');
  }
}

export async function downloadUpdate() {
  storeRef.closeModal();
  storeRef.openModal({
    type: 'update-progress',
    title: '下载更新',
    percent: 0,
    text: '准备中...',
    closeOnOverlay: false,
    closeOnly: true
  });
  const result = await invoke('download-update');
  if (!result.success) {
    storeRef.closeModal();
    storeRef.showMessage(result.error || '下载更新失败', 'error');
  }
}

export async function installUpdate() {
  await invoke('install-update');
}
