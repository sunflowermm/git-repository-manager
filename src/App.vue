<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import Split from 'split.js';
import { useAppStore } from './composables/useAppStore.js';
import { setupUpdates } from './composables/useUpdates.js';
import TitleBar from './components/TitleBar.vue';
import Toolbar from './components/Toolbar.vue';
import RepoListPanel from './components/RepoListPanel.vue';
import WorkspacePanel from './components/WorkspacePanel.vue';
import LogPanel from './components/LogPanel.vue';
import AppModal from './components/AppModal.vue';

const DEFAULT_SIZES = [24, 48, 28];
const MIN_SIZES = [200, 340, 200];

const store = useAppStore();
const { state, initApp, stopAutoRefresh, saveConfig, closeModal, quickCommit } = store;
setupUpdates(store);

const splitRoot = ref(null);
let splitInstance = null;

function resolveSizes() {
  if (Array.isArray(state.panelSizes) && state.panelSizes.length === 3) {
    return state.panelSizes;
  }
  return DEFAULT_SIZES;
}

function initSplit() {
  if (!splitRoot.value || splitInstance) return;
  const panels = splitRoot.value.querySelectorAll('.panel');
  if (panels.length < 3) return;
  splitInstance = Split([...panels], {
    sizes: resolveSizes(),
    minSize: MIN_SIZES,
    gutterSize: 8,
    cursor: 'col-resize',
    onDragEnd(newSizes) {
      state.panelSizes = newSizes;
      saveConfig();
    }
  });
  splitRoot.value.classList.add('split-ready');
}

function syncSplitSizes() {
  if (!splitInstance) return;
  const sizes = resolveSizes();
  try {
    splitInstance.setSizes(sizes);
  } catch {
    /* ignore */
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && state.modal) closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    quickCommit();
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', stopAutoRefresh);
  // 先挂分栏，避免 initApp 加载仓库期间三栏挤到左侧
  await nextTick();
  initSplit();
  await initApp();
  await nextTick();
  syncSplitSizes();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  stopAutoRefresh();
  if (splitInstance) {
    splitInstance.destroy();
    splitInstance = null;
  }
});
</script>

<template>
  <TitleBar :version="state.appVersion" />
  <div class="app-container">
    <Toolbar />
    <div ref="splitRoot" class="main-content" id="main-split">
      <RepoListPanel />
      <WorkspacePanel />
      <LogPanel />
    </div>
  </div>
  <AppModal />
</template>
