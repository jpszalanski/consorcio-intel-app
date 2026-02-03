"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reprocessFile = exports.deleteFile = exports.processFileUpload = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const os = require("os");
const path = require("path");
const fs = require("fs");
admin.initializeApp();
// --- SHARED LOGIC PORTED FROM dataStore.ts ---
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
// --- MAPPERS ---
// (Simplified for Backend: Returns flat object for BigQuery)
const mapConsolidatedSeries = (row) => {
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
            // ... (Add other fields as needed for BQ, simplified here for robustness)
            metricas_raw: JSON.stringify(row) // Storing raw for safety first
        }
    };
};
const mapDetailedGroup = (row, type) => {
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
            metricas_raw: JSON.stringify(row)
        }
    };
};
const mapQuarterlyData = (row) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const uf = String(findValue(row, ['Unidade_da_Federação_do_consorciado', 'UF']) || '').toUpperCase();
    if (!cnpj || !uf)
        return null;
    return {
        table: 'dados_trimestrais_uf',
        data: {
            cnpj_raiz: cnpj,
            uf: uf,
            metricas_raw: JSON.stringify(row)
        }
    };
};
// --- CLOUD FUNCTION ---
exports.processFileUpload = functions.storage.object().onFinalize(async (object) => {
    var _a, _b;
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
    else if (nameNorm.includes('dadosporuf'))
        importType = 'regional_uf';
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
        // Extract Date from first valid row
        if (!detectedDate && row['Data_base'])
            detectedDate = row['Data_base'];
        let mapped = null;
        if (importType === 'segments')
            mapped = mapConsolidatedSeries(row);
        if (importType === 'real_estate')
            mapped = mapDetailedGroup(row, 'imoveis');
        if (importType === 'moveis')
            mapped = mapDetailedGroup(row, 'moveis'); // Fix: 'moveis' string check
        if (importType === 'movables')
            mapped = mapDetailedGroup(row, 'moveis'); // Handle both keys if needed
        if (importType === 'regional_uf')
            mapped = mapQuarterlyData(row);
        if (mapped)
            rowsToInsert.push(mapped);
    });
    console.log(`Parsed ${rowsToInsert.length} rows.`);
    try {
        // BIGQUERY INSERTION STUB
        // await bigquery.dataset('consorcio_data').table(rowsToInsert[0].table).insert(rowsToInsert.map(r => r.data));
        console.log(`[MOCK] Inserting into BigQuery: ${rowsToInsert.length} records into table ${(_a = rowsToInsert[0]) === null || _a === void 0 ? void 0 : _a.table}`);
        // 2. Success Report
        await controlRef.update({
            status: 'SUCCESS',
            rowsProcessed: rowsToInsert.length,
            referenceDate: detectedDate || 'UNKNOWN',
            bigQueryTable: ((_b = rowsToInsert[0]) === null || _b === void 0 ? void 0 : _b.table) || 'UNKNOWN'
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
    // Check Auth
    // if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    const { fileId, storagePath } = data;
    if (!fileId || !storagePath)
        throw new functions.https.HttpsError('invalid-argument', 'Missing fileId or storagePath');
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
    }
    catch (error) {
        console.error("Delete Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.reprocessFile = functions.https.onCall(async (data, context) => {
    // if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    const { storagePath } = data;
    if (!storagePath)
        throw new functions.https.HttpsError('invalid-argument', 'Missing storagePath');
    const storage = admin.storage();
    try {
        // 1. Check if exists
        const [exists] = await storage.bucket().file(storagePath).exists();
        if (!exists)
            throw new functions.https.HttpsError('not-found', 'File not found in storage');
        // 2. Trigger "finalize" manually?? 
        // No, easier to just Copy the file to itself to re-trigger the event, 
        // OR we just invoke logic.
        // For simplicity: We "touch" the file metadata to re-trigger the onFinalize hook?
        // Actually, copying to same location creates a finalize event.
        await storage.bucket().file(storagePath).copy(storagePath);
        return { success: true, message: 'Reprocessing triggered' };
    }
    catch (error) {
        console.error("Reprocess Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=index.js.map