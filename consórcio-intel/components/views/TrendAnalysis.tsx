import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { predictDemand } from '../../services/geminiService';
import { SegmentType } from '../../types';
import { BrainCircuit, TrendingUp } from 'lucide-react';
import { PeriodSelector, PeriodOption } from '../common/PeriodSelector';

const mockTrendData = [
  { quarter: 'Q1 2023', imoveis: 100, veiculos: 80, servicos: 20 },
  { quarter: 'Q2 2023', imoveis: 105, veiculos: 85, servicos: 22 },
  { quarter: 'Q3 2023', imoveis: 110, veiculos: 82, servicos: 25 },
  { quarter: 'Q4 2023', imoveis: 115, veiculos: 90, servicos: 30 },
  { quarter: 'Q1 2024', imoveis: 118, veiculos: 92, servicos: 28 },
  { quarter: 'Q2 2024', imoveis: 125, veiculos: 95, servicos: 35 },
  { quarter: 'Q3 2024', imoveis: 130, veiculos: 98, servicos: 40 },
  { quarter: 'Q4 2024', imoveis: 132, veiculos: 105, servicos: 45 },
  { quarter: 'Q1 2025', imoveis: 135, veiculos: 102, servicos: 48 },
  { quarter: 'Q2 2025', imoveis: 140, veiculos: 108, servicos: 55 },
];

export const TrendAnalysis: React.FC = () => {
  const [selectedSegment, setSelectedSegment] = useState<SegmentType>(SegmentType.REAL_ESTATE);
  const [prediction, setPrediction] = useState<{ prediction: string; rationale: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('all');

  // Filter Logic
  const filteredData = useMemo(() => {
    switch (period) {
      case '1q': return mockTrendData.slice(-2); // Show at least 2 points for a line segment
      case '1y': return mockTrendData.slice(-4);
      case 'all': return mockTrendData;
      default: return mockTrendData;
    }
  }, [period]);

  const handlePredict = async () => {
    setLoading(true);
    // We pass the filtered data so the AI analyzes the selected timeframe specifically
    const result = await predictDemand(selectedSegment, filteredData);
    setPrediction(result);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tendências de Mercado</h2>
          <p className="text-slate-500">Análise histórica e projeções futuras.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
           <PeriodSelector value={period} onChange={setPeriod} options={['1q', '1y', 'all']} />
           <select 
             className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 shadow-sm"
             value={selectedSegment}
             onChange={(e) => {
               setSelectedSegment(e.target.value as SegmentType);
               setPrediction(null);
             }}
           >
             {Object.values(SegmentType).map((s) => (
               <option key={s} value={s}>{s}</option>
             ))}
           </select>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
           <h3 className="font-semibold text-slate-800">Índice de Demanda Agregada</h3>
           <div className="flex gap-2">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <span className="w-3 h-3 rounded-full bg-blue-600"></span> Imóveis
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span> Veículos
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span> Serviços
              </span>
           </div>
        </div>
        
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="quarter" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Line type="monotone" dataKey="imoveis" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
              <Line type="monotone" dataKey="veiculos" stroke="#10b981" strokeWidth={3} dot={{r: 4}} />
              <Line type="monotone" dataKey="servicos" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Prediction Section */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <BrainCircuit className="text-blue-400" size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Predição de Demanda com IA</h3>
            <p className="text-slate-400 text-sm">Gemini AI model: gemini-3-flash-preview</p>
          </div>
        </div>

        {!prediction ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-slate-300 text-sm max-w-2xl">
              Utilize nossa inteligência artificial para projetar a demanda do segmento de <span className="font-semibold text-white">{selectedSegment}</span> para os próximos 4 trimestres, considerando a série histórica {period === 'all' ? 'completa' : 'recente'} e fatores macroeconômicos.
            </p>
            <button
              onClick={handlePredict}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>Processando dados...</>
              ) : (
                <>
                  <TrendingUp size={18} />
                  Gerar Previsão
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-white/10 rounded-lg p-4 border border-white/10">
              <span className="text-xs uppercase tracking-wider text-blue-300 font-semibold">Tendência Projetada ({period === 'all' ? 'Longo Prazo' : 'Curto Prazo'})</span>
              <p className="text-xl font-bold mt-1">{prediction.prediction}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Racional da Análise</span>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                {prediction.rationale}
              </p>
            </div>
            <button 
              onClick={() => setPrediction(null)}
              className="text-xs text-slate-400 hover:text-white underline mt-2"
            >
              Nova Análise
            </button>
          </div>
        )}
      </div>
    </div>
  );
};