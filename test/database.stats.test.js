import { describe, it, expect, beforeEach } from 'vitest';
import { WeightDatabase } from '../src/js/database.js';

const DAY = 86400000;
const BASE = Date.UTC(2026, 0, 1, 12); // âncora fixa; a matemática é sobre timestamps (tz-independente)

/** Instancia o DB e injeta uma lista cronológica (asc) fixa, sem tocar em Firebase/localStorage. */
function dbWith(records) {
    const db = new WeightDatabase();
    db.getRecordsCached = async () => records;
    return db;
}

describe('WeightDatabase.getStats', () => {
    let db;
    beforeEach(() => {
        db = dbWith([
            { timestamp: BASE + 0 * DAY, peso: 90 },
            { timestamp: BASE + 10 * DAY, peso: 88 },
            { timestamp: BASE + 20 * DAY, peso: 85 },
            { timestamp: BASE + 30 * DAY, peso: 84 },
        ]);
    });

    it('calcula total, peso atual e delta vs. anterior', async () => {
        const s = await db.getStats();
        expect(s.total).toBe(4);
        expect(s.latestPeso).toBe(84);
        expect(s.delta).toBe(84 - 85); // -1
    });

    it('usa o registro mais próximo (não posterior) para Δ7 e Δ30', async () => {
        const s = await db.getStats();
        // último = BASE+30d. alvo Δ7 = BASE+23d → registro BASE+20d (85). alvo Δ30 = BASE+0d → 90.
        expect(s.delta7).toBe(84 - 85); // -1
        expect(s.delta30).toBe(84 - 90); // -6
    });

    it('calcula min, max e média', async () => {
        const s = await db.getStats();
        expect(s.min).toBe(84);
        expect(s.max).toBe(90);
        expect(s.avg).toBeCloseTo((90 + 88 + 85 + 84) / 4, 5);
    });

    it('devolve estrutura vazia sem registros', async () => {
        const empty = dbWith([]);
        const s = await empty.getStats();
        expect(s.total).toBe(0);
        expect(s.latestPeso).toBeNull();
        expect(s.delta7).toBeNull();
    });

    it('interpreta pesos com vírgula decimal', async () => {
        const s = await dbWith([
            { timestamp: BASE, peso: '80,5' },
            { timestamp: BASE + DAY, peso: '81,5' },
        ]).getStats();
        expect(s.latestPeso).toBe(81.5);
        expect(s.avg).toBeCloseTo(81, 5);
    });
});

describe('WeightDatabase.getEvolucaoSnapshot', () => {
    it('retorna { points, total } com points mapeados {t,p}', async () => {
        const db = dbWith([
            { timestamp: 1, peso: 90 },
            { timestamp: 2, peso: 89 },
        ]);
        const snap = await db.getEvolucaoSnapshot();
        expect(snap.total).toBe(2);
        expect(snap.points).toEqual([
            { t: 1, p: 90 },
            { t: 2, p: 89 },
        ]);
    });

    it('limita points a maxPoints mantendo os mais recentes, mas total = contagem real', async () => {
        const records = Array.from({ length: 5 }, (_, i) => ({ timestamp: i + 1, peso: 80 + i }));
        const snap = await dbWith(records).getEvolucaoSnapshot(2);
        expect(snap.total).toBe(5); // contagem real, não limitada
        expect(snap.points).toEqual([
            { t: 4, p: 83 },
            { t: 5, p: 84 },
        ]);
    });
});

describe('WeightDatabase.formatSeries', () => {
    it('produz dados, labels curtos e fullLabels alinhados', () => {
        const db = new WeightDatabase();
        const anoAtual = new Date().getFullYear();
        const ts = new Date(anoAtual, 5, 12, 12).getTime();
        const out = db.formatSeries([{ timestamp: ts, peso: 80 }]);
        expect(out.dados).toEqual([80]);
        expect(out.labels).toEqual(['12 jun']);
        expect(out.fullLabels[0]).toContain('12 de junho');
        expect(out.timestamps).toEqual([ts]);
    });
});
