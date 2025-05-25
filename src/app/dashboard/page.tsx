'use client';

import { MotionDiv } from '@/components/ui/Motion';
import {
  ChartBarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const stats = [
  {
    name: 'Total Revenue',
    value: '$45,231.89',
    change: '+20.1%',
    icon: CurrencyDollarIcon,
  },
  {
    name: 'Active Users',
    value: '2,338',
    change: '+15.3%',
    icon: UserGroupIcon,
  },
  {
    name: 'Conversion Rate',
    value: '3.2%',
    change: '+4.75%',
    icon: ChartBarIcon,
  },
  {
    name: 'Growth',
    value: '24.5%',
    change: '+12.3%',
    icon: ArrowTrendingUpIcon,
  },
];

const recentActivity = [
  { id: 1, user: 'John Doe', action: 'Created new dataset', time: '2 minutes ago' },
  { id: 2, user: 'Jane Smith', action: 'Updated configuration', time: '5 minutes ago' },
  { id: 3, user: 'Mike Johnson', action: 'Deleted old records', time: '10 minutes ago' },
  { id: 4, user: 'Sarah Wilson', action: 'Added new user', time: '15 minutes ago' },
];

export default function Dashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <MotionDiv
              key={stat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white overflow-hidden shadow rounded-lg"
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <stat.icon className="h-6 w-6 text-gray-400" aria-hidden="true" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">{stat.name}</dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900">{stat.value}</div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-5 py-3">
                <div className="text-sm">
                  <span className="font-medium text-green-600">{stat.change}</span>
                  <span className="text-gray-500"> from last month</span>
                </div>
              </div>
            </MotionDiv>
          ))}
        </div>

        {/* Chart */}
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white shadow rounded-lg p-6"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Overview</h3>
          <div className="h-80 bg-gray-50 rounded-lg flex items-center justify-center">
            <p className="text-gray-500">Chart will be implemented here</p>
          </div>
        </MotionDiv>

        {/* Recent Activity */}
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="bg-white shadow rounded-lg"
        >
          <div className="px-6 py-5 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {recentActivity.map((activity) => (
              <li key={activity.id} className="px-6 py-4">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-indigo-600">👤</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{activity.user}</p>
                    <p className="text-sm text-gray-500 truncate">{activity.action}</p>
                  </div>
                  <div className="flex-shrink-0 text-sm text-gray-500">{activity.time}</div>
                </div>
              </li>
            ))}
          </ul>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
} 