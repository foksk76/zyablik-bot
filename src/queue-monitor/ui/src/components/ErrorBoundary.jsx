// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Card, CardContent } from './ui/card.jsx';
import { Button } from './ui/button.jsx';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Card>
                    <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground mb-3">Ошибка отображения</p>
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                            Перезагрузить
                        </Button>
                    </CardContent>
                </Card>
            );
        }
        return this.props.children;
    }
}
