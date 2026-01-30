import React from 'react';
import { Calendar } from 'lucide-react';

export type PeriodOption = '1q' | '1y' | 'all';

interface PeriodSelectorProps {
  value: PeriodOption;
  onChange: (value: PeriodOption) => void;
  options?: PeriodOption[];
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({ 
  value, 
  onChange, 
  options = ['1q', '1y', 'all'] 
}) => {
  const labels: Record<PeriodOption, string> = {
    '1q': 'Último Trimestre',
    '1y': 'Último Ano',
    'all': 'Todo o Período'
  };

  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
      <Calendar size={16} className="text-slate-500" />
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value as PeriodOption)}
        className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{labels[opt]}</option>
        ))}
      </select>
    </div>
  );
};