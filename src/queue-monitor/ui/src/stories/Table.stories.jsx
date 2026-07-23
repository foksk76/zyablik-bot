// SPDX-License-Identifier: Apache-2.0
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';

export default {
    title: 'UI/Table',
    component: Table
};

export const Default = {
    render: () => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow>
                    <TableCell>zabbix</TableCell>
                    <TableCell>delivered</TableCell>
                    <TableCell className="text-right">42</TableCell>
                </TableRow>
                <TableRow>
                    <TableCell>siem</TableCell>
                    <TableCell>failed</TableCell>
                    <TableCell className="text-right">3</TableCell>
                </TableRow>
            </TableBody>
        </Table>
    )
};
