import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';

let notyf;

function getNotyf() {
  if (!notyf) {
    notyf = new Notyf({
      duration: 3200,
      dismissible: true,
      position: { x: 'right', y: 'top' },
      types: [
        { type: 'success', background: 'var(--success)', icon: false },
        { type: 'error', background: 'var(--danger)', duration: 5200, icon: false },
        { type: 'warning', background: 'var(--warning)', icon: false },
        { type: 'info', background: 'var(--info)', icon: false }
      ]
    });
  }
  return notyf;
}

export function useToast() {
  function showMessage(message, type = 'info') {
    const text = String(message || '');
    if (!text) return;
    const n = getNotyf();
    if (type === 'success') n.success(text);
    else if (type === 'error') n.error(text);
    else n.open({ type, message: text });
  }
  return { showMessage };
}
