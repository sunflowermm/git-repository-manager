<script setup>
import { reactive, ref, onMounted } from 'vue';
import { invoke } from '../../utils/ipc.js';
import { useAppStore } from '../../composables/useAppStore.js';

const emit = defineEmits(['ready']);
const store = useAppStore();
const { state, PLATFORMS, saveConfig, showMessage } = store;

const active = ref(PLATFORMS[0]);
const proxyPort = ref(state.updateProxyPort || '');
const drafts = reactive({});

PLATFORMS.forEach((p) => {
  drafts[p] = { ...(state.platformConfig[p] || { auth_type: 'ssh' }) };
  if (!drafts[p].auth_type) drafts[p].auth_type = 'ssh';
});

async function pickSsh(platform) {
  const sshDir = await invoke('get-ssh-dir');
  const filePath = await invoke('select-file', sshDir);
  if (filePath) drafts[platform].ssh_key_path = filePath;
}

function clearSsh(platform) {
  drafts[platform].ssh_key_path = '';
}

function onProxyPreset(platform, value) {
  if (value) drafts[platform].proxy_url = value;
}

async function onConfirm() {
  const raw = String(proxyPort.value || '').trim();
  if (raw) {
    const port = parseInt(raw, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      showMessage('更新代理端口需为 1–65535', 'warning');
      return false;
    }
    state.updateProxyPort = String(port);
  } else {
    state.updateProxyPort = '';
  }
  PLATFORMS.forEach((p) => {
    state.platformConfig[p] = { ...drafts[p] };
  });
  await saveConfig();
  showMessage('配置已保存', 'success');
}

onMounted(async () => {
  emit('ready', onConfirm);
  const defaultPath = await invoke('detect-default-ssh-key');
  if (defaultPath) {
    PLATFORMS.forEach((p) => {
      if (!drafts[p].ssh_key_path) drafts[p].ssh_key_path = defaultPath;
    });
  }
});
</script>

<template>
  <div>
    <div class="form-group" style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border-color);">
      <label class="form-label">应用更新代理端口（可选）</label>
      <input v-model="proxyPort" type="number" class="form-input" min="1" max="65535" placeholder="如 7890（Clash / V2Ray 本地 HTTP 端口）">
      <small class="form-hint">检查或下载更新直连失败时，自动改用 127.0.0.1:该端口 重试</small>
    </div>

    <div class="platform-tabs">
      <button
        v-for="p in PLATFORMS"
        :key="p"
        type="button"
        class="tab-btn"
        :class="{ active: active === p }"
        @click="active = p"
      >{{ p }}</button>
    </div>

    <div v-for="p in PLATFORMS" :key="p" class="platform-panel" :style="{ display: active === p ? 'block' : 'none' }">
      <div class="form-group">
        <label class="form-label">认证方式</label>
        <select v-model="drafts[p].auth_type" class="form-select">
          <option value="ssh">SSH密钥</option>
          <option value="password">账号密码/Token</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">账户</label>
        <input v-model="drafts[p].username" type="text" class="form-input" placeholder="账户名">
      </div>
      <div v-if="drafts[p].auth_type === 'password'" class="form-group">
        <label class="form-label">密码/Token</label>
        <input v-model="drafts[p].password" type="password" class="form-input" placeholder="Personal Access Token">
      </div>
      <div class="form-group">
        <label class="form-label">邮箱</label>
        <input v-model="drafts[p].email" type="text" class="form-input" placeholder="your@email.com">
      </div>
      <div v-if="drafts[p].auth_type === 'ssh'" class="form-group">
        <label class="form-label">SSH 私钥</label>
        <div class="ssh-key-row">
          <input :value="drafts[p].ssh_key_path || ''" type="text" class="form-input" placeholder="未填则自动识别 ~/.ssh 下的密钥" readonly>
          <button class="btn btn-secondary" type="button" @click="pickSsh(p)">浏览</button>
          <button class="btn btn-secondary" type="button" @click="clearSsh(p)">清除</button>
        </div>
      </div>
      <template v-if="p === 'GitHub' && drafts[p].auth_type === 'password'">
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:10px;">
            <input v-model="drafts[p].use_proxy" type="checkbox" class="form-checkbox">
            <span>使用代理（HTTPS 拉取/推送更顺畅）</span>
          </label>
        </div>
        <div v-if="drafts[p].use_proxy" class="form-group">
          <label class="form-label">代理地址</label>
          <select class="form-select" style="margin-bottom:8px;" @change="onProxyPreset(p, $event.target.value)">
            <option value="">自定义（下方填写）</option>
            <option value="https://ghproxy.net/">ghproxy.net</option>
            <option value="https://gh-proxy.com/">gh-proxy.com</option>
            <option value="https://mirror.ghproxy.com/">mirror.ghproxy.com</option>
          </select>
          <input v-model="drafts[p].proxy_url" type="text" class="form-input" placeholder="如 https://ghproxy.net/">
        </div>
      </template>
    </div>
  </div>
</template>
