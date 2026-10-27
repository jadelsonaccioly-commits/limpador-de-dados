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

// Remetente oficial de produção
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
      // Caso a chave ainda não esteja configurada no ambiente de testes
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error(`⚠️ Erro na assinatura do Webhook Stripe: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Evento disparado quando o pagamento do checkout é concluído
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email || session.customer_email;
    const paymentStatus = session.payment_status;

    console.log(`💰 Pagamento recebido do Stripe para o email: ${customerEmail}`);

    if (paymentStatus === 'paid' && customerEmail) {
      try {
        // 1. Procurar o utilizador no Supabase pelo email
        const { data: users, error: userErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', customerEmail);

        if (users && users.length > 0) {
          const userId = users[0].id;

          // 2. Atualizar o plano para Pro (ou conforme os itens comprados)
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

// Aumento de limite de payload para as restantes rotas JSON
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
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(digitos.charAt(1));
}