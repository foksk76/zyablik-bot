// SPDX-License-Identifier: Apache-2.0
import { Button } from '../components/ui/button.jsx';

export default {
    title: 'UI/Button',
    component: Button,
    argTypes: {
        variant: { control: 'select', options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] },
        size: { control: 'select', options: ['default', 'sm', 'lg', 'icon'] }
    }
};

export const Default = { args: { children: 'Button' } };
export const Destructive = { args: { children: 'Delete', variant: 'destructive' } };
export const Outline = { args: { children: 'Outline', variant: 'outline' } };
export const Secondary = { args: { children: 'Secondary', variant: 'secondary' } };
export const Ghost = { args: { children: 'Ghost', variant: 'ghost' } };
export const Small = { args: { children: 'Small', size: 'sm' } };
export const Large = { args: { children: 'Large', size: 'lg' } };
