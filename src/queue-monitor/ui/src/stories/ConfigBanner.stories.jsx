// SPDX-License-Identifier: Apache-2.0
import ConfigBanner from '../components/ConfigBanner.jsx';

export default {
    title: 'Config/ConfigBanner',
    component: ConfigBanner,
    argTypes: {
        status: { control: 'object' }
    }
};

export const Pending = {
    args: { status: { state: 'pending', restartInitiated: true, reason: 'Apply initiated — waiting for restart' } }
};

export const PendingManualRestart = {
    args: { status: { state: 'pending', restartInitiated: false, reason: 'Apply applied — restart the process manually' } }
};

export const RolledBack = {
    args: { status: { state: 'rolled_back', reason: 'авто-откат после неудачного старта' } }
};

export const Confirmed = {
    args: { status: { state: 'confirmed', reason: null } }
};

export const Idle = {
    args: { status: { state: 'idle' } }
};
