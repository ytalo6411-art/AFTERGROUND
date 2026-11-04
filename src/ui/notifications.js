export class NotificationCenter {
  constructor(container) {
    this.container = container;
  }

  push(message, type = 'info', durationMs = 4200) {
    if (!this.container || typeof document === 'undefined') return;
    const item = document.createElement('div');
    item.className = `ag-toast ag-toast-${type}`;

    const badgeMap = {
      info: 'INFO',
      success: 'OK',
      warning: 'ALERTA',
      achievement: 'CONQUISTA'
    };

    item.innerHTML = `
      <span class="ag-toast-badge">${badgeMap[type] || 'INFO'}</span>
      <span class="ag-toast-text">${message}</span>
    `;

    this.container.appendChild(item);

    // Keep max 5 visible toasts
    while (this.container.children.length > 5) {
      this.container.removeChild(this.container.firstChild);
    }

    setTimeout(() => {
      item.classList.add('ag-toast-hide');
      setTimeout(() => {
        if (item.parentNode === this.container) {
          this.container.removeChild(item);
        }
      }, 280);
    }, durationMs);
  }
}
