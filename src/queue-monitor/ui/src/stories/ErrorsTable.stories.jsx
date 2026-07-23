// SPDX-License-Identifier: Apache-2.0
import ErrorsTable from '../components/ErrorsTable.jsx';

export default {
    title: 'Dashboard/ErrorsTable',
    component: ErrorsTable
};

export const Loading = { args: { errors: null } };
export const Empty = { args: { errors: { data: [] } } };
export const WithData = {
    args: {
        errors: {
            data: [
                { id: 101, source: 'zabbix', payload: '{"recipient":{"value":"user:219338126"}}', attempts: 5, updatedAt: Date.now() / 1000 - 300 },
                { id: 102, source: 'siem', payload: '{"recipient":{"value":"chat:12345"}}', attempts: 3, updatedAt: Date.now() / 1000 - 60 }
            ]
        }
    }
};
