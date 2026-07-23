// SPDX-License-Identifier: Apache-2.0
import { Badge } from '../components/ui/badge.jsx';

export default {
    title: 'UI/Badge',
    component: Badge,
    argTypes: {
        variant: { control: 'select', options: ['default', 'secondary', 'destructive', 'outline', 'success', 'warning', 'error', 'info'] }
    }
};

export const Default = { args: { children: 'Badge', variant: 'default' } };
export const Success = { args: { children: 'Доставлено', variant: 'success' } };
export const Warning = { args: { children: 'Ожидают', variant: 'warning' } };
export const Error = { args: { children: 'Ошибки', variant: 'error' } };
export const Info = { args: { children: 'В обработке', variant: 'info' } };
export const Outline = { args: { children: 'Outline', variant: 'outline' } };
