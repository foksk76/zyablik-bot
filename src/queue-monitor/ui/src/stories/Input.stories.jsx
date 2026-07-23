// SPDX-License-Identifier: Apache-2.0
import { Input } from '../components/ui/input.jsx';

export default {
    title: 'UI/Input',
    component: Input,
    argTypes: {
        type: { control: 'select', options: ['text', 'password', 'email', 'number'] },
        disabled: { control: 'boolean' }
    }
};

export const Default = { args: { placeholder: 'Введите текст...' } };
export const WithValue = { args: { defaultValue: 'Зяблик' } };
export const Password = { args: { type: 'password', placeholder: 'Пароль' } };
export const Disabled = { args: { disabled: true, placeholder: 'Отключено' } };
