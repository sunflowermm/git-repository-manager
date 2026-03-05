/**
 * 多平台发布配置（统一底层）
 * 原则：从哪安装则从哪检查更新，各平台发行版独立。
 * 环境变量：GH_TOKEN / GITEE_TOKEN / GITCODE_TOKEN
 */
const path = require('path');
const { readFileSync } = require('fs');

const { version } = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
);

const REPO = 'git-repository-manager';

const PLATFORMS = {
  github: {
    key: 'github',
    name: 'GitHub',
    envToken: 'GH_TOKEN',
    apiType: 'github',
    owner: 'sunflowermm',
    repo: REPO,
    publishConfig: {
      provider: 'github',
      owner: 'sunflowermm',
      repo: REPO,
      releaseType: 'release',
      publishAutoUpdate: true
    },
    releaseTag: `v${version}`,
    releaseRef: 'main',
    releasesUrl: `https://github.com/sunflowermm/${REPO}/releases`
  },
  gitee: {
    key: 'gitee',
    name: 'Gitee',
    envToken: 'GITEE_TOKEN',
    apiType: 'gitee',
    apiBase: 'https://gitee.com/api/v5',
    owner: 'xrkseek',
    repo: REPO,
    publishConfig: {
      provider: 'generic',
      url: `https://gitee.com/xrkseek/${REPO}/releases/download/latest/`,
      publishAutoUpdate: true
    },
    releaseTag: `v${version}`,
    releaseRef: 'master',
    releasesUrl: `https://gitee.com/xrkseek/${REPO}/releases`
  },
  gitcode: {
    key: 'gitcode',
    name: 'GitCode',
    envToken: 'GITCODE_TOKEN',
    apiType: 'gitcode',
    apiBase: 'https://api.gitcode.com/api/v5',
    owner: 'Xrkseek',
    repo: REPO,
    publishConfig: {
      provider: 'generic',
      url: `https://gitcode.com/Xrkseek/${REPO}/-/releases/permalink/latest/downloads/`,
      publishAutoUpdate: true
    },
    releaseTag: `v${version}`,
    releaseRef: 'main',
    releasesUrl: `https://gitcode.com/Xrkseek/${REPO}/-/releases`
  }
};

function getVersion() {
  return version;
}

function getPlatformsWithToken(env = process.env) {
  return Object.values(PLATFORMS)
    .filter((platform) => !!env[platform.envToken]);
}

function getPublishConfig(platformKey) {
  const p = PLATFORMS[platformKey];
  return p ? p.publishConfig : null;
}

module.exports = {
  version: getVersion(),
  PLATFORMS,
  getVersion,
  getPlatformsWithToken,
  getPublishConfig
};
