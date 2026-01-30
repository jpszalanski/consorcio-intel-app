
// Data Models based on Central Bank of Brazil (BACEN) Consortium Data

// Segmentos oficiais conforme Circular 3.679/14
export enum BacenSegment {
  IMOVEIS = 'Bens Imóveis (Seg. 1)', // 1
  VEICULOS_PESADOS = 'Veículos Pesados/Agro (Seg. 2)', // 2
  VEICULOS_LEVES = 'Veículos Leves (Seg. 3)', // 3
  MOTOCICLETAS = 'Motocicletas (Seg. 4)', // 4
  OUTROS_BENS = 'Outros Bens Duráveis (Seg. 5)', // 5
  SERVICOS = 'Serviços (Seg. 6)' // 6
}

// Cadastro de Administradoras para análise comparativa
export interface Administrator {
  cnpj: string;
  name: string;
  isFavorite: boolean;
}

export interface CompetitorMetric {
  name: string;
  cnpj?: string;
  marketShare: number;
  growth: number;
  activeGroups: number;
  defaultRate: number;
}

export interface HistoricalDataPoint {
  period: string;
  cnpj?: string;
  adminName?: string;
  revenue: number;
  activeQuotas: number;
  segment?: BacenSegment;
}

export interface RegionalBacenData {
  uf: string;
  region: string; // Adicionado para suporte à análise regional (Norte, Sul, etc.)
  cnpj?: string;
  adminName?: string;
  activeContemplatedBid: number;
  activeContemplatedLottery: number;
  activeNonContemplated: number;
  dropoutContemplated: number;
  dropoutNonContemplated: number;
  newAdhesionsQuarter: number;
  totalActive: number;
}

export interface ImportedFileLog {
  fileName: string;
  importDate: string;
  type: 'consolidated' | 'regional_uf' | 'accounting';
  recordCount: number;
}

export interface AppDataStore {
  overview: HistoricalDataPoint[];
  regional: RegionalBacenData[];
  competitors: CompetitorMetric[];
  administrators: Administrator[]; // Cadastro centralizado
  importedFiles: ImportedFileLog[];
  lastUpdated: string | null;
}