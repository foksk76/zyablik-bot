// SPDX-License-Identifier: Apache-2.0
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './button.jsx';
import { ChevronDown } from 'lucide-react';

export default function LimitDropdown({ value, onChange, options }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

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
                {value}
                <ChevronDown className="w-3 h-3 ml-1 shrink-0" />
            </Button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-md z-50 min-w-[60px]">
                    {options.map((v) => (
                        <button
                            key={v}
                            className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                                v === value ? 'bg-accent font-medium' : ''
                            }`}
                            onClick={() => {
                                onChange(v);
                                setOpen(false);
                            }}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
