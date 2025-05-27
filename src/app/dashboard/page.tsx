'use client';

import { MotionDiv } from '@/components/ui/Motion';
import {
  DocumentTextIcon,
  UserGroupIcon,
  MapIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const stats = [
  {
    name: 'Total Voters Processed',
    value: '1,234,567',
    change: '+15.3%',
    icon: DocumentTextIcon,
  },
  {
    name: 'Families Identified',
    value: '456,789',
    change: '+12.1%',
    icon: UserGroupIcon,
  },
  {
    name: 'Areas Analyzed',
    value: '789',
    change: '+8.4%',
    icon: MapIcon,
  },
  {
    name: 'Social Profiles Linked',
    value: '234,567',
    change: '+18.7%',
    icon: LinkIcon,
  },
];

const recentActivity = [
  { id: 1, user: 'Admin', action: 'Uploaded new voter list from Karachi', time: '2 minutes ago' },
  { id: 2, user: 'System', action: 'Completed family analysis for Lahore district', time: '5 minutes ago' },
  { id: 3, user: 'Admin', action: 'Generated density report for Islamabad', time: '10 minutes ago' },
  { id: 4, user: 'System', action: 'Updated social media profiles for 1,234 voters', time: '15 minutes ago' },
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
          <h3 className="text-lg font-medium text-gray-900 mb-4">Voter Distribution by Region</h3>
          <div className="h-80 bg-gray-50 rounded-lg flex items-center justify-center">
            <p className="text-gray-500">Voter distribution chart will be implemented here</p>
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

        {/* Tools Section */}
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="bg-white shadow rounded-lg"
        >
          <div className="px-6 py-5 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Tools</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 cursor-pointer transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Upload Voter List</h4>
                    <p className="text-sm text-gray-500">Upload and process new voter lists</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 cursor-pointer transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Data Analysis</h4>
                    <p className="text-sm text-gray-500">Analyze voter data and generate insights</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 cursor-pointer transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Validation Tools</h4>
                    <p className="text-sm text-gray-500">Validate and verify voter information</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
} 