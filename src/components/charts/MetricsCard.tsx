import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface MetricsCardProps {
  title: string;
  value: string;
  trend: number;
  trendLabel?: string;
  color?: 'blue' | 'indigo' | 'slate' | 'emerald';
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, trend, trendLabel = "vs. trimestre anterior", color = 'blue' }) => {
  const isPositive = trend > 0;
  const isNeutral = trend === 0;

  const colorClasses = {
    blue: 'border-l-blue-500',
    indigo: 'border-l-indigo-500',
    slate: 'border-l-slate-500',
    emerald: 'border-l-emerald-500',
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-100 p-6 border-l-4 ${colorClasses[color]}`}>
      <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-900">{value}</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span 
          className={`flex items-center gap-1 font-medium rounded-full px-2 py-0.5 ${
            isPositive ? 'bg-green-100 text-green-700' : isNeutral ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-700'
          }`}
        >
          {isPositive ? <ArrowUpRight size={14} /> : isNeutral ? <Minus size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(trend)}%
        </span>
        <span className="text-slate-400">{trendLabel}</span>
      </div>
    </div>
  );
};