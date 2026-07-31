<script setup>
import { computed } from 'vue';
import { useAppStore } from '../composables/useAppStore.js';
import AppIcon from './AppIcon.vue';

const store = useAppStore();
const {
  state,
  getRepoRole,
  getFileChangeType,
  addRepo,
  openModal,
  quickCommit,
  commitAndPush,
  commitAndSync,
  pullChanges,
  pullChangesForce,
  pushChanges,
  stashChanges,
  stashPop,
  createBranch,
  switchBranch,
  viewLog,
  viewDiff,
  openRepoFolder,
  updateCurrentRepoInfo,
  composeCommitPreview,
  refreshCommitStamp,
  regenerateCommitMessage,
  log
} = store;

const hasRepo = computed(() => !!state.currentRepo && !state.currentRepo.loading);
const isLoadingRepo = computed(() => !!state.currentRepo?.loading || (state.isBootstrapping && !!state.repoPaths.length));
const hint = computed(() => {
  if (isLoadingRepo.value) return '加载中…';
  return state.currentRepo?.name || '未选择仓库';
});
const roleText = computed(() => {
  const role = getRepoRole(state.repoInfo?.name || state.currentRepo?.name);
  if (role === 'main') return '主仓库';
  if (role === 'subordinate') return '从仓库';
  return '无';
});
const authText = computed(() => {
  const platform = state.repoInfo?.platform || '未知';
  const config = state.platformConfig[platform] || {};
  if (config.auth_type === 'ssh') return 'SSH密钥';
  if (config.auth_type === 'password') return '账号密码/Token';
  return '-';
});
const changeFiles = computed(() =>
  (state.repoInfo?.status?.files || []).map((file) => ({
    ...file,
    change: getFileChangeType(file)
  }))
);
const commitPreview = computed(() => composeCommitPreview());

function openClone() {
  openModal({ type: 'clone', title: '克隆仓库' });
}

async function refreshChanges() {
  if (!state.currentRepo || state.currentRepo.loading) return;
  await updateCurrentRepoInfo();
  log('文件变更已刷新', 'success');
}
</script>

<template>
  <div class="panel panel-middle" id="panel-middle">
    <div class="panel-header">
      <h2>工作区</h2>
      <span class="panel-meta" :class="{ 'panel-meta--pulse': isLoadingRepo }">{{ hint }}</span>
    </div>
    <div class="panel-body">
      <div v-if="isLoadingRepo" class="workspace-empty workspace-empty--loading">
        <div class="loading-spinner loading-spinner--lg" aria-hidden="true" />
        <p class="workspace-empty__title">正在读取仓库信息</p>
        <p class="workspace-empty__desc">稍候即可提交、推送与同步</p>
      </div>

      <div v-else-if="!hasRepo" class="workspace-empty">
        <div class="workspace-empty__art" aria-hidden="true">
          <AppIcon name="sunflower" :size="52" />
        </div>
        <p class="workspace-empty__title">选择或添加一个仓库开始</p>
        <p class="workspace-empty__desc">支持提交、推送、主从同步与批量操作</p>
        <div class="workspace-empty__actions">
          <button class="btn btn-primary" type="button" @click="addRepo">
            <AppIcon name="plus" :size="15" /> 添加仓库
          </button>
          <button class="btn btn-secondary" type="button" @click="openClone">
            <AppIcon name="clone" :size="15" /> 克隆仓库
          </button>
        </div>
      </div>

      <div v-else class="workspace-active">
        <div class="repo-info">
          <div class="repo-info__meta">
            <div class="info-chip">
              <span class="info-label">仓库</span>
              <span class="info-value" :title="state.repoInfo?.name || state.currentRepo.name">{{ state.repoInfo?.name || state.currentRepo.name }}</span>
            </div>
            <div class="info-chip">
              <span class="info-label">平台</span>
              <span class="info-value">{{ state.repoInfo?.platform || '-' }}</span>
            </div>
            <div class="info-chip">
              <span class="info-label">分支</span>
              <span class="info-value">{{ state.repoInfo?.branch || '-' }}</span>
            </div>
            <div class="info-chip">
              <span class="info-label">角色</span>
              <span class="info-value">{{ roleText }}</span>
            </div>
            <div class="info-chip">
              <span class="info-label">认证</span>
              <span class="info-value">{{ authText }}</span>
            </div>
          </div>
          <div class="repo-info__remote" :title="state.repoInfo?.remoteUrl || ''">
            <span class="info-label">远程</span>
            <span class="info-value info-value--mono">{{ state.repoInfo?.remoteUrl || '-' }}</span>
          </div>
        </div>

        <div class="commit-section">
          <div class="section-header">
            <h3>快速提交</h3>
            <div class="commit-header-actions">
              <button
                class="btn btn-sm btn-secondary"
                type="button"
                title="刷新时间戳与变更摘要，不清空正文"
                @click="regenerateCommitMessage"
              >
                <AppIcon name="refresh" :size="13" /> 刷新时间/摘要
              </button>
              <span class="kbd-hint">Ctrl + Enter</span>
            </div>
          </div>

          <div class="commit-compose">
            <div class="commit-compose__row">
              <span class="commit-compose__label">时间</span>
              <code class="commit-compose__stamp">Update: {{ state.commitStamp || '—' }}</code>
              <button class="btn btn-sm btn-secondary" type="button" title="只更新时间戳" @click="refreshCommitStamp">
                刷新时间
              </button>
            </div>
            <div class="commit-compose__row commit-compose__row--note">
              <span class="commit-compose__label">说明</span>
              <textarea
                v-model="state.commitNote"
                class="commit-textarea commit-textarea--note"
                placeholder="写在时间与变更摘要之间（可选）…"
                rows="2"
              />
            </div>
            <div class="commit-compose__row">
              <span class="commit-compose__label">摘要</span>
              <span class="commit-compose__summary" :title="state.commitSummary || '暂无变更统计'">
                {{ state.commitSummary || '（暂无变更统计，刷新仓库后更新）' }}
              </span>
            </div>
            <div class="commit-compose__preview" :title="commitPreview">
              <span class="commit-compose__label">预览</span>
              <span class="commit-compose__preview-text">{{ commitPreview }}</span>
            </div>
          </div>

          <div class="commit-buttons">
            <button class="btn btn-success" type="button" :disabled="state.busy" @click="quickCommit">
              {{ state.busy ? '处理中…' : '一键提交' }}
            </button>
            <button class="btn btn-info" type="button" :disabled="state.busy" @click="commitAndPush">提交并推送</button>
            <button class="btn btn-warning" type="button" :disabled="state.busy" @click="commitAndSync">提交并同步</button>
          </div>
        </div>

        <div class="operations-section">
          <h3>快速操作</h3>
          <div class="ops-grid">
            <button class="btn btn-secondary btn-op" type="button" :disabled="state.busy" @click="pullChanges">拉取</button>
            <button class="btn btn-secondary btn-op" type="button" :disabled="state.busy" @click="pullChangesForce">强制拉取</button>
            <button class="btn btn-secondary btn-op" type="button" :disabled="state.busy" @click="pushChanges">推送</button>
            <button class="btn btn-secondary btn-op" type="button" :disabled="state.busy" @click="stashChanges">暂存</button>
            <button class="btn btn-secondary btn-op" type="button" :disabled="state.busy" @click="stashPop">恢复暂存</button>
            <button class="btn btn-secondary btn-op" type="button" :disabled="state.busy" @click="createBranch">创建分支</button>
            <button class="btn btn-secondary btn-op" type="button" :disabled="state.busy" @click="switchBranch">切换分支</button>
            <button class="btn btn-secondary btn-op" type="button" @click="viewLog">查看日志</button>
            <button class="btn btn-secondary btn-op" type="button" @click="viewDiff">查看差异</button>
            <button class="btn btn-secondary btn-op" type="button" @click="openRepoFolder()">打开文件夹</button>
          </div>
        </div>

        <div class="changes-section">
          <div class="section-header">
            <h3>文件变更</h3>
            <button class="btn btn-sm btn-secondary" type="button" @click="refreshChanges">
              <AppIcon name="refresh" :size="13" /> 刷新
            </button>
          </div>
          <div class="changes-list">
            <div v-if="!changeFiles.length" class="empty-state">暂无变更</div>
            <div v-for="(file, i) in changeFiles" :key="file.path + '-' + i" class="change-item">
              <span class="change-icon" :title="file.change.label" :data-kind="file.change.icon">
                <AppIcon :name="file.change.icon" :size="15" />
              </span>
              <span class="change-path">{{ file.path }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
