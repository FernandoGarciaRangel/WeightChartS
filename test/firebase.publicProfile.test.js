import { describe, it, expect, beforeEach } from 'vitest';
import { firebaseManager } from '../src/config/firebase.js';

// Mock do SDK Firebase exposto em window.firebaseSDK. Cada operação registra a chamada
// para asserção; os refs viram strings "coleção/id" para inspeção simples.
let calls;

function installSdkMock({ getDocsResult, getDocResult } = {}) {
    calls = { setDoc: [], deleteDoc: [], getDocs: 0, getDoc: [], limit: [] };
    window.firebaseSDK = {
        doc: (_db, coll, id) => ({ __ref: `${coll}/${id}` }),
        collection: (_db, name) => ({ __col: name }),
        query: (col, ...clauses) => ({ __col: col, clauses }),
        where: (f, op, v) => ({ __where: [f, op, v] }),
        limit: (n) => {
            calls.limit.push(n);
            return { __limit: n };
        },
        serverTimestamp: () => '__ts__',
        setDoc: async (ref, data) => {
            calls.setDoc.push({ ref: ref.__ref, data });
        },
        deleteDoc: async (ref) => {
            calls.deleteDoc.push(ref.__ref);
        },
        getDocs: async () => {
            calls.getDocs += 1;
            return { forEach: (cb) => (getDocsResult || []).forEach(cb) };
        },
        getDoc: async (ref) => {
            calls.getDoc.push(ref.__ref);
            return getDocResult;
        },
    };
}

function refData(ref) {
    return calls.setDoc.find((c) => c.ref === ref)?.data;
}

beforeEach(() => {
    // isAvailable() = isInitialized && db != null && currentUser != null
    firebaseManager.isInitialized = true;
    firebaseManager.db = {};
    firebaseManager.currentUser = { uid: 'me' };
    installSdkMock();
});

describe('setProfilePublic(true)', () => {
    it('marca users/{uid}.public e grava metadados + série públicos', async () => {
        await firebaseManager.setProfilePublic(true, {
            displayName: 'Ana',
            evolucao: [{ t: 1, p: 80 }],
            meta: 75,
            count: 3,
        });

        expect(refData('users/me')).toMatchObject({ public: true });
        expect(refData('publicProfiles/me')).toMatchObject({
            uid: 'me',
            displayName: 'Ana',
            meta: 75,
            count: 3,
        });
        expect(refData('publicSeries/me')).toMatchObject({ points: [{ t: 1, p: 80 }] });
        expect(calls.deleteDoc).toHaveLength(0);
    });

    it('usa points.length quando count não é informado e meta null por padrão', async () => {
        await firebaseManager.setProfilePublic(true, {
            displayName: 'Ana',
            evolucao: [{ t: 1, p: 1 }, { t: 2, p: 2 }],
        });
        expect(refData('publicProfiles/me')).toMatchObject({ count: 2, meta: null });
    });

    it('sanitiza displayName vazio para "Usuário"', async () => {
        await firebaseManager.setProfilePublic(true, { displayName: '', evolucao: [] });
        expect(refData('publicProfiles/me').displayName).toBe('Usuário');
    });
});

describe('setProfilePublic(false)', () => {
    it('marca privado e apaga os dois docs públicos', async () => {
        await firebaseManager.setProfilePublic(false);
        expect(refData('users/me')).toMatchObject({ public: false });
        expect(calls.deleteDoc).toContain('publicProfiles/me');
        expect(calls.deleteDoc).toContain('publicSeries/me');
        // nenhum snapshot público deve ter sido escrito
        expect(refData('publicProfiles/me')).toBeUndefined();
        expect(refData('publicSeries/me')).toBeUndefined();
    });
});

describe('updatePublicSnapshot', () => {
    it('regrava metadados + série sem tocar em users/{uid}', async () => {
        await firebaseManager.updatePublicSnapshot({
            displayName: 'Bob',
            evolucao: [{ t: 9, p: 70 }],
            meta: 65,
            count: 12,
        });
        expect(refData('users/me')).toBeUndefined();
        expect(refData('publicProfiles/me')).toMatchObject({ displayName: 'Bob', count: 12, meta: 65 });
        expect(refData('publicSeries/me')).toMatchObject({ points: [{ t: 9, p: 70 }] });
    });
});

describe('listPublicProfiles', () => {
    it('exclui o próprio, mapeia campos e trata ausentes', async () => {
        installSdkMock({
            getDocsResult: [
                { id: 'me', data: () => ({ displayName: 'Eu', count: 5, meta: 70 }) },
                { id: 'u2', data: () => ({ displayName: 'Bob', count: 3, meta: 68 }) },
                { id: 'u3', data: () => ({ count: 2 }) }, // sem displayName/meta
            ],
        });

        const perfis = await firebaseManager.listPublicProfiles();
        expect(perfis).toHaveLength(2);
        expect(perfis).toContainEqual({ uid: 'u2', displayName: 'Bob', count: 3, meta: 68 });
        expect(perfis).toContainEqual({ uid: 'u3', displayName: 'Usuário', count: 2, meta: null });
    });

    it('aplica limit(max + 1) na query', async () => {
        installSdkMock({ getDocsResult: [] });
        await firebaseManager.listPublicProfiles(10);
        expect(calls.limit).toContain(11);
    });

    it('retorna [] quando não autenticado (sem lançar)', async () => {
        firebaseManager.currentUser = null;
        await expect(firebaseManager.listPublicProfiles()).resolves.toEqual([]);
    });
});

describe('getPublicSeries', () => {
    it('devolve os points quando o doc existe', async () => {
        installSdkMock({
            getDocResult: { exists: () => true, data: () => ({ points: [{ t: 1, p: 80 }] }) },
        });
        expect(await firebaseManager.getPublicSeries('u2')).toEqual([{ t: 1, p: 80 }]);
    });

    it('devolve [] quando o doc não existe ou points não é array', async () => {
        installSdkMock({ getDocResult: { exists: () => false, data: () => ({}) } });
        expect(await firebaseManager.getPublicSeries('u2')).toEqual([]);

        installSdkMock({ getDocResult: { exists: () => true, data: () => ({ points: 'x' }) } });
        expect(await firebaseManager.getPublicSeries('u2')).toEqual([]);
    });
});
