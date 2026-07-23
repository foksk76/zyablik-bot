// SPDX-License-Identifier: Apache-2.0
import * as React from 'react';
import { cn } from '../../lib/utils.js';

const badgeVariants = {
    default: 'bg-brand-500 text-white',
    secondary: 'bg-neutral-100 text-neutral-700',
    destructive: 'bg-error text-white',
    outline: 'border border-neutral-200 text-neutral-700',
    success: 'bg-success-light text-success-dark border border-success/20',
    warning: 'bg-warning-light text-warning-dark border border-warning/20',
    error: 'bg-error-light text-error-dark border border-error/20',
    info: 'bg-info-light text-info-dark border border-info/20'
};

const Badge = React.forwardRef(({ className, variant = 'default', ...props }, ref) => (
    <span
        ref={ref}
        className={cn(
            'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors',
            badgeVariants[variant],
            className
        )}
        {...props}
    />
));
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
