// SPDX-License-Identifier: Apache-2.0
import SecretStatus from '../components/SecretStatus.jsx';

export default {
    title: 'Config/SecretStatus',
    component: SecretStatus,
    argTypes: {
        set: { control: 'boolean' }
    }
};

export const Set = { args: { set: true } };
export const NotSet = { args: { set: false } };
