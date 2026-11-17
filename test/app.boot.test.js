import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WeightApp } from '../src/js/app.js';
import { weightDB } from '../src/js/database.js';
import { firebaseManager } from '../src/config/firebase.js';

// Mesmo padrão de app.publicProfile.test.js: instância sem construtor (que liga DOM,
// gráfico e auth), só com o estado que os métodos testados leem.
function makeApp(overrides = {}) {
    const app = Object.create(WeightApp.prototype);
    Object.assign(app, { isAuthenticated: true, _sessionLoad: null, _listaSeq: 0 }, overrides);
    return app;
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

const rows = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `r${i}`, peso: 80 + i, timestamp: i + 1 }));

beforeEach(() => {
    document.body.innerHTML = `
        <ul id="listaRegistros"></ul>
        <ul id="listaRegistrosTodos"></ul>
        <p id="listaRegistrosVazia" class="hidden"></p>
        <button id="btnVerTodos" class="hidden"></button>
    `;
});

afterEach(() => vi.restoreAllMocks());

describe('refreshListaRegistros', () => {
    it('duas chamadas em paralelo não duplicam a lista', async () => {
        const app = makeApp();
        app.createRegistroLi = (r) => {
            const li = document.createElement('li');
            li.textContent = r.id;
            return li;
        };
        app.closeRegistrosModal = () => {};
        vi.spyOn(weightDB, 'getRecordsForEditList').mockResolvedValue(rows(5));

        await Promise.all([app.refreshListaRegistros(), app.refreshListaRegistros()]);

        expect(document.querySelectorAll('#listaRegistros li')).toHaveLength(
            WeightApp.HOME_REGISTROS_LIMIT,
        );
        expect(document.querySelectorAll('#listaRegistrosTodos li')).toHaveLength(5);
    });

    it('uma leitura antiga que resolve depois não sobrescreve a mais nova', async () => {
        const app = makeApp();
        app.createRegistroLi = (r) => {
            const li = document.createElement('li');
            li.textContent = r.id;
            return li;
        };
        app.closeRegistrosModal = () => {};
        const velha = deferred();
        vi.spyOn(weightDB, 'getRecordsForEditList')
            .mockReturnValueOnce(velha.promise)
            .mockResolvedValueOnce(rows(2));

        const primeira = app.refreshListaRegistros();
        await app.refreshListaRegistros();
        velha.resolve(rows(5));
        await primeira;

        expect(document.querySelectorAll('#listaRegistrosTodos li')).toHaveLength(2);
    });
});

describe('loadUserSession', () => {
    it('boot + evento de auth carregam a sessão uma vez só, depois do init', async () => {
        const app = makeApp();
        const ordem = [];
        const init = deferred();
        vi.spyOn(firebaseManager, 'initialize').mockImplementation(async () => {
            await init.promise;
            ordem.push('init');
            return true;
        });
        app.loadThemeForUser = vi.fn(async () => ordem.push('tema'));
        app.loadMetaForUser = vi.fn(async () => ordem.push('meta'));
        app.loadProfileForUser = vi.fn(async () => ordem.push('perfil'));
        app.loadInitialData = vi.fn(() => ordem.push('dados'));

        const user = { uid: 'me' };
        const a = app.loadUserSession(user); // listener userAuthChanged
        const b = app.loadUserSession(user); // bootstrapAuthUI
        init.resolve();
        await Promise.all([a, b]);

        expect(ordem).toEqual(['init', 'tema', 'meta', 'perfil', 'dados']);
    });

    it('outro usuário (troca de conta) carrega de novo', async () => {
        const app = makeApp();
        vi.spyOn(firebaseManager, 'initialize').mockResolvedValue(true);
        app.loadThemeForUser = async () => {};
        app.loadMetaForUser = async () => {};
        app.loadProfileForUser = async () => {};
        app.loadInitialData = vi.fn();

        await app.loadUserSession({ uid: 'a' });
        await app.loadUserSession({ uid: 'b' });

        expect(app.loadInitialData).toHaveBeenCalledTimes(2);
    });
});
