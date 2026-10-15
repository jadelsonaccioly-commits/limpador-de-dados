const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configurações do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'A_SUA_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'A_SUA_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuração do Resend
const resend = new Resend(process.env.RESEND_API_KEY || 'SUA_CHAVE_API_RESEND');

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

// Rota de Recuperação de Senha via OTP/Token com Envio pelo Resend
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false
      }
    });
    if (error) throw error;

    await resend.emails.send({
      from: 'Dados em Ordem <onboarding@resend.dev>',
      to: [email],
      subject: 'Código de Recuperação — Dados em Ordem',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #17213b; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Recuperação de Senha</h2>
          <p>Olá,</p>
          <p>Você solicitou a redefinição de senha para a sua conta no <strong>Dados em Ordem</strong>.</p>
          <p>Copie o código/token gerado e insira-o na tela de recuperação do site juntamente com a sua nova senha.</p>
          <br>
          <p style="font-size: 13px; color: #4b5563;">Acesse o site: <a href="https://www.datacleanbr.com.br" style="color: #2563eb;">datacleanbr.com.br</a></p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">Se você não solicitou esta alteração, pode ignorar este e-mail com segurança.</p>
        </div>
      `
    });

    res.json({ message: 'Código de recuperação enviado para o seu e-mail!' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para Atualizar/Redefinir a Senha com o Token
app.post('/api/reset-password', async (req, res) => {
  const { email, token, password } = req.body;
  try {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery'
    });
    if (verifyError) throw verifyError;

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