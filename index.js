require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// Funções Auxiliares de Limpeza e Validação
// ==========================================

const DOMINIOS_DESCARTAVEIS = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com', 
  'throwawaymail.com', 'sharklasers.com', 'getnada.com', 'yopmail.com'
]);

const CORRECOES_DOMINIOS = {
  'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmial.com': 'gmail.com',
  'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmaill.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlooik.com': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'iclod.com': 'icloud.com'
};

const MAPEAMENTO_ESTADOS = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amapá': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceara': 'CE', 'ceará': 'CE', 'distrito federal': 'DF',
  'espirito santo': 'ES', 'espírito santo': 'ES', 'goias': 'GO', 'goiás': 'GO',
  'maranhao': 'MA', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'para': 'PA', 'pará': 'PA', 'paraiba': 'PB', 'paraíba': 'PB',
  'parana': 'PR', 'paraná': 'PR', 'pernambuco': 'PE', 'piaui': 'PI', 'piauí': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
  'sao paulo': 'SP', 'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO'
};

function ehPessoaJuridica(nome) {
  if (!nome || typeof nome !== 'string') return false;
  const termosPJ = ['ltda', 's/a', 'sa', 'me', 'eireli', 'epp', 'mei', 'cia', '& cia', 'comercio', 'industria', 'servicos', 'holding', 'brasil'];
  const nomeLower = nome.toLowerCase();
  return termosPJ.some(termo => nomeLower.includes(termo));
}


function extrairNomeFantasia(nome) {
  if (!nome || typeof nome !== 'string') return '';
  let texto = nome.trim();
  // Remove sufixos jurídicos e termos de razão social
  texto = texto.replace(/\b(&\s*)?(cia|ltda|s\/a|sa|me|epp|mei|eireli|holding|comercio|servicos|industria)\b.*/gi, '').trim();
  return texto || nome;
}

function extrairPrimeiroNomeESobrenome(nome) {
  if (!nome || typeof nome !== 'string') return { primeiroNome: '', sobrenome: '' };
  const partes = nome.trim().split(/\s+/);
  const primeiroNome = partes[0] || '';
  const sobrenome = partes.slice(1).join(' ') || '';
  return { primeiroNome, sobrenome };
}

function padronizarGenero(genero) {
  if (!genero) return '';
  const g = String(genero).trim().toLowerCase();
  if (['m', 'masculino', 'homem', 'male'].includes(g)) return 'M';
  if (['f', 'feminino', 'mulher', 'female'].includes(g)) return 'F';
  if (['outro', 'outros', 'other', 'non-binary', 'nao-binario'].includes(g)) return 'Outro';
  return String(genero).trim();
}

function padronizarProfissao(profissao) {
  if (!profissao || typeof profissao !== 'string') return '';
  return padronizarNomeRazaoSocial(profissao);
}

function limparEValidarEmail(email) {
  if (!email || typeof email !== 'string') return null;
  let emailLimpo = email.trim().toLowerCase().replace(/\s+/g, '');
  const partes = emailLimpo.split('@');
  if (partes.length !== 2) return null;
  let [usuario, dominio] = partes;
  if (!usuario || !dominio) return null;
  if (CORRECOES_DOMINIOS[dominio]) dominio = CORRECOES_DOMINIOS[dominio];
  if (DOMINIOS_DESCARTAVEIS.has(dominio)) return null;
  const emailFinal = `${usuario}@${dominio}`;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailFinal) ? emailFinal : null;
}

function validarECorrigirCpfCnpj(doc) {
  if (!doc) return { documentoFormatado: '', valido: false };
  let numeros = String(doc).replace(/\D/g, '');
  
  if (numeros.length === 0 || /^0+$/.test(numeros)) {
    return { documentoFormatado: '', valido: false };
  }

  if (numeros.length <= 11) {
    numeros = numeros.padStart(11, '0');
    if (numeros.length !== 11 || /^(\d)\1{10}$/.test(numeros)) return { documentoFormatado: numeros, valido: false };
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(numeros.charAt(i)) * (10 - i);
    let resto = 11 - (soma % 11);
    let d1 = resto >= 10 ? 0 : resto;
    if (d1 !== parseInt(numeros.charAt(9))) return { documentoFormatado: numeros, valido: false };
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(numeros.charAt(i)) * (11 - i);
    resto = 11 - (soma % 11);
    let d2 = resto >= 10 ? 0 : resto;
    if (d2 !== parseInt(numeros.charAt(10))) return { documentoFormatado: numeros, valido: false };
    return { documentoFormatado: numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'), valido: true };
  } else {
    numeros = numeros.padStart(14, '0');
    if (numeros.length !== 14 || /^(\d)\1{13}$/.test(numeros)) return { documentoFormatado: numeros, valido: false };
    return { documentoFormatado: numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'), valido: true };
  }
}

function limparRG(rg) {
  if (!rg) return '';
  return String(rg).replace(/[^0-9a-zA-xX]/g, '').toUpperCase();
}

function limparENormalizarTelefone(tel) {
  if (!tel) return '';
  let numeros = String(tel).replace(/\D/g, '');
  if (numeros.startsWith('55') && numeros.length > 11) numeros = numeros.substring(2);
  if (numeros.length === 10 && ['6', '7', '8', '9'].includes(numeros.charAt(2))) {
    numeros = numeros.substring(0, 2) + '9' + numeros.substring(2);
  }
  return numeros.length >= 10 ? `+55${numeros}` : numeros;
}

function padronizarNomeRazaoSocial(nome) {
  if (!nome || typeof nome !== 'string') return '';
  const excecoes = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 's/a', 'sa', 'ltda', 'me', 'eireli']);
  return nome.trim().toLowerCase().split(/\s+/)
    .map((p, i) => {
      if (['s/a', 'sa', 'ltda', 'me', 'eireli'].includes(p)) return p.toUpperCase();
      return (i > 0 && excecoes.has(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(' ');
}

function padronizarLogradouro(logradouro) {
  if (!logradouro || typeof logradouro !== 'string') return '';
  let texto = logradouro.trim().toLowerCase();
  texto = texto.replace(/\br\b|\br\./g, 'Rua')
               .replace(/\bav\b|\bav\./g, 'Avenida')
               .replace(/\bal\b|\bal\./g, 'Alameda')
               .replace(/\bpça\b|\bpca\b|\bpça\./g, 'Praça')
               .replace(/\bnº\b|\bn\b|\bn\./g, 'nº');
  return padronizarNomeRazaoSocial(texto);
}

function converterEstadoUF(estado) {
  if (!estado) return '';
  const estLimpo = String(estado).trim().toLowerCase();
  if (estLimpo.length === 2) return estLimpo.toUpperCase();
  return MAPEAMENTO_ESTADOS[estLimpo] || estado.toUpperCase();
}

function formatarCEP(cep) {
  if (!cep) return '';
  let numeros = String(cep).replace(/\D/g, '').padStart(8, '0');
  if (numeros.length !== 8) return cep;
  return numeros.replace(/(\d{5})(\d{3})/, '$1-$2');
}

function formatarMoeda(valor) {
  if (valor === undefined || valor === null || valor === '') return '0.00';
  let str = String(valor).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  let num = parseFloat(str);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

function formatarNumerico(valor) {
  if (!valor) return '0';
  let str = String(valor).replace(/\./g, '').replace(',', '.');
  let num = parseFloat(str);
  return isNaN(num) ? '0' : String(num);
}

function padronizarData(dataStr) {
  if (!dataStr) return '';
  let d = new Date(dataStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  
  const partes = String(dataStr).split(/[\/\-]/);
  if (partes.length === 3) {
    let [p1, p2, p3] = partes;
    if (p3.length === 4) return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
  }
  return dataStr;
}

function removerDuplicadosInteligente(dados) {
  const vistosEmail = new Set();
  const vistosDoc = new Set();
  const vistosTel = new Set();

  return dados.filter(item => {
    const emailVal = item.email ? String(item.email).trim().toLowerCase() : '';
    const docVal = item.cpf_cnpj ? String(item.cpf_cnpj).replace(/\D/g, '') : '';
    const telVal = item.telefone ? String(item.telefone).replace(/\D/g, '') : '';

    if (emailVal && vistosEmail.has(emailVal)) return false;
    if (docVal && docVal.length >= 11 && vistosDoc.has(docVal)) return false;
    if (telVal && telVal.length >= 10 && vistosTel.has(telVal)) return false;

    if (emailVal) vistosEmail.add(emailVal);
    if (docVal && docVal.length >= 11) vistosDoc.add(docVal);
    if (telVal && telVal.length >= 10) vistosTel.add(telVal);

    return true;
  });
}

// ==========================================
// Rotas de Autenticação
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "E-mail e senha são obrigatórios." });

    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return res.status(400).json({ error: error.message });

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro interno no servidor" });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error || !data.session || !data.user) {
    return res.status(400).json({ error: error?.message || "Sessão inválida." });
  }

  res.json({ success: true, accessToken: data.session.access_token, user: { email: data.user.email } });
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:3001' });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, message: 'E-mail enviado com sucesso!' });
});

// ==========================================
// Rota de Limpeza Completa de Dados
// ==========================================
app.post('/api/limpar-dados', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const registros = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

    let totalCorrigidos = 0;
    let totalAlertas = 0;

    const dadosProcessados = registros.map((linha) => {
      const emailOrig = linha.email || linha.E-mail || '';
      const docOrig = String(linha.cpf_cnpj || linha.CPF_CNPJ || linha['cpf/cnpj'] || linha['CPF/CNPJ'] || linha.cpf || linha.CPF || linha.cnpj || linha.CNPJ || '');
      const rgOrig = linha.rg || linha.RG || '';
      const telOrig = linha.telefone || linha.Telefone || '';
      const nomeOrig = linha.nome_razao_social || linha.nome || linha.Nome || '';
      const logrOrig = linha.logradouro || linha.Logradouro || '';
      const estOrig = linha.estado || linha.Estado || linha.UF || '';
      const cepOrig = linha.cep || linha.CEP || '';
      const moedaOrig = linha.moeda || linha.Moeda || linha.valor || '';
      const numOrig = linha.quantidade || linha.num || '';
      const dataOrig = linha.data_cadastro || linha.data || linha.data_nascimento || '';
      const generoOrig = linha.genero || linha.sexo || linha.Genero || linha.Sexo || '';
      const profOrig = linha.profissao || linha.Profissao || linha.cargo || linha.Cargo || '';

      let errosLinha = [];

      // 1. E-mail
      const emailValido = limparEValidarEmail(emailOrig);
      if (!emailValido) errosLinha.push('E-mail inválido/descartável');
      else if (emailOrig.trim().toLowerCase() !== emailValido) totalCorrigidos++;

      // 2. Validação Cruzada Nome vs CPF/CNPJ
      const nomePadrao = padronizarNomeRazaoSocial(nomeOrig);
      const { primeiroNome, sobrenome } = extrairPrimeiroNomeESobrenome(nomePadrao);
      const isPJ = ehPessoaJuridica(nomePadrao);
      const docNumeros = docOrig.replace(/\D/g, '');

      const docResultado = validarECorrigirCpfCnpj(docOrig);

      if (isPJ && docNumeros.length > 0 && docNumeros.length <= 11) {
        errosLinha.push('Empresa (PJ) cadastrada com CPF (necessário CNPJ)');
      } else if (!isPJ && docNumeros.length > 11) {
        errosLinha.push('Pessoa Física cadastrada com CNPJ');
      } else if (!docResultado.valido) {
        errosLinha.push('CPF/CNPJ pendente ou inválido');
      }

      // 3. RG
      const rgLimpo = limparRG(rgOrig);

      // 4. Telefone
      const telNorm = limparENormalizarTelefone(telOrig);
      if (telOrig && !telNorm) errosLinha.push('Telefone inválido');

      // 5. Logradouro
      const logrPadrao = padronizarLogradouro(logrOrig);

      // 6. Estado / UF
      const estadoUF = converterEstadoUF(estOrig);

      // 7. CEP
      const cepFormatado = formatarCEP(cepOrig);

      // 8. Moeda
      const moedaFormatada = formatarMoeda(moedaOrig);

      // 9. Numérico
      const numFormatado = formatarNumerico(numOrig);

      // 10. Datas (Cadastro / Nascimento)
      const dataFormatada = padronizarData(dataOrig);

      // 11. Gênero / Sexo e Profissão
      const generoFormatado = padronizarGenero(generoOrig);
      const profissaoFormatada = padronizarProfissao(profOrig);

      if (errosLinha.length > 0) totalAlertas++;

      // Monta objeto final com colunas estrategicamente organizadas
      let linhaSaida = { ...linha };

      if ('nome' in linhaSaida) linhaSaida.nome = nomePadrao;
      if ('nome_razao_social' in linhaSaida) linhaSaida.nome_razao_social = nomePadrao;
      if (!('nome' in linhaSaida) && !('nome_razao_social' in linhaSaida)) linhaSaida.nome = nomePadrao;

      // Adiciona colunas extras para marketing e CRM
      const nomeFantasia = isPJ ? extrairNomeFantasia(nomePadrao) : nomePadrao;
      linhaSaida.nome_fantasia = nomeFantasia;
      linhaSaida.primeiro_nome = primeiroNome;
      linhaSaida.sobrenome = sobrenome;

      if ('email' in linhaSaida) linhaSaida.email = emailValido || emailOrig;
      if ('E-mail' in linhaSaida) linhaSaida['E-mail'] = emailValido || emailOrig;

      // Atualiza o documento na coluna original
      const docVal = docResultado.documentoFormatado || docOrig;
      if ('cpf_cnpj' in linhaSaida) linhaSaida.cpf_cnpj = docVal;
      else if ('CPF_CNPJ' in linhaSaida) linhaSaida.CPF_CNPJ = docVal;
      else if ('cpf' in linhaSaida) linhaSaida.cpf = docVal;
      else if ('cnpj' in linhaSaida) linhaSaida.cnpj = docVal;
      else linhaSaida.cpf_cnpj = docVal;

      if ('rg' in linhaSaida) linhaSaida.rg = rgLimpo;
      if ('logradouro' in linhaSaida) linhaSaida.logradouro = logrPadrao;
      if ('estado' in linhaSaida) linhaSaida.estado = estadoUF;
      if ('cep' in linhaSaida) linhaSaida.cep = cepFormatado;
      if ('telefone' in linhaSaida) linhaSaida.telefone = telNorm || telOrig;
      if ('moeda' in linhaSaida) linhaSaida.moeda = moedaFormatada;
      if ('quantidade' in linhaSaida) linhaSaida.quantidade = numFormatado;
      if ('data_cadastro' in linhaSaida) linhaSaida.data_cadastro = dataFormatada;
      if ('data_nascimento' in linhaSaida) linhaSaida.data_nascimento = dataFormatada;

      if (generoOrig) linhaSaida.genero = generoFormatado;
      if (profOrig) linhaSaida.profissao = profissaoFormatada;

      linhaSaida.status_geral = errosLinha.length === 0 ? 'OK' : 'REVISAR';
      linhaSaida.motivo_revisao = errosLinha.length > 0 ? errosLinha.join(' | ') : 'Nenhum';

      return linhaSaida;
    });

    // 12. Deduplicação Inteligente Multi-Chave (E-mail OR CPF/CNPJ OR Telefone)
    const dadosFinais = removerDuplicadosInteligente(dadosProcessados);
    const alertasDetalhes = dadosProcessados
      .filter(item => item.status_geral === 'REVISAR')
      .map(item => ({
        nome: item.nome || item.nome_razao_social || '',
        emailOriginal: item.email || item['E-mail'] || '',
        telefone: item.telefone || '',
        motivo: item.motivo_revisao
      }));

    const novaFolha = XLSX.utils.json_to_sheet(dadosFinais);
    const novoWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(novoWb, novaFolha, "Dados Higienizados");

    const extensaoOriginal = path.extname(req.file.originalname).toLowerCase();
    const isExcelOriginal = extensaoOriginal === '.xlsx' || extensaoOriginal === '.xls';
    const bufferSaida = XLSX.write(novoWb, { type: 'buffer', bookType: isExcelOriginal ? 'xlsx' : 'csv' });

    res.json({
      sucesso: true,
      totalRecebido: registros.length,
      totalProcessado: dadosFinais.length,
      totalCorrigidos,
      totalAlertas,
      alertasDetalhes,
      arquivoBase64: bufferSaida.toString('base64'),
      nomeArquivo: isExcelOriginal ? 'dados_higienizados.xlsx' : 'dados_higienizados.csv',
      contentType: isExcelOriginal ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8;'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// Rotas de Notificação e Stripe
// ==========================================
app.post('/api/notificar-erro', async (req, res) => {
  try {
    const { nome, emailOriginal, telefone, motivoRevisao } = req.body;
    let emailEnviado = false;

    if (emailOriginal && emailOriginal.includes('@')) {
      await resend.emails.send({
        from: 'Dados em Ordem <onboarding@resend.dev>',
        to: emailOriginal,
        subject: 'Atualização Cadastral Necessária',
        html: `<p>Olá ${nome || 'Cliente'}, identificamos uma divergência no seu cadastro (${motivoRevisao}). Por favor, atualize seus dados.</p>`
      });
      emailEnviado = true;
    }

    let linkWhatsApp = null;
    if (telefone) {
      const telLimpo = telefone.replace(/\D/g, '');
      linkWhatsApp = `https://api.whatsapp.com/send?phone=${telLimpo}&text=${encodeURIComponent(`Olá ${nome || 'tudo bem?'}, identificamos uma divergência em seu cadastro (${motivoRevisao}).`)}`;
    }

    res.json({ sucesso: true, emailEnviado, linkWhatsApp, mensagem: 'Notificação processada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notificar-massa', async (req, res) => {
  try {
    const { alertasDetalhes } = req.body;
    if (!alertasDetalhes || !Array.isArray(alertasDetalhes)) return res.status(400).json({ error: "Lista inválida." });

    let enviadosComSucesso = 0;
    let falhas = 0;

    for (const item of alertasDetalhes) {
      if (!item.emailOriginal || item.emailOriginal.includes('inválido')) { falhas++; continue; }
      try {
        await resend.emails.send({
          from: 'Dados em Ordem <onboarding@resend.dev>',
          to: item.emailOriginal,
          subject: 'Ação necessária: Atualização de cadastro pendente',
          html: `<p>Olá ${item.nome || 'Cliente'}, identificamos a pendência: ${item.motivo}. Por favor regularize.</p>`
        });
        enviadosComSucesso++;
      } catch (err) { falhas++; }
    }

    res.json({ sucesso: true, mensagem: `Disparo concluído: ${enviadosComSucesso} enviados, ${falhas} falhas.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  const { planType } = req.body;
  let priceId = planType === 'business' ? 'price_1USIprLKYNLZDtjci5T3OPZt' : 'price_1USIoeLKYNLZDtjchvAULrXC';
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: 'http://localhost:3001?success=true',
      cancel_url: 'http://localhost:3001?canceled=true',
    });
    res.json({ id: session.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log(`Servidor rodando em http://localhost:3001`);
});