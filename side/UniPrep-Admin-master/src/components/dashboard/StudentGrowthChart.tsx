'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { dashboardService } from '@/services/dashboardService';
import type { StudentGrowthData } from '@/types';

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
        <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-gray-600">Total Students:</span>
            <span className="text-sm font-bold text-blue-600">
              {payload[0].value}
            </span>
          </div>
          {payload[0].payload.new_students && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-600">New Today:</span>
              <span className="text-sm font-semibold text-green-600">
                +{payload[0].payload.new_students}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export function StudentGrowthChart() {
  const [data, setData] = useState<StudentGrowthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const response = await dashboardService.getStudentGrowth(30);
    if (response.success && response.data) {
      setData(response.data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        <p>No student growth data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorStudents" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <YAxis 
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area 
          type="monotone" 
          dataKey="cumulative_students" 
          stroke="#3b82f6" 
          strokeWidth={2}
          fill="url(#colorStudents)" 
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
