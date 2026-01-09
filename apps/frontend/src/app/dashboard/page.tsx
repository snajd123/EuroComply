import {
  Package,
  QrCode,
  BadgeCheck,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import Link from 'next/link';

type ChangeType = 'positive' | 'negative' | 'neutral';

const stats: Array<{
  name: string;
  value: string;
  change: string;
  changeType: ChangeType;
  href: string;
  icon: typeof Package;
  color: string;
}> = [
  {
    name: 'Total Products',
    value: '0',
    change: '+0%',
    changeType: 'neutral',
    href: '/dashboard/products',
    icon: Package,
    color: 'bg-blue-500',
  },
  {
    name: 'Active Passports',
    value: '0',
    change: '+0%',
    changeType: 'neutral',
    href: '/dashboard/passports',
    icon: QrCode,
    color: 'bg-purple-500',
  },
  {
    name: 'Credentials Issued',
    value: '0',
    change: '+0%',
    changeType: 'neutral',
    href: '/dashboard/credentials',
    icon: BadgeCheck,
    color: 'bg-green-500',
  },
  {
    name: 'Verified Merchants',
    value: '0',
    change: '+0%',
    changeType: 'neutral',
    href: '/dashboard/merchants',
    icon: Building2,
    color: 'bg-orange-500',
  },
];

const quickActions = [
  {
    title: 'Create Product',
    description: 'Add a new product to your catalog',
    href: '/dashboard/products/new',
    icon: Package,
  },
  {
    title: 'Issue Passport',
    description: 'Generate a Digital Product Passport',
    href: '/dashboard/passports/new',
    icon: QrCode,
  },
  {
    title: 'Issue Credential',
    description: 'Create a verifiable credential',
    href: '/dashboard/credentials/new',
    icon: BadgeCheck,
  },
  {
    title: 'Verify Merchant',
    description: 'Start KYB verification process',
    href: '/dashboard/merchants/verify',
    icon: Building2,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome to EuroComply. Monitor your compliance status and manage your
          trust infrastructure.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.name}
            href={stat.href}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div
                className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center`}
              >
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <div
                className={`flex items-center gap-1 text-sm ${
                  stat.changeType === 'positive'
                    ? 'text-green-600'
                    : stat.changeType === 'negative'
                      ? 'text-red-600'
                      : 'text-gray-500'
                }`}
              >
                {stat.change}
                {stat.changeType === 'positive' && (
                  <ArrowUpRight className="w-4 h-4" />
                )}
                {stat.changeType === 'negative' && (
                  <ArrowDownRight className="w-4 h-4" />
                )}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.name}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:border-primary-300 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 bg-gray-100 group-hover:bg-primary-50 rounded-lg flex items-center justify-center mb-4">
                <action.icon className="w-5 h-5 text-gray-600 group-hover:text-primary-600" />
              </div>
              <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
                {action.title}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{action.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity & Compliance Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Activity
          </h2>
          <div className="text-center py-8 text-gray-500">
            <p>No recent activity</p>
            <p className="text-sm mt-1">
              Activity will appear here once you start using the platform
            </p>
          </div>
        </div>

        {/* Compliance Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Compliance Status
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span className="text-sm text-gray-700">ESPR Readiness</span>
              </div>
              <span className="text-sm font-medium text-gray-500">
                Not Started
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span className="text-sm text-gray-700">eIDAS 2.0 Setup</span>
              </div>
              <span className="text-sm font-medium text-gray-500">
                Not Started
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span className="text-sm text-gray-700">DSA Compliance</span>
              </div>
              <span className="text-sm font-medium text-gray-500">
                Not Started
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Getting Started Guide */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-2">Getting Started</h2>
        <p className="text-primary-100 mb-4">
          Complete these steps to start issuing compliant Digital Product
          Passports
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-2xl font-bold">1</div>
            <h3 className="font-medium mt-2">Add Your First Product</h3>
            <p className="text-sm text-primary-100 mt-1">
              Create a product in your catalog to get started
            </p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-2xl font-bold">2</div>
            <h3 className="font-medium mt-2">Generate a Passport</h3>
            <p className="text-sm text-primary-100 mt-1">
              Issue a Digital Product Passport with QR code
            </p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-2xl font-bold">3</div>
            <h3 className="font-medium mt-2">Connect Your Store</h3>
            <p className="text-sm text-primary-100 mt-1">
              Integrate with Shopify or WooCommerce
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
