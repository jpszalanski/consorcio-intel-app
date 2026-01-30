import React, { useState, useMemo } from 'react';
import { MetricsCard } from '../charts/MetricsCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { generateMarketInsight } from '../../services/geminiService';
import { Sparkles, Loader2 } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';

const mockOverviewData = [
  { name: 'Q3 2024', revenue: 4200, participants: 2400 },
  { name: 'Q4 2024', revenue: 4500, participants: 2600 },
  { name: 'Q1 2025', revenue: 4100, participants: 2800 },
  { name: 'Q2 2025', revenue: 4800, participants: 3100 },
  { name: 'Q3 2025', revenue: 5200, participants: 3400 },
];

const mockSegmentData = [
  { name: 'Imóveis', value: 45 },
  { name: 'Veículos', value: 30 },
  { name: 'Pesados', value: 15 },
  { name: 'Serviços', value: 10 },
];

export const DashboardOverview: React.FC = () => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('1y');

  // Filter Logic
  const filteredData = useMemo(() => {
    switch (period) {
      case '1q': return mockOverviewData.slice(-1);
      case '1y': return mockOverviewData.slice(-4);
      case 'all': return mockOverviewData;
      default: return mockOverviewData;
    }
  }, [period]);

  // Dynamic Metrics Calculation
  const latestData = filteredData[filteredData.length - 1];
  const previousData = filteredData.length > 1 ? filteredData[filteredData.length - 2] : null;
  
  // Calculate dynamic totals based on period view
  const displayRevenue = period === '1q' 
    ? latestData.revenue 
    : filteredData.reduce((acc, curr) => acc + curr.revenue, 0);

  // Trend Calculation
  const revenueTrend = previousData 
    ? ((latestData.revenue - previousData.revenue) / previousData.revenue) * 100 
    : 0;

  const handleGenerateInsight = async () => {
    setLoading(true);
    const result = await generateMarketInsight(
      `Resumo Executivo do Desempenho (${period === '1y' ? 'Último Ano' : period === '1q' ? 'Último Trimestre' : 'Histórico Completo'})`,
      { history: filteredData, distribution: mockSegmentData }
    );
    setInsight(result);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Visão Geral</h2>
          <p className="text-slate-500">Acompanhamento consolidado dos principais indicadores.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          
          <button 
            onClick={handleGenerateInsight}
            disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white px-4 py-2 rounded-lg font-medium shadow-md transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            Gerar Análise IA
          </button>
        </div>
      </div>

      {insight && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 text-slate-800 animate-fade-in shadow-inner">
          <div className="flex items-center gap-2 mb-3 text-indigo-700 font-semibold">
            <Sparkles size={18} />
            <h3>Insight da Inteligência Artificial</h3>
          </div>
          <div className="prose prose-indigo max-w-none text-sm leading-relaxed whitespace-pre-wrap">
            {insight}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricsCard 
          title={period === '1q' ? "Receita (Trimestre)" : "Receita (Período)"}
          value={`R$ ${displayRevenue.toLocaleString()}`} 
          trend={Number(revenueTrend.toFixed(1))}
          trendLabel={period === '1q' ? "vs. trimestre anterior" : "Momento (QoQ)"}
          color="blue" 
        />
        <MetricsCard 
          title="Novas Cotas (Período)" 
          value={(period === '1q' ? 3400 : period === '1y' ? 14350 : 22000).toLocaleString()} 
          trend={8.2} 
          color="emerald" 
        />
        <MetricsCard 
          title="Taxa de Inadimplência" 
          value={period === '1q' ? "2.1%" : "2.4%"} 
          trend={period === '1q' ? -0.8 : -0.5} 
          trendLabel="vs. média mercado" 
          color="indigo" 
        />
        <MetricsCard 
          title="Contemplações" 
          value={(period === '1q' ? 245 : 842).toString()} 
          trend={5.1} 
          color="slate" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-6">Evolução de Carteira e Receita</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" name="Receita (Milhões)" />
                <Area type="monotone" dataKey="participants" stroke="#94a3b8" strokeWidth={2} fill="transparent" strokeDasharray="5 5" name="Participantes" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-6">Mix por Segmento</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockSegmentData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={80} tick={{fill: '#475569', fontSize: 12, fontWeight: 500}} />
                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};