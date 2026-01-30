import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';

// Mock data sets to simulate different time periods
const dataRadarYearly = [
  { subject: 'Market Share', A: 120, B: 110, fullMark: 150 },
  { subject: 'Crescimento', A: 98, B: 130, fullMark: 150 },
  { subject: 'Ticket Médio', A: 86, B: 130, fullMark: 150 },
  { subject: 'Inovação', A: 99, B: 100, fullMark: 150 },
  { subject: 'Satisfação', A: 85, B: 90, fullMark: 150 },
  { subject: 'Liquidez', A: 65, B: 85, fullMark: 150 },
];

const dataRadarQuarterly = [
  { subject: 'Market Share', A: 125, B: 105, fullMark: 150 },
  { subject: 'Crescimento', A: 110, B: 120, fullMark: 150 },
  { subject: 'Ticket Médio', A: 90, B: 125, fullMark: 150 },
  { subject: 'Inovação', A: 105, B: 95, fullMark: 150 },
  { subject: 'Satisfação', A: 88, B: 88, fullMark: 150 },
  { subject: 'Liquidez', A: 70, B: 80, fullMark: 150 },
];

const competitorDataYearly = [
  { name: 'Nossa Adm.', share: 18.5, growth: 12 },
  { name: 'Concorrente A', share: 22.1, growth: 8 },
  { name: 'Concorrente B', share: 15.3, growth: 15 },
  { name: 'Concorrente C', share: 10.2, growth: 5 },
  { name: 'Outros', share: 33.9, growth: 3 },
];

const competitorDataQuarterly = [
  { name: 'Nossa Adm.', share: 19.2, growth: 14.5 },
  { name: 'Concorrente A', share: 21.5, growth: 6.2 },
  { name: 'Concorrente B', share: 14.8, growth: 16.1 },
  { name: 'Concorrente C', share: 10.5, growth: 4.8 },
  { name: 'Outros', share: 34.0, growth: 2.5 },
];

export const CompetitiveAnalysis: React.FC = () => {
  const [period, setPeriod] = useState<PeriodOption>('1y');

  const { radarData, barData } = useMemo(() => {
    if (period === '1q') {
      return { radarData: dataRadarQuarterly, barData: competitorDataQuarterly };
    }
    return { radarData: dataRadarYearly, barData: competitorDataYearly };
  }, [period]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Posicionamento Competitivo</h2>
          <p className="text-slate-500">Benchmark e análise de participação de mercado por segmento.</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} options={['1q', '1y']} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-2">Matriz de Competitividade</h3>
          <p className="text-xs text-slate-400 mb-6">Comparativo vs. Líder de Mercado ({period === '1q' ? 'Último Trimestre' : 'Acumulado Ano'})</p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                <Radar name="Nossa Administradora" dataKey="A" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.4} />
                <Radar name="Média dos Top 5" dataKey="B" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.2} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-2">Market Share (%)</h3>
          <p className="text-xs text-slate-400 mb-6">Segmento: Bens Imóveis ({period === '1q' ? 'Q3 2025' : '2025 YTD'})</p>
          <div className="h-80 w-full">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fill: '#475569'}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none'}} />
                <Bar dataKey="share" name="Market Share %" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-semibold text-slate-800">Indicadores de Concentração (HHI e CR4)</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
                <div className="text-sm text-slate-500 mb-1">Índice HHI (Concentração)</div>
                <div className="text-3xl font-bold text-slate-800">{period === '1q' ? '0.1480' : '0.1450'}</div>
                <div className="text-xs text-green-600 mt-1">Moderadamente Concentrado</div>
            </div>
            <div className="text-center border-l border-r border-slate-100">
                <div className="text-sm text-slate-500 mb-1">CR4 (Top 4 Share)</div>
                <div className="text-3xl font-bold text-slate-800">{period === '1q' ? '57.1%' : '56.2%'}</div>
                <div className="text-xs text-slate-400 mt-1">{period === '1q' ? 'Ligeira alta vs Q2' : 'Estável vs. 2024'}</div>
            </div>
             <div className="text-center">
                <div className="text-sm text-slate-500 mb-1">Posição no Ranking</div>
                <div className="text-3xl font-bold text-blue-600">3º</div>
                <div className="text-xs text-blue-600 mt-1">Consolidado</div>
            </div>
        </div>
      </div>
    </div>
  );
};