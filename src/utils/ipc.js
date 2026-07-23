export function invoke(channel, ...args) {
  if (!window.api?.invoke) {
    return Promise.reject(new Error('IPC bridge unavailable'));
  }
  return window.api.invoke(channel, ...args);
}

export function on(channel, listener) {
  if (!window.api?.on) return () => {};
  return window.api.on(channel, listener);
}
