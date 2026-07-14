import {
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Card, CardContent } from '@/components/ui/card';

interface UsersStatsBarProps {
  totalUsers: number;
  adminCount: number;
  regularCount: number;
  isLoading: boolean;
}

const stats = [
  {
    key: 'total',
    label: 'Web users',
    icon: UsersIcon,
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    key: 'admins',
    label: 'Admins',
    icon: ShieldCheckIcon,
    color: 'text-violet-600 bg-violet-50',
  },
  {
    key: 'regular',
    label: 'Team members',
    icon: UserGroupIcon,
    color: 'text-sky-600 bg-sky-50',
  },
  {
    key: 'mobile',
    label: 'Mobile app',
    icon: DevicePhoneMobileIcon,
    color: 'text-emerald-600 bg-emerald-50',
    hint: 'Field login codes',
  },
] as const;

export function UsersStatsBar({ totalUsers, adminCount, regularCount, isLoading }: UsersStatsBarProps) {
  const values: Record<string, number | string> = {
    total: totalUsers,
    admins: adminCount,
    regular: regularCount,
    mobile: '—',
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.key} className="border-gray-100 shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold tracking-tight text-gray-900">
                  {isLoading ? (
                    <span className="inline-block h-7 w-12 animate-pulse rounded bg-gray-100" />
                  ) : (
                    values[stat.key]
                  )}
                </p>
                {'hint' in stat && stat.hint ? (
                  <p className="text-xs text-gray-400">{stat.hint}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
