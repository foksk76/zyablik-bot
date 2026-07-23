// SPDX-License-Identifier: Apache-2.0
import TopTable from '../components/TopTable.jsx';

export default {
    title: 'Dashboard/TopTable',
    component: TopTable,
    argTypes: {
        topBy: { control: 'select', options: ['source', 'recipient'] }
    }
};

export const Loading = {
    args: { top: null, topBy: 'source', onByChange: () => {} }
};

export const Empty = {
    args: { top: { data: [] }, topBy: 'source', onByChange: () => {} }
};

export const BySource = {
    args: {
        top: {
            data: [
                { source: 'zabbix', count: 45 },
                { source: 'siem', count: 23 },
                { source: 'corp-bot', count: 12 }
            ]
        },
        topBy: 'source',
        onByChange: () => {}
    }
};

export const ByRecipient = {
    args: {
        top: {
            data: [
                { recipient: 'user:219338126', count: 34 },
                { recipient: 'chat:12345', count: 28 },
                { recipient: 'chat:67890', count: 15 }
            ]
        },
        topBy: 'recipient',
        onByChange: () => {}
    }
};
