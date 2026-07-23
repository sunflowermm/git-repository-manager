<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '../utils/ipc.js';

defineProps({
  version: { type: String, default: '' }
});

const maximizeLabel = ref('□');
let timer;

async function refreshMax() {
  const isMax = await invoke('window-is-maximized');
  maximizeLabel.value = isMax ? '❐' : '□';
}

onMounted(() => {
  refreshMax();
  timer = setInterval(refreshMax, 400);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="title-bar" id="title-bar">
    <div class="title-bar-content">
      <div class="title-bar-title">
        <span class="title-icon" aria-hidden="true">🌻</span>
        <span class="title-text">向日葵Git仓库管理</span>
        <span v-if="version" class="title-version">v{{ version }}</span>
      </div>
      <div class="title-bar-controls">
        <button class="title-bar-btn" title="最小化" @click="invoke('window-minimize')">−</button>
        <button class="title-bar-btn" title="最大化/还原" @click="invoke('window-maximize')">{{ maximizeLabel }}</button>
        <button class="title-bar-btn btn-close" title="关闭" @click="invoke('window-close')">×</button>
      </div>
    </div>
  </div>
</template>
