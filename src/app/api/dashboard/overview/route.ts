import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import { unauthorizedResponse } from '@/lib/auth';
import {
  buildHalkaFilter,
  getAllowedHalkaName,
  hasAllConstituencyAccess,
} from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

interface PageStats {
  total: number;
  completed: number;
  processing: number;
  error: number;
  uploaded: number;
}

interface ConstituencyOverview {
  _id: string;
  halkaName: string;
  status: string;
  totalVoters: number;
  muslimFemale: number;
  muslimMale: number;
  qadianiFemale: number;
  qadianiMale: number;
  blockCodeCount: number;
  lastUpdated: string | null;
  pages: PageStats;
}

function emptyPageStats(): PageStats {
  return { total: 0, completed: 0, processing: 0, error: 0, uploaded: 0 };
}

export async function GET(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const halkaFilter = buildHalkaFilter(sessionUser);

    const constituencies = await Constituency.find({
      deletedAt: null,
      ...halkaFilter,
    })
      .sort({ halkaName: 1 })
      .lean();

    const client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');

    const pageStatsByHalka = new Map<string, PageStats>();
    try {
      const matchStage =
        Object.keys(halkaFilter).length > 0 ? { $match: halkaFilter } : { $match: {} };

      const rows = await db
        .collection('blockcodes')
        .aggregate([
          matchStage,
          {
            $group: {
              _id: '$halkaName',
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
              },
              processing: {
                $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] },
              },
              error: {
                $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
              },
              uploaded: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        '$status',
                        ['uploaded', 'completed', 'processing', 'error'],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray();

      for (const row of rows) {
        pageStatsByHalka.set(String(row._id), {
          total: row.total ?? 0,
          completed: row.completed ?? 0,
          processing: row.processing ?? 0,
          error: row.error ?? 0,
          uploaded: row.uploaded ?? 0,
        });
      }
    } finally {
      await client.close();
    }

    const items: ConstituencyOverview[] = constituencies.map((doc) => {
      const pages = pageStatsByHalka.get(doc.halkaName) ?? emptyPageStats();
      return {
        _id: String(doc._id),
        halkaName: doc.halkaName,
        status: doc.status ?? 'active',
        totalVoters: doc.totalVoters ?? 0,
        muslimFemale: doc.muslimFemale ?? 0,
        muslimMale: doc.muslimMale ?? 0,
        qadianiFemale: doc.qadianiFemale ?? 0,
        qadianiMale: doc.qadianiMale ?? 0,
        blockCodeCount: doc.blockCodes?.length ?? 0,
        lastUpdated: doc.lastUpdated ? new Date(doc.lastUpdated).toISOString() : null,
        pages,
      };
    });

    const summary = items.reduce(
      (acc, item) => {
        acc.constituencyCount += 1;
        if (item.status === 'active') {
          acc.activeCount += 1;
        }
        acc.totalVoters += item.totalVoters;
        acc.totalBlockCodes += item.blockCodeCount;
        acc.pagesTotal += item.pages.total;
        acc.pagesUploaded += item.pages.uploaded;
        acc.pagesCompleted += item.pages.completed;
        acc.pagesProcessing += item.pages.processing;
        acc.pagesError += item.pages.error;
        return acc;
      },
      {
        constituencyCount: 0,
        activeCount: 0,
        totalVoters: 0,
        totalBlockCodes: 0,
        pagesTotal: 0,
        pagesUploaded: 0,
        pagesCompleted: 0,
        pagesProcessing: 0,
        pagesError: 0,
      }
    );

    return NextResponse.json({
      access: {
        isAdmin: sessionUser.role === 'admin',
        hasAllAccess: hasAllConstituencyAccess(sessionUser),
        allowedHalkaName: getAllowedHalkaName(sessionUser),
        userName: sessionUser.name,
      },
      summary,
      constituencies: items,
    });
  } catch (error) {
    console.error('[dashboard/overview] failed:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard overview' },
      { status: 500 }
    );
  }
}
