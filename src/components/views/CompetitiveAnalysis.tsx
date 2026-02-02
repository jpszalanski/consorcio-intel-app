
import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';
import { AppDataStore } from '../../types';

interface Props {
  data: AppDataStore;
}

export const CompetitiveAnalysis: React.FC<Props> = ({ data }) => {
  const [period, setPeriod] = useState<PeriodOption>('1y');

  // Aggregation of all collections for market share analysis
  const consolidatedData = useMemo(() => {
    return [
      ...data.segments.map(s => ({ 
        adminName: s.adminName, 
        revenue: s.revenue || 0, 
        activeQuotas: s.cotasAtivas 
      })),
      ...data.realEstateGroups.map(s => ({ 
        adminName: s.adminName, 
        revenue: s.revenue || 0, 
        activeQuotas: s.activeQuotas || 0 
      })),
      ...data.movableGroups.map(s => ({ 
        adminName: s.adminName, 
        revenue: s.revenue || 0, 
        activeQuotas: s.activeQuotas || 0 
      }))
    ];
  }, [data]);

  const marketMetrics = useMemo(() => {
    if (consolidatedData.length === 0) return [];

    // Simple period slicing simulation since aggregated data above doesn't have period sorting built-in yet for this view
    // In a real scenario we would filter by period field
    const relevantData = consolidatedData;

    const adminStats = new Map<string, { revenue: number, active: number }>();
    let totalMarketRevenue = 0;

    relevantData.forEach(item => {
       const name = item.adminName?.trim() || 'Outros';
       if (!adminStats.has(name)) adminStats.set(name, { revenue: 0, active: 0 });
       const entry = adminStats.get(name)!;
       entry.revenue += item.revenue;
       entry.active += item.activeQuotas;
       totalMarketRevenue += item.revenue;
    });

    const ranking = Array.from(adminStats.entries())
      .map(([name, stats]) => ({
         name,
         revenue: stats.revenue,
         share: totalMarketRevenue > 0 ? (stats.revenue / totalMarketRevenue) * 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return ranking;
  }, [consolidatedData, period]);

  const concentrationIndices = useMemo(() => {
    const shares = marketMetrics.map(m => m.share);
    const cr4 = shares.slice(0, 4).reduce((a, b) => a + b, 0);
    const hhi = shares.reduce((acc, s) => acc + (s * s), 0);
    return { cr4, hhi };
  }, [marketMetrics]);

  const radarData = useMemo(() => {
    if (marketMetrics.length < 2) return [];

    const leader = marketMetrics[0];
    const top5 = marketMetrics.slice(0, 5);
    const avgTop5Share = top5.reduce((acc, curr) => acc + curr.share, 0) / top5.length;
    const avgTop5Rev = top5.reduce((acc, curr) => acc + curr.revenue, 0) / top5.length;

    const maxRev = leader.revenue || 1; 

    return [
      { subject: 'Market Share', A: leader.share, B: avgTop5Share, fullMark: 100 },
      { subject: 'Volume (Relativo)', A: 100, B: (avgTop5Rev / maxRev) * 100, fullMark: 100 },
      { subject: 'Dominância', A: (leader.share / (marketMetrics[1]?.share || 1)) * 50, B: 50, fullMark: 100 },
    ];
  }, [marketMetrics]);

  if (marketMetrics.length === 0) {
     return <div className="p-8 text-center text-slate-400">Dados insuficientes para análise competitiva.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Posicionamento Competitivo</h2>
          <p className="text-slate-500">Benchmark real baseado no volume de crédito importado.</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} options={['all']} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-2">Líder vs. Média do Top 5</h3>
          <p className="text-xs text-slate-400 mb-6">Comparativo de performance relativa</p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name={marketMetrics[0]?.name} dataKey="A" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.4} />
                <Radar name="Média Top 5" dataKey="B" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.2} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-2">Market Share Real (%)</h3>
          <p className="text-xs text-slate-400 mb-6">Baseado no Volume de Crédito Total</p>
          <div className="h-80 w-full">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={marketMetrics.slice(0, 8)}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11, fill: '#475569'}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}} 
                  contentStyle={{borderRadius: '8px', border: 'none'}} 
                  formatter={(value: number) => [`${value.toFixed(2)}%`, 'Share']}
                />
                <Bar dataKey="share" name="Market Share %" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-semibold text-slate-800">Indicadores de Concentração de Mercado</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
                <div className="text-sm text-slate-500 mb-1">Índice HHI (Herfindahl)</div>
                <div className="text-3xl font-bold text-slate-800">{concentrationIndices.hhi.toFixed(0)}</div>
                <div className={`text-xs mt-1 font-bold ${concentrationIndices.hhi > 2500 ? 'text-red-500' : concentrationIndices.hhi > 1500 ? 'text-amber-500' : 'text-green-500'}`}>
                   {concentrationIndices.hhi > 2500 ? 'Alta Concentração' : concentrationIndices.hhi > 1500 ? 'Moderada' : 'Baixa Concentração'}
                </div>
            </div>
            <div className="text-center border-l border-r border-slate-100">
                <div className="text-sm text-slate-500 mb-1">CR4 (Share Top 4)</div>
                <div className="text-3xl font-bold text-slate-800">{concentrationIndices.cr4.toFixed(1)}%</div>
                <div className="text-xs text-slate-400 mt-1">Poder de mercado dos 4 maiores players</div>
            </div>
             <div className="text-center">
                <div className="text-sm text-slate-500 mb-1">Players Analisados</div>
                <div className="text-3xl font-bold text-blue-600">{marketMetrics.length}</div>
                <div className="text-xs text-blue-600 mt-1">Administradoras na base</div>
            </div>
        </div>
      </div>
    </div>
  );
};
