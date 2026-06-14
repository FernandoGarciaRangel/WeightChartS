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

/**
 * Deriva mês (chave PT), semana (1–4) e data legível a partir de um timestamp (ms).
 * Usa o fuso local para que a semana coincida com o dia escolhido pelo utilizador.
 */
function derivePeriodFromMillis(ms) {
    const d = new Date(ms);
    return {
        mes: MONTH_ORDER[d.getMonth()],
        semana: String(Math.min(4, Math.max(1, Math.ceil(d.getDate() / 7)))),
        data: d.toLocaleDateString('pt-BR'),
    };
}

/** Limite de tamanho do arquivo de importação (bytes UTF-8) — evita DoS por memória */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** Máximo de registros numa importação */
const MAX_IMPORT_RECORDS = 5000;

function normalizeImportPeso(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const n = parseFloat(raw.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
}

/** "DD/MM/AAAA" → ms ao meio-dia local; null se inválida. */
function parseDataBrToMs(s) {
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const ano = Number(m[3]);
    const d = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
    if (d.getDate() !== dia || d.getMonth() !== mes - 1 || d.getFullYear() !== ano) return null;
    return d.getTime();
}

/**
 * Lê o CSV exportado pela app (`data;peso`, com DD/MM/AAAA e vírgula decimal) e
 * devolve a estrutura `{ [mes]: { [semana]: [registro] } }`. Deduplica por dia.
 */
function parseImportCsv(text) {
    const linhas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (linhas.length === 0) {
        throw new Error('Arquivo CSV vazio.');
    }
    // Pula o cabeçalho se a 1ª linha for "data;peso"
    let start = 0;
    if (/data/i.test(linhas[0]) && /peso/i.test(linhas[0])) start = 1;

    const porDia = new Map();
    let total = 0;

    for (let i = start; i < linhas.length; i++) {
        total += 1;
        if (total > MAX_IMPORT_RECORDS) {
            throw new Error(`Máximo de ${MAX_IMPORT_RECORDS} registros por importação.`);
        }

        const partes = linhas[i].split(/[;,]/);
        if (partes.length < 2) {
            throw new Error(`Linha inválida: "${linhas[i]}". Use o formato data;peso.`);
        }

        const ts = parseDataBrToMs(partes[0]);
        if (ts == null) {
            throw new Error(`Data inválida: "${partes[0]}". Use DD/MM/AAAA.`);
        }
        const peso = normalizeImportPeso(partes[1]);
        if (!Number.isFinite(peso) || peso <= 0 || peso > 500) {
            throw new Error('Peso inválido numa linha (use um número entre 0 e 500 kg).');
        }

        const { mes, semana, data } = derivePeriodFromMillis(ts);
        // Última ocorrência do dia vence (1 registro por dia)
        porDia.set(dayKeyFromTs(ts), { mes, semana, registro: { peso, data, timestamp: ts } });
    }

    const out = {};
    for (const { mes, semana, registro } of porDia.values()) {
        if (!out[mes]) out[mes] = {};
        if (!out[mes][semana]) out[mes][semana] = [];
        out[mes][semana].push(registro);
    }
    return out;
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

/** "YYYY-MM-DD" no fuso local — identifica o dia de um registo (um registo por dia). */
function dayKeyFromTs(ts) {
    const ms = toMillis(ts);
    if (ms == null || !Number.isFinite(ms)) return null;
    const d = new Date(ms);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mo}-${da}`;
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

/** Mês abreviado em PT para rótulos curtos do eixo X. */
const MONTH_ABBR_PT = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/**
 * Rótulos do eixo do gráfico a partir da data real do registro:
 * `short` para o eixo X (ex.: "12 jun"; inclui o ano quando difere do atual)
 * e `full` para o tooltip (ex.: "12 de junho de 2026").
 * Sem timestamp válido, recai no rótulo de mês/semana.
 */
function recordAxisLabels(record) {
    const ms = toMillis(record.timestamp);
    if (ms != null && Number.isFinite(ms)) {
        const d = new Date(ms);
        const dia = d.getDate();
        const mesAbbr = MONTH_ABBR_PT[d.getMonth()];
        const year = d.getFullYear();
        const short =
            year === new Date().getFullYear()
                ? `${dia} ${mesAbbr}`
                : `${dia} ${mesAbbr} ${String(year).slice(2)}`;
        const full = `${dia} de ${MONTH_LABELS_PT[d.getMonth()].toLowerCase()} de ${year}`;
        return { short, full };
    }
    const fallback = recordPeriodLabel(record).replace(' · ', ' — ');
    return { short: fallback, full: fallback };
}

class WeightDatabase {
    constructor() {
        this.registros = this.loadFromLocalStorage();
        this.useFirebase = false;
        this.currentUserId = null;
        /** Cache em memória da lista cronológica (asc). Invalidado em cada escrita / troca de usuário. */
        this._recordsCache = null;
        this.initializeFirebase();
        this.setupAuthListener();
    }

    invalidateCache() {
        this._recordsCache = null;
    }

    /**
     * Lista plana de registros, ordenada por timestamp (asc), com cache em memória.
     * Fonte única para gráfico, estatísticas, lista e verificação de duplicados —
     * evita reler a coleção do Firebase a cada chamada.
     */
    async getRecordsCached() {
        if (this._recordsCache) return this._recordsCache;

        let list;
        if (this.useFirebase && this.currentUserId) {
            const fb = await firebaseManager.getWeightRecords();
            list = fb.map((r) => ({
                id: r.id,
                localId: null,
                peso: r.peso,
                data: r.data,
                timestamp: toMillis(r.timestamp) || 0,
                mes: r.mes,
                semana: r.semana,
            }));
        } else {
            this.migrateLocalIds();
            list = this.flattenLocalChronological().map((r) => ({
                id: r.id || null,
                localId: r.localId || null,
                peso: r.peso,
                data: r.data,
                timestamp: toMillis(r.timestamp) || 0,
                mes: r.mes,
                semana: r.semana,
            }));
        }

        list.sort((a, b) => a.timestamp - b.timestamp);
        this._recordsCache = list;
        return list;
    }

    // Configurar listener de autenticação
    setupAuthListener() {
        window.addEventListener('userAuthChanged', (event) => {
            const user = event.detail.user;
            this.invalidateCache();
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
        this.invalidateCache();
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

    /**
     * Verifica se já existe um registo no mesmo dia (fuso local) do timestamp dado.
     * `exclude*` permite ignorar o próprio registo numa edição.
     */
    async hasRecordOnDay(ts, { excludeId = null, excludeLocalId = null } = {}) {
        const target = dayKeyFromTs(ts);
        if (target == null) return false;

        const list = await this.getRecordsCached();
        return list.some((r) => {
            if (excludeId != null && r.id === excludeId) return false;
            if (excludeLocalId != null && r.localId === excludeLocalId) return false;
            return dayKeyFromTs(r.timestamp) === target;
        });
    }

    // Adicionar novo registro de peso (timestamp opcional → permite registrar em data passada)
    async addWeightRecord(peso, timestamp = Date.now()) {
        if (!Number.isFinite(peso) || peso <= 0 || peso > 500) {
            throw new Error('Peso inválido (use um número entre 0 e 500 kg).');
        }

        if (!this.currentUserId && this.useFirebase) {
            throw new Error('Usuário não autenticado');
        }

        const ts = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
        if (await this.hasRecordOnDay(ts)) {
            const isHoje = dayKeyFromTs(ts) === dayKeyFromTs(Date.now());
            throw new Error(
                isHoje
                    ? 'Já existe um registro para hoje. Corrija o registro de hoje em vez de criar outro.'
                    : 'Já existe um registro nesse dia. Escolha outra data.',
            );
        }

        const { mes, semana, data } = derivePeriodFromMillis(ts);
        const registro = {
            peso,
            data,
            timestamp: ts,
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

            this.invalidateCache();
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
                        data: registro.data,
                    });
                }
            }
        }
        flat.sort((a, b) => (toMillis(a.timestamp) || 0) - (toMillis(b.timestamp) || 0));
        return flat;
    }

    /** Filtra a lista (asc) pelos últimos `rangeDays` dias a partir de hoje. null = tudo. */
    filterByRange(list, rangeDays) {
        if (!rangeDays || !Number.isFinite(rangeDays) || list.length === 0) return list;
        const cutoff = Date.now() - rangeDays * 86400000;
        return list.filter((r) => r.timestamp >= cutoff);
    }

    /**
     * Formata uma lista de registros `{ timestamp, peso }` (asc) na série do gráfico:
     * `{ dados, labels, fullLabels, timestamps }`. Reutilizado pelo gráfico próprio e
     * pelo gráfico read-only de perfis públicos.
     */
    formatSeries(records) {
        const axis = records.map((r) => recordAxisLabels(r));
        return {
            dados: records.map((r) => r.peso),
            labels: axis.map((a) => a.short),
            fullLabels: axis.map((a) => a.full),
            timestamps: records.map((r) => r.timestamp),
        };
    }

    /**
     * Série para o gráfico (cronologia crescente: esquerda = passado).
     * @param {number|null} rangeDays Mostra só os últimos N dias (null = tudo).
     */
    async getAllRecords(rangeDays = null) {
        let list = [];
        try {
            list = await this.getRecordsCached();
        } catch (error) {
            console.error('Erro ao buscar registros:', error);
        }
        return this.formatSeries(this.filterByRange(list, rangeDays));
    }

    /**
     * Snapshot compacto da evolução para o perfil público: `[{ t: ms, p: peso }]` (asc).
     * Limita aos últimos pontos para não estourar o tamanho do doc.
     */
    async getEvolucaoSnapshot(maxPoints = 1000) {
        let list = [];
        try {
            list = await this.getRecordsCached();
        } catch (error) {
            console.error('Erro ao montar snapshot:', error);
        }
        const trimmed = list.length > maxPoints ? list.slice(list.length - maxPoints) : list;
        return trimmed.map((r) => ({ t: r.timestamp, p: r.peso }));
    }

    // Obter registros de um mês específico
    getRecordsByMonth(mes) {
        return this.registros[mes] || {};
    }

    /**
     * Estatísticas para o painel: peso atual, total, variações (Δ último, 7 e 30 dias)
     * e mín/máx/média. Tudo derivado do cache cronológico (asc).
     */
    async getStats() {
        let list = [];
        try {
            list = await this.getRecordsCached();
        } catch (error) {
            console.error('Erro em getStats:', error);
        }

        const total = list.length;
        const empty = {
            total: 0, latestPeso: null, delta: null,
            delta7: null, delta30: null, min: null, max: null, avg: null,
        };
        if (total === 0) return empty;

        const num = (p) => (typeof p === 'number' ? p : parseFloat(String(p).replace(',', '.')));
        const pesos = list.map((r) => num(r.peso)).filter(Number.isFinite);
        if (pesos.length === 0) return { ...empty, total };

        const latest = list[total - 1];
        const latestPeso = num(latest.peso);
        const prevPeso = total >= 2 ? num(list[total - 2].peso) : null;
        const delta = prevPeso != null && Number.isFinite(prevPeso) ? latestPeso - prevPeso : null;

        // Peso do registro mais próximo (não posterior) a N dias antes do último.
        const pesoDaysAgo = (days) => {
            const target = latest.timestamp - days * 86400000;
            let chosen = null;
            for (const r of list) {
                if (r.timestamp <= target) chosen = r;
                else break;
            }
            return chosen ? num(chosen.peso) : null;
        };
        const p7 = pesoDaysAgo(7);
        const p30 = pesoDaysAgo(30);

        return {
            total,
            latestPeso: Number.isFinite(latestPeso) ? latestPeso : null,
            delta,
            delta7: p7 != null ? latestPeso - p7 : null,
            delta30: p30 != null ? latestPeso - p30 : null,
            min: Math.min(...pesos),
            max: Math.max(...pesos),
            avg: pesos.reduce((a, b) => a + b, 0) / pesos.length,
        };
    }

    /**
     * Lista dos registros mais recentes (para corrigir/excluir). Limite padrão de 20.
     */
    async getRecordsForEditList(limit = 20) {
        const list = await this.getRecordsCached();
        return [...list]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map((r) => ({
                id: r.id,
                localId: r.localId,
                mes: r.mes,
                semana: r.semana,
                peso: r.peso,
                timestamp: r.timestamp,
                data: r.data,
                label: recordPeriodLabel(r),
            }));
    }

    /**
     * Atualiza um registo (Firebase por id, local por localId).
     * Se `timestamp` for indicado, recalcula mês/semana/data a partir dessa data —
     * no localStorage o registo é movido para o mês/semana correto.
     */
    async updateWeightRecord({ id, localId, peso, timestamp }) {
        const n = Number(peso);
        if (!Number.isFinite(n) || n <= 0 || n > 500) {
            throw new Error('Peso inválido (use um número entre 0 e 500 kg).');
        }

        if (!this.currentUserId && this.useFirebase) {
            throw new Error('Usuário não autenticado');
        }

        const hasNewDate =
            typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0;
        const period = hasNewDate ? derivePeriodFromMillis(timestamp) : null;
        const dataStr = period ? period.data : new Date().toLocaleDateString('pt-BR');

        if (period) {
            const collision = await this.hasRecordOnDay(timestamp, {
                excludeId: id || null,
                excludeLocalId: localId || null,
            });
            if (collision) {
                throw new Error('Já existe um registro nesse dia. Escolha outra data.');
            }
        }

        if (this.useFirebase && this.currentUserId && id) {
            const fields = { peso: n, data: dataStr };
            if (period) {
                fields.mes = period.mes;
                fields.semana = period.semana;
                fields.timestamp = timestamp;
            }
            await firebaseManager.updateWeightRecord(id, fields);
            await this.loadData();
            return;
        }

        this.migrateLocalIds();
        for (const mes of Object.keys(this.registros)) {
            for (const sem of Object.keys(this.registros[mes])) {
                const arr = this.registros[mes][sem];
                const idx = arr.findIndex((reg) => reg.localId === localId);
                if (idx === -1) continue;

                const reg = arr[idx];
                reg.peso = n;
                reg.data = dataStr;

                if (period) {
                    reg.timestamp = timestamp;
                    // Mover para o novo mês/semana se a data mudou de período
                    if (period.mes !== mes || period.semana !== sem) {
                        arr.splice(idx, 1);
                        if (arr.length === 0) delete this.registros[mes][sem];
                        if (Object.keys(this.registros[mes]).length === 0) {
                            delete this.registros[mes];
                        }
                        if (!this.registros[period.mes]) this.registros[period.mes] = {};
                        if (!this.registros[period.mes][period.semana]) {
                            this.registros[period.mes][period.semana] = [];
                        }
                        this.registros[period.mes][period.semana].push(reg);
                    }
                }

                this.saveToLocalStorage();
                this.invalidateCache();
                return;
            }
        }
        throw new Error('Registro não encontrado');
    }

    /**
     * Apaga um único registro (Firebase por id, local por localId).
     */
    async deleteWeightRecord({ id, localId }) {
        if (!this.currentUserId && this.useFirebase) {
            throw new Error('Usuário não autenticado');
        }

        if (this.useFirebase && this.currentUserId && id) {
            await firebaseManager.deleteWeightRecord(id);
            await this.loadData();
            return;
        }

        this.migrateLocalIds();
        for (const mes of Object.keys(this.registros)) {
            for (const sem of Object.keys(this.registros[mes])) {
                const arr = this.registros[mes][sem];
                const idx = arr.findIndex((reg) => reg.localId === localId);
                if (idx === -1) continue;

                arr.splice(idx, 1);
                if (arr.length === 0) delete this.registros[mes][sem];
                if (Object.keys(this.registros[mes]).length === 0) {
                    delete this.registros[mes];
                }
                this.saveToLocalStorage();
                this.invalidateCache();
                return;
            }
        }
        throw new Error('Registro não encontrado');
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
        } finally {
            this.invalidateCache();
        }
    }

    removeLocalStorageKey() {
        const userId = this.currentUserId || 'anonymous';
        localStorage.removeItem(`registrosPeso_${userId}`);
    }

    // Exportar dados como CSV (data;peso) — amigável para Excel/Sheets pt-BR
    async exportData() {
        let list = [];
        try {
            list = await this.getRecordsCached();
        } catch (error) {
            console.error('Erro ao exportar:', error);
        }
        const linhas = ['data;peso'];
        for (const r of list) {
            const dataBr = new Date(r.timestamp).toLocaleDateString('pt-BR');
            const peso = Number(r.peso);
            const pesoStr = Number.isFinite(peso) ? peso.toFixed(1).replace('.', ',') : '';
            linhas.push(`${dataBr};${pesoStr}`);
        }
        return linhas.join('\r\n');
    }

    // Importar dados (CSV: data;peso)
    async importData(dataString) {
        if (typeof dataString !== 'string') {
            throw new Error('Conteúdo de importação inválido.');
        }

        if (typeof TextEncoder !== 'undefined') {
            const bytes = new TextEncoder().encode(dataString).length;
            if (bytes > MAX_IMPORT_BYTES) {
                throw new Error('Arquivo muito grande (máximo 2 MB).');
            }
        } else if (dataString.length > MAX_IMPORT_BYTES) {
            throw new Error('Arquivo muito grande (máximo 2 MB).');
        }

        const data = parseImportCsv(dataString);

        try {
            if (this.useFirebase) {
                const firebaseRecords = await firebaseManager.getWeightRecords();
                for (const record of firebaseRecords) {
                    await firebaseManager.deleteWeightRecord(record.id);
                }

                for (const mes of Object.keys(data)) {
                    for (const semana of Object.keys(data[mes])) {
                        for (const registro of data[mes][semana]) {
                            await firebaseManager.addWeightRecord({
                                mes,
                                semana,
                                peso: registro.peso,
                                data: registro.data,
                                timestamp: registro.timestamp,
                            });
                        }
                    }
                }
                console.log('Dados importados para Firebase');
                await this.loadData();
            } else {
                this.registros = data;
                this.saveToLocalStorage();
            }

            this.invalidateCache();
            return true;
        } catch (error) {
            console.error('Erro ao importar dados:', error);
            throw error;
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
