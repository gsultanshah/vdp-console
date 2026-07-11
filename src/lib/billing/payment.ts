export interface BankAccountDetails {
  accountName: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  swiftCode: string;
  branch: string;
  currency: string;
  paymentReferencePrefix: string;
  supportEmail: string;
  notes: string[];
}

export function getBankAccountDetails(): BankAccountDetails {
  return {
    accountName: process.env.BILLING_ACCOUNT_NAME || 'Election Experts (Pvt) Ltd',
    bankName: process.env.BILLING_BANK_NAME || 'Meezan Bank Limited',
    accountNumber: process.env.BILLING_ACCOUNT_NUMBER || '0123-4567890-123',
    iban: process.env.BILLING_IBAN || 'PK00MEZN0001234567890123',
    swiftCode: process.env.BILLING_SWIFT || 'MEZNPKKA',
    branch: process.env.BILLING_BRANCH || 'Main Branch, Lahore',
    currency: 'USD',
    paymentReferencePrefix: process.env.BILLING_REFERENCE_PREFIX || 'VDP',
    supportEmail: process.env.BILLING_SUPPORT_EMAIL || 'billing@electionexperts.com',
    notes: [
      'All amounts are quoted in United States Dollars (USD).',
      'Include the invoice number in the payment reference / narration field.',
      'Settlement may take 2–5 business days for international wire transfers.',
      'Email payment confirmation to the billing support address above.',
    ],
  };
}

export function buildPaymentReference(invoiceNumber: string): string {
  const prefix = process.env.BILLING_REFERENCE_PREFIX || 'VDP';
  return `${prefix}-${invoiceNumber}`;
}
