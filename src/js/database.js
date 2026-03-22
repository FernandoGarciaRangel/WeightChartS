// Módulo de banco de dados
// Gerencia todas as operações de leitura e escrita
// Integra Firebase com localStorage como fallback
// Agora com suporte a autenticação e usuários específicos

import { firebaseManager } from '../config/firebase.js';

/** Ordem dos meses (valores dos <option>) para ordenação cronológica */
const MONTH_ORDER = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function sortMesKeys(meses) {
    return [...meses].sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
}

const MONTH_LABELS_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MES_KEY_TO_LABEL = {
    janeiro: 'Janeiro',
    fevereiro: 'Fevereiro',
    marco: 'Março',
    abril: 'Abril',
    maio: 'Maio',
    junho: 'Junho',
    julho: 'Julho',
    agosto: 'Agosto',
    setembro: 'Setembro',
    outubro: 'Outubro',
    novembro: 'Novembro',
    dezembro: 'Dezembro',
};

/** Firestore pode devolver Timestamp em vez de número. */
function toMillis(ts) {
    if (ts == null) return null;
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    if (typeof ts === 'object' && typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts === 'object' && typeof ts.seconds === 'number') return ts.seconds * 1000;
    return null;
}

/** Texto de período alinhado com a data real do registo (fuso local). */
function formatPeriodLabelFromTs(ms) {
    if (ms == null || !Number.isFinite(ms)) return null;
    const d = new Date(ms);
    const monthName = MONTH_LABELS_PT[d.getMonth()];
    const year = d.getFullYear();
    const week = Math.min(4, Math.max(1, Math.ceil(d.getDate() / 7)));
    return `${monthName} de ${year} · Semana ${week}`;
}

/**
 * Rótulo para UI (lista de correção, eixo do gráfico): prioriza timestamp;
 * se não houver, usa mes/semana guardados com nomes corretos em PT.
 */
function recordPeriodLabel(record) {
    const ms = toMillis(record.timestamp);
    const fromTs = ms != null ? formatPeriodLabelFromTs(ms) : null;
    if (fromTs) return fromTs;
    const mesKey = record.mes;
    const semana = record.semana != null ? record.semana : '';
    const prettyMes = MES_KEY_TO_LABEL[mesKey] || mesKey || '?';
    return `${prettyMes} · Semana ${semana}`.trim();
}

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

    // Converter dados do Firebase para formato local (mantém id do documento para edição)
    convertFirebaseToLocal(firebaseRecords) {
        const localData = {};
        
        firebaseRecords.forEach((record) => {
            const { id, mes, semana, peso, data, timestamp } = record;
            
            if (!localData[mes]) {
                localData[mes] = {};
            }
            if (!localData[mes][semana]) {
                localData[mes][semana] = [];
            }
            
            localData[mes][semana].push({
                id,
                peso,
                data,
                timestamp,
            });
        });
        
        return localData;
    }

    /** Garante localId em cada registo local (dados antigos) */
    migrateLocalIds() {
        let changed = false;
        for (const mes of Object.keys(this.registros)) {
            for (const sem of Object.keys(this.registros[mes])) {
                for (const reg of this.registros[mes][sem]) {
                    if (!reg.localId) {
                        const suffix = Math.random().toString(36).slice(2, 10);
                        reg.localId = `legacy_${reg.timestamp}_${mes}_${sem}_${suffix}`;
                        changed = true;
                    }
                }
            }
        }
        if (changed) {
            this.saveToLocalStorage();
        }
    }

    newLocalId() {
        return typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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
            timestamp: Date.now(),
            localId: this.newLocalId(),
        };

        try {
            if (this.useFirebase) {
                // Salvar no Firebase
                await firebaseManager.addWeightRecord({
                    mes: mes,
                    semana: semana,
                    peso: peso,
                    data: registro.data,
                    timestamp: registro.timestamp,
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

    /** Lista plana ordenada por tempo (mais antigo → mais recente) para gráfico e estatísticas */
    flattenLocalChronological() {
        const flat = [];
        for (const mes of sortMesKeys(Object.keys(this.registros))) {
            const semanas = this.registros[mes];
            if (!semanas) continue;
            for (const semana of Object.keys(semanas).sort((a, b) => Number(a) - Number(b))) {
                for (const registro of semanas[semana]) {
                    flat.push({
                        peso: registro.peso,
                        mes,
                        semana,
                        timestamp: registro.timestamp || 0,
                        id: registro.id || null,
                        localId: registro.localId || null,
                    });
                }
            }
        }
        flat.sort((a, b) => (toMillis(a.timestamp) || 0) - (toMillis(b.timestamp) || 0));
        return flat;
    }

    // Obter todos os registros para o gráfico (cronologia crescente: esquerda = passado)
    async getAllRecords() {
        try {
            if (this.useFirebase && this.currentUserId) {
                const firebaseRecords = await firebaseManager.getWeightRecords();
                const sorted = [...firebaseRecords].sort(
                    (a, b) => (toMillis(a.timestamp) || 0) - (toMillis(b.timestamp) || 0),
                );
                const dados = sorted.map((r) => r.peso);
                const labels = sorted.map((r) => recordPeriodLabel(r).replace(' · ', ' — '));
                return { dados, labels };
            }

            const flat = this.flattenLocalChronological();
            return {
                dados: flat.map((r) => r.peso),
                labels: flat.map((r) => recordPeriodLabel(r).replace(' · ', ' — ')),
            };
        } catch (error) {
            console.error('Erro ao buscar registros:', error);

            const flat = this.flattenLocalChronological();
            return {
                dados: flat.map((r) => r.peso),
                labels: flat.map((r) => recordPeriodLabel(r).replace(' · ', ' — ')),
            };
        }
    }

    // Obter registros de um mês específico
    getRecordsByMonth(mes) {
        return this.registros[mes] || {};
    }

    /**
     * Peso mais recente (maior timestamp) e total de registos — fonte única para estatísticas.
     */
    async getLatestPesoAndCount() {
        try {
            if (this.useFirebase && this.currentUserId) {
                const firebaseRecords = await firebaseManager.getWeightRecords();
                const total = firebaseRecords.length;
                if (total === 0) {
                    return { latestPeso: null, total: 0 };
                }
                let best = firebaseRecords[0];
                let bestMs = toMillis(best.timestamp);
                if (bestMs == null) bestMs = -Infinity;
                for (let i = 1; i < firebaseRecords.length; i++) {
                    const r = firebaseRecords[i];
                    let ms = toMillis(r.timestamp);
                    if (ms == null) ms = -Infinity;
                    let cur = toMillis(best.timestamp);
                    if (cur == null) cur = -Infinity;
                    if (ms > cur) {
                        best = r;
                    }
                }
                const p = best.peso;
                const latestPeso = typeof p === 'number' ? p : parseFloat(String(p).replace(',', '.'));
                return {
                    latestPeso: Number.isFinite(latestPeso) ? latestPeso : null,
                    total,
                };
            }

            const flat = this.flattenLocalChronological();
            const total = flat.length;
            if (total === 0) {
                return { latestPeso: null, total: 0 };
            }
            let best = flat[0];
            let bestMs = toMillis(best.timestamp);
            if (bestMs == null) bestMs = -Infinity;
            for (let i = 1; i < flat.length; i++) {
                const r = flat[i];
                let ms = toMillis(r.timestamp);
                if (ms == null) ms = -Infinity;
                let cur = toMillis(best.timestamp);
                if (cur == null) cur = -Infinity;
                if (ms > cur) {
                    best = r;
                }
            }
            const p = best.peso;
            const latestPeso = typeof p === 'number' ? p : parseFloat(String(p).replace(',', '.'));
            return {
                latestPeso: Number.isFinite(latestPeso) ? latestPeso : null,
                total,
            };
        } catch (error) {
            console.error('Erro em getLatestPesoAndCount:', error);
            return { latestPeso: null, total: 0 };
        }
    }

    /**
     * Lista dos registos mais recentes (para corrigir peso). Limite por defeito 20.
     */
    async getRecordsForEditList(limit = 20) {
        if (this.useFirebase && this.currentUserId) {
            const records = await firebaseManager.getWeightRecords();
            return [...records]
                .sort((a, b) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
                .slice(0, limit)
                .map((r) => ({
                    id: r.id,
                    localId: null,
                    mes: r.mes,
                    semana: r.semana,
                    peso: r.peso,
                    timestamp: r.timestamp,
                    data: r.data,
                    label: recordPeriodLabel(r),
                }));
        }

        this.migrateLocalIds();
        const flat = [];
        for (const mes of sortMesKeys(Object.keys(this.registros))) {
            const semanas = this.registros[mes];
            if (!semanas) continue;
            for (const semana of Object.keys(semanas).sort((a, b) => Number(a) - Number(b))) {
                for (const registro of semanas[semana]) {
                    flat.push({
                        peso: registro.peso,
                        mes,
                        semana,
                        timestamp: registro.timestamp || 0,
                        id: registro.id || null,
                        localId: registro.localId || null,
                        data: registro.data,
                        label: recordPeriodLabel({
                            mes,
                            semana,
                            timestamp: registro.timestamp,
                        }),
                    });
                }
            }
        }
        flat.sort((a, b) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0));
        return flat.slice(0, limit);
    }

    /**
     * Atualiza o peso de um registo (Firebase por id, local por localId).
     */
    async updateWeightRecord({ id, localId, peso }) {
        const n = Number(peso);
        if (!n || n <= 0) {
            throw new Error('Peso inválido');
        }

        if (!this.currentUserId && this.useFirebase) {
            throw new Error('Usuário não autenticado');
        }

        const dataStr = new Date().toLocaleDateString('pt-BR');

        if (this.useFirebase && this.currentUserId && id) {
            await firebaseManager.updateWeightRecord(id, {
                peso: n,
                data: dataStr,
            });
            await this.loadData();
            return;
        }

        this.migrateLocalIds();
        for (const mes of Object.keys(this.registros)) {
            for (const sem of Object.keys(this.registros[mes])) {
                for (const reg of this.registros[mes][sem]) {
                    if (reg.localId === localId) {
                        reg.peso = n;
                        reg.data = dataStr;
                        this.saveToLocalStorage();
                        return;
                    }
                }
            }
        }
        throw new Error('Registo não encontrado');
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
            
            this.registros = {};
            this.removeLocalStorageKey();
        } catch (error) {
            console.error('Erro ao limpar dados:', error);
            this.registros = {};
            this.removeLocalStorageKey();
        }
    }

    removeLocalStorageKey() {
        const userId = this.currentUserId || 'anonymous';
        localStorage.removeItem(`registrosPeso_${userId}`);
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
