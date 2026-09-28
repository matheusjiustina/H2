/** Top HUD: brand, harvest counter, vault button + bottom hint/disclaimer. */
export function createHud({ onVault }) {
  const hud = document.getElementById('hud');
  const value = document.getElementById('counterValue');
  const vaultBtn = document.getElementById('vaultBtn');
  const hint = document.getElementById('hint');
  const disclaimer = document.querySelector('.disclaimer');

  vaultBtn.addEventListener('click', () => onVault());

  return {
    show() {
      hud.classList.add('on');
      disclaimer.classList.add('on');
    },
    setCount(n, { bump = false, color } = {}) {
      value.textContent = String(n);
      if (bump) {
        if (color) value.style.setProperty('--bump', color);
        value.classList.remove('bump');
        void value.offsetWidth; // restart animation
        value.classList.add('bump');
        vaultBtn.classList.remove('ping');
        void vaultBtn.offsetWidth;
        vaultBtn.classList.add('ping');
      }
    },
    hint(text) {
      if (text) {
        hint.textContent = text;
        hint.classList.add('on');
      } else hint.classList.remove('on');
    },
  };
}
