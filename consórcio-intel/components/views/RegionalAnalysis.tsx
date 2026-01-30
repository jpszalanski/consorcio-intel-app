
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie } from 'recharts';
import { RegionalBacenData } from '../../types';
import { Map, TrendingUp, Users, AlertTriangle } from 'lucide-react';

// Dados mockados seguindo a estrutura exata do BACEN (Dados por UF)
const mockRegionalData: RegionalBacenData[] = [
  { uf: 'SP', region: 'Sudeste', activeContemplatedBid: 12500, activeContemplatedLottery: 8400, activeNonContemplated: 420000, dropoutContemplated: 1200, dropoutNonContemplated: 45000, newAdhesionsQuarter: 15000, totalActive: 440900 },
  { uf: 'MG', region: 'Sudeste', activeContemplatedBid: 8200, activeContemplatedLottery: 5100, activeNonContemplated: 195000, dropoutContemplated: 800, dropoutNonContemplated: 22000, newAdhesionsQuarter: 8500, totalActive: 208300 },
  { uf: 'PR', region: 'Sul', activeContemplatedBid: 6500, activeContemplatedLottery: 4200, activeNonContemplated: 168000, dropoutContemplated: 600, dropoutNonContemplated: 18000, newAdhesionsQuarter: 7200, totalActive: 178700 },
  { uf: 'RS', region: 'Sul', activeContemplatedBid: 4100, activeContemplatedLottery: 3800, activeNonContemplated: 140000, dropoutContemplated: 550, dropoutNonContemplated: 16000, newAdhesionsQuarter: 4500, totalActive: 147900 },
  { uf: 'BA', region: 'Nordeste', activeContemplatedBid: 3200, activeContemplatedLottery: 2900, activeNonContemplated: 112000, dropoutContemplated: 400, dropoutNonContemplated: 19000, newAdhesionsQuarter: 6100, totalActive: 118100 },
  { uf: 'GO', region: 'Centro-Oeste', activeContemplatedBid: 4800, activeContemplatedLottery: 2100, activeNonContemplated: 88000, dropoutContemplated: 300, dropoutNonContemplated: 9500, newAdhesionsQuarter: 5800, totalActive: 94900 },
  { uf: 'RJ', region: 'Sudeste', activeContemplatedBid: 2100, activeContemplatedLottery: 2200, activeNonContemplated: 105000, dropoutContemplated: 450, dropoutNonContemplated: 15000, newAdhesionsQuarter: 2100, totalActive: 109300 },
  { uf: 'PE', region: 'Nordeste', activeContemplatedBid: 1800, activeContemplatedLottery: 1500, activeNonContemplated: 62000, dropoutContemplated: 200, dropoutNonContemplated: 9000, newAdhesionsQuarter: 3200, totalActive: 65300 },
];

export const RegionalAnalysis: React.FC = () => {
  const sortedData = useMemo(() => {
    return [...mockRegionalData].sort((a, b) => b.totalActive - a.totalActive);
  }, []);

  // Dados agregados para gráficos de pizza
  const totalBid = mockRegionalData.reduce((acc, curr) => acc + curr.activeContemplatedBid, 0);
  const totalLottery = mockRegionalData.reduce((acc, curr) => acc + curr.activeContemplatedLottery, 0);
  
  const contemplationTypeData = [
    { name: 'Por Lance', value: totalBid, color: '#2563eb' },
    { name: 'Por Sorteio', value: totalLottery, color: '#10b981' }
  ];

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Análise Regional (Dados por UF)</h2>
          <p className="text-slate-500">Métricas oficiais baseadas nos relatórios trimestrais do BACEN.</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-1.5 rounded-lg text-sm font-medium border border-blue-100">
          <Map size={16} />
          <span>Base: Trimestral</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart: Active Participants */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Users size={18} className="text-slate-500" />
            Top Estados: Participantes Ativos
          </h3>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis dataKey="uf" tick={{ fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as RegionalBacenData;
                      return (
                        <div className="bg-white p-4 border border-slate-200 shadow-xl rounded-xl">
                          <p className="font-bold text-slate-900 mb-2 text-lg border-b border-slate-100 pb-2">{data.uf} - {data.region}</p>
                          <div className="space-y-1 text-xs">
                             <div className="flex justify-between gap-4"><span className="text-slate-500">Total Ativos:</span> <span className="font-mono font-bold">{data.totalActive.toLocaleString()}</span></div>
                             <div className="flex justify-between gap-4"><span className="text-slate-500">Adesões Trimestre:</span> <span className="font-mono text-green-600">+{data.newAdhesionsQuarter.toLocaleString()}</span></div>
                             <div className="flex justify-between gap-4"><span className="text-slate-500">Desistentes (NC):</span> <span className="font-mono text-red-500">{data.dropoutNonContemplated.toLocaleString()}</span></div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="totalActive" name="Total Ativos" radius={[4, 4, 0, 0]} barSize={40}>
                  {sortedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index < 3 ? '#2563eb' : '#94a3b8'} />
                  ))}
                </Bar>
                <Bar dataKey="newAdhesionsQuarter" name="Novas Adesões" fill="#34d399" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4 text-xs text-slate-500">
             <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-600 rounded"></div> Estoque Ativo</div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-400 rounded"></div> Adesões no Trimestre</div>
          </div>
        </div>

        {/* Side Metrics */}
        <div className="space-y-6">
          {/* Contemplation Mix */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <h3 className="font-semibold text-slate-800 mb-4 text-sm">Mix de Contemplação (Ativos)</h3>
             <div className="h-48 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={contemplationTypeData}
                     cx="50%"
                     cy="50%"
                     innerRadius={40}
                     outerRadius={70}
                     paddingAngle={5}
                     dataKey="value"
                   >
                     {contemplationTypeData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={entry.color} />
                     ))}
                   </Pie>
                   <Tooltip />
                   <Legend verticalAlign="bottom" height={36} iconType="circle" />
                 </PieChart>
               </ResponsiveContainer>
             </div>
             <p className="text-xs text-center text-slate-400 mt-2">Agregado Nacional</p>
          </div>

          {/* High Dropouts Alert */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <div className="flex items-center gap-2 mb-4 text-amber-600">
                <AlertTriangle size={18} />
                <h3 className="font-bold text-sm">Alerta de Desistência</h3>
             </div>
             <div className="space-y-3">
                {sortedData.slice(0, 3).map(uf => {
                   const churnRate = ((uf.dropoutNonContemplated / uf.totalActive) * 100).toFixed(1);
                   return (
                      <div key={uf.uf} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg">
                         <span className="font-bold text-slate-700">{uf.uf}</span>
                         <div className="text-right">
                            <span className="block text-xs font-bold text-amber-600">{churnRate}%</span>
                            <span className="block text-[10px] text-slate-400">Taxa de evasão (NC)</span>
                         </div>
                      </div>
                   )
                })}
             </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="font-semibold text-slate-800 mb-4">Tabela Detalhada: Contemplações e Desistências</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-4 py-3">UF</th>
                <th className="px-4 py-3 text-right text-blue-600">Lances (Ativos)</th>
                <th className="px-4 py-3 text-right text-emerald-600">Sorteios (Ativos)</th>
                <th className="px-4 py-3 text-right">Adesões (Trim)</th>
                <th className="px-4 py-3 text-right text-red-500">Desistentes (Não Contemp.)</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row) => (
                <tr key={row.uf} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{row.uf}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{row.activeContemplatedBid.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{row.activeContemplatedLottery.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">+{row.newAdhesionsQuarter.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">{row.dropoutNonContemplated.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
