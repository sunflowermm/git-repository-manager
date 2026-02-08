// 加载 .env 文件并执行 electron-builder
require('dotenv').config();
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const command = ['electron-builder', ...args];

// 确保 GH_TOKEN 已设置
if (!process.env.GH_TOKEN) {
  console.error('❌ 错误：未找到 GH_TOKEN 环境变量');
  console.error('请确保 .env 文件中已配置 GH_TOKEN');
  process.exit(1);
}

console.log('✅ 已加载 GH_TOKEN');
console.log(`📦 开始构建并发布...\n`);

const builder = spawn('npx', command, {
  stdio: 'inherit',
  shell: true
});

builder.on('close', (code) => {
  process.exit(code);
});
