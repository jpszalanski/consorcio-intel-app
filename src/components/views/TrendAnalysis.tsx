
import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { predictDemand } from '../../services/geminiService';
import { BacenSegment, AppDataStore } from '../../types';
import { BrainCircuit, TrendingUp, Filter, DollarSign, Users, BarChart2 } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';

interface Props {
  data: AppDataStore;
}

type MetricType = 'quotas' | 'volume' | 'ticket';

const SEGMENT_COLORS: Record<string, string> = {
  [BacenSegment.IMOVEIS]: '#2563eb', 
  [BacenSegment.VEICULOS_LEVES]: '#10b981', 
  [BacenSegment.VEICULOS_PESADOS]: '#f59e0b', 
  [BacenSegment.MOTOCICLETAS]: '#ef4444', 
  [BacenSegment.SERVICOS]: '#8b5cf6', 
  [BacenSegment.OUTROS_BENS]: '#64748b' 
};

export const TrendAnalysis: React.FC<Props> = ({ data }) => {
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [prediction, setPrediction] = useState<{ prediction: string; rationale: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('all');
  const [metricType, setMetricType] = useState<MetricType>('volume');

  // Aggregation Helper: Unify all sources into a timeline
  const pivotData = useMemo(() => {
    // Determine which field to use based on metric type
    const mapItem = (item: any) => {
      // Logic for Volume: use valorMedioBem * activeQuotas. If simple segment, fallback to 0 or estimate.
      let val = 0;
      if (metricType === 'volume') {
        const avgVal = item.valorMedioBem || 0;
        val = item.activeQuotas || item.cotasAtivas || 0;
        val = val * avgVal;
        // Se for segment (sem valorMedio), não contribui para volume (evita distorção)
      } else if (metricType === 'quotas') {
        val = item.activeQuotas || item.cotasAtivas || 0;
      } else {
        // Ticket Médio
        val = item.valorMedioBem || 0;
      }
      return { 
        period: item.period, 
        segment: item.segment, 
        value: val 
      };
    };

    const allPoints = [
      ...data.segments.map(s => mapItem(s)),
      ...data.realEstateGroups.map(s => mapItem(s)),
      ...data.movableGroups.map(s => mapItem(s))
    ].filter(p => p.value > 0); // Remove zeros to clean chart

    if (allPoints.length === 0) return [];

    const groupedByPeriod = new Map<string, any>();

    allPoints.forEach(item => {
      const key = item.period;
      if (!groupedByPeriod.has(key)) {
        groupedByPeriod.set(key, { period: key });
      }
      const entry = groupedByPeriod.get(key);
      const segKey = item.segment || 'Outros';
      
      // Accumulate or Average
      if (metricType === 'ticket') {
         // Weighted average accumulation logic is hard here without count, sticking to max or simple avg for trend visual
         // Better: Keep accumulated sum and count, then divide at end. 
         // For simplicity in this trend view: we just take average of observed values for that segment in that month
         const currentSum = entry[`${segKey}_sum`] || 0;
         const currentCount = entry[`${segKey}_count`] || 0;
         entry[`${segKey}_sum`] = currentSum + item.value;
         entry[`${segKey}_count`] = currentCount + 1;
         entry[segKey] = entry[`${segKey}_sum`] / entry[`${segKey}_count`];
      } else {
         entry[segKey] = (entry[segKey] || 0) + item.value;
      }
    });

    return Array.from(groupedByPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [data, metricType]);

  const availableSegments = useMemo(() => {
     const segs = new Set<string>();
     data.segments.forEach(s => segs.add(s.segment));
     data.realEstateGroups.forEach(s => segs.add(s.segment));
     data.movableGroups.forEach(s => segs.add(s.segment));
     return Array.from(segs);
  }, [data]);

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
    setLoading(true);
    const result = await predictDemand(selectedSegment as BacenSegment, aiContextData);
    setPrediction(result);
    setLoading(false);
  };

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
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#94a3b8', fontSize: 12}} 
                tickFormatter={(val) => metricType !== 'quotas' ? `${(val/1000).toFixed(0)}k` : val}
              />
              <Tooltip 
                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                formatter={(val: number) => metricType !== 'quotas' ? `R$ ${val.toLocaleString()}` : val.toLocaleString()}
              />
              <Legend />
              {availableSegments.map((seg, idx) => (
                 <Line 
                   key={seg} 
                   name={seg} 
                   type="monotone" 
                   dataKey={seg} 
                   stroke={SEGMENT_COLORS[seg] || '#94a3b8'} 
                   strokeWidth={3} 
                   dot={{r: 4}} 
                 />
              ))}
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
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-lg shadow-indigo-900/20"
            >
              {loading ? (
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
