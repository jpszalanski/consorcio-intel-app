
import { db, ensureAuth } from './firebase';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  query,
  orderBy,
  limit,
  Timestamp,
  where
} from 'firebase/firestore';
import {
  AppDataStore,
  ImportedFileLog,
  Administrator,
  ConsolidatedSeries,
  DetailedGroup,
  QuarterlyData,
  StagingItem,
  BacenSegment
} from '../types';

// Coleções (STRICT NAMES from 3.1)
const COL_CONSOLIDATED = 'series_consolidadas';
const COL_DETAILED_GROUPS = 'grupos_detalhados';
const COL_QUARTERLY = 'dados_trimestrais_uf';
const COL_AGGREGATED = 'indicadores_agregados';
const COL_ADMINS = 'administradoras';
const COL_FILES = 'imported_files_log';
const COL_STAGING = 'staging_raw_data';

// --- HELPERS ---

const SEGMENT_MAP: Record<string, BacenSegment> = {
  '1': BacenSegment.IMOVEIS,
  '2': BacenSegment.VEICULOS_PESADOS,
  '3': BacenSegment.VEICULOS_LEVES,
  '4': BacenSegment.MOTOCICLETAS,
  '5': BacenSegment.OUTROS_BENS,
  '6': BacenSegment.SERVICOS
};

const normalizeKey = (str: string) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

// Robust Finder
const findValue = (row: any, candidates: (string | string[])[]): any => {
  const keys = Object.keys(row);
  const normalizedKeys = keys.map(k => ({ key: k, norm: normalizeKey(k) }));

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const target = normalizeKey(candidate);
      const match = normalizedKeys.find(nk => nk.norm === target);
      if (match) return row[match.key];
    } else if (Array.isArray(candidate)) {
      const targetParts = candidate.map(normalizeKey);
      const match = normalizedKeys.find(nk => targetParts.every(part => nk.norm.includes(part)));
      if (match) return row[match.key];
    }
  }
  return undefined;
};

const parseBrazilNum = (val: any): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (str === '' || str === '-') return 0;
  const cleanStr = str.replace(/[R$\s]/g, '');
  if (cleanStr.includes(',')) {
    return Number(cleanStr.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(cleanStr.replace(/\./g, '')) || 0;
};

// --- STRICT MAPPERS (Phase 2) ---

// 1.1 ARQUIVO: AAAAMMSegmentos_Consolidados.csv
const mapConsolidatedSeries = (row: any): ConsolidatedSeries | null => {
  const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
  if (!cnpj) return null;

  const segCode = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, ''));
  const database = String(findValue(row, ['Data_base']) || '');

  // Raw Metrics
  const emDia = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_em_dia']));
  const contInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_inadimplentes']));
  const naoContInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']));
  const contempladasAcum = parseBrazilNum(findValue(row, ['Quantidade_acumulada_de_cotas_ativas_contempladas']));
  const naoContempladas = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas']));
  const contempladasMes = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_no_mês']));
  const excluidas = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_excluídas']));
  const quitadas = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_quitadas']));
  const creditoPendente = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_com_crédito_pendente_de_utilização']));
  const excluidasComercializar = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_excluídas_a_comercializar']));

  // Calculations (Section 2)
  const cotasAtivasTotal = emDia + contInad + naoContInad;
  const taxaInadTotal = cotasAtivasTotal > 0 ? (contInad + naoContInad) / cotasAtivasTotal : 0;
  const taxaContemplacaoMensal = cotasAtivasTotal > 0 ? contempladasMes / cotasAtivasTotal : 0;
  const taxaExclusao = (cotasAtivasTotal + excluidas) > 0 ? excluidas / (cotasAtivasTotal + excluidas) : 0;
  const taxaQuitacao = cotasAtivasTotal > 0 ? quitadas / cotasAtivasTotal : 0;
  const taxaCreditoPendente = contempladasAcum > 0 ? creditoPendente / contempladasAcum : 0;
  const taxaSubstituicao = excluidas > 0 ? excluidasComercializar / excluidas : 0;

  return {
    id: `${cnpj}_${segCode}_${database}`,
    cnpj_raiz: cnpj,
    codigo_segmento: segCode,
    data_base: database,
    tipo_segmento: segCode === 1 ? 'imoveis' : 'moveis',

    metricas_brutas: {
      taxa_de_administracao: parseBrazilNum(findValue(row, ['Taxa_de_administração'])),
      quantidade_de_grupos_ativos: parseBrazilNum(findValue(row, ['Quantidade_de_grupos_ativos'])),
      quantidade_de_grupos_constituidos_no_mes: parseBrazilNum(findValue(row, ['Quantidade_de_grupos_constituídos_no_mês'])),
      quantidade_de_grupos_encerrados_no_mes: parseBrazilNum(findValue(row, ['Quantidade_de_grupos_encerrados_no_mês'])),
      quantidade_de_cotas_comercializadas_no_mes: parseBrazilNum(findValue(row, ['Quantidade_de_cotas_comercializadas_no_mês'])),
      quantidade_de_cotas_excluidas_a_comercializar: excluidasComercializar,
      quantidade_acumulada_de_cotas_ativas_contempladas: contempladasAcum,
      quantidade_de_cotas_ativas_nao_contempladas: naoContempladas,
      quantidade_de_cotas_ativas_contempladas_no_mes: contempladasMes,
      quantidade_de_cotas_ativas_em_dia: emDia,
      quantidade_de_cotas_ativas_contempladas_inadimplentes: contInad,
      quantidade_de_cotas_ativas_nao_contempladas_inadimplentes: naoContInad,
      quantidade_de_cotas_excluidas: excluidas,
      quantidade_de_cotas_ativas_quitadas: quitadas,
      quantidade_de_cotas_ativas_com_credito_pendente_de_utilizacao: creditoPendente
    },

    indicadores_calculados: {
      cotas_ativas_total: cotasAtivasTotal,
      taxa_inadimplencia_total: taxaInadTotal, // 0.0 - 1.0 format
      taxa_inadimplencia_contemplados: 0, // Implement later if needed per row
      taxa_inadimplencia_nao_contemplados: 0,
      taxa_contemplacao_mensal: taxaContemplacaoMensal,
      taxa_exclusao: taxaExclusao,
      taxa_quitacao: taxaQuitacao,
      taxa_credito_pendente: taxaCreditoPendente,
      taxa_substituicao_titularidade: taxaSubstituicao
    },

    _fonte: {
      arquivo_origem: 'Segmentos_Consolidados',
      linha_no_csv: 0,
      hash_validacao: '',
      importado_em: Timestamp.now(),
      versao_layout: '3.1'
    }
  };
};

// 1.2 & 1.3 ARQUIVOS DE GRUPOS
const mapDetailedGroup = (row: any, type: 'imoveis' | 'moveis'): DetailedGroup | null => {
  const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
  const grupo = String(findValue(row, ['Código_do_grupo', 'Codigo']) || '');
  const database = String(findValue(row, ['Data_base']) || '');
  if (!cnpj || !grupo) return null;

  // Segment Handling (1.3 Rule)
  let segCode = 1;
  if (type === 'imoveis') {
    segCode = 1;
  } else {
    // 32 -> 3
    const rawSeg = String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, '');
    segCode = parseInt(rawSeg.substring(0, 1)); // Take first digit or logic from 1.3
    if (rawSeg.length === 2 && parseInt(rawSeg) > 10) segCode = Math.floor(parseInt(rawSeg) / 10);
  }

  // ID Generation (3.1)
  const id = type === 'imoveis'
    ? `${cnpj}_${grupo}_${database}`
    : `${cnpj}_${grupo}_${segCode}_${database}`;

  // Metrics
  const emDia = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_em_dia']));
  const contInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_inadimplentes']));
  const naoContInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']));

  // Real Assembléia Logic (1.2 vs 1.3)
  let numAssembleias = parseBrazilNum(findValue(row, ['Número_da_assembléia_geral_ordinária', 'Assembleia']));
  // Logic 1.3 for Moveis is handled by source data or caller, but here we just map what's available

  return {
    id,
    cnpj_raiz: cnpj,
    codigo_grupo: grupo,
    data_base: database,
    codigo_segmento: segCode,

    caracteristicas: {
      numero_assembleias_geral_ordinaria: numAssembleias,
      valor_medio_do_bem: parseBrazilNum(findValue(row, ['Valor_médio_do_bem', 'Valor do Bem'])),
      indice_correcao: String(findValue(row, ['Índice_de_correção']) || ''),
      taxa_de_administracao: parseBrazilNum(findValue(row, ['Taxa_de_administração'])),
      prazo_do_grupo_em_meses: parseBrazilNum(findValue(row, ['Prazo_do_grupo_em_meses']))
    },

    metricas_cotas: {
      ativas_em_dia: emDia,
      contempladas_inadimplentes: contInad,
      nao_contempladas_inadimplentes: naoContInad,
      contempladas_no_mes: parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_no_mês'])),
      contempladas_acumulado: parseBrazilNum(findValue(row, ['Quantidade_acumulada_de_cotas_ativas_contempladas'])),
      excluidas: parseBrazilNum(findValue(row, ['Quantidade_de_cotas_excluídas'])),
      quitadas: parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_quitadas'])),
      credito_pendente: parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_com_crédito_pendente_de_utilização'])),
      excluidas_a_comercializar: parseBrazilNum(findValue(row, ['Quantidade_de_cotas_excluídas_a_comercializar']))
    },

    analise_risco: {
      status: 'normal',
      motivo: '',
      percentual_grupo_concluido: 0 // Calc later
    }
  };
};

// 1.4 ARQUIVO UF
const mapQuarterlyData = (row: any): QuarterlyData | null => {
  const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
  const uf = String(findValue(row, ['Unidade_da_Federação_do_consorciado', 'UF']) || '').toUpperCase();
  const database = String(findValue(row, ['Data_base']) || '');
  const segCode = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0'));

  if (!cnpj || !uf) return null;

  // Space Handling: "no_ trimestre"
  const excluidasContempladasTrimestre = parseBrazilNum(findValue(row, [
    'Quantidade_de_consorciados_excluídos_contemplados_no_ trimestre',
    'Quantidade_de_consorciados_excluídos_contemplados_no_trimestre'
  ]));

  const adesoes = parseBrazilNum(findValue(row, ['Quantidade_de_adesões_no_trimestre']));

  // Acumulados
  const contLance = parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_ativos_contemplados_por_lance']));
  const contSorteio = parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_ativos_contemplados_por_sorteio']));
  const ativosNaoCont = parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_ativos_não_contemplados']));

  const totalAtivos = contLance + contSorteio + ativosNaoCont;
  const totalContempladosTrim = parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_ativos_contemplados_por_lance_no_trimestre'])) +
    parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_ativos_contemplados_por_sorteio_no_trimestre']));

  return {
    id: `${cnpj}_${uf}_${segCode}_${database}`,
    cnpj_raiz: cnpj,
    uf,
    codigo_segmento: segCode,
    data_base: database,

    acumulados: {
      contemplados_lance: contLance,
      contemplados_sorteio: contSorteio,
      ativos_nao_contemplados: ativosNaoCont,
      excluidos_contemplados: parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_excluídos_contemplados'])),
      excluidos_nao_contemplados: parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_excluídos_não_contemplados']))
    },

    trimestre: {
      contemplados_lance: parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_ativos_contemplados_por_lance_no_trimestre'])),
      contemplados_sorteio: parseBrazilNum(findValue(row, ['Quantidade_de_consorciados_ativos_contemplados_por_sorteio_no_trimestre'])),
      excluidos_contemplados: excluidasContempladasTrimestre,
      adesoes
    },

    totais: {
      ativos_total: totalAtivos,
      contemplados_trimestre_total: totalContempladosTrim,
      taxa_contemplacao_trimestral: totalAtivos > 0 ? totalContempladosTrim / totalAtivos : 0,
      taxa_adesao: ativosNaoCont > 0 ? adesoes / ativosNaoCont : 0
    }
  };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const dataStore = {
  fetchData: async (): Promise<AppDataStore> => {
    try {
      // Load New Collections
      const [consRef, detailedRef, quartRef, aggRef, admRef, fileRef] = await Promise.all([
        getDocs(collection(db, COL_CONSOLIDATED)),
        getDocs(collection(db, COL_DETAILED_GROUPS)),
        getDocs(collection(db, COL_QUARTERLY)),
        getDocs(collection(db, COL_AGGREGATED)),
        getDocs(collection(db, COL_ADMINS)),
        getDocs(query(collection(db, COL_FILES), orderBy('importDate', 'desc'), limit(20)))
      ]);

      return {
        consolidated: consRef.docs.map(d => d.data() as ConsolidatedSeries),
        detailedGroups: detailedRef.docs.map(d => d.data() as DetailedGroup),
        quarterly: quartRef.docs.map(d => d.data() as QuarterlyData),
        aggregated: aggRef.docs.map(d => d.data() as any), // AggregatedIndicators
        administrators: admRef.docs.map(d => d.data() as Administrator),
        importedFiles: fileRef.docs.map(d => d.data() as ImportedFileLog),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error("Error fetching data", error);
      return {
        consolidated: [],
        detailedGroups: [],
        quarterly: [],
        aggregated: [],
        administrators: [],
        importedFiles: [],
        lastUpdated: null
      };
    }
  },

  checkConnection: async (): Promise<boolean> => {
    try {
      const user = await ensureAuth();
      return !!user;
    } catch (error) {
      return false;
    }
  },

  clearAllData: async (): Promise<void> => {
    const user = await ensureAuth();
    if (!user) throw new Error("Sem permissão");

    const deleteCollection = async (colName: string) => {
      // ... same logic ...
      let hasMore = true;
      while (hasMore) {
        const q = query(collection(db, colName), limit(300));
        const snapshot = await getDocs(q);
        if (snapshot.size === 0) {
          hasMore = false;
          break;
        }
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        await sleep(200);
      }
    };

    await Promise.all([
      deleteCollection(COL_CONSOLIDATED),
      deleteCollection(COL_DETAILED_GROUPS),
      deleteCollection(COL_QUARTERLY),
      deleteCollection(COL_AGGREGATED),
      deleteCollection(COL_FILES),
      deleteCollection(COL_STAGING)
    ]);
  },

  uploadToStaging: async (batchId: string, type: string, rawRows: any[]): Promise<void> => {
    const stagingItems = rawRows.map(row => ({
      batchId,
      fileName: 'Upload',
      importType: type as any,
      rawData: row,
      processed: false,
      createdAt: new Date().toISOString()
    }));
    await dataStore.batchWrite(stagingItems, COL_STAGING);
  },

  processStagingData: async (batchId: string): Promise<string> => {
    const user = await ensureAuth();
    if (!user) throw new Error("Auth required");

    const q = query(collection(db, COL_STAGING), where('batchId', '==', batchId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return "Nenhum dado encontrado no Staging.";

    let consolidated: ConsolidatedSeries[] = [];
    let detailed: DetailedGroup[] = [];
    let quarterly: QuarterlyData[] = [];
    let adminsFound = new Map<string, Administrator>();

    snapshot.docs.forEach(docSnap => {
      const item = docSnap.data() as StagingItem;
      const row = item.rawData;

      const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
      const name = findValue(row, ['Nome_da_Administradora']);

      // Admin Logic
      if (cnpj && name) {
        // We accumulate partial admin data, would need a merge strategy realistically
        if (!adminsFound.has(cnpj)) {
          adminsFound.set(cnpj, {
            cnpj_raiz: cnpj,
            nome_reduzido: String(name).trim(),
            segmentos_atuantes: [],
            primeiro_registro: '',
            ultimo_registro: '',
            total_grupos_historico: 0
          });
        }
      }

      switch (item.importType) {
        case 'segmentos':
          const seg = mapConsolidatedSeries(row);
          if (seg) consolidated.push(seg);
          break;
        case 'imoveis':
          const gImp = mapDetailedGroup(row, 'imoveis');
          if (gImp) detailed.push(gImp);
          break;
        case 'moveis':
          const gMov = mapDetailedGroup(row, 'moveis');
          if (gMov) detailed.push(gMov);
          break;
        case 'uf':
          const uf = mapQuarterlyData(row);
          if (uf) quarterly.push(uf);
          break;
      }
    });

    // Writes
    if (consolidated.length > 0) await dataStore.batchWrite(consolidated, COL_CONSOLIDATED, (i) => i.id || null);
    if (detailed.length > 0) await dataStore.batchWrite(detailed, COL_DETAILED_GROUPS, (i) => i.id || null);
    if (quarterly.length > 0) await dataStore.batchWrite(quarterly, COL_QUARTERLY, (i) => i.id || null);

    if (adminsFound.size > 0) {
      await dataStore.batchWrite(Array.from(adminsFound.values()), COL_ADMINS, (item) => item.cnpj_raiz);
    }

    // Cleanup Staging
    const deleteDocs = snapshot.docs;
    const DELETE_CHUNK = 250;
    for (let i = 0; i < deleteDocs.length; i += DELETE_CHUNK) {
      const chunk = deleteDocs.slice(i, i + DELETE_CHUNK);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await sleep(200);
    }

    window.dispatchEvent(new Event('dataUpdate'));
    return `Processados: ${consolidated.length} Séries, ${detailed.length} Grupos, ${quarterly.length} UF.`;
  },

  batchWrite: async (data: any[], collectionName: string, idGenerator?: (item: any) => string | null) => {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      let retries = 3;
      while (retries > 0) {
        try {
          const batch = writeBatch(db);
          chunk.forEach((item) => {
            const customId = idGenerator ? idGenerator(item) : null;
            const ref = customId ? doc(db, collectionName, customId) : doc(collection(db, collectionName));
            const cleanItem = JSON.parse(JSON.stringify(item));
            batch.set(ref, { ...cleanItem, _updatedAt: Timestamp.now() }, { merge: true });
          });
          await batch.commit();
          await sleep(200);
          break;
        } catch (error) {
          console.error(`Error batch write ${collectionName}`, error);
          await sleep(1000);
          retries--;
          if (retries === 0) throw error;
        }
      }
    }
  }
};
