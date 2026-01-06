'use client';

import { useState } from 'react';
import { Plus, Search, Filter, BadgeCheck, MoreVertical } from 'lucide-react';
import Link from 'next/link';

export default function CredentialsPage() {
  const [credentials] = useState<any[]>([]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credentials</h1>
          <p className="text-gray-500 mt-1">
            Issue and manage Verifiable Credentials for your workforce
          </p>
        </div>
        <Link
          href="/dashboard/credentials/new"
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Issue Credential
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search credentials..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Credentials List */}
      {credentials.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BadgeCheck className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            No credentials issued yet
          </h3>
          <p className="text-gray-500 mt-1 max-w-sm mx-auto">
            Start issuing Verifiable Credentials for employee IDs, diplomas,
            background checks, and more
          </p>
          <Link
            href="/dashboard/credentials/new"
            className="inline-flex items-center gap-2 mt-4 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Issue Your First Credential
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subject
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issued
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {credentials.map((credential) => (
                <tr key={credential.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">
                      {credential.subjectName}
                    </p>
                    <p className="text-sm text-gray-500">
                      {credential.subjectEmail}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {credential.schema?.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {credential.issuedAt}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {credential.expiresAt || 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        credential.status === 'ISSUED'
                          ? 'bg-green-100 text-green-700'
                          : credential.status === 'REVOKED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {credential.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="p-2 hover:bg-gray-100 rounded-lg">
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Credential Types */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Credential Types
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              name: 'Employee ID',
              description: 'Digital employee identification',
              count: 0,
            },
            {
              name: 'Diploma',
              description: 'Educational credentials',
              count: 0,
            },
            {
              name: 'Background Check',
              description: 'Verified background checks',
              count: 0,
            },
            {
              name: 'Professional License',
              description: 'Professional certifications',
              count: 0,
            },
            {
              name: 'Training Certificate',
              description: 'Course completions',
              count: 0,
            },
            {
              name: 'Employment Verification',
              description: 'Employment history',
              count: 0,
            },
          ].map((type) => (
            <div
              key={type.name}
              className="bg-white rounded-lg border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{type.name}</h3>
                <span className="text-sm text-gray-500">{type.count}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{type.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
