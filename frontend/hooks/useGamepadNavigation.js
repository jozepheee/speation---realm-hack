import { useEffect, useState } from 'react';

export default function useGamepadNavigation(enabled, root) {
  const [status, setStatus] = useState('Controller navigation is off');
  useEffect(() => {
    if (!enabled) { setStatus('Controller navigation is off'); return; }
    if (!navigator.getGamepads) { setStatus('This browser does not expose gamepad input'); return; }
    let frame, previousA = false, lastMove = 0, stopped = false, lastStatus = '';
    function poll(now) {
      if (stopped) return;
      let pad;
      try { pad = [...navigator.getGamepads()].find(item => item?.connected && item.mapping === 'standard'); }
      catch { setStatus('Controller access is unavailable in this browser context'); return; }
      const nextStatus = pad ? 'Controller connected · arrows/stick to move · A to select' : 'Connect a standard controller and press a button';
      if (nextStatus !== lastStatus) { setStatus(nextStatus); lastStatus = nextStatus; }
      if (pad && document.visibilityState === 'visible' && root.current) {
        const buttons = [...root.current.querySelectorAll('button:not(:disabled), a[href]')]
          .filter(element => element.getClientRects().length && !element.closest('[hidden], [inert]'));
        let current = buttons.indexOf(document.activeElement);
        const direction = pad.buttons[13]?.pressed || pad.buttons[15]?.pressed || pad.axes[0] > .65 || pad.axes[1] > .65 ? 1
          : pad.buttons[12]?.pressed || pad.buttons[14]?.pressed || pad.axes[0] < -.65 || pad.axes[1] < -.65 ? -1 : 0;
        if (direction && now - lastMove > 220 && buttons.length) {
          const index = current < 0 ? 0 : (current + direction + buttons.length) % buttons.length;
          buttons[index].focus({ preventScroll: true }); buttons[index].scrollIntoView({ block: 'nearest' }); lastMove = now; current = index;
        }
        const a = !!pad.buttons[0]?.pressed;
        if (a && !previousA && current >= 0) buttons[current].click();
        previousA = a;
      } else previousA = false;
      frame = requestAnimationFrame(poll);
    }
    frame = requestAnimationFrame(poll);
    return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [enabled, root]);
  return status;
}
