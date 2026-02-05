import * as functions from "firebase-functions";
import * as v1 from "firebase-functions/v1";

import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { BigQuery } from "@google-cloud/bigquery";
// @ts-ignore
import readXlsxFile from 'read-excel-file/node';

const bigquery = new BigQuery();
const DATASET_ID = 'consorcio_data';
const FUNCTION_REGION = 'us-central1';
const BQ_LOCATION = 'us-central1';
setGlobalOptions({ region: FUNCTION_REGION });

// --- SCHEMAS ---
const SCHEMAS: any = {
    'series_consolidadas': [
        { name: 'cnpj_raiz', type: 'STRING' },
        { name: 'codigo_segmento', type: 'INTEGER' },
        { name: 'data_base', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' },
        { name: 'file_name', type: 'STRING' }
    ],
    'grupos_detalhados': [
        { name: 'cnpj_raiz', type: 'STRING' },
        { name: 'codigo_grupo', type: 'STRING' },
        { name: 'tipo', type: 'STRING' },
        { name: 'data_base', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' },
        { name: 'file_name', type: 'STRING' }
    ],
    'dados_trimestrais_uf': [
        { name: 'cnpj_raiz', type: 'STRING' },
        { name: 'uf', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' },
        { name: 'file_name', type: 'STRING' }
    ],
    'administradoras': [
        { name: 'cnpj', type: 'STRING' },
        { name: 'nome', type: 'STRING' },
        { name: 'data_base', type: 'STRING' },
        { name: 'metricas_raw', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' },
        { name: 'file_name', type: 'STRING' }
    ],
    'segmentos': [
        { name: 'codigo_segmento', type: 'INTEGER' },
        { name: 'nome', type: 'STRING' },
        { name: 'data_base', type: 'STRING' }, // To track latest
        { name: 'uploaded_at', type: 'TIMESTAMP' },
        { name: 'file_name', type: 'STRING' }
    ]
};

const ensureInfrastructure = async (tableId: string) => {
    // 1. Ensure Dataset
    const dataset = bigquery.dataset(DATASET_ID);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
        console.log(`Creating dataset: ${DATASET_ID}`);
        await bigquery.createDataset(DATASET_ID, { location: BQ_LOCATION });
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

// --- SHARED LOGIC ---

const normalizeToCompetence = (dateStr: string): string => {
    if (!dateStr) return 'UNKNOWN';
    // Remove quotes
    const clean = dateStr.replace(/["']/g, '').trim();

    // 1. Try YYYY-MM or YYYYMM format
    const yyyymm = clean.match(/^(\d{4})[-/]?(\d{2})/);
    if (yyyymm) {
        return `${yyyymm[1]}-${yyyymm[2]}`;
    }

    // 2. Try DD/MM/YYYY or MM/YYYY
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

// --- HELPER: Standardize Keys (Space -> Underscore) ---
const standardizeRowKeys = (row: any) => {
    const newRow: any = {};
    Object.keys(row).forEach(key => {
        // Replace spaces with underscores
        const cleanKey = key.trim().replace(/\s+/g, '_');
        newRow[cleanKey] = row[key];
    });
    return newRow;
};

// --- MAPPERS ---

const mapConsolidatedSeries = (row: any, fileName: string) => {
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
            metricas_raw: JSON.stringify(standardizeRowKeys(row)),
            file_name: fileName
        }
    };
};

const mapDetailedGroup = (row: any, type: 'imoveis' | 'moveis', fileName: string) => {
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
            metricas_raw: JSON.stringify(standardizeRowKeys(row)),
            file_name: fileName
        }
    };
};

const mapQuarterlyData = (row: any, fileName: string) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const uf = String(findValue(row, ['Unidade_da_Federação_do_consorciado', 'UF']) || '').toUpperCase();
    if (!cnpj || !uf) return null;

    return {
        table: 'dados_trimestrais_uf',
        data: {
            cnpj_raiz: cnpj,
            uf: uf,
            metricas_raw: JSON.stringify(standardizeRowKeys(row)),
            file_name: fileName
        }
    };
};

const mapAdministrators = (row: any, fileName: string) => {
    // Assuming file has CNPJ and Name/Nom_Admi
    // CLEAN CNPJ: REMOVE DOTS/SLASHES/DASHES explicitly
    const rawCnpj = String(findValue(row, ['CNPJ', 'Cnpj', 'CNPJ_da_Administradora']) || '');
    const cnpj = rawCnpj.replace(/\D/g, '');
    const nome = String(findValue(row, ['Nome', 'Nome_da_Administradora', 'Nom_Admi', 'NOME_DA_ADMINISTRADORA', 'Nome da Instituição', 'Nome_do_consorcio']) || '');
    if (!cnpj) return null;
    const database = String(findValue(row, ['Data_base']) || '');

    return {
        table: 'administradoras',
        data: {
            cnpj: cnpj,
            nome: nome,
            data_base: database,
            metricas_raw: JSON.stringify(standardizeRowKeys(row)),
            file_name: fileName
        }
    };
};

const mapSegmentos = (row: any, fileName: string) => {
    const code = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, ''));
    const nome = String(findValue(row, ['Nome_do_segmento', 'Descricao_do_segmento', 'Segmento']) || '');

    if (!code || !nome) return null;
    const database = String(findValue(row, ['Data_base']) || '');

    return {
        table: 'segmentos',
        data: {
            codigo_segmento: code,
            nome: nome,
            data_base: database,
            file_name: fileName
        }
    };
};

// --- CLOUD FUNCTION ---

export const processFileUpload = v1.region('us-central1').storage.object().onFinalize(async (object) => {
    // const object = event.data; // V2 style
    // V1 style: object is passed directly
    const filePath = object.name;
    const bucket = admin.storage().bucket(object.bucket);

    if (!filePath || !filePath.startsWith("raw-uploads/")) {
        return console.log("Arquivo ignorado:", filePath);
    }

    const fileName = path.basename(filePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);

    console.log(`Processing file: ${fileName}`);

    await bucket.file(filePath).download({ destination: tempFilePath });

    // DETECT FILE EXTENSION
    const isExcel = filePath.toLowerCase().endsWith('.xlsx');

    let rowsToInsert: any[] = [];
    let detectedDate = '';
    let importType: 'segments' | 'real_estate' | 'movables' | 'moveis' | 'regional_uf' | 'administrators' | null = null;
    const nameNorm = normalizeKey(fileName);

    // Classification Logic
    // Classification Logic
    if (nameNorm.includes('imoveis')) importType = 'real_estate';
    else if (nameNorm.includes('moveis')) importType = 'movables';
    else if (nameNorm.includes('segmentos')) importType = 'segments';
    else if (nameNorm.includes('dadosporuf') || nameNorm.includes('consorciosuf') || (nameNorm.includes('uf') && !nameNorm.includes('imoveis') && !nameNorm.includes('moveis'))) importType = 'regional_uf';
    // Robust check for ADMCONSORCIO (ignoring normalization issues)
    else if (nameNorm.includes('administradoras') || nameNorm.includes('doc4010') || nameNorm.includes('admconsorcio') || fileName.toUpperCase().includes('ADMCONSORCIO')) importType = 'administrators';

    // --- STATUS REPORTING ---
    const db = admin.firestore();
    const controlRef = db.collection('file_imports_control').doc(fileName.replace(/\.[^/.]+$/, ""));

    // 1. Start Processing Report
    await controlRef.set({
        fileName,
        storagePath: filePath,
        fileType: importType || 'UNKNOWN',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'PROCESSING',
        rowsProcessed: 0,
        debugMetadata: { nameNorm, isExcel } // Added for debug
    }, { merge: true });

    if (!importType) {
        await controlRef.update({ status: 'ERROR', errorDetails: `Layout não detectado para: ${fileName}` });
        fs.unlinkSync(tempFilePath);
        return console.error("Falha ao detectar layout.");
    }

    console.log(`Detected Type: ${importType}, isExcel: ${isExcel}`);

    try {
        if (isExcel) {
            // XLSX PROCESSING
            const rows = await readXlsxFile(tempFilePath);
            // rows is array of arrays.
            // Assume Row 0 is Header
            if (rows.length < 2) throw new Error("Arquivo Excel vazio ou sem cabeçalho");
            const headers = (rows[0] as any[]).map(h => String(h).trim());
            console.log("XLSX Headers Detected:", headers); // DEBUG Headers

            rows.slice(1).forEach((rowVals: any[]) => {
                const rowObj = headers.reduce((obj: any, header: string, i: number) => {
                    obj[header] = rowVals[i] !== null ? rowVals[i] : '';
                    return obj;
                }, {});

                // Extract Date
                if (!detectedDate) detectedDate = String(findValue(rowObj, ['Data_base']) || '');

                let mapped: any = null;
                if (importType === 'administrators') mapped = mapAdministrators(rowObj, fileName);
                // Support other excel types if needed in future
                if (mapped) rowsToInsert.push(mapped);
            });

        } else {
            // CSV PROCESSING
            const content = fs.readFileSync(tempFilePath, 'latin1');
            const lines = content.split('\n');
            if (lines.length < 2) {
                fs.unlinkSync(tempFilePath);
                return console.log("Arquivo vazio");
            }

            const firstLine = lines[0];
            const separator = firstLine.includes(';') ? ';' : ',';
            const headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));

            lines.slice(1).forEach(line => {
                if (!line.trim()) return;
                const values = line.split(separator);
                const row = headers.reduce((obj: any, header, i) => {
                    let val = values[i]?.trim().replace(/^"|"$/g, '');
                    obj[header] = val;
                    return obj;
                }, {});

                if (!detectedDate) detectedDate = String(findValue(row, ['Data_base']) || '');

                let mapped: any = null;
                if (importType === 'segments') {
                    mapped = mapConsolidatedSeries(row, fileName);
                    const segMapped = mapSegmentos(row, fileName);
                    if (segMapped) rowsToInsert.push(segMapped);
                }
                if (importType === 'real_estate') mapped = mapDetailedGroup(row, 'imoveis', fileName);
                if (importType === 'movables') mapped = mapDetailedGroup(row, 'moveis', fileName);
                if (importType === 'regional_uf') mapped = mapQuarterlyData(row, fileName);
                if (importType === 'administrators') mapped = mapAdministrators(row, fileName);

                if (mapped) rowsToInsert.push(mapped);
            });
        }

        console.log(`Parsed ${rowsToInsert.length} rows.`);

        // BIGQUERY INSERTION
        if (rowsToInsert.length > 0) {
            const tableId = rowsToInsert[0].table;
            await ensureInfrastructure(tableId);

            const fullDataset = rowsToInsert.map(r => ({
                ...r.data,
                uploaded_at: bigquery.timestamp(new Date())
            }));

            // BATCH INSERTION
            const BATCH_SIZE = 1000;
            for (let i = 0; i < fullDataset.length; i += BATCH_SIZE) {
                const batch = fullDataset.slice(i, i + BATCH_SIZE);
                try {
                    await bigquery.dataset(DATASET_ID).table(tableId).insert(batch);
                    console.log(`[SUCCESS] Inserted batch ${i} - ${i + batch.length} into ${DATASET_ID}.${tableId}`);
                } catch (batchErr: any) {
                    console.error(`[ERROR] Failed to insert batch ${i} - ${i + batch.length}`, batchErr?.errors || batchErr);
                    throw batchErr;
                }
            }
            console.log(`[SUCCESS] All ${fullDataset.length} rows inserted into ${DATASET_ID}.${tableId}`);
        }

        // 2. Success Report
        const currentDoc = await controlRef.get();
        const currentData = currentDoc.data();
        let finalDate = normalizeToCompetence(detectedDate) || 'UNKNOWN';

        if (currentData && currentData.referenceDate && currentData.referenceDate.match(/^\d{4}-\d{2}$/)) {
            console.log(`Keeping existing Reference Date from Filename: ${currentData.referenceDate}`);
            finalDate = currentData.referenceDate;
        }

        if (rowsToInsert.length === 0) {
            console.warn("Nenhuma linha válida foi extraída do arquivo.");
            await controlRef.update({
                status: 'WARNING',
                errorDetails: 'Arquivo processado mas nenhuma linha foi importada. Verifique os cabeçalhos.',
                rowsProcessed: 0
            });
        } else {
            await controlRef.update({
                status: 'SUCCESS',
                rowsProcessed: rowsToInsert.length,
                referenceDate: finalDate,
                bigQueryTable: rowsToInsert[0]?.table || 'UNKNOWN'
            });
        }
    } catch (err: any) {
        console.error("Processing Error", err);
        await controlRef.update({
            status: 'ERROR',
            errorDetails: err.message || 'Erro no processamento do arquivo'
        });
    }

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
});



export const deleteFile = functions.https.onCall(async (request) => {
    // Check Auth - Admin Only
    if (!request.auth?.token?.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    const { fileId, storagePath } = request.data;
    if (!fileId || !storagePath) throw new functions.https.HttpsError('invalid-argument', 'Missing fileId or storagePath');

    const db = admin.firestore();
    const storage = admin.storage();


    try {
        const fileName = path.basename(storagePath);
        console.log(`Deleting data for file: ${fileName}`);

        const tables = Object.keys(SCHEMAS);

        for (const tableId of tables) {
            try {
                const query = `DELETE FROM \`${DATASET_ID}.${tableId}\` WHERE file_name = @fileName`;
                await bigquery.query({
                    query,
                    location: BQ_LOCATION,
                    params: { fileName }
                });
                console.log(`Deleted rows from ${tableId} for ${fileName}`);
            } catch (bqErr: any) {
                console.warn(`Failed to delete from BQ table ${tableId}:`, bqErr.message);
            }
        }

        try {
            await storage.bucket().file(storagePath).delete();
            console.log(`Deleted from storage: ${storagePath}`);
        } catch (e: any) {
            console.warn("Storage delete failed (maybe already gone):", e.message);
        }

        await db.collection('file_imports_control').doc(fileId).delete();
        console.log(`Deleted control doc: ${fileId}`);

        return { success: true };
    } catch (error: any) {
        console.error("Delete Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const reprocessFile = functions.https.onCall(async (request) => {
    if (!request.auth?.token?.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const { storagePath } = request.data;
    if (!storagePath) throw new functions.https.HttpsError('invalid-argument', 'Missing storagePath');
    const storage = admin.storage();
    try {
        const [exists] = await storage.bucket().file(storagePath).exists();
        if (!exists) throw new functions.https.HttpsError('not-found', 'File not found in storage');
        await storage.bucket().file(storagePath).copy(storagePath);
        return { success: true, message: 'Reprocessing triggered' };
    } catch (error: any) {
        console.error("Reprocess Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const resetSystemData = functions.https.onCall(async (request) => {
    if (!request.auth?.token?.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const db = admin.firestore();
    try {
        console.warn("INITIATING SYSTEM RESET");
        const tables = Object.keys(SCHEMAS);

        for (const tableId of tables) {
            try {
                const query = `DROP TABLE IF EXISTS \`${DATASET_ID}.${tableId}\``;
                await bigquery.query({ query, location: BQ_LOCATION });
                console.log(`Dropped table: ${tableId}`);
            } catch (bqErr: any) {
                console.warn(`Failed to drop ${tableId}:`, bqErr.message);
            }
        }

        const deleteCollection = async (collPath: string) => {
            const snapshot = await db.collection(collPath).limit(500).get();
            if (snapshot.empty) return;
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Deleted batch of ${snapshot.size} from ${collPath}`);
            if (snapshot.size === 500) await deleteCollection(collPath);
        };

        await deleteCollection('file_imports_control');
        await deleteCollection('ai_analyses');

        return { success: true, message: 'System data reset successfully. Tables dropped.' };

    } catch (error: any) {
        console.error("Reset System Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- DASHBOARD QUERY UPDATED ---
export const getDashboardData = functions.https.onCall(async (request) => {
    // UPDATED QUERY TO MATCH USER DEFINITIONS: Active Quotas, Volume, Vars
    const query = `
        SELECT
            data_base,
            codigo_segmento,
            ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_do_segmento')) as nome_segmento,
            
            SUM(
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_active_quotas,

            SUM(
                (
                    COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64), 0) + 
                    COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * COALESCE(SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64), 0)
            ) as total_volume,

            AVG(SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64)) as avg_admin_fee,

            SUM(
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_default_quotas,

            SUM(COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0)) as total_default_contemplated,

            SUM(COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)) as total_default_non_contemplated,

            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as total_excluded_quotas

        FROM \`consorcio_data.series_consolidadas\`
        GROUP BY data_base, codigo_segmento
        ORDER BY data_base DESC, codigo_segmento ASC
        LIMIT 400
    `;

    try {
        const [rows] = await bigquery.query({ query, location: BQ_LOCATION });

        if (!rows || rows.length === 0) {
            return { summary: {}, segments: [], history: [] };
        }

        // Identify Dates
        const distinctDates = Array.from(new Set(rows.map(r => r.data_base))).sort().reverse();
        const latestDate = distinctDates[0];
        const prevDate = distinctDates[1]; // Can be undefined if only 1 month of data

        const currentData = rows.filter(r => r.data_base === latestDate);
        const prevData = prevDate ? rows.filter(r => r.data_base === prevDate) : [];

        // --- GLOBAL SUMMARY CALCULATIONS ---
        const totalVolume = currentData.reduce((acc, r) => acc + (Number(r.total_volume) || 0), 0);
        const totalQuotas = currentData.reduce((acc, r) => acc + (Number(r.total_active_quotas) || 0), 0);

        const totalDefault = currentData.reduce((acc, r) => acc + (Number(r.total_default_quotas) || 0), 0);
        const totalDefaultContemplated = currentData.reduce((acc, r) => acc + (Number(r.total_default_contemplated) || 0), 0);
        const totalDefaultNonContemplated = currentData.reduce((acc, r) => acc + (Number(r.total_default_non_contemplated) || 0), 0);

        const totalFeesSum = currentData.reduce((acc, r) => acc + ((Number(r.avg_admin_fee) || 0) * (Number(r.total_volume) || 0)), 0);
        const avgFeeGeneral = totalVolume > 0 ? totalFeesSum / totalVolume : 0;
        const totalExcluded = currentData.reduce((acc, r) => acc + (Number(r.total_excluded_quotas) || 0), 0);

        // --- PREVIOUS PERIOD SUMMARY ---
        const prevVolume = prevData.reduce((acc, r) => acc + (Number(r.total_volume) || 0), 0);
        const prevQuotas = prevData.reduce((acc, r) => acc + (Number(r.total_active_quotas) || 0), 0);
        const prevDefault = prevData.reduce((acc, r) => acc + (Number(r.total_default_quotas) || 0), 0);
        const prevExcluded = prevData.reduce((acc, r) => acc + (Number(r.total_excluded_quotas) || 0), 0);

        const prevFeesSum = prevData.reduce((acc, r) => acc + ((Number(r.avg_admin_fee) || 0) * (Number(r.total_volume) || 0)), 0);
        const prevAvgFee = prevVolume > 0 ? prevFeesSum / prevVolume : 0;

        // --- SEGMENT CALCULATIONS ---
        const segments = currentData.map(curr => {
            const prev = prevData.find(p => p.codigo_segmento === curr.codigo_segmento);

            // Curr Metrics
            const cVol = Number(curr.total_volume) || 0;
            const cQtd = Number(curr.total_active_quotas) || 0;
            const cDef = Number(curr.total_default_quotas) || 0;
            const cExc = Number(curr.total_excluded_quotas) || 0;
            const cFee = Number(curr.avg_admin_fee) || 0;
            const cTicket = cQtd > 0 ? cVol / cQtd : 0;
            const cDefRate = cQtd > 0 ? (cDef / cQtd) * 100 : 0;

            // Prev Metrics
            const pVol = prev ? (Number(prev.total_volume) || 0) : 0;
            const pQtd = prev ? (Number(prev.total_active_quotas) || 0) : 0;
            const pDef = prev ? (Number(prev.total_default_quotas) || 0) : 0;
            const pExc = prev ? (Number(prev.total_excluded_quotas) || 0) : 0;
            const pTicket = pQtd > 0 ? pVol / pQtd : 0;
            const pDefRate = pQtd > 0 ? (pDef / pQtd) * 100 : 0;

            return {
                id: curr.codigo_segmento,
                name: curr.nome_segmento || `Segmento ${curr.codigo_segmento}`,
                volume: cVol,
                quotas: cQtd,
                ticket: cTicket,
                adminFee: cFee,
                defaultRate: cDefRate,
                excluded: cExc,

                // Variations
                varVolume: pVol > 0 ? ((cVol - pVol) / pVol) * 100 : 0,
                varQuotas: pQtd > 0 ? ((cQtd - pQtd) / pQtd) * 100 : 0,
                varTicket: pTicket > 0 ? ((cTicket - pTicket) / pTicket) * 100 : 0,
                varAdminFee: cFee - (prev ? (Number(prev.avg_admin_fee) || 0) : 0),
                varDefaultRate: cDefRate - pDefRate,
                varExcluded: pExc > 0 ? ((cExc - pExc) / pExc) * 100 : 0
            };
        });

        return {
            summary: {
                totalActiveQuotas: totalQuotas,
                totalVolume: totalVolume,
                avgTicket: totalQuotas > 0 ? totalVolume / totalQuotas : 0,
                defaultRate: totalQuotas > 0 ? (totalDefault / totalQuotas) * 100 : 0,
                excludedQuotas: totalExcluded,
                avgAdminFee: avgFeeGeneral,

                // Specific Default Breakdown
                defaultContemplated: totalDefaultContemplated,
                defaultNonContemplated: totalDefaultNonContemplated,

                // Variations (General)
                varVolume: prevVolume > 0 ? ((totalVolume - prevVolume) / prevVolume) * 100 : 0,
                varQuotas: prevQuotas > 0 ? ((totalQuotas - prevQuotas) / prevQuotas) * 100 : 0,
                varDefaultRate: (totalQuotas > 0 ? (totalDefault / totalQuotas) * 100 : 0) - (prevQuotas > 0 ? (prevDefault / prevQuotas) * 100 : 0),
                varExcluded: prevExcluded > 0 ? ((totalExcluded - prevExcluded) / prevExcluded) * 100 : 0,
                varAdminFee: avgFeeGeneral - prevAvgFee,
                varTicket: (prevVolume > 0 && totalQuotas > 0) ? ((totalVolume / totalQuotas) - (prevVolume / prevQuotas)) / (prevVolume / prevQuotas) * 100 : 0
            },
            segments: segments,
            history: rows // Pass full history for charts
        };

    } catch (error: any) {
        if (error.message.includes('Not found') || error.code === 404) {
            console.warn("Dataset or Table not found, returning empty dashboard.");
            return { summary: {}, segments: [], history: [] };
        }
        console.error("Dashboard Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- EXISTING FUNCTIONS PRESERVED ---

export const getTrendData = functions.https.onCall(async (request) => {
    const query = `
        SELECT
            data_base,
                codigo_segmento,
                ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_do_segmento')) as nome_segmento,

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
                ) as total_volume,

            SUM(
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_default_quotas,

            SUM(COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0)) as total_default_contemplated,

            SUM(COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)) as total_default_non_contemplated,

            AVG(SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64)) as avg_admin_fee

        FROM \`consorcio_data.series_consolidadas\`
        GROUP BY data_base, codigo_segmento
        ORDER BY data_base ASC
    `;

    try {
        const [rows] = await bigquery.query({ query, location: BQ_LOCATION });
        return { data: rows };
    } catch (error: any) {
        console.error("Trend Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getAdministratorData = functions.https.onCall(async (request) => {
    const query = `
        WITH MaxDate AS (
            SELECT MAX(data_base) as max_date FROM \`consorcio_data.series_consolidadas\`
        ),
        LatestAdmins AS (
            SELECT
                SUBSTR(cnpj, 1, 8) as cnpj_raiz,
                nome,
                ROW_NUMBER() OVER(PARTITION BY SUBSTR(cnpj, 1, 8) ORDER BY data_base DESC) as rn
            FROM \`consorcio_data.administradoras\`
        )
        SELECT
            t.cnpj_raiz,
            COALESCE(ANY_VALUE(adm.nome), ANY_VALUE(JSON_VALUE(t.metricas_raw, '$.Nome_da_Administradora'))) as nome_reduzido,
            
            SUM(
                (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
            ) as totalBalance,

            SUM(
                SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as totalActive,
            
            SUM(
                COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as totalDefaults,

            SUM(COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0)) as totalDefaultContemplated,
            SUM(COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)) as totalDefaultNonContemplated,
            
            SUM(
                (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64) * 
                SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64)
            ) as totalFeesWeighted,
            
            SUM(
                (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64) * 
                COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Prazo_do_grupo_em_meses') AS FLOAT64), 0)
            ) as totalTermWeighted

        FROM \`consorcio_data.series_consolidadas\` t
        CROSS JOIN MaxDate md
        LEFT JOIN LatestAdmins adm ON adm.cnpj_raiz = t.cnpj_raiz AND adm.rn = 1
        WHERE t.data_base = md.max_date
        GROUP BY t.cnpj_raiz
        ORDER BY totalBalance DESC
    `;

    try {
        const [rows] = await bigquery.query({ query, location: BQ_LOCATION });
        return { data: rows };
    } catch (error: any) {
        console.error("Admin Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});


export const getAdministratorDetail = functions.https.onCall(async (request) => {
    const { cnpj } = request.data;
    if (!cnpj) throw new functions.https.HttpsError('invalid-argument', 'CNPJ required');

    const query = `
        WITH LatestAdmins AS (
            SELECT
                SUBSTR(cnpj, 1, 8) as cnpj_raiz,
                nome,
                ROW_NUMBER() OVER(PARTITION BY SUBSTR(cnpj, 1, 8) ORDER BY data_base DESC) as rn
            FROM \`consorcio_data.administradoras\`
        )
        SELECT
            t.data_base,
            t.codigo_segmento,
            COALESCE(ANY_VALUE(adm.nome), ANY_VALUE(JSON_VALUE(t.metricas_raw, '$.Nome_da_Administradora'))) as nome_reduzido,
            
             SUM(
                (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
            ) as total_volume,

            SUM(
                SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_active,

            SUM(
                COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_defaults,

            SUM(COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0)) as total_default_contemplated,
            SUM(COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)) as total_default_non_contemplated,
            
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as total_dropouts,

            SUM(
               (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64) * 
                SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64)
            ) as total_fees_weighted,

             SUM(
               (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64) * 
                COALESCE(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Prazo_do_grupo_em_meses') AS FLOAT64), 0)
            ) as total_term_weighted

        FROM \`consorcio_data.series_consolidadas\` t
        LEFT JOIN LatestAdmins adm ON adm.cnpj_raiz = t.cnpj_raiz AND adm.rn = 1
        WHERE t.cnpj_raiz = @cnpj
        GROUP BY t.data_base, t.codigo_segmento
        ORDER BY t.data_base ASC
    `;

    try {
        const [rows] = await bigquery.query({
            query,
            location: BQ_LOCATION,
            params: { cnpj }
        });
        return { data: rows };
    } catch (error: any) {
        console.error("Admin Detail Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getOperationalData = functions.https.onCall(async (request) => {
    const { mode, cnpj } = request.data;
    if (mode === 'detail' && !cnpj) {
        throw new functions.https.HttpsError('invalid-argument', 'CNPJ required for detail mode');
    }

    let query = '';
    const params: any = {};

    if (mode === 'detail') {
        query = `
    WITH MaxDate AS (
        SELECT MAX(data_base) as max_date FROM \`consorcio_data.dados_trimestrais_uf\`
    )
    SELECT
        uf,
        SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as adesoes,
        SUM(
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64) +
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64) +
            SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)
        ) as total_active

    FROM \`consorcio_data.dados_trimestrais_uf\` t
    CROSS JOIN MaxDate md
    WHERE cnpj_raiz = @cnpj AND t.data_base = md.max_date
    GROUP BY uf
    ORDER BY adesoes DESC
`;
        params.cnpj = cnpj;
    } else {
        query = `
    WITH MaxDate AS (
        SELECT MAX(data_base) as max_date FROM \`consorcio_data.dados_trimestrais_uf\`
    )
    SELECT
        t.cnpj_raiz,
        ANY_VALUE(JSON_VALUE(t.metricas_raw, '$.Nome_da_Administradora')) as nome_reduzido,
        SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as adesoes

    FROM \`consorcio_data.dados_trimestrais_uf\` t
    CROSS JOIN MaxDate md
    WHERE t.data_base = md.max_date
    GROUP BY t.cnpj_raiz
    HAVING adesoes > 0
    ORDER BY adesoes DESC
`;
    }

    try {
        const [rows] = await bigquery.query({ query, location: BQ_LOCATION, params });
        return { data: rows };
    } catch (error: any) {
        console.error("Operational Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getRegionalData = functions.https.onCall(async (request) => {
    const query = `
        WITH MaxDate AS (
            SELECT MAX(data_base) as max_date FROM \`consorcio_data.dados_trimestrais_uf\`
        )
        SELECT
            t.uf,
            SUM(
                SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64) +
                SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64) +
                SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)
            ) as totalActive

        FROM \`consorcio_data.dados_trimestrais_uf\` t
        CROSS JOIN MaxDate md
        WHERE t.uf IS NOT NULL AND t.uf != '' AND t.data_base = md.max_date
        GROUP BY t.uf
        ORDER BY totalActive DESC
    `;

    try {
        const [rows] = await bigquery.query({ query, location: BQ_LOCATION });
        return { data: rows };
    } catch (error: any) {
        console.error("Regional Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const setupAdmin = functions.https.onCall(async (request) => {
    const { email, password, setupKey } = request.data;

    if (setupKey !== 'INTEL_SETUP_2026') {
        throw new functions.https.HttpsError('permission-denied', 'Invalid Setup Key');
    }

    try {
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        } catch (e: any) {
            if (e.code === 'auth/user-not-found') {
                userRecord = await admin.auth().createUser({
                    email,
                    password,
                    emailVerified: true
                });
                console.log(`Created new user: ${email}`);
            } else {
                throw e;
            }
        }
        await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
        return { success: true, message: `User ${email} is now an ADMIN.` };
    } catch (error: any) {
        console.error("Setup Admin Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const checkAdminStatus = functions.https.onCall(async (request) => {
    if (!request.auth) return { isAdmin: false };
    const token = request.auth.token;
    return { isAdmin: !!token.admin };
});
