import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  type QueryCommandInput,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';

export interface PhoneDataRecord {
  cnic: string;
  phone: string;
  data: Record<string, unknown>;
  firstname?: string;
  gender?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  sourceFile?: string;
}

const DEFAULT_REGION = 'eu-west-1';
const DEFAULT_TABLE = 'phone-data';
const SCAN_PAGE_LIMIT = 25;

let documentClient: DynamoDBDocumentClient | null = null;

export function normalizeCnicDigits(cnic: string): string {
  return cnic.replace(/\D/g, '').slice(0, 13);
}

export function normalizePhoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '');

  if (digits.startsWith('92') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhoneDigits(phone);
  if (normalized.length === 10 && normalized.startsWith('3')) {
    return `0${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }
  return phone;
}

export function formatCnicDisplay(digits: string): string {
  if (digits.length !== 13) {
    return digits;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function getPhoneDataTableName(): string {
  return process.env.PHONE_DATA_TABLE || DEFAULT_TABLE;
}

export function isPhoneDataConfigured(): boolean {
  return process.env.PHONE_DATA_DISABLED !== 'true';
}

function getDocumentClient(): DynamoDBDocumentClient {
  if (!documentClient) {
    const region = process.env.AWS_REGION || DEFAULT_REGION;
    const client = new DynamoDBClient({
      region,
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
    documentClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return documentClient;
}

function mapItem(item: Record<string, unknown>): PhoneDataRecord {
  const data =
    item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? (item.data as Record<string, unknown>)
      : {};

  const read = (key: string) => {
    const fromData = data[key];
    if (fromData != null && fromData !== '') {
      return String(fromData);
    }
    const fromRoot = item[key];
    return fromRoot != null && fromRoot !== '' ? String(fromRoot) : undefined;
  };

  return {
    cnic: String(item.cnic ?? ''),
    phone: String(item.phone ?? ''),
    data,
    firstname: read('firstname'),
    gender: read('gender'),
    address1: read('address1'),
    address2: read('address2'),
    address3: read('address3'),
    sourceFile: read('sourceFile'),
  };
}

export interface PutPhoneDataInput {
  cnic: string;
  phone: string;
  firstname?: string;
  gender?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  sourceFile?: string;
}

export function validatePhoneDataKeys(
  cnic: string,
  phone: string
): { ok: true; cnic: string; phone: string } | { ok: false; error: string } {
  const normalizedCnic = normalizeCnicDigits(cnic);
  const normalizedPhone = normalizePhoneDigits(phone);

  if (normalizedCnic.length !== 13) {
    return { ok: false, error: 'CNIC must be 13 digits' };
  }
  if (normalizedPhone.length !== 10 || !normalizedPhone.startsWith('3')) {
    return { ok: false, error: 'Phone must be a 10-digit mobile number (3XXXXXXXXX)' };
  }

  return { ok: true, cnic: normalizedCnic, phone: normalizedPhone };
}

function buildPhoneDataMap(
  cnic: string,
  phone: string,
  fields: Omit<PutPhoneDataInput, 'cnic' | 'phone'>
): Record<string, string> {
  const data: Record<string, string> = {
    phone1: phone,
    idcard: cnic,
    sourceFile: fields.sourceFile?.trim() || 'manual/vdp-console',
  };

  const optional: Array<keyof Omit<PutPhoneDataInput, 'cnic' | 'phone' | 'sourceFile'>> = [
    'firstname',
    'gender',
    'address1',
    'address2',
    'address3',
  ];

  for (const key of optional) {
    const value = fields[key]?.trim();
    if (value) {
      data[key] = value;
    }
  }

  return data;
}

export async function putPhoneDataRecord(input: PutPhoneDataInput): Promise<PhoneDataRecord> {
  const validated = validatePhoneDataKeys(input.cnic, input.phone);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const { cnic, phone } = validated;
  const data = buildPhoneDataMap(cnic, phone, input);
  const client = getDocumentClient();
  const tableName = getPhoneDataTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        cnic,
        phone,
        data,
      },
    })
  );

  return mapItem({ cnic, phone, data });
}

export async function searchPhoneDataByCnic(cnic: string): Promise<PhoneDataRecord[]> {
  const client = getDocumentClient();
  const tableName = getPhoneDataTableName();
  const normalizedCnic = normalizeCnicDigits(cnic);

  if (!normalizedCnic) {
    return [];
  }

  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: QueryCommandInput['ExclusiveStartKey'];

  do {
    const response = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'cnic = :cnic',
        ExpressionAttributeValues: {
          ':cnic': normalizedCnic,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (response.Items?.length) {
      items.push(...(response.Items as Record<string, unknown>[]));
    }
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items.map(mapItem);
}

export async function getPhoneDataRecord(
  cnic: string,
  phone: string
): Promise<PhoneDataRecord | null> {
  const client = getDocumentClient();
  const tableName = getPhoneDataTableName();
  const normalizedCnic = normalizeCnicDigits(cnic);
  const normalizedPhone = normalizePhoneDigits(phone);

  if (!normalizedCnic || !normalizedPhone) {
    return null;
  }

  const response = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        cnic: normalizedCnic,
        phone: normalizedPhone,
      },
    })
  );

  return response.Item ? mapItem(response.Item as Record<string, unknown>) : null;
}

export async function searchPhoneDataByPhone(phone: string): Promise<PhoneDataRecord[]> {
  const client = getDocumentClient();
  const tableName = getPhoneDataTableName();
  const normalizedPhone = normalizePhoneDigits(phone);
  const phoneIndex = process.env.PHONE_DATA_PHONE_GSI;

  if (!normalizedPhone) {
    return [];
  }

  if (phoneIndex) {
    const items: Record<string, unknown>[] = [];
    let lastEvaluatedKey: QueryCommandInput['ExclusiveStartKey'];

    do {
      const response = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: phoneIndex,
          KeyConditionExpression: 'phone = :phone',
          ExpressionAttributeValues: {
            ':phone': normalizedPhone,
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      if (response.Items?.length) {
        items.push(...(response.Items as Record<string, unknown>[]));
      }
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items.map(mapItem);
  }

  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: ScanCommandInput['ExclusiveStartKey'];
  let pages = 0;

  do {
    const response = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'phone = :phone',
        ExpressionAttributeValues: {
          ':phone': normalizedPhone,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (response.Items?.length) {
      items.push(...(response.Items as Record<string, unknown>[]));
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
    pages += 1;
  } while (lastEvaluatedKey && pages < SCAN_PAGE_LIMIT);

  return items.map(mapItem);
}

export async function searchPhoneData(params: {
  cnic?: string | null;
  phone?: string | null;
}): Promise<PhoneDataRecord[]> {
  const cnic = params.cnic ? normalizeCnicDigits(params.cnic) : '';
  const phone = params.phone ? normalizePhoneDigits(params.phone) : '';

  if (cnic && phone) {
    const record = await getPhoneDataRecord(cnic, phone);
    return record ? [record] : [];
  }
  if (cnic) {
    return searchPhoneDataByCnic(cnic);
  }
  if (phone) {
    return searchPhoneDataByPhone(phone);
  }
  return [];
}
