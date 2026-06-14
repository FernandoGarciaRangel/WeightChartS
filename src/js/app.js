// Módulo principal da aplicação
// Coordena todos os outros módulos e gerencia a interface
// Agora com suporte a autenticação completa (email/senha)

import { weightDB } from './database.js';
import { WeightChart } from './chart.js';
import { firebaseManager } from '../config/firebase.js';

const SKIP_LANDING_KEY = 'weightcharts_skip_landing';

class WeightApp {
    constructor() {
        this.chart = null;
        this.isAuthenticated = false;
        this.currentUser = null;
        /** @type {'light'|'dark'} */
        this.currentTheme = 'dark';
        /** @type {{ id: string|null, localId: string|null, label: string }|null} */
        this.editTarget = null;
        this.registrosModalOpen = false;
        this.explorarModalOpen = false;
        /** @type {((result: boolean) => void)|null} */
        this.confirmResolver = null;
        /** Evita registros duplicados por duplo-clique (reentrância). */
        this._addingRecord = false;
        /** Meta de peso atual (null = sem meta). */
        this.metaPeso = null;
        /** Filtro de período do gráfico em dias (null = tudo). */
        this.currentRange = null;
        /** Se o perfil do usuário está público. */
        this.isProfilePublic = false;
        /** Instância read-only do gráfico na tela Explorar. */
        this.profileChart = null;
        this.init();
    }

    themeStorageKey(uid) {
        return `weightcharts_theme_${uid}`;
    }

    getThemeFromLocal(uid) {
        try {
            const v = localStorage.getItem(this.themeStorageKey(uid));
            if (v === 'light' || v === 'dark') return v;
        } catch {
            /* ignore */
        }
        return null;
    }

    setThemeLocal(uid, theme) {
        try {
            localStorage.setItem(this.themeStorageKey(uid), theme);
        } catch {
            /* ignore */
        }
    }

    applyTheme(theme) {
        const t = theme === 'light' ? 'light' : 'dark';
        this.currentTheme = t;
        document.documentElement.dataset.theme = t;

        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.content = t === 'light' ? '#f4f4f5' : '#f97316';

        const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (statusBar) statusBar.content = t === 'light' ? 'default' : 'black-translucent';

        const btn = document.getElementById('btnTheme');
        if (btn) {
            btn.textContent = t === 'light' ? 'Tema escuro' : 'Tema claro';
            btn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
        }

        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: t } }));
        if (this.chart) this.chart.refreshTheme();
    }

    async loadThemeForUser() {
        const uid = firebaseManager.getCurrentUserId();
        if (!uid) return;

        let theme = await firebaseManager.loadUserThemePreference();
        if (!theme) theme = this.getThemeFromLocal(uid);
        if (!theme) theme = 'dark';
        this.applyTheme(theme);
    }

    async toggleTheme() {
        const uid = firebaseManager.getCurrentUserId();
        if (!uid) return;

        const next = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(next);
        this.setThemeLocal(uid, next);
        await firebaseManager.saveUserThemePreference(next);
    }

    init() {
        this.updatePeriodoResumo();
        this.setupEventListeners();
        this.initializeChart();
        this.setupAuthListener();
        void this.bootstrapAuthUI();
    }

    /** Texto inicial do resumo (antes de autenticar). */
    updatePeriodoResumo() {
        const el = document.getElementById('periodoResumo');
        if (!el) return;
        el.textContent = 'Informe o peso e escolha a data do registro.';
    }

    /**
     * Reflete na UI se o dia SELECIONADO já tem registro: desativa o botão de
     * adicionar e ajusta o texto. Evita falhar só no clique (regra "1 por dia").
     */
    async refreshTodayState() {
        const btn = document.getElementById('btnAdicionar');
        const pesoInput = document.getElementById('peso');
        const resumo = document.getElementById('periodoResumo');
        const dataInput = document.getElementById('dataRegistro');

        const ms = this.dateInputValueToMs(dataInput?.value);
        const selMs = Number.isFinite(ms) ? ms : Date.now();
        const isHoje = this.msToDateInputValue(selMs) === this.msToDateInputValue(Date.now());

        let already = false;
        if (this.isAuthenticated) {
            try {
                already = await weightDB.hasRecordOnDay(selMs);
            } catch {
                already = false;
            }
        }

        if (pesoInput) pesoInput.disabled = false;
        if (btn) {
            btn.disabled = already;
            btn.textContent = already ? 'Esse dia já tem registro' : 'Adicionar registro';
        }
        if (resumo) {
            if (already) {
                resumo.textContent = isHoje
                    ? 'Você já tem um registro de hoje. Corrija na lista ou escolha outra data.'
                    : 'Esse dia já tem um registro. Corrija na lista ou escolha outra data.';
            } else {
                resumo.textContent = isHoje
                    ? 'Registrando com a data de hoje.'
                    : `Registrando em ${new Date(selMs).toLocaleDateString('pt-BR')}.`;
            }
        }
    }

    /**
     * Sincroniza UI com o Auth após init (e authStateReady no Firebase).
     * Corrige: evento userAuthChanged disparado antes do listener; e sessão null até restaurar no mobile.
     */
    async bootstrapAuthUI() {
        const ok = await firebaseManager.initialize();
        if (!ok) {
            this.isAuthenticated = false;
            this.currentUser = null;
            this.updateAuthUI();
            if (this.shouldSkipLanding()) {
                this.hideLandingScreen();
                this.showAuthScreen();
            } else {
                this.showLandingScreen();
            }
            return;
        }

        const user = firebaseManager.getCurrentUser();
        this.isAuthenticated = !!user;
        this.currentUser = user;
        this.updateAuthUI();

        if (user) {
            await this.loadThemeForUser();
            await this.loadMetaForUser();
            await this.loadProfileForUser();
            this.loadInitialData();
            this.hideLandingScreen();
            try {
                localStorage.setItem(SKIP_LANDING_KEY, '1');
            } catch {
                /* ignore */
            }
        } else if (this.shouldSkipLanding()) {
            this.hideLandingScreen();
            this.showAuthScreen();
        } else {
            this.showLandingScreen();
        }
    }

    shouldSkipLanding() {
        try {
            return localStorage.getItem(SKIP_LANDING_KEY) === '1';
        } catch {
            return false;
        }
    }

    showLandingScreen() {
        const landing = document.getElementById('landingScreen');
        if (landing) {
            landing.classList.remove('hidden');
            landing.classList.add('flex');
        }
        this.hideAuthScreen();
    }

    hideLandingScreen() {
        const landing = document.getElementById('landingScreen');
        if (landing) {
            landing.classList.add('hidden');
            landing.classList.remove('flex');
        }
    }

    startFromLanding() {
        try {
            localStorage.setItem(SKIP_LANDING_KEY, '1');
        } catch {
            /* ignore */
        }
        this.hideLandingScreen();
        this.showAuthScreen();
    }

    // Configurar listener de autenticação
    setupAuthListener() {
        window.addEventListener('userAuthChanged', (event) => {
            const user = event.detail.user;
            this.isAuthenticated = !!user;
            this.currentUser = user;
            this.updateAuthUI();
            
            if (user) {
                console.log('Usuário autenticado na aplicação:', user.email);
                this.hideLandingScreen();
                try {
                    localStorage.setItem(SKIP_LANDING_KEY, '1');
                } catch {
                    /* ignore */
                }
                this.hideAuthScreen();
                void this.loadThemeForUser();
                void this.loadMetaForUser();
                void this.loadProfileForUser();
                this.loadInitialData();
            } else {
                console.log('Usuário desautenticado');
                this.applyTheme('dark');
                this.metaPeso = null;
                this.applyMetaToUI();
                if (this.chart) this.chart.setGoal(null);
                this.isProfilePublic = false;
                this.closeExplorar();
                this.updateProfileCardVisibility();
                this.clearData();
                if (this.shouldSkipLanding()) {
                    this.hideLandingScreen();
                    this.showAuthScreen();
                } else {
                    this.showLandingScreen();
                }
            }
        });
    }

    // Mostrar tela de autenticação
    showAuthScreen() {
        const authScreen = document.getElementById('authScreen');
        if (authScreen) {
            authScreen.classList.remove('hidden');
            requestAnimationFrame(() => {
                document.getElementById('loginEmail')?.focus();
            });
        }
    }

    // Ocultar tela de autenticação
    hideAuthScreen() {
        const authScreen = document.getElementById('authScreen');
        if (authScreen) {
            authScreen.classList.add('hidden');
        }
    }

    // Atualizar interface baseada na autenticação
    updateAuthUI() {
        const authStatus = document.getElementById('authStatus');
        const userInfo = document.getElementById('userInfo');
        const btnLogout = document.getElementById('btnLogout');
        const mainContent = document.querySelector('.p-4.space-y-4');
        
        if (authStatus) {
            if (this.isAuthenticated) {
                authStatus.textContent = 'Conectado';
                authStatus.className = 'text-sm font-medium text-orange-400';
                authStatus.setAttribute('data-auth', 'in');
            } else {
                authStatus.textContent = 'Desconectado';
                authStatus.className = 'text-sm font-medium text-red-400';
                authStatus.setAttribute('data-auth', 'out');
            }
        }
        
        if (userInfo) {
            if (this.isAuthenticated) {
                const displayName = firebaseManager.getCurrentUserDisplayName();
                userInfo.textContent = `Olá, ${displayName}!`;
                userInfo.className = 'text-xs text-zinc-400';
            } else {
                userInfo.textContent = 'Não autenticado';
                userInfo.className = 'text-xs text-zinc-500';
            }
        }

        const btnTheme = document.getElementById('btnTheme');
        if (btnTheme) {
            if (this.isAuthenticated) {
                btnTheme.classList.remove('hidden');
            } else {
                btnTheme.classList.add('hidden');
            }
        }

        if (btnLogout) {
            if (this.isAuthenticated) {
                btnLogout.classList.remove('hidden');
            } else {
                btnLogout.classList.add('hidden');
            }
        }

        if (mainContent) {
            if (this.isAuthenticated) {
                mainContent.classList.remove('hidden');
            } else {
                mainContent.classList.add('hidden');
            }
        }
    }

    setupEventListeners() {
        // Eventos de autenticação
        this.setupAuthEventListeners();
        
        // Botão de adicionar registro
        const addButton = document.getElementById('btnAdicionar');
        if (addButton) {
            addButton.addEventListener('click', () => this.addWeightRecord());
        }

        // Botões de funcionalidades
        const btnExportar = document.getElementById('btnExportar');
        if (btnExportar) {
            btnExportar.addEventListener('click', () => this.exportData());
        }

        const btnImportar = document.getElementById('btnImportar');
        if (btnImportar) {
            btnImportar.addEventListener('click', () => this.importData());
        }

        const btnLimpar = document.getElementById('btnLimpar');
        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => this.clearAllData());
        }

        document.getElementById('btnExportarImagem')?.addEventListener('click', () => this.exportImage());

        // Meta de peso
        document.getElementById('btnDefinirMeta')?.addEventListener('click', () => this.definirMeta());
        document.getElementById('btnRemoverMeta')?.addEventListener('click', () => this.removerMeta());
        document.getElementById('metaInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.definirMeta();
            }
        });

        // Filtro de período do gráfico
        this.setupRangeButtons();

        // Perfil público / Explorar
        document.getElementById('btnTogglePublico')?.addEventListener('click', () => this.toggleProfilePublic());
        document.getElementById('btnExplorar')?.addEventListener('click', () => this.openExplorar());
        document.getElementById('btnFecharExplorar')?.addEventListener('click', () => this.closeExplorar());
        document.getElementById('btnVoltarExplorar')?.addEventListener('click', () => this.showExplorarLista());
        document.getElementById('modalExplorar')?.addEventListener('click', (e) => {
            if (e.target.id === 'modalExplorar') this.closeExplorar();
        });
        document.getElementById('explorarPerfis')?.addEventListener('click', (e) => {
            const li = e.target.closest('[data-uid]');
            if (li) this.showProfileDetail(li.dataset.uid);
        });

        document.getElementById('listaRegistros')?.addEventListener('click', (e) => this.handleListaClick(e));
        document.getElementById('listaRegistrosTodos')?.addEventListener('click', (e) => this.handleListaClick(e));

        document.getElementById('btnConfirmarOk')?.addEventListener('click', () => this.resolveConfirm(true));
        document.getElementById('btnConfirmarCancelar')?.addEventListener('click', () => this.resolveConfirm(false));
        document.getElementById('modalConfirmar')?.addEventListener('click', (e) => {
            if (e.target.id === 'modalConfirmar') this.resolveConfirm(false);
        });

        document.getElementById('btnVerTodos')?.addEventListener('click', () => this.openRegistrosModal());
        document.getElementById('btnFecharRegistros')?.addEventListener('click', () => this.closeRegistrosModal());
        document.getElementById('modalRegistros')?.addEventListener('click', (e) => {
            if (e.target.id === 'modalRegistros') this.closeRegistrosModal();
        });

        document.getElementById('btnCancelarEditarPeso')?.addEventListener('click', () => this.closeEditModal());
        document.getElementById('btnGuardarEditarPeso')?.addEventListener('click', () => this.saveEditPeso());
        document.getElementById('modalEditarPeso')?.addEventListener('click', (e) => {
            if (e.target.id === 'modalEditarPeso') this.closeEditModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.confirmResolver) this.resolveConfirm(false);
                else if (this.editTarget) this.closeEditModal();
                else if (this.registrosModalOpen) this.closeRegistrosModal();
                else if (this.explorarModalOpen) this.closeExplorar();
                return;
            }
            if (e.key === 'Tab') this.trapFocus(e);
        });

        const editarPesoValor = document.getElementById('editarPesoValor');
        if (editarPesoValor) {
            editarPesoValor.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.saveEditPeso();
                }
            });
        }

        // Input de peso
        const pesoInput = document.getElementById('peso');
        if (pesoInput) {
            pesoInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addWeightRecord();
                }
            });
        }

        // Campo de data do registro (default hoje, sem futuro)
        const dataRegistro = document.getElementById('dataRegistro');
        if (dataRegistro) {
            const hoje = this.msToDateInputValue(Date.now());
            dataRegistro.value = hoje;
            dataRegistro.max = hoje;
            dataRegistro.addEventListener('change', () => this.refreshTodayState());
        }
    }

    // Configurar eventos de autenticação
    setupAuthEventListeners() {
        // Botão de login
        const btnLogin = document.getElementById('btnLogin');
        if (btnLogin) {
            btnLogin.addEventListener('click', () => this.handleLogin());
        }

        // Botão de registro
        const btnRegister = document.getElementById('btnRegister');
        if (btnRegister) {
            btnRegister.addEventListener('click', () => this.handleRegister());
        }

        // Botão de logout
        const btnTheme = document.getElementById('btnTheme');
        if (btnTheme) {
            btnTheme.addEventListener('click', () => void this.toggleTheme());
        }

        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => this.handleLogout());
        }

        const btnStartApp = document.getElementById('btnStartApp');
        if (btnStartApp) {
            btnStartApp.addEventListener('click', () => this.startFromLanding());
        }

        // Botão de redefinir senha
        const btnResetPassword = document.getElementById('btnResetPassword');
        if (btnResetPassword) {
            btnResetPassword.addEventListener('click', () => this.handleResetPassword());
        }

        // Navegação entre formulários
        const btnShowRegister = document.getElementById('btnShowRegister');
        if (btnShowRegister) {
            btnShowRegister.addEventListener('click', () => this.showForm('register'));
        }

        const btnShowLogin = document.getElementById('btnShowLogin');
        if (btnShowLogin) {
            btnShowLogin.addEventListener('click', () => this.showForm('login'));
        }

        const btnForgotPassword = document.getElementById('btnForgotPassword');
        if (btnForgotPassword) {
            btnForgotPassword.addEventListener('click', () => this.showForm('forgotPassword'));
        }

        const btnBackToLogin = document.getElementById('btnBackToLogin');
        if (btnBackToLogin) {
            btnBackToLogin.addEventListener('click', () => this.showForm('login'));
        }

        // Enter nos campos de senha
        const loginEmail = document.getElementById('loginEmail');
        if (loginEmail) {
            loginEmail.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('loginPassword')?.focus();
                }
            });
        }

        const loginPassword = document.getElementById('loginPassword');
        if (loginPassword) {
            loginPassword.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleLogin();
                }
            });
        }

        const registerPassword = document.getElementById('registerPassword');
        if (registerPassword) {
            registerPassword.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleRegister();
                }
            });
        }

        const resetEmail = document.getElementById('resetEmail');
        if (resetEmail) {
            resetEmail.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleResetPassword();
                }
            });
        }
    }

    // Mostrar formulário específico
    showForm(formType) {
        const forms = ['loginForm', 'registerForm', 'forgotPasswordForm'];
        forms.forEach(form => {
            const element = document.getElementById(form);
            if (element) {
                element.classList.add('hidden');
            }
        });

        const targetForm = document.getElementById(formType + 'Form');
        if (targetForm) {
            targetForm.classList.remove('hidden');
        }
    }

    // Manipular login
    async handleLogin() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            this.showErrorMessage('Por favor, preencha todos os campos');
            return;
        }

        try {
            await firebaseManager.signIn(email, password);
            this.showSuccessMessage('Login realizado com sucesso!');
        } catch (error) {
            this.showErrorMessage(error.message);
        }
    }

    // Manipular registro
    async handleRegister() {
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;

        if (!name || !email || !password) {
            this.showErrorMessage('Por favor, preencha todos os campos');
            return;
        }

        if (password.length < 6) {
            this.showErrorMessage('A senha deve ter pelo menos 6 caracteres');
            return;
        }

        try {
            const user = await firebaseManager.signUp(email, password, name);
            
            // Atualizar o usuário atual na aplicação
            this.currentUser = user;
            this.isAuthenticated = true;
            
            // Forçar atualização da UI
            this.updateAuthUI();
            
            this.showSuccessMessage('Conta criada com sucesso!');
        } catch (error) {
            this.showErrorMessage(error.message);
        }
    }

    // Manipular logout
    async handleLogout() {
        try {
            await firebaseManager.signOut();
            this.showSuccessMessage('Logout realizado com sucesso!');
        } catch (error) {
            this.showErrorMessage('Erro ao fazer logout: ' + error.message);
        }
    }

    /** Validação simples de formato de email (cliente). */
    isValidEmail(email) {
        return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Manipular redefinição de senha
    async handleResetPassword() {
        const email = document.getElementById('resetEmail').value.trim();

        if (!this.isValidEmail(email)) {
            this.showErrorMessage('Informe um email válido');
            return;
        }

        try {
            await firebaseManager.resetPassword(email);
            this.showSuccessMessage(
                'Se houver uma conta com esse email, enviamos um link de redefinição. Verifique também a caixa de spam.',
            );
            this.showForm('login');
        } catch (error) {
            this.showErrorMessage(error.message);
        }
    }

    initializeChart() {
        this.chart = new WeightChart('graficoPeso');
    }

    loadInitialData() {
        this.updatePeriodoResumo();
        this.updateChart();
        this.updateStatistics();
        this.refreshListaRegistros();
        void this.refreshTodayState();
    }

    /** Quantos registros aparecem direto na home (o resto fica em "Ver todos"). */
    static HOME_REGISTROS_LIMIT = 3;

    /** Cria o <li> de um registro (info + ações corrigir/excluir). Reutilizado na home e no modal. */
    createRegistroLi(r) {
        const li = document.createElement('li');
        li.className =
            'flex flex-wrap items-center justify-between gap-2 py-2.5 px-3 bg-zinc-950/40';

        const info = document.createElement('span');
        info.className = 'text-sm text-zinc-300';
        const pesoFmt = typeof r.peso === 'number' ? r.peso.toFixed(1) : String(r.peso);
        info.textContent = `${r.label} · `;
        const strong = document.createElement('strong');
        strong.className = 'text-orange-400';
        strong.textContent = `${pesoFmt} kg`;
        info.appendChild(strong);

        const actions = document.createElement('div');
        actions.className = 'flex shrink-0 gap-2';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'shrink-0 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-orange-500/50';
        btn.textContent = 'Corrigir';
        btn.dataset.action = 'editar';
        btn.dataset.label = r.label;
        btn.dataset.peso = String(r.peso);
        if (r.timestamp != null) btn.dataset.timestamp = String(r.timestamp);
        if (r.id) btn.dataset.firebaseId = r.id;
        if (r.localId) btn.dataset.localId = r.localId;

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className =
            'shrink-0 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/70';
        delBtn.textContent = 'Excluir';
        delBtn.dataset.action = 'excluir';
        delBtn.dataset.label = r.label;
        if (r.id) delBtn.dataset.firebaseId = r.id;
        if (r.localId) delBtn.dataset.localId = r.localId;

        actions.appendChild(btn);
        actions.appendChild(delBtn);
        li.appendChild(info);
        li.appendChild(actions);
        return li;
    }

    /** Delega cliques de Corrigir/Excluir (usado pela lista da home e pela do modal). */
    handleListaClick(e) {
        const editBtn = e.target.closest('[data-action="editar"]');
        if (editBtn) {
            this.openEditModal({
                id: editBtn.dataset.firebaseId || null,
                localId: editBtn.dataset.localId || null,
                label: editBtn.dataset.label || '',
                peso: editBtn.dataset.peso,
                timestamp: editBtn.dataset.timestamp,
            });
            return;
        }

        const delBtn = e.target.closest('[data-action="excluir"]');
        if (delBtn) {
            this.handleDeleteRecord({
                id: delBtn.dataset.firebaseId || null,
                localId: delBtn.dataset.localId || null,
                label: delBtn.dataset.label || '',
            });
        }
    }

    /**
     * Confirmação no estilo da app (substitui o confirm() nativo).
     * @returns {Promise<boolean>} true se confirmado, false se cancelado.
     */
    confirmAction({ title = 'Confirmar', message = '', confirmLabel = 'Confirmar' } = {}) {
        return new Promise((resolve) => {
            // Se já houver uma confirmação aberta, cancela-a antes de abrir a nova
            if (this.confirmResolver) this.resolveConfirm(false);

            const modal = document.getElementById('modalConfirmar');
            const t = document.getElementById('modalConfirmarTitulo');
            const m = document.getElementById('modalConfirmarMensagem');
            const ok = document.getElementById('btnConfirmarOk');
            if (t) t.textContent = title;
            if (m) m.textContent = message;
            if (ok) ok.textContent = confirmLabel;

            this.confirmResolver = resolve;
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            requestAnimationFrame(() => ok?.focus());
        });
    }

    resolveConfirm(result) {
        const modal = document.getElementById('modalConfirmar');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        const resolve = this.confirmResolver;
        this.confirmResolver = null;
        if (resolve) resolve(result);
    }

    /** Modal aberto no topo da pilha (maior z-index primeiro). */
    getActiveModalEl() {
        if (this.confirmResolver) return document.getElementById('modalConfirmar');
        if (this.editTarget) return document.getElementById('modalEditarPeso');
        if (this.explorarModalOpen) return document.getElementById('modalExplorar');
        if (this.registrosModalOpen) return document.getElementById('modalRegistros');
        return null;
    }

    /** Mantém o Tab circulando apenas dentro do modal ativo (acessibilidade). */
    trapFocus(e) {
        const modal = this.getActiveModalEl();
        if (!modal) return;
        const focusables = Array.from(
            modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ).filter((el) => !el.disabled && el.getClientRects().length > 0);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
            if (active === first || !modal.contains(active)) {
                e.preventDefault();
                last.focus();
            }
        } else if (active === last || !modal.contains(active)) {
            e.preventDefault();
            first.focus();
        }
    }

    openRegistrosModal() {
        const modal = document.getElementById('modalRegistros');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        this.registrosModalOpen = true;
        requestAnimationFrame(() => document.getElementById('btnFecharRegistros')?.focus());
    }

    closeRegistrosModal() {
        const modal = document.getElementById('modalRegistros');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        this.registrosModalOpen = false;
    }

    async refreshListaRegistros() {
        const ul = document.getElementById('listaRegistros');
        const ulTodos = document.getElementById('listaRegistrosTodos');
        const empty = document.getElementById('listaRegistrosVazia');
        const btnVerTodos = document.getElementById('btnVerTodos');
        if (!ul) return;

        ul.innerHTML = '';
        if (ulTodos) ulTodos.innerHTML = '';
        if (btnVerTodos) btnVerTodos.classList.add('hidden');

        if (!this.isAuthenticated) {
            if (empty) {
                empty.classList.remove('hidden');
                empty.textContent = 'Faça login para ver os registros.';
            }
            this.closeRegistrosModal();
            return;
        }

        try {
            const rows = await weightDB.getRecordsForEditList(500);
            if (rows.length === 0) {
                if (empty) {
                    empty.classList.remove('hidden');
                    empty.textContent = 'Ainda não há registros.';
                }
                this.closeRegistrosModal();
                return;
            }
            if (empty) empty.classList.add('hidden');

            const limit = WeightApp.HOME_REGISTROS_LIMIT;
            rows.slice(0, limit).forEach((r) => ul.appendChild(this.createRegistroLi(r)));

            if (ulTodos) {
                rows.forEach((r) => ulTodos.appendChild(this.createRegistroLi(r)));
            }

            if (btnVerTodos && rows.length > limit) {
                btnVerTodos.textContent = `Ver todos (${rows.length})`;
                btnVerTodos.classList.remove('hidden');
            }
        } catch (err) {
            console.error(err);
            if (empty) {
                empty.classList.remove('hidden');
                empty.textContent = 'Não foi possível carregar a lista.';
            }
        }
    }

    /** Lê um peso aceitando vírgula decimal; retorna número válido (0–500 kg) ou NaN. */
    parsePeso(raw) {
        if (raw == null) return NaN;
        const n = parseFloat(String(raw).trim().replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > 500) return NaN;
        return n;
    }

    /** Converte ms → "YYYY-MM-DD" no fuso local (para <input type="date">) */
    msToDateInputValue(ms) {
        const d = Number.isFinite(ms) ? new Date(ms) : new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /** Converte "YYYY-MM-DD" → ms ao meio-dia local (evita saltos de dia por fuso) */
    dateInputValueToMs(value) {
        if (typeof value !== 'string') return NaN;
        const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return NaN;
        const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
        return date.getTime();
    }

    openEditModal({ id, localId, label, peso, timestamp }) {
        const ms = Number(timestamp);
        const validMs = Number.isFinite(ms) && ms > 0;
        this.editTarget = { id, localId, label, originalMs: validMs ? ms : null };
        const modal = document.getElementById('modalEditarPeso');
        const ctx = document.getElementById('editarPesoContexto');
        const input = document.getElementById('editarPesoValor');
        const dataInput = document.getElementById('editarDataValor');
        if (ctx) ctx.textContent = label;
        if (dataInput) {
            dataInput.value = this.msToDateInputValue(validMs ? ms : Date.now());
            dataInput.max = this.msToDateInputValue(Date.now());
        }
        if (input) {
            input.value = typeof peso === 'string' ? peso : String(peso);
            input.focus();
            input.select();
        }
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeEditModal() {
        this.editTarget = null;
        const modal = document.getElementById('modalEditarPeso');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    async saveEditPeso() {
        if (!this.editTarget) return;
        const input = document.getElementById('editarPesoValor');
        const dataInput = document.getElementById('editarDataValor');
        const novo = this.parsePeso(input?.value);
        if (!Number.isFinite(novo)) {
            this.showErrorMessage('Informe um peso válido (0 a 500 kg)');
            return;
        }

        // Só envia novo timestamp se a data tiver mudado em relação à original
        let timestamp;
        const dataValor = dataInput?.value;
        if (dataValor) {
            const ms = this.dateInputValueToMs(dataValor);
            if (!Number.isFinite(ms)) {
                this.showErrorMessage('Informe uma data válida');
                return;
            }
            if (ms > Date.now() + 86400000) {
                this.showErrorMessage('A data não pode ser no futuro');
                return;
            }
            const originalDay = this.editTarget.originalMs != null
                ? this.msToDateInputValue(this.editTarget.originalMs)
                : null;
            if (dataValor !== originalDay) {
                timestamp = ms;
            }
        }

        try {
            await weightDB.updateWeightRecord({
                id: this.editTarget.id,
                localId: this.editTarget.localId,
                peso: novo,
                timestamp,
            });
            this.closeEditModal();
            this.showSuccessMessage('Registro atualizado.');
            await this.updateChart();
            await this.refreshListaRegistros();
            await this.refreshTodayState();
            void this.syncPublicProfile();
        } catch (err) {
            this.showErrorMessage(err.message || 'Erro ao atualizar');
        }
    }

    async handleDeleteRecord({ id, localId, label }) {
        const ctx = label ? ` de ${label}` : '';
        const ok = await this.confirmAction({
            title: 'Excluir registro',
            message: `Apagar o registro${ctx}? Esta ação não pode ser desfeita.`,
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await weightDB.deleteWeightRecord({ id, localId });
            this.showSuccessMessage('Registro apagado.');
            await this.updateChart();
            await this.refreshListaRegistros();
            await this.refreshTodayState();
            void this.syncPublicProfile();
        } catch (err) {
            this.showErrorMessage(err.message || 'Erro ao apagar registro');
        }
    }

    // Limpar dados da interface
    clearData() {
        if (this.chart) {
            this.chart.clear();
        }
        this.updateStatistics();
        void this.refreshListaRegistros();
        void this.refreshTodayState();
    }

    async addWeightRecord() {
        // Evita duplo-registro por cliques rápidos (a checagem de 1/dia não é atômica).
        if (this._addingRecord) return;

        if (!this.isAuthenticated) {
            this.showErrorMessage('Usuário não autenticado. Faça login primeiro.');
            return;
        }

        const peso = this.parsePeso(document.getElementById('peso').value);
        if (!Number.isFinite(peso)) {
            this.showErrorMessage('Informe um peso válido (0 a 500 kg)');
            return;
        }

        // Data do registro: campo selecionado (default hoje), sem futuro
        const dataInput = document.getElementById('dataRegistro');
        let ts = Date.now();
        if (dataInput?.value) {
            ts = this.dateInputValueToMs(dataInput.value);
            if (!Number.isFinite(ts)) {
                this.showErrorMessage('Informe uma data válida');
                return;
            }
            if (ts > Date.now() + 86400000) {
                this.showErrorMessage('A data não pode ser no futuro');
                return;
            }
        }

        this._addingRecord = true;
        try {
            await weightDB.addWeightRecord(peso, ts);

            // Limpar peso e voltar a data para hoje
            document.getElementById('peso').value = '';
            if (dataInput) dataInput.value = this.msToDateInputValue(Date.now());

            // Atualizar gráfico
            await this.updateChart();

            // Mostrar feedback
            this.showSuccessMessage('Registro adicionado com sucesso!');
            await this.refreshListaRegistros();
            await this.refreshTodayState();
            void this.syncPublicProfile();
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this._addingRecord = false;
        }
    }

    async updateChart() {
        if (this.chart) {
            await this.chart.refresh();
        }
        await this.updateStatistics();
    }

    /** "82,5 kg" (vírgula decimal pt-BR). */
    fmtKg(v) {
        if (v == null || !Number.isFinite(v)) return '--';
        return `${v.toFixed(1).replace('.', ',')} kg`;
    }

    /** Variação com seta: "▼ 0,4 kg" / "▲ 1,2 kg" / "0,0 kg". */
    fmtDelta(v) {
        if (v == null || !Number.isFinite(v)) return '–';
        if (v === 0) return '0,0 kg';
        const arrow = v < 0 ? '▼' : '▲';
        return `${arrow} ${Math.abs(v).toFixed(1).replace('.', ',')} kg`;
    }

    /** Quanto falta para a meta (valor absoluto). "–" sem meta, "🎯" se já no alvo. */
    fmtMetaFalta(latestPeso) {
        if (this.metaPeso == null || latestPeso == null || !Number.isFinite(latestPeso)) return '–';
        const diff = Math.abs(latestPeso - this.metaPeso);
        if (diff < 0.05) return '🎯';
        return `${diff.toFixed(1).replace('.', ',')} kg`;
    }

    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    async updateStatistics() {
        try {
            const s = await weightDB.getStats();

            this.setText('pesoAtual', this.fmtKg(s.latestPeso));
            this.setText('totalRegistros', s.total);
            this.setText('pesoDelta', s.delta != null ? `${this.fmtDelta(s.delta)} vs. anterior` : '');
            this.setText('stat7', this.fmtDelta(s.delta7));
            this.setText('stat30', this.fmtDelta(s.delta30));
            this.setText('statMedia', this.fmtKg(s.avg));
            this.setText('statMin', this.fmtKg(s.min));
            this.setText('statMax', this.fmtKg(s.max));
            this.setText('statMeta', this.fmtMetaFalta(s.latestPeso));

            this.updateMetaProgress(s.latestPeso);
            this.toggleEmptyChart(s.total === 0);
        } catch (error) {
            console.error('Erro ao atualizar estatísticas:', error);
        }
    }

    /** Mostra/esconde a mensagem de gráfico vazio. */
    toggleEmptyChart(isEmpty) {
        const el = document.getElementById('graficoVazio');
        if (el) el.classList.toggle('hidden', !isEmpty);
    }

    // ----- Meta de peso -----

    metaStorageKey(uid) {
        return `weightcharts_meta_${uid}`;
    }

    getMetaFromLocal(uid) {
        try {
            const v = parseFloat(localStorage.getItem(this.metaStorageKey(uid)));
            return Number.isFinite(v) && v > 0 ? v : null;
        } catch {
            return null;
        }
    }

    setMetaLocal(uid, value) {
        try {
            if (value == null) localStorage.removeItem(this.metaStorageKey(uid));
            else localStorage.setItem(this.metaStorageKey(uid), String(value));
        } catch {
            /* ignore */
        }
    }

    async loadMetaForUser() {
        const uid = firebaseManager.getCurrentUserId();
        if (!uid) return;
        let meta = await firebaseManager.loadUserGoal();
        if (meta == null) meta = this.getMetaFromLocal(uid);
        this.metaPeso = typeof meta === 'number' && meta > 0 ? meta : null;
        this.applyMetaToUI();
        if (this.chart) this.chart.setGoal(this.metaPeso);
    }

    applyMetaToUI() {
        const input = document.getElementById('metaInput');
        const btnRemover = document.getElementById('btnRemoverMeta');
        if (input) input.value = this.metaPeso != null ? String(this.metaPeso).replace('.', ',') : '';
        if (btnRemover) btnRemover.classList.toggle('hidden', this.metaPeso == null);
    }

    async definirMeta() {
        const input = document.getElementById('metaInput');
        const v = this.parsePeso(input?.value);
        if (!Number.isFinite(v)) {
            this.showErrorMessage('Informe uma meta válida (0 a 500 kg)');
            return;
        }
        this.metaPeso = v;
        const uid = firebaseManager.getCurrentUserId();
        if (uid) this.setMetaLocal(uid, v);
        await firebaseManager.saveUserGoal(v);
        if (this.chart) this.chart.setGoal(v);
        this.applyMetaToUI();
        await this.updateStatistics();
        this.showSuccessMessage('Meta definida.');
    }

    async removerMeta() {
        this.metaPeso = null;
        const uid = firebaseManager.getCurrentUserId();
        if (uid) this.setMetaLocal(uid, null);
        await firebaseManager.saveUserGoal(null);
        if (this.chart) this.chart.setGoal(null);
        this.applyMetaToUI();
        await this.updateStatistics();
        this.showSuccessMessage('Meta removida.');
    }

    updateMetaProgress(latestPeso) {
        const el = document.getElementById('metaProgresso');
        if (!el) return;
        if (this.metaPeso == null || latestPeso == null || !Number.isFinite(latestPeso)) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.classList.remove('hidden');
        const diff = latestPeso - this.metaPeso;
        if (Math.abs(diff) < 0.05) {
            el.textContent = `🎯 Você atingiu a meta de ${this.fmtKg(this.metaPeso)}!`;
        } else {
            const faltam = Math.abs(diff).toFixed(1).replace('.', ',');
            const dir = diff > 0 ? 'acima' : 'abaixo';
            el.textContent = `Faltam ${faltam} kg para a meta de ${this.fmtKg(this.metaPeso)} (você está ${dir}).`;
        }
    }

    // ----- Filtro de período do gráfico -----

    setupRangeButtons() {
        const container = document.getElementById('filtroPeriodo');
        if (!container) return;
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.range-btn');
            if (!btn) return;
            const r = btn.dataset.range;
            this.currentRange = r === 'all' ? null : Number(r);
            this.highlightRange(btn);
            if (this.chart) this.chart.updateChart(this.currentRange);
        });
        const def = container.querySelector('[data-range="all"]');
        if (def) this.highlightRange(def);
    }

    highlightRange(activeBtn) {
        const container = document.getElementById('filtroPeriodo');
        if (!container) return;
        container.querySelectorAll('.range-btn').forEach((b) => {
            const active = b === activeBtn;
            b.classList.toggle('border-orange-500', active);
            b.classList.toggle('text-orange-400', active);
            b.classList.toggle('bg-orange-500/10', active);
            b.classList.toggle('border-zinc-700', !active);
            b.classList.toggle('text-zinc-300', !active);
        });
    }

    // ----- Exportar gráfico como imagem -----

    exportImage() {
        if (!this.chart) return;
        const dataUrl = this.chart.exportAsImage();
        if (!dataUrl) {
            this.showErrorMessage('Nada para exportar ainda.');
            return;
        }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'peso-grafico.png';
        a.click();
    }

    // ----- Perfil público -----

    /** Mostra o card de perfil público só quando autenticado e com Firebase disponível. */
    updateProfileCardVisibility() {
        const card = document.getElementById('cardPerfilPublico');
        const visible = this.isAuthenticated && firebaseManager.isAvailable();
        if (card) card.classList.toggle('hidden', !visible);
    }

    async loadProfileForUser() {
        this.updateProfileCardVisibility();
        if (!firebaseManager.isAvailable()) {
            this.isProfilePublic = false;
            this.applyProfileToggleUI(false);
            return;
        }
        this.isProfilePublic = await firebaseManager.loadProfileVisibility();
        this.applyProfileToggleUI(this.isProfilePublic);
    }

    applyProfileToggleUI(isPublic) {
        const btn = document.getElementById('btnTogglePublico');
        const knob = document.getElementById('togglePublicoKnob');
        const estado = document.getElementById('perfilPublicoEstado');
        if (btn) {
            btn.setAttribute('aria-checked', isPublic ? 'true' : 'false');
            btn.classList.toggle('bg-orange-500', isPublic);
            btn.classList.toggle('border-orange-500', isPublic);
            btn.classList.toggle('bg-zinc-700', !isPublic);
            btn.classList.toggle('border-zinc-600', !isPublic);
        }
        if (knob) {
            knob.classList.toggle('translate-x-6', isPublic);
            knob.classList.toggle('translate-x-1', !isPublic);
        }
        if (estado) {
            estado.textContent = isPublic
                ? 'Seu perfil está público — outros veem sua evolução.'
                : 'Seu perfil está privado.';
        }
    }

    async toggleProfilePublic() {
        if (!firebaseManager.isAvailable()) {
            this.showErrorMessage('Recurso disponível apenas conectado à conta.');
            return;
        }
        const novo = !this.isProfilePublic;
        if (novo) {
            const ok = await this.confirmAction({
                title: 'Tornar perfil público',
                message:
                    'Seu gráfico de evolução de peso ficará visível para outros usuários do app. Deseja continuar?',
                confirmLabel: 'Tornar público',
            });
            if (!ok) return;
        }
        try {
            const displayName = firebaseManager.getCurrentUserDisplayName();
            const evolucao = novo ? await weightDB.getEvolucaoSnapshot() : [];
            await firebaseManager.setProfilePublic(novo, displayName, evolucao);
            this.isProfilePublic = novo;
            this.applyProfileToggleUI(novo);
            this.showSuccessMessage(novo ? 'Perfil público ativado.' : 'Perfil voltou a ser privado.');
        } catch {
            this.showErrorMessage('Não foi possível atualizar o perfil.');
        }
    }

    /** Regrava o snapshot público após alterar registros (silencioso). */
    async syncPublicProfile() {
        if (!this.isProfilePublic || !firebaseManager.isAvailable()) return;
        try {
            const displayName = firebaseManager.getCurrentUserDisplayName();
            const evolucao = await weightDB.getEvolucaoSnapshot();
            await firebaseManager.updatePublicEvolucao(displayName, evolucao);
        } catch {
            /* sync de fundo — ignora falhas */
        }
    }

    openExplorar() {
        const modal = document.getElementById('modalExplorar');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        this.explorarModalOpen = true;
        this.showExplorarLista();
        void this.loadPublicProfiles();
        requestAnimationFrame(() => document.getElementById('btnFecharExplorar')?.focus());
    }

    closeExplorar() {
        const modal = document.getElementById('modalExplorar');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        this.explorarModalOpen = false;
        this.destroyProfileChart();
    }

    destroyProfileChart() {
        if (this.profileChart) {
            this.profileChart.destroy();
            this.profileChart = null;
        }
    }

    showExplorarLista() {
        document.getElementById('explorarLista')?.classList.remove('hidden');
        document.getElementById('explorarDetalhe')?.classList.add('hidden');
        this.destroyProfileChart();
    }

    async loadPublicProfiles() {
        const ul = document.getElementById('explorarPerfis');
        const vazio = document.getElementById('explorarVazio');
        if (!ul) return;
        ul.innerHTML = '';

        let perfis = [];
        try {
            perfis = await firebaseManager.listPublicProfiles();
        } catch {
            perfis = [];
        }
        this._publicProfiles = perfis;

        if (perfis.length === 0) {
            vazio?.classList.remove('hidden');
            return;
        }
        vazio?.classList.add('hidden');

        for (const p of perfis) {
            const li = document.createElement('li');
            li.className =
                'flex items-center justify-between gap-2 py-3 px-3 cursor-pointer hover:bg-zinc-950/40';
            li.dataset.uid = p.uid;

            const nome = document.createElement('span');
            nome.className = 'text-sm font-medium text-zinc-200';
            nome.textContent = p.displayName;

            const meta = document.createElement('span');
            meta.className = 'text-xs text-zinc-500';
            meta.textContent = `${p.evolucao.length} registro(s) →`;

            li.appendChild(nome);
            li.appendChild(meta);
            ul.appendChild(li);
        }
    }

    showProfileDetail(uid) {
        const perfil = (this._publicProfiles || []).find((p) => p.uid === uid);
        if (!perfil) return;

        document.getElementById('explorarLista')?.classList.add('hidden');
        document.getElementById('explorarDetalhe')?.classList.remove('hidden');
        const nome = document.getElementById('explorarPerfilNome');
        if (nome) nome.textContent = perfil.displayName;

        const pts = Array.isArray(perfil.evolucao) ? perfil.evolucao : [];
        const vazio = document.getElementById('graficoPerfilVazio');
        if (vazio) vazio.classList.toggle('hidden', pts.length > 0);

        // Cria a instância read-only só depois que o canvas está visível (tamanho correto).
        if (!this.profileChart) {
            this.profileChart = new WeightChart('graficoPerfil', { live: false });
        }
        this.profileChart.renderPoints(pts, perfil.meta);
    }

    showSuccessMessage(message) {
        this.showMessage(message, 'success');
    }

    showErrorMessage(message) {
        this.showMessage(message, 'error');
    }

    showMessage(message, type = 'info') {
        // Criar elemento de mensagem
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${
            type === 'success' ? 'msg-success' :
            type === 'error' ? 'msg-error' :
            'msg-info'
        }`;
        messageDiv.setAttribute('role', 'status');
        messageDiv.setAttribute('aria-live', 'polite');
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        // Remover após 3 segundos
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }

    // Exporta os registros como CSV (abre no Excel/Sheets)
    async exportData() {
        const csv = await weightDB.exportData();
        // BOM para o Excel reconhecer UTF-8
        const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'peso-dados.csv';
        a.click();

        URL.revokeObjectURL(url);
    }

    async importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        await weightDB.importData(e.target.result);
                        this.showSuccessMessage('Dados importados com sucesso!');
                        await this.updateChart();
                        await this.refreshListaRegistros();
                        await this.refreshTodayState();
                        void this.syncPublicProfile();
                    } catch (error) {
                        const msg =
                            error instanceof Error && error.message
                                ? error.message
                                : 'Erro ao importar dados';
                        this.showErrorMessage(msg);
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    async clearAllData() {
        const ok = await this.confirmAction({
            title: 'Apagar todos os dados',
            message: 'Tem certeza que deseja apagar todos os dados? Esta ação não pode ser desfeita.',
            confirmLabel: 'Apagar tudo',
        });
        if (!ok) return;
        try {
            await weightDB.clearAllData();
            await this.updateChart();
            await this.refreshListaRegistros();
            await this.refreshTodayState();
            void this.syncPublicProfile();
            this.showSuccessMessage('Todos os dados foram apagados');
        } catch (error) {
            this.showErrorMessage('Erro ao limpar dados: ' + error.message);
        }
    }
}

// Inicializar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.weightApp = new WeightApp();
});
