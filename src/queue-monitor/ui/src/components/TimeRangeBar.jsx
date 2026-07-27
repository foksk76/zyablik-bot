// SPDX-License-Identifier: Apache-2.0
import React, { useState, useRef, useEffect } from 'react';
import AbsoluteRangePicker from './AbsoluteRangePicker.jsx';
import { Button } from './ui/button.jsx';
import { ChevronDown, Calendar } from 'lucide-react';

const PRESETS = [
    { label: '1ч', seconds: 3600 },
    { label: '6ч', seconds: 21600 },
    { label: '12ч', seconds: 43200 },
    { label: '24ч', seconds: 86400 },
    { label: '3 дня', seconds: 259200 },
    { label: '7 дней', seconds: 604800 },
    { label: '30 дней', seconds: 2592000 }
];

function formatAbsoluteLabel(from, to) {
    if (!from || !to) return 'Абсолютный';
    const fmt = (ts) => {
        const d = new Date(ts * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    return `${fmt(from)}–${fmt(to)}`;
}

export default function TimeRangeBar({ timeRange, onTimeRangeChange }) {
    const [open, setOpen] = useState(false);
    const [showAbsolute, setShowAbsolute] = useState(false);
    const [computedFrom, setComputedFrom] = useState(null);
    const [computedTo, setComputedTo] = useState(null);
    const ref = useRef(null);

    const isAbsolute = timeRange.mode === 'absolute';
    const buttonLabel = isAbsolute
        ? formatAbsoluteLabel(timeRange.from, timeRange.to)
        : (PRESETS.find((p) => p.seconds === timeRange.seconds) || PRESETS[3]).label;

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function handlePresetSelect(seconds) {
        setShowAbsolute(false);
        onTimeRangeChange('relative', seconds);
        setOpen(false);
    }

    function handleAbsoluteClick() {
        const now = Math.floor(Date.now() / 1000);
        const seconds = timeRange.seconds || 86400;
        setComputedFrom(now - seconds);
        setComputedTo(now);
        setShowAbsolute(true);
        setOpen(false);
    }

    function handleAbsoluteApply(from, to) {
        onTimeRangeChange('absolute', { from, to });
        setShowAbsolute(false);
    }

    function handleAbsoluteCancel() {
        setShowAbsolute(false);
    }

    return (
        <div className="space-y-2" ref={ref}>
            <div className="relative inline-flex">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => setOpen((prev) => !prev)}
                >
                    {isAbsolute && <Calendar className="w-3 h-3 mr-1 shrink-0" />}
                    {buttonLabel}
                    <ChevronDown className="w-3 h-3 ml-1 shrink-0" />
                </Button>
                {open && (
                    <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-md z-50 min-w-[120px]">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.seconds}
                                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                                    !isAbsolute && preset.seconds === timeRange.seconds ? 'bg-accent font-medium' : ''
                                }`}
                                onClick={() => handlePresetSelect(preset.seconds)}
                            >
                                {preset.label}
                            </button>
                        ))}
                        <div className="border-t my-1" />
                        <button
                            className={`flex items-center w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                                isAbsolute ? 'bg-accent font-medium' : ''
                            }`}
                            onClick={handleAbsoluteClick}
                        >
                            <Calendar className="w-3 h-3 mr-1 shrink-0" />
                            Абсолютный диапазон...
                        </button>
                    </div>
                )}
            </div>
            {showAbsolute && (
                <AbsoluteRangePicker
                    from={computedFrom}
                    to={computedTo}
                    onApply={handleAbsoluteApply}
                    onCancel={handleAbsoluteCancel}
                />
            )}
        </div>
    );
}
