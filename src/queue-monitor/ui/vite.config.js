// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ADR-0034: Vite dev server на 5173, проксирует /api → queue-monitor (9000).
// В проде собранный dist/ раздаётся самим queue-monitor HTTP-сервером.
export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:9000',
                changeOrigin: true
            },
            '/readyz': {
                target: 'http://localhost:9000',
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: false
    }
});
