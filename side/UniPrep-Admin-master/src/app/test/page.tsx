'use client';

export default function TestPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Environment Variables Test</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Environment Variables Status</h2>
          
          <div className="space-y-4">
            <div className="border-b pb-4">
              <p className="font-medium text-gray-700">NEXT_PUBLIC_SUPABASE_URL</p>
              <p className={`mt-2 ${supabaseUrl ? 'text-green-600' : 'text-red-600'}`}>
                {supabaseUrl ? `✅ Loaded: ${supabaseUrl.substring(0, 30)}...` : '❌ NOT LOADED'}
              </p>
            </div>
            
            <div className="border-b pb-4">
              <p className="font-medium text-gray-700">NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
              <p className={`mt-2 ${supabaseKey ? 'text-green-600' : 'text-red-600'}`}>
                {supabaseKey ? `✅ Loaded: ${supabaseKey.substring(0, 30)}...` : '❌ NOT LOADED'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">If variables are NOT LOADED:</h3>
          <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
            <li>Make sure your .env file is in the root folder (next to package.json)</li>
            <li>File should be named exactly <code className="bg-blue-100 px-1">.env</code> or <code className="bg-blue-100 px-1">.env.local</code></li>
            <li>Variables must start with <code className="bg-blue-100 px-1">NEXT_PUBLIC_</code> for client-side access</li>
            <li>Stop the dev server (Ctrl+C) and restart: <code className="bg-blue-100 px-1">npm run dev</code></li>
            <li>Hard refresh browser: Ctrl+Shift+R</li>
          </ol>
        </div>

        <div className="mt-6">
          <a 
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
