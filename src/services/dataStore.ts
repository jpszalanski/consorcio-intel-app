
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
import { AppDataStore, ImportedFileLog, Administrator, RegionalBacenData, BacenSegmentData, BacenGroupData, StagingItem, BacenSegment } from '../types';

// Coleções
const COL_SEGMENTS = 'metrics_segments';
const COL_REAL_ESTATE = 'metrics_real_estate';
const COL_MOVABLES = 'metrics_movables';
const COL_REGIONAL = 'metrics_regional';
const COL_ADMINS = 'administrators';
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

const findValue = (row: any, candidates: string[]): any => {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const target = normalizeKey(candidate);
    const foundKey = keys.find(k => normalizeKey(k) === target);
    if (foundKey) return row[foundKey];
  }
  return undefined;
};

// Parsing Numérico Brasileiro Robusto
const parseBrazilianNumber = (val: any): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  
  const str = String(val).trim();
  if (str === '' || str === '-') return 0;

  const cleanStr = str.replace(/[R$\s]/g, '');
  
  if (cleanStr.includes(',')) {
     const formatted = cleanStr.replace(/\./g, '').replace(',', '.');
     const num = Number(formatted);
     return isNaN(num) ? 0 : num;
  }
  
  const formattedNoThousand = cleanStr.replace(/\./g, '');
  const num = Number(formattedNoThousand);
  return isNaN(num) ? 0 : num;
};

// --- MAPPERS ESTRITOS ---

const mapSegmentData = (row: any): BacenSegmentData | null => {
  const adminName = findValue(row, ['Nome_da_Administradora', 'Nome', 'Administradora']);
  if (!adminName) return null;

  const segmentCodeRaw = String(findValue(row, ['Código_do_segmento', 'Codigo']) || '5').replace(/\D/g, '');
  const segment = SEGMENT_MAP[segmentCodeRaw] || BacenSegment.OUTROS_BENS;

  return {
    period: String(findValue(row, ['Data_base', 'Data base', 'Periodo']) || ''),
    adminName: String(adminName).trim(),
    cnpj: String(findValue(row, ['CNPJ_da_Administradora', 'CNPJ']) || ''),
    segment,
    taxaAdmin: parseBrazilianNumber(findValue(row, ['Taxa_de_administração', 'Taxa Admin'])),
    gruposAtivos: parseBrazilianNumber(findValue(row, ['Quantidade_de_grupos_ativos'])),
    gruposConstituidos: parseBrazilianNumber(findValue(row, ['Quantidade_de_grupos_constituídos_no_mês'])),
    gruposEncerrados: parseBrazilianNumber(findValue(row, ['Quantidade_de_grupos_encerrados_no_mês'])),
    cotasComercializadas: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_comercializadas_no_mês'])),
    cotasExcluidas: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_excluídas'])),
    cotasContempladas: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_no_mês'])),
    cotasAtivas: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas'])) + parseBrazilianNumber(findValue(row, ['Quantidade_acumulada_de_cotas_ativas_contempladas'])),
    cotasInadimplentes: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_inadimplentes'])),
    revenue: 0 
  };
};

const mapGroupData = (row: any, fixedSegment: BacenSegment): BacenGroupData | null => {
  const adminName = findValue(row, ['Nome_da_Administradora', 'Administradora']);
  if (!adminName) return null;

  const valorMedio = parseBrazilianNumber(findValue(row, ['Valor_médio_do_bem', 'Valor medio do bem', 'Vl. Bem', 'Valor do Bem']));
  
  const naoContempladas = parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas', 'Ativas Nao Contempladas']));
  const contempladas = parseBrazilianNumber(findValue(row, ['Quantidade_acumulada_de_cotas_ativas_contempladas', 'Ativas Contempladas']));
  
  const totalAtivas = naoContempladas + contempladas;
  
  const inadimplentes = parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_inadimplentes'])) + 
                        parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']));

  const contempladasNoMes = parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_no_mês']));

  // CÁLCULO DE VOLUME FINANCEIRO
  const balance = totalAtivas * valorMedio;
  const defaultBalance = inadimplentes * valorMedio;
  const contemplatedBalance = contempladasNoMes * valorMedio;

  return {
    period: String(findValue(row, ['Data_base', 'Data base', 'Periodo']) || ''),
    adminName: String(adminName).trim(),
    cnpj: String(findValue(row, ['CNPJ_da_Administradora']) || ''),
    segment: fixedSegment, 
    groupCode: String(findValue(row, ['Código_do_grupo', 'Codigo do grupo', 'Grupo']) || 'N/A'),
    
    valorMedioBem: valorMedio,
    
    taxaAdmin: parseBrazilianNumber(findValue(row, ['Taxa_de_administração', 'Taxa Admin'])),
    prazoGrupo: parseBrazilianNumber(findValue(row, ['Prazo_do_grupo_em_meses', 'Prazo'])),
    indiceCorrecao: String(findValue(row, ['Índice_de_correção']) || ''),

    gruposAtivos: parseBrazilianNumber(findValue(row, ['Quantidade_de_grupos_ativos']) || 1),
    cotasComercializadas: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_comercializadas_no_mês'])),
    cotasExcluidas: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_excluídas'])),
    cotasQuitadas: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_quitadas'])),

    cotasAtivasNaoContempladas: naoContempladas,
    cotasAtivasContempladasAcumuladas: contempladas,
    cotasContempladasNoMes: contempladasNoMes,

    cotasAtivasEmDia: parseBrazilianNumber(findValue(row, ['Quantidade_de_cotas_ativas_em_dia'])),
    cotasAtivasInadimplentes: inadimplentes,

    activeQuotas: totalAtivas,
    balance: balance,
    defaultBalance: defaultBalance,
    contemplatedBalance: contemplatedBalance
  };
};

const mapRegionalData = (row: any): RegionalBacenData | null => {
  const uf = findValue(row, ['UF', 'Estado']);
  const adminName = findValue(row, ['Nome_da_Administradora']);
  if (!uf || !adminName) return null;

  const activeContemplatedBid = parseBrazilianNumber(findValue(row, ['Contemplados_por_Lance']));
  const activeContemplatedLottery = parseBrazilianNumber(findValue(row, ['Contemplados_por_Sorteio']));
  const activeNonContemplated = parseBrazilianNumber(findValue(row, ['Não_Contemplados']));

  return {
    uf: String(uf).toUpperCase(),
    region: 'Nacional',
    adminName: String(adminName).trim(),
    cnpj: String(findValue(row, ['CNPJ_da_Administradora', 'CNPJ']) || ''),
    activeContemplatedBid,
    activeContemplatedLottery,
    activeNonContemplated,
    dropoutContemplated: parseBrazilianNumber(findValue(row, ['Desistentes_Excluidos_Contemplados'])),
    dropoutNonContemplated: parseBrazilianNumber(findValue(row, ['Desistentes_Excluidos_Não_Contemplados'])),
    newAdhesionsQuarter: parseBrazilianNumber(findValue(row, ['Adesões_no_Trimestre'])),
    totalActive: activeContemplatedBid + activeContemplatedLottery + activeNonContemplated
  };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const dataStore = {
  fetchData: async (): Promise<AppDataStore> => {
    try {
      const [segRef, realRef, movRef, regRef, admRef, fileRef] = await Promise.all([
        getDocs(collection(db, COL_SEGMENTS)),
        getDocs(collection(db, COL_REAL_ESTATE)),
        getDocs(collection(db, COL_MOVABLES)),
        getDocs(collection(db, COL_REGIONAL)),
        getDocs(collection(db, COL_ADMINS)),
        getDocs(query(collection(db, COL_FILES), orderBy('importDate', 'desc'), limit(20)))
      ]);

      const segments = segRef.docs.map(d => d.data() as BacenSegmentData);
      const realEstateGroups = realRef.docs.map(d => d.data() as BacenGroupData);
      const movableGroups = movRef.docs.map(d => d.data() as BacenGroupData);
      const regional = regRef.docs.map(d => d.data() as RegionalBacenData);
      const administrators = admRef.docs.map(d => d.data() as Administrator);
      const importedFiles = fileRef.docs.map(d => d.data() as ImportedFileLog);

      return {
        segments,
        realEstateGroups,
        movableGroups,
        regional,
        administrators,
        importedFiles,
        competitors: [],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error("Error fetching data", error);
      return {
        segments: [],
        realEstateGroups: [],
        movableGroups: [],
        regional: [],
        administrators: [],
        importedFiles: [],
        competitors: [],
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
      let hasMore = true;
      while (hasMore) {
        const q = query(collection(db, colName), limit(300));
        const snapshot = await getDocs(q);
        if (snapshot.size === 0) {
          hasMore = false;
          break;
        }
        
        // Correção do Batch Delete: Criar novo batch para cada lote de exclusão
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        await sleep(200);
      }
    };

    await Promise.all([
      deleteCollection(COL_SEGMENTS),
      deleteCollection(COL_REAL_ESTATE),
      deleteCollection(COL_MOVABLES),
      deleteCollection(COL_REGIONAL),
      deleteCollection(COL_FILES),
      deleteCollection(COL_STAGING)
    ]);
  },

  uploadToStaging: async (batchId: string, type: string, rawRows: any[]): Promise<void> => {
    const stagingItems = rawRows.map(row => ({
      batchId,
      fileName: 'Upload',
      importType: type,
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

    let segmentsData: BacenSegmentData[] = [];
    let realEstateData: BacenGroupData[] = [];
    let movablesData: BacenGroupData[] = [];
    let regionalData: RegionalBacenData[] = [];
    let adminsFound = new Map<string, Administrator>();

    snapshot.docs.forEach(docSnap => {
      const item = docSnap.data() as StagingItem;
      const row = item.rawData;

      const cnpj = findValue(row, ['CNPJ_da_Administradora', 'CNPJ']);
      const name = findValue(row, ['Nome_da_Administradora', 'Nome da Administradora']);
      if (cnpj && name) {
        adminsFound.set(String(cnpj), { cnpj: String(cnpj), name: String(name).trim(), isFavorite: false });
      }

      switch (item.importType) {
        case 'segments':
          const seg = mapSegmentData(row);
          if (seg) segmentsData.push(seg);
          break;
        case 'real_estate':
          const re = mapGroupData(row, BacenSegment.IMOVEIS); 
          if (re) realEstateData.push(re);
          break;
        case 'movables':
          const mov = mapGroupData(row, BacenSegment.VEICULOS_LEVES); 
          if (mov) movablesData.push(mov);
          break;
        case 'regional_uf':
          const reg = mapRegionalData(row);
          if (reg) regionalData.push(reg);
          break;
      }
    });

    if (segmentsData.length > 0) await dataStore.batchWrite(segmentsData, COL_SEGMENTS);
    if (realEstateData.length > 0) await dataStore.batchWrite(realEstateData, COL_REAL_ESTATE);
    if (movablesData.length > 0) await dataStore.batchWrite(movablesData, COL_MOVABLES);
    if (regionalData.length > 0) await dataStore.batchWrite(regionalData, COL_REGIONAL);
    
    if (adminsFound.size > 0) {
       await dataStore.batchWrite(Array.from(adminsFound.values()), COL_ADMINS, (item) => item.cnpj.replace(/\D/g, ''));
    }

    // Deletar Staging em Lotes Seguros
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
    return `Processados: ${segmentsData.length} Segmentos, ${realEstateData.length} Imóveis, ${movablesData.length} Móveis.`;
  },

  // Gravação em Lote com Throttling para evitar Resource Exhausted
  batchWrite: async (data: any[], collectionName: string, idGenerator?: (item: any) => string | null) => {
    // Reduzido para 250 para evitar sobrecarga da fila de escrita (buffer) do Firestore
    const CHUNK_SIZE = 250; 
    
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      let retries = 5;
      let delay = 1000;
      
      while (retries > 0) {
        try {
          const batch = writeBatch(db);
          
          chunk.forEach((item) => {
            const customId = idGenerator ? idGenerator(item) : null;
            const ref = customId 
              ? doc(db, collectionName, customId)
              : doc(collection(db, collectionName));
            
            const cleanItem = JSON.parse(JSON.stringify(item));
            
            if (collectionName === COL_ADMINS) {
               batch.set(ref, cleanItem, { merge: true });
            } else {
               batch.set(ref, { ...cleanItem, createdAt: Timestamp.now() });
            }
          });

          await batch.commit();
          // Pausa breve para aliviar o buffer do SDK
          await sleep(200); 
          break; 
        } catch (error: any) {
          console.error(`Erro ao gravar lote em ${collectionName}. Tentativas: ${retries}`, error);
          
          // Se o erro for de exaustão de recursos (fila cheia), esperar mais tempo
          const isResourceExhausted = error.code === 'resource-exhausted' || error.message?.includes('exhausted');
          
          if (isResourceExhausted) {
             console.warn("Fila de escrita cheia (Resource Exhausted). Pausando por 5s...");
             await sleep(5000);
          } else {
             await sleep(delay);
          }

          retries--;
          delay *= 2; // Backoff exponencial

          if (retries === 0) throw error;
        }
      }
    }
  }
};
