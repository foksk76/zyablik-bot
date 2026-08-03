// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Badge } from '../components/ui/badge.jsx';

// ADR-0046: статус секрета «задан/не задан». Значение никогда не выводится.
export default function SecretStatus({ set }) {
    return set
        ? <Badge variant="success" data-testid="secret-status">задан</Badge>
        : <Badge variant="warning" data-testid="secret-status">не задан</Badge>;
}
