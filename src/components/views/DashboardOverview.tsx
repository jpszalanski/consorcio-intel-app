import React, { useState, useEffect, useMemo } from 'react';
import { MetricsCard } from '../charts/MetricsCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { generateMarketInsight, AIAnalysisResult } from '../../services/geminiService';
import { Sparkles, Loader2, Database, BadgePercent, ArrowUpRight } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';
import { BacenSegment } from '../../types';
import { getFunctions, httpsCallable } from 'firebase/functions';



interface DashboardStat {
  data_base: string;
  codigo_segmento: string;
  tipo: string;
  total_active_quotas: number;
  total_volume_estimated: number;
  total_default_quotas: number;
  total_dropouts: number;
  total_quitadas: number;
}

interface ChartDataPoint {
  name: string;
  volume: number;
  participants: number;
  defaultAmount: number;
  quitadas: number;
  dropouts: number;
}

// Convert Enum to String Record Key Safe
const SEGMENT_COLORS: Record<string, string> = {
  [String(BacenSegment.IMOVEIS)]: '#2563eb',
  [String(BacenSegment.VEICULOS_LEVES)]: '#10b981',
  [String(BacenSegment.VEICULOS_PESADOS)]: '#f59e0b',
  [String(BacenSegment.MOTOCICLETAS)]: '#ef4444',
  [String(BacenSegment.SERVICOS)]: '#8b5cf6',
  [String(BacenSegment.OUTROS_BENS)]: '#64748b'
};

export const DashboardOverview: React.FC = () => {
  const [insightData, setInsightData] = useState<AIAnalysisResult | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('1y');
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const functions = getFunctions();
        // Using unknown cast then string, robust invocation
        const getDashboard = httpsCallable<unknown, { data: DashboardStat[] }>(functions, 'getDashboardData');
        const result = await getDashboard();
        const rows = result.data.data;
        setStats(rows);
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 1. Chart Data Aggregation
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!stats.length) return [];

    const grouped = stats.reduce((acc, curr) => {
      const key = curr.data_base;
      if (!acc[key]) acc[key] = {
        name: key,
        volume: 0,
        participants: 0,
        defaultAmount: 0,
        quitadas: 0,
        dropouts: 0
      };

      acc[key].volume += Number(curr.total_volume_estimated || 0);
      acc[key].participants += Number(curr.total_active_quotas || 0);
      acc[key].defaultAmount += Number(curr.total_default_quotas || 0);
      acc[key].quitadas += Number(curr.total_quitadas || 0);
      acc[key].dropouts += Number(curr.total_dropouts || 0);

      return acc;
    }, {} as Record<string, ChartDataPoint>);

    return Object.values(grouped).sort((a: ChartDataPoint, b: ChartDataPoint) => a.name.localeCompare(b.name));
  }, [stats]);

  const filteredData = useMemo(() => {
    switch (period) {
      case '1q': return chartData.slice(-3);
      case '1y': return chartData.slice(-12);
      case 'all': return chartData;
      default: return chartData;
    }
  }, [period, chartData]);

  // 2. Fragment Breakdown
  const segmentBreakdown = useMemo(() => {
    if (!chartData.length) return [];

    const latestPeriod = chartData[chartData.length - 1]?.name;
    const currentStats = stats.filter(s => s.data_base === latestPeriod);

    const getSegName = (code: string | number): string => {
      const c = String(code);
      if (c === '1') return `1 - ${String(BacenSegment.IMOVEIS)}`;
      if (c === '2') return `2 - ${String(BacenSegment.VEICULOS_PESADOS)}`;
      if (c === '3') return `3 - ${String(BacenSegment.VEICULOS_LEVES)}`;
      if (c === '4') return `4 - ${String(BacenSegment.MOTOCICLETAS)}`;
      if (c === '6') return `6 - ${String(BacenSegment.SERVICOS)}`;
      return `${c} - Outros`;
    };

    const map = new Map<string, { name: string; volume: number; }>();

    currentStats.forEach(s => {
      const segName = getSegName(s.codigo_segmento);
      if (!map.has(segName)) map.set(segName, { name: segName, volume: 0 });
      map.get(segName)!.volume += Number(s.total_volume_estimated || 0);
    });

    return Array.from(map.values()).sort((a, b) => b.volume - a.volume);
  }, [stats, chartData]);

  // 3. KPIs
  const kpis = useMemo(() => {
    const latest = filteredData[filteredData.length - 1] || { name: '', volume: 0, participants: 0, defaultAmount: 0, quitadas: 0, dropouts: 0 };
    const previous = filteredData.length > 1 ? filteredData[filteredData.length - 2] : null;

    const currentActive = latest.participants;
    const defaultRate = currentActive > 0 ? (latest.defaultAmount / currentActive) * 100 : 0;

    const totalExposure = currentActive + latest.dropouts;
    const dropoutRate = totalExposure > 0 ? (latest.dropouts / totalExposure) * 100 : 0;
    const quitationRateCalc = currentActive > 0 ? (latest.quitadas / currentActive) * 100 : 0;

    const totalRev = latest.volume;
    const totalQtd = latest.participants;
    const avgTicket = totalQtd > 0 ? totalRev / totalQtd : 0;

    const volumeTrend = previous && previous.volume > 0
      ? ((latest.volume - previous.volume) / previous.volume) * 100
      : 0;

    const prevDefaultRate = previous && previous.participants > 0 ? (previous.defaultAmount / previous.participants) * 100 : 0;
    const defaultTrend = defaultRate - prevDefaultRate;

    return {
      balanceVolume: latest.volume,
      activeQuotas: currentActive,
      avgTicket,
      defaultRate,
      defaultTrend,
      volumeTrend,
      dropoutRate,
      quitationRate: quitationRateCalc
    };
  }, [filteredData]);


  const handleGenerateInsight = async () => {
    setLoadingInsight(true);
    const context = `
        Cenário Atual de Mercado (Consórcio):
        - Volume Financeiro Total: R$ ${(kpis.balanceVolume / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Milhões
        - Cotas Ativas: ${kpis.activeQuotas.toLocaleString('pt-BR')}
        - Segmento Líder (Volume): ${segmentBreakdown[0]?.name} (R$ ${(segmentBreakdown[0]?.volume / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M)
        - Inadimplência Média: ${kpis.defaultRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
        - Taxa de Quitação: ${kpis.quitationRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
        - Rotatividade (Exclusão): ${kpis.dropoutRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
        - Ticket Médio: R$ ${kpis.avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
        `;
    const result = await generateMarketInsight(context, { history: filteredData.slice(-6) });
    setInsightData(result);
    setLoadingInsight(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-4 text-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-slate-500">Consolidando milhões de registros via BigQuery...</p>
        <div className="flex gap-2 justify-center mt-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></span>
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></span>
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-300"></span>
        </div>
      </div>
    );
  }

  if (!loading && !stats.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-4 text-center">
        <div className="p-6 bg-slate-100 rounded-full">
          <Database size={48} className="text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Nenhum dado encontrado</h2>
        <p className="text-slate-500 max-w-md">Importe os arquivos CSV do BACEN para visualizar os indicadores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Painel Executivo</h2>
          <p className="text-slate-500">Indicadores financeiros e operacionais do Sistema de Consórcios.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            onClick={handleGenerateInsight}
            disabled={loadingInsight}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50"
          >
            {loadingInsight ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            Insights IA
          </button>
        </div>
      </div>

      {insightData && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Sparkles size={80} className="text-blue-600" />
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Análise de Inteligência de Mercado</h3>
              <p className="text-sm text-slate-500">Insights gerados por IA com base nos dados do BACEN.</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-lg font-medium text-slate-800 italic border-l-4 border-blue-500 pl-4 py-1">
              "{insightData.summary}"
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {insightData.points.map((point, idx) => (
              <div key={idx} className={`p-4 rounded-xl border ${point.type === 'positive' ? 'bg-green-50/50 border-green-100' :
                point.type === 'negative' ? 'bg-red-50/50 border-red-100' :
                  'bg-slate-50/50 border-slate-100'
                }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${point.type === 'positive' ? 'text-green-700' :
                    point.type === 'negative' ? 'text-red-700' :
                      'text-slate-600'
                    }`}>{point.title}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{point.content}</p>
              </div>
            ))}
          </div>

          {insightData.recommendation && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex gap-4">
              <div className="mt-1 text-indigo-600"><ArrowUpRight size={20} /></div>
              <div>
                <h4 className="font-bold text-indigo-900 text-sm uppercase mb-1">Recomendação Estratégica</h4>
                <p className="text-indigo-800 text-sm">{insightData.recommendation}</p>
              </div>
            </div>
          )}

          {insightData.sources && insightData.sources.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-2 font-medium">Fontes processadas:</p>
              <div className="flex flex-wrap gap-2">
                {insightData.sources.map((s, i) => (
                  <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline bg-blue-50 px-2 py-1 rounded truncate max-w-[200px]">
                    {s.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricsCard
          title="Volume Financeiro (Carteira)"
          value={`R$ ${(kpis.balanceVolume / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`}
          trend={Number(kpis.volumeTrend.toFixed(1))}
          trendLabel="vs. anterior"
          color="blue"
        />
        <MetricsCard
          title="Cotas Ativas"
          value={kpis.activeQuotas.toLocaleString('pt-BR')}
          color="emerald"
        />
        <MetricsCard
          title="Ticket Médio"
          value={`R$ ${kpis.avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
          color="violet"
        />
        <MetricsCard
          title="Taxa de Inadimplência"
          value={`${kpis.defaultRate.toFixed(2)}%`}
          trend={Number(kpis.defaultTrend.toFixed(2))}
          trendLabel="vs. anterior"
          inverseTrend
          color="rose"
        />
        <MetricsCard
          title="Taxa de Quitação"
          value={`${kpis.quitationRate.toFixed(2)}%`}
          color="indigo"
        />
        <MetricsCard
          title="Taxa de Exclusão (Rotatividade)"
          value={`${kpis.dropoutRate.toFixed(2)}%`}
          color="orange"
          inverseTrend
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BadgePercent className="text-slate-400" size={20} />
            Composição por Segmento
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segmentBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="volume"
                >
                  {segmentBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SEGMENT_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `R$ ${(value / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ArrowUpRight className="text-slate-400" size={20} />
            Evolução do Volume
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => `R$${(val / 1000000).toFixed(0)}M`} />
                <Tooltip
                  formatter={(value: number) => [`R$ ${(value / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`, 'Volume']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="volume" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};