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
  limits: { fileSize: 50 * 1024 * 1024 } // Limite de 50MB
});

// Aumento de limite de payload para suportar requisições
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicialização correta do Supabase via Variáveis de Ambiente
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Inicialização segura do Resend e Stripe com variáveis de ambiente
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// Remetente oficial de produção com o domínio verificado datacleanbr.com.br
const EMAIL_REMETENTE = process.env.RESEND_FROM_EMAIL || 'Dados em Ordem <contato@datacleanbr.com.br>';

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

// --- ROTA DE LIMPEZA E PADRONIZAÇÃO DE PLANILHAS ---
app.post('/api/limpar-dados', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum ficheiro foi enviado.' });
    }

    // Lê o ficheiro Excel/CSV recebido em memória
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Converte a folha para JSON (linhas da tabela)
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    let totalCorrigidos = 0;
    let totalAlertas = 0;
    const alertasDetalhes = [];

    // Lógica básica de higienização de colunas comuns (Nome, E-mail, Telefone, CPF)
    const rowsTratadas = rows.map((row, index) => {
      let linhaModificada = false;
      let motivoAlerta = '';

      // Tenta detetar campos de nome, e-mail e telefone de forma inteligente
      const keys = Object.keys(row);
      
      keys.forEach(key => {
        const lowerKey = key.toLowerCase();
        let val = String(row[key] || '').trim();

        // Padronização de Nomes (Capitalização básica)
        if (lowerKey.includes('nome') && val) {
          const nomeFormatado = val.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
          if (nomeFormatado !== val) {
            row[key] = nomeFormatado;
            totalCorrigidos++;
            linhaModificada = true;
          }
        }

        // Validação e correção de E-mails
        if ((lowerKey.includes('email') || lowerKey.includes('e-mail')) && val) {
          val = val.toLowerCase();
          if (!val.includes('@') || val.includes('mailinator')) {
            totalAlertas++;
            motivoAlerta = 'E-mail inválido ou descartável';
          }
          row[key] = val;
        }

        // Formatação de Telefones / WhatsApp (+55)
        if ((lowerKey.includes('tel') || lowerKey.includes('cel') || lowerKey.includes('whatsapp')) && val) {
          const nums = val.replace(/\D/g, '');
          if (nums.length >= 10) {
            const formatado = `+55 (${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7, 11)}`;
            if (formatado !== val) {
              row[key] = formatado;
              totalCorrigidos++;
            }
          }
        }
      });

      if (motivoAlerta) {
        alertasDetalhes.push({
          linha: index + 2,
          nome: row['Nome'] || row['nome'] || 'Registo ' + (index + 1),
          emailOriginal: row['Email'] || row['email'] || row['E-mail'] || '',
          telefone: row['Telefone'] || row['telefone'] || row['Celular'] || '',
          motivo: motivoAlerta
        });
      }

      return row;
    });

    // Cria uma nova folha e workbook com os dados limpos
    const novaFolha = XLSX.utils.json_to_sheet(rowsTratadas);
    const novoWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(novoWorkbook, novaFolha, 'Dados Limpos');

    // Escreve o ficheiro em formato binário (Buffer) para enviar em Base64
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

    if (!emailOriginal || !emailOriginal.includes('@') || emailOriginal.includes('mailinator')) {
      return res.status(400).json({ error: 'E-mail inválido ou descartável.' });
    }

    const data = await resend.emails.send({
      from: EMAIL_REMETENTE,
      to: [emailOriginal],
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
      const emailDestino = item.emailOriginal;
      if (emailDestino && emailDestino.includes('@') && !emailDestino.includes('mailinator')) {
        try {
          await resend.emails.send({
            from: EMAIL_REMETENTE,
            to: [emailDestino],
            subject: 'Atenção: Necessária atualização de cadastro',
            html: `<p>Olá ${item.nome || 'Cliente'}, identificamos uma divergência em seu cadastro: <strong>${item.motivo}</strong>.</p>`
          });
          enviados++;
        } catch (e) {
          console.error(`Falha ao enviar lote para ${emailDestino}:`, e.message);
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

// Porta para desenvolvimento local
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor limpo a correr em http://localhost:${PORT}`);
});