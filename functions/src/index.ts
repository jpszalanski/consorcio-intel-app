import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { BigQuery } from "@google-cloud/bigquery";

const bigquery = new BigQuery();
const DATASET_ID = 'consorcio_data';
const LOCATION = 'US'; // Configure as needed

// --- SCHEMAS ---
const SCHEMAS: any = {
    'series_consolidadas': [
        { name: 'cnpj_raiz', type: 'STRING' },
        { name: 'codigo_segmento', type: 'INTEGER' },
        { name: 'data_base', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' }
    ],
    'grupos_detalhados': [
        { name: 'cnpj_raiz', type: 'STRING' },
        { name: 'codigo_grupo', type: 'STRING' },
        { name: 'tipo', type: 'STRING' },
        { name: 'data_base', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' }
    ],
    'dados_trimestrais_uf': [
        { name: 'cnpj_raiz', type: 'STRING' },
        { name: 'uf', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' }
    ],
    'administradoras': [
        { name: 'cnpj', type: 'STRING' },
        { name: 'nome', type: 'STRING' },
        { name: 'data_base', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' }
    ]
};

const ensureInfrastructure = async (tableId: string) => {
    // 1. Ensure Dataset
    const dataset = bigquery.dataset(DATASET_ID);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
        console.log(`Creating dataset: ${DATASET_ID}`);
        await bigquery.createDataset(DATASET_ID, { location: LOCATION });
    }

    // 2. Ensure Table
    const table = dataset.table(tableId);
    const [tableExists] = await table.exists();
    if (!tableExists) {
        console.log(`Creating table: ${tableId}`);
        const schema = SCHEMAS[tableId];
        if (!schema) throw new Error(`Schema not defined for ${tableId}`);
        await table.create({ schema });
    }
};

admin.initializeApp();

// --- SHARED LOGIC PORTED FROM dataStore.ts ---

const normalizeToCompetence = (dateStr: string): string => {
    if (!dateStr) return 'UNKNOWN';
    // Remove quotes
    const clean = dateStr.replace(/["']/g, '').trim();

    // 1. Try YYYY-MM or YYYYMM format
    // Matches 2025-01, 202501
    const yyyymm = clean.match(/^(\d{4})[-/]?(\d{2})/);
    if (yyyymm) {
        return `${yyyymm[1]}-${yyyymm[2]}`;
    }

    // 2. Try DD/MM/YYYY or MM/YYYY
    // Matches 31/01/2025 or 01/2025
    const ddmmyyyy = clean.match(/(\d{2})?[/]?(\d{2})\/(\d{4})/);
    if (ddmmyyyy) {
        const year = ddmmyyyy[3];
        const month = ddmmyyyy[2];
        return `${year}-${month}`;
    }

    return 'UNKNOWN';
};

const normalizeKey = (str: string) => {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
};

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



// --- MAPPERS ---
// (Simplified for Backend: Returns flat object for BigQuery)

const mapConsolidatedSeries = (row: any) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    if (!cnpj) return null;
    const segCode = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, ''));
    const database = String(findValue(row, ['Data_base']) || '');

    return {
        table: 'series_consolidadas',
        data: {
            cnpj_raiz: cnpj,
            codigo_segmento: segCode,
            data_base: database,
            // ... (Add other fields as needed for BQ, simplified here for robustness)
            metricas_raw: JSON.stringify(row) // Storing raw for safety first
        }
    };
};

const mapDetailedGroup = (row: any, type: 'imoveis' | 'moveis') => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const grupo = String(findValue(row, ['Código_do_grupo', 'Codigo']) || '');
    if (!cnpj || !grupo) return null;
    const database = String(findValue(row, ['Data_base']) || '');

    return {
        table: 'grupos_detalhados',
        data: {
            cnpj_raiz: cnpj,
            codigo_grupo: grupo,
            tipo: type,
            data_base: database,
            metricas_raw: JSON.stringify(row)
        }
    };
};

const mapQuarterlyData = (row: any) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const uf = String(findValue(row, ['Unidade_da_Federação_do_consorciado', 'UF']) || '').toUpperCase();
    if (!cnpj || !uf) return null;

    return {
        table: 'dados_trimestrais_uf',
        data: {
            cnpj_raiz: cnpj,
            uf: uf,
            metricas_raw: JSON.stringify(row)
        }
    };
};

const mapAdministrators = (row: any) => {
    // Assuming file has CNPJ and Name/Nom_Admi
    const cnpj = String(findValue(row, ['CNPJ', 'Cnpj', 'CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const nome = String(findValue(row, ['Nome', 'Nome_da_Administradora', 'Nom_Admi', 'NOME_DA_ADMINISTRADORA']) || '');
    if (!cnpj) return null;
    const database = String(findValue(row, ['Data_base']) || '');

    return {
        table: 'administradoras',
        data: {
            cnpj: cnpj,
            nome: nome,
            data_base: database,
            metricas_raw: JSON.stringify(row)
        }
    };
};

// --- CLOUD FUNCTION ---

export const processFileUpload = functions.storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    const bucket = admin.storage().bucket(object.bucket);

    if (!filePath || !filePath.startsWith("raw-uploads/")) {
        return console.log("Arquivo ignorado:", filePath);
    }

    const fileName = path.basename(filePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);

    console.log(`Processing file: ${fileName}`);

    await bucket.file(filePath).download({ destination: tempFilePath });

    const content = fs.readFileSync(tempFilePath, 'latin1'); // Using latin1/binary to match 'windows-1252' mostly
    const lines = content.split('\n');
    if (lines.length < 2) return console.log("Arquivo vazio");

    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';
    const headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));

    // Detect Type
    let importType: 'segments' | 'real_estate' | 'movables' | 'moveis' | 'regional_uf' | 'administrators' | null = null;
    const nameNorm = normalizeKey(fileName);
    if (nameNorm.includes('imoveis')) importType = 'real_estate';
    else if (nameNorm.includes('moveis')) importType = 'movables';
    else if (nameNorm.includes('segmentos')) importType = 'segments';
    else if (nameNorm.includes('dadosporuf') || nameNorm.includes('consorciosuf') || (nameNorm.includes('uf') && !nameNorm.includes('imoveis') && !nameNorm.includes('moveis'))) importType = 'regional_uf';
    else if (nameNorm.includes('administradoras') || nameNorm.includes('doc4010')) importType = 'administrators';

    // --- STATUS REPORTING ---
    const db = admin.firestore();
    const controlRef = db.collection('file_imports_control').doc(fileName.replace(/\.[^/.]+$/, "")); // ID = filename without ext

    // 1. Start Processing Report
    await controlRef.set({
        fileName,
        storagePath: filePath,
        fileType: importType || 'UNKNOWN',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'PROCESSING',
        rowsProcessed: 0
    }, { merge: true });

    if (!importType) {
        await controlRef.update({ status: 'ERROR', errorDetails: 'Layout não detectado' });
        return console.error("Falha ao detectar layout.");
    }

    console.log(`Detected Type: ${importType}`);

    const rowsToInsert: any[] = [];
    let detectedDate = '';

    lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const values = line.split(separator);
        const row = headers.reduce((obj: any, header, i) => {
            let val = values[i]?.trim().replace(/^"|"$/g, '');
            obj[header] = val;
            return obj;
        }, {});

        // Extract Date from first valid row
        if (!detectedDate && row['Data_base']) detectedDate = row['Data_base'];

        let mapped: any = null;
        if (importType === 'segments') mapped = mapConsolidatedSeries(row);
        if (importType === 'real_estate') mapped = mapDetailedGroup(row, 'imoveis');
        if (importType === 'moveis') mapped = mapDetailedGroup(row, 'moveis'); // Fix: 'moveis' string check
        if (importType === 'movables') mapped = mapDetailedGroup(row, 'moveis'); // Handle both keys if needed
        if (importType === 'regional_uf') mapped = mapQuarterlyData(row);
        if (importType === 'administrators') mapped = mapAdministrators(row);

        if (mapped) rowsToInsert.push(mapped);
    });

    console.log(`Parsed ${rowsToInsert.length} rows.`);

    try {
        // BIGQUERY INSERTION
        // BIGQUERY INSERTION
        // BIGQUERY INSERTION
        if (rowsToInsert.length > 0) {
            const tableId = rowsToInsert[0].table;

            // Ensure Infra (Create Dataset/Table if missing)
            await ensureInfrastructure(tableId);

            // Add uploaded_at timestamp
            const fullDataset = rowsToInsert.map(r => ({
                ...r.data,
                uploaded_at: bigquery.timestamp(new Date())
            }));

            // BATCH INSERTION (Chunking to avoid 413 Request Too Large)
            const BATCH_SIZE = 1000;
            for (let i = 0; i < fullDataset.length; i += BATCH_SIZE) {
                const batch = fullDataset.slice(i, i + BATCH_SIZE);
                try {
                    await bigquery.dataset(DATASET_ID).table(tableId).insert(batch);
                    console.log(`[SUCCESS] Inserted batch ${i} - ${i + batch.length} into ${DATASET_ID}.${tableId}`);
                } catch (batchErr: any) {
                    console.error(`[ERROR] Failed to insert batch ${i} - ${i + batch.length}`, batchErr?.errors || batchErr);
                    // Decide: Throw to stop, or continue? 
                    // Throwing ensures we don't have partial data marked as success.
                    throw batchErr;
                }
            }
            console.log(`[SUCCESS] All ${fullDataset.length} rows inserted into ${DATASET_ID}.${tableId}`);
        }

        // 2. Success Report
        // Fetch current doc to check if we already have a valid Reference Date (from Filename)
        const currentDoc = await controlRef.get();
        const currentData = currentDoc.data();

        let finalDate = normalizeToCompetence(detectedDate) || 'UNKNOWN';

        // If the current record already has a valid YYYY-MM date (from the frontend parsing the filename),
        // we should PRIORITIZE it over the CSV content date to avoid moving the file to a different month unexpectedly.
        if (currentData && currentData.referenceDate && currentData.referenceDate.match(/^\d{4}-\d{2}$/)) {
            console.log(`Keeping existing Reference Date from Filename: ${currentData.referenceDate}`);
            finalDate = currentData.referenceDate;
        }

        await controlRef.update({
            status: 'SUCCESS',
            rowsProcessed: rowsToInsert.length,
            referenceDate: finalDate,
            bigQueryTable: rowsToInsert[0]?.table || 'UNKNOWN'
        });

    } catch (err: any) {
        console.error("BigQuery Insertion Error", err);
        await controlRef.update({
            status: 'ERROR',
            errorDetails: err.message || 'Erro na inserção do BigQuery'
        });
    }

    // Cleanup
    fs.unlinkSync(tempFilePath);
});

// --- MANAGEMENT FUNCTIONS ---

export const deleteFile = functions.https.onCall(async (data, context) => {
    // Check Auth
    // if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');

    const { fileId, storagePath } = data;
    if (!fileId || !storagePath) throw new functions.https.HttpsError('invalid-argument', 'Missing fileId or storagePath');

    const db = admin.firestore();
    const storage = admin.storage();

    try {
        // 1. Delete from Storage
        await storage.bucket().file(storagePath).delete();
        console.log(`Deleted from storage: ${storagePath}`);

        // 2. Delete Control Record
        await db.collection('file_imports_control').doc(fileId).delete();
        console.log(`Deleted control doc: ${fileId}`);

        return { success: true };
    } catch (error: any) {
        console.error("Delete Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const reprocessFile = functions.https.onCall(async (data, context) => {
    // if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');

    const { storagePath } = data;
    if (!storagePath) throw new functions.https.HttpsError('invalid-argument', 'Missing storagePath');

    const storage = admin.storage();

    try {
        // 1. Check if exists
        const [exists] = await storage.bucket().file(storagePath).exists();
        if (!exists) throw new functions.https.HttpsError('not-found', 'File not found in storage');

        // 2. Trigger "finalize" manually?? 
        // No, easier to just Copy the file to itself to re-trigger the event, 
        // OR we just invoke logic.
        // For simplicity: We "touch" the file metadata to re-trigger the onFinalize hook?
        // Actually, copying to same location creates a finalize event.

        await storage.bucket().file(storagePath).copy(storagePath);

        return { success: true, message: 'Reprocessing triggered' };
    } catch (error: any) {
        console.error("Reprocess Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ... (trend data)

export const getTrendData = functions.https.onCall(async (data, context) => {
    const query = `
        SELECT
            data_base,
            codigo_segmento,
            
            SUM(
                SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_quotas,

            SUM(
                (
                    SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
            ) as total_volume

        FROM \`consorcio_data.grupos_detalhados\`
        GROUP BY data_base, codigo_segmento
        ORDER BY data_base ASC
    `;

    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    } catch (error: any) {
        console.error("Trend Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getAdministratorData = functions.https.onCall(async (data, context) => {
    const query = `
        SELECT
            cnpj_raiz,
            ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_da_Administradora')) as nome_reduzido,
            
            -- Volume
            SUM(
                (
                    SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
            ) as totalBalance,

            -- Active Quotas
            SUM(
                SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as totalActive,
            
            -- Defaults (Inadimplencia)
            SUM(
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as totalDefaults,

            -- Weighted Fees (Approx) - Sum(Tax * Active) / Sum(Active)
            SUM(
               SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64) * 
               (
                    SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
               )
            ) as totalFeesWeighted

        FROM \`consorcio_data.grupos_detalhados\`
        GROUP BY cnpj_raiz
        ORDER BY totalBalance DESC
    `;

    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    } catch (error: any) {
        console.error("Admin Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});


export const getAdministratorDetail = functions.https.onCall(async (data, context) => {
    const { cnpj } = data;
    if (!cnpj) throw new functions.https.HttpsError('invalid-argument', 'CNPJ required');

    const query = `
        SELECT
            data_base,
            codigo_segmento,
            ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_da_Administradora')) as nome_reduzido,
            
             SUM(
                (
                    SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
            ) as total_volume,

            SUM(
                SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_active,

             -- KPIs for Average (Fee, Term)
            SUM(
               SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64) * 
               (
                    SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
               )
            ) as total_fees_weighted,

             SUM(
               SAFE_CAST(JSON_VALUE(metricas_raw, '$.Prazo_do_grupo_em_meses') AS INT64) * 
               (
                    SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
               )
            ) as total_term_weighted,

            SUM(
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_defaults,
            
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as total_dropouts

        FROM \`consorcio_data.grupos_detalhados\`
        WHERE cnpj_raiz = @cnpj
        GROUP BY data_base, codigo_segmento
        ORDER BY data_base ASC
    `;

    try {
        const [rows] = await bigquery.query({
            query,
            location: LOCATION,
            params: { cnpj }
        });
        return { data: rows };
    } catch (error: any) {
        console.error("Admin Detail Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getOperationalData = functions.https.onCall(async (data, context) => {
    const { mode, cnpj } = data;
    // mode: 'market' (all admins aggregated) or 'detail' (specific admin by UF)

    if (mode === 'detail' && !cnpj) {
        throw new functions.https.HttpsError('invalid-argument', 'CNPJ required for detail mode');
    }

    let query = '';
    const params: any = {};

    if (mode === 'detail') {
        query = `
    SELECT
        uf,
        -- Flow (Quarter)
        SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as adesoes,
        SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_contemplados') AS INT64)) as dropouts_contemplated, 

        (
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_contemplados') AS INT64)) + 
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_não_contemplados') AS INT64))
        ) as total_dropouts,

        -- Stock (Active)
        SUM(
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64) +
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64) +
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)
        ) as total_active,

        -- Mix
        SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64)) as stock_bid,
        SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64)) as stock_lottery

    FROM \`consorcio_data.dados_trimestrais_uf\`
    WHERE cnpj_raiz = @cnpj
    GROUP BY uf
    ORDER BY adesoes DESC
`;
        params.cnpj = cnpj;
    } else {
        // Market Overview (Scatter) - Aggregated by Admin
        query = `
    SELECT
        cnpj_raiz,
        ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_da_Administradora')) as nome_reduzido,
        
        SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as adesoes,
        
        (
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_contemplados') AS INT64)) + 
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_não_contemplados') AS INT64))
        ) as total_dropouts,

        SUM(
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64) +
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64) +
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)
        ) as total_active

    FROM \`consorcio_data.dados_trimestrais_uf\`
    GROUP BY cnpj_raiz
    HAVING total_active > 100 -- Noise filter
    ORDER BY total_active DESC
`;
    }

    try {
        const [rows] = await bigquery.query({ query, location: LOCATION, params });
        return { data: rows };
    } catch (error: any) {
        console.error("Operational Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getRegionalData = functions.https.onCall(async (data, context) => {
    const query = `
        SELECT
            uf,
            COUNT(*) as records_count,
            
            -- Acumulados (Stock)
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64)) as activeContemplatedBid,
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64)) as activeContemplatedLottery,
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)) as activeNonContemplated,
            
            -- Excluded (Stock)
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_contemplados') AS INT64)) as dropoutContemplated,
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_não_contemplados') AS INT64)) as dropoutNonContemplated,
            
            -- Flow (Quarter)
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as newAdhesionsQuarter,
            
            -- Total Active
            SUM(
                SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64) +
                SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64) +
                SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)
            ) as totalActive

        FROM \`consorcio_data.dados_trimestrais_uf\`
        WHERE uf IS NOT NULL AND uf != ''
        GROUP BY uf
        ORDER BY totalActive DESC
    `;

    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    } catch (error: any) {
        console.error("Regional Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getDashboardData = functions.https.onCall(async (data, context) => {
    const query = `
        SELECT
            data_base,
            CAST(codigo_segmento AS STRING) as codigo_segmento,
            ANY_VALUE(tipo) as tipo,
            
            SUM(
                SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_active_quotas,

            SUM(
                (
                    SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
            ) as total_volume_estimated,

            SUM(
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_default_quotas,

            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as total_dropouts,
            
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_quitadas') AS INT64)) as total_quitadas

        FROM \`consorcio_data.grupos_detalhados\`
        GROUP BY data_base, codigo_segmento
        ORDER BY data_base ASC
    `;

    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    } catch (error: any) {
        console.error("Dashboard Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
