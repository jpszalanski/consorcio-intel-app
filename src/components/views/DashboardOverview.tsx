import React, { useState, useMemo } from 'react';
import { MetricsCard } from '../charts/MetricsCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { generateMarketInsight, MarketInsightResult } from '../../services/geminiService';
import { Sparkles, Loader2, Database, BadgePercent, ArrowUpRight } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';
import { DataInspector } from '../common/DataInspector';
import { AppDataStore, BacenSegment } from '../../types';

interface Props {
  data: AppDataStore;
}

interface ChartDataPoint {
  name: string;
  volume: number;
  participants: number;
  defaultAmount: number;
}

const SEGMENT_COLORS: Record<string, string> = {
  [BacenSegment.IMOVEIS]: '#2563eb',
  [BacenSegment.VEICULOS_LEVES]: '#10b981',
  [BacenSegment.VEICULOS_PESADOS]: '#f59e0b',
  [BacenSegment.MOTOCICLETAS]: '#ef4444',
  [BacenSegment.SERVICOS]: '#8b5cf6',
  [BacenSegment.OUTROS_BENS]: '#64748b'
};

export const DashboardOverview: React.FC<Props> = ({ data }) => {
  const [insightData, setInsightData] = useState<MarketInsightResult | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('1y');

  // Consolidação de dados (Priorizando dados de Grupo para financeiro)
  const overviewData = useMemo(() => {
    if (!data) return [];

    // Deduplication Logic: Identify segments covered by groups to avoid double counting if mixing sources
    // In strict mode, we might just show both or prioritize. Let's prioritize detailed groups if available for a segment-period.
    const coveredSegments = new Set<string>();
    data.detailedGroups.forEach(g => coveredSegments.add(`${g.codigo_segmento}-${g.data_base}`));

    // Normalização Consolidated Series (Volume 0 strict)
    const segs = data.consolidated
      .map(s => ({
        period: s.data_base,
        segment: String(s.codigo_segmento),
        volume: 0, // STRICT: Segments have no financial volume
        activeQuotas: s.indicadores_calculados.cotas_ativas_total,
        defaultQuotas: (s.metricas_brutas.quantidade_de_cotas_ativas_contempladas_inadimplentes + s.metricas_brutas.quantidade_de_cotas_ativas_nao_contempladas_inadimplentes),
        dropouts: s.metricas_brutas.quantidade_de_cotas_excluidas,
        quitadas: s.metricas_brutas.quantidade_de_cotas_ativas_quitadas,
        taxaAdmin: s.metricas_brutas.taxa_de_administracao,
        contemplated: s.metricas_brutas.quantidade_de_cotas_ativas_contempladas_no_mes,
        source: 'segment'
      }));

    // Normalização Detailed Groups
    const groups = data.detailedGroups.map(g => {
      // Calculate Active Quotas: Em Dia + Inadimplentes (Contemplados + Nao Contemplados)
      // Note: "Ativas em Dia" in spec usually accounts for active good standing. 
      // Formula 2.1 check: C + A + B
      const totalActive = g.metricas_cotas.ativas_em_dia +
        g.metricas_cotas.contempladas_inadimplentes +
        g.metricas_cotas.nao_contempladas_inadimplentes;

      const calculableVolume = totalActive * g.caracteristicas.valor_medio_do_bem;

      return {
        period: g.data_base,
        segment: String(g.codigo_segmento),
        volume: calculableVolume,
        activeQuotas: totalActive,
        defaultQuotas: (g.metricas_cotas.contempladas_inadimplentes + g.metricas_cotas.nao_contempladas_inadimplentes),
        dropouts: g.metricas_cotas.excluidas,
        quitadas: g.metricas_cotas.quitadas,
        taxaAdmin: g.caracteristicas.taxa_de_administracao,
        contemplated: g.metricas_cotas.contempladas_no_mes,
        source: 'group'
      };
    });

    return [...segs, ...groups];
  }, [data]);

  const isRealData = data && overviewData.length > 0;

  // Agrupamento Temporal para Gráficos
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!overviewData.length) return [];
    const grouped = overviewData.reduce((acc, curr) => {
      const key = curr.period;
      if (!acc[key]) acc[key] = { name: key, volume: 0, participants: 0, defaultAmount: 0, quitadas: 0, dropouts: 0 };
      acc[key].volume += curr.volume;
      acc[key].participants += curr.activeQuotas;
      acc[key].defaultAmount += curr.defaultQuotas;
      acc[key].quitadas += curr.quitadas;
      acc[key].dropouts += curr.dropouts;
      return acc;
    }, {} as Record<string, ChartDataPoint>);
    return Object.values(grouped).sort((a: ChartDataPoint, b: ChartDataPoint) => a.name.localeCompare(b.name));
  }, [overviewData]);

  const filteredData = useMemo(() => {
    switch (period) {
      case '1q': return chartData.slice(-3);
      case '1y': return chartData.slice(-12);
      case 'all': return chartData;
      default: return chartData;
    }
  }, [period, chartData]);

  // Deep Dive por Segmento
  const segmentBreakdown = useMemo(() => {
    const map = new Map<string, {
      name: string;
      volume: number;
      quotas: number;
      defaults: number;
      dropouts: number;
      feesSum: number;
      records: number;
    }>();

    const latestPeriod = chartData[chartData.length - 1]?.name;
    const currentData = overviewData.filter(d => d.period === latestPeriod);

    currentData.forEach(d => {
      const segName = d.segment || 'Outros';
      if (!map.has(segName)) {
        map.set(segName, { name: segName, volume: 0, quotas: 0, defaults: 0, dropouts: 0, feesSum: 0, records: 0 });
      }
      const entry = map.get(segName)!;
      entry.volume += d.volume;
      entry.quotas += d.activeQuotas;
      entry.defaults += d.defaultQuotas;
      entry.dropouts += d.dropouts;

      if (d.taxaAdmin > 0) {
        entry.feesSum += d.taxaAdmin;
        entry.records += 1;
      }
    });

    return Array.from(map.values()).map(item => ({
      ...item,
      avgFee: item.records > 0 ? item.feesSum / item.records : 0,
      defaultRate: item.quotas > 0 ? (item.defaults / item.quotas) * 100 : 0,
      dropoutRate: item.quotas > 0 ? (item.dropouts / item.quotas) * 100 : 0
    })).sort((a, b) => b.volume - a.volume);
  }, [overviewData, chartData]);

  // KPIs
  const kpis = useMemo(() => {
    const latest = filteredData[filteredData.length - 1] || { name: '', volume: 0, participants: 0, defaultAmount: 0, quitadas: 0, dropouts: 0 };
    const previous = filteredData.length > 1 ? filteredData[filteredData.length - 2] : null;

    const currentActive = latest.participants;

    // Inadimplência: Inadimplentes / Ativas
    const defaultRate = currentActive > 0 ? (latest.defaultAmount / currentActive) * 100 : 0;

    // Exclusão: Excluídas / (Ativas + Excluídas) - STRICT RULE
    const totalExposure = currentActive + latest.dropouts;
    const dropoutRate = totalExposure > 0 ? (latest.dropouts / totalExposure) * 100 : 0;

    // Quitação: Quitadas / Ativas - STRICT RULE
    const quitationRate = currentActive > 0 ? (latest.quitadas / currentActive) * 100 : 0;

    const recordsWithRevenue = overviewData.filter(d => d.volume > 0 && d.period === latest.name);
    const totalRev = recordsWithRevenue.reduce((acc, r) => acc + r.volume, 0);
    const totalQtd = recordsWithRevenue.reduce((acc, r) => acc + r.activeQuotas, 0);
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
      quitationRate
    };
  }, [filteredData, overviewData]);

  if (!isRealData) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-4 text-center">
        <div className="p-6 bg-slate-100 rounded-full">
          <Database size={48} className="text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Nenhum dado encontrado</h2>
        <p className="text-slate-500 max-w-md">Importe os arquivos CSV do BACEN (Segmentos, Imóveis ou Móveis) para visualizar os indicadores de mercado.</p>
      </div>
    );
  }

  const handleGenerateInsight = async () => {
    setLoadingInsight(true);
    const context = `
      Cenário Atual de Mercado (Consórcio):
      - Volume Financeiro Total: R$ ${(kpis.balanceVolume / 1000000).toFixed(1)} Milhões
      - Cotas Ativas: ${kpis.activeQuotas.toLocaleString()}
      - Segmento Líder (Volume): ${segmentBreakdown[0]?.name} (R$ ${(segmentBreakdown[0]?.volume / 1000000).toFixed(1)}M)
      - Inadimplência Média: ${kpis.defaultRate.toFixed(2)}%
      - Taxa de Quitação: ${kpis.quitationRate.toFixed(2)}%
      - Rotatividade (Exclusão): ${kpis.dropoutRate.toFixed(2)}%
      - Ticket Médio: R$ ${kpis.avgTicket.toFixed(0)}
    `;
    const result = await generateMarketInsight(context, { history: filteredData.slice(-6) });
    setInsightData(result);
    setLoadingInsight(false);
  };

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
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 shadow-sm animate-fade-in relative">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-blue-900 font-bold text-lg mb-2">Análise de Inteligência de Mercado</h3>
              <div className="prose prose-sm text-slate-700 max-w-none">
                {insightData.text}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricsCard
          title="Volume Financeiro (Carteira)"
          value={`R$ ${(kpis.balanceVolume / 1000000).toFixed(1)}M`}
          trend={Number(kpis.volumeTrend.toFixed(1))}
          trendLabel="vs. anterior"
          color="blue"
        />
        <MetricsCard
          title="Cotas Ativas"
          value={kpis.activeQuotas.toLocaleString()}
          color="emerald"
        />
        <MetricsCard
          title="Ticket Médio"
          value={`R$ ${kpis.avgTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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
                <Tooltip formatter={(value: number) => `R$ ${(value / 1000000).toFixed(1)}M`} />
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
                  formatter={(value: number) => [`R$ ${(value / 1000000).toFixed(2)}M`, 'Volume']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="volume" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* DEBUG INSPECTOR */}
      <DataInspector data={data} />
    </div>
  );
};