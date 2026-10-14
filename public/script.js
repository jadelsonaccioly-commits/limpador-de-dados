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
const cancelStep2Button = document.querySelector("#btn-cancel-step2");
const updatePasswordButton = document.querySelector("#btn-update-password");
const recoveryTokenInput = document.querySelector("#recovery-token");
const newPasswordInput = document.querySelector("#new-password");
const forgotStep1 = document.querySelector("#forgot-step-1");
const forgotStep2 = document.querySelector("#forgot-step-2");
const authConfirmationField = document.querySelector("#auth-confirmation-field");
const authPasswordConfirmation = document.querySelector("#auth-password-confirmation");
const passwordToggleButtons = document.querySelectorAll(".auth-password-toggle");
const authUserLabel = document.querySelector("#auth-user");
const authLogoutButton = document.querySelector("#auth-logout");

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
  themeLabel.textContent = darkMode ? "Modo claro" : "Modo escuro";
  themeToggle.setAttribute("aria-label", darkMode ? "Ativar modo claro" : "Ativar modo escuro");
  themeToggle.title = darkMode ? "Ativar modo claro" : "Ativar modo escuro";
  themeColor.content = darkMode ? "#0d1220" : "#f5f7fc";
}

setTheme(initialTheme);
themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(theme);
  localStorage.setItem("dados-em-ordem-theme", theme);
});

function updateAuthHeader() {
  const isAuthenticated = Boolean(authenticatedUser.accessToken && authenticatedUser.email);
  authOpenButton.hidden = isAuthenticated;
  authUserLabel.hidden = !isAuthenticated;
  authLogoutButton.hidden = !isAuthenticated;
  authUserLabel.textContent = isAuthenticated ? authenticatedUser.email : "";
}

function isAuthenticated() {
  return Boolean(authenticatedUser.accessToken && authenticatedUser.email);
}

function promptLogin(message) {
  setAuthMode("login");
  authStatus.textContent = message;
  authDialog.showModal();
}

updateAuthHeader();

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  authTitle.textContent = registering ? "Criar sua conta" : "Entrar na sua conta";
  authDescription.textContent = registering
    ? "Cadastre-se com seu e-mail e crie uma senha com pelo menos 8 caracteres."
    : "Acesse sua conta com e-mail e senha.";
  authSubmitButton.textContent = registering ? "Cadastrar" : "Entrar";
  authSwitchButton.textContent = registering
    ? "Já tem uma conta? Faça login"
    : "Ainda não tem conta? Cadastre-se";
  authPassword.autocomplete = registering ? "new-password" : "current-password";
  authForgotContainer.hidden = registering;
  authConfirmationField.hidden = !registering;
  authPasswordConfirmation.required = registering;
  authPasswordConfirmation.value = "";
  authForm.hidden = false;
  forgotContainer.hidden = true;
  forgotStep1.style.display = "block";
  forgotStep2.style.display = "none";
  authSwitchButton.hidden = false;
  authStatus.textContent = "";
  authStatus.dataset.state = "";
}

authOpenButton.addEventListener("click", () => promptLogin(""));
authCloseButton.addEventListener("click", () => authDialog.close());
authLogoutButton.addEventListener("click", () => {
  localStorage.removeItem(authStorageKeys.token);
  localStorage.removeItem(authStorageKeys.email);
  authenticatedUser = { accessToken: null, email: null };
  updateAuthHeader();
  fileInput.value = "";
  fileName.textContent = "Nenhum arquivo selecionado";
  reportCard.hidden = true;
});
authSwitchButton.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "register" : "login");
});

forgotTrigger.addEventListener("click", (event) => {
  event.preventDefault();
  forgotEmail.value = authForm.elements.email.value;
  authForm.hidden = true;
  authSwitchButton.hidden = true;
  forgotContainer.hidden = false;
  forgotStep1.style.display = "block";
  forgotStep2.style.display = "none";
  authStatus.textContent = "";
  authStatus.dataset.state = "";
  forgotEmail.focus();
});

cancelForgotButton.addEventListener("click", () => {
  forgotContainer.hidden = true;
  authForm.hidden = false;
  authSwitchButton.hidden = false;
  authStatus.textContent = "";
  authStatus.dataset.state = "";
});

cancelStep2Button.addEventListener("click", () => {
  forgotContainer.hidden = true;
  authForm.hidden = false;
  authSwitchButton.hidden = false;
  authStatus.textContent = "";
  authStatus.dataset.state = "";
});

sendForgotButton.addEventListener("click", async () => {
  if (!forgotEmail.reportValidity()) return;

  sendForgotButton.disabled = true;
  authStatus.textContent = "Solicitando instruções de recuperação…";
  authStatus.dataset.state = "";

  try {
    const response = await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail.value.trim() }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível solicitar a recuperação da senha.");
    }

    authStatus.textContent = result.message || "Instruções enviadas com sucesso.";
    authStatus.dataset.state = "success";
    
    forgotStep1.style.display = "none";
    forgotStep2.style.display = "block";
  } catch (error) {
    authStatus.textContent = error instanceof Error ? error.message : "Não foi possível conectar ao servidor.";
    authStatus.dataset.state = "error";
  } finally {
    sendForgotButton.disabled = false;
  }
});

updatePasswordButton.addEventListener("click", async () => {
  const token = recoveryTokenInput.value.trim();
  const newPassword = newPasswordInput.value;

  if (!token || !newPassword) {
    authStatus.textContent = "Preencha o token e a nova senha.";
    authStatus.dataset.state = "error";
    return;
  }

  updatePasswordButton.disabled = true;
  authStatus.textContent = "Atualizando senha…";
  authStatus.dataset.state = "";

  try {
    const response = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: forgotEmail.value.trim(),
        token: token,
        password: newPassword,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível atualizar a senha.");
    }

    authStatus.textContent = "Senha atualizada com sucesso! Faça login com a nova senha.";
    authStatus.dataset.state = "success";
    
    setTimeout(() => {
      forgotContainer.hidden = true;
      authForm.hidden = false;
      authSwitchButton.hidden = false;
      authStatus.textContent = "";
    }, 2500);
  } catch (error) {
    authStatus.textContent = error instanceof Error ? error.message : "Não foi possível conectar ao servidor.";
    authStatus.dataset.state = "error";
  } finally {
    updatePasswordButton.disabled = false;
  }
});

for (const toggleButton of passwordToggleButtons) {
  toggleButton.addEventListener("click", () => {
    const passwordInput = document.getElementById(toggleButton.dataset.passwordTarget);
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    toggleButton.textContent = isVisible ? "Mostrar" : "Ocultar";
    toggleButton.setAttribute("aria-label", isVisible ? "Mostrar senha" : "Ocultar senha");
    toggleButton.setAttribute("aria-pressed", String(!isVisible));
  });
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authMode === "register" && authPassword.value !== authPasswordConfirmation.value) {
    window.alert("As senhas não coincidem. Confirme a senha antes de continuar.");
    authPasswordConfirmation.focus();
    return;
  }

  authSubmitButton.disabled = true;
  authStatus.textContent = authMode === "register" ? "Criando sua conta…" : "Entrando…";
  authStatus.dataset.state = "";

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
      authStatus.textContent = "Cadastro realizado. Agora você pode entrar com sua conta.";
      authStatus.dataset.state = "success";
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
      authDialog.close();
      if (pendingUploadFile) {
        const file = pendingUploadFile;
        pendingUploadFile = null;
        setFile(file);
      }
    }
  } catch (error) {
    authStatus.textContent = error instanceof Error ? error.message : "Não foi possível conectar ao servidor.";
    authStatus.dataset.state = "error";
  } finally {
    authSubmitButton.disabled = false;
  }
});

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
  fileInput.files = transfer.files;
  fileName.textContent = file.name;
  status.textContent = "";
  status.dataset.state = "";
  reportCard.hidden = true;
  optionsPanel.hidden = false;
}

function showReport(report) {
  document.querySelector("#metric-total").textContent = report.totalRows;
  document.querySelector("#metric-corrected").textContent = report.correctedValues;
  document.querySelector("#metric-alerts").textContent = report.alertCount;
  const emailSummary = report.options.validateEmails ? `E-mails válidos: ${report.validEmails}` : "E-mails não validados";
  const cpfSummary = report.options.formatCpfs ? `CPFs válidos: ${report.validCpfs}` : "CPFs não formatados";
  document.querySelector("#report-validations").textContent = `${emailSummary} · ${cpfSummary}`;
  validationList.replaceChildren();

  if (report.alerts.length === 0) {
    const item = document.createElement("li");
    item.className = "is-clean";
    item.textContent = "Nenhuma inconsistência de formato foi encontrada.";
    validationList.append(item);
  } else {
    for (const alert of report.alerts) {
      const item = document.createElement("li");
      item.textContent = `Linha ${alert.row} · ${alert.column}: ${alert.message}`;
      validationList.append(item);
    }
  }
  if (report.removedDuplicates) {
    const item = document.createElement("li");
    item.className = "is-clean";
    item.textContent = `${report.removedDuplicates} linha(s) duplicada(s) removida(s).`;
    validationList.append(item);
  }

  reportCard.hidden = false;
  reportCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

fileInput.addEventListener("change", () => setFile(fileInput.files[0]));

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAuthenticated()) {
    promptLogin("Entre na sua conta antes de limpar um ficheiro.");
    return;
  }

  if (!fileInput.files.length) {
    status.textContent = "Selecione um arquivo CSV ou Excel antes de continuar.";
    status.dataset.state = "error";
    return;
  }

  submitButton.disabled = true;
  status.textContent = "Limpando seus dados…";
  status.dataset.state = "";

  try {
    const formData = new FormData(form);
    const response = await fetch("/upload", { method: "POST", body: formData });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "Não foi possível processar o arquivo.");
    }

    const result = await response.json();
    const binary = atob(result.file.contentBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.file.contentType });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = result.file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    status.textContent = `Pronto! O arquivo ${result.file.name} foi baixado.`;
    status.dataset.state = "success";
    showReport(result.report);
  } catch (error) {
    status.textContent = error.message;
    status.dataset.state = "error";
  } finally {
    submitButton.disabled = false;
  }
});

// Integração com o Stripe Checkout
const stripe = Stripe('sua_chave_publica_stripe_aqui');

const subscribeBtn = document.getElementById('btn-subscribe-pro');
if (subscribeBtn) {
  subscribeBtn.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const session = await response.json();

      if (session.error) {
        alert(session.error);
        return;
      }

      const result = await stripe.redirectToCheckout({ sessionId: session.id });
      if (result.error) {
        alert(result.error.message);
      }
    } catch (err) {
      console.error('Erro ao iniciar o checkout:', err);
      alert('Não foi possível iniciar o pagamento.');
    }
  });
}