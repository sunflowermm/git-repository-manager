<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '../../composables/useAppStore.js';

const emit = defineEmits(['ready']);
const store = useAppStore();
const { state, saveConfig, showMessage, openConfirm, selectRepo } = store;

const mainRepo = ref('');
const selectedSubs = ref([]);

const groupedRepos = computed(() => {
  const set = new Set();
  Object.values(state.syncConfig.sync_groups || {}).forEach((g) => {
    if (g.main) set.add(g.main);
    (g.subordinates || []).forEach((s) => set.add(s));
  });
  return set;
});

const availableSubs = computed(() =>
  state.repos.filter((r) => r.name !== mainRepo.value)
);

const groups = computed(() => Object.entries(state.syncConfig.sync_groups || {}));

function isSubDisabled(name) {
  if (!groupedRepos.value.has(name)) return false;
  const groupId = state.syncConfig.repo_to_group[name];
  const group = groupId ? state.syncConfig.sync_groups[groupId] : null;
  return !!group && group.main !== mainRepo.value;
}

function toggleSub(name, checked) {
  if (checked) {
    if (!selectedSubs.value.includes(name)) selectedSubs.value.push(name);
  } else {
    selectedSubs.value = selectedSubs.value.filter((n) => n !== name);
  }
}

function saveGroup() {
  if (!mainRepo.value) {
    showMessage('请选择主仓库', 'warning');
    return;
  }
  const subordinates = selectedSubs.value.filter((n) => n !== mainRepo.value);
  if (!subordinates.length) {
    showMessage('请至少选择一个从仓库', 'warning');
    return;
  }
  if (!state.syncConfig.sync_groups) state.syncConfig.sync_groups = {};
  if (!state.syncConfig.repo_to_group) state.syncConfig.repo_to_group = {};

  if (state.syncConfig.repo_to_group[mainRepo.value]) {
    delete state.syncConfig.sync_groups[state.syncConfig.repo_to_group[mainRepo.value]];
  }
  subordinates.forEach((sub) => {
    const oldId = state.syncConfig.repo_to_group[sub];
    if (oldId) {
      const old = state.syncConfig.sync_groups[oldId];
      if (old?.subordinates) {
        old.subordinates = old.subordinates.filter((s) => s !== sub);
        if (!old.subordinates.length) delete state.syncConfig.sync_groups[oldId];
      }
    }
  });

  const groupId = `group_${Date.now()}`;
  state.syncConfig.sync_groups[groupId] = { main: mainRepo.value, subordinates };
  state.syncConfig.repo_to_group[mainRepo.value] = groupId;
  subordinates.forEach((sub) => {
    state.syncConfig.repo_to_group[sub] = groupId;
  });
  selectedSubs.value = [];
  showMessage('同步组已保存', 'success');
}

async function removeGroup(groupId) {
  const ok = await openConfirm('确认删除', '确定要删除这个同步组吗？');
  if (!ok) return;
  const group = state.syncConfig.sync_groups[groupId];
  if (group) {
    delete state.syncConfig.repo_to_group[group.main];
    group.subordinates?.forEach((sub) => delete state.syncConfig.repo_to_group[sub]);
  }
  delete state.syncConfig.sync_groups[groupId];
  showMessage('同步组已删除', 'success');
}

async function clearAll() {
  const ok = await openConfirm('确认清空', '确定要清空所有同步组吗？');
  if (!ok) return;
  state.syncConfig.sync_groups = {};
  state.syncConfig.repo_to_group = {};
  showMessage('所有同步组已清空', 'success');
}

async function onConfirm() {
  await saveConfig();
  showMessage('同步配置已保存', 'success');
  if (state.currentRepo) await selectRepo(state.currentRepo);
}

onMounted(() => emit('ready', onConfirm));
</script>

<template>
  <div class="sync-layout">
    <div class="sync-card">
      <div class="sync-card-header">新建同步组</div>
      <div class="sync-card-body">
        <div class="form-group form-group--tight">
          <label class="form-label">主仓库</label>
          <select v-model="mainRepo" class="form-select">
            <option value="">请选择</option>
            <option v-for="r in state.repos" :key="r.path" :value="r.name">{{ r.name }}</option>
          </select>
        </div>
        <div class="form-group form-group--fill">
          <label class="form-label">
            从仓库
            <span class="sync-count">{{ selectedSubs.length }}/{{ availableSubs.length }}</span>
          </label>
          <div id="sync-subordinate-repos" class="sync-scroll">
            <label
              v-for="r in availableSubs"
              :key="r.path"
              class="sync-check-item"
              :class="{ 'sync-check-item--disabled': isSubDisabled(r.name) }"
            >
              <input
                type="checkbox"
                class="form-checkbox"
                :value="r.name"
                :disabled="isSubDisabled(r.name)"
                :checked="selectedSubs.includes(r.name)"
                @change="toggleSub(r.name, $event.target.checked)"
              >
              <span class="sync-check-name">{{ r.name }}</span>
              <span v-if="groupedRepos.has(r.name)" class="sync-check-tag">已分组</span>
            </label>
            <div v-if="!availableSubs.length" class="empty-state empty-state--compact">暂无可用仓库</div>
          </div>
        </div>
        <div class="sync-actions">
          <button class="btn btn-primary" type="button" @click="saveGroup">保存同步组</button>
          <button class="btn btn-danger" type="button" @click="clearAll">清空全部</button>
        </div>
      </div>
    </div>

    <div class="sync-card">
      <div class="sync-card-header">
        当前同步组
        <span class="sync-count">{{ groups.length }}</span>
      </div>
      <div class="sync-card-body sync-card-body--list">
        <div class="sync-scroll">
          <div v-if="!groups.length" class="empty-state empty-state--compact">暂无同步组</div>
          <div v-for="[id, group] in groups" :key="id" class="sync-group-item">
            <div class="sync-group-meta">
              <div class="sync-group-line">
                <span class="sync-group-k">主</span>
                <strong class="sync-group-v">{{ group.main }}</strong>
              </div>
              <div class="sync-group-line">
                <span class="sync-group-k">从</span>
                <span class="sync-group-v sync-group-v--subs">{{ group.subordinates?.join('、') || '无' }}</span>
              </div>
            </div>
            <button class="btn btn-danger sync-group-del" type="button" @click="removeGroup(id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
