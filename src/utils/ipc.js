/**
 * Electron IPC 使用 structuredClone，无法克隆 Vue Proxy。
 * 发送前转成纯 JSON 可序列化数据。
 */
export function cloneForIpc(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    throw new Error(`IPC 参数无法序列化: ${e.message}`);
  }
}

export function invoke(channel, ...args) {
  if (!window.api?.invoke) {
    return Promise.reject(new Error('IPC bridge unavailable'));
  }
  const safeArgs = args.map((arg) => cloneForIpc(arg));
  return window.api.invoke(channel, ...safeArgs);
}

export function on(channel, listener) {
  if (!window.api?.on) return () => {};
  return window.api.on(channel, listener);
}
