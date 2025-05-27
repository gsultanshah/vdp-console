'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface ValidationRule {
  id: string;
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'pending';
  details?: string;
}

export default function DataValidationPage() {
  const [validationProgress, setValidationProgress] = useState(0);
  const [isValidating, setIsValidating] = useState(false);

  // Example validation rules
  const validationRules: ValidationRule[] = [
    {
      id: 'VR001',
      name: 'CNIC Format Validation',
      description: 'Validates the format of CNIC numbers',
      status: 'passed',
      details: 'All CNIC numbers follow the correct format: XXXXX-XXXXXXX-X'
    },
    {
      id: 'VR002',
      name: 'Duplicate Check',
      description: 'Checks for duplicate voter registrations',
      status: 'failed',
      details: 'Found 3 duplicate entries in NA-123 constituency'
    },
    {
      id: 'VR003',
      name: 'Age Verification',
      description: 'Verifies voter age eligibility',
      status: 'pending'
    }
  ];

  const startValidation = () => {
    setIsValidating(true);
    setValidationProgress(0);
    
    // Simulate validation progress
    const interval = setInterval(() => {
      setValidationProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsValidating(false);
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Data Validation</h1>
        <Button onClick={startValidation} disabled={isValidating}>
          Start Validation
        </Button>
      </div>

      {isValidating && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Validation Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={validationProgress} className="mb-2" />
            <p className="text-sm text-muted-foreground">
              Running validation checks... {validationProgress}%
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        {validationRules.map((rule) => (
          <Card key={rule.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{rule.name}</CardTitle>
                {rule.status === 'passed' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : rule.status === 'failed' ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {rule.description}
              </p>
              {rule.details && (
                <Alert
                  variant={rule.status === 'failed' ? 'destructive' : 'default'}
                >
                  <AlertTitle>
                    {rule.status === 'passed'
                      ? 'Validation Passed'
                      : rule.status === 'failed'
                      ? 'Validation Failed'
                      : 'Pending'}
                  </AlertTitle>
                  <AlertDescription>{rule.details}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
} 