<script setup>
import { computed } from 'vue';
import { useAppStore } from '../composables/useAppStore.js';
import { checkForUpdates, clearUpdateCache } from '../composables/useUpdates.js';

const store = useAppStore();
const { state, toggleTheme, addRepo, refreshRepoList, openModal } = store;

const themeIcon = computed(() => (state.theme === 'light' ? '🌙' : '☀️'));
const refreshing = computed(() => state.isRefreshing);

function openPlatform() {
  openModal({ type: 'platform-config', title: '平台配置' });
}
function openSync() {
  openModal({ type: 'sync-config', title: '同步配置', wide: true });
}
function openClone() {
  openModal({ type: 'clone', title: '克隆仓库' });
}
function openBatch() {
  openModal({ type: 'batch', title: '批量操作' });
}
function openHelp() {
  openModal({ type: 'help', title: '使用帮助', closeOnly: true });
}
</script>

<template>
  <div class="toolbar" role="toolbar">
    <div class="toolbar-group">
      <button class="btn btn-primary" type="button" @click="addRepo"><span class="icon">➕</span> 添加仓库</button>
      <button class="btn btn-primary" type="button" @click="openClone"><span class="icon">⬇️</span> 克隆</button>
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="refreshing"
        :aria-busy="refreshing"
        @click="refreshRepoList(false)"
      >
        <span class="icon" :class="{ 'icon--spin': refreshing }">🔄</span>
        {{ refreshing ? '刷新中…' : '刷新' }}
      </button>
    </div>
    <div class="toolbar-divider" aria-hidden="true"></div>
    <div class="toolbar-group">
      <button class="btn btn-secondary" type="button" @click="openPlatform"><span class="icon">⚙️</span> 平台配置</button>
      <button class="btn btn-secondary" type="button" @click="openSync"><span class="icon">🔗</span> 同步配置</button>
      <button class="btn btn-secondary" type="button" @click="openBatch"><span class="icon">📤</span> 批量</button>
    </div>
    <div class="toolbar-divider" aria-hidden="true"></div>
    <div class="toolbar-group">
      <button class="btn btn-secondary" type="button" @click="checkForUpdates"><span class="icon">⬆️</span> 检查更新</button>
      <button class="btn btn-secondary" type="button" @click="clearUpdateCache"><span class="icon">🗑️</span> 清缓存</button>
      <button class="btn btn-secondary" type="button" @click="openHelp"><span class="icon">❓</span> 帮助</button>
    </div>
    <div class="toolbar-spacer"></div>
    <button class="btn btn-theme" type="button" title="切换主题" @click="toggleTheme">
      <span class="icon">{{ themeIcon }}</span>
    </button>
  </div>
</template>
