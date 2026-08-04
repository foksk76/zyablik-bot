// SPDX-License-Identifier: Apache-2.0
import React from 'react';

// ADR-0040/ADR-0046: banner авто-отката по статусу /api/config/status.
// pending — «применяется»; rolled_back — причина; confirmed — успех.
// При ручном рестарте (restartInitiated=false) процесс рестартует оператор:
// banner сообщает об этом вместо таймера окна StartupWait.
export default function ConfigBanner({ status }) {
    const state = status && status.state;
    if (!state || state === 'idle' || state === 'confirmed') {
        return null;
    }

    if (state === 'pending') {
        return (
            <div className="bg-warning-light border border-warning/20 text-warning-dark text-sm rounded-lg p-3 flex items-center justify-between gap-2" data-testid="banner-pending">
                <span>
                    {status.restartInitiated
                        ? 'Применение конфигурации… ожидается перезапуск.'
                        : 'Конфигурация применена. Перезапустите процесс вручную (systemctl restart), чтобы применить изменения.'}
                </span>
            </div>
        );
    }

    if (state === 'rolled_back') {
        return (
            <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3 flex items-center justify-between gap-2" data-testid="banner-rolled-back">
                <span>
                    Конфигурация откачена: {status.reason || 'авто-откат после неудачного старта'}
                </span>
            </div>
        );
    }

    return (
        <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3" data-testid="banner-state">
            Статус: {state}{status.reason ? ` — ${status.reason}` : ''}
        </div>
    );
}
