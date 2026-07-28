// SPDX-License-Identifier: Apache-2.0
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button.jsx';
import { RefreshCw, ChevronDown } from 'lucide-react';

const REFRESH_OPTIONS = [
    { label: '30с', ms: 30000 },
    { label: '1 мин', ms: 60000 },
    { label: '5 мин', ms: 300000 },
    { label: '10 мин', ms: 600000 },
    { label: '30 мин', ms: 1800000 },
    { label: 'Выкл', ms: 0 }
];

export default function RefreshButton({ refreshMs, countdown, onRefresh, onIntervalChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const current = REFRESH_OPTIONS.find((o) => o.ms === refreshMs) || REFRESH_OPTIONS[0];

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative inline-flex" ref={ref}>
            <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="rounded-r-none border-r border-border/40"
            >
                <RefreshCw className="w-4 h-4 mr-1 shrink-0" />
                {refreshMs > 0 ? `обновить (${countdown}с)` : 'обновить'}
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="px-1.5"
                onClick={() => setOpen((prev) => !prev)}
            >
                <ChevronDown className="w-3 h-3 shrink-0" />
            </Button>
            {open && (
                <div className="absolute top-full right-0 mt-1 bg-background border rounded-md shadow-md z-50 min-w-[80px]">
                    {REFRESH_OPTIONS.map((opt) => (
                        <button
                            key={opt.ms}
                            className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                                opt.ms === refreshMs ? 'bg-accent font-medium' : ''
                            }`}
                            onClick={() => {
                                onIntervalChange(opt.ms);
                                setOpen(false);
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
