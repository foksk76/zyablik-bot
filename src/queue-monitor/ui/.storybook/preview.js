// SPDX-License-Identifier: Apache-2.0
import '../src/index.css';

/** @type {import('storybook').Preview} */
const preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i
            }
        }
    }
};

export default preview;
