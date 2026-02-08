
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({ projectId: 'consorcio-intel-app' });
const DATASET_ID = 'consorcio_data';

async function checkTables() {
    console.log(`Checking tables in dataset: ${DATASET_ID}...`);
    try {
        const [tables] = await bigquery.dataset(DATASET_ID).getTables();
        const tableNames = tables.map(t => t.id);

        console.log('Found tables:', tableNames);

        const requiredTables = [
            'segmentos_consolidados',
            'base_segmentos',
            'bens_imoveis_grupos',
            'bens_moveis_grupos',
            'dados_trimestrais_uf'
        ];

        const missing = requiredTables.filter(t => !tableNames.includes(t));

        if (missing.length > 0) {
            console.error('❌ MISSING TABLES:', missing);
            console.log('Recommendation: Run "resetSystemData" from the Admin > File Control interface.');
        } else {
            console.log('✅ All required tables exist.');
        }
    } catch (error) {
        console.error('❌ Error checking tables:', error);
    }
}

checkTables();
