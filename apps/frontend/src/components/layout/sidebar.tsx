'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  QrCode,
  BadgeCheck,
  Building2,
  Settings,
  FileText,
  Shield,
  LucideIcon,
} from 'lucide-react';

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

type NavGroup = {
  name: string;
  items: NavItem[];
};

type NavigationItem = NavItem | NavGroup;

const navigation: NavigationItem[] = [
  {
    name: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'ProductTrust',
    items: [
      { name: 'Products', href: '/dashboard/products', icon: Package },
      { name: 'Passports', href: '/dashboard/passports', icon: QrCode },
      { name: 'Reports', href: '/dashboard/reports', icon: FileText },
    ],
  },
  {
    name: 'WorkforceTrust',
    items: [
      { name: 'Credentials', href: '/dashboard/credentials', icon: BadgeCheck },
    ],
  },
  {
    name: 'MerchantTrust',
    items: [
      { name: 'Merchants', href: '/dashboard/merchants', icon: Building2 },
      { name: 'KYB/Compliance', href: '/dashboard/compliance', icon: Shield },
    ],
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">EC</span>
          </div>
          <span className="font-semibold text-gray-900">EuroComply</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          if ('items' in item) {
            const group = item as NavGroup;
            return (
              <div key={group.name} className="pt-4 first:pt-0">
                <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {group.name}
                </h3>
                <div className="mt-2 space-y-1">
                  {group.items.map((subItem) => {
                    const isActive = pathname === subItem.href;
                    const Icon = subItem.icon;
                    return (
                      <Link
                        key={subItem.name}
                        href={subItem.href}
                        className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        {subItem.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          } else {
            const navItem = item as NavItem;
            const Icon = navItem.icon;
            return (
              <Link
                key={navItem.name}
                href={navItem.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                  pathname === navItem.href
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                {navItem.name}
              </Link>
            );
          }
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Free Plan</p>
          <p className="text-sm font-medium text-gray-900">0 / 100 passports</p>
          <Link
            href="/dashboard/settings/billing"
            className="mt-2 block text-xs text-primary-600 hover:text-primary-700"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </div>
  );
}
