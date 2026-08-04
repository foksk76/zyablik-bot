// SPDX-License-Identifier: Apache-2.0
import ConfigForm from '../components/ConfigForm.jsx';

export default {
    title: 'Config/ConfigForm',
    component: ConfigForm,
    argTypes: {
        schema: { control: 'object' },
        sections: { control: 'object' }
    }
};

const schema = {
    bot: {
        logLevel: { type: 'string', default: 'info', description: 'Уровень логирования' },
        maxPollLimit: { type: 'number', default: 100, min: 1, max: 1000 },
        maxTransportMode: { type: 'string', enum: ['long_polling', 'webhook'], default: 'long_polling' },
        rateLimitEnabled: { type: 'boolean', default: true },
        maxPollTypes: { type: 'list', default: ['NEW_MESSAGE'] },
        maxBotToken: { type: 'string', secret: true, default: '' }
    },
    queue: {
        queueEnabled: { type: 'boolean', default: false, nullable: true }
    },
    plugins: {
        identity: {
            syncMode: { type: 'enum', enum: ['auto', 'manual'], default: 'auto' },
            apiToken: { type: 'string', secret: true, default: '' }
        }
    }
};

const sections = {
    bot: {
        logLevel: 'info',
        maxPollLimit: 100,
        maxTransportMode: 'long_polling',
        rateLimitEnabled: true,
        maxPollTypes: ['NEW_MESSAGE', 'UPDATE_MESSAGE'],
        maxBotToken: { secret: true, set: true }
    },
    queue: {
        queueEnabled: null
    },
    plugins: {
        identity: { syncMode: 'auto', apiToken: { secret: true, set: true } }
    }
};

export const Default = { args: { schema, sections, errors: {}, onChange: () => {} } };
export const WithErrors = {
    args: {
        schema,
        sections: { ...sections, bot: { ...sections.bot, logLevel: 'info', maxPollLimit: 0 } },
        errors: { maxPollLimit: 'меньше минимального значения 1' },
        onChange: () => {}
    }
};
