// Módulo principal da aplicação
// Coordena todos os outros módulos e gerencia a interface

import { weightDB } from './database.js';
import { WeightChart } from './chart.js';

class WeightApp {
    constructor() {
        this.chart = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeChart();
        this.loadInitialData();
    }

    setupEventListeners() {
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

    initializeChart() {
        this.chart = new WeightChart('graficoPeso');
    }

    loadInitialData() {
        // Carregar dados existentes
        this.updateChart();
        this.updateStatistics();
    }

    addWeightRecord() {
        const mes = document.getElementById('mes').value;
        const semana = document.getElementById('semana').value;
        const peso = parseFloat(document.getElementById('peso').value);

        try {
            const registro = weightDB.addWeightRecord(mes, semana, peso);
            
            // Limpar campo de peso
            document.getElementById('peso').value = '';
            
            // Atualizar gráfico
            this.updateChart();
            
            // Mostrar feedback
            this.showSuccessMessage('Registro adicionado com sucesso!');
            
        } catch (error) {
            this.showErrorMessage(error.message);
        }
    }

    updateChart() {
        if (this.chart) {
            this.chart.refresh();
        }
        this.updateStatistics();
    }

    updateStatistics() {
        const { dados } = weightDB.getAllRecords();
        
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

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (weightDB.importData(e.target.result)) {
                        this.showSuccessMessage('Dados importados com sucesso!');
                        this.updateChart();
                    } else {
                        this.showErrorMessage('Erro ao importar dados');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    clearAllData() {
        if (confirm('Tem certeza que deseja apagar todos os dados? Esta ação não pode ser desfeita.')) {
            weightDB.clearAllData();
            this.updateChart();
            this.showSuccessMessage('Todos os dados foram apagados');
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
