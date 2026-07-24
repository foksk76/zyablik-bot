// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button.jsx';
import { Sun, Moon } from 'lucide-react';

function getInitialTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

export default function ThemeToggle() {
    const [theme, setTheme] = useState(() => {
        applyTheme(getInitialTheme());
        return getInitialTheme();
    });

    useEffect(() => {
        applyTheme(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        function onChange(e) {
            if (!localStorage.getItem('theme')) {
                setTheme(e.matches ? 'dark' : 'light');
            }
        }
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    function toggle() {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }

    return (
        <Button variant="ghost" size="icon" onClick={toggle} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
            ) : (
                <Moon className="w-4 h-4" />
            )}
        </Button>
    );
}
