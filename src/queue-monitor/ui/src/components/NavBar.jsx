// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import { Button } from './ui/button.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const NAV_ITEMS = [
    { to: '/dashboard', label: 'Дашборд' },
    { to: '/archive', label: 'Архив' },
    { to: '/settings', label: 'Настройки' }
];

export default function NavBar({ user, csrf }) {
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (mobileOpen) {
            const handler = (e) => {
                if (!e.target.closest('[data-navbar]')) {
                    setMobileOpen(false);
                }
            };
            document.addEventListener('click', handler);
            return () => document.removeEventListener('click', handler);
        }
    }, [mobileOpen]);

    function linkClass({ isActive }) {
        return isActive
            ? 'text-foreground font-medium border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground';
    }

    async function logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'same-origin'
            });
        } catch {
            // Network error — redirect anyway
        }
        window.location.href = '/';
    }

    return (
        <nav data-navbar className="bg-card border-b border-border" aria-label="Основная навигация">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                        <span className="text-primary-foreground font-bold text-sm">З</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground hidden sm:inline">Зяблик</span>
                </div>

                <div className="hidden md:flex items-center gap-4">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={linkClass}
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </div>

                <div className="hidden md:flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{user?.name || user?.email || user?.sub}</span>
                    <ThemeToggle />
                    <Button variant="ghost" size="sm" onClick={logout}>
                        <LogOut className="w-4 h-4 mr-1 shrink-0" />
                        Выйти
                    </Button>
                </div>

                <button
                    className="md:hidden p-2 rounded-md hover:bg-accent"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-expanded={mobileOpen}
                    aria-label="Меню навигации"
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {mobileOpen && (
                <div className="md:hidden border-t border-border bg-card px-4 py-2 space-y-1">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `block px-3 py-2 rounded text-sm ${
                                    isActive
                                        ? 'bg-accent text-foreground font-medium'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`
                            }
                            onClick={() => setMobileOpen(false)}
                        >
                            {item.label}
                        </NavLink>
                    ))}
                    <div className="border-t border-border pt-2 mt-2 flex items-center justify-between text-sm text-muted-foreground px-3">
                        <span>{user?.name || user?.email || user?.sub}</span>
                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            <Button variant="ghost" size="sm" onClick={logout}>
                                <LogOut className="w-4 h-4 mr-1 shrink-0" />
                                Выйти
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
}
