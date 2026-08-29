import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeightApp } from '../src/js/app.js';
import { weightDB } from '../src/js/database.js';
import { firebaseManager } from '../src/config/firebase.js';

// A app é toda acoplada ao DOM e o construtor liga listeners, gráfico e auth. Aqui só
// interessam os métodos do perfil público, por isso criamos a instância sem correr o
// construtor e injetamos apenas o estado que esses métodos leem.
function makeApp(overrides = {}) {
    const app = Object.create(WeightApp.prototype);
    Object.assign(
        app,
        {
            isProfilePublic: false,
            metaPeso: null,
            _publicOps: Promise.resolve(),
            _publicEpoch: 0,
            _publicSyncSeq: 0,
            _togglingProfile: false,
            _publicSyncFailed: false,
            _lastPublicPayload: null,
            _profileDetailReq: 0,
            _publicProfiles: [],
        },
        overrides,
    );
    // confirmAction abre um modal e espera clique — nos testes aceita sempre.
    app.confirmAction = async () => true;
    return app;
}

/** Promessa controlada pelo teste, para segurar uma operação "em voo". */
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const estadoTexto = () => document.getElementById('perfilPublicoEstado')?.textContent;

beforeEach(() => {
    document.body.innerHTML = `
        <div id="cardPerfilPublico">
            <p id="perfilPublicoEstado">Seu perfil está privado.</p>
            <button type="button" id="btnTogglePublico" role="switch" aria-checked="false"></button>
        </div>
    `;
    firebaseManager.isInitialized = true;
    firebaseManager.db = {};
    firebaseManager.currentUser = { uid: 'me', displayName: 'Ana', email: 'ana@x.com' };
    weightDB.getEvolucaoSnapshot = async () => ({ points: [{ t: 1, p: 80 }], total: 1 });
});

describe('toggleProfilePublic', () => {
    it('publica o snapshot atual e liga o toggle', async () => {
        const setProfilePublic = vi.fn(async () => {});
        firebaseManager.setProfilePublic = setProfilePublic;

        const app = makeApp();
        await app.toggleProfilePublic();

        expect(setProfilePublic).toHaveBeenCalledWith(true, {
            displayName: 'Ana',
            evolucao: [{ t: 1, p: 80 }],
            meta: null,
            count: 1,
        });
        expect(app.isProfilePublic).toBe(true);
        expect(document.getElementById('btnTogglePublico').getAttribute('aria-checked')).toBe('true');
    });

    it('não publica perfil vazio se a leitura dos registros falhar', async () => {
        const setProfilePublic = vi.fn(async () => {});
        firebaseManager.setProfilePublic = setProfilePublic;
        weightDB.getEvolucaoSnapshot = async () => {
            throw new Error('offline');
        };

        const app = makeApp();
        await app.toggleProfilePublic();

        expect(setProfilePublic).not.toHaveBeenCalled();
        expect(app.isProfilePublic).toBe(false);
        expect(estadoTexto()).toBe('Seu perfil está privado.');
    });

    it('mantém o estado público quando a volta a privado falha (nada de falso "privado")', async () => {
        firebaseManager.setProfilePublic = vi.fn(async () => {
            throw new Error('permission-denied');
        });

        const app = makeApp({ isProfilePublic: true });
        await app.toggleProfilePublic();

        expect(app.isProfilePublic).toBe(true);
        expect(document.getElementById('btnTogglePublico').getAttribute('aria-checked')).toBe('true');
        expect(estadoTexto()).toContain('público');
        // A mensagem tem de dizer que continua visível, não um genérico "erro".
        const msg = [...document.querySelectorAll('.message')].map((n) => n.textContent).join(' ');
        expect(msg).toContain('continua público');
    });

    it('ignora o segundo clique enquanto a gravação está em curso', async () => {
        const gate = deferred();
        const setProfilePublic = vi.fn(() => gate.promise);
        firebaseManager.setProfilePublic = setProfilePublic;

        const app = makeApp();
        const first = app.toggleProfilePublic();
        await Promise.resolve();
        await app.toggleProfilePublic(); // duplo-clique
        gate.resolve();
        await first;

        expect(setProfilePublic).toHaveBeenCalledTimes(1);
        expect(app.isProfilePublic).toBe(true);
    });
});

describe('syncPublicProfile', () => {
    it('regrava o snapshot quando o perfil está público', async () => {
        const updatePublicSnapshot = vi.fn(async () => {});
        firebaseManager.updatePublicSnapshot = updatePublicSnapshot;

        const app = makeApp({ isProfilePublic: true, metaPeso: 70 });
        await app.syncPublicProfile();

        expect(updatePublicSnapshot).toHaveBeenCalledWith({
            displayName: 'Ana',
            evolucao: [{ t: 1, p: 80 }],
            meta: 70,
            count: 1,
        });
    });

    it('não escreve nada quando o perfil é privado', async () => {
        const updatePublicSnapshot = vi.fn(async () => {});
        firebaseManager.updatePublicSnapshot = updatePublicSnapshot;

        await makeApp({ isProfilePublic: false }).syncPublicProfile();
        expect(updatePublicSnapshot).not.toHaveBeenCalled();
    });

    it('não publica snapshot vazio quando a leitura dos registros falha', async () => {
        const updatePublicSnapshot = vi.fn(async () => {});
        firebaseManager.updatePublicSnapshot = updatePublicSnapshot;
        weightDB.getEvolucaoSnapshot = async () => {
            throw new Error('offline');
        };

        const app = makeApp({ isProfilePublic: true });
        await app.syncPublicProfile();

        expect(updatePublicSnapshot).not.toHaveBeenCalled();
        expect(app._publicSyncFailed).toBe(true);
        expect(estadoTexto()).toContain('não foi possível enviar a evolução mais recente');
    });

    it('um sync em voo não recria o perfil depois de voltar a privado', async () => {
        // A leitura dos registros fica suspensa; entretanto o utilizador volta a privado.
        const leitura = deferred();
        weightDB.getEvolucaoSnapshot = () => leitura.promise;
        const updatePublicSnapshot = vi.fn(async () => {});
        firebaseManager.updatePublicSnapshot = updatePublicSnapshot;
        firebaseManager.setProfilePublic = vi.fn(async () => {});

        const app = makeApp({ isProfilePublic: true });
        const sync = app.syncPublicProfile();
        await app.toggleProfilePublic(); // → privado
        leitura.resolve({ points: [{ t: 1, p: 80 }], total: 1 });
        await sync;

        expect(app.isProfilePublic).toBe(false);
        expect(updatePublicSnapshot).not.toHaveBeenCalled();
    });

    it('limpa o aviso de falha quando um sync seguinte tem sucesso', async () => {
        firebaseManager.updatePublicSnapshot = vi.fn(async () => {});
        const app = makeApp({ isProfilePublic: true, _publicSyncFailed: true });

        await app.syncPublicProfile();

        expect(app._publicSyncFailed).toBe(false);
        expect(estadoTexto()).toBe('Seu perfil está público — outros veem sua evolução.');
    });
});

describe('ordem dos syncs', () => {
    it('não reescreve um snapshot idêntico (o boot chama o sync duas vezes)', async () => {
        const updatePublicSnapshot = vi.fn(async () => {});
        firebaseManager.updatePublicSnapshot = updatePublicSnapshot;

        const app = makeApp({ isProfilePublic: true });
        await app.syncPublicProfile();
        await app.syncPublicProfile();
        expect(updatePublicSnapshot).toHaveBeenCalledTimes(1);

        // Mas uma alteração real (meta) volta a publicar.
        app.metaPeso = 70;
        await app.syncPublicProfile();
        expect(updatePublicSnapshot).toHaveBeenCalledTimes(2);
    });

    it('um sync mais antigo não sobrescreve o snapshot de um mais recente', async () => {
        // Duas leituras que resolvem fora de ordem: a antiga (dados velhos) resolve depois.
        const antiga = deferred();
        const nova = deferred();
        const leituras = [antiga.promise, nova.promise];
        weightDB.getEvolucaoSnapshot = () => leituras.shift();
        const updatePublicSnapshot = vi.fn(async () => {});
        firebaseManager.updatePublicSnapshot = updatePublicSnapshot;

        const app = makeApp({ isProfilePublic: true });
        const s1 = app.syncPublicProfile();
        const s2 = app.syncPublicProfile();
        nova.resolve({ points: [{ t: 2, p: 79 }], total: 2 });
        antiga.resolve({ points: [{ t: 1, p: 80 }], total: 1 });
        await Promise.all([s1, s2]);

        expect(updatePublicSnapshot).toHaveBeenCalledTimes(1);
        expect(updatePublicSnapshot.mock.calls[0][0]).toMatchObject({ count: 2 });
    });
});

describe('queuePublicOp', () => {
    it('serializa as escritas mesmo quando uma falha', async () => {
        const app = makeApp();
        const ordem = [];
        const p1 = app.queuePublicOp(async () => {
            await new Promise((r) => setTimeout(r, 5));
            ordem.push('a');
            throw new Error('falhou');
        });
        const p2 = app.queuePublicOp(async () => {
            ordem.push('b');
        });

        await expect(p1).rejects.toThrow('falhou');
        await p2;
        expect(ordem).toEqual(['a', 'b']);
    });
});
