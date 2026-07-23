// SPDX-License-Identifier: Apache-2.0
import TimeseriesChart from '../components/TimeseriesChart.jsx';

export default {
    title: 'Dashboard/TimeseriesChart',
    component: TimeseriesChart,
    argTypes: {
        windowSeconds: { control: 'select', options: [3600, 21600, 43200, 86400] }
    }
};

const now = Math.floor(Date.now() / 1000);
const hour = 3600;

function generateData(count) {
    const rows = [];
    for (let i = 0; i < count; i++) {
        const bucket = now - (count - i) * hour;
        rows.push({ bucket, status: 'delivered', count: Math.floor(Math.random() * 20) + 5 });
        rows.push({ bucket, status: 'failed', count: Math.floor(Math.random() * 3) });
        rows.push({ bucket, status: 'pending', count: Math.floor(Math.random() * 5) });
        rows.push({ bucket, status: 'processing', count: Math.floor(Math.random() * 4) });
    }
    return rows;
}

export const Loading = {
    args: { timeseries: null, windowSeconds: 3600, onWindowChange: () => {} }
};

export const Empty = {
    args: { timeseries: { data: [] }, windowSeconds: 3600, onWindowChange: () => {} }
};

export const WithData = {
    args: {
        timeseries: { data: generateData(12) },
        windowSeconds: 3600,
        onWindowChange: () => {}
    }
};

export const SixHours = {
    args: {
        timeseries: { data: generateData(6) },
        windowSeconds: 21600,
        onWindowChange: () => {}
    }
};
