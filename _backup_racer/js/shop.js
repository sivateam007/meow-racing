// js/shop.js
// Meow Racing — Shop UI/logic for buying and equipping car skins.
// Renders skin cards into a provided container; handles purchase via Storage;
// notifies the game when a skin is selected so the car can update live.

import { SKINS } from './config.js';
import { Storage } from './storage.js';

export class Shop {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onSelectSkin = typeof options.onSelectSkin === 'function' ? options.onSelectSkin : () => {};
    this.onClose = typeof options.onClose === 'function' ? options.onClose : () => {};
    this.onWalletChange = typeof options.onWalletChange === 'function' ? options.onWalletChange : () => {};

    this.selectedSkinId = Storage.getSelectedSkinId();
    this._cardEls = {};

    if (this.container) {
      this._build();
    }
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  _build() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'shop-wrapper';

    const header = document.createElement('div');
    header.className = 'shop-header';
    header.innerHTML = `<h3 class="shop-title">CARS &amp; SKINS</h3>`;
    wrapper.appendChild(header);

    const walletBar = document.createElement('div');
    walletBar.className = 'shop-wallet';
    walletBar.innerHTML = `
      <div class="shop-wallet-item">
        <span class="counter-icon coin-icon">&#9679;</span>
        <span id="shop-coin-balance" class="shop-wallet-value">0</span>
      </div>
      <div class="shop-wallet-item">
        <span class="counter-icon crown-icon">&#9818;</span>
        <span id="shop-crown-balance" class="shop-wallet-value">0</span>
      </div>
    `;
    wrapper.appendChild(walletBar);

    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    wrapper.appendChild(grid);

    for (const skin of SKINS) {
      const card = this._makeCard(skin);
      grid.appendChild(card);
      this._cardEls[skin.id] = card;
    }

    const footer = document.createElement('div');
    footer.className = 'shop-footer';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'primary-button shop-close-btn';
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
    footer.appendChild(closeBtn);
    wrapper.appendChild(footer);

    this.container.appendChild(wrapper);

    this._refreshWalletDisplay();
    this._refreshCardStates();
  }

  _makeCard(skin) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'shop-card';
    card.dataset.skinId = skin.id;
    card.style.setProperty('--swatch', '#' + (skin.body & 0xffffff).toString(16).padStart(6, '0'));
    card.style.setProperty('--swatch-accent', '#' + (skin.accent & 0xffffff).toString(16).padStart(6, '0'));

    const swatch = document.createElement('div');
    swatch.className = 'shop-swatch';
    card.appendChild(swatch);

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-card-name';
    nameEl.textContent = skin.name;
    card.appendChild(nameEl);

    const priceEl = document.createElement('div');
    priceEl.className = 'shop-card-price';
    if (skin.price === 0) {
      priceEl.textContent = 'FREE';
      priceEl.classList.add('free');
    } else {
      priceEl.innerHTML = `<span class="shop-price-icon">&#9679;</span>${skin.price}`;
    }
    card.appendChild(priceEl);

    const badge = document.createElement('div');
    badge.className = 'shop-card-badge';
    card.appendChild(badge);

    card.addEventListener('click', () => this._handleCardClick(skin));

    return card;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  _refreshWalletDisplay() {
    const wallet = Storage.getWallet();
    const coinEl = this.container ? this.container.querySelector('#shop-coin-balance') : null;
    const crownEl = this.container ? this.container.querySelector('#shop-crown-balance') : null;
    if (coinEl) coinEl.textContent = wallet.coins.toLocaleString();
    if (crownEl) crownEl.textContent = wallet.crowns.toLocaleString();
  }

  _refreshCardStates() {
    const owned = Storage.getOwnedSkins();
    this.selectedSkinId = Storage.getSelectedSkinId();

    for (const skin of SKINS) {
      const card = this._cardEls[skin.id];
      if (!card) continue;

      const isOwned = owned.includes(skin.id);
      const isSelected = this.selectedSkinId === skin.id;

      card.classList.toggle('owned', isOwned);
      card.classList.toggle('selected', isSelected);
      card.classList.toggle('locked', !isOwned);

      const badge = card.querySelector('.shop-card-badge');
      if (!badge) continue;

      if (isSelected) {
        badge.textContent = 'EQUIPPED';
        badge.className = 'shop-card-badge badge-equipped';
      } else if (isOwned) {
        badge.textContent = 'TAP TO EQUIP';
        badge.className = 'shop-card-badge badge-owned';
      } else {
        const wallet = Storage.getWallet();
        const canAfford = wallet.coins >= skin.price;
        badge.textContent = canAfford ? 'TAP TO BUY' : 'LOCKED';
        badge.className = 'shop-card-badge ' + (canAfford ? 'badge-buyable' : 'badge-locked');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  _handleCardClick(skin) {
    const owned = Storage.getOwnedSkins();
    const isOwned = owned.includes(skin.id);

    if (isOwned) {
      this.select(skin.id);
      return;
    }

    // Try to buy.
    const wallet = Storage.getWallet();
    if (wallet.coins < skin.price) {
      this._flashDenied(skin.id);
      return;
    }
    const ok = Storage.spendCoins(skin.price);
    if (!ok) {
      this._flashDenied(skin.id);
      return;
    }
    Storage.ownSkin(skin.id);
    this._pulseCard(skin.id);
    this.onWalletChange(Storage.getWallet());
    this.select(skin.id);
  }

  select(skinId) {
    const owned = Storage.getOwnedSkins();
    if (!owned.includes(skinId)) return;
    Storage.setSelectedSkinId(skinId);
    this.selectedSkinId = skinId;
    this._refreshCardStates();
    this.onSelectSkin(skinId);
  }

  _flashDenied(skinId) {
    const card = this._cardEls[skinId];
    if (!card) return;
    card.classList.remove('denied');
    // Force reflow to restart animation.
    void card.offsetWidth;
    card.classList.add('denied');
    setTimeout(() => card.classList.remove('denied'), 500);
  }

  _pulseCard(skinId) {
    const card = this._cardEls[skinId];
    if (!card) return;
    card.classList.remove('just-bought');
    void card.offsetWidth;
    card.classList.add('just-bought');
    setTimeout(() => card.classList.remove('just-bought'), 700);
  }

  // ---------------------------------------------------------------------------
  // Show / hide
  // ---------------------------------------------------------------------------
  show() {
    if (!this.container) return;
    if (!this.container.firstChild) this._build();
    this._refreshWalletDisplay();
    this._refreshCardStates();
    this.container.classList.add('show');
  }

  hide() {
    if (!this.container) return;
    this.container.classList.remove('show');
  }

  isVisible() {
    return !!(this.container && this.container.classList.contains('show'));
  }

  refresh() {
    this._refreshWalletDisplay();
    this._refreshCardStates();
  }

  dispose() {
    if (this.container) {
      this.container.innerHTML = '';
      this.container.classList.remove('show');
    }
    this._cardEls = {};
  }
}

export default Shop;