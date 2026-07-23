// SPDX-License-Identifier: Apache-2.0
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';

export default {
    title: 'UI/Card',
    component: Card
};

export const Default = {
    render: () => (
        <Card className="w-80">
            <CardHeader>
                <CardTitle>Card Title</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-neutral-500">Card content goes here.</p>
            </CardContent>
        </Card>
    )
};
