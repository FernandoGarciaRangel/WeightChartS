import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { firebaseManager } from '../src/config/firebase.js';

afterEach(() => vi.restoreAllMocks());

function mockSdk(signInWithPopup) {
    const providers = [];
    class GoogleAuthProvider {
        constructor() {
            this.params = null;
            providers.push(this);
        }
        setCustomParameters(p) {
            this.params = p;
        }
    }
    window.firebaseSDK = { GoogleAuthProvider, signInWithPopup };
    return providers;
}

describe('signInWithGoogle', () => {
    beforeEach(() => {
        firebaseManager.isInitialized = true;
        firebaseManager.auth = { name: 'auth' };
        firebaseManager.currentUser = null;
        vi.spyOn(firebaseManager, 'ensureInitialized').mockResolvedValue();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('abre o popup com escolha de conta e guarda o User do SDK', async () => {
        const user = { uid: 'g1', email: 'a@gmail.com' };
        const popup = vi.fn().mockResolvedValue({ user });
        const providers = mockSdk(popup);

        const out = await firebaseManager.signInWithGoogle();

        expect(out).toBe(user);
        expect(firebaseManager.currentUser).toBe(user);
        expect(popup).toHaveBeenCalledWith(firebaseManager.auth, providers[0]);
        expect(providers[0].params).toEqual({ prompt: 'select_account' });
    });

    it.each(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'])(
        'devolve null (sem erro) quando o popup é cancelado: %s',
        async (code) => {
            mockSdk(vi.fn().mockRejectedValue({ code }));
            await expect(firebaseManager.signInWithGoogle()).resolves.toBeNull();
            expect(firebaseManager.currentUser).toBeNull();
        },
    );

    it('traduz popup bloqueado para pt-BR', async () => {
        mockSdk(vi.fn().mockRejectedValue({ code: 'auth/popup-blocked', message: 'x' }));
        await expect(firebaseManager.signInWithGoogle()).rejects.toThrow(/bloqueou a janela do Google/);
    });

    it('traduz domínio não autorizado', async () => {
        mockSdk(vi.fn().mockRejectedValue({ code: 'auth/unauthorized-domain', message: 'x' }));
        await expect(firebaseManager.signInWithGoogle()).rejects.toThrow(/não está liberado/);
    });
});
