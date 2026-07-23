<script setup>
/**
 * 工坊墨线图标 — 统一线宽/线帽/视觉重心，略带手绘不对称
 */
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 15 }
});

const SW = 1.75;
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g
      stroke="currentColor"
      :stroke-width="SW"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    >
      <!-- 向日葵 -->
      <template v-if="name === 'sunflower'">
        <circle cx="12" cy="12.2" r="2.6" fill="currentColor" fill-opacity="0.2" stroke="none" />
        <path d="M12 3.8c.35 1.9-.55 3.1-1.85 3.85" />
        <path d="M12 3.8c-.4 1.85.6 3.15 1.9 3.85" />
        <path d="M19.4 8.6c-1.7.55-2.95.05-3.85-1.1" />
        <path d="M19.4 8.6c-1.35-1.15-1.85-2.5-1.55-3.85" />
        <path d="M19.55 15.5c-1.7-.55-2.9.05-3.75 1.2" />
        <path d="M19.55 15.5c-1.25 1.2-1.7 2.6-1.35 3.95" />
        <path d="M12 20.4c.4-1.85-.55-3.1-1.85-3.85" />
        <path d="M12 20.4c-.35-1.9.6-3.15 1.95-3.85" />
        <path d="M4.5 15.5c1.7-.5 2.95.1 3.85 1.2" />
        <path d="M4.5 15.5c1.3 1.15 1.8 2.55 1.45 3.9" />
        <path d="M4.45 8.55c1.7.6 2.95.1 3.9-1.05" />
        <path d="M4.45 8.55c1.35-1.2 1.85-2.55 1.5-3.9" />
        <circle cx="12" cy="12.2" r="2.35" />
      </template>

      <!-- 添加 -->
      <template v-else-if="name === 'plus'">
        <path d="M12.05 5.1v13.7M5.2 12.05h13.6" />
      </template>

      <!-- 克隆 -->
      <template v-else-if="name === 'clone'">
        <path d="M12.05 4.4v10.4" />
        <path d="M8.1 11.35l3.95 4.05 4.05-4.1" />
        <path d="M5.15 18.85h13.7" />
      </template>

      <!-- 刷新 -->
      <template v-else-if="name === 'refresh'">
        <path d="M19.15 12.1a7.15 7.15 0 1 1-2.35-5.35" />
        <path d="M19.2 4.55v4.85h-4.7" />
      </template>

      <!-- 设置：简洁齿轮 -->
      <template v-else-if="name === 'settings'">
        <circle cx="12" cy="12" r="2.45" />
        <path d="M12 3.45v2.35M12 18.2v2.35M3.45 12h2.35M18.2 12h2.35" />
        <path d="M6.05 6.05l1.65 1.65M16.3 16.3l1.65 1.65M17.95 6.05l-1.65 1.65M7.7 16.3l-1.65 1.65" />
      </template>

      <!-- 同步 -->
      <template v-else-if="name === 'sync'">
        <path d="M9.35 8.15H7.2a3.55 3.55 0 0 0 0 7.1h2.05" />
        <path d="M14.65 8.15h2.15a3.55 3.55 0 0 1 0 7.1h-2.05" />
        <path d="M9.05 12.05h5.95" />
      </template>

      <!-- 批量 -->
      <template v-else-if="name === 'batch'">
        <path d="M7.05 8.55h11.15v9.55H7.05z" />
        <path d="M5.25 6.25h11.15v1.7" />
        <path d="M9.25 11.55h6.55M9.25 14.45h4.7" />
      </template>

      <!-- 更新 -->
      <template v-else-if="name === 'update'">
        <path d="M12.05 19.1V6.2" />
        <path d="M7.55 10.55l4.5-4.55 4.55 4.55" />
      </template>

      <!-- 删除 -->
      <template v-else-if="name === 'trash'">
        <path d="M5.25 7.15h13.5" />
        <path d="M9 7V5.35h6v1.65" />
        <path d="M7.2 7.15l.85 11.2h7.9l.85-11.2" />
        <path d="M10.15 10.4v5.2M13.85 10.4v5.2" />
      </template>

      <!-- 帮助 -->
      <template v-else-if="name === 'help'">
        <circle cx="12" cy="12" r="8.05" />
        <path d="M9.55 9.35a2.55 2.55 0 1 1 3.55 2.35c-.85.4-1.35 1.05-1.35 2" />
        <path d="M12 16.55v.35" />
      </template>

      <!-- 月亮 -->
      <template v-else-if="name === 'moon'">
        <path d="M16.9 14.75A6.45 6.45 0 0 1 9.15 7.05 6.7 6.7 0 1 0 16.9 14.75Z" />
      </template>

      <!-- 太阳 -->
      <template v-else-if="name === 'sun'">
        <circle cx="12" cy="12" r="3.25" />
        <path d="M12 3.7v1.7M12 18.6v1.7M3.7 12h1.7M18.6 12h1.7" />
        <path d="M6.15 6.15l1.2 1.2M16.65 16.65l1.2 1.2M17.85 6.15l-1.2 1.2M7.35 16.65l-1.2 1.2" />
      </template>

      <!-- 关闭 -->
      <template v-else-if="name === 'close'">
        <path d="M7.15 7.15 16.85 16.85M16.85 7.15 7.15 16.85" />
      </template>

      <!-- 文件新增 -->
      <template v-else-if="name === 'file-add'">
        <path d="M7.85 4.65h5.35l3.85 3.85v10.85H7.85z" />
        <path d="M13.15 4.75v3.7h3.65" />
        <path d="M10.15 13.15h5.45M12.9 10.4v5.5" />
      </template>

      <!-- 文件修改 -->
      <template v-else-if="name === 'file-edit'">
        <path d="M7.2 16.85 15.85 8.15l2.1 2.05-8.65 8.7H7.2z" />
        <path d="M14.55 9.35l2.05 2.05" />
        <path d="M5.4 20.25h13.2" />
      </template>

      <!-- 文件删除 -->
      <template v-else-if="name === 'file-del'">
        <path d="M7.85 4.65h5.35l3.85 3.85v10.85H7.85z" />
        <path d="M13.15 4.75v3.7h3.65" />
        <path d="M10 13.55h5.7" />
      </template>

      <!-- 文件重命名 -->
      <template v-else-if="name === 'file-ren'">
        <path d="M5.25 8.35h5.35v7.3H5.25z" />
        <path d="M13.4 8.35h5.35v7.3H13.4z" />
        <path d="M10.75 12h2.5" />
        <path d="M9.55 10.55 11.2 12l-1.65 1.45M14.45 10.55 12.8 12l1.65 1.45" />
      </template>

      <!-- 普通文件 -->
      <template v-else-if="name === 'file'">
        <path d="M7.85 4.65h5.35l3.85 3.85v10.85H7.85z" />
        <path d="M13.15 4.75v3.7h3.65" />
        <path d="M10.15 12.2h5.45M10.15 15.05h3.9" />
      </template>

      <!-- 成功 -->
      <template v-else-if="name === 'check'">
        <path d="M5.25 12.35 9.85 16.75 18.75 7.5" />
      </template>

      <!-- 星芒 -->
      <template v-else-if="name === 'spark'">
        <path d="M12 3.55 13.45 9.15 19.1 10.4 13.45 11.75 12 17.4 10.55 11.75 4.9 10.4 10.55 9.15Z" />
        <path d="M18.45 4.7v2.25M19.55 5.85h-2.2M5.55 16.85v2.15M6.65 17.9H4.5" />
      </template>

      <!-- fallback -->
      <template v-else>
        <circle cx="12" cy="12" r="7.4" />
        <path d="M12 8.15v4.15M12 15.55v.4" />
      </template>
    </g>
  </svg>
</template>
