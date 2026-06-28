/**
 * Notification Processor Testing Page
 * Phase 2: Event-Driven Notifications
 * 
 * Manual interface to test the notification processor.
 * Useful for development and testing without cron jobs.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotificationProcessorPage() {
  const [processing, setProcessing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [batching, setBatching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runProcessor = async () => {
    try {
      setProcessing(true);
      setError(null);
      setResult(null);

      const response = await fetch('/api/notifications/processor', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process notifications');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProcessing(false);
    }
  };

  const runCleanup = async () => {
    try {
      setCleaning(true);
      setError(null);
      setResult(null);

      const response = await fetch('/api/notifications/cleanup', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to run cleanup');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCleaning(false);
    }
  };

  const runBatching = async () => {
    try {
      setBatching(true);
      setError(null);
      setResult(null);

      const response = await fetch('/api/notifications/batch', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to run batching');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBatching(false);
    }
  };

  const checkStatus = async () => {
    try {
      setProcessing(true);
      setError(null);

      const response = await fetch('/api/notifications/processor');
      const data = await response.json();

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/notifications">
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-900 dark:text-white" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Notification Processor
            </h1>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Manually trigger notification processing for testing
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Actions</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={runProcessor}
            disabled={processing || cleaning || batching}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? '⏳ Processing...' : '📤 Process Queue'}
          </button>

          <button
            onClick={runCleanup}
            disabled={processing || cleaning || batching}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cleaning ? '⏳ Cleaning...' : '🧹 Run Cleanup'}
          </button>

          <button
            onClick={runBatching}
            disabled={processing || cleaning || batching}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {batching ? '⏳ Batching...' : '📦 Batch Similar'}
          </button>

          <button
            onClick={checkStatus}
            disabled={processing || cleaning || batching}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            📊 Check Status
          </button>
        </div>

        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <p>• <strong>Process Queue:</strong> Processes pending notifications in the queue</p>
          <p>• <strong>Run Cleanup:</strong> Removes old rate limits, deduplication records, and invalid tokens</p>
          <p>• <strong>Batch Similar:</strong> Combines similar notifications to reduce spam</p>
          <p>• <strong>Check Status:</strong> Checks if processor is available</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
            Error
          </h3>
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Result</h3>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg shadow p-6 mt-6">
        <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
          💡 How to Test
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-blue-700 dark:text-blue-300">
          <li>Create a test notification in the queue (via SQL or trigger)</li>
          <li>Click "Process Queue" to process pending notifications</li>
          <li>Check the result to see if notifications were sent</li>
          <li>Verify notifications appear in the mobile app</li>
        </ol>

        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
          <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            Quick Test SQL
          </h4>
          <pre className="bg-white dark:bg-gray-900 p-3 rounded text-xs overflow-auto">
{`-- Insert test notification
INSERT INTO notification_queue (
  user_id, notification_type, priority,
  channels, title, body
) VALUES (
  'your-user-id'::UUID,
  'test',
  5,
  ARRAY['in_app', 'push'],
  'Test Notification',
  'This is a test from processor page'
);`}
          </pre>
        </div>
      </div>
    </div>
  );
}
