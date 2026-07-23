// SPDX-License-Identifier: Apache-2.0
/** @type {import('storybook').StorybookConfig} */
const config = {
    stories: ['../src/**/*.stories.@(js|jsx)'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    }
};

export default config;
