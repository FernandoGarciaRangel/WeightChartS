// Módulo de banco de dados
// Gerencia todas as operações de leitura e escrita

class WeightDatabase {
    constructor() {
        this.registros = this.loadFromLocalStorage();
    }

    // Carregar dados do localStorage (temporário até Firebase)
    loadFromLocalStorage() {
        try {
            return JSON.parse(localStorage.getItem('registrosPeso')) || {};
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            return {};
        }
    }

    // Salvar dados no localStorage (temporário até Firebase)
    saveToLocalStorage() {
        try {
            localStorage.setItem('registrosPeso', JSON.stringify(this.registros));
            return true;
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            return false;
        }
    }

    // Adicionar novo registro de peso
    addWeightRecord(mes, semana, peso) {
        if (!peso || peso <= 0) {
            throw new Error('Peso inválido');
        }

        if (!this.registros[mes]) {
            this.registros[mes] = {};
        }
        if (!this.registros[mes][semana]) {
            this.registros[mes][semana] = [];
        }

        const registro = {
            peso: peso,
            data: new Date().toLocaleDateString('pt-BR'),
            timestamp: Date.now()
        };

        this.registros[mes][semana].push(registro);
        
        if (this.saveToLocalStorage()) {
            return registro;
        } else {
            throw new Error('Erro ao salvar registro');
        }
    }

    // Obter todos os registros para o gráfico
    getAllRecords() {
        const dados = [];
        const labels = [];

        Object.keys(this.registros).sort().forEach(mes => {
            Object.keys(this.registros[mes]).sort().forEach(semana => {
                this.registros[mes][semana].forEach(registro => {
                    labels.push(`${mes} - Semana ${semana}`);
                    dados.push(registro.peso);
                });
            });
        });

        return { dados, labels };
    }

    // Obter registros de um mês específico
    getRecordsByMonth(mes) {
        return this.registros[mes] || {};
    }

    // Limpar todos os dados
    clearAllData() {
        this.registros = {};
        localStorage.removeItem('registrosPeso');
    }

    // Exportar dados
    exportData() {
        return JSON.stringify(this.registros, null, 2);
    }

    // Importar dados
    importData(dataString) {
        try {
            const data = JSON.parse(dataString);
            this.registros = data;
            this.saveToLocalStorage();
            return true;
        } catch (error) {
            console.error('Erro ao importar dados:', error);
            return false;
        }
    }
}

// Exportar instância única
export const weightDB = new WeightDatabase();
