const form = document.querySelector("#upload-form");
const fileInput = document.querySelector("#file-input");
const fileName = document.querySelector("#file-name");
const dropZone = document.querySelector("#drop-zone");
const submitButton = document.querySelector("#submit-button");
const status = document.querySelector("#status");
const reportCard = document.querySelector("#report-card");
const validationList = document.querySelector("#validation-list");
const optionsPanel = document.querySelector("#options-panel");
const themeToggle = document.querySelector("#theme-toggle");
const themeLabel = document.querySelector("#theme-label");
const themeColor = document.querySelector('meta[name="theme-color"]');
const authDialog = document.querySelector("#auth-dialog");
const authOpenButton = document.querySelector("#auth-open");
const authCloseButton = document.querySelector("#auth-close");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authSubmitButton = document.querySelector("#auth-submit");
const authSwitchButton = document.querySelector("#auth-switch");
const authStatus = document.querySelector("#auth-status");
const authPassword = document.querySelector("#auth-password");
const authForgotContainer = document.querySelector("#auth-forgot-container");
const forgotContainer = document.querySelector("#forgot-container");
const forgotEmail = document.querySelector("#forgot-email");
const forgotTrigger = document.querySelector("#btn-forgot-trigger");
const sendForgotButton = document.querySelector("#btn-send-forgot");
const cancelForgotButton = document.querySelector("#btn-cancel-forgot");
const authConfirmationField = document.querySelector("#auth-confirmation-field");
const authPasswordConfirmation = document.querySelector("#auth-password-confirmation");
const passwordToggleButtons = document.querySelectorAll(".auth-password-toggle");
const authUserLabel = document.querySelector("#auth-user");
const authLogoutButton = document.querySelector("#auth-logout");
const browseButton = document.querySelector(".browse-button");

const authStorageKeys = {
  token: "dados-em-ordem-access-token",
  email: "dados-em-ordem-user-email",
};
let authenticatedUser = {
  accessToken: localStorage.getItem(authStorageKeys.token),
  email: localStorage.getItem(authStorageKeys.email),
};
let authMode = "login";
const savedTheme = localStorage.getItem("dados-em-ordem-theme");
const initialTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : "dark";

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const darkMode = theme === "dark";
  if (themeLabel) themeLabel.textContent = darkMode ? "Modo claro" : "Modo escuro";
  if (themeToggle) {
    themeToggle.setAttribute("aria-label", darkMode ? "Ativar modo claro" : "Ativar modo escuro");
    themeToggle.title = darkMode ? "Ativar modo claro" : "Ativar modo escuro";
  }
  if (themeColor) themeColor.content = darkMode ? "#0d1220" : "#f5f7fc";
}

setTheme(initialTheme);
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(theme);
    localStorage.setItem("dados-em-ordem-theme", theme);
  });
}

function updateAuthHeader() {
  const isAuthenticated = Boolean(authenticatedUser.accessToken && authenticatedUser.email);
  if (authOpenButton) authOpenButton.hidden = isAuthenticated;
  if (authUserLabel) authUserLabel.hidden = !isAuthenticated;
  if (authLogoutButton) authLogoutButton.hidden = !isAuthenticated;
  if (authUserLabel) authUserLabel.textContent = isAuthenticated ? authenticatedUser.email : "";
}

function isAuthenticated() {
  return Boolean(authenticatedUser.accessToken && authenticatedUser.email);
}

function promptLogin(message) {
  setAuthMode("login");
  if (authStatus) authStatus.textContent = message;
  if (authDialog) authDialog.showModal();
}

updateAuthHeader();

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  if (authTitle) authTitle.textContent = registering ? "Criar sua conta" : "Entrar na sua conta";
  if (authDescription) authDescription.textContent = registering
    ? "Cadastre-se com seu e-mail e crie uma senha com pelo menos 8 caracteres."
    : "Acesse sua conta com e-mail e senha.";
  if (authSubmitButton) authSubmitButton.textContent = registering ? "Cadastrar" : "Entrar";
  if (authSwitchButton) authSwitchButton.textContent = registering
    ? "Já tem uma conta? Faça login"
    : "Ainda não tem conta? Cadastre-se";
  if (authPassword) authPassword.autocomplete = registering ? "new-password" : "current-password";
  if (authForgotContainer) authForgotContainer.hidden = registering;
  if (authConfirmationField) authConfirmationField.hidden = !registering;
  if (authPasswordConfirmation) {
    authPasswordConfirmation.required = registering;
    authPasswordConfirmation.value = "";
  }
  if (authForm) authForm.hidden = false;
  if (forgotContainer) forgotContainer.hidden = true;
  if (authSwitchButton) authSwitchButton.hidden = false;
  if (authStatus) {
    authStatus.textContent = "";
    authStatus.dataset.state = "";
  }
}

if (authOpenButton) authOpenButton.addEventListener("click", () => promptLogin(""));
if (authCloseButton) authCloseButton.addEventListener("click", () => {
  if (authDialog) authDialog.close();
});
if (authLogoutButton) {
  authLogoutButton.addEventListener("click", () => {
    localStorage.removeItem(authStorageKeys.token);
    localStorage.removeItem(authStorageKeys.email);
    authenticatedUser = { accessToken: null, email: null };
    updateAuthHeader();
    if (fileInput) fileInput.value = "";
    if (fileName) fileName.textContent = "Nenhum arquivo selecionado";
    if (reportCard) reportCard.hidden = true;
  });
}
if (authSwitchButton) {
  authSwitchButton.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "register" : "login");
  });
}

if (forgotTrigger) {
  forgotTrigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (forgotEmail && authForm) forgotEmail.value = authForm.elements.email.value;
    if (authForm) authForm.hidden = true;
    if (authSwitchButton) authSwitchButton.hidden = true;
    if (forgotContainer) forgotContainer.hidden = false;
    if (authStatus) {
      authStatus.textContent = "";
      authStatus.dataset.state = "";
    }
    if (forgotEmail) forgotEmail.focus();
  });
}

if (cancelForgotButton) {
  cancelForgotButton.addEventListener("click", () => {
    if (forgotContainer) forgotContainer.hidden = true;
    if (authForm) authForm.hidden = false;
    if (authSwitchButton) authSwitchButton.hidden = false;
    if (authStatus) {
      authStatus.textContent = "";
      authStatus.dataset.state = "";
    }
  });
}

if (sendForgotButton) {
  sendForgotButton.addEventListener("click", async () => {
    const email = forgotEmail ? forgotEmail.value.trim() : "";

    if (!email) {
      if (authStatus) {
        authStatus.textContent = "Preencha o seu e-mail.";
        authStatus.dataset.state = "error";
      }
      return;
    }

    sendForgotButton.disabled = true;
    if (authStatus) {
      authStatus.textContent = "A enviar e-mail de recuperação…";
      authStatus.dataset.state = "";
    }

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível enviar o e-mail de recuperação.");
      }

      if (authStatus) {
        authStatus.textContent = "E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.";
        authStatus.dataset.state = "success";
      }
      
      setTimeout(() => {
        if (forgotContainer) forgotContainer.hidden = true;
        if (authForm) authForm.hidden = false;
        if (authSwitchButton) authSwitchButton.hidden = false;
        if (authStatus) authStatus.textContent = "";
      }, 4000);
    } catch (error) {
      if (authStatus) {
        authStatus.textContent = error instanceof Error ? error.message : "Não foi possível conectar ao servidor.";
        authStatus.dataset.state = "error";
      }
    } finally {
      sendForgotButton.disabled = false;
    }
  });
}

for (const toggleButton of passwordToggleButtons) {
  toggleButton.addEventListener("click", () => {
    const passwordInput = document.getElementById(toggleButton.dataset.passwordTarget);
    if (passwordInput) {
      const isVisible = passwordInput.type === "text";
      passwordInput.type = isVisible ? "password" : "text";
      toggleButton.textContent = isVisible ? "Mostrar" : "Ocultar";
      toggleButton.setAttribute("aria-label", isVisible ? "Mostrar senha" : "Ocultar senha");
      toggleButton.setAttribute("aria-pressed", String(!isVisible));
    }
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (authMode === "register" && authPassword && authPasswordConfirmation && authPassword.value !== authPasswordConfirmation.value) {
      window.alert("As senhas não coincidem. Confirme a senha antes de continuar.");
      authPasswordConfirmation.focus();
      return;
    }

    if (authSubmitButton) authSubmitButton.disabled = true;
    if (authStatus) {
      authStatus.textContent = authMode === "register" ? "Criando sua conta…" : "Entrando…";
      authStatus.dataset.state = "";
    }

    try {
      const response = await fetch(authMode === "register" ? "/api/register" : "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authForm.elements.email.value,
          password: authForm.elements.password.value,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível concluir a solicitação.");
      }

      if (authMode === "register") {
        authForm.elements.password.value = "";
        setAuthMode("login");
        if (authStatus) {
          authStatus.textContent = "Cadastro realizado. Agora você pode entrar com sua conta.";
          authStatus.dataset.state = "success";
        }
      } else {
        if (typeof result.accessToken !== "string" || typeof result.user?.email !== "string") {
          throw new Error("A resposta do servidor não contém os dados de autenticação esperados.");
        }

        localStorage.setItem(authStorageKeys.token, result.accessToken);
        localStorage.setItem(authStorageKeys.email, result.user.email);
        authenticatedUser = {
          accessToken: result.accessToken,
          email: result.user.email,
        };
        updateAuthHeader();
        authForm.elements.password.value = "";
        if (authDialog) authDialog.close();
        if (pendingUploadFile) {
          const file = pendingUploadFile;
          pendingUploadFile = null;
          setFile(file);
        }
      }
    } catch (error) {
      if (authStatus) {
        authStatus.textContent = error instanceof Error ? error.message : "Não foi possível conectar ao servidor.";
        authStatus.dataset.state = "error";
      }
    } finally {
      if (authSubmitButton) authSubmitButton.disabled = false;
    }
  });
}

let pendingUploadFile = null;

function setFile(file) {
  if (!file) return;
  if (!isAuthenticated()) {
    pendingUploadFile = file;
    promptLogin("Entre na sua conta para carregar e limpar um ficheiro.");
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  if (fileInput) fileInput.files = transfer.files;
  if (fileName) fileName.textContent = file.name;
  if (status) {
    status.textContent = "";
    status.dataset.state = "";
  }
  if (reportCard) reportCard.hidden = true;
  if (optionsPanel) optionsPanel.hidden = false;
}

// --- Exibição de Relatório e Mala Direta (Individual e Lote) ---
function showReport(report) {
  const metricTotal = document.querySelector("#metric-total");
  const metricCorrected = document.querySelector("#metric-corrected");
  const metricAlerts = document.querySelector("#metric-alerts");
  const reportValidations = document.querySelector("#report-validations");

  if (metricTotal) metricTotal.textContent = report.totalRows;
  if (metricCorrected) metricCorrected.textContent = report.correctedValues;
  if (metricAlerts) metricAlerts.textContent = report.alertCount;
  
  if (reportValidations) {
    reportValidations.textContent = `Processamento concluído com ${report.alertCount} alertas encontrados.`;
  }

  if (validationList) {
    validationList.replaceChildren();
    
    if (report.alertasDetalhes && report.alertasDetalhes.length > 0) {
      // --- Botão de Mala Direta em Lote ---
      const massaContainer = document.createElement("div");
      massaContainer.className = "mb-4 p-3 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center justify-between";
      massaContainer.innerHTML = `
        <div>
          <span class="font-bold text-sm text-indigo-900 dark:text-indigo-200 block">Automação de Mala Direta</span>
          <span class="text-xs text-indigo-700 dark:text-indigo-400">Foram encontrados ${report.alertasDetalhes.length} registos com pendências.</span>
        </div>
        <button id="btn-disparar-massa" class="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700 transition shadow">
          Disparar para Todos (E-mail)
        </button>
      `;
      validationList.append(massaContainer);

      setTimeout(() => {
        const btnMassa = document.getElementById("btn-disparar-massa");
        if (btnMassa) {
          btnMassa.addEventListener("click", () => dispararMassaEmLote(report.alertasDetalhes, btnMassa));
        }
      }, 100);

      const headerItem = document.createElement("div");
      headerItem.className = "font-bold text-sm mb-2 text-gray-700 dark:text-gray-300";
      headerItem.textContent = "Contatos para Correção (Mala Direta):";
      validationList.append(headerItem);

      report.alertasDetalhes.forEach((item) => {
        const li = document.createElement("li");
        li.className = "flex items-center justify-between p-2 mb-2 border rounded bg-gray-50 dark:bg-gray-800 text-xs";
        li.innerHTML = `
          <div>
            <strong class="block text-gray-900 dark:text-white">${item.nome || 'Sem Nome'}</strong>
            <span class="text-red-500">${item.motivo}</span><br>
            <span class="text-gray-500">${item.emailOriginal} | ${item.telefone}</span>
          </div>
          <button onclick="notificarCliente('${item.nome}', '${item.emailOriginal}', '${item.telefone}', '${item.motivo}', this)" 
            class="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
            Notificar / Corrigir
          </button>
        `;
        validationList.append(li);
      });
    } else {
      const item = document.createElement("li");
      item.className = "is-clean text-green-600 font-medium";
      item.textContent = "Nenhum dado incorreto encontrado! Todos os registos estão OK.";
      validationList.append(item);
    }
  }

  if (reportCard) {
    reportCard.hidden = false;
    reportCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// --- Notificação Individual ---
async function notificarCliente(nome, emailOriginal, telefone, motivoRevisao, botao) {
  botao.disabled = true;
  botao.textContent = "Enviando...";

  try {
    const response = await fetch("/api/notificar-erro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, emailOriginal, telefone, motivoRevisao })
    });

    const res = await response.json();

    if (!response.ok) {
      throw new Error(res.error || "Erro ao enviar notificação.");
    }

    if (res.sucesso) {
      if (res.linkWhatsApp) {
        window.open(res.linkWhatsApp, '_blank');
      }
      botao.textContent = "Enviado!";
      botao.classList.remove("bg-blue-600", "hover:bg-blue-700");
      botao.classList.add("bg-green-600");
    }
  } catch (err) {
    alert("Erro: " + err.message);
    botao.disabled = false;
    botao.textContent = "Tentar Novamente";
  }
}

// --- Disparo em Lote para Todos ---
async function dispararMassaEmLote(alertasDetalhes, botao) {
  if (!confirm(`Confirma o envio de e-mails de correção para os ${alertasDetalhes.length} contactos listados?`)) {
    return;
  }

  botao.disabled = true;
  botao.textContent = "A enviar lote...";

  try {
    const response = await fetch("/api/notificar-massa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertasDetalhes })
    });

    const res = await response.json();

    if (!response.ok) {
      throw new Error(res.error || "Erro no disparo em massa.");
    }

    alert(res.mensagem);
    botao.textContent = "Lote Enviado com Sucesso!";
    botao.classList.remove("bg-indigo-600", "hover:bg-indigo-700");
    botao.classList.add("bg-green-600");

  } catch (err) {
    alert("Erro: " + err.message);
    botao.disabled = false;
    botao.textContent = "Tentar Novamente";
  }
}

// --- Interação de clique para abrir o explorador de ficheiros ---
if (dropZone && fileInput) {
  dropZone.addEventListener("click", () => {
    fileInput.click();
  });
}

if (browseButton && fileInput) {
  browseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput.click();
  });
}

if (fileInput) {
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });
}

if (dropZone) {
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  }

  dropZone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    setFile(file);
  });
}

// --- Processamento do Formulário via FormData ---
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAuthenticated()) {
      promptLogin("Entre na sua conta antes de limpar um ficheiro.");
      return;
    }

    if (!fileInput || !fileInput.files.length) {
      if (status) {
        status.textContent = "Selecione um arquivo CSV ou Excel antes de continuar.";
        status.dataset.state = "error";
      }
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (status) {
      status.textContent = "Limpando seus dados com segurança…";
      status.dataset.state = "";
    }

    try {
      const formData = new FormData(form);

      const response = await fetch("/api/limpar-dados", { 
        method: "POST", 
        body: formData 
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível processar o arquivo.");
      }

      // --- Download do Arquivo Higienizado ---
      if (result.arquivoBase64) {
        const binary = atob(result.arquivoBase64);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        const blob = new Blob([bytes], { type: result.contentType });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = result.nomeArquivo;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }

      if (status) {
        status.textContent = `Pronto! ${result.totalProcessado} registos limpos e descarregados com sucesso.`;
        status.dataset.state = "success";
      }
      
      showReport({
        totalRows: result.totalRecebido,
        correctedValues: result.totalCorrigidos || 0,
        alertCount: result.totalAlertas || 0,
        alertasDetalhes: result.alertasDetalhes || []
      });

    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.dataset.state = "error";
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

// --- Integração Stripe Checkout ---
document.addEventListener('DOMContentLoaded', () => {
  const stripeKey = 'pk_test_51URGY6LKYNLZDtjc720u2yaRbNVnlqI3qPQyQ3oA9s6x2WZ5agAIkFNxTd75Aug7ZbZpYaXa5jVNbPJhz9rQHkGt00rTFBwypC';
  const stripe = typeof Stripe !== 'undefined' ? Stripe(stripeKey) : null;

  const btnPro = document.getElementById('btn-subscribe-pro');
  const btnBusiness = document.getElementById('btn-subscribe-business');
  const btnCredits = document.getElementById('btn-buy-credits');

  async function handleCheckout(planType, buttonElement, defaultText) {
    if (!stripe) {
      alert('O Stripe ainda está a carregar. Atualize a página e tente novamente.');
      return;
    }

    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.textContent = 'A redirecionar...';
    }

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType }),
      });

      const data = await response.json();

      if (data.error) {
        alert('Erro ao iniciar o pagamento: ' + data.error);
        if (buttonElement) {
          buttonElement.disabled = false;
          buttonElement.textContent = defaultText;
        }
        return;
      }

      if (data.id) {
        const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
        if (error) {
          alert(error.message);
          if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.textContent = defaultText;
          }
        }
      }
    } catch (err) {
      console.error('Erro na requisição de pagamento:', err);
      alert('Ocorreu um erro de conexão ao processar o pagamento.');
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = defaultText;
      }
    }
  }

  if (btnPro) {
    btnPro.addEventListener('click', () => handleCheckout('pro', btnPro, 'Assinar Plano Pro'));
  }

  if (btnBusiness) {
    btnBusiness.addEventListener('click', () => handleCheckout('business', btnBusiness, 'Assinar Business'));
  }

  if (btnCredits) {
    btnCredits.addEventListener('click', () => handleCheckout('credits', btnCredits, 'Comprar Créditos'));
  }
});