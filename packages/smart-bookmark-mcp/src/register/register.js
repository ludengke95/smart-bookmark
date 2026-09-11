/**
 * Smart Bookmark Native Messaging Host Cross-Platform Registrar
 * 自动向系统（Windows 注册表 / macOS 与 Linux 清单文件）注册 Native Messaging 宿主配置，
 * 同时支持 Google Chrome 与 Microsoft Edge。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_HOST_NAME = 'com.smartbookmark.mcp';
export const DEFAULT_EXTENSION_ID = 'gobioihpdadhghfbefcnobinbfadmpli'; // 本地开发与 GitHub 离线安装包 ID
export const EDGE_STORE_EXTENSION_ID = 'dpjfdgipdhdoilkgklolanpdpnkbabia'; // Edge 商店已上架正式版 ID

export const DEFAULT_EXTENSION_IDS = [
  DEFAULT_EXTENSION_ID,
  EDGE_STORE_EXTENSION_ID
];
/**
 * 获取或生成 Native Host 清单配置与启动脚本
 */
export function prepareHostFiles(options = {}) {
  const extensionIds = options.extensionIds || DEFAULT_EXTENSION_IDS;
  const targetDir = path.resolve(__dirname, '../../');
  const binPath = path.resolve(targetDir, 'bin/smart-bookmark-mcp.js');

  const allowedOrigins = extensionIds.map(id => `chrome-extension://${id}/`);

  const isWindows = process.platform === 'win32';
  let hostExecutablePath = binPath;

  if (isWindows) {
    // Windows 下 Chrome 必须通过 .bat / .cmd 启动 Node 脚本
    const batPath = path.resolve(targetDir, 'smart-bookmark-host.bat');
    const batContent = `@echo off\r\nnode "${binPath}" native\r\n`;
    fs.writeFileSync(batPath, batContent, 'utf8');
    hostExecutablePath = batPath;
  } else {
    // macOS / Linux 下生成具备执行权限的 sh 包装脚本
    const shPath = path.resolve(targetDir, 'smart-bookmark-host.sh');
    const shContent = `#!/bin/bash\nexec node "${binPath}" native\n`;
    fs.writeFileSync(shPath, shContent, { encoding: 'utf8', mode: 0o755 });
    hostExecutablePath = shPath;
  }

  const manifest = {
    name: DEFAULT_HOST_NAME,
    description: 'Smart Bookmark Native Messaging MCP Host',
    path: hostExecutablePath,
    type: 'stdio',
    allowed_origins: allowedOrigins
  };

  const manifestPath = path.resolve(targetDir, 'native-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    manifestPath,
    hostExecutablePath,
    manifest
  };
}

/**
 * 注册到系统
 */
export async function registerNativeHost(options = {}) {
  const { manifestPath } = prepareHostFiles(options);
  const platform = process.platform;
  const results = [];

  if (platform === 'win32') {
    // Windows: 写入 HKCU 注册表（无需管理员权限）
    const targets = [
      {
        name: 'Google Chrome',
        key: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${DEFAULT_HOST_NAME}`
      },
      {
        name: 'Microsoft Edge',
        key: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${DEFAULT_HOST_NAME}`
      }
    ];

    for (const target of targets) {
      try {
        const cmd = `reg add "${target.key}" /ve /t REG_SZ /d "${manifestPath}" /f`;
        execSync(cmd, { stdio: 'pipe' });
        results.push({ browser: target.name, success: true, path: target.key });
      } catch (err) {
        results.push({ browser: target.name, success: false, error: err.message });
      }
    }
  } else if (platform === 'darwin') {
    // macOS: 写入用户 Library 目录
    const home = os.homedir();
    const targets = [
      {
        name: 'Google Chrome',
        dir: path.join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts')
      },
      {
        name: 'Microsoft Edge',
        dir: path.join(home, 'Library/Application Support/Microsoft Edge/NativeMessagingHosts')
      }
    ];

    for (const target of targets) {
      try {
        fs.mkdirSync(target.dir, { recursive: true });
        const dest = path.join(target.dir, `${DEFAULT_HOST_NAME}.json`);
        fs.copyFileSync(manifestPath, dest);
        results.push({ browser: target.name, success: true, path: dest });
      } catch (err) {
        results.push({ browser: target.name, success: false, error: err.message });
      }
    }
  } else {
    // Linux
    const home = os.homedir();
    const targets = [
      {
        name: 'Google Chrome',
        dir: path.join(home, '.config/google-chrome/NativeMessagingHosts')
      },
      {
        name: 'Chromium',
        dir: path.join(home, '.config/chromium/NativeMessagingHosts')
      },
      {
        name: 'Microsoft Edge',
        dir: path.join(home, '.config/microsoft-edge/NativeMessagingHosts')
      }
    ];

    for (const target of targets) {
      try {
        fs.mkdirSync(target.dir, { recursive: true });
        const dest = path.join(target.dir, `${DEFAULT_HOST_NAME}.json`);
        fs.copyFileSync(manifestPath, dest);
        results.push({ browser: target.name, success: true, path: dest });
      } catch (err) {
        results.push({ browser: target.name, success: false, error: err.message });
      }
    }
  }

  return {
    manifestPath,
    results
  };
}

/**
 * 从系统注销
 */
export async function unregisterNativeHost() {
  const platform = process.platform;
  const results = [];

  if (platform === 'win32') {
    const targets = [
      {
        name: 'Google Chrome',
        key: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${DEFAULT_HOST_NAME}`
      },
      {
        name: 'Microsoft Edge',
        key: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${DEFAULT_HOST_NAME}`
      }
    ];

    for (const target of targets) {
      try {
        execSync(`reg delete "${target.key}" /f`, { stdio: 'pipe' });
        results.push({ browser: target.name, success: true });
      } catch (err) {
        results.push({ browser: target.name, success: false, error: err.message });
      }
    }
  } else if (platform === 'darwin') {
    const home = os.homedir();
    const targets = [
      path.join(home, `Library/Application Support/Google/Chrome/NativeMessagingHosts/${DEFAULT_HOST_NAME}.json`),
      path.join(home, `Library/Application Support/Microsoft Edge/NativeMessagingHosts/${DEFAULT_HOST_NAME}.json`)
    ];
    for (const file of targets) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          results.push({ path: file, success: true });
        } catch (e) {
          results.push({ path: file, success: false, error: e.message });
        }
      }
    }
  } else {
    const home = os.homedir();
    const targets = [
      path.join(home, `.config/google-chrome/NativeMessagingHosts/${DEFAULT_HOST_NAME}.json`),
      path.join(home, `.config/chromium/NativeMessagingHosts/${DEFAULT_HOST_NAME}.json`),
      path.join(home, `.config/microsoft-edge/NativeMessagingHosts/${DEFAULT_HOST_NAME}.json`)
    ];
    for (const file of targets) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          results.push({ path: file, success: true });
        } catch (e) {
          results.push({ path: file, success: false, error: e.message });
        }
      }
    }
  }

  return results;
}
