<script setup>
import { computed } from 'vue';
import { useAppStore } from '../composables/useAppStore.js';
import { checkForUpdates, clearUpdateCache } from '../composables/useUpdates.js';
import AppIcon from './AppIcon.vue';

const store = useAppStore();
const { state, toggleTheme, addRepo, refreshRepoList, openModal } = store;

const themeIcon = computed(() => (state.theme === 'light' ? 'moon' : 'sun'));
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
      <button class="btn btn-primary" type="button" @click="addRepo">
        <AppIcon name="plus" :size="15" /> 添加仓库
      </button>
      <button class="btn btn-primary" type="button" @click="openClone">
        <AppIcon name="clone" :size="15" /> 克隆
      </button>
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="refreshing"
        :aria-busy="refreshing"
        @click="refreshRepoList(false)"
      >
        <AppIcon name="refresh" :size="15" :class="{ 'icon--spin': refreshing }" />
        {{ refreshing ? '刷新中…' : '刷新' }}
      </button>
    </div>
    <div class="toolbar-divider" aria-hidden="true"></div>
    <div class="toolbar-group">
      <button class="btn btn-secondary" type="button" @click="openPlatform">
        <AppIcon name="settings" :size="15" /> 平台配置
      </button>
      <button class="btn btn-secondary" type="button" @click="openSync">
        <AppIcon name="sync" :size="15" /> 同步配置
      </button>
      <button class="btn btn-secondary" type="button" @click="openBatch">
        <AppIcon name="batch" :size="15" /> 批量
      </button>
    </div>
    <div class="toolbar-divider" aria-hidden="true"></div>
    <div class="toolbar-group">
      <button class="btn btn-secondary" type="button" @click="checkForUpdates">
        <AppIcon name="update" :size="15" /> 检查更新
      </button>
      <button class="btn btn-secondary" type="button" @click="clearUpdateCache">
        <AppIcon name="trash" :size="15" /> 清缓存
      </button>
      <button class="btn btn-secondary" type="button" @click="openHelp">
        <AppIcon name="help" :size="15" /> 帮助
      </button>
    </div>
    <div class="toolbar-spacer"></div>
    <button class="btn btn-theme" type="button" title="切换主题" @click="toggleTheme">
      <AppIcon :name="themeIcon" :size="16" />
    </button>
  </div>
</template>
