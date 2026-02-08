import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generateMarketInsight, AIAnalysisResult } from '../../services/geminiService';
import { Sparkles, Loader2, Database, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';
import { BacenSegment } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../../services/firebase';

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
  '1': '#3b82f6', // Imoveis - blue
  '2': '#f59e0b', // Pesados - amber
  '3': '#10b981', // Leves - emerald
  '4': '#ef4444', // Motos - red
  '5': '#6366f1', // Outros - indigo
  '6': '#8b5cf6', // Servicos - violet
  'Outros': '#94a3b8'
};

const GRADIENT_STYLES: Record<string, { from: string; to: string; border: string; icon: string }> = {
  'volume': { from: 'from-blue-50', to: 'to-white', border: 'border-blue-200', icon: 'text-blue-600' },
  'cotas': { from: 'from-emerald-50', to: 'to-white', border: 'border-emerald-200', icon: 'text-emerald-600' },
  'ticket': { from: 'from-violet-50', to: 'to-white', border: 'border-violet-200', icon: 'text-violet-600' },
  'taxa': { from: 'from-amber-50', to: 'to-white', border: 'border-amber-200', icon: 'text-amber-600' },
  'inadimplencia': { from: 'from-rose-50', to: 'to-white', border: 'border-rose-200', icon: 'text-rose-600' },
  'excluidas': { from: 'from-slate-100', to: 'to-white', border: 'border-slate-200', icon: 'text-slate-600' },
};

const formatCurrency = (val: number) => {
  if (val >= 1000000000) return `R$ ${(val / 1000000000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
  if (val >= 1000000) return `R$ ${(val / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatPercent = (val: number) => `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const VariationBadge = ({ value, inverse = false }: { value: number, inverse?: boolean }) => {
  if (Math.abs(value) < 0.01) return <span className="text-slate-400 text-[10px] flex items-center gap-0.5"><Minus size={10} /> 0%</span>;
  const isGood = inverse ? value < 0 : value > 0;
  const colorClass = isGood ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 whitespace-nowrap ${colorClass}`}>
      <Icon size={10} />
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
};

// Enhanced KPI Section with gradient, footer definition, and sorted segments
const KPISection = ({
  title,
  generalValue,
  generalVar,
  items,
  renderValue,
  inverseTrend = false,
  extraContent = null,
  definition,
  styleKey
}: {
  title: string;
  generalValue: string;
  generalVar: number;
  items: any[];
  renderValue: (item: any) => string;
  inverseTrend?: boolean;
  extraContent?: React.ReactNode;
  definition: string;
  styleKey: string;
}) => {
  const style = GRADIENT_STYLES[styleKey] || GRADIENT_STYLES['volume'];

  // Sort items by segment ID (numeric)
  const sortedItems = [...items].sort((a, b) => Number(a.id) - Number(b.id));

  return (
    <div className={`bg-gradient-to-br ${style.from} ${style.to} rounded-2xl shadow-lg border ${style.border} overflow-hidden flex flex-col h-full transition-all hover:shadow-xl hover:scale-[1.01]`}>
      {/* Header */}
      <div className="p-5 border-b border-slate-100/50">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-black text-slate-900 whitespace-nowrap">{generalValue}</span>
          <VariationBadge value={generalVar} inverse={inverseTrend} />
        </div>
      </div>

      {/* Extra Content (e.g., inadimplência breakdown) */}
      {extraContent && <div className="p-4 bg-white/60 border-b border-slate-100">{extraContent}</div>}

      {/* Segments Table */}
      <div className="flex-1 overflow-y-auto bg-white/40">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100/60">
            {sortedItems.map((item: any) => (
              <tr key={item.id} className="group hover:bg-white/60 transition-colors">
                <td className="px-4 py-2.5 text-slate-600 font-medium text-xs truncate max-w-[120px]" title={item.name}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: SEGMENT_COLORS[String(item.id)] }}></div>
                    <span className="truncate">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                  {renderValue(item)}
                </td>
                <td className="px-3 py-2.5 text-right w-[70px]">
                  <VariationBadge value={item.variation} inverse={inverseTrend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Definition */}
      <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-200/50 flex items-start gap-1.5">
        <Info size={10} className="text-slate-400 mt-0.5 shrink-0" />
        <p className="text-[9px] text-slate-400 leading-tight">{definition}</p>
      </div>
    </div>
  );
};

export const DashboardOverview: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodOption>('1y');
  const [insightData, setInsightData] = useState<AIAnalysisResult | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  useEffect(() => {
    // Wait for auth to initialize
    // Note: useAuth might need to expose loading state. 
    // If useAuth doesn't expose loading, we rely on user being null vs populated.
    // However, user can be null if not logged in.

    // Check if we assume 'user' is populated if logged in.
    if (!user) {
      console.warn("DashboardOverview: User not authenticated, skipping fetch.");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const getDashboard = httpsCallable<unknown, DashboardData>(functions, 'getDashboardData');
        // useAuth user should be the primary source of truth as it handles the state change
        const currentUser = user || auth.currentUser;

        console.log("DashboardOverview Fetching with:", { uid: currentUser?.uid });

        if (currentUser && currentUser.uid) {
          const result = await getDashboard({ administratorId: currentUser.uid });
          setData(result.data);
        } else {
          console.error("DashboardOverview: User ID is missing despite authentication.");
        }
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]); // Re-run when user changes

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

  if (loading) return (
    <div className="flex h-[70vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-pulse"></div>
          <Loader2 className="absolute inset-0 m-auto animate-spin text-blue-600" size={32} />
        </div>
        <p className="text-slate-400 font-medium">Carregando dados...</p>
      </div>
    </div>
  );

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
  const displaySegments = segments.map(s => ({
    ...s,
    displayName: getSegName(s.id)
  }));

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Painel Executivo</h2>
          <p className="text-slate-500 text-sm">Indicadores Oficiais BACEN (Consolidado)</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          {isAdmin && (
            <button onClick={handleGenerateInsight} disabled={loadingInsight} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl">
              {loadingInsight ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            </button>
          )}
        </div>
      </div>

      {/* AI INSIGHTS BOX */}
      {insightData && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6 shadow-lg animate-fade-in">
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

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">

        {/* 1. VOLUME FINANCEIRO */}
        <KPISection
          title="Volume Financeiro"
          generalValue={formatCurrency(summary.totalVolume)}
          generalVar={summary.varVolume}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varVolume }))}
          renderValue={(item: any) => formatCurrency(item.volume)}
          definition="Σ (Cotas Ativas × Valor Médio do Bem) de todos os grupos ativos"
          styleKey="volume"
        />

        {/* 2. COTAS ATIVAS */}
        <KPISection
          title="Cotas Ativas"
          generalValue={summary.totalActiveQuotas.toLocaleString('pt-BR')}
          generalVar={summary.varQuotas}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varQuotas }))}
          renderValue={(item: any) => item.quotas.toLocaleString('pt-BR')}
          definition="Em Dia + Contempladas Inadimpl. + Não Contempladas Inadimpl."
          styleKey="cotas"
        />

        {/* 3. TICKET MÉDIO */}
        <KPISection
          title="Ticket Médio"
          generalValue={formatCurrency(summary.avgTicket)}
          generalVar={summary.varTicket}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varTicket }))}
          renderValue={(item: any) => formatCurrency(item.ticket)}
          definition="Volume Financeiro ÷ Cotas Ativas"
          styleKey="ticket"
        />

        {/* 4. TAXA DE ADMINISTRAÇÃO */}
        <KPISection
          title="Taxa de Administração"
          generalValue={formatPercent(summary.avgAdminFee)}
          generalVar={summary.varAdminFee}
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varAdminFee }))}
          renderValue={(item: any) => formatPercent(item.adminFee)}
          definition="Média ponderada da taxa pelo volume de cada grupo"
          styleKey="taxa"
        />

        {/* 5. INADIMPLÊNCIA */}
        <KPISection
          title="Índice de Inadimplência"
          generalValue={formatPercent(summary.defaultRate)}
          generalVar={summary.varDefaultRate}
          inverseTrend
          extraContent={
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="block text-slate-500 mb-0.5 text-[10px]">Contempladas</span>
                <span className="font-black text-slate-800 text-lg whitespace-nowrap">{summary.defaultContemplated.toLocaleString('pt-BR')}</span>
              </div>
              <div>
                <span className="block text-slate-500 mb-0.5 text-[10px]">Não Contempladas</span>
                <span className="font-black text-slate-800 text-lg whitespace-nowrap">{summary.defaultNonContemplated.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          }
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varDefaultRate }))}
          renderValue={(item: any) => formatPercent(item.defaultRate)}
          definition="(Contempl. Inadimpl. + Não Contempl. Inadimpl.) ÷ Cotas Ativas × 100"
          styleKey="inadimplencia"
        />

        {/* 6. COTAS EXCLUÍDAS */}
        <KPISection
          title="Cotas Excluídas"
          generalValue={summary.excludedQuotas.toLocaleString('pt-BR')}
          generalVar={summary.varExcluded}
          inverseTrend
          items={displaySegments.map(s => ({ ...s, name: s.displayName, variation: s.varExcluded }))}
          renderValue={(item: any) => item.excluded.toLocaleString('pt-BR')}
          definition="Total de cotas canceladas/excluídas no período"
          styleKey="excluidas"
        />

      </div>

      {/* EVOLUTION CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: VOLUME */}
        <div className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-2xl shadow-lg border border-blue-100">
          <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-500" /> Evolução do Saldo (Volume)
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData}>
                <defs>
                  <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(val) => `R$${(val / 1000000000).toFixed(1)}B`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.15)' }} />
                <Area type="monotone" dataKey="volume" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVol)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: QUANTITY */}
        <div className="bg-gradient-to-br from-emerald-50 to-white p-6 rounded-2xl shadow-lg border border-emerald-100">
          <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500" /> Evolução de Cotas Ativas
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData}>
                <defs>
                  <linearGradient id="colorQtd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(val: number) => val.toLocaleString('pt-BR')} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.15)' }} />
                <Area type="monotone" dataKey="quotas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorQtd)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};