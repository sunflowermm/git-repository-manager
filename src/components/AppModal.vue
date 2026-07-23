<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { useAppStore } from '../composables/useAppStore.js';
import { useMarkdown } from '../composables/useMarkdown.js';
import { downloadUpdate, installUpdate } from '../composables/useUpdates.js';
import AppIcon from './AppIcon.vue';
import PlatformConfigDialog from './dialogs/PlatformConfigDialog.vue';
import SyncConfigDialog from './dialogs/SyncConfigDialog.vue';
import CloneDialog from './dialogs/CloneDialog.vue';
import BatchDialog from './dialogs/BatchDialog.vue';
import HelpDialog from './dialogs/HelpDialog.vue';

const store = useAppStore();
const { state, closeModal } = store;
const { renderMarkdown } = useMarkdown();

const inputValue = ref('');
const inputEl = ref(null);

const modal = computed(() => state.modal);
const showFooterPrimary = computed(() => modal.value && !modal.value.hidePrimary);
const primaryLabel = computed(() => {
  if (!modal.value) return '确定';
  if (modal.value.type === 'update-available') return '安装';
  if (modal.value.type === 'update-downloaded') return '立即重启';
  if (modal.value.closeOnly) return '关闭';
  return modal.value.primaryLabel || '确定';
});
const cancelLabel = computed(() => modal.value?.cancelLabel || '取消');
const showCancel = computed(() => {
  if (!modal.value) return false;
  if (modal.value.closeOnly || modal.value.type === 'update-progress') return false;
  if (modal.value.type === 'confirm' || modal.value.type === 'input') return true;
  if (modal.value.type === 'update-available' || modal.value.type === 'update-downloaded') return true;
  if (['platform-config', 'sync-config', 'clone', 'batch'].includes(modal.value.type)) return true;
  return !!modal.value.showCancel;
});

watch(
  () => modal.value,
  async (m) => {
    if (m?.type === 'input') {
      inputValue.value = m.defaultValue || '';
      await nextTick();
      inputEl.value?.focus();
      inputEl.value?.select();
    }
  }
);

function onOverlayClick() {
  if (modal.value?.closeOnOverlay === false) return;
  if (modal.value?.type === 'confirm') modal.value.resolve?.(false);
  else if (modal.value?.type === 'input') modal.value.resolve?.(null);
  else closeModal();
}

function onCancel() {
  if (modal.value?.type === 'confirm') modal.value.resolve?.(false);
  else if (modal.value?.type === 'input') modal.value.resolve?.(null);
  else if (modal.value?.type === 'update-downloaded') closeModal();
  else closeModal();
}

async function onPrimary() {
  const m = modal.value;
  if (!m) return;
  if (m.type === 'confirm') {
    m.resolve?.(true);
    return;
  }
  if (m.type === 'input') {
    m.resolve?.(inputValue.value.trim() || null);
    return;
  }
  if (m.type === 'update-available') {
    await downloadUpdate();
    return;
  }
  if (m.type === 'update-downloaded') {
    await installUpdate();
    return;
  }
  if (m.closeOnly || m.type === 'pre' || m.type === 'help' || m.type === 'update-progress') {
    closeModal();
    return;
  }
  if (m.onConfirm) {
    const result = await m.onConfirm();
    if (result !== false) closeModal();
    return;
  }
  closeModal();
}

function onInputKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    onPrimary();
  }
}
</script>

<template>
  <div
    v-if="modal"
    id="modal-overlay"
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    @click.self="onOverlayClick"
  >
    <div class="modal-content" :class="{ 'modal-content--sync': modal.wide || modal.type === 'sync-config' }">
      <div class="modal-header">{{ modal.title }}</div>
      <div class="modal-body">
        <template v-if="modal.type === 'confirm'">
          <p>{{ modal.message }}</p>
        </template>

        <template v-else-if="modal.type === 'input'">
          <div class="form-group">
            <label class="form-label">{{ modal.message }}</label>
            <input
              ref="inputEl"
              v-model="inputValue"
              type="text"
              class="form-input"
              :placeholder="modal.placeholder || ''"
              style="width:100%;margin-top:8px;"
              @keydown="onInputKeydown"
            >
          </div>
        </template>

        <template v-else-if="modal.type === 'pre'">
          <pre style="font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;max-height:400px;overflow:auto;">{{ modal.content }}</pre>
        </template>

        <template v-else-if="modal.type === 'switch-branch'">
          <div class="form-group">
            <label class="form-label">选择分支</label>
            <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;">
              <button
                v-for="b in modal.branches"
                :key="b"
                class="btn btn-secondary"
                type="button"
                @click="modal.onSelect(b)"
              >{{ b }}</button>
            </div>
          </div>
        </template>

        <template v-else-if="modal.type === 'update-available'">
          <div class="form-group">
            <div class="update-banner">
              <span class="update-banner__icon"><AppIcon name="spark" :size="22" /></span>
              <p class="update-banner__text">发现新版本 <strong class="update-banner__version">v{{ modal.version }}</strong></p>
            </div>
            <div v-if="modal.releaseNotes" class="update-notes-wrap">
              <div class="update-notes" v-html="renderMarkdown(modal.releaseNotes)" />
            </div>
            <p class="update-dialog-desc">点击「安装」下载更新，完成后可立即重启或稍后关闭时自动安装。</p>
          </div>
        </template>

        <template v-else-if="modal.type === 'update-progress'">
          <div class="form-group">
            <p class="update-progress-wrap__label">正在下载更新...</p>
            <div class="update-progress-track">
              <div class="update-progress-bar" :style="{ width: (modal.percent || 0) + '%' }" />
            </div>
            <p class="update-progress-text">{{ modal.text || '准备中...' }}</p>
          </div>
        </template>

        <template v-else-if="modal.type === 'update-downloaded'">
          <div class="form-group">
            <div class="update-banner update-banner--success">
              <span class="update-banner__icon"><AppIcon name="check" :size="22" /></span>
              <p class="update-banner__text">更新 <strong class="update-banner__version">v{{ modal.version }}</strong> 已下载完成</p>
            </div>
            <p class="update-dialog-desc">点击「立即重启」应用更新，或选「稍后」在关闭/下次启动时自动安装。</p>
          </div>
        </template>

        <PlatformConfigDialog v-else-if="modal.type === 'platform-config'" @ready="(fn) => (modal.onConfirm = fn)" />
        <SyncConfigDialog v-else-if="modal.type === 'sync-config'" @ready="(fn) => (modal.onConfirm = fn)" />
        <CloneDialog v-else-if="modal.type === 'clone'" @ready="(fn) => (modal.onConfirm = fn)" />
        <BatchDialog v-else-if="modal.type === 'batch'" @ready="(fn) => (modal.onConfirm = fn)" />
        <HelpDialog v-else-if="modal.type === 'help'" />
      </div>

      <div class="modal-footer">
        <button v-if="showCancel" class="btn btn-secondary" type="button" @click="onCancel">
          {{ modal.type === 'update-downloaded' ? '稍后' : cancelLabel }}
        </button>
        <button v-if="showFooterPrimary" class="btn btn-primary" type="button" @click="onPrimary">{{ primaryLabel }}</button>
      </div>
    </div>
  </div>
</template>
