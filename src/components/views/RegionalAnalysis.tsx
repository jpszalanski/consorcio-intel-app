import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie, CartesianGrid } from 'recharts';
import { AppDataStore } from '../../types';
import { Map as MapIcon, Loader2, Database } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';



// Interface compatível com o retorno da Cloud Function
interface RegionalViewData {
  uf: string;
  activeContemplatedBid: number;
  activeContemplatedLottery: number;
  activeNonContemplated: number;
  dropoutContemplated: number;
  dropoutNonContemplated: number;
  newAdhesionsQuarter: number;
  totalActive: number;
}

export const RegionalAnalysis: React.FC = () => {
  const [aggregatedData, setAggregatedData] = useState<RegionalViewData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const functions = getFunctions();
        const getRegional = httpsCallable<unknown, { data: RegionalViewData[] }>(functions, 'getRegionalData');
        const result = await getRegional();
        setAggregatedData(result.data.data);
      } catch (error) {
        console.error("Error fetching regional data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p>Calculando indicadores regionais (BigQuery)...</p>
      </div>
    );
  }

  // Se não houver dados regionais importados
  if (aggregatedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <MapIcon size={48} className="mb-4 opacity-50" />
        <p>Dados regionais não disponíveis.</p>
        <p className="text-sm">Importe arquivos "Dados por UF" do BACEN na aba Importar.</p>
      </div>
    );
  }

  // Dados agregados para gráficos de pizza (Nacional)
  const totalBid = aggregatedData.reduce((acc, curr) => acc + (Number(curr.activeContemplatedBid) || 0), 0);
  const totalLottery = aggregatedData.reduce((acc, curr) => acc + (Number(curr.activeContemplatedLottery) || 0), 0);

  const pieData = [
    { name: 'Sorteio', value: totalLottery, color: '#10b981' },
    { name: 'Lance', value: totalBid, color: '#3b82f6' }
  ];

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Análise Regional</h2>
        <p className="text-slate-500">Distribuição geográfica de cotas e perfil de contemplação.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">Top 10 Estados em Volume (Cotas Ativas)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregatedData.slice(0, 10)} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="uf" type="category" width={40} tick={{ fontWeight: 'bold' }} />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '8px', border: 'none' }}
                />
                <Bar dataKey="totalActive" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} name="Total Cotistas">
                  {aggregatedData.slice(0, 10).map((entry, index) => (
                    <Cell key={`cell-${index}`} fillOpacity={1 - (index * 0.05)} fill="#3b82f6" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-2">Perfil de Contemplação (Nacional)</h3>
          <div className="h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-800">
                {((totalBid / (totalBid + totalLottery)) * 100).toFixed(0)}%
              </span>
              <span className="text-xs text-slate-500">Lance</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Sorteio</span>
              <span className="font-bold text-emerald-600">{totalLottery.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Lance</span>
              <span className="font-bold text-blue-600">{totalBid.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Detalhamento por Estado</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-3">UF</th>
                <th className="px-6 py-3 text-right">Cotas Ativas</th>
                <th className="px-6 py-3 text-right">Novas Vendas</th>
                <th className="px-6 py-3 text-right">Desistências</th>
                <th className="px-6 py-3 text-right">Evasão %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aggregatedData.map((row) => {
                const totalAct = Number(row.totalActive) || 0;
                const dropouts = Number(row.dropoutNonContemplated) || 0;
                const churn = totalAct > 0 ? (dropouts / totalAct) * 100 : 0;
                return (
                  <tr key={row.uf} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-bold text-slate-900">{row.uf}</td>
                    <td className="px-6 py-3 text-right">{totalAct.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-emerald-600">+{Number(row.newAdhesionsQuarter).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-red-500">-{dropouts.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${churn > 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {churn.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
