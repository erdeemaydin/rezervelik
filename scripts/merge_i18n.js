const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../frontend/src/i18n/locales');
const enPath = path.join(localesDir, 'en.json');
const trPath = path.join(localesDir, 'tr.json');

const enData = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
const trData = JSON.parse(fs.readFileSync(trPath, 'utf-8'));

const files = fs.readdirSync(localesDir);
const tempFiles = files.filter(f => f.startsWith('temp_') && f.endsWith('.json'));

let merged = 0;

for (const file of tempFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
    
    // Merge EN
    if (data.en) {
      Object.assign(enData, data.en);
    }
    
    // Merge TR
    if (data.tr) {
      Object.assign(trData, data.tr);
    }

    // Delete temp file
    fs.unlinkSync(path.join(localesDir, file));
    merged++;
    console.log(`Merged and deleted ${file}`);
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
  }
}

fs.writeFileSync(enPath, JSON.stringify(enData, null, 2));
fs.writeFileSync(trPath, JSON.stringify(trData, null, 2));

console.log(`Successfully merged ${merged} files into en.json and tr.json.`);
