<script setup>
import { reactive, onMounted } from 'vue';
import { invoke } from '../../utils/ipc.js';
import { useAppStore } from '../../composables/useAppStore.js';

const emit = defineEmits(['ready']);
const store = useAppStore();
const { state, sanitizeConfig, showMessage, log, refreshRepoList } = store;

const form = reactive({
  action: 'push',
  selected: []
});

function toggle(path, checked) {
  if (checked) {
    if (!form.selected.includes(path)) form.selected.push(path);
  } else {
    form.selected = form.selected.filter((p) => p !== path);
  }
}

async function onConfirm() {
  if (!form.selected.length) {
    showMessage('请至少选择一个仓库', 'warning');
    return false;
  }
  log(`批量${form.action}：${form.selected.length} 个仓库`, 'info');
  for (const path of form.selected) {
    const repo = state.repos.find((r) => r.path === path);
    if (!repo) continue;
    const config = sanitizeConfig(state.platformConfig[repo.platform] || {});
    try {
      let result;
      if (form.action === 'commit') {
        if (config.username && config.email) {
          await invoke('git-set-user', repo.path, config.username, config.email);
        }
        result = await invoke('git-add', repo.path);
        if (result.success) {
          result = await invoke('git-commit', repo.path, `Batch update: ${new Date().toLocaleString('zh-CN')}`);
        }
      } else if (form.action === 'push') {
        result = await invoke('git-push', repo.path, 'origin', null, config);
      } else {
        result = await invoke('git-pull', repo.path, 'origin', null, config);
      }
      if (!result?.success) throw new Error(result?.error || '失败');
      log(`[${repo.name}] 成功`, 'success');
    } catch (e) {
      log(`[${repo.name}] 失败: ${e.message}`, 'error');
    }
  }
  await refreshRepoList(true);
  showMessage('批量操作完成', 'success');
}

onMounted(() => emit('ready', onConfirm));
</script>

<template>
  <div>
    <div class="form-group">
      <label class="form-label">操作</label>
      <select v-model="form.action" class="form-select">
        <option value="push">推送</option>
        <option value="pull">拉取</option>
        <option value="commit">提交</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">选择仓库</label>
      <div class="sync-scroll" style="max-height:280px;">
        <label v-for="r in state.repos" :key="r.path" class="sync-check-item">
          <input
            type="checkbox"
            class="form-checkbox"
            :checked="form.selected.includes(r.path)"
            @change="toggle(r.path, $event.target.checked)"
          >
          <span>{{ r.name }} ({{ r.platform }})</span>
        </label>
      </div>
    </div>
  </div>
</template>
