/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 * 
 * Rebuilt per indicadores_consorcios_completo.txt specification
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import { BigQuery } from "@google-cloud/bigquery";
import * as csv from "csv-parse/sync";

admin.initializeApp();

const bigquery = new BigQuery({ projectId: 'consorcio-intel-app' });

const BQ_LOCATION = 'US';

// ============================================================================
// FUNCTION: getDashboardData (Dual-Source Per Spec)
// ============================================================================

export const getDashboardData = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId } = request.data || {};

    if (!administratorId) {
        throw new HttpsError('invalid-argument', 'The function must be called with an "administratorId".');
    }

    try {
        const query = `
            WITH 
            LastUpdates AS (
               SELECT 
                 MAX(CASE WHEN table_id = 'segmentos_consolidados' THEN creation_time END) as last_update_segmentos,
                 MAX(CASE WHEN table_id = 'bens_imoveis_grupos' THEN creation_time END) as last_update_imoveis,
                 MAX(CASE WHEN table_id = 'bens_moveis_grupos' THEN creation_time END) as last_update_moveis,
                 MAX(CASE WHEN table_id = 'dados_trimestrais_uf' THEN creation_time END) as last_update_uf
               FROM \`consorcio-intel-app.consorcio_data.__TABLES__\`
            ),
            MarketShare AS (
               SELECT 
                 bs.nome_segmento,
                 SUM(CAST(JSON_VALUE(metricas_raw, '$.Valor_Total_Creditos_Comercializados') AS FLOAT64)) as total_market_volume,
                 SUM(CASE WHEN cnpj_raiz = @cnpj THEN CAST(JSON_VALUE(metricas_raw, '$.Valor_Total_Creditos_Comercializados') AS FLOAT64) ELSE 0 END) as admin_volume
               FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\` sc
               LEFT JOIN \`consorcio-intel-app.consorcio_data.base_segmentos\` bs ON sc.codigo_segmento = bs.codigo_segmento
               WHERE data_base = (SELECT MAX(data_base) FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\`)
               GROUP BY 1
            )
            SELECT
              (SELECT last_update_segmentos FROM LastUpdates) as last_updated,
              (SELECT SUM(admin_volume) / NULLIF(SUM(total_market_volume), 0) FROM MarketShare) as market_share_global,
              ARRAY(
                SELECT AS STRUCT nome_segmento, admin_volume / NULLIF(total_market_volume, 0) as share 
                FROM MarketShare
              ) as market_share_by_segment
        `;

        const options = {
            query: query,
            location: BQ_LOCATION,
            params: { cnpj: administratorId }
        };

        const [rows] = await bigquery.query(options);
        return rows[0] || {};

    } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getAdministratorList
// ============================================================================
export const getAdministratorList = onCall({ region: 'us-central1' }, async (request) => {
    try {
        const query = `
            SELECT DISTINCT cnpj_raiz, 
              (SELECT JSON_VALUE(metricas_raw, '$.Nome_Administradora') 
               FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\` t2 
               WHERE t2.cnpj_raiz = t1.cnpj_raiz LIMIT 1) as nome_administradora
            FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\` t1
            ORDER BY nome_administradora
         `;
        const options = { query, location: BQ_LOCATION };
        const [rows] = await bigquery.query(options);
        return rows;
    } catch (error: any) {
        console.error("Error fetching admin list:", error);
        throw new HttpsError('internal', error.message);
    }
});

// ============================================================================
// FUNCTION: getRegionalData
// ============================================================================
export const getRegionalData = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId } = request.data || {};

    try {
        let query = `
            SELECT 
                uf,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) as active_quotas,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_adesões_no_trimestre') AS INT64)) as adhesions,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_não_contemplados') AS INT64) +
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_consorciados_excluídos_contemplados') AS INT64), 0)
                ) as dropouts
            FROM \`consorcio-intel-app.consorcio_data.dados_trimestrais_uf\`
            WHERE data_base = (SELECT MAX(data_base) FROM \`consorcio-intel-app.consorcio_data.dados_trimestrais_uf\`)
        `;

        const params: any = {};
        if (administratorId) {
            query += ` AND cnpj_raiz = @cnpj`;
            params.cnpj = administratorId;
        }

        query += ` GROUP BY uf ORDER BY active_quotas DESC`;

        const options = { query, location: BQ_LOCATION, params };
        const [rows] = await bigquery.query(options);
        return { data: rows };
    } catch (error: any) {
        console.error("Error fetching regional data:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getTrendData
// ============================================================================
export const getTrendData = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId } = request.data || {};

    try {
        let query = `
            SELECT 
                data_base,
                codigo_segmento,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Valor_Total_Creditos_Comercializados') AS FLOAT64)) as total_volume,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) as total_quotas,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_comercializadas_no_mês') AS INT64)) as sales
            FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\`
        `;

        const params: any = {};
        if (administratorId) {
            query += ` WHERE cnpj_raiz = @cnpj`;
            params.cnpj = administratorId;
        }

        query += ` GROUP BY data_base, codigo_segmento ORDER BY data_base ASC`;

        const options = { query, location: BQ_LOCATION, params };
        const [rows] = await bigquery.query(options);
        return { data: rows };
    } catch (error: any) {
        console.error("Error fetching trend data:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getAdministratorData (Ranking)
// ============================================================================
export const getAdministratorData = onCall({ region: 'us-central1' }, async (request) => {
    try {
        const query = `
            SELECT 
                t1.cnpj_raiz as id,
                ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_Administradora')) as name,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Valor_Total_Creditos_Comercializados') AS FLOAT64)) as totalBalance,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) as totalActive,
                SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64) +
                    IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) as totalDefaults,
                AVG(CAST(JSON_VALUE(metricas_raw, '$.Taxa_de_administração') AS FLOAT64)) as totalFeesWeighted
            FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\` t1
            WHERE data_base = (SELECT MAX(data_base) FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\`)
            GROUP BY cnpj_raiz
            ORDER BY totalBalance DESC
        `;

        const options = { query, location: BQ_LOCATION };
        const [rows] = await bigquery.query(options);
        return { data: rows };
    } catch (error: any) {
        console.error("Error fetching admin data:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getAdministratorDetail
// ============================================================================
export const getAdministratorDetail = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { cnpj, administratorId } = request.data || {};
    // Note: administratorId is passed for auth/logging but we query by specific 'cnpj' target

    if (!cnpj) {
        throw new HttpsError('invalid-argument', 'CNPJ is required.');
    }

    try {
        const query = `
            SELECT 
                data_base,
                codigo_segmento,
                JSON_VALUE(metricas_raw, '$.Nome_Administradora') as nome_reduzido,
                CAST(JSON_VALUE(metricas_raw, '$.Valor_Total_Creditos_Comercializados') AS FLOAT64) as total_volume,
                (CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                 IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                 IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) as total_active,
                (CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64) +
                 IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                ) as total_defaults,
                CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_comercializadas_no_mês') AS INT64) as sales,
                CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64) as dropouts
            FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\`
            WHERE cnpj_raiz = @cnpj
            ORDER BY data_base ASC
        `;

        const options = { query, location: BQ_LOCATION, params: { cnpj } };
        const [rows] = await bigquery.query(options);
        return { data: rows };
    } catch (error: any) {
        console.error("Error fetching admin detail:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getOperationalData
// ============================================================================
export const getOperationalData = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { mode, cnpj, administratorId } = request.data || {};

    try {
        let query = '';
        const params: any = {};

        if (mode === 'market') {
            query = `
                SELECT 
                    cnpj_raiz as id,
                    ANY_VALUE(JSON_VALUE(metricas_raw, '$.Nome_Administradora')) as name,
                    SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_comercializadas_no_mês') AS INT64)) as adesoes,
                    SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as dropouts,
                    SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                        IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                        IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                    ) as totalActive
                FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\`
                WHERE data_base = (SELECT MAX(data_base) FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\`)
                GROUP BY cnpj_raiz
            `;
        } else if (mode === 'detail') {
            if (!cnpj) throw new HttpsError('invalid-argument', 'CNPJ required for detail mode');
            query = `
                SELECT 
                    data_base,
                    SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_comercializadas_no_mês') AS INT64)) as adesoes,
                    SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_excluídas') AS INT64)) as dropouts,
                    SUM(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) + 
                        IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                        IFNULL(CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                    ) as totalActive
                FROM \`consorcio-intel-app.consorcio_data.segmentos_consolidados\`
                WHERE cnpj_raiz = @cnpj
                GROUP BY data_base
                ORDER BY data_base ASC
            `;
            params.cnpj = cnpj;
        } else {
            throw new HttpsError('invalid-argument', 'Invalid mode');
        }

        const options = { query, location: BQ_LOCATION, params };
        const [rows] = await bigquery.query(options);
        return { data: rows };

    } catch (error: any) {
        console.error("Error fetching operational data:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FILE PROCESSING (IMPORTS)
// ============================================================================

const determineTable = (filename: string) => {
    if (filename.match(/Segmentos_Consolidados/i)) return 'segmentos_consolidados';
    if (filename.match(/Bens_Imoveis_Grupos/i)) return 'bens_imoveis_grupos';
    if (filename.match(/Bens_Moveis_Grupos/i)) return 'bens_moveis_grupos';
    if (filename.match(/UF/i)) return 'dados_trimestrais_uf';
    return null;
};

const extractKeys = (row: any, filename: string) => {
    // 1. DATA BASE (From filename usually YYYYMM)
    let data_base = '';
    const dateMatch = filename.match(/^(\d{6})|^(\d{4})[-_]?(\d{2})/);
    if (dateMatch) {
        if (dateMatch[1]) data_base = `${dateMatch[1].substring(0, 4)}-${dateMatch[1].substring(4, 6)}`; // YYYYMM
        else data_base = `${dateMatch[2]}-${dateMatch[3]}`; // YYYY-MM
    }

    // 2. CNPJ RAIZ
    // Try column "CNPJ", "Cnpj", "Administradora" (if CNPJ inside), or "CNPJ da Administradora"
    let cnpj_raiz = '';
    const cnpjKey = Object.keys(row).find(k => k.match(/CNPJ/i));
    if (cnpjKey && row[cnpjKey]) {
        cnpj_raiz = String(row[cnpjKey]).replace(/\D/g, '').substring(0, 8); // Root only? Usually full CNPJ, strict 8 usually.
    }

    // 3. SEGMENT or GROUP
    let codigo_segmento = 0;
    let codigo_grupo = '';
    let uf = '';

    const segKey = Object.keys(row).find(k => k.match(/C.digo.*Segmento/i) || k.match(/Segmento/i));
    if (segKey && row[segKey]) codigo_segmento = parseInt(String(row[segKey]));

    const groupKey = Object.keys(row).find(k => k.match(/C.digo.*Grupo/i) || k.match(/Grupo/i));
    if (groupKey && row[groupKey]) codigo_grupo = String(row[groupKey]);

    const ufKey = Object.keys(row).find(k => k.match(/UF/i) || k.match(/Estado/i));
    if (ufKey && row[ufKey]) uf = String(row[ufKey]);

    return { data_base, cnpj_raiz, codigo_segmento, codigo_grupo, uf };
};


export const processFileUpload = onObjectFinalized({ region: 'us-central1', memory: '1GiB' }, async (event) => {
    const object = event.data;
    const filename = object.name;
    if (!filename) return;

    // Only process files in 'imports/' or specific patterns if needed, but robust to all.
    const tableId = determineTable(filename);
    if (!tableId) {
        console.log(`Skipping file ${filename} (unknown type)`);
        return;
    }

    console.log(`Processing ${filename} into ${tableId}...`);

    // Download
    const bucket = admin.storage().bucket(object.bucket);
    const [fileContent] = await bucket.file(filename).download();

    // Parse
    let records: any[] = [];
    if (filename.toLowerCase().endsWith('.csv')) {
        records = csv.parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter: [';', ',', '\t'], // Auto-detect separator
            relax_quotes: true
        });
    } else {
        console.log("XLSX processing not implemented in this snippet, install 'read-excel-file' AND import it to use.");
    }

    // Insert to BigQuery
    const datasetId = 'consorcio_data';
    const rowsToInsert = records.map(row => {
        const keys = extractKeys(row, filename.split('/').pop() || '');

        const bqRow: any = {
            data_base: keys.data_base,
            cnpj_raiz: keys.cnpj_raiz, // If empty, we might skip or insert empty?
            metricas_raw: JSON.stringify(row) // Store everything
        };

        if (tableId === 'segmentos_consolidados') {
            bqRow.codigo_segmento = keys.codigo_segmento;
        } else if (tableId === 'bens_imoveis_grupos' || tableId === 'bens_moveis_grupos') {
            bqRow.codigo_grupo = keys.codigo_grupo;
        } else if (tableId === 'dados_trimestrais_uf') {
            bqRow.codigo_segmento = keys.codigo_segmento;
            bqRow.uf = keys.uf;
        }

        // Validate required keys
        if (!bqRow.data_base || !bqRow.cnpj_raiz) return null; // Skip invalid
        return bqRow;
    }).filter(r => r !== null);

    if (rowsToInsert.length > 0) {
        // Chunk inserts to avoid limits (max 10k rows usually safe)
        const chunkSize = 1000;
        for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
            const chunk = rowsToInsert.slice(i, i + chunkSize);
            await bigquery.dataset(datasetId).table(tableId).insert(chunk);
        }
        console.log(`Inserted ${rowsToInsert.length} rows into ${tableId}`);
    } else {
        console.warn(`No valid rows extracted from ${filename}`);
    }

    // Update Firestore status (control view)
    // ID is filename without extension
    const fileId = filename.split('/').pop()?.replace(/\.[^/.]+$/, "") || 'unknown';
    await admin.firestore().collection('file_imports_control').doc(fileId).set({
        status: 'SUCCESS',
        rowsProcessed: rowsToInsert.length,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

});


// ============================================================================
// HELPER: Assert Admin
// ============================================================================
const assertAdmin = (request: any) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    if (!request.auth.token.admin) {
        throw new HttpsError('permission-denied', 'The function must be called as an administrator.');
    }
};

// ============================================================================
// ADMIN: Reprocess File (Placeholder)
// ============================================================================
export const reprocessFile = onCall({ region: 'us-central1' }, async (request) => {
    assertAdmin(request);
    // Logic to trigger processFileUpload logic again or read from raw bucket
    return { success: true, message: "Reprocess triggered (mock)" };
});

// ============================================================================
// ADMIN: Delete File (Placeholder)
// ============================================================================
export const deleteFile = onCall({ region: 'us-central1' }, async (request) => {
    assertAdmin(request);
    // Logic to delete from storage and BigQuery
    return { success: true, message: "Delete triggered (mock)" };
});

// ============================================================================
// ADMIN: Reset System (and Ensure Schema)
// ============================================================================
export const resetSystemData = onCall({ timeoutSeconds: 540, memory: '2GiB', region: 'us-central1' }, async (request) => {
    assertAdmin(request);

    const datasetId = 'consorcio_data';

    // 1. Ensure Dataset
    const [datasetExists] = await bigquery.dataset(datasetId).exists();
    if (!datasetExists) {
        await bigquery.createDataset(datasetId, { location: BQ_LOCATION });
    }

    const tables = [
        {
            tableId: 'segmentos_consolidados',
            schema: [
                { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                { name: 'codigo_segmento', type: 'INTEGER', mode: 'REQUIRED' },
                { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
            ]
        },
        {
            tableId: 'bens_imoveis_grupos',
            schema: [
                { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                { name: 'codigo_grupo', type: 'STRING', mode: 'NULLABLE' },
                { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
            ]
        },
        {
            tableId: 'bens_moveis_grupos',
            schema: [
                { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                { name: 'codigo_grupo', type: 'STRING', mode: 'NULLABLE' },
                { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
            ]
        },
        {
            tableId: 'dados_trimestrais_uf',
            schema: [
                { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                { name: 'codigo_segmento', type: 'INTEGER', mode: 'REQUIRED' },
                { name: 'uf', type: 'STRING', mode: 'REQUIRED' },
                { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
            ]
        },
        {
            tableId: 'base_segmentos',
            schema: [
                { name: 'codigo_segmento', type: 'INTEGER', mode: 'REQUIRED' },
                { name: 'nome_segmento', type: 'STRING', mode: 'REQUIRED' }
            ]
        }
    ];

    // 2. Delete existing data (RESET)
    // We can either DROP TABLE or DELETE FROM. 
    // Spec says "Reset System Data". implies clear data.
    // If we drop tables, we ensure schema is correct on recreation.

    for (const t of tables) {
        const table = bigquery.dataset(datasetId).table(t.tableId);
        const [exists] = await table.exists();
        if (exists) {
            // Delete content or Drop? Dropping is cleaner for schema reset.
            await table.delete();
        }
        // Recreate
        await table.create({ schema: t.schema });
    }

    // 3. Seed Base Segments
    const segmentsToSeed = [
        { codigo_segmento: 1, nome_segmento: 'Imóveis' },
        { codigo_segmento: 2, nome_segmento: 'Veículos Pesados' },
        { codigo_segmento: 3, nome_segmento: 'Automóveis' },
        { codigo_segmento: 4, nome_segmento: 'Motocicletas' },
        { codigo_segmento: 5, nome_segmento: 'Bens Móveis Duráveis' },
        { codigo_segmento: 6, nome_segmento: 'Serviços' }
    ];

    await bigquery
        .dataset(datasetId)
        .table('base_segmentos')
        .insert(segmentsToSeed);

    return { success: true, message: "System reset, schema recreated, and base segments seeded." };
});

// ============================================================================
// ADMIN: Check Status
// ============================================================================
export const checkAdminStatus = onCall({ region: 'us-central1' }, async (request) => {
    return { isAdmin: !!request.auth?.token?.admin };
});

// ============================================================================
// ADMIN: Setup (Placeholder)
// ============================================================================
export const setupAdmin = onCall({ region: 'us-central1' }, async (request) => {
    // Only allow setup if no admins exist or strictly controlled
    // For now, let's restriction to admin only as well to prevent unauthorized usage if it was functional
    assertAdmin(request);
    return { success: true };
});


// ============================================================================
// FUNCTION: getMarketShareIndicators (Section 2)
// ============================================================================

export const getMarketShareIndicators = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId, segmentId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return array directly (SDK wraps in 'data' automatically)
        return [];
    } catch (error: any) {
        console.error("Error:", error);
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getGrowthIndicators (Section 3)
// ============================================================================

export const getGrowthIndicators = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return array directly (SDK wraps in 'data' automatically)
        return [];
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getPortfolioQuality (Section 4)
// ============================================================================

export const getPortfolioQuality = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId, segmentId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return array directly (SDK wraps in 'data' automatically)
        return [];
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getDefaultIndicators (Section 5)
// ============================================================================

export const getDefaultIndicators = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId, segmentId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return array directly (SDK wraps in 'data' automatically)
        return [];
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getContemplationIndicators (Section 6)
// ============================================================================

export const getContemplationIndicators = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId, segmentId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return object directly (SDK wraps in 'data' automatically)
        return {
            monthly: [],
            quarterly: []
        };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getGeographicIndicators (Section 7)
// ============================================================================

export const getGeographicIndicators = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId, segmentId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return array directly (SDK wraps in 'data' automatically)
        return [];
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getFinancialOperationalIndicators (Section 8 & 9)
// ============================================================================

export const getFinancialOperationalIndicators = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId, segmentId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return array directly (SDK wraps in 'data' automatically)
        return [];
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});


// ============================================================================
// FUNCTION: getBenchmarkingRanking (Section 10)
// ============================================================================

export const getBenchmarkingRanking = onCall({ region: 'us-central1' }, async (request) => {
    // @ts-ignore
    const { administratorId, segmentId } = request.data || {};
    if (!administratorId) throw new HttpsError('invalid-argument', 'administratorId required');

    try {
        // Return array directly (SDK wraps in 'data' automatically)
        return [];
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

