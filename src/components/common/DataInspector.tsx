import React from 'react';
import { AppDataStore } from '../../types';

interface Props {
    data: AppDataStore;
}

export const DataInspector: React.FC<Props> = ({ data }) => {
    // Use correct collection from store
    const groups = (data.detailedGroups || []).slice(0, 10);

    return (
        <div className="mt-8 p-4 bg-red-50 border-2 border-red-200 rounded-xl overflow-x-auto">
            <h3 className="text-red-700 font-bold mb-2 flex items-center gap-2">
                🛠 MODO DEBUG: Inspeção de Dados Brutos (Primeiros 10 Registros de Grupos Detalhados)
            </h3>
            <p className="text-sm text-red-600 mb-4">
                Verificando integridade dos dados carregados no store.
            </p>

            <table className="w-full text-xs text-left border-collapse">
                <thead>
                    <tr className="bg-red-100/50">
                        <th className="p-2 border-b border-red-200">Período</th>
                        <th className="p-2 border-b border-red-200">CNPJ (Raiz)</th>
                        <th className="p-2 border-b border-red-200">Grupo</th>
                        <th className="p-2 border-b border-red-200 text-right">Cotas Ativas</th>
                        <th className="p-2 border-b border-red-200 text-right">Vl. Médio (R$)</th>
                        <th className="p-2 border-b border-red-200 text-right font-bold">Saldo (Calc)</th>
                        <th className="p-2 border-b border-red-200 text-right text-gray-400">Seg.</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map((g, idx) => {
                        const saldo = (g.metricas_cotas?.ativas_em_dia || 0) * (g.caracteristicas?.valor_medio_do_bem || 0);
                        return (
                            <tr key={idx} className="border-b border-red-100 hover:bg-red-50/80">
                                <td className="p-2">{g.data_base}</td>
                                <td className="p-2 font-medium">{g.cnpj_raiz}</td>
                                <td className="p-2">{g.codigo_grupo}</td>
                                <td className="p-2 text-right">{(g.metricas_cotas?.ativas_em_dia || 0).toLocaleString()}</td>
                                <td className="p-2 text-right">{(g.caracteristicas?.valor_medio_do_bem || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right font-bold text-red-700">
                                    {saldo.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-2 text-right text-gray-500">
                                    {g.codigo_segmento}
                                </td>
                            </tr>
                        )
                    })}
                    {groups.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-red-400 font-bold">
                                NENHUM DADO DE GRUPO ENCONTRADO NO BANCO DE DADOS.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
