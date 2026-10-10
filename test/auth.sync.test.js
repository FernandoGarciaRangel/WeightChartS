import { describe, it, expect, vi, afterEach } from 'vitest';
import { firebaseManager } from '../src/config/firebase.js';
import { WeightDatabase } from '../src/js/database.js';

afterEach(() => vi.restoreAllMocks());

describe('signUp', () => {
    it('devolve o próprio User do SDK (com métodos), não uma cópia', async () => {
        class FakeUser {
            constructor() {
                this.uid = 'u1';
                this.email = 'a@b.c';
                this.displayName = null;
            }
            getIdToken() {
                return 'tok';
            }
        }
        const user = new FakeUser();
        firebaseManager.isInitialized = true;
        firebaseManager.auth = {};
        vi.spyOn(firebaseManager, 'ensureInitialized').mockResolvedValue();
        window.firebaseSDK = {
            createUserWithEmailAndPassword: async () => ({ user }),
            // O SDK real atualiza o displayName no próprio objeto.
            updateProfile: async (u, { displayName }) => {
                u.displayName = displayName;
            },
        };

        const out = await firebaseManager.signUp('a@b.c', '123456', 'Ana');

        expect(out).toBe(user);
        expect(firebaseManager.currentUser).toBe(user);
        expect(out.displayName).toBe('Ana');
        expect(out.getIdToken()).toBe('tok');
    });
});

describe('initializeFirebase', () => {
    it('não sobe os registros do localStorage para a conta que entrou', async () => {
        localStorage.setItem(
            'registrosPeso_anonymous',
            JSON.stringify({ janeiro: { 1: [{ peso: 70, data: '01/01/2026', timestamp: 1 }] } }),
        );
        vi.spyOn(firebaseManager, 'initialize').mockResolvedValue(true);
        vi.spyOn(firebaseManager, 'isAuthenticated').mockReturnValue(true);
        vi.spyOn(firebaseManager, 'getCurrentUserId').mockReturnValue('outra-pessoa');
        const get = vi.spyOn(firebaseManager, 'getWeightRecords').mockResolvedValue([]);
        const add = vi.spyOn(firebaseManager, 'addWeightRecord').mockResolvedValue('x');

        const db = new WeightDatabase();
        await db.initializeFirebase();

        expect(db.useFirebase).toBe(true);
        expect(db.currentUserId).toBe('outra-pessoa');
        expect(get).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
        localStorage.removeItem('registrosPeso_anonymous');
    });
});
