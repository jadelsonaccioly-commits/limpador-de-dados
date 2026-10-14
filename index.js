const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do Supabase (substitua pelas suas chaves ou variáveis de ambiente)
const SUPABASE_URL = process.env.SUPABASE_URL || 'A_SUA_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'A_SUA_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Rota de Registo
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

// Rota de Login
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

// Rota para Pedir Recuperação de Senha (Envia o token/email)
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    res.json({ message: 'Instruções de recuperação enviadas para o seu e-mail.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para Atualizar/Redefinir a Senha com o Token
app.post('/api/reset-password', async (req, res) => {
  const { email, token, password } = req.body;
  try {
    // Verifica o token OTP enviado pelo e-mail
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery'
    });
    if (verifyError) throw verifyError;

    // Atualiza para a nova senha
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;

    res.json({ message: 'Senha atualizada com sucesso!' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Limpador de dados disponível em http://localhost:${PORT}`);
});