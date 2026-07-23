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

const store = useAppStore();
const { state, initApp, stopAutoRefresh, saveConfig, closeModal, quickCommit } = store;
setupUpdates(store);

const splitRoot = ref(null);
let splitInstance = null;

function initSplit() {
  if (!splitRoot.value) return;
  const panels = splitRoot.value.querySelectorAll('.panel');
  if (panels.length < 3) return;
  const sizes = Array.isArray(state.panelSizes) && state.panelSizes.length === 3
    ? state.panelSizes
    : [24, 48, 28];
  splitInstance = Split([...panels], {
    sizes,
    minSize: [200, 340, 200],
    gutterSize: 8,
    cursor: 'col-resize',
    onDragEnd(newSizes) {
      state.panelSizes = newSizes;
      saveConfig();
    }
  });
}

function onKeydown(e) {
  if (e.key === 'Escape' && state.modal) closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    quickCommit();
  }
}

onMounted(async () => {
  await initApp();
  await nextTick();
  initSplit();
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', stopAutoRefresh);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  stopAutoRefresh();
  if (splitInstance) splitInstance.destroy();
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
