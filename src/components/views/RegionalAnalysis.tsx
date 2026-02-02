import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie, CartesianGrid } from 'recharts';
import { AppDataStore, QuarterlyData } from '../../types';
import { Map as MapIcon } from 'lucide-react';

interface Props {
  data: AppDataStore;
}

// Interface interna para agregação da view (compatível com o que o componente espera)
interface RegionalViewData {
  uf: string;
  region: string; // Not in QuarterlyData, hardcode or remove
  activeContemplatedBid: number;
  activeContemplatedLottery: number;
  activeNonContemplated: number;
  dropoutContemplated: number;
  dropoutNonContemplated: number;
  newAdhesionsQuarter: number;
  totalActive: number;
}

export const RegionalAnalysis: React.FC<Props> = ({ data }) => {
  // 1. Agregação Real por UF (Somando todas as administradoras daquela UF)
  const aggregatedData = useMemo<RegionalViewData[]>(() => {
    if (!data.quarterly) return [];

    const ufMap = new Map<string, RegionalViewData>();

    data.quarterly.forEach(item => {
      // Normalização básica
      const uf = item.uf.trim().toUpperCase();

      if (!ufMap.has(uf)) {
        ufMap.set(uf, {
          uf: uf,
          region: 'BR', // QuarterlyData doesn't have region, defaulting
          activeContemplatedBid: 0,
          activeContemplatedLottery: 0,
          activeNonContemplated: 0,
          dropoutContemplated: 0,
          dropoutNonContemplated: 0,
          newAdhesionsQuarter: 0,
          totalActive: 0
        });
      }

      const current = ufMap.get(uf)!;
      // Mapping Strict QuarterlyData fields to View fields
      current.activeContemplatedBid += (item.totais.contemplados_lance || 0);
      current.activeContemplatedLottery += (item.totais.contemplados_sorteio || 0);
      current.activeNonContemplated += (item.totais.ativos_nao_contemplados || 0);

      // Strict: "excluidos_contemplados" is mostly 0 or tricky. "excluidos_nao_contemplados" is NOT in source file (Note 1.4).
      // Oops, `ESTRUTURA DE DADOS.txt` says: "IMPORTANTE: NAO EXISTE no layout o campo Quantidade_de_consorciados_excluídos_não_contemplados...".
      // But `QuarterlyData` interface in types.ts (Step 875 check) has `excluidos_contemplados` and `taxa_adesao`.
      // Let's use what we have. If strict mapping omitted calculated dropouts, we use 0.
      current.dropoutContemplated += (item.totais.excluidos_contemplados || 0);
      current.dropoutNonContemplated += 0; // Not available in source

      current.newAdhesionsQuarter += (item.totais.adesoes || 0);
      current.totalActive += (item.totais.total_ativos || 0);
    });

    return Array.from(ufMap.values()).sort((a, b) => b.totalActive - a.totalActive);
  }, [data]);

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
  const totalBid = aggregatedData.reduce((acc, curr) => acc + curr.activeContemplatedBid, 0);
  const totalLottery = aggregatedData.reduce((acc, curr) => acc + curr.activeContemplatedLottery, 0);

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
                const churn = row.totalActive > 0 ? (row.dropoutNonContemplated / row.totalActive) * 100 : 0;
                return (
                  <tr key={row.uf} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-bold text-slate-900">{row.uf}</td>
                    <td className="px-6 py-3 text-right">{row.totalActive.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-emerald-600">+{row.newAdhesionsQuarter.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-red-500">-{row.dropoutNonContemplated.toLocaleString()}</td>
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
