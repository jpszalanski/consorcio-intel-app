import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { RegionalData } from '../../types';

const mockRegionalData: RegionalData[] = [
  { uf: 'SP', region: 'Sudeste', participants: 450000, growthRate: 5.2, avgTicket: 180000, contemplationRate: 1.2 },
  { uf: 'MG', region: 'Sudeste', participants: 210000, growthRate: 6.8, avgTicket: 165000, contemplationRate: 1.1 },
  { uf: 'PR', region: 'Sul', participants: 180000, growthRate: 7.5, avgTicket: 175000, contemplationRate: 1.4 },
  { uf: 'RS', region: 'Sul', participants: 150000, growthRate: 4.1, avgTicket: 170000, contemplationRate: 1.3 },
  { uf: 'BA', region: 'Nordeste', participants: 120000, growthRate: 8.9, avgTicket: 140000, contemplationRate: 0.9 },
  { uf: 'RJ', region: 'Sudeste', participants: 110000, growthRate: 2.5, avgTicket: 190000, contemplationRate: 1.0 },
  { uf: 'GO', region: 'Centro-Oeste', participants: 95000, growthRate: 11.2, avgTicket: 155000, contemplationRate: 1.5 },
  { uf: 'SC', region: 'Sul', participants: 88000, growthRate: 6.5, avgTicket: 185000, contemplationRate: 1.4 },
  { uf: 'PE', region: 'Nordeste', participants: 65000, growthRate: 9.1, avgTicket: 145000, contemplationRate: 1.0 },
  { uf: 'CE', region: 'Nordeste', participants: 55000, growthRate: 8.5, avgTicket: 142000, contemplationRate: 1.1 },
];

export const RegionalAnalysis: React.FC = () => {
  const sortedData = useMemo(() => {
    return [...mockRegionalData].sort((a, b) => b.participants - a.participants);
  }, []);

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Análise Regional (Por UF)</h2>
        <p className="text-slate-500">Distribuição de cotistas e potencial de crescimento por estado.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-4">Top 10 Estados por Participantes Ativos</h3>
          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedData} layout="vertical" margin={{ left: 0, right: 30 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="uf" type="category" width={40} tick={{ fontWeight: 600 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg">
                          <p className="font-bold text-slate-900 mb-1">{data.uf} - {data.region}</p>
                          <p className="text-xs text-slate-500">Participantes: <span className="text-slate-700 font-mono">{data.participants.toLocaleString()}</span></p>
                          <p className="text-xs text-slate-500">Crescimento: <span className="text-green-600 font-mono">+{data.growthRate}%</span></p>
                          <p className="text-xs text-slate-500">Ticket Médio: <span className="text-slate-700 font-mono">R$ {data.avgTicket.toLocaleString()}</span></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="participants" radius={[0, 4, 4, 0]} barSize={32}>
                  {sortedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index < 3 ? '#2563eb' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Highlights */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-4">Oportunidades "White Space"</h3>
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-emerald-800">Centro-Oeste (Agro)</h4>
                    <p className="text-xs text-emerald-600 mt-1">Alta demanda por maquinário. GO cresceu 11.2%.</p>
                  </div>
                  <span className="text-lg font-bold text-emerald-700">+11.2%</span>
                </div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-blue-800">Nordeste (Serviços)</h4>
                    <p className="text-xs text-blue-600 mt-1">Turismo impulsionando consórcios de serviços na BA/PE.</p>
                  </div>
                  <span className="text-lg font-bold text-blue-700">+9.1%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-4">Tabela Detalhada</h3>
            <div className="overflow-y-auto h-64 custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">UF</th>
                    <th className="px-3 py-2 text-right">Ticket Médio</th>
                    <th className="px-3 py-2 text-right">Contempl.</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((row) => (
                    <tr key={row.uf} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">{row.uf}</td>
                      <td className="px-3 py-2 text-right text-slate-600">R$ {(row.avgTicket/1000).toFixed(0)}k</td>
                      <td className="px-3 py-2 text-right text-slate-600">{row.contemplationRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};