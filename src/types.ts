
// ================================================================================
// 3.1 MODELAGEM DE COLECOES (Strict based on ESTRUTURA DE DADOS.txt)
// ================================================================================

export enum BacenSegment {
  IMOVEIS = 1,
  VEICULOS_PESADOS = 2,
  AUTOMOVEIS = 3,
  MOTOCICLETAS = 4,
  BENS_MOVEIS_DURAVEIS = 5,
  SERVICOS_TURISTICOS = 6
}

// COLECAO: administradoras
export interface Administrator {
  cnpj_raiz: string;
  nome_reduzido: string;
  segmentos_atuantes: number[];
  primeiro_registro: string;
  ultimo_registro: string;
  total_grupos_historico: number;
  _importacao?: {
    ultimo_arquivo: string;
    checksum: string;
    processado_em: any; // Timestamp
  }
  isFavorite?: boolean; // UI only prop
}

// COLECAO: series_consolidadas
export interface ConsolidatedSeries {
  // Chaves
  id?: string; // {CNPJ}_{Segmento}_{DataBase}
  cnpj_raiz: string;
  codigo_segmento: number;
  data_base: string; // AAAA-MM
  tipo_segmento: 'imoveis' | 'moveis';

  metricas_brutas: {
    taxa_de_administracao: number;
    quantidade_de_grupos_ativos: number;
    quantidade_de_grupos_constituidos_no_mes: number;
    quantidade_de_grupos_encerrados_no_mes: number;
    quantidade_de_cotas_comercializadas_no_mes: number;
    quantidade_de_cotas_excluidas_a_comercializar: number;
    quantidade_acumulada_de_cotas_ativas_contempladas: number;
    quantidade_de_cotas_ativas_nao_contempladas: number;
    quantidade_de_cotas_ativas_contempladas_no_mes: number;
    quantidade_de_cotas_ativas_em_dia: number;
    quantidade_de_cotas_ativas_contempladas_inadimplentes: number;
    quantidade_de_cotas_ativas_nao_contempladas_inadimplentes: number;
    quantidade_de_cotas_excluidas: number;
    quantidade_de_cotas_ativas_quitadas: number;
    quantidade_de_cotas_ativas_com_credito_pendente_de_utilizacao: number;
  };

  indicadores_calculados: {
    cotas_ativas_total: number;
    taxa_inadimplencia_total: number;
    taxa_inadimplencia_contemplados: number;
    taxa_inadimplencia_nao_contemplados: number;
    taxa_contemplacao_mensal: number;
    taxa_exclusao: number;
    taxa_quitacao: number;
    taxa_credito_pendente: number;
    taxa_substituicao_titularidade: number;
  };

  _fonte: {
    arquivo_origem: string;
    linha_no_csv: number;
    hash_validacao: string;
    importado_em: any;
    versao_layout: string;
  };
}

// COLECAO: grupos_detalhados
export interface DetailedGroup {
  // Chaves
  id?: string; // {CNPJ}_{CodGrupo}_{DataBase} OR {CNPJ}_{CodGrupo}_{SegDerivado}_{DataBase}
  cnpj_raiz: string;
  codigo_grupo: string;
  data_base: string;
  codigo_segmento: number;

  caracteristicas: {
    numero_assembleias_geral_ordinaria: number;
    valor_medio_do_bem: number;
    indice_correcao: string;
    taxa_de_administracao: number;
    prazo_do_grupo_em_meses: number;
  };

  metricas_cotas: {
    ativas_em_dia: number;
    contempladas_inadimplentes: number;
    nao_contempladas_inadimplentes: number;
    contempladas_no_mes: number;
    contempladas_acumulado: number;
    excluidas: number;
    quitadas: number; // Suportado em ambos IMV e MOV
    credito_pendente: number; // Pode ser 0 se não houver coluna direta em IMV/MOV
    excluidas_a_comercializar: number; // Pode ser 0
  };

  analise_risco: {
    status: 'normal' | 'alerta' | 'critico';
    motivo: string;
    percentual_grupo_concluido: number;
  };
}

// COLECAO: dados_trimestrais_uf
export interface QuarterlyData {
  id?: string; // {CNPJ}_{UF}_{Segmento}_{DataBase}
  cnpj_raiz: string;
  uf: string;
  codigo_segmento: number;
  data_base: string;

  acumulados: {
    contemplados_lance: number;
    contemplados_sorteio: number;
    ativos_nao_contemplados: number;
    excluidos_contemplados: number;
    excluidos_nao_contemplados: number;
  };

  trimestre: {
    contemplados_lance: number;
    contemplados_sorteio: number;
    excluidos_contemplados: number;
    adesoes: number;
  };

  totais: {
    ativos_total: number;
    contemplados_trimestre_total: number;
    taxa_contemplacao_trimestral: number;
    taxa_adesao: number;
  };
}

// COLECAO: indicadores_agregados
export interface AggregatedIndicators {
  id?: string; // nacional_segmento_{X}_{AAAA-MM}
  tipo: 'aggregated_national';
  data_base: string;
  segmento: number;

  totais_nacionais: {
    total_adms: number;
    total_grupos: number;
    total_cotas_ativas: number;
    total_cotas_contempladas_mes: number;
  };

  medias_ponderadas: {
    taxa_administracao_media: number;
    taxa_inadimplencia_media: number;
    prazo_medio: number;
  };

  rankings: {
    maior_taxa_admin: Array<{ cnpj: string; nome: string; valor: number }>;
    maior_inadimplencia: Array<{ cnpj: string; nome: string; valor: number }>;
    maior_crescimento: Array<{ cnpj: string; nome: string; valor: number }>;
  };

  distribuicao_uf: Record<string, { cotas: number; percentual: number }>;
}

// --- LOGGING ---
export interface ImportedFileLog {
  fileName: string;
  importDate: string;
  type: 'segmentos' | 'imoveis' | 'moveis' | 'uf';
  recordCount: number;
}

// --- STAGING ---
export interface StagingItem {
  id?: string;
  batchId: string;
  fileName: string;
  importType: 'segmentos' | 'imoveis' | 'moveis' | 'uf';
  rawData: any;
  processed: boolean;
  createdAt: any;
}

// --- APP DATA STORE ---
export interface AppDataStore {
  consolidated: ConsolidatedSeries[];
  detailedGroups: DetailedGroup[];
  quarterly: QuarterlyData[];
  aggregated: AggregatedIndicators[];
  administrators: Administrator[];

  importedFiles: ImportedFileLog[];
  lastUpdated: string | null;
}
