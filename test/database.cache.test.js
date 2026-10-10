import { describe, it, expect, vi, afterEach } from 'vitest';
import { WeightDatabase } from '../src/js/database.js';
import { firebaseManager } from '../src/config/firebase.js';

/** Promise controlável: resolve/rejeita quando o teste quiser. */
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

describe('getRecordsCached', () => {
    it('chamadas simultâneas partilham uma única leitura', async () => {
        const db = new WeightDatabase();
        const read = vi.spyOn(db, '_readRecords').mockResolvedValue([{ timestamp: 1, peso: 80 }]);

        const [a, b, c] = await Promise.all([
            db.getRecordsCached(),
            db.getRecordsCached(),
            db.getRecordsCached(),
        ]);
        expect(read).toHaveBeenCalledTimes(1);
        expect(a).toBe(b);
        expect(b).toBe(c);

        await db.getRecordsCached();
        expect(read).toHaveBeenCalledTimes(1); // servido do cache
    });

    it('leitura iniciada antes de uma escrita não entra no cache', async () => {
        const db = new WeightDatabase();
        const velha = deferred();
        const read = vi
            .spyOn(db, '_readRecords')
            .mockReturnValueOnce(velha.promise)
            .mockResolvedValueOnce([{ timestamp: 1 }, { timestamp: 2 }]);

        const emVoo = db.getRecordsCached();
        db.invalidateCache(); // uma escrita aconteceu enquanto a leitura estava em voo
        velha.resolve([{ timestamp: 1 }]);
        await emVoo;

        const fresca = await db.getRecordsCached();
        expect(read).toHaveBeenCalledTimes(2);
        expect(fresca).toHaveLength(2);
    });

    it('falha de leitura não fica em cache: a próxima chamada tenta de novo', async () => {
        const db = new WeightDatabase();
        const read = vi
            .spyOn(db, '_readRecords')
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce([{ timestamp: 1 }]);

        await expect(db.getRecordsCached()).rejects.toThrow('offline');
        await Promise.resolve(); // deixa o finally limpar a promise em voo
        await expect(db.getRecordsCached()).resolves.toHaveLength(1);
        expect(read).toHaveBeenCalledTimes(2);
    });
});

describe('updateWeightRecord sem mudar a data', () => {
    it('Firebase: não grava `data` (antes gravava a data de hoje)', async () => {
        const db = new WeightDatabase();
        db.useFirebase = true;
        db.currentUserId = 'me';
        const upd = vi.spyOn(firebaseManager, 'updateWeightRecord').mockResolvedValue();

        await db.updateWeightRecord({ id: 'doc1', localId: null, peso: 81.5 });

        expect(upd).toHaveBeenCalledWith('doc1', { peso: 81.5 });
    });

    it('Firebase: com data nova, grava data/mes/semana/timestamp coerentes', async () => {
        const db = new WeightDatabase();
        db.useFirebase = true;
        db.currentUserId = 'me';
        db._recordsCache = []; // sem colisão de dia
        const upd = vi.spyOn(firebaseManager, 'updateWeightRecord').mockResolvedValue();
        const ts = new Date(2026, 2, 10, 12).getTime();

        await db.updateWeightRecord({ id: 'doc1', localId: null, peso: 81.5, timestamp: ts });

        expect(upd).toHaveBeenCalledWith('doc1', {
            peso: 81.5,
            data: new Date(ts).toLocaleDateString('pt-BR'),
            mes: 'marco',
            semana: '2',
            timestamp: ts,
        });
    });

    it('localStorage: mantém o `data` original', async () => {
        const db = new WeightDatabase();
        db.useFirebase = false;
        db.registros = {
            janeiro: { 1: [{ peso: 80, data: '05/01/2026', timestamp: 1, localId: 'L1' }] },
        };

        await db.updateWeightRecord({ id: null, localId: 'L1', peso: 79 });

        expect(db.registros.janeiro[1][0]).toMatchObject({ peso: 79, data: '05/01/2026' });
    });
});
