// Módulo de banco de dados
// Gerencia todas as operações de leitura e escrita
// Integra Firebase com localStorage como fallback
// Agora com suporte a autenticação e usuários específicos

import { firebaseManager } from '../config/firebase.js';

class WeightDatabase {
    constructor() {
        this.registros = this.loadFromLocalStorage();
        this.useFirebase = false;
        this.currentUserId = null;
        this.initializeFirebase();
        this.setupAuthListener();
    }

    // Configurar listener de autenticação
    setupAuthListener() {
        window.addEventListener('userAuthChanged', (event) => {
            const user = event.detail.user;
            if (user) {
                this.currentUserId = user.uid;
                console.log('Usuário autenticado no banco:', this.currentUserId);
                // Recarregar dados quando usuário mudar
                this.loadData();
            } else {
                this.currentUserId = null;
                console.log('Usuário desautenticado');
                // Limpar dados quando usuário sair
                this.registros = {};
            }
        });
    }

    // Inicializar Firebase
    async initializeFirebase() {
        try {
            const success = await firebaseManager.initialize();
            if (success) {
                this.useFirebase = true;
                console.log('Usando Firebase como banco de dados');
                
                // Aguardar autenticação antes de sincronizar
                if (firebaseManager.isAuthenticated()) {
                    this.currentUserId = firebaseManager.getCurrentUserId();
                    await this.syncLocalToFirebase();
                }
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
        if (!this.useFirebase || !this.currentUserId || Object.keys(this.registros).length === 0) return;

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
            const userId = this.currentUserId || 'anonymous';
            const key = `registrosPeso_${userId}`;
            return JSON.parse(localStorage.getItem(key)) || {};
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            return {};
        }
    }

    // Salvar dados no localStorage (fallback)
    saveToLocalStorage() {
        try {
            const userId = this.currentUserId || 'anonymous';
            const key = `registrosPeso_${userId}`;
            localStorage.setItem(key, JSON.stringify(this.registros));
            return true;
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            return false;
        }
    }

    // Carregar dados (Firebase ou localStorage)
    async loadData() {
        if (this.useFirebase && this.currentUserId) {
            try {
                const firebaseRecords = await firebaseManager.getWeightRecords();
                this.registros = this.convertFirebaseToLocal(firebaseRecords);
                console.log('Dados carregados do Firebase');
            } catch (error) {
                console.error('Erro ao carregar do Firebase, usando localStorage:', error);
                this.registros = this.loadFromLocalStorage();
            }
        } else {
            this.registros = this.loadFromLocalStorage();
        }
    }

    // Converter dados do Firebase para formato local
    convertFirebaseToLocal(firebaseRecords) {
        const localData = {};
        
        firebaseRecords.forEach(record => {
            const { mes, semana, peso, data, timestamp } = record;
            
            if (!localData[mes]) {
                localData[mes] = {};
            }
            if (!localData[mes][semana]) {
                localData[mes][semana] = [];
            }
            
            localData[mes][semana].push({
                peso,
                data,
                timestamp
            });
        });
        
        return localData;
    }

    // Adicionar novo registro de peso
    async addWeightRecord(mes, semana, peso) {
        if (!peso || peso <= 0) {
            throw new Error('Peso inválido');
        }

        if (!this.currentUserId && this.useFirebase) {
            throw new Error('Usuário não autenticado');
        }

        const registro = {
            peso: peso,
            data: new Date().toLocaleDateString('pt-BR'),
            timestamp: Date.now()
        };

        try {
            if (this.useFirebase) {
                // Salvar no Firebase
                await firebaseManager.addWeightRecord({
                    mes: mes,
                    semana: semana,
                    peso: peso,
                    data: registro.data,
                    timestamp: registro.timestamp
                });
                
                // Atualizar dados locais
                await this.loadData();
            } else {
                // Salvar no localStorage
                if (!this.registros[mes]) {
                    this.registros[mes] = {};
                }
                if (!this.registros[mes][semana]) {
                    this.registros[mes][semana] = [];
                }
                
                this.registros[mes][semana].push(registro);
                this.saveToLocalStorage();
            }
            
            return registro;
            
        } catch (error) {
            console.error('Erro ao adicionar registro:', error);
            throw error;
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
