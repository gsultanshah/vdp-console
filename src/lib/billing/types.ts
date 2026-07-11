export type BillingPeriod = 'week' | 'month' | 'year' | 'all';

export type BillingActivityFilter =
  | 'all'
  | 'voter_processing'
  | 'bulk_compilation'
  | 'exports'
  | 'parchi'
  | 'phone_enrich'
  | 'ocr'
  | 'infrastructure';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';

export interface MoneyRange {
  min: number;
  max: number;
}

export interface BillingPricingRates {
  dailyEstimate: MoneyRange;
  voterProcess: MoneyRange;
  bulkSession: MoneyRange;
  infrastructure: MoneyRange;
}

export interface UsageActivityRow {
  id: string;
  activity: BillingActivityFilter;
  sku: string;
  resource: string;
  region: string;
  quantity: number;
  unit: string;
  unitCost: MoneyRange;
  cost: MoneyRange;
  timestamp: string;
  operator?: string;
  metadata?: Record<string, string | number>;
}

export interface UsageDailyPoint {
  date: string;
  voterUnits: number;
  bulkSessions: number;
  ocrPages: number;
  cost: MoneyRange;
}

export interface BillingUsageSummary {
  period: BillingPeriod;
  activity: BillingActivityFilter;
  rangeStart: string;
  rangeEnd: string;
  daysInPeriod: number;
  metrics: {
    votersProcessed: number;
    bulkSessions: number;
    exportJobs: number;
    parchiJobs: number;
    phoneEnrichJobs: number;
    ocrPagesCompleted: number;
    totalEvents: number;
  };
  costs: {
    voterProcessing: MoneyRange;
    bulkCompilation: MoneyRange;
    infrastructure: MoneyRange;
    dailyEstimate: MoneyRange;
    total: MoneyRange;
  };
  activities: UsageActivityRow[];
  dailySeries: UsageDailyPoint[];
  pricing: BillingPricingRates;
}

export interface InvoiceLineItem {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: MoneyRange;
  amount: MoneyRange;
}

export interface BillingInvoice {
  _id: string;
  invoiceNumber: string;
  shareToken: string;
  status: InvoiceStatus;
  period: BillingPeriod;
  activity: BillingActivityFilter;
  periodStart: string;
  periodEnd: string;
  lineItems: InvoiceLineItem[];
  subtotal: MoneyRange;
  infrastructure: MoneyRange;
  total: MoneyRange;
  currency: 'USD';
  billingContact: {
    name: string;
    email: string;
    organization: string;
  };
  createdBy: string;
  createdByName: string;
  createdAt: string;
  dueAt: string;
  paidAt: string | null;
  notes: string;
}
