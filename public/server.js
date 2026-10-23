const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const path = require('path');

// Chave secreta correta do Stripe inserida diretamente
const HIGARNOTE_KEY = process.env.HIGARNOTE_KEY || "";

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SUPABASE_URL = 'https://xyzcompany.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummykey';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const resend = new Resend('re_123456789');

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

app.post('/api/create-checkout-session', async (req, res) => {
  const { planType } = req.body;
  
  let priceId = 'price_1USIoeLKYNLZDtjchvAULrXC'; // Pro
  let mode = 'subscription';

  if (planType === 'business') {
    priceId = 'price_1USIprLKYNLZDtjci5T3OPZt'; // Business
    mode = 'subscription';
  } else if (planType === 'credits') {
    priceId = 'price_1USMdpLKYNLZDtjc1Of1xKYM'; // Créditos
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