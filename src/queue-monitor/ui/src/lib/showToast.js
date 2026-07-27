// SPDX-License-Identifier: Apache-2.0

let container = null;

function getContainer() {
    if (!container) {
        container = document.createElement('div');
        container.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }
    return container;
}

const STYLES = {
    success: 'bg-success-light border border-success/20 text-success-dark',
    error: 'bg-error-light border border-error/20 text-error-dark',
    info: 'bg-accent border border-border text-foreground'
};

export function showToast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `px-4 py-2 rounded-lg shadow-lg text-sm pointer-events-auto animate-in fade-in slide-in-from-top-2 ${STYLES[type] || STYLES.info}`;
    el.textContent = message;
    getContainer().appendChild(el);

    const timeout = type === 'error' ? 6000 : 4000;
    setTimeout(() => {
        el.classList.add('animate-out', 'fade-out');
        setTimeout(() => el.remove(), 300);
    }, timeout);
}
