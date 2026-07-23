// SPDX-License-Identifier: Apache-2.0
import { colors } from './src/tokens/colors.js';
import { sizes as fontSizes, fontFamily } from './src/tokens/typography.js';
import { spacing } from './src/tokens/spacing.js';
import { radii } from './src/tokens/radii.js';
import { shadows } from './src/tokens/shadows.js';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,jsx}'
    ],
    theme: {
        extend: {
            colors: {
                brand: colors.primary,
                neutral: colors.neutral,
                success: colors.semantic.success,
                error: colors.semantic.error,
                warning: colors.semantic.warning,
                info: colors.semantic.info
            },
            fontFamily: {
                sans: [fontFamily]
            },
            fontSize: Object.fromEntries(
                Object.entries(fontSizes).map(([k, v]) => [k, [v.size, { lineHeight: v.lineHeight }]])
            ),
            spacing,
            borderRadius: radii,
            boxShadow: shadows
        }
    },
    plugins: []
};
