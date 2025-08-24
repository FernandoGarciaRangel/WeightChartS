// Módulo principal da aplicação
// Coordena todos os outros módulos e gerencia a interface
// Agora com suporte a autenticação completa (email/senha)

import { weightDB } from './database.js';
import { WeightChart } from './chart.js';
import { firebaseManager } from '../config/firebase.js';

class WeightApp {
    constructor() {
        this.chart = null;
        this.isAuthenticated = false;
        this.currentUser = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeChart();
        this.setupAuthListener();
        this.checkAuthState();
    }

    // Verificar estado inicial de autenticação
    async checkAuthState() {
        if (firebaseManager.isAuthenticated()) {
            this.isAuthenticated = true;
            this.currentUser = firebaseManager.getCurrentUser();
            this.updateAuthUI();
            this.loadInitialData();
        } else {
            this.showAuthScreen();
        }
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
                this.hideAuthScreen();
                this.loadInitialData();
            } else {
                console.log('Usuário desautenticado');
                this.clearData();
                this.showAuthScreen();
            }
        });
    }

    // Mostrar tela de autenticação
    showAuthScreen() {
        const authScreen = document.getElementById('authScreen');
        if (authScreen) {
            authScreen.classList.remove('hidden');
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
                authStatus.textContent = '✅ Conectado';
                authStatus.className = 'text-green-600 text-sm font-medium';
            } else {
                authStatus.textContent = '❌ Desconectado';
                authStatus.className = 'text-red-600 text-sm font-medium';
            }
        }
        
        if (userInfo) {
            if (this.isAuthenticated) {
                const displayName = firebaseManager.getCurrentUserDisplayName();
                userInfo.textContent = `Olá, ${displayName}!`;
                userInfo.className = 'text-gray-600 text-xs';
            } else {
                userInfo.textContent = 'Não autenticado';
                userInfo.className = 'text-gray-400 text-xs';
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

        // Seleção de mês
        const mesSelect = document.getElementById('mes');
        if (mesSelect) {
            mesSelect.addEventListener('change', () => this.onMonthChange());
        }

        // Seleção de semana
        const semanaSelect = document.getElementById('semana');
        if (semanaSelect) {
            semanaSelect.addEventListener('change', () => this.onWeekChange());
        }

        // Input de peso
        const pesoInput = document.getElementById('peso');
        if (pesoInput) {
            pesoInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
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
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => this.handleLogout());
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
        const loginPassword = document.getElementById('loginPassword');
        if (loginPassword) {
            loginPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleLogin();
            });
        }

        const registerPassword = document.getElementById('registerPassword');
        if (registerPassword) {
            registerPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleRegister();
            });
        }

        const resetEmail = document.getElementById('resetEmail');
        if (resetEmail) {
            resetEmail.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleResetPassword();
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
            await firebaseManager.signUp(email, password, name);
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
        // Carregar dados existentes
        this.updateChart();
        this.updateStatistics();
    }

    // Limpar dados da interface
    clearData() {
        if (this.chart) {
            this.chart.clear();
        }
        this.updateStatistics();
    }

    async addWeightRecord() {
        if (!this.isAuthenticated) {
            this.showErrorMessage('Usuário não autenticado. Faça login primeiro.');
            return;
        }

        const mes = document.getElementById('mes').value;
        const semana = document.getElementById('semana').value;
        const peso = parseFloat(document.getElementById('peso').value);

        if (!peso || peso <= 0) {
            this.showErrorMessage('Por favor, insira um peso válido');
            return;
        }

        try {
            const registro = await weightDB.addWeightRecord(mes, semana, peso);
            
            // Limpar campo de peso
            document.getElementById('peso').value = '';
            
            // Atualizar gráfico
            await this.updateChart();
            
            // Mostrar feedback
            this.showSuccessMessage('Registro adicionado com sucesso!');
            
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
            const { dados } = await weightDB.getAllRecords();
            
            // Atualizar peso atual (último registro)
            const pesoAtualEl = document.getElementById('pesoAtual');
            if (pesoAtualEl) {
                if (dados.length > 0) {
                    pesoAtualEl.textContent = `${dados[dados.length - 1]} kg`;
                } else {
                    pesoAtualEl.textContent = '--';
                }
            }
            
            // Atualizar total de registros
            const totalRegistrosEl = document.getElementById('totalRegistros');
            if (totalRegistrosEl) {
                totalRegistrosEl.textContent = dados.length;
            }
        } catch (error) {
            console.error('Erro ao atualizar estatísticas:', error);
        }
    }

    onMonthChange() {
        // Atualizar interface baseada no mês selecionado
        this.updateChart();
    }

    onWeekChange() {
        // Atualizar interface baseada na semana selecionada
        this.updateChart();
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
            type === 'success' ? 'bg-green-500' : 
            type === 'error' ? 'bg-red-500' : 
            'bg-blue-500'
        }`;
        messageDiv.textContent = message;

        // Adicionar ao DOM
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
                        if (await weightDB.importData(e.target.result)) {
                            this.showSuccessMessage('Dados importados com sucesso!');
                            await this.updateChart();
                        } else {
                            this.showErrorMessage('Erro ao importar dados');
                        }
                    } catch (error) {
                        this.showErrorMessage('Erro ao importar dados: ' + error.message);
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
