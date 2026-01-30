
import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { predictDemand } from '../../services/geminiService';
import { BacenSegment } from '../../types';
import { BrainCircuit, TrendingUp } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';

// Mock Data aligned with Segments 1-6
const mockTrendData = [
  { quarter: 'Q1 2023', seg1: 100, seg2: 50, seg3: 120, seg4: 80, seg6: 30 },
  { quarter: 'Q2 2023', seg1: 105, seg2: 52, seg3: 125, seg4: 85, seg6: 32 },
  { quarter: 'Q3 2023', seg1: 110, seg2: 55, seg3: 130, seg4: 82, seg6: 35 },
  { quarter: 'Q4 2023', seg1: 115, seg2: 60, seg3: 135, seg4: 90, seg6: 38 },
  { quarter: 'Q1 2024', seg1: 118, seg2: 62, seg3: 138, seg4: 92, seg6: 40 },
  { quarter: 'Q2 2024', seg1: 125, seg2: 65, seg3: 145, seg4: 95, seg6: 45 },
  { quarter: 'Q3 2024', seg1: 130, seg2: 68, seg3: 150, seg4: 98, seg6: 48 },
  { quarter: 'Q4 2024', seg1: 132, seg2: 75, seg3: 155, seg4: 105, seg6: 52 },
];

export const TrendAnalysis: React.FC = () => {
  const [selectedSegment, setSelectedSegment] = useState<BacenSegment>(BacenSegment.IMOVEIS);
  const [prediction, setPrediction] = useState<{ prediction: string; rationale: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('all');

  const filteredData = useMemo(() => {
    switch (period) {
      case '1q': return mockTrendData.slice(-2);
      case '1y': return mockTrendData.slice(-4);
      case 'all': return mockTrendData;
      default: return mockTrendData;
    }
  }, [period]);

  const handlePredict = async () => {
    setLoading(true);
    const result = await predictDemand(selectedSegment, filteredData);
    setPrediction(result);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tendências por Segmento</h2>
          <p className="text-slate-500">Histórico de adesões consolidado (Segmentos 1 a 6).</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
           <PeriodSelector value={period} onChange={setPeriod} options={['1q', '1y', 'all']} />
           <select 
             className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 shadow-sm max-w-xs"
             value={selectedSegment}
             onChange={(e) => {
               setSelectedSegment(e.target.value as BacenSegment);
               setPrediction(null);
             }}
           >
             {Object.values(BacenSegment).map((s) => (
               <option key={s} value={s}>{s}</option>
             ))}
           </select>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="font-semibold text-slate-800 mb-6">Evolução do Índice de Demanda</h3>
        
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="quarter" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Legend />
              {/* Plotting key segments */}
              <Line name="Imóveis (Seg 1)" type="monotone" dataKey="seg1" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} />
              <Line name="Veíc. Leves (Seg 3)" type="monotone" dataKey="seg3" stroke="#10b981" strokeWidth={3} dot={{r: 4}} />
              <Line name="Pesados/Agro (Seg 2)" type="monotone" dataKey="seg2" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} />
              <Line name="Serviços (Seg 6)" type="monotone" dataKey="seg6" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Prediction Section */}
      <div className="bg-slate-900 rounded-xl p-6 text-white shadow-lg border border-slate-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <BrainCircuit className="text-indigo-400" size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Predição Estratégica Gemini</h3>
            <p className="text-slate-400 text-sm">Análise baseada nos ciclos históricos e variáveis macro (IPCA/Selic).</p>
          </div>
        </div>

        {!prediction ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-slate-300 text-sm max-w-2xl">
              Gerar projeção para <span className="font-semibold text-white">{selectedSegment}</span> para os próximos 12 meses. A análise correlaciona os dados do arquivo "Segmentos Consolidados" com indicadores econômicos externos.
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
