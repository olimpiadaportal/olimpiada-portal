'use client';

import { useState, useEffect } from 'react';
import SettingCard from './SettingCard';

interface PaymentSettingsTabProps {
  settings: Record<string, any>;
  onSave: (key: string, value: any, reason?: string) => Promise<boolean>;
  saving: boolean;
}

function SaveButton({ settingKey, savingKey, onSave }: { settingKey: string; savingKey: string | null; onSave: (k: string) => void }) {
  return (
    <button
      onClick={() => onSave(settingKey)}
      disabled={savingKey === settingKey}
      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
    >
      {savingKey === settingKey ? 'Saving...' : 'Save'}
    </button>
  );
}

export default function PaymentSettingsTab({ settings, onSave, saving }: PaymentSettingsTabProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showPublishableKey, setShowPublishableKey] = useState(false);

  // Sync localSettings when parent settings change (e.g., after reload)
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (key: string, value: any) => {
    setLocalSettings((prev: Record<string, any>) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string, valueOverride?: any) => {
    setSavingKey(key);
    // Use valueOverride if provided (for immediate toggle saves), otherwise use localSettings
    const valueToSave = valueOverride !== undefined ? valueOverride : localSettings[key];
    const success = await onSave(key, valueToSave);
    setSavingKey(null);
    return success;
  };

  // Combined handler for toggle switches - updates state and saves in one action
  const handleToggle = async (key: string) => {
    const newValue = !localSettings[key];
    setLocalSettings((prev: Record<string, any>) => ({ ...prev, [key]: newValue }));
    setSavingKey(key);
    const success = await onSave(key, newValue);
    setSavingKey(null);
    // If save failed, revert the toggle
    if (!success) {
      setLocalSettings((prev: Record<string, any>) => ({ ...prev, [key]: !newValue }));
    }
  };

  const stripeMode = localSettings.stripe_mode || 'test';
  const isLive = stripeMode === 'live';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Payment Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure Stripe integration, commission rates, and payout rules.
        </p>
      </div>

      {/* ── Stripe Configuration ─────────────────────────────── */}
      <SettingCard
        title="Stripe Configuration"
        description="Connect your Stripe account. Secret key and webhook secret are stored in Supabase Edge Function secrets — never here."
        variant="info"
      >
        <div className="space-y-5">
          {/* Mode toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Stripe Mode</label>
              <SaveButton settingKey="stripe_mode" savingKey={savingKey} onSave={handleSave} />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleChange('stripe_mode', 'test')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  !isLive
                    ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                🧪 Test Mode
              </button>
              <button
                onClick={() => handleChange('stripe_mode', 'live')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  isLive
                    ? 'bg-green-50 border-green-500 text-green-800'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                🚀 Live Mode
              </button>
            </div>
            {isLive && (
              <p className="text-xs text-red-600 font-medium">
                ⚠️ Live mode is active — real cards will be charged.
              </p>
            )}
            {!isLive && (
              <p className="text-xs text-yellow-700">
                Test mode: use Stripe test cards (e.g. 4242 4242 4242 4242). No real charges.
              </p>
            )}
          </div>

          {/* Publishable key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Stripe Publishable Key
                <span className="ml-2 text-xs text-gray-400 font-normal">(safe to expose to clients)</span>
              </label>
              <SaveButton settingKey="stripe_publishable_key" savingKey={savingKey} onSave={handleSave} />
            </div>
            <div className="relative">
              <input
                type={showPublishableKey ? 'text' : 'password'}
                value={localSettings.stripe_publishable_key || ''}
                onChange={(e) => handleChange('stripe_publishable_key', e.target.value)}
                placeholder={isLive ? 'pk_live_...' : 'pk_test_...'}
                className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPublishableKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showPublishableKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              From Stripe Dashboard → Developers → API keys. Starts with <code>pk_test_</code> or <code>pk_live_</code>.
            </p>
          </div>

          {/* Secret key reminder */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800 font-medium">🔒 Secret Key & Webhook Secret</p>
            <p className="text-xs text-amber-700 mt-1">
              These are <strong>never stored here</strong>. Add them to Supabase Edge Function secrets:
            </p>
            <code className="block mt-2 text-xs bg-amber-100 rounded p-2 text-amber-900">
              supabase secrets set STRIPE_SECRET_KEY=sk_{'{test|live}'}_...<br />
              supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
            </code>
          </div>
        </div>
      </SettingCard>

      {/* ── Revenue Activation ───────────────────────────────── */}
      <SettingCard
        title="Revenue Activation"
        description="Control when paid features go live. Both are off at launch — flip when ready."
        variant="warning"
      >
        <div className="space-y-5">
          {/* Bookings paid toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-800">Teacher Booking Payments</p>
              <p className="text-xs text-gray-500 mt-0.5">
                When ON, bookings require Stripe payment. Currently: <strong>price = 0 (free)</strong>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                localSettings.bookings_paid
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {localSettings.bookings_paid ? 'PAID' : 'FREE'}
              </span>
              <button
                onClick={() => handleToggle('bookings_paid')}
                disabled={savingKey === 'bookings_paid'}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  localSettings.bookings_paid ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.bookings_paid ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>

          {/* Subscriptions toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-800">Subscription Billing</p>
              <p className="text-xs text-gray-500 mt-0.5">
                When ON, Plus/Pro tiers require Stripe subscription. Free tier always available.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                localSettings.subscriptions_enabled
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {localSettings.subscriptions_enabled ? 'LIVE' : 'OFF'}
              </span>
              <button
                onClick={() => handleToggle('subscriptions_enabled')}
                disabled={savingKey === 'subscriptions_enabled'}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  localSettings.subscriptions_enabled ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.subscriptions_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      </SettingCard>

      {/* ── Commission & Fees ────────────────────────────────── */}
      <SettingCard
        title="Commission & Fees"
        description="Platform commission deducted from teacher earnings on each paid booking."
        variant="info"
      >
        <div className="space-y-4">
          {/* Commission Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Commission Rate</label>
              <SaveButton settingKey="commission_rate" savingKey={savingKey} onSave={handleSave} />
            </div>
            <input
              type="number"
              value={localSettings.commission_rate || ''}
              onChange={(e) => handleChange('commission_rate', e.target.value ? parseFloat(e.target.value) : 0)}
              step="0.01"
              min="0"
              max="1"
              placeholder="0.15"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">
              0.15 = 15% &nbsp;·&nbsp; 0.20 = 20% &nbsp;·&nbsp; Current:{' '}
              <strong>{Math.round((localSettings.commission_rate || 0.15) * 100)}%</strong>
            </p>
          </div>

          {/* Minimum Payout */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Minimum Payout Amount (EUR)</label>
              <SaveButton settingKey="min_payout_amount" savingKey={savingKey} onSave={handleSave} />
            </div>
            <input
              type="number"
              value={localSettings.min_payout_amount || ''}
              onChange={(e) => handleChange('min_payout_amount', e.target.value ? parseInt(e.target.value) : 0)}
              placeholder="50"
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">Minimum balance required before a teacher can request payout.</p>
          </div>

          {/* Payout Schedule */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Payout Schedule</label>
              <SaveButton settingKey="payout_schedule" savingKey={savingKey} onSave={handleSave} />
            </div>
            <select
              value={localSettings.payout_schedule || 'manual'}
              onChange={(e) => handleChange('payout_schedule', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="manual">Manual (admin approves each request)</option>
              <option value="monthly">Monthly (auto-process on 1st of month)</option>
              <option value="weekly">Weekly (auto-process every Monday)</option>
            </select>
            <p className="text-sm text-gray-500">How teacher payout requests are processed.</p>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Charge Currency</label>
              <SaveButton settingKey="currency" savingKey={savingKey} onSave={handleSave} />
            </div>
            <select
              value={localSettings.currency || 'EUR'}
              onChange={(e) => handleChange('currency', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="EUR">EUR - Euro (€) — Stripe Italy account</option>
              <option value="USD">USD - US Dollar ($)</option>
              <option value="AZN">AZN - Azerbaijani Manat (₼) — display only</option>
            </select>
            <p className="text-sm text-gray-500">
              Currency used for Stripe charges. Since your Stripe account is Italian, EUR is recommended.
              AZN display is handled client-side via exchange rate.
            </p>
          </div>
        </div>
      </SettingCard>

      {/* ── Subscription Tiers Info ──────────────────────────── */}
      <SettingCard
        title="Subscription Tiers"
        description="Free / Plus / Pro tiers. Schema is ready — billing activates when subscriptions_enabled is ON."
        variant="info"
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { name: 'Free', price: '€0/mo', color: 'gray', features: ['3 bookings/mo', '20 AI explanations', 'Practice & exams'] },
            { name: 'Plus', price: '€9.99/mo', color: 'blue', features: ['10 bookings/mo', 'Unlimited AI', 'Score prediction'] },
            { name: 'Pro', price: '€19.99/mo', color: 'purple', features: ['Unlimited bookings', 'Priority matching', 'Advanced analytics'] },
          ].map((tier) => (
            <div key={tier.name} className={`p-3 rounded-lg border-2 ${
              tier.color === 'gray' ? 'border-gray-200 bg-gray-50' :
              tier.color === 'blue' ? 'border-blue-200 bg-blue-50' :
              'border-purple-200 bg-purple-50'
            }`}>
              <p className={`font-semibold text-sm ${
                tier.color === 'gray' ? 'text-gray-700' :
                tier.color === 'blue' ? 'text-blue-700' : 'text-purple-700'
              }`}>{tier.name}</p>
              <p className={`text-xs font-medium mt-0.5 ${
                tier.color === 'gray' ? 'text-gray-500' :
                tier.color === 'blue' ? 'text-blue-600' : 'text-purple-600'
              }`}>{tier.price}</p>
              <ul className="mt-2 space-y-1">
                {tier.features.map((f) => (
                  <li key={f} className="text-xs text-gray-600">· {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          To update tier features or Stripe Product IDs, edit the <code>subscription_tiers</code> table directly in Supabase.
        </p>
      </SettingCard>
    </div>
  );
}
