// Módulo de banco de dados
// Gerencia todas as operações de leitura e escrita
// Integra Firebase com localStorage como fallback

import { firebaseManager } from '../config/firebase.js';

class WeightDatabase {
    constructor() {
        this.registros = this.loadFromLocalStorage();
        this.useFirebase = false;
        this.initializeFirebase();
    }

    // Inicializar Firebase
    async initializeFirebase() {
        try {
            const success = await firebaseManager.initialize();
            if (success) {
                this.useFirebase = true;
                console.log('Usando Firebase como banco de dados');
                
                // Sincronizar dados locais com Firebase
                await this.syncLocalToFirebase();
            } else {
                console.log('Usando localStorage como banco de dados');
            }
        } catch (error) {
            console.error('Erro ao inicializar Firebase:', error);
            console.log('Usando localStorage como banco de dados');
        }
    }

    // Sincronizar dados locais com Firebase
    async syncLocalToFirebase() {
        if (!this.useFirebase || Object.keys(this.registros).length === 0) return;

        try {
            console.log('Sincronizando dados locais com Firebase...');
            
            // Buscar registros existentes no Firebase
            const firebaseRecords = await firebaseManager.getWeightRecords();
            
            if (firebaseRecords.length === 0) {
                // Firebase está vazio, migrar dados locais
                for (const mes in this.registros) {
                    for (const semana in this.registros[mes]) {
                        for (const registro of this.registros[mes][semana]) {
                            await firebaseManager.addWeightRecord({
                                mes: mes,
                                semana: semana,
                                peso: registro.peso,
                                data: registro.data,
                                timestamp: registro.timestamp
                            });
                        }
                    }
                }
                console.log('Dados locais migrados para Firebase');
            }
        } catch (error) {
            console.error('Erro ao sincronizar dados:', error);
        }
    }

    // Carregar dados do localStorage (fallback)
    loadFromLocalStorage() {
        try {
            return JSON.parse(localStorage.getItem('registrosPeso')) || {};
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            return {};
        }
    }

    // Salvar dados no localStorage (fallback)
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
    async addWeightRecord(mes, semana, peso) {
        if (!peso || peso <= 0) {
            throw new Error('Peso inválido');
        }

        const registro = {
            peso: peso,
            data: new Date().toLocaleDateString('pt-BR'),
            timestamp: Date.now()
        };

        try {
            if (this.useFirebase) {
                // Salvar no Firebase
                const recordId = await firebaseManager.addWeightRecord({
                    mes: mes,
                    semana: semana,
                    peso: peso,
                    data: registro.data,
                    timestamp: registro.timestamp
                });
                
                // Adicionar ID do Firebase ao registro
                registro.id = recordId;
                
                // Atualizar dados locais
                if (!this.registros[mes]) {
                    this.registros[mes] = {};
                }
                if (!this.registros[mes][semana]) {
                    this.registros[mes][semana] = [];
                }
                this.registros[mes][semana].push(registro);
                
                console.log('Registro salvo no Firebase:', recordId);
            } else {
                // Fallback para localStorage
                if (!this.registros[mes]) {
                    this.registros[mes] = {};
                }
                if (!this.registros[mes][semana]) {
                    this.registros[mes][semana] = [];
                }

                this.registros[mes][semana].push(registro);
                
                if (!this.saveToLocalStorage()) {
                    throw new Error('Erro ao salvar registro');
                }
            }

            return registro;
        } catch (error) {
            console.error('Erro ao salvar registro:', error);
            
            // Fallback para localStorage em caso de erro
            if (!this.registros[mes]) {
                this.registros[mes] = {};
            }
            if (!this.registros[mes][semana]) {
                this.registros[mes][semana] = [];
            }

            this.registros[mes][semana].push(registro);
            this.saveToLocalStorage();
            
            throw new Error('Erro ao salvar no Firebase, usando localStorage como fallback');
        }
    }

    // Obter todos os registros para o gráfico
    async getAllRecords() {
        try {
            if (this.useFirebase) {
                // Buscar do Firebase
                const firebaseRecords = await firebaseManager.getWeightRecords();
                
                // Converter para formato local
                const dados = [];
                const labels = [];
                
                firebaseRecords.forEach(registro => {
                    labels.push(`${registro.mes} - Semana ${registro.semana}`);
                    dados.push(registro.peso);
                });
                
                return { dados, labels };
            } else {
                // Usar dados locais
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
        } catch (error) {
            console.error('Erro ao buscar registros:', error);
            
            // Fallback para dados locais
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
    }

    // Obter registros de um mês específico
    getRecordsByMonth(mes) {
        return this.registros[mes] || {};
    }

    // Limpar todos os dados
    async clearAllData() {
        try {
            if (this.useFirebase) {
                // Limpar no Firebase
                const firebaseRecords = await firebaseManager.getWeightRecords();
                for (const record of firebaseRecords) {
                    await firebaseManager.deleteWeightRecord(record.id);
                }
                console.log('Dados limpos do Firebase');
            }
            
            // Limpar dados locais
            this.registros = {};
            localStorage.removeItem('registrosPeso');
        } catch (error) {
            console.error('Erro ao limpar dados:', error);
            
            // Fallback para limpeza local
            this.registros = {};
            localStorage.removeItem('registrosPeso');
        }
    }

    // Exportar dados
    exportData() {
        return JSON.stringify(this.registros, null, 2);
    }

    // Importar dados
    async importData(dataString) {
        try {
            const data = JSON.parse(dataString);
            
            if (this.useFirebase) {
                // Limpar dados existentes no Firebase
                const firebaseRecords = await firebaseManager.getWeightRecords();
                for (const record of firebaseRecords) {
                    await firebaseManager.deleteWeightRecord(record.id);
                }
                
                // Importar novos dados para Firebase
                for (const mes in data) {
                    for (const semana in data[mes]) {
                        for (const registro of data[mes][semana]) {
                            await firebaseManager.addWeightRecord({
                                mes: mes,
                                semana: semana,
                                peso: registro.peso,
                                data: registro.data,
                                timestamp: registro.timestamp
                            });
                        }
                    }
                }
                console.log('Dados importados para Firebase');
            }
            
            // Atualizar dados locais
            this.registros = data;
            this.saveToLocalStorage();
            
            return true;
        } catch (error) {
            console.error('Erro ao importar dados:', error);
            return false;
        }
    }

    // Verificar status do Firebase
    isFirebaseAvailable() {
        return this.useFirebase;
    }

    // Obter estatísticas de sincronização
    getSyncStatus() {
        return {
            usingFirebase: this.useFirebase,
            localRecords: Object.keys(this.registros).length,
            firebaseAvailable: firebaseManager.isAvailable()
        };
    }
}

// Exportar instância única
export const weightDB = new WeightDatabase();
