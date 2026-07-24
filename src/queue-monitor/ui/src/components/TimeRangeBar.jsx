// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import TimeRangeDropdown from './TimeRangeDropdown.jsx';
import AbsoluteRangePicker from './AbsoluteRangePicker.jsx';
import { Button } from './ui/button.jsx';
import { Calendar } from 'lucide-react';

// ADR-0041: TimeRangeBar — объединённый компонент для выбора временного диапазона.
// Содержит TimeRangeDropdown (relative presets) + toggle для абсолютного диапазона.
// Кнопка календаря: в relative mode — переключает в absolute (показывает picker),
// в absolute mode — скрывает picker и переключает обратно в relative.
export default function TimeRangeBar({ timeRange, onTimeRangeChange }) {
    const [isAbsolute, setIsAbsolute] = useState(timeRange.mode === 'absolute');

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
            // Возвращаемся к предыдущему relative значению или дефолтному 1ч
            onTimeRangeChange('relative', timeRange.seconds || 3600);
        } else {
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
                    from={timeRange.from}
                    to={timeRange.to}
                    onApply={handleAbsoluteApply}
                    onCancel={handleAbsoluteCancel}
                />
            )}
        </div>
    );
}
