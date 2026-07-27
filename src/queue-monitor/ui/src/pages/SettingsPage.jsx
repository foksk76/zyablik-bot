// SPDX-License-Identifier: Apache-2.0
import React from 'react';

export default function SettingsPage() {
    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Настройки</h2>
            <p className="text-muted-foreground text-sm">Раздел в разработке</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Zabbix Media Type</li>
                <li>Плагины</li>
                <li>Общие параметры</li>
            </ul>
        </div>
    );
}
