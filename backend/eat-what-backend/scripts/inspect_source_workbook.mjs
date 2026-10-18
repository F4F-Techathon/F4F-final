import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = process.argv[2];
if (!source) {
  throw new Error("usage: node inspect_source_workbook.mjs <workbook.xlsx>");
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheetNames = [];
for (let i = 0; i < workbook.worksheets.items.length; i += 1) {
  sheetNames.push(workbook.worksheets.getItemAt(i).name);
}

const output = { sheets: {} };
for (const name of sheetNames) {
  const sheet = workbook.worksheets.getItem(name);
  const used = sheet.getUsedRange(true);
  output.sheets[name] = used ? used.values : [];
}
process.stdout.write(JSON.stringify(output, null, 2));
