const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const Stripe = require('stripe');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// Configuração do Multer para receber ficheiros em memória (sem gravar em disco)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Inicialização do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Inicialização segura do Resend e Stripe
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// Remetente padrão de infraestrutura de produção
const EMAIL_REMETENTE = process.env.RESEND_FROM_EMAIL || 'Dados em Ordem <contato@datacleanbr.com.br>';

// --- ROTA DE WEBHOOK DO STRIPE (PRECISA FICAR ANTES DO EXPRESS.JSON) ---
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (endpointSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error(`⚠️ Erro na assinatura do Webhook Stripe: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email || session.customer_email;
    const paymentStatus = session.payment_status;

    console.log(`💰 Pagamento recebido do Stripe para o email: ${customerEmail}`);

    if (paymentStatus === 'paid' && customerEmail) {
      try {
        const { data: users, error: userErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', customerEmail);

        if (users && users.length > 0) {
          const userId = users[0].id;

          await supabase
            .from('profiles')
            .update({
              plan_type: 'pro',
              updated_at: new Date()
            })
            .eq('id', userId);

          console.log(`✅ Plano PRO ativado com sucesso para: ${customerEmail}`);
        } else {
          console.warn(`⚠️ Perfil não encontrado no Supabase para o e-mail: ${customerEmail}`);
        }
      } catch (dbErr) {
        console.error('Erro ao atualizar plano via Webhook no Supabase:', dbErr.message);
      }
    }
  }

  res.json({ received: true });
});

// Middleware JSON e estático
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- FUNÇÕES AUXILIARES DE LIMPEZA DE DADOS ---
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

function normalizarTelefone(telStr) {
  if (!telStr) return { telefone: '', valido: false };
  let nums = String(telStr).replace(/\D/g, '');

  if (nums.startsWith('5555') && nums.length > 12) nums = nums.slice(2);
  if (nums.startsWith('55') && nums.length >= 12) nums = nums.slice(2);

  if (nums.length === 10) {
    const ddd = nums.slice(0, 2);
    const resto = nums.slice(2);
    if (/^[6-9]/.test(resto)) nums = `${ddd}9${resto}`;
  }

  if (nums.length >= 10) return { telefone: `+55${nums}`, valido: true };
  return { telefone: telStr, valido: false };
}

function sanitizarNome(nomeStr) {
  if (!nomeStr) return '';
  let limpo = String(nomeStr)
    .replace(/(?:dr\.?|sr\.?|sra\.?|cpf:?|cnpj:?)/gi, '')
    .replace(/[0-9]/g, '')
    .trim();

  const minúsculas = ['da', 'de', 'do', 'dos', 'das', 'e'];
  const palavras = limpo.toLowerCase().split(/\s+/);
  
  const formatadas = palavras.map((palavra, index) => {
    if (index > 0 && minúsculas.includes(palavra)) return palavra;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  });

  return formatadas.join(' ');
}

function formatarCEP(cepStr) {
  const nums = String(cepStr || '').replace(/\D/g, '').padStart(8, '0');
  if (nums.length === 8) return `${nums.slice(0, 5)}-${nums.slice(5)}`;
  return cepStr;
}

function converterNomeFantasia(razaoSocial) {
  if (!razaoSocial) return '';
  let nome = String(razaoSocial)
    .replace(/(?:s\.?a\.?|ltda\.?|me\.?|epp\.?|ltda|s\/a|e\.? i\.?)/gi, '')
    .trim();
  return sanitizarNome(nome);
}

function padronizarGenero(val) {
  if (!val) return '';
  const v = String(val).trim().toLowerCase();
  if (v.startsWith('m') || v === 'masc' || v === '1') return 'Masculino';
  if (v.startsWith('f') || v === 'fem' || v === '2') return 'Feminino';
  return 'Outro / Não Informado';
}

// --- ROTAS DA API ---

app.post('/api/register', async (req, res) => {
  const { email, password, companyName } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email: data.user.email,
        company_name: companyName || 'Minha Empresa',
        plan_type: 'free',
        credits: 0
      });
    }

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

app.post('/api/limpar-dados', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro foi enviado.' });

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

        if (lowerKey.includes('nome') && !lowerKey.includes('fantasia') && !lowerKey.includes('empresa') && !lowerKey.includes('razao')) {
          const nomeTratado = sanitizarNome(val);
          if (nomeTratado !== val) { row[key] = nomeTratado; totalCorrigidos++; }
          nomeVal = nomeTratado;
        }

        if (lowerKey.includes('fantasia') || lowerKey.includes('empresa') || lowerKey.includes('razao')) {
          const fantasia = converterNomeFantasia(val);
          if (fantasia && fantasia !== val) { row[key] = fantasia; totalCorrigidos++; }
        }

        if (lowerKey.includes('email') || lowerKey.includes('e-mail')) {
          const resEmail = sanitizarEmail(val);
          row[key] = resEmail.email;
          emailVal = resEmail.email;
          if (!resEmail.valido) motivoAlerta = resEmail.motivo;
        }

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

        if (lowerKey.includes('cpf') || lowerKey.includes('cnpj')) {
          const limpo = val.replace(/\D/g, '');
          if (limpo.length > 0 && limpo.length <= 11) {
            const cpfFormatado = limpo.padStart(11, '0');
            row[key] = cpfFormatado;
            if (!validarCPF(cpfFormatado)) motivoAlerta = 'CPF matematicamente inválido ou sequência repetida';
          } else if (limpo.length > 11) {
            const cnpjFormatado = limpo.padStart(14, '0');
            row[key] = cnpjFormatado;
            if (!validarCNPJ(cnpjFormatado)) motivoAlerta = 'CNPJ matematicamente inválido';
          } else {
            if (!motivoAlerta) motivoAlerta = 'Documento CPF/CNPJ em falta';
          }
        }

        if (lowerKey.includes('cep')) {
          const cepF = formatarCEP(val);
          if (cepF !== val) { row[key] = cepF; totalCorrigidos++; }
        }

        if (lowerKey.includes('genero') || lowerKey.includes('sexo')) {
          const genF = padronizarGenero(val);
          if (genF && genF !== val) { row[key] = genF; totalCorrigidos++; }
        }

        if (lowerKey.includes('nasc') || lowerKey.includes('nascimento')) dataNascVal = val;
        if (lowerKey.includes('cadastro') || lowerKey.includes('criacao') || lowerKey.includes('registro')) dataCadVal = val;
      });

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

    return res.status(200).json({
      sucesso: true,
      totalRecebido: rows.length,
      totalProcessado: rows.length,
      totalCorrigidos,
      totalAlertas,
      alertasDetalhes,
      arquivoBase64,
      nomeArquivo: `${nomeOriginal}_limpo.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

  } catch (err) {
    console.error("ERRO NO PROCESSAMENTO:", err);
    return res.status(500).json({ error: 'Erro ao processar o ficheiro: ' + err.message });
  }
});

// --- ROTA DE NOTIFICAÇÃO INDIVIDUAL COM REPLY-TO PARA O EMAIL DO CLIENTE ---
app.post('/api/notificar-erro', async (req, res) => {
  try {
    const { nome, emailOriginal, motivoRevisao, userId } = req.body;

    const resEmail = sanitizarEmail(emailOriginal);
    if (!resEmail.valido) {
      return res.status(400).json({ error: 'E-mail inválido ou descartável para envio.' });
    }

    let nomeRemetente = 'Equipa de Atendimento';
    let emailReplyTo = 'contato@datacleanbr.com.br';

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name, sender_name, email')
        .eq('id', userId)
        .single();
      
      if (profile) {
        if (profile.company_name) nomeRemetente = profile.company_name;
        if (profile.sender_name) nomeRemetente = `${profile.sender_name} (${profile.company_name})`;
        if (profile.email) emailReplyTo = profile.email; // Resposta vai direto para o cliente
      }
    }

    const remetenteFormatado = `${nomeRemetente} <contato@datacleanbr.com.br>`;

    const data = await resend.emails.send({
      from: remetenteFormatado,
      replyTo: emailReplyTo, // <--- Configurado para responder diretamente ao utilizador
      to: [resEmail.email],
      subject: `Atenção: Necessária atualização de cadastro - ${nomeRemetente}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <h2 style="color: #4f46e5;">Olá, ${nome || 'Cliente'}!</h2>
          <p>Identificamos uma inconsistência ou dado pendente no seu registo junto a <strong>${nomeRemetente}</strong>:</p>
          <blockquote style="background: #f3f4f6; padding: 12px; border-left: 4px solid #4f46e5; margin: 15px 0;">
            <strong>Motivo da revisão:</strong> ${motivoRevisao}
          </blockquote>
          <p>Para mantermos a sua base limpa e atualizada, por favor, atualize as suas informações connosco.</p>
          <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">
            Mensagem enviada por <strong>${nomeRemetente}</strong> através da plataforma de gestão de dados.<br>
          </p>
        </div>
      `,
    });

    return res.status(200).json({
      sucesso: true,
      mensagem: "E-mail de notificação personalizado enviado com sucesso!",
      detalhesResend: data
    });

  } catch (err) {
    console.error("ERRO NO RESEND (Individual):", err);
    return res.status(500).json({ error: err.message || "Erro ao enviar e-mail." });
  }
});

// --- ROTA DE NOTIFICAÇÃO EM MASSA COM REPLY-TO PARA O EMAIL DO CLIENTE ---
app.post('/api/notificar-massa', async (req, res) => {
  try {
    const { alertasDetalhes, userId } = req.body;

    if (!Array.isArray(alertasDetalhes) || alertasDetalhes.length === 0) {
      return res.status(400).json({ error: 'Nenhum contacto fornecido para o lote.' });
    }

    let nomeRemetente = 'Equipa de Atendimento';
    let emailReplyTo = 'contato@datacleanbr.com.br';

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name, sender_name, email')
        .eq('id', userId)
        .single();
      
      if (profile) {
        if (profile.company_name) nomeRemetente = profile.company_name;
        if (profile.sender_name) nomeRemetente = `${profile.sender_name} (${profile.company_name})`;
        if (profile.email) emailReplyTo = profile.email; // Resposta vai direto para o cliente
      }
    }

    const remetenteFormatado = `${nomeRemetente} <contato@datacleanbr.com.br>`;
    const lote = alertasDetalhes.slice(0, 50);
    let enviados = 0;

    for (const item of lote) {
      const resEmail = sanitizarEmail(item.emailOriginal);
      if (resEmail.valido) {
        try {
          await resend.emails.send({
            from: remetenteFormatado,
            replyTo: emailReplyTo, // <--- Configurado para responder diretamente ao utilizador
            to: [resEmail.email],
            subject: `Atualização de cadastro necessária - ${nomeRemetente}`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; padding: 16px;">
                <p>Olá <strong>${item.nome || 'Cliente'}</strong>,</p>
                <p>Identificamos uma divergência no seu registo com <strong>${nomeRemetente}</strong>:</p>
                <p style="background: #f3f4f6; padding: 10px; border-left: 3px solid #4f46e5;">${item.motivo}</p>
                <p>Por favor, entre em contacto para regularizar.</p>
              </div>
            `
          });
          enviados++;
        } catch (e) {
          console.error(`Falha ao enviar para ${resEmail.email}:`, e.message);
        }
      }
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: `Lote processado com sucesso! ${enviados} e-mails enviados em nome de ${nomeRemetente}.`
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor a correr em http://localhost:${PORT}`);
});