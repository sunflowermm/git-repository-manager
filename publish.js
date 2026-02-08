require('dotenv').config();
const { spawn } = require('child_process');
const { readFileSync, existsSync, readdirSync } = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

if (!process.env.GH_TOKEN) {
  console.error('❌ 错误：未找到 GH_TOKEN');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
console.log('✅ 已加载 GH_TOKEN');

const historyDir = path.join(__dirname, 'history');
let releaseNotes = '';

if (existsSync(historyDir)) {
  const files = readdirSync(historyDir).filter(f => f.endsWith('.md')).sort().reverse();
  if (files.length > 0) {
    releaseNotes = readFileSync(path.join(historyDir, files[0]), 'utf-8');
    console.log(`📝 已读取更新日志: ${files[0]}\n`);
  }
}

if (!releaseNotes) {
  console.warn('⚠️  警告：未找到更新日志文件');
}

console.log(`📦 开始构建并发布 v${version}...\n`);

spawn('npx', ['electron-builder', '--win', '--publish', 'always'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN }
}).on('close', async (code) => {
  if (code === 0) {
    try {
      const octokit = new Octokit({ auth: process.env.GH_TOKEN });
      const { data: releases } = await octokit.repos.listReleases({
        owner: 'sunflowermm',
        repo: 'git-repository-manager',
        per_page: 1
      });
      
      if (releases.length > 0 && releases[0].tag_name === `v${version}`) {
        await octokit.repos.updateRelease({
          owner: 'sunflowermm',
          repo: 'git-repository-manager',
          release_id: releases[0].id,
          name: `v${version}`,
          body: releaseNotes || `## v${version}\n\n初始版本发布`
        });
        console.log('✅ 已更新 Release 标题和说明');
      }
    } catch (error) {
      console.log('⚠️  更新 Release 失败:', error.message);
    }
    console.log('\n✅ 发布完成！');
    console.log(`📦 访问：https://github.com/sunflowermm/git-repository-manager/releases`);
  }
  process.exit(code);
});
