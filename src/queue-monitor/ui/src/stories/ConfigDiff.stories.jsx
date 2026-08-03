// SPDX-License-Identifier: Apache-2.0
import ConfigDiff from '../components/ConfigDiff.jsx';

export default {
    title: 'Config/ConfigDiff',
    component: ConfigDiff,
    argTypes: {
        activeSections: { control: 'object' },
        stagedSections: { control: 'object' }
    }
};

export const Empty = {
    args: {
        activeSections: { bot: { logLevel: 'info' } },
        stagedSections: { bot: { logLevel: 'info' } }
    }
};

export const WithChanges = {
    args: {
        activeSections: {
            bot: { logLevel: 'info', maxPollLimit: 100 },
            queue: { queueEnabled: false },
            plugins: { identity: { syncMode: 'auto' } }
        },
        stagedSections: {
            bot: { logLevel: 'debug', maxPollLimit: 200 },
            queue: { queueEnabled: true },
            plugins: { identity: { syncMode: 'manual' } }
        }
    }
};
