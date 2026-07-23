// SPDX-License-Identifier: Apache-2.0
// Design Tokens: Typography — system font stack, type scale.

export const fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const sizes = {
    xs: { size: '0.75rem', lineHeight: '1rem' },
    sm: { size: '0.875rem', lineHeight: '1.25rem' },
    base: { size: '1rem', lineHeight: '1.5rem' },
    lg: { size: '1.125rem', lineHeight: '1.75rem' },
    xl: { size: '1.25rem', lineHeight: '1.75rem' },
    '2xl': { size: '1.5rem', lineHeight: '2rem' }
};

export const weights = {
    normal: '400',
    medium: '500',
    semibold: '600'
};

export const typography = { fontFamily, sizes, weights };
