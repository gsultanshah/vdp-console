'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface VoterRecord {
  id: string;
  name: string;
  cnic: string;
  constituency: string;
  status: 'pending' | 'verified' | 'rejected';
  registrationDate: string;
}

export default function VoterRegistrationPage() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Example voter records
  const voterRecords: VoterRecord[] = [
    {
      id: 'VR001',
      name: 'Ahmed Khan',
      cnic: '35201-1234567-1',
      constituency: 'NA-123',
      status: 'verified',
      registrationDate: '2024-03-15'
    },
    {
      id: 'VR002',
      name: 'Fatima Bibi',
      cnic: '35201-2345678-2',
      constituency: 'NA-124',
      status: 'pending',
      registrationDate: '2024-03-16'
    },
    {
      id: 'VR003',
      name: 'Muhammad Ali',
      cnic: '35201-3456789-3',
      constituency: 'NA-123',
      status: 'rejected',
      registrationDate: '2024-03-14'
    }
  ];

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Voter Registration Management</h1>
        <Button>New Registration</Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search Voters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Search by name, CNIC, or constituency..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
            <Button variant="outline">Advanced Search</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Registrations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>CNIC</TableHead>
                <TableHead>Constituency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registration Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voterRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.id}</TableCell>
                  <TableCell>{record.name}</TableCell>
                  <TableCell>{record.cnic}</TableCell>
                  <TableCell>{record.constituency}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        record.status === 'verified'
                          ? 'success'
                          : record.status === 'pending'
                          ? 'warning'
                          : 'destructive'
                      }
                    >
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{record.registrationDate}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
} 