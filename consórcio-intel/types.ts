// Data Models based on the prompt's specifications

export enum SegmentType {
  REAL_ESTATE = 'Bens Imóveis',
  HEAVY_VEHICLES = 'Veículos Pesados e Máquinas',
  LIGHT_VEHICLES = 'Veículos Leves',
  MOTORCYCLES = 'Motocicletas',
  DURABLES = 'Outros Bens Duráveis',
  SERVICES = 'Serviços Turísticos'
}

export interface CompetitorMetric {
  name: string;
  marketShare: number;
  growth: number;
  activeGroups: number;
  defaultRate: number;
}

export interface HistoricalDataPoint {
  year: number;
  quarter: number;
  value: number;
  segment: SegmentType;
}

export interface RegionalData {
  uf: string;
  region: string;
  participants: number;
  growthRate: number;
  avgTicket: number;
  contemplationRate: number; // %
}

export interface OperationalMetric {
  category: string;
  value: number;
  target: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AIInsight {
  title: string;
  analysis: string;
  recommendation: string;
  riskLevel: 'Baixo' | 'Médio' | 'Alto';
}