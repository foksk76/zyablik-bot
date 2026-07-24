// SPDX-License-Identifier: Apache-2.0
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button.jsx';
import { ChevronDown } from 'lucide-react';

// ADR-0041: предустановленные диапазоны времени для глобального фильтра.
const PRESETS = [
    { label: '1ч', seconds: 3600 },
    { label: '6ч', seconds: 21600 },
    { label: '12ч', seconds: 43200 },
    { label: '24ч', seconds: 86400 },
    { label: '3 дня', seconds: 259200 },
    { label: '7 дней', seconds: 604800 },
    { label: '30 дней', seconds: 2592000 }
];

// ADR-0041: выпадающий список для выбора временного диапазона.
export default function TimeRangeDropdown({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const current = PRESETS.find((p) => p.seconds === value) || PRESETS[3];

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
        <div className="relative" ref={ref}>
            <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setOpen((prev) => !prev)}
            >
                {current.label}
                <ChevronDown className="w-3 h-3 ml-1 shrink-0" />
            </Button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-md z-50 min-w-[80px]">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.seconds}
                            className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                                preset.seconds === value ? 'bg-accent font-medium' : ''
                            }`}
                            onClick={() => {
                                onChange(preset.seconds);
                                setOpen(false);
                            }}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
