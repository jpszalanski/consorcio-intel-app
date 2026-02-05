
const normalizeKey = (str: string) => {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
};

const testDetection = (fileName: string) => {
    const nameNorm = normalizeKey(fileName);
    let importType = 'UNKNOWN';

    // Classification Logic matches functions/src/index.ts
    if (nameNorm.includes('imoveis')) importType = 'real_estate';
    else if (nameNorm.includes('moveis')) importType = 'movables';
    else if (nameNorm.includes('segmentos')) importType = 'segments';
    else if (nameNorm.includes('dadosporuf') || nameNorm.includes('consorciosuf') || (nameNorm.includes('uf') && !nameNorm.includes('imoveis') && !nameNorm.includes('moveis'))) importType = 'regional_uf';
    else if (nameNorm.includes('administradoras') || nameNorm.includes('doc4010') || nameNorm.includes('admconsorcio') || fileName.toUpperCase().includes('ADMCONSORCIO')) importType = 'administrators';

    console.log(`File: ${fileName}`);
    console.log(`Normalized: ${nameNorm}`);
    console.log(`Detected Type: ${importType}`);
    console.log('---');
};

testDetection('202512ADMCONSORCIO.xlsx');
testDetection('202512_SEGMENTOS.csv');
testDetection('202512_Imoveis.csv');
testDetection('doc4010_test.xlsx');
