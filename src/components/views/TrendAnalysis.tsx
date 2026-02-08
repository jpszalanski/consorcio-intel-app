
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { predictDemand } from '../../services/geminiService';
import { BacenSegment, AppDataStore } from '../../types';
import { BrainCircuit, TrendingUp, Filter, DollarSign, Users, BarChart2, Loader2 } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';



type MetricType = 'quotas' | 'volume' | 'ticket' | 'defaultRate' | 'defaultContemplated' | 'defaultNonContemplated' | 'adminFee';

interface TrendRow {
  data_base: string;
  codigo_segmento: number;
  total_quotas: number | string;
  total_volume: number | string;
  total_default_quotas?: number | string;
  total_default_contemplated?: number | string;
  total_default_non_contemplated?: number | string;
  avg_admin_fee?: number | string;
}

const SEGMENT_COLORS: Record<string, string> = {
  '1': '#2563eb', // Imoveis
  '2': '#f59e0b', // Pesados
  '3': '#10b981', // Leves
  '4': '#ef4444', // Motos
  '6': '#8b5cf6', // Servicos
  'Outros': '#64748b'
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



export const TrendAnalysis: React.FC = () => {
  const { user } = useAuth();
  const [rawData, setRawData] = useState<TrendRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [prediction, setPrediction] = useState<{ prediction: string; rationale: string } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('all');
  const [metricType, setMetricType] = useState<MetricType>('volume');

  // Fetch Data from BigQuery
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {

        const getTrend = httpsCallable<{ administratorId: string }, { data: TrendRow[] }>(functions, 'getTrendData');
        const result = await getTrend({ administratorId: user.uid });
        setRawData(result.data.data);
      } catch (error) {
        console.error("Error fetching trend data", error);
      } finally {
        setLoadingData(false);
      }
    };
    if (user) fetchData();
  }, [user]);

  // Aggregation Logic (Pivot for Chart)
  const pivotData = useMemo(() => {
    if (!rawData.length) return [];

    const groupedByPeriod = new Map<string, any>();

    rawData.forEach(row => {
      const period = row.data_base;
      if (!groupedByPeriod.has(period)) {
        groupedByPeriod.set(period, { period });
      }
      const entry = groupedByPeriod.get(period);
      const segName = getSegName(row.codigo_segmento); // Standardized Name

      // Select Value based on Metric
      let val = 0;
      const vol = Number(row.total_volume) || 0;
      const qtd = Number(row.total_quotas) || 0;
      const defTotal = Number(row.total_default_quotas) || 0;
      const defCont = Number(row.total_default_contemplated) || 0;
      const defNon = Number(row.total_default_non_contemplated) || 0;
      const fee = Number(row.avg_admin_fee) || 0;

      if (metricType === 'volume') val = vol;
      else if (metricType === 'quotas') val = qtd;
      else if (metricType === 'ticket') val = qtd > 0 ? vol / qtd : 0;
      else if (metricType === 'defaultRate') val = qtd > 0 ? (defTotal / qtd) * 100 : 0;
      else if (metricType === 'defaultContemplated') val = qtd > 0 ? (defCont / qtd) * 100 : 0;
      else if (metricType === 'defaultNonContemplated') val = qtd > 0 ? (defNon / qtd) * 100 : 0;
      else if (metricType === 'adminFee') val = fee;

      entry[segName] = val;
    });

    return Array.from(groupedByPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [rawData, metricType]);

  const availableSegments = useMemo(() => {
    const segs = new Set<string>();
    rawData.forEach(r => segs.add(getSegName(r.codigo_segmento)));
    return Array.from(segs).sort();
  }, [rawData]);

  const filteredData = useMemo(() => {
    let result = pivotData;
    if (period === '1q') result = pivotData.slice(-3);
    else if (period === '1y') result = pivotData.slice(-12);
    return result;
  }, [period, pivotData]);

  const aiContextData = useMemo(() => {
    if (!selectedSegment) return [];
    return filteredData.map(row => ({
      period: row.period,
      value: row[selectedSegment] || 0
    }));
  }, [filteredData, selectedSegment]);

  const handlePredict = async () => {
    if (!selectedSegment) return;
    setLoadingAi(true);
    // Extract pure segment name for AI context if needed, or pass full string
    const result = await predictDemand(selectedSegment as any, aiContextData);
    setPrediction(result);
    setLoadingAi(false);
  };

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p>Carregando tendências (BigQuery)...</p>
      </div>
    );
  }

  if (pivotData.length === 0) {
    return <div className="p-8 text-center text-slate-400">Dados históricos insuficientes para análise de tendência.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tendências de Mercado</h2>
          <p className="text-slate-500">Evolução histórica por segmento e indicador.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
          <div className="flex flex-col items-center">
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
              <button
                onClick={() => setMetricType('volume')}
                className={`p-2 rounded-md transition-all ${metricType === 'volume' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Volume Financeiro"
              >
                <DollarSign size={18} />
              </button>
              <button
                onClick={() => setMetricType('quotas')}
                className={`p-2 rounded-md transition-all ${metricType === 'quotas' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Cotas Ativas"
              >
                <Users size={18} />
              </button>
              <button
                onClick={() => setMetricType('ticket')}
                className={`p-2 rounded-md transition-all ${metricType === 'ticket' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Ticket Médio"
              >
                <BarChart2 size={18} />
              </button>
              <button
                onClick={() => setMetricType('defaultRate')}
                className={`p-2 rounded-md transition-all ${metricType.includes('default') ? 'bg-slate-100 text-red-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Inadimplência"
              >
                <TrendingUp size={18} />
              </button>
              <button
                onClick={() => setMetricType('adminFee')}
                className={`p-2 rounded-md transition-all ${metricType === 'adminFee' ? 'bg-slate-100 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Taxa de Administração"
              >
                <DollarSign size={18} />
              </button>
            </div>

            {/* Sub-filters for Default Rates */}
            {metricType.includes('default') && (
              <div className="flex flex-wrap gap-2 mt-2 animate-fade-in bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button onClick={() => setMetricType('defaultRate')} className={`text-[10px] px-2 py-0.5 rounded-full ${metricType === 'defaultRate' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}>Total</button>
                <button onClick={() => setMetricType('defaultContemplated')} className={`text-[10px] px-2 py-0.5 rounded-full ${metricType === 'defaultContemplated' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}>Contempladas</button>
                <button onClick={() => setMetricType('defaultNonContemplated')} className={`text-[10px] px-2 py-0.5 rounded-full ${metricType === 'defaultNonContemplated' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}>Não Contemp.</button>
              </div>
            )}
          </div>

          <PeriodSelector value={period} onChange={setPeriod} options={['1q', '1y', 'all']} />

          <div className="relative">
            <Filter size={16} className="absolute left-3 top-3 text-slate-400" />
            <select
              className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-10 p-2.5 shadow-sm min-w-[200px]"
              value={selectedSegment}
              onChange={(e) => {
                setSelectedSegment(e.target.value);
                setPrediction(null);
              }}
            >
              <option value="">Selecione para IA...</option>
              {availableSegments.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="font-semibold text-slate-800 mb-6 flex items-center gap-2">
          {metricType === 'volume' && 'Volume de Crédito (Saldo R$)'}
          {metricType === 'quotas' && 'Estoque de Cotas Ativas (Qtd)'}
          {metricType === 'ticket' && 'Ticket Médio por Grupo (R$)'}
        </h3>

        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickFormatter={(val) => metricType !== 'quotas' ? `${(val / 1000).toFixed(0)}k` : val}
              />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(val: number) => metricType !== 'quotas' ? `R$ ${val.toLocaleString()}` : val.toLocaleString()}
              />
              <Legend />
              {availableSegments.map((seg, idx) => {
                // Extract code from "1 - Imóveis" -> "1"
                const code = seg.split(' - ')[0];
                return (
                  <Line
                    key={seg}
                    name={seg}
                    type="monotone"
                    dataKey={seg}
                    stroke={SEGMENT_COLORS[code] || '#94a3b8'}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 text-white shadow-lg border border-slate-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <BrainCircuit className="text-indigo-400" size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Predição Estratégica Gemini</h3>
            <p className="text-slate-400 text-sm">Análise baseada nos ciclos históricos reais e variáveis macro.</p>
          </div>
        </div>

        {!selectedSegment ? (
          <p className="text-slate-500 text-sm">Selecione um segmento no filtro acima para habilitar a predição.</p>
        ) : !prediction ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-slate-300 text-sm max-w-2xl">
              Gerar projeção para <span className="font-semibold text-white">{selectedSegment}</span>.
              O modelo processará {aiContextData.length} pontos de dados históricos ({metricType}).
            </p>
            <button
              onClick={handlePredict}
              disabled={loadingAi}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-lg shadow-indigo-900/20"
            >
              {loadingAi ? (
                <>Analisando série histórica...</>
              ) : (
                <>
                  <TrendingUp size={18} />
                  Processar Predição
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <span className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">Cenário Projetado</span>
              <p className="text-xl font-bold mt-1 text-white">{prediction.prediction}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Fundamentação Técnica</span>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                {prediction.rationale}
              </p>
            </div>
            <button
              onClick={() => setPrediction(null)}
              className="text-xs text-slate-500 hover:text-white underline mt-2 transition-colors"
            >
              Reiniciar Análise
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
