// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import TimeRangeDropdown from './TimeRangeDropdown.jsx';
import AbsoluteRangePicker from './AbsoluteRangePicker.jsx';
import { Button } from './ui/button.jsx';
import { Calendar } from 'lucide-react';

// ADR-0041: TimeRangeBar — объединённый компонент для выбора временного диапазона.
// Содержит TimeRangeDropdown (relative presets) + toggle для абсолютного диапазона.
// При переключении на абсолютный диапазон — вычисляет from/to из текущего relative.
export default function TimeRangeBar({ timeRange, onTimeRangeChange }) {
    const [isAbsolute, setIsAbsolute] = useState(timeRange.mode === 'absolute');
    const [computedFrom, setComputedFrom] = useState(null);
    const [computedTo, setComputedTo] = useState(null);

    useEffect(() => {
        setIsAbsolute(timeRange.mode === 'absolute');
    }, [timeRange.mode]);

    function handleRelativeSelect(seconds) {
        setIsAbsolute(false);
        onTimeRangeChange('relative', seconds);
    }

    function handleAbsoluteApply(from, to) {
        onTimeRangeChange('absolute', { from, to });
    }

    function handleAbsoluteCancel() {
        setIsAbsolute(false);
    }

    function handleCalendarClick() {
        if (isAbsolute) {
            setIsAbsolute(false);
            onTimeRangeChange('relative', timeRange.seconds || 86400);
        } else {
            const now = Math.floor(Date.now() / 1000);
            const seconds = timeRange.seconds || 86400;
            setComputedFrom(now - seconds);
            setComputedTo(now);
            setIsAbsolute(true);
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                {!isAbsolute && (
                    <TimeRangeDropdown
                        value={timeRange.seconds}
                        onChange={handleRelativeSelect}
                    />
                )}
                <Button
                    variant={isAbsolute ? 'default' : 'ghost'}
                    size="sm"
                    onClick={handleCalendarClick}
                    title={isAbsolute ? 'Вернуться к относительному времени' : 'Абсолютный диапазон'}
                >
                    <Calendar className="w-4 h-4" />
                </Button>
            </div>
            {isAbsolute && (
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
