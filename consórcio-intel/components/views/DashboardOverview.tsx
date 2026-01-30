
import React, { useState, useMemo } from 'react';
import { MetricsCard } from '../charts/MetricsCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { generateMarketInsight, MarketInsightResult } from '../../services/geminiService';
import { Sparkles, Loader2, ExternalLink, Globe, AlertCircle, Info } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';
import { dataStore } from '../../services/dataStore';

const mockOverviewData = [
  { name: 'Q3 2024', revenue: 4200, participants: 2400 },
  { name: 'Q4 2024', revenue: 4500, participants: 2600 },
  { name: 'Q1 2025', revenue: 4100, participants: 2800 },
  { name: 'Q2 2025', revenue: 4800, participants: 3100 },
  { name: 'Q3 2025', revenue: 5200, participants: 3400 },
];

const mockSegmentData = [
  { name: 'Seg 1 (Imóveis)', value: 45 },
  { name: 'Seg 3 (Leves)', value: 30 },
  { name: 'Seg 2 (Pesados)', value: 15 },
  { name: 'Seg 6 (Serviços)', value: 10 },
];

export const DashboardOverview: React.FC = () => {
  const [insightData, setInsightData] = useState<MarketInsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('1y');

  const storedData = dataStore.getData();
  const isRealData = storedData.overview.length > 0;
  const activeData = isRealData ? storedData.overview : mockOverviewData;

  // Adaptação simples caso os dados importados tenham chaves diferentes
  const chartData = activeData.map((d: any) => ({
     name: d.name || d.period || 'Period',
     revenue: d.revenue || 0,
     participants: d.participants || d.activeQuotas || 0
  }));

  const filteredData = useMemo(() => {
    switch (period) {
      case '1q': return chartData.slice(-1);
      case '1y': return chartData.slice(-4);
      case 'all': return chartData;
      default: return chartData;
    }
  }, [period, chartData]);

  const latestData = filteredData[filteredData.length - 1];
  const previousData = filteredData.length > 1 ? filteredData[filteredData.length - 2] : null;
  
  const displayRevenue = period === '1q' 
    ? latestData?.revenue || 0 
    : filteredData.reduce((acc, curr) => acc + curr.revenue, 0);

  const revenueTrend = previousData && previousData.revenue > 0
    ? ((latestData.revenue - previousData.revenue) / previousData.revenue) * 100 
    : 0;

  const handleGenerateInsight = async () => {
    setLoading(true);
    const result = await generateMarketInsight(
      `Análise Executiva Consolidada (${isRealData ? 'DADOS REAIS' : 'SIMULAÇÃO'}) - Período: ${period}. Considere os segmentos oficiais 1-6.`,
      { history: filteredData, isRealData }
    );
    setInsightData(result);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {!isRealData && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 text-blue-800">
          <Info size={20} className="flex-shrink-0" />
          <div className="text-sm">
            <span className="font-bold">Modo de Demonstração:</span> Os dados abaixo simulam a estrutura dos arquivos "Consolidados" do BACEN. Importe seus arquivos CSV oficiais para visualizar métricas reais.
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Painel Executivo</h2>
          <p className="text-slate-500">Monitoramento consolidado dos Segmentos 1 a 6.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button 
            onClick={handleGenerateInsight}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 hover:scale-105 active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            Brainstorm IA
          </button>
        </div>
      </div>

      {insightData && (
        <div className="bg-white border border-blue-100 rounded-2xl p-8 shadow-xl animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Sparkles size={120} />
          </div>
          <div className="flex items-center gap-2 mb-6 text-blue-800 font-bold text-lg">
            <Sparkles size={24} className="text-blue-600" />
            <h3>Visão Estratégica Gemini 3 Pro</h3>
          </div>
          
          <div className="prose prose-slate max-w-none text-base leading-relaxed text-slate-700 mb-8 border-l-4 border-blue-500 pl-6 italic">
            {insightData.text}
          </div>

          {insightData.sources && insightData.sources.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                <Globe size={14} />
                Referências Externas Coletadas
              </div>
              <div className="flex flex-wrap gap-2">
                {insightData.sources.map((source, idx) => (
                  <a 
                    key={idx}
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-600 font-semibold transition-all"
                  >
                    <span className="max-w-[180px] truncate">{source.title}</span>
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricsCard 
          title="Créditos Comercializados"
          value={`R$ ${displayRevenue.toLocaleString()}`} 
          trend={Number(revenueTrend.toFixed(1))}
          color="blue" 
        />
        <MetricsCard title="Cotas Ativas (Total)" value={latestData?.participants.toLocaleString() || "0"} trend={8.2} color="emerald" />
        <MetricsCard title="Taxa de Evasão (Média)" value="2.1%" trend={-0.8} color="indigo" />
        <MetricsCard title="Novas Adesões (Trim)" value="12.4%" trend={1.2} color="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-slate-800 text-lg">Evolução: Crédito vs. Cotas</h3>
            <div className="flex gap-4">
               <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div> Vol. Crédito
               </div>
               <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-3 h-3 rounded-full bg-slate-200"></div> Cotas Ativas
               </div>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 600}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                <Tooltip 
                   contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                   itemStyle={{fontSize: '12px', fontWeight: 'bold'}}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" name="Crédito" />
                <Area type="monotone" dataKey="participants" stroke="#cbd5e1" strokeWidth={2} fill="transparent" strokeDasharray="6 6" name="Cotas" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg mb-8">Participação (Seg 1-6)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockSegmentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={90} tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none'}} />
                <Bar dataKey="value" fill="#2563eb" radius={[0, 8, 8, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
