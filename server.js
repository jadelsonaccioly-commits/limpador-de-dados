const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const path = require('path');

const HIGARNOTE_KEY = process.env.HIGARNOTE_KEY || "";

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SUPABASE_URL = 'https://xyzcompany.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummykey';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Inicializa o Resend com a chave segura da Vercel
const resend = new Resend(process.env.RESEND_API_KEY);

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

// --- ROTA DE NOTIFICAÇÃO INDIVIDUAL POR E-MAIL (RESEND) ---
app.post('/api/notificar-erro', async (req, res) => {
  try {
    const { nome, emailOriginal, motivoRevisao } = req.body;

    if (!emailOriginal || !emailOriginal.includes('@') || emailOriginal.includes('mailinator')) {
      return res.status(400).json({ error: 'E-mail inválido ou descartável.' });
    }

    console.log(`A tentar enviar e-mail via Resend para: ${emailOriginal} usando remetente: ${EMAIL_REMETENTE}`);

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

    console.log("Resposta de sucesso do Resend:", data);

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
      success_url: 'http://localhost:3001?success=true',
      cancel_url: 'http://localhost:3001?canceled=true',
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("ERRO DO STRIPE:", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log(`Servidor limpo a correr em http://localhost:3001`);
});