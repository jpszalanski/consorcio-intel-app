import React from 'react';
import { AppDataStore } from '../../types';

interface Props {
    data: AppDataStore;
}

export const DataInspector: React.FC<Props> = ({ data }) => {
    const groups = [...data.realEstateGroups, ...data.movableGroups].slice(0, 10);

    return (
        <div className="mt-8 p-4 bg-red-50 border-2 border-red-200 rounded-xl overflow-x-auto">
            <h3 className="text-red-700 font-bold mb-2 flex items-center gap-2">
                🛠 MODO DEBUG: Inspeção de Dados Brutos (Primeiros 10 Registros de Grupos)
            </h3>
            <p className="text-sm text-red-600 mb-4">
                Se "Saldo (Calc)" estiver 0, verifique se "Vl. Médio" e "Ativas" foram importados corretamente.
                Se esta tabela estiver vazia, faça o upload dos arquivos novamente.
            </p>

            <table className="w-full text-xs text-left border-collapse">
                <thead>
                    <tr className="bg-red-100/50">
                        <th className="p-2 border-b border-red-200">Período</th>
                        <th className="p-2 border-b border-red-200">Admin</th>
                        <th className="p-2 border-b border-red-200">Seg.</th>
                        <th className="p-2 border-b border-red-200 text-right">Cotas Ativas</th>
                        <th className="p-2 border-b border-red-200 text-right">Vl. Médio (R$)</th>
                        <th className="p-2 border-b border-red-200 text-right font-bold">Saldo (Calc)</th>
                        <th className="p-2 border-b border-red-200 text-right text-gray-400">Saldo (Bruto/FB)</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map((g, idx) => (
                        <tr key={idx} className="border-b border-red-100 hover:bg-red-50/80">
                            <td className="p-2">{g.period}</td>
                            <td className="p-2 font-medium">{g.adminName}</td>
                            <td className="p-2">{g.segment}</td>
                            <td className="p-2 text-right">{g.activeQuotas.toLocaleString()}</td>
                            <td className="p-2 text-right">{g.valorMedioBem?.toLocaleString()}</td>
                            <td className="p-2 text-right font-bold text-red-700">
                                {(g.balance || 0).toLocaleString()}
                            </td>
                            <td className="p-2 text-right text-gray-500">
                                {/* Debugging fallback source */}
                                {((g as any).revenue || 0).toLocaleString()}
                            </td>
                        </tr>
                    ))}
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
