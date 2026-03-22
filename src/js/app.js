// Módulo principal da aplicação
// Coordena todos os outros módulos e gerencia a interface
// Agora com suporte a autenticação completa (email/senha)

import { weightDB } from './database.js';
import { WeightChart } from './chart.js';
import { firebaseManager } from '../config/firebase.js';

const MONTH_KEYS = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const MONTH_LABELS_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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
        this.checkAuthState();
    }

    /** Mês e semana a partir da data de hoje (chave + valor da semana 1–4) */
    getCurrentPeriod() {
        const d = new Date();
        const mes = MONTH_KEYS[d.getMonth()];
        const semana = String(Math.min(4, Math.max(1, Math.ceil(d.getDate() / 7))));
        return { mes, semana };
    }

    /** Texto legível para o período automático */
    formatPeriodLabel(date = new Date()) {
        const semana = Math.min(4, Math.max(1, Math.ceil(date.getDate() / 7)));
        return `${MONTH_LABELS_PT[date.getMonth()]} de ${date.getFullYear()} · Semana ${semana}`;
    }

    /** Atualiza o texto que explica onde o registo será guardado */
    updatePeriodoResumo() {
        const el = document.getElementById('periodoResumo');
        if (!el) return;
        el.textContent = `Usa a data de hoje — ${this.formatPeriodLabel(new Date())}.`;
    }

    // Verificar estado inicial de autenticação (sessão já disponível de forma síncrona)
    async checkAuthState() {
        await firebaseManager.initialize();
        if (firebaseManager.isAuthenticated()) {
            this.isAuthenticated = true;
            this.currentUser = firebaseManager.getCurrentUser();
            this.updateAuthUI();
            await this.loadThemeForUser();
            this.loadInitialData();
            this.hideLandingScreen();
            try {
                localStorage.setItem(SKIP_LANDING_KEY, '1');
            } catch {
                /* ignore */
            }
        }
        // Sem sessão síncrona: landing vs login é decidido em userAuthChanged (restauro assíncrono)
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
                this.loadInitialData();
            } else {
                console.log('Usuário desautenticado');
                this.applyTheme('dark');
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

        const listaRegistros = document.getElementById('listaRegistros');
        if (listaRegistros) {
            listaRegistros.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action="editar"]');
                if (!btn) return;
                const id = btn.dataset.firebaseId || null;
                const localId = btn.dataset.localId || null;
                const label = btn.dataset.label || '';
                this.openEditModal({ id, localId, label, peso: btn.dataset.peso });
            });
        }

        document.getElementById('btnCancelarEditarPeso')?.addEventListener('click', () => this.closeEditModal());
        document.getElementById('btnGuardarEditarPeso')?.addEventListener('click', () => this.saveEditPeso());
        document.getElementById('modalEditarPeso')?.addEventListener('click', (e) => {
            if (e.target.id === 'modalEditarPeso') this.closeEditModal();
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

    // Manipular redefinição de senha
    async handleResetPassword() {
        const email = document.getElementById('resetEmail').value.trim();

        if (!email) {
            this.showErrorMessage('Por favor, digite seu email');
            return;
        }

        try {
            await firebaseManager.resetPassword(email);
            this.showSuccessMessage('Email de redefinição enviado! Verifique sua caixa de entrada');
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
    }

    async refreshListaRegistros() {
        const ul = document.getElementById('listaRegistros');
        const empty = document.getElementById('listaRegistrosVazia');
        if (!ul) return;

        ul.innerHTML = '';

        if (!this.isAuthenticated) {
            if (empty) {
                empty.classList.remove('hidden');
                empty.textContent = 'Inicia sessão para ver os registos.';
            }
            return;
        }

        try {
            const rows = await weightDB.getRecordsForEditList(20);
            if (rows.length === 0) {
                if (empty) {
                    empty.classList.remove('hidden');
                    empty.textContent = 'Ainda não há registos.';
                }
                return;
            }
            if (empty) empty.classList.add('hidden');

            for (const r of rows) {
                const li = document.createElement('li');
                li.className =
                    'flex flex-wrap items-center justify-between gap-2 py-2.5 px-3 bg-zinc-950/40';

                const info = document.createElement('span');
                info.className = 'text-sm text-zinc-300';
                const pesoFmt =
                    typeof r.peso === 'number' ? r.peso.toFixed(1) : String(r.peso);
                info.textContent = `${r.label} · `;
                const strong = document.createElement('strong');
                strong.className = 'text-orange-400';
                strong.textContent = `${pesoFmt} kg`;
                info.appendChild(strong);

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className =
                    'shrink-0 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-orange-500/50';
                btn.textContent = 'Corrigir';
                btn.dataset.action = 'editar';
                btn.dataset.label = r.label;
                btn.dataset.peso = String(r.peso);
                if (r.id) btn.dataset.firebaseId = r.id;
                if (r.localId) btn.dataset.localId = r.localId;

                li.appendChild(info);
                li.appendChild(btn);
                ul.appendChild(li);
            }
        } catch (err) {
            console.error(err);
            if (empty) {
                empty.classList.remove('hidden');
                empty.textContent = 'Não foi possível carregar a lista.';
            }
        }
    }

    openEditModal({ id, localId, label, peso }) {
        this.editTarget = { id, localId, label };
        const modal = document.getElementById('modalEditarPeso');
        const ctx = document.getElementById('editarPesoContexto');
        const input = document.getElementById('editarPesoValor');
        if (ctx) ctx.textContent = label;
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
        const novo = parseFloat(input?.value);
        if (!novo || novo <= 0) {
            this.showErrorMessage('Indica um peso válido');
            return;
        }
        try {
            await weightDB.updateWeightRecord({
                id: this.editTarget.id,
                localId: this.editTarget.localId,
                peso: novo,
            });
            this.closeEditModal();
            this.showSuccessMessage('Peso atualizado.');
            await this.updateChart();
            await this.refreshListaRegistros();
        } catch (err) {
            this.showErrorMessage(err.message || 'Erro ao atualizar');
        }
    }

    // Limpar dados da interface
    clearData() {
        if (this.chart) {
            this.chart.clear();
        }
        this.updateStatistics();
        void this.refreshListaRegistros();
    }

    async addWeightRecord() {
        if (!this.isAuthenticated) {
            this.showErrorMessage('Usuário não autenticado. Faça login primeiro.');
            return;
        }

        const { mes, semana } = this.getCurrentPeriod();
        const peso = parseFloat(document.getElementById('peso').value);

        if (!peso || peso <= 0) {
            this.showErrorMessage('Por favor, insira um peso válido');
            return;
        }

        try {
            await weightDB.addWeightRecord(mes, semana, peso);

            // Limpar campo de peso
            document.getElementById('peso').value = '';
            
            // Atualizar gráfico
            await this.updateChart();
            
            // Mostrar feedback
            this.showSuccessMessage('Registro adicionado com sucesso!');
            this.updatePeriodoResumo();
            await this.refreshListaRegistros();
        } catch (error) {
            this.showErrorMessage(error.message);
        }
    }

    async updateChart() {
        if (this.chart) {
            await this.chart.refresh();
        }
        await this.updateStatistics();
    }

    async updateStatistics() {
        try {
            const { latestPeso, total } = await weightDB.getLatestPesoAndCount();

            const pesoAtualEl = document.getElementById('pesoAtual');
            if (pesoAtualEl) {
                if (latestPeso != null && Number.isFinite(latestPeso)) {
                    pesoAtualEl.textContent = `${latestPeso.toFixed(1)} kg`;
                } else {
                    pesoAtualEl.textContent = '--';
                }
            }

            const totalRegistrosEl = document.getElementById('totalRegistros');
            if (totalRegistrosEl) {
                totalRegistrosEl.textContent = total;
            }
        } catch (error) {
            console.error('Erro ao atualizar estatísticas:', error);
        }
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

    // Métodos para funcionalidades futuras
    exportData() {
        const data = weightDB.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'peso-dados.json';
        a.click();
        
        URL.revokeObjectURL(url);
    }

    async importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
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
        if (confirm('Tem certeza que deseja apagar todos os dados? Esta ação não pode ser desfeita.')) {
            try {
                await weightDB.clearAllData();
                await this.updateChart();
                await this.refreshListaRegistros();
                this.showSuccessMessage('Todos os dados foram apagados');
            } catch (error) {
                this.showErrorMessage('Erro ao limpar dados: ' + error.message);
            }
        }
    }
}

// Inicializar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.weightApp = new WeightApp();
});

// Função global para compatibilidade (será removida depois)
window.adicionarPeso = function() {
    if (window.weightApp) {
        window.weightApp.addWeightRecord();
    }
};
