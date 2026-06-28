import type { FeatureFlags } from '@/services/aiConfigService';

interface Props {
  flags: FeatureFlags;
  onChange: (flags: FeatureFlags) => void;
}

// Feature display names and descriptions
const featureInfo: Record<string, { name: string; description: string }> = {
  answer_explanation: {
    name: 'AI Explain',
    description: 'Provides AI-powered explanations for wrong answers in quiz and exam reviews',
  },
  question_generation: {
    name: 'AI Generate Questions',
    description: 'Generates adaptive AI questions for Competitive Mode practice sessions',
  },
  student_insights: {
    name: 'AI Insights',
    description: 'Provides personalized study insights and recommendations based on performance',
  },
  prompt_testing: {
    name: 'Prompt Testing',
    description: 'Allows testing AI prompts in the Prompt Library (Admin only)',
  },
  quality_review: {
    name: 'Quality Review',
    description: 'Automatically flags low-quality AI responses for manual review',
  },
};

export default function FeaturesTab({ flags, onChange }: Props) {
  return (
    <div className="space-y-4">
      {Object.entries(flags).map(([featureName, featureConfig]) => {
        const info = featureInfo[featureName] || {
          name: featureName.replace(/_/g, ' '),
          description: 'AI feature configuration',
        };

        return (
          <div key={featureName} className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-900">
                    {info.name}
                  </h4>
                  <div className="group relative">
                    <svg
                      className="w-4 h-4 text-gray-400 cursor-help"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                      {info.description}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-1">{info.description}</p>
                {featureConfig.beta && (
                  <span className="inline-block px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded mt-1">
                    Beta
                  </span>
                )}
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={featureConfig.enabled}
                  onChange={(e) => onChange({
                    ...flags,
                    [featureName]: { ...featureConfig, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {featureConfig.allowed_models && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Allowed models:</span>{' '}
                {featureConfig.allowed_models.join(', ')}
              </div>
            )}

            {featureConfig.admin_only && (
              <div className="text-sm text-orange-600 mt-1">
                ⚠️ Admin only
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
