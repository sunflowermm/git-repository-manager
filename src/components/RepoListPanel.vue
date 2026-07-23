<script setup>
import { ref, watch, nextTick, computed } from 'vue';
import Sortable from 'sortablejs';
import { useAppStore } from '../composables/useAppStore.js';

const store = useAppStore();
const {
  state,
  filteredRepos,
  getRepoRole,
  selectRepo,
  removeRepoFromList,
  reorderRepoPaths,
  openRepoFolder
} = store;

const listEl = ref(null);
let sortable = null;

const countText = computed(() => {
  const total = state.repos.length;
  const shown = filteredRepos.value.length;
  if (state.searchTerm.trim()) return `${shown}/${total}`;
  return String(total);
});

const isFiltered = computed(() => !!state.searchTerm.trim());

function changeCount(repo) {
  return (repo.modified || 0) + (repo.untracked || 0) + (repo.deleted || 0) + (repo.renamed || 0);
}

function setupSortable() {
  if (sortable) {
    sortable.destroy();
    sortable = null;
  }
  if (!listEl.value || isFiltered.value || filteredRepos.value.length < 2) return;
  sortable = Sortable.create(listEl.value, {
    handle: '.repo-drag-handle',
    animation: 150,
    ghostClass: 'repo-item--ghost',
    chosenClass: 'repo-item--chosen',
    onEnd: async () => {
      const paths = [...listEl.value.querySelectorAll('.repo-item')]
        .map((li) => li.dataset.repoPath)
        .filter(Boolean);
      await reorderRepoPaths(paths);
    }
  });
}

watch([filteredRepos, isFiltered], async () => {
  await nextTick();
  setupSortable();
}, { flush: 'post' });
</script>

<template>
  <div class="panel panel-left" id="panel-left">
    <div class="panel-header">
      <h2>仓库列表</h2>
      <span class="panel-meta">{{ countText }}</span>
    </div>
    <div class="panel-body panel-body--list">
      <div class="search-box">
        <input
          v-model="state.searchTerm"
          type="search"
          class="search-input"
          placeholder="搜索仓库名称 / 平台 / 分支…"
          autocomplete="off"
        >
      </div>
      <div class="repo-list-container">
        <ul v-if="filteredRepos.length" ref="listEl" class="repo-list">
          <li
            v-for="repo in filteredRepos"
            :key="repo.path"
            class="repo-item"
            :class="{ active: state.currentRepo?.path === repo.path }"
            :data-repo-path="repo.path"
            @click="selectRepo(repo)"
            @dblclick="openRepoFolder(repo.path)"
          >
            <div v-if="!isFiltered" class="repo-drag-handle" title="拖动调整顺序" @click.stop>⋮⋮</div>
            <div class="repo-item-body">
              <div class="repo-name">{{ repo.name }}</div>
              <div class="repo-meta">
                <span class="repo-badge badge-platform">{{ repo.platform }}</span>
                <span class="repo-branch">{{ repo.branch || '无分支' }}</span>
                <span
                  v-if="getRepoRole(repo.name)"
                  class="repo-badge"
                  :class="getRepoRole(repo.name) === 'main' ? 'badge-main' : 'badge-sub'"
                >{{ getRepoRole(repo.name) === 'main' ? '主' : '从' }}</span>
                <span
                  v-if="changeCount(repo) > 0 || repo.hasChanges"
                  class="repo-badge badge-changes"
                >{{ changeCount(repo) || '•' }}</span>
              </div>
            </div>
            <button class="btn-icon repo-remove-btn" title="从列表移除" @click.stop="removeRepoFromList(repo.path)">✕</button>
          </li>
        </ul>
        <div v-else class="empty-state">
          <template v-if="!state.repos.length">暂无仓库<br><small>点击「添加仓库」或「克隆」开始</small></template>
          <template v-else>无匹配仓库</template>
        </div>
      </div>
    </div>
  </div>
</template>
