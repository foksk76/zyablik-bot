// SPDX-License-Identifier: Apache-2.0
import * as React from 'react';
import { cn } from '../../lib/utils.js';

const badgeVariants = {
    default: 'bg-brand-500 text-white',
    secondary: 'bg-slate-100 text-slate-700',
    destructive: 'bg-error text-white',
    outline: 'border border-slate-200 text-slate-700',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    error: 'bg-rose-50 text-rose-700 border border-rose-200',
    info: 'bg-blue-50 text-blue-700 border border-blue-200'
};

function Badge({ className, variant = 'default', ...props }) {
    return (
        <div
            className={cn(
                'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors',
                badgeVariants[variant],
                className
            )}
            {...props}
        />
    );
}

export { Badge, badgeVariants };
