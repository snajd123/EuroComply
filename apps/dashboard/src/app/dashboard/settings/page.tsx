'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey] = useState('ec_live_••••••••••••••••••••••••');
  const [apiKeys] = useState([
    {
      id: '1',
      name: 'Default API Key',
      prefix: 'ec_live_abc1',
      lastUsed: 'Never',
      createdAt: 'Just now',
    },
  ]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">
          Manage your organization settings and API keys
        </p>
      </div>

      {/* Organization Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Organization
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              defaultValue="My Organization"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization DID
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value="did:web:eurocomply.io:m:my-organization"
                readOnly
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
              />
              <button
                onClick={() =>
                  copyToClipboard('did:web:eurocomply.io:m:my-organization')
                }
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Copy className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Your decentralized identifier for issuing credentials
            </p>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
            <p className="text-sm text-gray-500">
              Manage your API keys for accessing the EuroComply API
            </p>
          </div>
          <button className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
            <Plus className="w-5 h-5" />
            Create Key
          </button>
        </div>

        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
            >
              <div>
                <p className="font-medium text-gray-900">{key.name}</p>
                <div className="flex items-center gap-4 mt-1">
                  <code className="text-sm text-gray-600 font-mono">
                    {key.prefix}••••••••
                  </code>
                  <span className="text-sm text-gray-500">
                    Last used: {key.lastUsed}
                  </span>
                </div>
              </div>
              <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Security:</strong> API keys are only shown once when
            created. Store them securely and never expose them in client-side
            code.
          </p>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Webhooks</h2>
            <p className="text-sm text-gray-500">
              Receive real-time notifications about events in your account
            </p>
          </div>
          <button className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            <Plus className="w-5 h-5" />
            Add Endpoint
          </button>
        </div>

        <div className="text-center py-8 text-gray-500">
          <p>No webhook endpoints configured</p>
          <p className="text-sm mt-1">
            Add a webhook endpoint to receive event notifications
          </p>
        </div>
      </div>

      {/* Integrations */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Integrations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 font-bold">S</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Shopify</h3>
                <p className="text-sm text-gray-500">Not connected</p>
              </div>
            </div>
            <button className="w-full py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              Connect Shopify
            </button>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-purple-600 font-bold">W</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">WooCommerce</h3>
                <p className="text-sm text-gray-500">Not connected</p>
              </div>
            </div>
            <button className="w-full py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              Connect WooCommerce
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Delete Organization</p>
              <p className="text-sm text-gray-500">
                Permanently delete your organization and all associated data
              </p>
            </div>
            <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
