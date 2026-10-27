const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const Stripe = require('stripe');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// Configuração do Multer para receber ficheiros em memória
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Limites de payload ampliados para suportar planilhas grandes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicialização do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Inicialização do Resend e Stripe
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// Remetente oficial verificado em produção
const EMAIL_REMETENTE = process.env.RESEND_FROM_EMAIL || 'Dados em Ordem <contato@datacleanbr.com.br>';

// --- FUNÇÕES AUXILIARES DE VALIDAÇÃO E HIGIENIZAÇÃO ---

// 1. Correção e Validação de E-mails
function sanitizarEmail(emailStr) {
  if (!emailStr) return { email: '', valido: false, motivo: 'E-mail em falta' };
  let email = String(emailStr).trim().toLowerCase();

  const partes = email.split('@');
  if (partes.length !== 2 || !partes[0] || !partes[1]) {
    return { email, valido: false, motivo: 'E-mail com sintaxe inválida' };
  }
  if (partes[0].includes('..')) {
    return { email, valido: false, motivo: 'E-mail contém pontos duplicados (..)' };
  }

  const dominiosProibidos = ['mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com', 'throwawaymail.com'];
  if (dominiosProibidos.some(dom => partes[1] === dom)) {
    return { email, valido: false, motivo: 'E-mail descartável ou temporário bloqueado' };
  }

  let dominio = partes[1];
  const correcaoDominios = {
    'gmal.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmed.com': 'gmail.com',
    'hotmai.com': 'hotmail.com',
    'hotmial.com': 'hotmail.com',
    'yaho.com': 'yahoo.com',
    'yhoo.com': 'yahoo.com',
    'outlok.com': 'outlook.com'
  };
  if (correcaoDominios[dominio]) {
    dominio = correcaoDominios[dominio];
    email = `${partes[0]}@${dominio}`;
  }

  return { email, valido: true, motivo: '' };
}

// 2. Validação Matemática de CPF
function validarCPF(cpfStr) {
  const nums = String(cpfStr).replace(/\D/g, '').padStart(11, '0');
  if (nums.length !== 11 || /^(\d)\1{10}$/.test(nums)) return false;
  
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums.charAt(i)) * (10 - i);
  let resto = 11 - (soma % 11);
  let digito1 = (resto === 10 || resto === 11) ? 0 : resto;
  if (digito1 !== parseInt(nums.charAt(9))) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums.charAt(i)) * (11 - i);
  resto = 11 - (soma % 11);
  let digito2 = (resto === 10 || resto === 11) ? 0 : resto;
  return digito2 === parseInt(nums.charAt(10));
}

// Validação Matemática de CNPJ
function validarCNPJ(cnpjStr) {
  const nums = String(cnpjStr).replace(/\D/g, '').padStart(14, '0');
  if (nums.length !== 14 || /^(\d)\1{13}$/.test(nums)) return false;

  let tamanho = nums.length - 2;
  let numeros = nums.substring(0, tamanho);
  let digitos = nums.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) return false;

  tamanho = tamanho + 1;
  numeros = nums.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(digitos.charAt(1));
}

// 3. Normalização de Telefones (E.164 / +55 com 9º dígito)
function normalizarTelefone(telStr) {
  if (!telStr) return { telefone: '', valido: false };
  let nums = String(telStr).replace(/\D/g, '');

  if (nums.startsWith('5555') && nums.length > 12) {
    nums = nums.slice(2);
  }
  if (nums.startsWith('55') && nums.length >= 12) {
    nums = nums.slice(2);
  }

  if (nums.length === 10) {
    const ddd = nums.slice(0, 2);
    const resto = nums.slice(2);
    if (/^[6-9]/.test(resto)) {
      nums = `${ddd}9${resto}`;
    }
  }

  if (nums.length >= 10) {
    return { telefone: `+55${nums}`, valido: true };
  }
  return { telefone: telStr, valido: false };
}

// 4. Capitalização Inteligente (Title Case) e Remoção de Ruídos
function sanitizarNome(nomeStr) {
  if (!nomeStr) return '';
  let limpo = String(nomeStr)
    .replace(/(?:dr\.?|sr\.?|sra\.?|cpf:?|cnpj:?)/gi, '')
    .replace(/[0-9]/g, '')
    .trim();

  const minúsculas = ['da', 'de', 'do', 'dos', 'das', 'e'];
  const palavras = limpo.toLowerCase().split(/\s+/);
  
  const formatadas = palavras.map((palavra, index) => {
    if (index > 0 && minúsculas.includes(palavra)) {
      return palavra;
    }
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  });

  return formatadas.join(' ');
}

// 5. Formatação de CEP
function formatarCEP(cepStr) {
  const nums = String(cepStr || '').replace(/\D/g, '').padStart(8, '0');
  if (nums.length === 8) {
    return `${nums.slice(0, 5)}-${nums.slice(5)}`;
  }
  return cepStr;
}

// 6. Nome Fantasia (Simplificação de Razão Social B2B)
function converterNomeFantasia(razaoSocial) {
  if (!razaoSocial) return '';
  let nome = String(razaoSocial)
    .replace(/(?:s\.?a\.?|ltda\.?|me\.?|epp\.?|ltda|s\/a|e\.? i\.?)/gi, '')
    .trim();
  return sanitizarNome(nome);
}

// 7. Padronização de Género
function padronizarGenero(val) {
  if (!val) return '';
  const v = String(val).trim().toLowerCase();
  if (v.startsWith('m') || v === 'masc' || v === '1') return 'Masculino';
  if (v.startsWith('f') || v === 'fem' || v === '2') return 'Feminino';
  return 'Outro / Não Informado';
}

// --- ROTAS DA API ---

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    res.json({ message: 'Cadastro realizado com sucesso!', user: data.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    res.json({ accessToken: data.session.access_token, user: data.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- ROTA DE LIMPEZA E PADRONIZAÇÃO DE PLANILHAS (COM TODAS AS REGRAS) ---
app.post('/api/limpar-dados', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum ficheiro foi enviado.' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    let totalCorrigidos = 0;
    let totalAlertas = 0;
    const alertasDetalhes = [];

    const rowsTratadas = rows.map((row, index) => {
      let motivoAlerta = '';
      const keys = Object.keys(row);
      
      let nomeVal = '';
      let emailVal = '';
      let telVal = '';
      let dataNascVal = '';
      let dataCadVal = '';

      keys.forEach(key => {
        const lowerKey = key.toLowerCase();
        let val = String(row[key] || '').trim();

        // Nomes Próprios
        if (lowerKey.includes('nome') && !lowerKey.includes('fantasia') && !lowerKey.includes('empresa') && !lowerKey.includes('razao')) {
          const nomeTratado = sanitizarNome(val);
          if (nomeTratado !== val) {
            row[key] = nomeTratado;
            totalCorrigidos++;
          }
          nomeVal = nomeTratado;
        }

        // Nome Fantasia / Razão Social B2B
        if (lowerKey.includes('fantasia') || lowerKey.includes('empresa') || lowerKey.includes('razao')) {
          const fantasia = converterNomeFantasia(val);
          if (fantasia && fantasia !== val) {
            row[key] = fantasia;
            totalCorrigidos++;
          }
        }

        // E-mails
        if (lowerKey.includes('email') || lowerKey.includes('e-mail')) {
          const resEmail = sanitizarEmail(val);
          row[key] = resEmail.email;
          emailVal = resEmail.email;
          if (!resEmail.valido) {
            motivoAlerta = resEmail.motivo;
          }
        }

        // Telefones
        if (lowerKey.includes('tel') || lowerKey.includes('cel') || lowerKey.includes('whatsapp')) {
          const resTel = normalizarTelefone(val);
          row[key] = resTel.telefone;
          telVal = resTel.telefone;
          if (!resTel.valido) {
            if (!motivoAlerta) motivoAlerta = 'Telefone inválido ou incompleto';
          } else {
            totalCorrigidos++;
          }
        }

        // CPF / CNPJ
        if (lowerKey.includes('cpf') || lowerKey.includes('cnpj')) {
          const limpo = val.replace(/\D/g, '');
          if (limpo.length > 0 && limpo.length <= 11) {
            const cpfFormatado = limpo.padStart(11, '0');
            row[key] = cpfFormatado;
            if (!validarCPF(cpfFormatado)) {
              motivoAlerta = 'CPF matematicamente inválido ou sequência repetida';
            }
          } else if (limpo.length > 11) {
            const cnpjFormatado = limpo.padStart(14, '0');
            row[key] = cnpjFormatado;
            if (!validarCNPJ(cnpjFormatado)) {
              motivoAlerta = 'CNPJ matematicamente inválido';
            }
          } else {
            if (!motivoAlerta) motivoAlerta = 'Documento CPF/CNPJ em falta';
          }
        }

        // CEP
        if (lowerKey.includes('cep')) {
          const cepF = formatarCEP(val);
          if (cepF !== val) {
            row[key] = cepF;
            totalCorrigidos++;
          }
        }

        // Género / Sexo
        if (lowerKey.includes('genero') || lowerKey.includes('sexo')) {
          const genF = padronizarGenero(val);
          if (genF && genF !== val) {
            row[key] = genF;
            totalCorrigidos++;
          }
        }

        // Datas (Nascimento vs Cadastro)
        if (lowerKey.includes('nasc') || lowerKey.includes('nascimento')) {
          dataNascVal = val;
        }
        if (lowerKey.includes('cadastro') || lowerKey.includes('criacao') || lowerKey.includes('registro')) {
          dataCadVal = val;
        }
      });

      // Validação: Data de nascimento não pode ser igual à data de cadastro
      if (dataNascVal && dataCadVal && dataNascVal === dataCadVal) {
        motivoAlerta = 'Data de nascimento igual à data de cadastro';
      }

      if (motivoAlerta) {
        totalAlertas++;
        alertasDetalhes.push({
          linha: index + 2,
          nome: nomeVal || 'Registo ' + (index + 1),
          emailOriginal: emailVal,
          telefone: telVal,
          motivo: motivoAlerta
        });
      }

      return row;
    });

    const novaFolha = XLSX.utils.json_to_sheet(rowsTratadas);
    const novoWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(novoWorkbook, novaFolha, 'Dados Limpos');

    const bufferOut = XLSX.write(novoWorkbook, { type: 'buffer', bookType: 'xlsx' });
    const arquivoBase64 = bufferOut.toString('base64');

    const nomeOriginal = req.file.originalname.replace(/\.[^/.]+$/, '');
    const nomeArquivo = `${nomeOriginal}_limpo.xlsx`;

    return res.status(200).json({
      sucesso: true,
      totalRecebido: rows.length,
      totalProcessado: rows.length,
      totalCorrigidos,
      totalAlertas,
      alertasDetalhes,
      arquivoBase64,
      nomeArquivo,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

  } catch (err) {
    console.error("ERRO NO PROCESSAMENTO DA PLANILHA:", err);
    return res.status(500).json({ error: 'Erro ao processar o ficheiro: ' + err.message });
  }
});

// --- ROTA DE NOTIFICAÇÃO INDIVIDUAL POR E-MAIL (RESEND) ---
app.post('/api/notificar-erro', async (req, res) => {
  try {
    const { nome, emailOriginal, motivoRevisao } = req.body;

    const resEmail = sanitizarEmail(emailOriginal);
    if (!resEmail.valido) {
      return res.status(400).json({ error: 'E-mail inválido ou descartável para envio.' });
    }

    const data = await resend.emails.send({
      from: EMAIL_REMETENTE,
      to: [resEmail.email],
      subject: 'Atenção: Necessária atualização de cadastro - Dados em Ordem',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <h2 style="color: #4f46e5;">Olá, ${nome || 'Cliente'}!</h2>
          <p>Identificamos uma inconsistência ou dado pendente no seu registo durante o nosso processo de validação:</p>
          <blockquote style="background: #f3f4f6; padding: 12px; border-left: 4px solid #4f46e5; margin: 15px 0;">
            <strong>Motivo da revisão:</strong> ${motivoRevisao}
          </blockquote>
          <p>Para mantermos a sua base limpa e atualizada, por favor, atualize as suas informações connosco.</p>
          <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">
            Mensagem automática enviada pela plataforma <strong>Dados em Ordem</strong>.<br>
            <a href="https://www.datacleanbr.com.br" style="color: #4f46e5;">www.datacleanbr.com.br</a>
          </p>
        </div>
      `,
    });

    return res.status(200).json({
      sucesso: true,
      mensagem: "E-mail de notificação enviado com sucesso!",
      detalhesResend: data
    });

  } catch (err) {
    console.error("ERRO NO RESEND (Individual):", err);
    return res.status(500).json({ error: err.message || "Erro ao enviar e-mail." });
  }
});

// --- ROTA DE NOTIFICAÇÃO EM MASSA (LOTE) ---
app.post('/api/notificar-massa', async (req, res) => {
  try {
    const { alertasDetalhes } = req.body;

    if (!Array.isArray(alertasDetalhes) || alertasDetalhes.length === 0) {
      return res.status(400).json({ error: 'Nenhum contacto fornecido para o lote.' });
    }

    const lote = alertasDetalhes.slice(0, 50);
    let enviados = 0;

    for (const item of lote) {
      const resEmail = sanitizarEmail(item.emailOriginal);
      if (resEmail.valido) {
        try {
          await resend.emails.send({
            from: EMAIL_REMETENTE,
            to: [resEmail.email],
            subject: 'Atenção: Necessária atualização de cadastro',
            html: `<p>Olá ${item.nome || 'Cliente'}, identificamos uma divergência em seu cadastro: <strong>${item.motivo}</strong>.</p>`
          });
          enviados++;
        } catch (e) {
          console.error(`Falha ao enviar lote para ${resEmail.email}:`, e.message);
        }
      }
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: `Lote processado com sucesso! ${enviados} e-mails enviados.`
    });

  } catch (err) {
    console.error("ERRO NO RESEND (Massa):", err);
    return res.status(500).json({ error: err.message || "Erro no disparo em massa." });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  const { planType } = req.body;
  
  let priceId = 'price_1USIoeLKYNLZDtjchvAULrXC';
  let mode = 'subscription';

  if (planType === 'business') {
    priceId = 'price_1USIprLKYNLZDtjci5T3OPZt';
    mode = 'subscription';
  } else if (planType === 'credits') {
    priceId = 'price_1USMdpLKYNLZDtjc1Of1xKYM';
    mode = 'payment'; 
  }

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode,
      success_url: `${req.protocol}://${req.get('host')}?success=true`,
      cancel_url: `${req.protocol}://${req.get('host')}?canceled=true`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("ERRO DO STRIPE:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Porta para ambiente local
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor a correr em http://localhost:${PORT}`);
});