<script setup>
import { ref, watch, nextTick } from 'vue';
import { useAppStore } from '../composables/useAppStore.js';
import AppIcon from './AppIcon.vue';

const { state, clearLogs } = useAppStore();
const container = ref(null);

watch(
  () => state.logs.length,
  async () => {
    await nextTick();
    if (container.value) container.value.scrollTop = container.value.scrollHeight;
  }
);
</script>

<template>
  <div class="panel panel-right" id="panel-right">
    <div class="panel-header">
      <h2>操作日志</h2>
      <button class="btn-icon" title="清空日志" type="button" @click="clearLogs">
        <AppIcon name="trash" :size="14" />
      </button>
    </div>
    <div class="panel-body panel-body--log">
      <div ref="container" class="log-container" role="log" aria-live="polite">
        <div
          v-for="entry in state.logs"
          :key="entry.id"
          class="log-entry"
          :class="entry.level"
        >
          <span class="log-time">[{{ entry.time }}]</span>{{ entry.message }}
        </div>
      </div>
    </div>
  </div>
</template>
