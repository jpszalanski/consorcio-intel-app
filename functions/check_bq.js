const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

async function check() {
    try {
        const [datasets] = await bigquery.getDatasets();
        console.log('Datasets found:');
        for (const dataset of datasets) {
            const [meta] = await dataset.getMetadata();
            console.log(`- ID: ${dataset.id}, Location: ${meta.location}`);
        }
    } catch (e) {
        console.error('Error listing datasets:', e);
    }
}

check();
