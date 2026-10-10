import { describe, it, expect, beforeEach } from 'vitest';
import { firebaseManager } from '../src/config/firebase.js';
import { WeightDatabase } from '../src/js/database.js';

// Mock do SDK com writeBatch. Cada commit registra as operações do lote; `failCommit`
// recebe o índice (0-based) do commit que deve falhar.
let commits;
let autoId;

function installSdkMock({ existing = [], failCommit = [] } = {}) {
    commits = [];
    autoId = 0;
    let commitIdx = 0;
    window.firebaseSDK = {
        // doc(collectionRef) → id automático; doc(db, coll, id) → ref explícito
        doc: (a, coll, id) =>
            a && a.__col ? { id: `novo${++autoId}` } : { __ref: `${coll}/${id}`, id },
        collection: (_db, name) => ({ __col: name }),
        query: (col) => col,
        where: () => ({}),
        getDocs: async () => ({
            forEach: (cb) => existing.forEach((r) => cb({ id: r.id, data: () => r })),
        }),
        writeBatch: () => {
            const ops = [];
            return {
                set: (ref, data) => ops.push({ op: 'set', ref: ref.__ref, data }),
                delete: (ref) => ops.push({ op: 'del', ref: ref.__ref }),
                commit: async () => {
                    const i = commitIdx++;
                    if (failCommit.includes(i)) throw new Error(`commit ${i} falhou`);
                    commits.push(ops);
                },
            };
        },
    };
}

const antigos = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `old${i}`, userId: 'me', peso: 80, timestamp: i + 1 }));
const novos = (n) =>
    Array.from({ length: n }, (_, i) => ({
        mes: 'janeiro', semana: '1', peso: 70, data: '01/01/2026', timestamp: i + 1,
    }));

beforeEach(() => {
    firebaseManager.isInitialized = true;
    firebaseManager.db = {};
    firebaseManager.currentUser = { uid: 'me' };
});

describe('replaceAllWeightRecords', () => {
    it('até 500 operações: um único lote, novos gravados antes de apagar os antigos', async () => {
        installSdkMock({ existing: antigos(2) });
        await firebaseManager.replaceAllWeightRecords(novos(3));

        expect(commits).toHaveLength(1);
        expect(commits[0].map((o) => o.op)).toEqual(['set', 'set', 'set', 'del', 'del']);
        expect(commits[0][0].data).toMatchObject({ userId: 'me', peso: 70, timestamp: 1 });
    });

    it('falha no lote único não apaga nada (atômico) e propaga o erro', async () => {
        installSdkMock({ existing: antigos(2), failCommit: [0] });
        await expect(firebaseManager.replaceAllWeightRecords(novos(3))).rejects.toThrow();
        expect(commits).toHaveLength(0);
    });

    it('acima de 500: se falhar a gravação dos novos, desfaz o que entrou e não toca nos antigos', async () => {
        installSdkMock({ existing: antigos(10), failCommit: [1] });
        await expect(firebaseManager.replaceAllWeightRecords(novos(600))).rejects.toThrow();

        // commit 0 = 500 novos; commit 1 falhou; o rollback apaga os ids de todos os novos
        // (apagar doc inexistente é sucesso no Firestore) e nenhum dos antigos.
        const apagados = commits.flat().filter((o) => o.op === 'del').map((o) => o.ref);
        expect(apagados.every((r) => r.startsWith('weightRecords/novo'))).toBe(true);
        expect(apagados).toHaveLength(600);
    });

    it('acima de 500: falha ao apagar os antigos lança, mas os novos ficam gravados', async () => {
        installSdkMock({ existing: antigos(10), failCommit: [2] });
        await expect(firebaseManager.replaceAllWeightRecords(novos(600))).rejects.toThrow(
            /importados/,
        );
        expect(commits.flat().filter((o) => o.op === 'set')).toHaveLength(600);
    });
});

describe('clearAllUserData', () => {
    it('apaga todos em lotes de no máximo 500', async () => {
        installSdkMock({ existing: antigos(1200) });
        await firebaseManager.clearAllUserData();
        expect(commits.map((c) => c.length)).toEqual([500, 500, 200]);
    });

    it('lança se um lote falhar', async () => {
        installSdkMock({ existing: antigos(3), failCommit: [0] });
        await expect(firebaseManager.clearAllUserData()).rejects.toThrow();
    });
});

describe('WeightDatabase.clearAllData', () => {
    it('propaga a falha do Firebase em vez de anunciar sucesso', async () => {
        installSdkMock({ existing: antigos(3), failCommit: [0] });
        const db = new WeightDatabase();
        db.useFirebase = true;
        db.registros = { janeiro: { 1: [{ peso: 80 }] } };
        await expect(db.clearAllData()).rejects.toThrow();
    });
});

describe('translateFirebaseError', () => {
    it('traduz auth/invalid-credential (proteção contra enumeração de email)', () => {
        const e = firebaseManager.translateFirebaseError({ code: 'auth/invalid-credential' });
        expect(e.message).toBe('Email ou senha incorretos');
    });
});
