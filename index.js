const express = require("express");
const multer = require("multer");
const path = require("node:path");
const crypto = require("node:crypto");
const XLSX = require("xlsx");

// Importação e configuração do Supabase com a chave oficial
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gnltfvoizpewwlighuhp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdubHRmdm9penBld3dsaWdodWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MTAzMDIsImV4cCI6MjEwNzQ4NjMwMn0.fjjkNe_SgNzkTKLOkGRUYyzE29biOtFikixgHjTQhwc';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(express.json());

const sessions = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (request, file, callback) => {
    if (!/\.(csv|xlsx|xls)$/iu.test(file.originalname)) {
      callback(new Error("Envie um arquivo com extensão .csv, .xlsx ou .xls."));
      return;
    }

    callback(null, true);
  },
});

function formatName(value) {
  return value
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s-])(\p{L})/gu, (_, separator, letter) =>
      separator + letter.toLocaleUpperCase("pt-BR")
    );
}

function formatEmail(value) {
  const email = value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

  if (!emailPattern.test(email)) {
    throw new Error(`E-mail inválido: ${email}`);
  }

  return email;
}

function formatPhone(value) {
  let digits = value.replace(/\D/gu, "");

  if (digits.length === 13 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  if (digits.length !== 11) {
    throw new Error("Telefone inválido: informe o DDD e um celular com 9 dígitos.");
  }

  return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpf(value) {
  const digits = value.replace(/\D/gu, "");

  if (digits.length !== 11) {
    throw new Error("CPF inválido: informe 11 dígitos.");
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function detectCsvDelimiter(text) {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && text[index + 1] === '"' && inQuotes) {
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (character === "\r" || character === "\n")) {
      break;
    } else if (!inQuotes && character === ",") {
      commas += 1;
    } else if (!inQuotes && character === ";") {
      semicolons += 1;
    }
  }

  return semicolons > commas ? ";" : ",";
}

function parseCsv(text, delimiter) {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];

    if (inQuotes) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (character === '"') {
        inQuotes = false;
        quoteClosed = true;
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed && character !== delimiter && character !== "\r" && character !== "\n") {
      throw new Error("CSV inválido: conteúdo encontrado após o fechamento de aspas.");
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === delimiter) {
      record.push(field);
      field = "";
      quoteClosed = false;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      record.push(field);
      if (record.some((value) => value.length > 0)) {
        records.push(record);
      }
      record = [];
      field = "";
      quoteClosed = false;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("CSV inválido: campo entre aspas não foi fechado.");
  }

  if (field.length > 0 || record.length > 0 || quoteClosed) {
    record.push(field);
    if (record.some((value) => value.length > 0)) {
      records.push(record);
    }
  }

  return records;
}

function escapeCsv(value) {
  const text = String(value);
  return /[;"\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

const COLUMN_TYPES = new Map([
  ["nome", "name"],
  ["nomecompleto", "full-name"],
  ["cliente", "name"],
  ["primeironome", "first-name"],
  ["sobrenome", "last-name"],
  ["email", "email"],
  ["telefone", "phone"],
  ["celular", "phone"],
  ["whatsapp", "phone"],
  ["cpf", "cpf"],
  ["cnpj", "cnpj"],
  ["cpfcnpj", "cpf-cnpj"],
  ["cep", "zip"],
  ["rgie", "rg-ie"],
  ["rg", "rg-ie"],
  ["ie", "rg-ie"],
  ["inscricaoestadual", "rg-ie"],
  ["razaosocial", "company-name"],
  ["nomeempresa", "company-name"],
  ["empresa", "company-name"],
  ["endereco", "address"],
  ["logradouro", "address"],
  ["rua", "address"],
  ["avenida", "address"],
  ["estado", "state"],
  ["uf", "state"],
  ["valor", "money"],
  ["preco", "money"],
  ["total", "money"],
  ["moeda", "money"],
  ["salario", "money"],
  ["faturamento", "money"],
  ["data", "date"],
  ["datanascimento", "date"],
  ["datacadastro", "date"],
  ["datavencimento", "date"],
  ["datapagamento", "date"],
  ["createdat", "date"],
]);

function getColumnType(header) {
  const normalized = String(header ?? "")
    .replace(/^\uFEFF/u, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/gu, "");
  return COLUMN_TYPES.get(normalized);
}

const DEFAULT_OPTIONS = Object.freeze({
  formatPhones: true,
  validateEmails: true,
  formatCpfs: true,
  standardizeNames: true,
  removeDuplicates: true,
  formatCnpjs: true,
  standardizeDates: true,
  formatZips: true,
  separateNameSurname: true,
  correctEmailDomains: true,
  addWhatsappNinthDigit: true,
  cleanRgIe: true,
  simplifyCompanyName: true,
  standardizeAddresses: true,
  convertStateToUf: true,
  convertCurrency: true,
});

function getProcessingOptions(body) {
  if (body.optionsSubmitted !== "1") {
    return { ...DEFAULT_OPTIONS };
  }

  const selected = Array.isArray(body.options)
    ? body.options
    : body.options ? [body.options] : [];

  return {
    formatPhones: selected.includes("formatPhones"),
    validateEmails: selected.includes("validateEmails"),
    formatCpfs: selected.includes("formatCpfs"),
    standardizeNames: selected.includes("standardizeNames"),
    removeDuplicates: selected.includes("removeDuplicates"),
    formatCnpjs: selected.includes("formatCnpjs"),
    standardizeDates: selected.includes("standardizeDates"),
    formatZips: selected.includes("formatZips"),
    separateNameSurname: selected.includes("separateNameSurname"),
    correctEmailDomains: selected.includes("correctEmailDomains"),
    addWhatsappNinthDigit: selected.includes("addWhatsappNinthDigit"),
    cleanRgIe: selected.includes("cleanRgIe"),
    simplifyCompanyName: selected.includes("simplifyCompanyName"),
    standardizeAddresses: selected.includes("standardizeAddresses"),
    convertStateToUf: selected.includes("convertStateToUf"),
    convertCurrency: selected.includes("convertCurrency"),
  };
}

function cleanCell(value, columnType, options) {
  if (value === null || value === undefined || value === "") {
    return value ?? "";
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }

  if (
    (columnType === "name" || columnType === "full-name" ||
      columnType === "first-name" || columnType === "last-name") &&
    options.standardizeNames
  ) {
    return formatName(text);
  }
  return typeof value === "string" ? text : value;
}

function createReport() {
  return {
    totalRows: 0,
    validEmails: 0,
    validCpfs: 0,
    correctedValues: 0,
    removedDuplicates: 0,
    alerts: [],
  };
}

function formatCnpj(value) {
  const digits = value.replace(/\D/gu, "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatZip(value) {
  const digits = value.replace(/\D/gu, "").padStart(8, "0");
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function correctEmailDomain(value) {
  const match = value.match(/^([^@\s]+)@([^@\s]+)$/u);
  if (!match) {
    return value;
  }
  const corrections = new Map([
    ["gmai.com", "gmail.com"],
    ["gmial.com", "gmail.com"],
    ["gmal.com", "gmail.com"],
    ["hotnail.com", "hotmail.com"],
    ["hotmai.com", "hotmail.com"],
    ["yaho.com", "yahoo.com"],
    ["yahoo.con", "yahoo.com"],
    ["outlook.con", "outlook.com"],
  ]);
  const domain = match[2].toLocaleLowerCase("pt-BR");
  return corrections.has(domain) ? `${match[1]}@${corrections.get(domain)}` : value;
}

function simplifyCompanyName(value) {
  return value
    .replace(/\s*(?:,?\s+(?:ltda\.?|limitada|me|epp|mei))+\s*$/iu, "")
    .replace(/[\s,./-]+$/u, "")
    .trim();
}

function standardizeAddress(value) {
  const match = value.match(/^\s*(r\.?|rua|av\.?|avenida|al\.?|alameda|tv\.?|trav\.?|travessa)\b\.?\s*(.*)$/iu);
  if (!match) {
    return value;
  }
  const prefixes = new Map([
    ["r", "Rua"], ["rua", "Rua"],
    ["av", "Avenida"], ["avenida", "Avenida"],
    ["al", "Alameda"], ["alameda", "Alameda"],
    ["tv", "Travessa"], ["trav", "Travessa"], ["travessa", "Travessa"],
  ]);
  const key = match[1].replace(/\./gu, "").toLocaleLowerCase("pt-BR");
  return `${prefixes.get(key)} ${match[2].trim()}`.trim();
}

const BRAZILIAN_STATES = new Map([
  ["acre", "AC"], ["alagoas", "AL"], ["amapa", "AP"], ["amazonas", "AM"],
  ["bahia", "BA"], ["ceara", "CE"], ["distritofederal", "DF"], ["espiritosanto", "ES"],
  ["goias", "GO"], ["maranhao", "MA"], ["matogrosso", "MT"], ["matogrossodosul", "MS"],
  ["minasgerais", "MG"], ["para", "PA"], ["paraiba", "PB"], ["parana", "PR"],
  ["pernambuco", "PE"], ["piaui", "PI"], ["riodejaneiro", "RJ"], ["riograndedonorte", "RN"],
  ["riograndedosul", "RS"], ["rondonia", "RO"], ["roraima", "RR"], ["santacatarina", "SC"],
  ["saopaulo", "SP"], ["sergipe", "SE"], ["tocantins", "TO"],
]);

function stateToUf(value) {
  const normalized = value.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z]/gu, "");
  const uf = BRAZILIAN_STATES.get(normalized);
  return uf || (/^[a-z]{2}$/iu.test(value) ? value.toLocaleUpperCase("pt-BR") : value);
}

function parseCurrency(value) {
  const text = String(value).trim().replace(/[R$\s]/gu, "");
  if (!/^-?[\d.,]+$/u.test(text)) {
    return null;
  }
  const normalized = text.includes(",")
    ? text.replace(/\./gu, "").replace(",", ".")
    : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function formatDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  }

  const match = String(value).trim().match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/u);
  if (!match) {
    return null;
  }

  let day;
  let month;
  let year;
  if (match[1].length === 4) {
    [, year, month, day] = match;
  } else {
    [, day, month, year] = match;
  }
  if (year.length === 2) {
    year = Number(year) >= 50 ? `19${year}` : `20${year}`;
  }

  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function normalizeRow(row) {
  return JSON.stringify(row.map((value) =>
    typeof value === "string" ? value.trim().toLocaleLowerCase("pt-BR") : value
  ));
}

function processCell(value, columnType, header, rowNumber, report, options) {
  const cleaned = cleanCell(value, columnType, options);
  let text = String(value ?? "").trim();
  if (!text) {
    return cleaned;
  }

  const correctedEmail = options.correctEmailDomains &&
    (columnType === "email" || text.includes("@"))
    ? correctEmailDomain(text)
    : text;
  const emailWasCorrected = correctedEmail !== text;
  text = correctedEmail;
  const emailCandidate = (options.validateEmails || options.correctEmailDomains) &&
    (columnType === "email" || (!columnType && text.includes("@")));
  const digits = text.replace(/\D/gu, "");
  const phoneCandidate = (options.formatPhones || options.addWhatsappNinthDigit) &&
    (columnType === "phone" || (!columnType && (
      text.includes("(") ||
      text.startsWith("+55") ||
      /^\d{2}[-\s]\d{5}[-\s]?\d{4}$/u.test(text)
    )));
  const cpfCandidate = options.formatCpfs &&
    (columnType === "cpf" ||
      (columnType === "cpf-cnpj" && digits.length <= 11) ||
      (!columnType && !phoneCandidate && digits.length === 11));
  const cnpjCandidate = options.formatCnpjs &&
    (columnType === "cnpj" ||
      (columnType === "cpf-cnpj" && digits.length > 11) ||
      (!columnType && digits.length === 14));
  const zipCandidate = options.formatZips &&
    (columnType === "zip" || (!columnType && digits.length === 8));
  const dateCandidate = options.standardizeDates &&
    (columnType === "date" || (!columnType && (
      value instanceof Date || /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/u.test(text)
    )));
  const currencyCandidate = options.convertCurrency &&
    (columnType === "money" || (!columnType && /^(?:R\$\s*)?-?\d[\d.,]*$/u.test(text) && /[R$,]/u.test(text)));

  if (emailCandidate) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)) {
      if (options.validateEmails) {
        report.validEmails += 1;
      }
      return formatEmail(text);
    }

    if (options.validateEmails) {
      report.alerts.push({
        row: rowNumber,
        column: String(header || `Coluna ${report.alerts.length + 1}`),
        type: "email",
        message: "E-mail em formato inválido.",
      });
    }
    return cleaned;
  }

  if (phoneCandidate) {
    let phoneDigits = digits;
    if (
      options.addWhatsappNinthDigit &&
      phoneDigits.length === 10 &&
      /^[6-9]/u.test(phoneDigits.slice(2))
    ) {
      phoneDigits = `${phoneDigits.slice(0, 2)}9${phoneDigits.slice(2)}`;
    }
    if (phoneDigits.length === 11 || (phoneDigits.length === 13 && phoneDigits.startsWith("55"))) {
      return formatPhone(phoneDigits);
    }

    report.alerts.push({
      row: rowNumber,
      column: String(header || "Telefone"),
      type: "phone",
      message: "Telefone deve conter DDD e número com 11 dígitos (ou código +55).",
    });
    return cleaned;
  }

  if (cpfCandidate) {
    if (digits.length === 11) {
      report.validCpfs += 1;
      return formatCpf(text);
    }
    if (columnType === "cpf" || (columnType === "cpf-cnpj" && digits.length < 14)) {
      report.alerts.push({
        row: rowNumber,
        column: String(header || "CPF"),
        type: "cpf",
        message: "CPF deve conter 11 dígitos.",
      });
    }
  }

  if (cnpjCandidate) {
    if (digits.length === 14) {
      return formatCnpj(text);
    }
    report.alerts.push({
      row: rowNumber,
      column: String(header || "CNPJ"),
      type: "cnpj",
      message: "CNPJ deve conter 14 dígitos.",
    });
  }

  if (zipCandidate) {
    if (digits.length > 0 && digits.length <= 8) {
      return formatZip(digits);
    }
    report.alerts.push({
      row: rowNumber,
      column: String(header || "CEP"),
      type: "zip",
      message: "CEP deve conter 8 dígitos.",
    });
  }

  if (dateCandidate) {
    const formatted = formatDate(text);
    if (formatted) {
      return formatted;
    }
    report.alerts.push({
      row: rowNumber,
      column: String(header || "Data"),
      type: "date",
      message: "Data inválida ou em formato não reconhecido.",
    });
  }

  if (options.cleanRgIe && columnType === "rg-ie") {
    return text.toLocaleUpperCase("pt-BR").replace(/[^0-9A-Z]/gu, "");
  }
  if (options.simplifyCompanyName && columnType === "company-name") {
    return simplifyCompanyName(text);
  }
  if (options.standardizeAddresses && columnType === "address") {
    return standardizeAddress(text);
  }
  if (options.convertStateToUf && columnType === "state") {
    return stateToUf(text);
  }
  if (currencyCandidate) {
    const amount = parseCurrency(text);
    if (amount !== null) {
      return amount;
    }
    report.alerts.push({
      row: rowNumber,
      column: String(header || "Valor"),
      type: "money",
      message: "Valor monetário em formato inválido.",
    });
  }

  return emailWasCorrected ? correctedEmail : cleaned;
}

function cleanCsv(csvText, options) {
  const delimiter = detectCsvDelimiter(csvText);
  const { rows, report } = cleanRows(parseCsv(csvText, delimiter), options);
  const output = rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
  return { content: `\uFEFF${output}\n`, rows, report };
}

function cleanExcel(buffer, options) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("A planilha Excel não contém nenhuma aba.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet["!ref"]) {
    throw new Error("A primeira aba da planilha Excel está vazia.");
  }

  const records = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  const result = cleanRows(records, options);
  workbook.Sheets[firstSheetName] = XLSX.utils.aoa_to_sheet(result.rows);
  return { workbook, ...result };
}

function cleanRows(records, options) {
  if (!records.length || records.length === 1) {
    throw new Error("O arquivo precisa conter um cabeçalho e ao menos uma linha de dados.");
  }

  const [headers, ...rows] = records;
  const width = Math.max(headers.length, ...rows.map((row) => row.length));
  const originalHeaders = Array.from({ length: width }, (_, index) => headers[index] ?? "");
  if (typeof originalHeaders[0] === "string") {
    originalHeaders[0] = originalHeaders[0].replace(/^\uFEFF/u, "");
  }
  const columnTypes = originalHeaders.map(getColumnType);
  const fullNameIndex = columnTypes.indexOf("full-name");
  const nameIndex = columnTypes.findIndex((type) => type === "name" || type === "first-name");
  let surnameIndex = columnTypes.indexOf("last-name");
  let splitSourceIndex = -1;
  let splitFirstIndex = -1;

  if (options.separateNameSurname) {
    if (fullNameIndex !== -1) {
      splitSourceIndex = fullNameIndex;
      splitFirstIndex = nameIndex === -1 ? originalHeaders.length : nameIndex;
      if (nameIndex === -1) {
        originalHeaders.push("Nome");
        columnTypes.push("first-name");
      }
      if (surnameIndex === -1) {
        surnameIndex = originalHeaders.length;
        originalHeaders.push("Sobrenome");
        columnTypes.push("last-name");
      }
    } else if (nameIndex !== -1) {
      splitSourceIndex = nameIndex;
      splitFirstIndex = nameIndex;
      if (surnameIndex === -1) {
        surnameIndex = originalHeaders.length;
        originalHeaders.push("Sobrenome");
        columnTypes.push("last-name");
      }
    }
  }
  const outputWidth = originalHeaders.length;
  const report = createReport();
  const seenRows = new Set();

  const cleanedRows = rows.map((row, rowIndex) => {
    const hasData = row.some((value) => String(value ?? "").trim());
    if (!hasData) {
      return null;
    }

    const rowValues = Array.from({ length: outputWidth }, (_, columnIndex) => row[columnIndex] ?? "");
    if (splitSourceIndex !== -1) {
      const nameParts = String(row[splitSourceIndex] ?? "").trim().split(/\s+/u).filter(Boolean);
      if (nameParts.length > 1) {
        const firstName = nameParts.shift();
        const surname = nameParts.join(" ");
        const existingSurname = String(row[surnameIndex] ?? "").trim();
        rowValues[splitFirstIndex] = firstName;
        if (!existingSurname) {
          rowValues[surnameIndex] = surname;
        }
      }
    }

    const cleanedRow = Array.from({ length: outputWidth }, (_, columnIndex) => {
      const original = row[columnIndex] ?? "";
      const value = rowValues[columnIndex];
      const cleaned = processCell(
        value,
        columnTypes[columnIndex],
        originalHeaders[columnIndex],
        rowIndex + 2,
        report,
        options
      );
      if (cleaned !== original) {
        report.correctedValues += 1;
      }
      return cleaned;
    });
    report.totalRows += 1;

    const key = normalizeRow(cleanedRow);
    if (options.removeDuplicates && seenRows.has(key)) {
      report.removedDuplicates += 1;
      return null;
    }
    seenRows.add(key);
    return cleanedRow;
  });

  return { rows: [originalHeaders, ...cleanedRows.filter(Boolean)], report };
}

// ---------------------------------------------------------------------------
// ROTAS DA API (DEVEM VIR ANTES DOS ARQUIVOS ESTÁTICOS)
// ---------------------------------------------------------------------------

// Handler unificado para Cadastro (/register, /api/register e /api/signup)
const handleSignup = async (request, response) => {
  const { email, password } = request.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    response.status(400).json({ error: "Informe um e-mail e uma senha." });
    return;
  }

  const normalizedEmail = email.trim().toLocaleLowerCase("pt-BR");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) {
    response.status(400).json({ error: "E-mail inválido." });
    return;
  }

  if (password.length < 8) {
    response.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres." });
    return;
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .insert([{ email: normalizedEmail, password }]);

    if (error) {
      if (error.code === '23505') {
        response.status(409).json({ error: "Este e-mail já está cadastrado." });
        return;
      }
      response.status(400).json({ error: error.message });
      return;
    }

    response.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
  } catch (err) {
    response.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

app.post('/register', handleSignup);
app.post('/api/register', handleSignup);
app.post('/api/signup', handleSignup);

// Handler unificado para Login (/login e /api/login)
const handleLogin = async (request, response) => {
  const { email, password } = request.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    response.status(400).json({ error: "Informe um e-mail e uma senha." });
    return;
  }

  const normalizedEmail = email.trim().toLocaleLowerCase("pt-BR");

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('password', password)
      .single();

    if (error || !data) {
      response.status(401).json({ error: "E-mail ou senha inválidos." });
      return;
    }

    const accessToken = crypto.randomBytes(32).toString("hex");
    sessions.set(accessToken, data.id);

    response.json({
      accessToken,
      user: { id: data.id, email: data.email },
      message: 'Login bem-sucedido!'
    });
  } catch (err) {
    response.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

app.post('/login', handleLogin);
app.post('/api/login', handleLogin);

// Handler unificado para recuperação de senha (/forgot-password e /api/forgot-password)
const handleForgotPassword = async (request, response) => {
  const { email } = request.body ?? {};

  if (!email || typeof email !== "string") {
    return response.status(400).json({ error: "Informe um e-mail válido." });
  }

  const normalizedEmail = email.trim().toLocaleLowerCase("pt-BR");

  try {
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .eq('email', normalizedEmail)
      .single();

    if (error || !data) {
      return response.status(404).json({ message: 'E-mail não encontrado em nossa base.' });
    }

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();

    await supabase
      .from('users')
      .update({ reset_token: resetToken })
      .eq('email', normalizedEmail);

    return response.json({ 
      message: `Código de recuperação gerado com sucesso! Token: ${resetToken}` 
    });
  } catch (err) {
    return response.status(500).json({ error: 'Erro ao processar recuperação de senha.' });
  }
};

app.post('/forgot-password', handleForgotPassword);
app.post('/api/forgot-password', handleForgotPassword);

app.post("/upload", upload.single("arquivo"), (request, response, next) => {
  if (!request.file) {
    response.status(400).json({ error: "Selecione um arquivo CSV ou Excel para enviar." });
    return;
  }

  try {
    const extension = path.extname(request.file.originalname).toLocaleLowerCase("en-US");
    const options = getProcessingOptions(request.body);
    const outputFormat = request.body.outputFormat === "xlsx" ? "xlsx" : "csv";
    const result = extension === ".csv"
      ? cleanCsv(request.file.buffer.toString("utf8"), options)
      : cleanExcel(request.file.buffer, options);
    let output;
    let contentType;
    let outputName;

    if (outputFormat === "csv") {
      const rows = result.rows ?? XLSX.utils.sheet_to_json(
        result.workbook.Sheets[result.workbook.SheetNames[0]],
        { header: 1, raw: false, defval: "", blankrows: false }
      );
      output = Buffer.from(
        `\uFEFF${rows.map((row) => row.map(escapeCsv).join(";")).join("\n")}\n`,
        "utf8"
      );
      contentType = "text/csv; charset=utf-8";
      outputName = "dados_limpos.csv";
    } else {
      const workbook = result.workbook ?? XLSX.utils.book_new();
      if (!result.workbook) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(result.rows), "Dados");
      }
      output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      outputName = "dados_limpos.xlsx";
    }

    response.json({
      report: {
        ...result.report,
        options,
        alertCount: result.report.alerts.length,
      },
      file: {
        name: outputName,
        contentType,
        contentBase64: output.toString("base64"),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// ARQUIVOS ESTÁTICOS E INICIALIZAÇÃO
// ---------------------------------------------------------------------------

// Servir frontend por último para não interceptar as rotas da API
app.use(express.static(path.join(__dirname, "public")));

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const status = error instanceof multer.MulterError
    ? error.code === "LIMIT_FILE_SIZE" ? 413 : 400
    : error.status === 400 || error.status === 413
      ? error.status
      : error.message.startsWith("Envie um arquivo") ? 400 : 422;

  response.status(status).json({ error: error.message });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Limpador de dados disponível em http://localhost:${port}`);
  });
}

module.exports = app;