// SPDX-License-Identifier: Apache-2.0
import { useState, useRef, useCallback } from 'react';

export function useLogout(csrf) {
    const [logoutError, setLogoutError] = useState(null);
    const logoutTimerRef = useRef(null);

    const dismissLogoutError = useCallback(() => {
        if (logoutTimerRef.current) {
            clearTimeout(logoutTimerRef.current);
            logoutTimerRef.current = null;
        }
        setLogoutError(null);
    }, []);

    const logout = useCallback(async () => {
        try {
            const r = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'same-origin'
            });
            if (!r.ok) {
                setLogoutError(`Не удалось выйти (сервер: ${r.status}). Сессия может быть активна.`);
                logoutTimerRef.current = setTimeout(() => { window.location.href = '/'; }, 3000);
                return;
            }
        } catch {
            // Network error — redirect anyway (session may already be destroyed)
        }
        window.location.href = '/';
    }, [csrf]);

    return { logout, logoutError, dismissLogoutError };
}
