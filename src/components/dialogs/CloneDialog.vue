<script setup>
import { reactive, onMounted } from 'vue';
import { invoke } from '../../utils/ipc.js';
import { useAppStore } from '../../composables/useAppStore.js';

const emit = defineEmits(['ready']);
const store = useAppStore();
const { state, PLATFORMS, sanitizeConfig, saveConfig, showMessage, log, refreshRepoList } = store;

const form = reactive({
  url: '',
  platform: 'GitHub',
  name: '',
  targetDir: ''
});

async function pickDir() {
  const folder = await invoke('select-folder');
  if (folder) form.targetDir = folder;
}

async function onConfirm() {
  const url = form.url.trim();
  const targetDir = form.targetDir.trim();
  if (!url) {
    showMessage('请输入仓库URL', 'warning');
    return false;
  }
  if (!targetDir) {
    showMessage('请选择克隆目标目录', 'warning');
    return false;
  }
  const config = sanitizeConfig(state.platformConfig[form.platform] || {});
  const repoName = form.name.trim() || url.split('/').pop().replace(/\.git$/, '');
  const targetPath = await invoke('join-path', targetDir, repoName);
  log(`开始克隆仓库: ${url} -> ${targetPath}`, 'info');
  try {
    const result = await invoke('git-clone', url, targetPath, {}, config);
    if (!result.success) throw new Error(result.error || '克隆失败');
    if (!state.repoPaths.includes(targetPath)) {
      state.repoPaths.push(targetPath);
      await saveConfig();
    }
    await refreshRepoList(true);
    log(`克隆成功: ${targetPath}`, 'success');
    showMessage('克隆成功并已加入列表', 'success');
  } catch (e) {
    log(`克隆失败: ${e.message}`, 'error');
    showMessage(`克隆失败: ${e.message}`, 'error');
    return false;
  }
}

onMounted(() => emit('ready', onConfirm));
</script>

<template>
  <div>
    <div class="form-group">
      <label class="form-label">仓库 URL</label>
      <input v-model="form.url" type="text" class="form-input" placeholder="https://github.com/user/repo.git">
    </div>
    <div class="form-group">
      <label class="form-label">平台</label>
      <select v-model="form.platform" class="form-select">
        <option v-for="p in PLATFORMS" :key="p" :value="p">{{ p }}</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">本地目录名（可选）</label>
      <input v-model="form.name" type="text" class="form-input" placeholder="默认取仓库名">
    </div>
    <div class="form-group">
      <label class="form-label">克隆到</label>
      <div class="ssh-key-row">
        <input v-model="form.targetDir" type="text" class="form-input" placeholder="选择目标父目录" readonly>
        <button class="btn btn-secondary" type="button" @click="pickDir">浏览</button>
      </div>
    </div>
  </div>
</template>
