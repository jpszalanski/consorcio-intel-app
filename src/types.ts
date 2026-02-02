
// Data Models based on Central Bank of Brazil (BACEN) Consortium Data

// Segmentos oficiais
export enum BacenSegment {
  IMOVEIS = 'Bens Imóveis (Seg. 1)', 
  VEICULOS_PESADOS = 'Veículos Pesados/Agro (Seg. 2)', 
  VEICULOS_LEVES = 'Veículos Leves (Seg. 3)', 
  MOTOCICLETAS = 'Motocicletas (Seg. 4)', 
  OUTROS_BENS = 'Outros Bens Duráveis (Seg. 5)', 
  SERVICOS = 'Serviços (Seg. 6)' 
}

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

// === MODELAGEM ESTRITA POR TIPO DE ARQUIVO ===

// 1. Arquivo de Segmentos (AAAAMMSegmentos.csv)
// Visão macro, não possui "Valor Médio do Bem" detalhado por grupo, apenas agregados.
export interface BacenSegmentData {
  period: string; 
  cnpj: string; 
  adminName: string; 
  segment: BacenSegment; 
  
  taxaAdmin: number; 
  gruposAtivos: number;
  gruposConstituidos: number; 
  gruposEncerrados: number; 

  cotasComercializadas: number; 
  cotasExcluidas: number; 
  cotasContempladas: number; // No segmento é geral
  cotasAtivas: number; // Total direto
  cotasInadimplentes: number; // Total direto

  revenue?: number; // Calculado estimado (já que não tem valor do bem por grupo)
}

// 2. Arquivos de Grupos (Imóveis e Móveis)
// Granularidade maior: possui Código do Grupo, Valor do Bem, Prazo, etc.
export interface BacenGroupData {
  period: string; 
  cnpj: string; 
  adminName: string; 
  segment: BacenSegment; // Inferido pelo tipo do arquivo
  groupCode: string; // Essencial aqui

  taxaAdmin: number; 
  valorMedioBem: number; // Campo Chave para cálculo
  prazoGrupo: number;
  indiceCorrecao?: string;

  gruposAtivos: number; 
  
  cotasComercializadas: number; 
  cotasExcluidas: number; 
  cotasQuitadas: number;

  cotasAtivasNaoContempladas: number; 
  cotasAtivasContempladasAcumuladas: number; 
  
  cotasContempladasNoMes: number; 

  cotasAtivasEmDia: number; 
  cotasAtivasInadimplentes: number; 

  // CAMPOS CALCULADOS ESTRITOS (Volume Financeiro)
  activeQuotas: number; // (NaoContempladas + ContempladasAcumuladas)
  balance: number; // (activeQuotas * valorMedioBem) -> SALDO DA CARTEIRA DO GRUPO
  defaultBalance: number; // (cotasAtivasInadimplentes * valorMedioBem) -> VOLUME INADIMPLENTE
  contemplatedBalance: number; // (cotasContempladasNoMes * valorMedioBem) -> CRÉDITO LIBERADO NO MÊS
}

export interface RegionalBacenData {
  uf: string;
  region: string;
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

// Tabela Temporária (Staging) para Importação Bruta
export interface StagingItem {
  id?: string;
  batchId: string;
  fileName: string;
  importType: 'segments' | 'real_estate' | 'movables' | 'regional_uf';
  rawData: any; // JSON bruto do CSV
  processed: boolean;
  createdAt: any;
}

export interface ImportedFileLog {
  fileName: string;
  importDate: string;
  type: 'segments' | 'real_estate' | 'movables' | 'regional_uf'; 
  recordCount: number;
}

// Store Atualizada com separação estrita
export interface AppDataStore {
  segments: BacenSegmentData[];         // Coleção 1
  realEstateGroups: BacenGroupData[];   // Coleção 2
  movableGroups: BacenGroupData[];      // Coleção 3
  
  regional: RegionalBacenData[];
  competitors: CompetitorMetric[];
  administrators: Administrator[];
  importedFiles: ImportedFileLog[];
  lastUpdated: string | null;
}
