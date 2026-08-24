/**
 * Loads a third-party script with a hard timeout.
 *
 * Portal SDKs are served from CDNs that ad blockers routinely null-route. A
 * plain `onerror` handler is not enough — a blocked request can hang rather
 * than fail, and a game stuck behind `await sdkLoad()` shows the player a dead
 * loading screen. That is a rejection, and worse, it is a rejection that only
 * reproduces on machines with an ad blocker.
 *
 * So: always resolve or reject within `timeoutMs`, and let callers degrade.
 */
export function loadScript(src: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.ucgamesLoaded === 'true') {
      resolve();
      return;
    }

    const script = existing ?? document.createElement('script');
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Timed out after ${timeoutMs}ms loading ${src}`));
    }, timeoutMs);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (error) reject(error);
      else {
        script.dataset.ucgamesLoaded = 'true';
        resolve();
      }
    };

    script.addEventListener('load', () => finish());
    script.addEventListener('error', () =>
      finish(new Error(`Failed to load ${src} (blocked or offline)`)),
    );

    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}
