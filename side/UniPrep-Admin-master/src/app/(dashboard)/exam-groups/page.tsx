'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { examGroupService, ExamGroup } from '@/services/examGroupService';
import { useToast } from '@/contexts/ToastContext';

export default function ExamGroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<ExamGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const result = await examGroupService.getExamGroups();
    if (result.success && result.data) {
      setGroups(result.data);
    } else {
      toast.error(result.error || 'Failed to load exam groups');
    }
    setLoading(false);
  };

  const getStageSubjectCount = (group: ExamGroup, stage: 'first' | 'second') => {
    return group.subjects?.filter(s => s.stage === stage && s.is_active).length || 0;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Exam Groups</h1>
        <p className="text-gray-600 mt-2">
          Configure exam groups with Stage I and Stage II subjects and coefficients
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 flex items-center gap-2">
            📗 Stage I (First Stage)
          </h3>
          <p className="text-sm text-green-700 mt-1">
            3 subjects • Coefficient 1.0 each • Total: 300 points
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 flex items-center gap-2">
            📘 Stage II (Second Stage)
          </h3>
          <p className="text-sm text-blue-700 mt-1">
            3 subjects • 2×1.5 + 1×1.0 coefficient • Total: 400 points
          </p>
        </div>
      </div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => {
          const stageICount = getStageSubjectCount(group, 'first');
          const stageIICount = getStageSubjectCount(group, 'second');
          
          return (
            <Link
              key={group.id}
              href={`/exam-groups/${group.id}`}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden group"
            >
              {/* Group Header */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{group.code}</h2>
                    <p className="text-indigo-100 text-sm">{group.name_en}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-indigo-200">Total Max</div>
                    <div className="text-xl font-bold">
                      {group.first_stage_max_points + (group.has_second_stage ? group.second_stage_max_points : 0)} pts
                    </div>
                  </div>
                </div>
              </div>

              {/* Group Content */}
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {group.description || 'No description'}
                </p>

                {/* Stage Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xs text-green-600 font-medium">Stage I</div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-green-700">{stageICount}</span>
                      <span className="text-sm text-green-600">/ 3 subjects</span>
                    </div>
                    <div className="text-xs text-green-500 mt-1">{group.first_stage_max_points} pts</div>
                  </div>
                  <div className={`rounded-lg p-3 ${group.has_second_stage ? 'bg-blue-50' : 'bg-gray-100'}`}>
                    <div className={`text-xs font-medium ${group.has_second_stage ? 'text-blue-600' : 'text-gray-400'}`}>
                      Stage II
                    </div>
                    {group.has_second_stage ? (
                      <>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-bold text-blue-700">{stageIICount}</span>
                          <span className="text-sm text-blue-600">/ 3 subjects</span>
                        </div>
                        <div className="text-xs text-blue-500 mt-1">{group.second_stage_max_points} pts</div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-400 mt-1">Not applicable</div>
                    )}
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2 mt-4">
                  {stageICount === 3 ? (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                      ✓ Stage I Complete
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                      ⚠ Stage I: {3 - stageICount} missing
                    </span>
                  )}
                  {group.has_second_stage && (
                    stageIICount === 3 ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                        ✓ Stage II Complete
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                        ⚠ Stage II: {3 - stageIICount} missing
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Hover Arrow */}
              <div className="px-6 py-3 bg-gray-50 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">Click to configure</span>
                <span className="text-gray-400 group-hover:text-indigo-600 transition-colors">→</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Empty State */}
      {groups.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📚</div>
          <h3 className="text-xl font-semibold text-gray-700">No Exam Groups Found</h3>
          <p className="text-gray-500 mt-2">Run the SQL migration to create default groups.</p>
        </div>
      )}
    </div>
  );
}
