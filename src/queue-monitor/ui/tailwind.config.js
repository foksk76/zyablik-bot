// SPDX-License-Identifier: Apache-2.0
import { colors } from './src/tokens/colors.js';
import { sizes as fontSizes, fontFamily, weights as fontWeights } from './src/tokens/typography.js';
import { spacing } from './src/tokens/spacing.js';
import { radii } from './src/tokens/radii.js';
import { shadows } from './src/tokens/shadows.js';

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        './index.html',
        './src/**/*.{js,jsx}'
    ],
    theme: {
        extend: {
            colors: {
                /* shadcn/ui CSS variable-based colors */
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))'
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))'
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                },

                /* Semantic colors (CSS variable-based) */
                success: {
                    DEFAULT: 'hsl(var(--success))',
                    light: 'hsl(var(--success-light))',
                    dark: 'hsl(var(--success-dark))',
                    foreground: 'hsl(var(--success-foreground))'
                },
                error: {
                    DEFAULT: 'hsl(var(--error))',
                    light: 'hsl(var(--error-light))',
                    dark: 'hsl(var(--error-dark))',
                    foreground: 'hsl(var(--error-foreground))'
                },
                warning: {
                    DEFAULT: 'hsl(var(--warning))',
                    light: 'hsl(var(--warning-light))',
                    dark: 'hsl(var(--warning-dark))',
                    foreground: 'hsl(var(--warning-foreground))'
                },
                info: {
                    DEFAULT: 'hsl(var(--info))',
                    light: 'hsl(var(--info-light))',
                    dark: 'hsl(var(--info-dark))',
                    foreground: 'hsl(var(--info-foreground))'
                },

                /* Token-based colors (backward compatibility) */
                brand: colors.primary,
                neutral: colors.neutral
            },
            fontFamily: {
                sans: [fontFamily]
            },
            fontWeight: fontWeights,
            fontSize: Object.fromEntries(
                Object.entries(fontSizes).map(([k, v]) => [k, [v.size, { lineHeight: v.lineHeight }]])
            ),
            spacing,
            borderRadius: {
                full: radii.full,
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            boxShadow: shadows
        }
    },
    plugins: []
};
