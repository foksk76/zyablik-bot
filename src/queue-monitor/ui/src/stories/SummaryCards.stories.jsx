// SPDX-License-Identifier: Apache-2.0
import SummaryCards from '../components/SummaryCards.jsx';

export default {
    title: 'Dashboard/SummaryCards',
    component: SummaryCards
};

export const Loading = { args: { summary: null } };
export const WithData = {
    args: {
        summary: {
            pending: 12,
            processing: 3,
            delivered: 156,
            failed: 7,
            total: 178,
            totalAttempts: 201
        }
    }
};
