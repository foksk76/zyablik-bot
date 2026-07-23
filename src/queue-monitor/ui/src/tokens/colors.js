// SPDX-License-Identifier: Apache-2.0
// Design Tokens: Colors — Brand Book primary + neutral + semantic palettes.

export const primary = {
    50: '#f0f9ff',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1'
};

export const neutral = {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b'
};

export const semantic = {
    success: { light: '#d1fae5', DEFAULT: '#10b981', dark: '#047857' },
    error: { light: '#ffe4e6', DEFAULT: '#f43f5e', dark: '#be123c' },
    warning: { light: '#fef3c7', DEFAULT: '#f59e0b', dark: '#b45309' },
    info: { light: '#dbeafe', DEFAULT: '#3b82f6', dark: '#1d4ed8' }
};

export const colors = { primary, neutral, semantic };
