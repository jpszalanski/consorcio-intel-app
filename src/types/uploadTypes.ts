export interface ImportDefinition {
    id: string;
    label: string;
    description: string;
    required: boolean;
    tableId: string;
}

export const IMPORT_DEFINITIONS: ImportDefinition[] = [
    {
        id: 'segments',
        label: 'Consolidado de Segmentos',
        description: 'Dados gerais de cotas e valores por segmento (Auto, Imóvel, etc)',
        required: true,
        tableId: 'series_consolidadas'
    },
    {
        id: 'real_estate',
        label: 'Detalhado de Imóveis',
        description: 'Informações granulares de grupos de Imóveis',
        required: true,
        tableId: 'grupos_detalhados'
    },
    {
        id: 'moveis',
        label: 'Detalhado de Veículos/Móveis',
        description: 'Informações granulares de grupos de Veículos',
        required: true,
        tableId: 'grupos_detalhados'
    },
    {
        id: 'regional_uf',
        label: 'Dados Regionais (UF)',
        description: 'Vendas e cancelamentos por Estado',
        required: true,
        tableId: 'dados_trimestrais_uf'
    }
];

export const getMonthOptions = () => [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
];

export const getYearOptions = () => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2, current - 3].map(y => y.toString());
};
