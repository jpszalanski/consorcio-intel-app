"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugSetAdmin = exports.checkAdminStatus = exports.setupAdmin = exports.getDashboardData = exports.getRegionalData = exports.getOperationalData = exports.getAdministratorDetail = exports.getAdministratorData = exports.getTrendData = exports.resetSystemData = exports.reprocessFile = exports.deleteFile = exports.processFileUpload = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const os = require("os");
const path = require("path");
const fs = require("fs");
const bigquery_1 = require("@google-cloud/bigquery");
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
// --- SHARED LOGIC PORTED FROM dataStore.ts ---
const normalizeToCompetence = (dateStr) => {
    if (!dateStr)
        return 'UNKNOWN';
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
        // Replace spaces with underscores, remove special chars if desired, but mainly spaces is the issue
        // Example: "Valor médio do bem" -> "Valor_médio_do_bem"
        const cleanKey = key.trim().replace(/\s+/g, '_');
        // Keep value as is
        newRow[cleanKey] = row[key];
    });
    return newRow;
};
// --- MAPPERS ---
// (Simplified for Backend: Returns flat object for BigQuery)
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
            // Store Standardized JSON
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
    const cnpj = String(findValue(row, ['CNPJ', 'Cnpj', 'CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const nome = String(findValue(row, ['Nome', 'Nome_da_Administradora', 'Nom_Admi', 'NOME_DA_ADMINISTRADORA']) || '');
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
    // Assuming file has Code and Name
    const code = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, ''));
    // Usually 'Nome_do_segmento' or the description next to code
    // In "Segmentos Consolidados", the segment name might be "Nome_do_segmento" or derived.
    // Based on previous knowledge (or assumption to be safe/generic):
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
    const content = fs.readFileSync(tempFilePath, 'latin1'); // Using latin1/binary to match 'windows-1252' mostly
    const lines = content.split('\n');
    if (lines.length < 2)
        return console.log("Arquivo vazio");
    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';
    const headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
    // Detect Type
    let importType = null;
    const nameNorm = normalizeKey(fileName);
    if (nameNorm.includes('imoveis'))
        importType = 'real_estate';
    else if (nameNorm.includes('moveis'))
        importType = 'movables';
    else if (nameNorm.includes('segmentos'))
        importType = 'segments';
    else if (nameNorm.includes('dadosporuf') || nameNorm.includes('consorciosuf') || (nameNorm.includes('uf') && !nameNorm.includes('imoveis') && !nameNorm.includes('moveis')))
        importType = 'regional_uf';
    else if (nameNorm.includes('administradoras') || nameNorm.includes('doc4010'))
        importType = 'administrators';
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
    const rowsToInsert = [];
    let detectedDate = '';
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
        // Extract Date from first valid row (Using findValue to be robust)
        if (!detectedDate) {
            detectedDate = String(findValue(row, ['Data_base']) || '');
        }
        let mapped = null;
        if (importType === 'segments') {
            mapped = mapConsolidatedSeries(row, fileName);
            // Also try to map Segments table (Distinct list)
            const segMapped = mapSegmentos(row, fileName);
            if (segMapped)
                rowsToInsert.push(segMapped);
        }
        if (importType === 'real_estate')
            mapped = mapDetailedGroup(row, 'imoveis', fileName);
        if (importType === 'moveis')
            mapped = mapDetailedGroup(row, 'moveis', fileName); // Fix: 'moveis' string check
        if (importType === 'movables')
            mapped = mapDetailedGroup(row, 'moveis', fileName); // Handle both keys if needed
        if (importType === 'regional_uf')
            mapped = mapQuarterlyData(row, fileName);
        if (importType === 'administrators')
            mapped = mapAdministrators(row, fileName);
        if (mapped)
            rowsToInsert.push(mapped);
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
            const fullDataset = rowsToInsert.map(r => (Object.assign(Object.assign({}, r.data), { uploaded_at: bigquery.timestamp(new Date()) })));
            // BATCH INSERTION (Chunking to avoid 413 Request Too Large)
            const BATCH_SIZE = 1000;
            for (let i = 0; i < fullDataset.length; i += BATCH_SIZE) {
                const batch = fullDataset.slice(i, i + BATCH_SIZE);
                try {
                    await bigquery.dataset(DATASET_ID).table(tableId).insert(batch);
                    console.log(`[SUCCESS] Inserted batch ${i} - ${i + batch.length} into ${DATASET_ID}.${tableId}`);
                }
                catch (batchErr) {
                    console.error(`[ERROR] Failed to insert batch ${i} - ${i + batch.length}`, (batchErr === null || batchErr === void 0 ? void 0 : batchErr.errors) || batchErr);
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
            bigQueryTable: ((_a = rowsToInsert[0]) === null || _a === void 0 ? void 0 : _a.table) || 'UNKNOWN'
        });
    }
    catch (err) {
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
        // 0. Get File Name to delete from BigQuery
        // We can extract it from storagePath (e.g., "raw-uploads/filename.csv")
        const fileName = path.basename(storagePath);
        console.log(`Deleting data for file: ${fileName}`);
        // 1. Delete from BigQuery Tables
        // Attempt to delete from ALL tables where file_name matches
        // This is robust to ensure cleanup. Tables might not have the column if older schema, but we will ignore specific errors or try-catch.
        const tables = Object.keys(SCHEMAS);
        for (const tableId of tables) {
            try {
                // Check if table exists first to avoid error? Or just try delete.
                // Safest is to try delete content.
                const query = `DELETE FROM \`${DATASET_ID}.${tableId}\` WHERE file_name = @fileName`;
                await bigquery.query({
                    query,
                    location: LOCATION,
                    params: { fileName }
                });
                console.log(`Deleted rows from ${tableId} for ${fileName}`);
            }
            catch (bqErr) {
                console.warn(`Failed to delete from BQ table ${tableId} (maybe table missing or col missing):`, bqErr.message);
            }
        }
        // 2. Delete from Storage
        try {
            await storage.bucket().file(storagePath).delete();
            console.log(`Deleted from storage: ${storagePath}`);
        }
        catch (e) {
            console.warn("Storage delete failed (maybe already gone):", e.message);
        }
        // 3. Delete Control Record
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
    // Check Auth - Admin Only
    if (!((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const { storagePath } = data;
    if (!storagePath)
        throw new functions.https.HttpsError('invalid-argument', 'Missing storagePath');
    const storage = admin.storage();
    try {
        // 1. Check if exists
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
    // Check Auth - Admin Only
    if (!((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const db = admin.firestore();
    try {
        console.warn("INITIATING SYSTEM RESET - DELETING ALL IMPORTED DATA AND AI ANALYSES");
        // 1. Drop BigQuery Tables (To enforce new Schema on recreation)
        const tables = [
            'series_consolidadas',
            'grupos_detalhados',
            'dados_trimestrais_uf',
            'administradoras',
            'segmentos'
        ];
        for (const tableId of tables) {
            try {
                // DROP TABLE IF EXISTS
                const query = `DROP TABLE IF EXISTS \`${DATASET_ID}.${tableId}\``;
                await bigquery.query({ query, location: LOCATION });
                console.log(`Dropped table: ${tableId}`);
            }
            catch (bqErr) {
                console.warn(`Failed to drop ${tableId}:`, bqErr.message);
            }
        }
        // 2. Clear Firestore Control Collection (Import Logs)
        // BATCH delete
        const deleteCollection = async (collPath) => {
            const snapshot = await db.collection(collPath).limit(500).get(); // Limit for batch
            if (snapshot.empty)
                return;
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Deleted batch of ${snapshot.size} from ${collPath}`);
            // Recursively delete if more exist
            if (snapshot.size === 500)
                await deleteCollection(collPath);
        };
        await deleteCollection('file_imports_control');
        // 3. Clear AI Analyses
        // Requested by user: "delete ai analyses performed with these data"
        await deleteCollection('ai_analyses');
        // CRITICAL: DO NOT DELETE 'prompt_templates'
        return { success: true, message: 'System data and AI history reset successfully. Tables dropped.' };
    }
    catch (error) {
        console.error("Reset System Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// ... (trend data)
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
            ) as totalDefaults,

            -- Weighted Fees (Approx) - Sum(Tax * Active) / Sum(Active)
            SUM(
                SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64) * 
                (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                )
            ) as totalFeesWeighted

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

             -- KPIs for Average (Fee, Term)
            SUM(
               SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(t.metricas_raw, '$.Taxa_de_administração'), '.', ''), ',', '.') AS FLOAT64) * 
               (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
               )
            ) as total_fees_weighted,

             SUM(
               SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Prazo_do_grupo_em_meses') AS INT64) * 
               (
                    SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) + 
                    IFNULL(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
               )
            ) as total_term_weighted,

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
    // mode: 'market' (all admins aggregated) or 'detail' (specific admin by UF)
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

    FROM \`consorcio_data.dados_trimestrais_uf\` t
    CROSS JOIN MaxDate md
    WHERE cnpj_raiz = @cnpj AND t.data_base = md.max_date
    GROUP BY uf
    ORDER BY adesoes DESC
`;
        params.cnpj = cnpj;
    }
    else {
        // Market Overview (Scatter) - Aggregated by Admin
        query = `
    WITH MaxDate AS (
        SELECT MAX(data_base) as max_date FROM \`consorcio_data.dados_trimestrais_uf\`
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
        
        SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as adesoes,
        
        (
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_excluídos_contemplados') AS INT64)) + 
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_excluídos_não_contemplados') AS INT64))
        ) as total_dropouts,

        SUM(
            SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64) +
            SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64) +
            SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)
        ) as total_active

    FROM \`consorcio_data.dados_trimestrais_uf\` t
    CROSS JOIN MaxDate md
    LEFT JOIN LatestAdmins adm ON adm.cnpj_raiz = t.cnpj_raiz AND adm.rn = 1
    WHERE t.data_base = md.max_date
    GROUP BY t.cnpj_raiz
    HAVING total_active > 100
    ORDER BY total_active DESC
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
            COUNT(*) as records_count,
            
            -- Acumulados (Stock)
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_lance') AS INT64)) as activeContemplatedBid,
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_contemplados_por_sorteio') AS INT64)) as activeContemplatedLottery,
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_ativos_não_contemplados') AS INT64)) as activeNonContemplated,
            
            -- Excluded (Stock)
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_excluídos_contemplados') AS INT64)) as dropoutContemplated,
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_consorciados_excluídos_não_contemplados') AS INT64)) as dropoutNonContemplated,
            
            -- Flow (Quarter)
            SUM(SAFE_CAST(JSON_VALUE(t.metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as newAdhesionsQuarter,
            
            -- Total Active
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
exports.getDashboardData = functions.https.onCall(async (data, context) => {
    // Fallback query that doesn't depend on 'segmentos' table existence
    const query = `
        SELECT
            data_base,
            CAST(codigo_segmento AS STRING) as codigo_segmento,
            ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_do_segmento')) as tipo,
            
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

        FROM \`consorcio_data.series_consolidadas\`
        GROUP BY data_base, codigo_segmento
        ORDER BY data_base ASC
    `;
    try {
        const [rows] = await bigquery.query({ query, location: LOCATION });
        return { data: rows };
    }
    catch (error) {
        console.error("Dashboard Query Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// --- ACCESS CONTROL ---
exports.setupAdmin = functions.https.onCall(async (data, context) => {
    // SECURITY: checks for a hardcoded setup key to prevent abuse
    // In production, this function should be deleted after use.
    const { email, password, setupKey } = data;
    if (setupKey !== 'INTEL_SETUP_2026') {
        throw new functions.https.HttpsError('permission-denied', 'Invalid Setup Key');
    }
    try {
        // 1. Check if user exists
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        }
        catch (e) {
            if (e.code === 'auth/user-not-found') {
                // Create user
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
        // 2. Set Custom Claims
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
exports.debugSetAdmin = functions.https.onRequest(async (req, res) => {
    // Disable CORS for simplicity or enable if calling from browser console used fetch
    res.set('Access-Control-Allow-Origin', '*');
    const email = req.query.email;
    const key = req.query.key;
    if (key !== 'INTEL_DEBUG_FORCE') {
        res.status(403).send('Forbidden');
        return;
    }
    if (!email) {
        res.status(400).send('Missing email');
        return;
    }
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        // Verify
        const updatedUser = await admin.auth().getUserByEmail(email);
        res.json({
            success: true,
            message: `Admin claim forced for ${email}`,
            claims: updatedUser.customClaims
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
//# sourceMappingURL=index.js.map