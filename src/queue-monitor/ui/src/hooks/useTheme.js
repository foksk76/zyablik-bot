// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from 'react';

export function useTheme() {
    const [theme, setTheme] = useState(() => {
        if (typeof document === 'undefined') return 'light';
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });

    useEffect(() => {
        const root = document.documentElement;
        const observer = new MutationObserver(() => {
            setTheme(root.classList.contains('dark') ? 'dark' : 'light');
        });
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return theme;
}
