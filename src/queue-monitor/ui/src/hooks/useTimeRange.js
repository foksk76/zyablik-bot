// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback } from 'react';

// ADR-0041: глобальный фильтр времени для Queue Monitor Dashboard.
// Хук управляет стейтом временного диапазона: relative (window) или absolute (from/to).
//
// Пример использования:
//   const { timeRange, setRelative, setAbsolute, shift } = useTimeRange();
//   setRelative(3600);          // 1 час
//   setAbsolute(from, to);      // абсолютный диапазон
//   shift(-3600);               // сдвинуть на 1 час назад
export function useTimeRange(initialSeconds = 86400) {
    const [timeRange, setTimeRange] = useState({
        mode: 'relative',
        seconds: initialSeconds,
        from: null,
        to: null
    });

    const setRelative = useCallback((seconds) => {
        setTimeRange({ mode: 'relative', seconds, from: null, to: null });
    }, []);

    const setAbsolute = useCallback((from, to) => {
        setTimeRange({ mode: 'absolute', seconds: null, from, to });
    }, []);

    const shift = useCallback((deltaT) => {
        setTimeRange((prev) => {
            if (prev.mode === 'relative') {
                const newSeconds = Math.max(60, (prev.seconds || 3600) - deltaT);
                return { ...prev, seconds: newSeconds };
            }
            const newFrom = (prev.from || 0) + deltaT;
            const newTo = (prev.to || 0) + deltaT;
            if (newFrom >= newTo || newFrom <= 0) {
                return prev;
            }
            return { ...prev, from: newFrom, to: newTo };
        });
    }, []);

    return { timeRange, setRelative, setAbsolute, shift };
}
