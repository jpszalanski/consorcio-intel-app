"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAdminStatus = exports.setupAdmin = exports.getRegionalData = exports.getOperationalData = exports.getAdministratorDetail = exports.getAdministratorData = exports.getTrendData = exports.getDashboardData = exports.resetSystemData = exports.reprocessFile = exports.deleteFile = exports.processFileUpload = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const os = require("os");
const path = require("path");
const fs = require("fs");
const bigquery_1 = require("@google-cloud/bigquery");
// @ts-ignore
const node_1 = require("read-excel-file/node");
const bigquery = new bigquery_1.BigQuery();
const DATASET_ID = 'consorcio_data';
const LOCATION = 'US'; // Configure as needed
// --- SCHEMAS ---
const SCHEMAS = {
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
        { name: 'data_base', type: 'STRING' },
        { name: 'uploaded_at', type: 'TIMESTAMP' },
        { name: 'file_name', type: 'STRING' }
    ]
};
const ensureInfrastructure = async (tableId) => {
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
        if (!schema)
            throw new Error(`Schema not defined for ${tableId}`);
        await table.create({ schema });
    }
};
admin.initializeApp();
// --- SHARED LOGIC ---
const normalizeToCompetence = (dateStr) => {
    if (!dateStr)
        return 'UNKNOWN';
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
const normalizeKey = (str) => {
    if (!str)
        return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
};
const findValue = (row, candidates) => {
    const keys = Object.keys(row);
    const normalizedKeys = keys.map(k => ({ key: k, norm: normalizeKey(k) }));
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const target = normalizeKey(candidate);
            const match = normalizedKeys.find(nk => nk.norm === target);
            if (match)
                return row[match.key];
        }
        else if (Array.isArray(candidate)) {
            const targetParts = candidate.map(normalizeKey);
            const match = normalizedKeys.find(nk => targetParts.every(part => nk.norm.includes(part)));
            if (match)
                return row[match.key];
        }
    }
    return undefined;
};
// --- HELPER: Standardize Keys (Space -> Underscore) ---
const standardizeRowKeys = (row) => {
    const newRow = {};
    Object.keys(row).forEach(key => {
        // Replace spaces with underscores
        const cleanKey = key.trim().replace(/\s+/g, '_');
        newRow[cleanKey] = row[key];
    });
    return newRow;
};
// --- MAPPERS ---
const mapConsolidatedSeries = (row, fileName) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    if (!cnpj)
        return null;
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
const mapDetailedGroup = (row, type, fileName) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const grupo = String(findValue(row, ['Código_do_grupo', 'Codigo']) || '');
    if (!cnpj || !grupo)
        return null;
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
const mapQuarterlyData = (row, fileName) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const uf = String(findValue(row, ['Unidade_da_Federação_do_consorciado', 'UF']) || '').toUpperCase();
    if (!cnpj || !uf)
        return null;
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
const mapAdministrators = (row, fileName) => {
    // Assuming file has CNPJ and Name/Nom_Admi
    // CLEAN CNPJ: REMOVE DOTS/SLASHES/DASHES explicitly
    const rawCnpj = String(findValue(row, ['CNPJ', 'Cnpj', 'CNPJ_da_Administradora']) || '');
    const cnpj = rawCnpj.replace(/\D/g, '');
    const nome = String(findValue(row, ['Nome', 'Nome_da_Administradora', 'Nom_Admi', 'NOME_DA_ADMINISTRADORA', 'Nome da Instituição', 'Nome_do_consorcio']) || '');
    if (!cnpj)
        return null;
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
const mapSegmentos = (row, fileName) => {
    const code = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, ''));
    const nome = String(findValue(row, ['Nome_do_segmento', 'Descricao_do_segmento', 'Segmento']) || '');
    if (!code || !nome)
        return null;
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
exports.processFileUpload = functions.storage.object().onFinalize(async (object) => {
    var _a;
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
    let rowsToInsert = [];
    let detectedDate = '';
    let importType = null;
    const nameNorm = normalizeKey(fileName);
    // Classification Logic
    // Classification Logic
    if (nameNorm.includes('imoveis'))
        importType = 'real_estate';
    else if (nameNorm.includes('moveis'))
        importType = 'movables';
    else if (nameNorm.includes('segmentos'))
        importType = 'segments';
    else if (nameNorm.includes('dadosporuf') || nameNorm.includes('consorciosuf') || (nameNorm.includes('uf') && !nameNorm.includes('imoveis') && !nameNorm.includes('moveis')))
        importType = 'regional_uf';
    // Robust check for ADMCONSORCIO (ignoring normalization issues)
    else if (nameNorm.includes('administradoras') || nameNorm.includes('doc4010') || nameNorm.includes('admconsorcio') || fileName.toUpperCase().includes('ADMCONSORCIO'))
        importType = 'administrators';
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
            const rows = await (0, node_1.default)(tempFilePath);
            // rows is array of arrays.
            // Assume Row 0 is Header
            if (rows.length < 2)
                throw new Error("Arquivo Excel vazio ou sem cabeçalho");
            const headers = rows[0].map(h => String(h).trim());
            console.log("XLSX Headers Detected:", headers); // DEBUG Headers
            rows.slice(1).forEach((rowVals) => {
                const rowObj = headers.reduce((obj, header, i) => {
                    obj[header] = rowVals[i] !== null ? rowVals[i] : '';
                    return obj;
                }, {});
                // Extract Date
                if (!detectedDate)
                    detectedDate = String(findValue(rowObj, ['Data_base']) || '');
                let mapped = null;
                if (importType === 'administrators')
                    mapped = mapAdministrators(rowObj, fileName);
                // Support other excel types if needed in future
                if (mapped)
                    rowsToInsert.push(mapped);
            });
        }
        else {
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
                if (!line.trim())
                    return;
                const values = line.split(separator);
                const row = headers.reduce((obj, header, i) => {
                    var _a;
                    let val = (_a = values[i]) === null || _a === void 0 ? void 0 : _a.trim().replace(/^"|"$/g, '');
                    obj[header] = val;
                    return obj;
                }, {});
                if (!detectedDate)
                    detectedDate = String(findValue(row, ['Data_base']) || '');
                let mapped = null;
                if (importType === 'segments') {
                    mapped = mapConsolidatedSeries(row, fileName);
                    const segMapped = mapSegmentos(row, fileName);
                    if (segMapped)
                        rowsToInsert.push(segMapped);
                }
                if (importType === 'real_estate')
                    mapped = mapDetailedGroup(row, 'imoveis', fileName);
                if (importType === 'movables')
                    mapped = mapDetailedGroup(row, 'moveis', fileName);
                if (importType === 'regional_uf')
                    mapped = mapQuarterlyData(row, fileName);
                if (importType === 'administrators')
                    mapped = mapAdministrators(row, fileName);
                if (mapped)
                    rowsToInsert.push(mapped);
            });
        }
        console.log(`Parsed ${rowsToInsert.length} rows.`);
        // BIGQUERY INSERTION
        if (rowsToInsert.length > 0) {
            const tableId = rowsToInsert[0].table;
            await ensureInfrastructure(tableId);
            const fullDataset = rowsToInsert.map(r => (Object.assign(Object.assign({}, r.data), { uploaded_at: bigquery.timestamp(new Date()) })));
            // BATCH INSERTION
            const BATCH_SIZE = 1000;
            for (let i = 0; i < fullDataset.length; i += BATCH_SIZE) {
                const batch = fullDataset.slice(i, i + BATCH_SIZE);
                try {
                    await bigquery.dataset(DATASET_ID).table(tableId).insert(batch);
                    console.log(`[SUCCESS] Inserted batch ${i} - ${i + batch.length} into ${DATASET_ID}.${tableId}`);
                }
                catch (batchErr) {
                    console.error(`[ERROR] Failed to insert batch ${i} - ${i + batch.length}`, (batchErr === null || batchErr === void 0 ? void 0 : batchErr.errors) || batchErr);
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
        }
        else {
            await controlRef.update({
                status: 'SUCCESS',
                rowsProcessed: rowsToInsert.length,
                referenceDate: finalDate,
                bigQueryTable: ((_a = rowsToInsert[0]) === null || _a === void 0 ? void 0 : _a.table) || 'UNKNOWN'
            });
        }
    }
    catch (err) {
        console.error("Processing Error", err);
        await controlRef.update({
            status: 'ERROR',
            errorDetails: err.message || 'Erro no processamento do arquivo'
        });
    }
    if (fs.existsSync(tempFilePath))
        fs.unlinkSync(tempFilePath);
});
exports.deleteFile = functions.https.onCall(async (data, context) => {
    var _a, _b;
    // Check Auth - Admin Only
    if (!((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const { fileId, storagePath } = data;
    if (!fileId || !storagePath)
        throw new functions.https.HttpsError('invalid-argument', 'Missing fileId or storagePath');
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
                    location: LOCATION,
                    params: { fileName }
                });
                console.log(`Deleted rows from ${tableId} for ${fileName}`);
            }
            catch (bqErr) {
                console.warn(`Failed to delete from BQ table ${tableId}:`, bqErr.message);
            }
        }
        try {
            await storage.bucket().file(storagePath).delete();
            console.log(`Deleted from storage: ${storagePath}`);
        }
        catch (e) {
            console.warn("Storage delete failed (maybe already gone):", e.message);
        }
        await db.collection('file_imports_control').doc(fileId).delete();
        console.log(`Deleted control doc: ${fileId}`);
        return { success: true };
    }
    catch (error) {
        console.error("Delete Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.reprocessFile = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const { storagePath } = data;
    if (!storagePath)
        throw new functions.https.HttpsError('invalid-argument', 'Missing storagePath');
    const storage = admin.storage();
    try {
        const [exists] = await storage.bucket().file(storagePath).exists();
        if (!exists)
            throw new functions.https.HttpsError('not-found', 'File not found in storage');
        await storage.bucket().file(storagePath).copy(storagePath);
        return { success: true, message: 'Reprocessing triggered' };
    }
    catch (error) {
        console.error("Reprocess Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.resetSystemData = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const db = admin.firestore();
    try {
        console.warn("INITIATING SYSTEM RESET");
        const tables = Object.keys(SCHEMAS);
        for (const tableId of tables) {
            try {
                const query = `DROP TABLE IF EXISTS \`${DATASET_ID}.${tableId}\``;
                await bigquery.query({ query, location: LOCATION });
                console.log(`Dropped table: ${tableId}`);
            }
            catch (bqErr) {
                console.warn(`Failed to drop ${tableId}:`, bqErr.message);
            }
        }
        const deleteCollection = async (collPath) => {
            const snapshot = await db.collection(collPath).limit(500).get();
            if (snapshot.empty)
                return;
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Deleted batch of ${snapshot.size} from ${collPath}`);
            if (snapshot.size === 500)
                await deleteCollection(collPath);
        };
        await deleteCollection('file_imports_control');
        await deleteCollection('ai_analyses');
        return { success: true, message: 'System data reset successfully. Tables dropped.' };
    }
    catch (error) {
        console.error("Reset System Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// --- DASHBOARD QUERY UPDATED ---
exports.getDashboardData = functions.https.onCall(async (data, context) => {
    var _a;
    // UPDATED QUERY TO MATCH USER DEFINITIONS: Active Quotas, Volume, Vars
    const query = `
    WITH Consolidated AS (
        SELECT
            data_base,
            codigo_segmento,
            ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_do_segmento')) as nome_segmento,
            
            -- Active Quotas
            SUM(
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_active_quotas,

            -- Volume
            SUM(
                (
                    COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64), 0) + 
                    COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * COALESCE(SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64), 0)
            ) as total_volume,

            -- Taxa Adm (Media)
            AVG(SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64)) as avg_admin_fee,

            -- Inadimplência Numerator (Total)
            SUM(
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_default_quotas,

            -- Inadimplência Numerator (Contempladas)
            SUM(COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0)) as total_default_contemplated,

            -- Inadimplência Numerator (Não Contempladas)
            SUM(COALESCE(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)) as total_default_non_contemplated,

            -- Excluded Quotas
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as total_excluded_quotas

        FROM \`consorcio_data.series_consolidadas\`
        GROUP BY data_base, codigo_segmento
    ),
    WithLag AS (
        SELECT 
            *,
            LAG(total_active_quotas) OVER (PARTITION BY codigo_segmento ORDER BY data_base ASC) as prev_active_quotas,
            LAG(total_volume) OVER (PARTITION BY codigo_segmento ORDER BY data_base ASC) as prev_volume,
            LAG(avg_admin_fee) OVER (PARTITION BY codigo_segmento ORDER BY data_base ASC) as prev_admin_fee,
            LAG(total_default_quotas) OVER (PARTITION BY codigo_segmento ORDER BY data_base ASC) as prev_default_quotas,
            LAG(total_default_contemplated) OVER (PARTITION BY codigo_segmento ORDER BY data_base ASC) as prev_default_contemplated,
            LAG(total_default_non_contemplated) OVER (PARTITION BY codigo_segmento ORDER BY data_base ASC) as prev_default_non_contemplated,
            LAG(total_excluded_quotas) OVER (PARTITION BY codigo_segmento ORDER BY data_base ASC) as prev_excluded_quotas
        FROM Consolidated
    )
    SELECT 
        *,
        SAFE_DIVIDE((total_volume), total_active_quotas) as calculated_ticket_medio,
        SAFE_DIVIDE(total_default_quotas, total_active_quotas) * 100 as default_rate,
        
        -- VARIATIONS (%) - Current vs Previous
        SAFE_DIVIDE((total_volume - prev_volume), prev_volume) * 100 as var_volume,
        SAFE_DIVIDE((total_active_quotas - prev_active_quotas), prev_active_quotas) * 100 as var_active_quotas,
        (avg_admin_fee - prev_admin_fee) as var_admin_fee,
        (SAFE_DIVIDE(total_default_quotas, total_active_quotas) * 100) - (SAFE_DIVIDE(prev_default_quotas, prev_active_quotas) * 100) as var_default_rate,
        SAFE_DIVIDE((total_excluded_quotas - prev_excluded_quotas), prev_excluded_quotas) * 100 as var_excluded_quotas

    FROM WithLag
    ORDER BY data_base DESC, codigo_segmento ASC
    LIMIT 200
    `;
    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        const latestDate = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.data_base;
        const currentData = rows.filter(r => r.data_base === latestDate);
        // General Totals
        const totalVolume = currentData.reduce((acc, r) => acc + (Number(r.total_volume) || 0), 0);
        const totalQuotas = currentData.reduce((acc, r) => acc + (Number(r.total_active_quotas) || 0), 0);
        // Default Breakdown
        const totalDefault = currentData.reduce((acc, r) => acc + (Number(r.total_default_quotas) || 0), 0);
        const totalDefaultContemplated = currentData.reduce((acc, r) => acc + (Number(r.total_default_contemplated) || 0), 0);
        const totalDefaultNonContemplated = currentData.reduce((acc, r) => acc + (Number(r.total_default_non_contemplated) || 0), 0);
        const totalFeesSum = currentData.reduce((acc, r) => acc + ((Number(r.avg_admin_fee) || 0) * (Number(r.total_volume) || 0)), 0);
        const avgFeeGeneral = totalVolume > 0 ? totalFeesSum / totalVolume : 0;
        const totalExcluded = currentData.reduce((acc, r) => acc + (Number(r.total_excluded_quotas) || 0), 0);
        // Previous Totals for General Variations
        const prevVolume = currentData.reduce((acc, r) => acc + (Number(r.prev_volume) || 0), 0);
        const prevQuotas = currentData.reduce((acc, r) => acc + (Number(r.prev_active_quotas) || 0), 0);
        const prevDefault = currentData.reduce((acc, r) => acc + (Number(r.prev_default_quotas) || 0), 0);
        const prevExcluded = currentData.reduce((acc, r) => acc + (Number(r.prev_excluded_quotas) || 0), 0);
        // Weighted Admin Fee Prev
        const prevFeesSum = currentData.reduce((acc, r) => acc + ((Number(r.prev_admin_fee) || 0) * (Number(r.prev_volume) || 0)), 0);
        const prevAvgFee = prevVolume > 0 ? prevFeesSum / prevVolume : 0;
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
                varTicket: (prevQuotas > 0 && totalQuotas > 0) ? ((totalVolume / totalQuotas) - (prevVolume / prevQuotas)) / (prevVolume / prevQuotas) * 100 : 0
            },
            segments: currentData.map(r => ({
                id: r.codigo_segmento,
                name: r.nome_segmento || `Segmento ${r.codigo_segmento}`,
                volume: Number(r.total_volume),
                quotas: Number(r.total_active_quotas),
                ticket: Number(r.calculated_ticket_medio),
                adminFee: Number(r.avg_admin_fee),
                defaultRate: Number(r.default_rate),
                excluded: Number(r.total_excluded_quotas),
                // Segment Variations
                varVolume: Number(r.var_volume || 0),
                varQuotas: Number(r.var_active_quotas || 0),
                varTicket: (Number(r.calculated_ticket_medio) - (Number(r.prev_volume) / Number(r.prev_active_quotas))) / (Number(r.prev_volume) / Number(r.prev_active_quotas)) * 100,
                varAdminFee: Number(r.var_admin_fee || 0),
                varDefaultRate: Number(r.var_default_rate || 0),
                varExcluded: Number(r.var_excluded_quotas || 0)
            })),
            history: rows // Pass full history
        };
    }
    catch (error) {
        console.error("Dashboard Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// --- EXISTING FUNCTIONS PRESERVED ---
exports.getTrendData = functions.https.onCall(async (data, context) => {
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
                ) as total_volume

        FROM \`consorcio_data.series_consolidadas\`
        GROUP BY data_base, codigo_segmento
        ORDER BY data_base ASC
    `;
    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    }
    catch (error) {
        console.error("Trend Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.getAdministratorData = functions.https.onCall(async (data, context) => {
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
            
            -- Volume
            SUM(
                (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
            ) as totalBalance,

            -- Active Quotas
            SUM(
                SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as totalActive,
            
            -- Defaults (Inadimplencia)
            SUM(
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as totalDefaults

        FROM \`consorcio_data.series_consolidadas\` t
        CROSS JOIN MaxDate md
        LEFT JOIN LatestAdmins adm ON adm.cnpj_raiz = t.cnpj_raiz AND adm.rn = 1
        WHERE t.data_base = md.max_date
        GROUP BY t.cnpj_raiz
        ORDER BY totalBalance DESC
    `;
    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    }
    catch (error) {
        console.error("Admin Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.getAdministratorDetail = functions.https.onCall(async (data, context) => {
    const { cnpj } = data;
    if (!cnpj)
        throw new functions.https.HttpsError('invalid-argument', 'CNPJ required');
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
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
            ) as total_defaults,
            
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as total_dropouts

        FROM \`consorcio_data.series_consolidadas\` t
        LEFT JOIN LatestAdmins adm ON adm.cnpj_raiz = t.cnpj_raiz AND adm.rn = 1
        WHERE t.cnpj_raiz = @cnpj
        GROUP BY t.data_base, t.codigo_segmento
        ORDER BY t.data_base ASC
    `;
    try {
        const [rows] = await bigquery.query({
            query,
            location: LOCATION,
            params: { cnpj }
        });
        return { data: rows };
    }
    catch (error) {
        console.error("Admin Detail Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.getOperationalData = functions.https.onCall(async (data, context) => {
    const { mode, cnpj } = data;
    if (mode === 'detail' && !cnpj) {
        throw new functions.https.HttpsError('invalid-argument', 'CNPJ required for detail mode');
    }
    let query = '';
    const params = {};
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
    }
    else {
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
        const [rows] = await bigquery.query({ query, location: LOCATION, params });
        return { data: rows };
    }
    catch (error) {
        console.error("Operational Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.getRegionalData = functions.https.onCall(async (data, context) => {
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
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    }
    catch (error) {
        console.error("Regional Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.setupAdmin = functions.https.onCall(async (data, context) => {
    const { email, password, setupKey } = data;
    if (setupKey !== 'INTEL_SETUP_2026') {
        throw new functions.https.HttpsError('permission-denied', 'Invalid Setup Key');
    }
    try {
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        }
        catch (e) {
            if (e.code === 'auth/user-not-found') {
                userRecord = await admin.auth().createUser({
                    email,
                    password,
                    emailVerified: true
                });
                console.log(`Created new user: ${email}`);
            }
            else {
                throw e;
            }
        }
        await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
        return { success: true, message: `User ${email} is now an ADMIN.` };
    }
    catch (error) {
        console.error("Setup Admin Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.checkAdminStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        return { isAdmin: false };
    const token = context.auth.token;
    return { isAdmin: !!token.admin };
});
//# sourceMappingURL=index.js.map