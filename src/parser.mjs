import path from "node:path";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { PDFParse } from "pdf-parse";

const supported = new Set([".docx", ".pdf", ".xlsx", ".csv", ".txt", ".md"]);

function tidy(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 500_000);
}

async function parsePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];
  for (const worksheet of workbook.worksheets) {
    const rows = [];
    worksheet.eachRow((row) => {
      rows.push(row.values.slice(1).map((value) => typeof value === "object" ? (value.text || value.result || JSON.stringify(value)) : value).join("; "));
    });
    sheets.push(`Лист: ${worksheet.name}\n${rows.join("\n")}`);
  }
  return sheets.join("\n\n");
}

export async function parseDocument(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!supported.has(extension)) {
    const error = new Error(`Формат ${extension || "без расширения"} не поддерживается`);
    error.status = 415;
    throw error;
  }

  let rawText = "";
  if (extension === ".docx") {
    rawText = (await mammoth.extractRawText({ buffer: file.buffer })).value;
  } else if (extension === ".pdf") {
    rawText = await parsePdf(file.buffer);
  } else if (extension === ".xlsx") {
    rawText = await parseWorkbook(file.buffer);
  } else {
    rawText = file.buffer.toString("utf8");
  }

  const text = tidy(rawText);
  if (text.length < 30) {
    const error = new Error(`Не удалось извлечь текст из файла «${file.originalname}»`);
    error.status = 422;
    throw error;
  }

  return {
    name: file.originalname,
    extension,
    size: file.size,
    text,
    characters: text.length
  };
}
