/**
 * Opening sequence: dark screen → STOCK GARDEN → GROW YOUR CONVICTION.
 * Resolves when the overlay starts fading (the scene takes over from there).
 * Tapping skips ahead.
 */
export function playIntro({ hold = 2600 } = {}) {
  const el = document.getElementById('intro');
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 1200);
      resolve();
    };
    const timer = setTimeout(finish, hold);
    el.addEventListener(
      'pointerdown',
      () => {
        clearTimeout(timer);
        finish();
      },
      { once: true },
    );
  });
}
