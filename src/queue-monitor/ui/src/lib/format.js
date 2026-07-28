// SPDX-License-Identifier: Apache-2.0

export const STATUS_VARIANTS = {
    delivered: 'bg-success-light text-success-dark border border-success/20',
    failed: 'bg-error-light text-error-dark border border-error/20',
    pending: 'bg-warning-light text-warning-dark border border-warning/20',
    processing: 'bg-info-light text-info-dark border border-info/20'
};

export const STATUS_LABELS = {
    delivered: 'Delivered',
    failed: 'Failed',
    pending: 'Pending',
    processing: 'Processing'
};

export function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
}

export function parseRecipient(payload) {
    try {
        const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        return obj?.recipient?.value || '—';
    } catch {
        return '—';
    }
}
