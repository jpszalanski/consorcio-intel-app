import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { generateMarketInsight, AIAnalysisResult } from '../../services/geminiService';
import { Sparkles, Loader2, Database, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';
import { BacenSegment } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';

// --- INTERFACES MATCHING BACKEND ---
interface SegmentData {
  id: number;
  name: string;
  volume: number;
  quotas: number;
  ticket: number;
  adminFee: number;
  defaultRate: number;
  excluded: number;

  varVolume: number;
  varQuotas: number;
  varTicket: number;
  varAdminFee: number;
  varDefaultRate: number;
  varExcluded: number;
}

interface DashboardSummary {
  totalActiveQuotas: number;
  totalVolume: number;
  avgTicket: number;
  defaultRate: number;
  excludedQuotas: number;
  avgAdminFee: number;

  defaultContemplated: number;
  defaultNonContemplated: number;

  varVolume: number;
  varQuotas: number;
  varTicket: number;
  varDefaultRate: number;
  varExcluded: number;
  varAdminFee: number;
}

interface DashboardData {
  summary: DashboardSummary;
  segments: SegmentData[];
  history: any[];
}

const SEGMENT_COLORS: Record<string, string> = {
  '1': '#2563eb', // Imoveis
  '2': '#f59e0b', // Pesados
  '3': '#10b981', // Leves
  '4': '#ef4444', // Motos
  '5': '#64748b', // Outros
  '6': '#8b5cf6', // Servicos
  'Outros': '#94a3b8'
};

const formatCurrency = (val: number) => {
  if (val >= 1000000000) return `R$ ${(val / 1000000000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
  if (val >= 1000000) return `R$ ${(val / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
};

const formatPercent = (val: number) => `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const VariationBadge = ({ value, inverse = false }: { value: number, inverse?: boolean }) => {
  if (Math.abs(value) < 0.01) return <span className="text-slate-400 text-xs flex items-center gap-1"><Minus size={12} /> 0%</span>;
  const isGood = inverse ? value < 0 : value > 0;
  const colorClass = isGood ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50';
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 w-fit ${colorClass} border border-transparent`}>
      <Icon size={12} />
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
};

// Reusable Section Component
const KPISection = ({
  title,
  generalValue,
  generalVar,
  items,
  renderValue,
  inverseTrend = false,
  extraContent = null
}: any) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</h3>
          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold text-slate-900">{generalValue}</span>
            <div className="mb-1"><VariationBadge value={generalVar} inverse={inverseTrend} /></div>
          </div>
        </div>
      </div>
      {extraContent && <div className="p-4 bg-orange-50/50 border-b border-orange-100">{extraContent}</div>}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {items.map((item: any) => (
              <tr key={item.id} className="group hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-600 font-medium text-xs truncate max-w-[140px]" title={item.name}>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SEGMENT_COLORS[String(item.id)] }}></div>
                    {item.name}
                  </div>
                </td>
                <td className="px-5 py-3 text-right font-semibold text-slate-700">
                  {renderValue(item)}
                </td>
                <td className="px-5 py-3 text-right w-[80px]">
                  <VariationBadge value={item.variation} inverse={inverseTrend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const DashboardOverview: React.FC = () => {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodOption>('1y');
  const [insightData, setInsightData] = useState<AIAnalysisResult | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {

        const getDashboard = httpsCallable<unknown, DashboardData>(functions, 'getDashboardData');
        const result = await getDashboard();
        setData(result.data);
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const chartData = useMemo(() => {
    if (!data?.history) return [];
    const grouped = data.history.reduce((acc: any, curr: any) => {
      const date = curr.data_base;
      if (!acc[date]) acc[date] = { name: date, volume: 0, quotas: 0 };
      acc[date].volume += Number(curr.total_volume || 0);
      acc[date].quotas += Number(curr.total_active_quotas || 0);
      return acc;
    }, {});
    return Object.values(grouped).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [data]);

  const filteredChartData = useMemo(() => {
    if (!chartData.length) return [];
    switch (period) {
      case '1q': return chartData.slice(-3);
      case '1y': return chartData.slice(-12);
      default: return chartData;
    }
  }, [period, chartData]);

  const handleGenerateInsight = async () => {
    if (!data) return;
    setLoadingInsight(true);
    const context = `
            Cenário de Consórcio (BACEN):
            Volume: ${formatCurrency(data.summary.totalVolume)} (${data.summary.varVolume.toFixed(1)}%)
            Cotas: ${data.summary.totalActiveQuotas} (${data.summary.varQuotas.toFixed(1)}%)
            Inadimplência: ${data.summary.defaultRate.toFixed(2)}%
            Ticket Médio: ${formatCurrency(data.summary.avgTicket)}
        `;
    const result = await generateMarketInsight(context, { segments: data.segments });
    setInsightData(result);
    setLoadingInsight(false);
  };

  // --- SEGMENT MAPPER HELPER ---
  const getSegName = (code: string | number): string => {
    const c = String(code);
    if (c === '1') return `1 - ${BacenSegment[1]}`;
    if (c === '2') return `2 - ${BacenSegment[2].replace('_', ' ')}`;
    if (c === '3') return `3 - ${BacenSegment[3]}`;
    if (c === '4') return `4 - ${BacenSegment[4]}`;
    if (c === '5') return `5 - ${BacenSegment[5].replace(/_/g, ' ')}`;
    if (c === '6') return `6 - ${BacenSegment[6].replace(/_/g, ' ')}`;
    return `${c} - Outros`;
  };

  if (loading) return <div className="flex h-[70vh] items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  if (!data || !data.summary || Object.keys(data.summary).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500 gap-4">
        <Database size={48} className="text-slate-300" />
        <h3 className="text-lg font-bold text-slate-700">Nenhum dado encontrado</h3>
        <p className="max-w-md text-center">Para visualizar o painel, é necessário importar os dados do consórcio (arquivos .xlsx ou .csv).</p>
        <a href="/import" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
          Ir para Importação
        </a>
      </div>
    );
  }

  const { summary, segments } = data;

  // Enhance segments with mapped names for display IF NEEDED (already done in backend but ensuring safety)
  const displaySegments = segments.map(s => ({
    ...s,
    // Backend sends "Segmento 1", we prefer strict compliance if backend fail
    displayName: getSegName(s.id)
  }));

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Painel Executivo</h2>
          <p className="text-slate-500">Indicadores Oficiais BACEN (Consolidado)</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          {isAdmin && (
            <button onClick={handleGenerateInsight} disabled={loadingInsight} className="bg-slate-900 text-white p-3 rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all">
              {loadingInsight ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            </button>
          )}
        </div>
      </div>

      {/* AI INSIGHTS BOX */}
      {insightData && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm animate-fade-in">
          <div className="flex gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm h-fit text-indigo-600"><Sparkles size={24} /></div>
            <div>
              <h3 className="font-bold text-indigo-900 text-lg mb-2">Análise de Inteligência</h3>
              <p className="text-slate-700 italic border-l-4 border-indigo-300 pl-4 py-1 mb-4">"{insightData.summary}"</p>
              <div className="grid md:grid-cols-2 gap-3">
                {insightData.points.map((p, i) => (
                  <div key={i} className="bg-white/60 p-3 rounded-lg text-sm"><span className="font-bold text-slate-600 uppercase text-xs mr-2">{p.title}</span> {p.content}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* METRICS GRID - STRICT LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">

        {/* 1. VOLUME FINANCEIRO */}
        <KPISection
          title="Volume Financeiro"
          generalValue={formatCurrency(summary.totalVolume)}
          generalVar={summary.varVolume}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varVolume }))}
          renderValue={(item: any) => formatCurrency(item.volume)}
        />

        {/* 2. COTAS ATIVAS */}
        <KPISection
          title="Cotas Ativas"
          generalValue={summary.totalActiveQuotas.toLocaleString('pt-BR')}
          generalVar={summary.varQuotas}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varQuotas }))}
          renderValue={(item: any) => item.quotas.toLocaleString('pt-BR')}
        />

        {/* 3. TICKET MÉDIO */}
        <KPISection
          title="Ticket Médio"
          generalValue={formatCurrency(summary.avgTicket)}
          generalVar={summary.varTicket}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varTicket }))}
          renderValue={(item: any) => formatCurrency(item.ticket)}
        />

        {/* 4. TAXA DE ADMINISTRAÇÃO */}
        <KPISection
          title="Taxa de Administração"
          generalValue={formatPercent(summary.avgAdminFee)}
          generalVar={summary.varAdminFee}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varAdminFee }))}
          renderValue={(item: any) => formatPercent(item.adminFee)}
        />

        {/* 5. INADIMPLÊNCIA (WITH BREAKDOWN) */}
        <KPISection
          title="Índice de Inadimplência"
          generalValue={formatPercent(summary.defaultRate)}
          generalVar={summary.varDefaultRate}
          inverseTrend
          extraContent={
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="block text-slate-500 mb-0.5">Contempladas</span>
                <span className="font-bold text-slate-800 text-lg">{summary.defaultContemplated.toLocaleString('pt-BR')}</span>
                <span className="text-slate-400 block">cotas</span>
              </div>
              <div>
                <span className="block text-slate-500 mb-0.5">Não Contemp.</span>
                <span className="font-bold text-slate-800 text-lg">{summary.defaultNonContemplated.toLocaleString('pt-BR')}</span>
                <span className="text-slate-400 block">cotas</span>
              </div>
            </div>
          }
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varDefaultRate }))}
          renderValue={(item: any) => formatPercent(item.defaultRate)}
        />

        {/* 6. COTAS EXCLUÍDAS */}
        <KPISection
          title="Cotas Excluídas"
          generalValue={summary.excludedQuotas.toLocaleString('pt-BR')}
          generalVar={summary.varExcluded}
          inverseTrend
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varExcluded }))}
          renderValue={(item: any) => item.excluded.toLocaleString('pt-BR')}
        />

      </div>

      {/* EVOLUTION CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: VOLUME */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-slate-400" /> Evolução do Saldo (Volume)
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData}>
                <defs>
                  <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(val) => `R$${(val / 1000000).toFixed(0)}M`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="volume" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorVol)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: QUANTITY */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-slate-400" /> Evolução de Cotas Ativas
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData}>
                <defs>
                  <linearGradient id="colorQtd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip formatter={(val: number) => val.toLocaleString('pt-BR')} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="quotas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorQtd)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};