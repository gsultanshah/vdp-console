import { randomUUID } from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { collectBillingUsage } from '@/lib/billing/usage';
import type {
  BillingActivityFilter,
  BillingInvoice,
  BillingPeriod,
  InvoiceLineItem,
  InvoiceStatus,
} from '@/lib/billing/types';

const INVOICES_COLLECTION = 'billing_invoices';

function toInvoice(doc: Record<string, unknown>): BillingInvoice {
  return {
    _id: String(doc._id),
    invoiceNumber: String(doc.invoiceNumber ?? ''),
    shareToken: String(doc.shareToken ?? ''),
    status: (doc.status as InvoiceStatus) ?? 'issued',
    period: (doc.period as BillingPeriod) ?? 'month',
    activity: (doc.activity as BillingActivityFilter) ?? 'all',
    periodStart: new Date(doc.periodStart as string | Date).toISOString(),
    periodEnd: new Date(doc.periodEnd as string | Date).toISOString(),
    lineItems: (doc.lineItems as InvoiceLineItem[]) ?? [],
    subtotal: doc.subtotal as BillingInvoice['subtotal'],
    infrastructure: doc.infrastructure as BillingInvoice['infrastructure'],
    total: doc.total as BillingInvoice['total'],
    currency: 'USD',
    billingContact: (doc.billingContact as BillingInvoice['billingContact']) ?? {
      name: '',
      email: '',
      organization: 'VDP Console',
    },
    createdBy: String(doc.createdBy ?? ''),
    createdByName: String(doc.createdByName ?? ''),
    createdAt: new Date(doc.createdAt as string | Date).toISOString(),
    dueAt: new Date(doc.dueAt as string | Date).toISOString(),
    paidAt: doc.paidAt ? new Date(doc.paidAt as string | Date).toISOString() : null,
    notes: String(doc.notes ?? ''),
  };
}

async function nextInvoiceNumber(db: Db): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `VDP-INV-${year}-`;
  const latest = await db
    .collection(INVOICES_COLLECTION)
    .find({ invoiceNumber: { $regex: `^${prefix}` } })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  const lastSeq = latest[0]
    ? Number.parseInt(String(latest[0].invoiceNumber).replace(prefix, ''), 10)
    : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function listInvoices(limit = 50): Promise<BillingInvoice[]> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  try {
    const docs = await db
      .collection(INVOICES_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((doc) => toInvoice(doc as Record<string, unknown>));
  } finally {
    await client.close();
  }
}

export async function getInvoiceById(id: string): Promise<BillingInvoice | null> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  try {
    const doc = await db.collection(INVOICES_COLLECTION).findOne({ _id: new ObjectId(id) });
    return doc ? toInvoice(doc as Record<string, unknown>) : null;
  } finally {
    await client.close();
  }
}

export async function getInvoiceByShareToken(token: string): Promise<BillingInvoice | null> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  try {
    const doc = await db.collection(INVOICES_COLLECTION).findOne({ shareToken: token });
    return doc ? toInvoice(doc as Record<string, unknown>) : null;
  } finally {
    await client.close();
  }
}

export async function generateInvoice(input: {
  period: BillingPeriod;
  activity: BillingActivityFilter;
  createdBy: string;
  createdByName: string;
  billingContact?: Partial<BillingInvoice['billingContact']>;
  notes?: string;
}): Promise<BillingInvoice> {
  const usage = await collectBillingUsage(input.period, input.activity);
  const lineItems: InvoiceLineItem[] = [
    {
      sku: 'VDP-COMPUTE-VOTER',
      description: 'Voter record processing (export, parchi, OCR ingestion)',
      quantity: usage.metrics.votersProcessed,
      unit: 'voter',
      unitPrice: usage.pricing.voterProcess,
      amount: usage.costs.voterProcessing,
    },
    {
      sku: 'VDP-BULK-SESSION',
      description: 'Bulk data compilation & generation sessions',
      quantity: usage.metrics.bulkSessions,
      unit: 'session',
      unitPrice: usage.pricing.bulkSession,
      amount: usage.costs.bulkCompilation,
    },
    {
      sku: 'VDP-INFRA-NET',
      description: 'Server storage, bandwidth, and platform overhead',
      quantity: usage.daysInPeriod,
      unit: 'day',
      unitPrice: usage.pricing.dailyEstimate,
      amount: usage.costs.infrastructure,
    },
  ];

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const invoiceNumber = await nextInvoiceNumber(db);
    const now = new Date();
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + 14);

    const doc = {
      invoiceNumber,
      shareToken: randomUUID().replace(/-/g, ''),
      status: 'issued' as InvoiceStatus,
      period: input.period,
      activity: input.activity,
      periodStart: new Date(usage.rangeStart),
      periodEnd: new Date(usage.rangeEnd),
      lineItems,
      subtotal: {
        min: usage.costs.voterProcessing.min + usage.costs.bulkCompilation.min,
        max: usage.costs.voterProcessing.max + usage.costs.bulkCompilation.max,
      },
      infrastructure: usage.costs.infrastructure,
      total: usage.costs.total,
      currency: 'USD',
      billingContact: {
        name: input.billingContact?.name || input.createdByName,
        email: input.billingContact?.email || '',
        organization: input.billingContact?.organization || 'VDP Console',
      },
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt: now,
      dueAt,
      paidAt: null,
      notes: input.notes || 'Generated from VDP Console usage summary.',
    };

    const result = await db.collection(INVOICES_COLLECTION).insertOne(doc);
    return toInvoice({ ...doc, _id: result.insertedId });
  } finally {
    await client.close();
  }
}

export async function markInvoicePaid(id: string): Promise<BillingInvoice | null> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  try {
    const result = await db.collection(INVOICES_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status: 'paid', paidAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? toInvoice(result as Record<string, unknown>) : null;
  } finally {
    await client.close();
  }
}

export function invoiceShareUrl(shareToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/billing/invoice/${shareToken}/`;
}

export function invoicePayUrl(shareToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/billing/pay/${shareToken}/`;
}
