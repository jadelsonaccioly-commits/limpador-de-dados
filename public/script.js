document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const authDialog = document.getElementById('auth-dialog');
  const authOpenBtn = document.getElementById('auth-open');
  const authCloseBtn = document.getElementById('auth-close');
  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-title');
  const authDescription = document.getElementById('auth-description');
  const authSubmit = document.getElementById('auth-submit');
  const authSwitch = document.getElementById('auth-switch');
  const authStatus = document.getElementById('auth-status');
  const authUserSpan = document.getElementById('auth-user');
  const authLogoutBtn = document.getElementById('auth-logout');
  const companyField = document.getElementById('company-field');
  const themeToggle = document.getElementById('theme-toggle');

  let isRegistering = false;

  // Gestão de Tema (Dark/Light)
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.dataset.theme;
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = newTheme;
      localStorage.setItem('dados-em-ordem-theme', newTheme);
    });
  }

  // Abrir / Fechar Modal de Autenticação
  if (authOpenBtn) {
    authOpenBtn.addEventListener('click', () => {
      authDialog.showModal();
    });
  }

  if (authCloseBtn) {
    authCloseBtn.addEventListener('click', () => {
      authDialog.close();
    });
  }

  // Alternar entre Login e Cadastro
  if (authSwitch) {
    authSwitch.addEventListener('click', () => {
      isRegistering = !isRegistering;
      if (isRegistering) {
        authTitle.textContent = 'Criar sua conta';
        authDescription.textContent = 'Insira seus dados para começar a usar.';
        authSubmit.textContent = 'Cadastrar';
        authSwitch.textContent = 'Já tem conta? Entre aqui';
        if (companyField) companyField.hidden = false;
      } else {
        authTitle.textContent = 'Entrar na sua conta';
        authDescription.textContent = 'Acesse com seu e-mail e senha.';
        authSubmit.textContent = 'Entrar';
        authSwitch.textContent = "Ainda não tem conta? Cadastre-se";
        if (companyField) companyField.hidden = true;
      }
    });
  }

  // Submissão do Formulário de Autenticação
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(authForm);
      const email = formData.get('email');
      const password = formData.get('password');
      const companyName = formData.get('companyName');

      authStatus.textContent = 'A processar...';

      const endpoint = isRegistering ? '/api/register' : '/api/login';
      const bodyData = isRegistering ? { email, password, companyName } : { email, password };

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Erro na autenticação');

        authStatus.textContent = isRegistering ? 'Cadastro realizado! Pode entrar.' : 'Login efetuado com sucesso!';
        
        if (!isRegistering && result.accessToken) {
          localStorage.setItem('access_token', result.accessToken);
          localStorage.setItem('user_email', email);
          if (result.user && result.user.id) {
            localStorage.setItem('user_id', result.user.id);
          }
          authDialog.close();
          atualizarEstadoSessao();
        } else if (isRegistering) {
          if (result.user && result.user.id) {
            localStorage.setItem('user_id', result.user.id);
          }
          setTimeout(() => {
            authSwitch.click();
            authStatus.textContent = 'Registo efetuado! Faça login agora.';
          }, 1500);
        }
      } catch (err) {
        authStatus.textContent = 'Erro: ' + err.message;
      }
    });
  }

  // Função para verificar se o utilizador está logado na interface
  function atualizarEstadoSessao() {
    const token = localStorage.getItem('access_token');
    const email = localStorage.getItem('user_email');

    if (token && email) {
      if (authOpenBtn) authOpenBtn.hidden = true;
      if (authUserSpan) {
        authUserSpan.textContent = email;
        authUserSpan.hidden = false;
      }
      if (authLogoutBtn) authLogoutBtn.hidden = false;
    } else {
      if (authOpenBtn) authOpenBtn.hidden = false;
      if (authUserSpan) authUserSpan.hidden = true;
      if (authLogoutBtn) authLogoutBtn.hidden = true;
    }
  }

  if (authLogoutBtn) {
    authLogoutBtn.addEventListener('click', () => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_id');
      atualizarEstadoSessao();
      window.location.reload();
    });
  }

  atualizarEstadoSessao();

  // --- LÓGICA DE UPLOAD E LIMPEZA DE PLANILHAS ---
  const uploadForm = document.getElementById('upload-form');
  const fileInput = document.getElementById('file-input');
  const fileName = document.getElementById('file-name');
  const dropZone = document.getElementById('drop-zone');
  const submitButton = document.getElementById('submit-button');
  const statusEl = document.getElementById('status');
  const reportCard = document.getElementById('report-card');
  const validationList = document.getElementById('validation-list');

  if (fileInput && fileName) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        fileName.textContent = fileInput.files[0].name;
      } else {
        fileName.textContent = 'Nenhum arquivo selecionado';
      }
    });
  }

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#6259e8'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#cbd2e3'; });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#cbd2e3';
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        fileName.textContent = fileInput.files[0].name;
      }
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!fileInput.files.length) {
        statusEl.textContent = 'Por favor, selecione um ficheiro primeiro.';
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'A processar e limpar dados...';
      statusEl.textContent = '';

      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      try {
        const response = await fetch('/api/limpar-dados', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro ao processar ficheiro');

        statusEl.textContent = 'Limpeza concluída com sucesso!';
        
        // Preencher Relatório
        document.getElementById('metric-total').textContent = data.totalRecebido;
        document.getElementById('metric-corrected').textContent = data.totalCorrigidos;
        document.getElementById('metric-alerts').textContent = data.totalAlertas;
        
        // Renderizar lista de alertas com opções garantidas de E-mail e WhatsApp
        if (validationList) {
          validationList.innerHTML = '';
          if (data.alertasDetalhes && data.alertasDetalhes.length > 0) {
            
            // Botão de notificação em massa por e-mail no topo
            const massaContainer = document.createElement('li');
            massaContainer.style.marginBottom = '12px';
            massaContainer.innerHTML = `
              <button id="btn-notify-massa" class="submit-button" type="button" style="margin-top:0; background:#4f46e5;">
                ✉️ Notificar Todos os Alertas por E-mail (${data.alertasDetalhes.length})
              </button>
            `;
            validationList.appendChild(massaContainer);

            document.getElementById('btn-notify-massa').addEventListener('click', async () => {
              const currentUserId = localStorage.getItem('user_id');
              const btn = document.getElementById('btn-notify-massa');
              btn.disabled = true;
              btn.textContent = 'A enviar notificações em massa...';
              try {
                const resMassa = await fetch('/api/notificar-massa', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ alertasDetalhes: data.alertasDetalhes, userId: currentUserId })
                });
                const resMassaJson = await resMassa.json();
                alert(resMassaJson.mensagem || 'Lote enviado!');
              } catch (errMassa) {
                alert('Erro no envio em massa: ' + errMassa.message);
              } finally {
                btn.disabled = false;
                btn.textContent = `✉️ Notificar Todos os Alertas por E-mail (${data.alertasDetalhes.length})`;
              }
            });

            // Linha a linha dos alertas com os botões de E-mail e WhatsApp visíveis
            data.alertasDetalhes.forEach(item => {
              const li = document.createElement('li');
              li.style.cssText = 'padding:12px; border:1px solid var(--border-soft); border-radius:10px; margin-bottom:8px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; background:var(--surface-muted); font-size:11px;';
              
              // Garante a extração correta do número para o link do WhatsApp
              const telRaw = item.telefone || '';
              const telLimpo = telRaw.replace(/\D/g, '');
              const mensagemWp = encodeURIComponent(`Olá ${item.nome || 'Cliente'}, identificamos uma inconsistência no seu cadastro: "${item.motivo}". Poderia por favor atualizar?`);
              const linkWp = telLimpo.length >= 10 ? `https://wa.me/${telLimpo.startsWith('55') ? telLimpo : '55' + telLimpo}?text=${mensagemWp}` : `https://wa.me/?text=${mensagemWp}`;

              li.innerHTML = `
                <div style="flex: 1; min-width: 200px;">
                  <strong>Linha ${item.linha}: ${item.nome}</strong> (${item.emailOriginal || 'Sem email'} | Tel: ${telRaw || 'Não informado'})<br>
                  <span style="color:#e11d48;">Motivo: ${item.motivo}</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                  <button type="button" class="btn-notify-single" style="padding:6px 12px; border:1px solid #4f46e5; border-radius:6px; background:#f4f3ff; color:#4f46e5; cursor:pointer; font-size:11px; font-weight:700;">
                    ✉️ E-mail
                  </button>
                  <a href="${linkWp}" target="_blank" style="padding:6px 12px; border:1px solid #10b981; border-radius:6px; background:#e6f9f0; color:#0d9448; text-decoration:none; font-size:11px; font-weight:700; display:inline-flex; align-items:center;">
                    💬 WhatsApp
                  </a>
                </div>
              `;

              const btnSingle = li.querySelector('.btn-notify-single');
              btnSingle.addEventListener('click', async () => {
                const currentUserId = localStorage.getItem('user_id');
                btnSingle.disabled = true;
                btnSingle.textContent = 'Enviando...';
                try {
                  const resSingle = await fetch('/api/notificar-erro', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      nome: item.nome,
                      emailOriginal: item.emailOriginal,
                      motivoRevisao: item.motivo,
                      userId: currentUserId
                    })
                  });
                  const resSingleJson = await resSingle.json();
                  if (!resSingle.ok) throw new Error(resSingleJson.error || 'Erro ao enviar');
                  btnSingle.textContent = 'Enviado ✓';
                  btnSingle.style.background = '#e6f9f0';
                  btnSingle.style.color = '#0d9448';
                  btnSingle.style.borderColor = '#0d9448';
                } catch (errSingle) {
                  alert('Erro: ' + errSingle.message);
                  btnSingle.disabled = false;
                  btnSingle.textContent = '✉️ E-mail';
                }
              });

              validationList.appendChild(li);
            });
          }
        }

        if (reportCard) reportCard.hidden = false;

        // Criar link de download automático do ficheiro limpo
        const byteCharacters = atob(data.arquivoBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.contentType });
        
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = data.nomeArquivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

      } catch (err) {
        statusEl.textContent = 'Erro: ' + err.message;
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Limpar e padronizar planilha';
      }
    });
  }

  // Integração com Stripe Checkout para Planos
  const btnPro = document.getElementById('btn-subscribe-pro');
  const btnBusiness = document.getElementById('btn-subscribe-business');
  const btnCredits = document.getElementById('btn-buy-credits');

  async function handleCheckout(planType) {
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType })
      });
      const session = await response.json();
      if (session.id) {
        const stripe = Stripe('pk_test_sua_chave_publicavel');
        await stripe.redirectToCheckout({ sessionId: session.id });
      } else {
        alert('Erro ao iniciar checkout: ' + (session.error || 'Erro desconhecido'));
      }
    } catch (e) {
      alert('Erro de conexão com o pagamento.');
    }
  }

  if (btnPro) btnPro.addEventListener('click', () => handleCheckout('pro'));
  if (btnBusiness) btnBusiness.addEventListener('click', () => handleCheckout('business'));
  if (btnCredits) btnCredits.addEventListener('click', () => handleCheckout('credits'));
});