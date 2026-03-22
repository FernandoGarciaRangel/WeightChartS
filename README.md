# WeightChartS

**Autor:** Fernando Garcia Rangel

Aplicação web mobile-first para acompanhamento de peso familiar: gráficos (Chart.js), interface com Tailwind (CDN) e dados em **localStorage** ou **Firebase** (autenticação + Firestore), conforme `src/js/database.js` e `index.html`.

### Configuração Firebase (obrigatória)

A chave e o resto da configuração **não** ficam no `index.html` para não serem versionadas. Copia `src/config/firebase-config.example.js` para `src/config/firebase-config.js` e preenche com os valores do **Firebase Console** (Definições do projeto → a tua app web). Em produção, a chave continua visível no browser (normal em apps Firebase Web); reforça a segurança com **Firestore Rules**, **Auth** e, na Google Cloud, restrições de **HTTP referrer** na API key.

## Como correr

```bash
npm install
cp src/config/firebase-config.example.js src/config/firebase-config.js
# Edita firebase-config.js com os dados do teu projeto Firebase
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Mais detalhes em [QUICK_START.md](QUICK_START.md).

## Estrutura (web)

| Caminho | Função |
|--------|--------|
| `index.html` | Página, Tailwind e Chart.js via CDN |
| `src/config/firebase-config.js` | Config Firebase (local, não commitada; ver `.example.js`) |
| `src/js/app.js` | UI e eventos |
| `src/js/database.js` | Persistência (local / Firebase) |
| `src/js/chart.js` | Gráfico de evolução |
| `src/config/firebase.js` | Cliente Firebase (modular ES) para operações na nuvem |
| `src/css/styles.css` | Estilos extra |
| `src/manifest.json` | PWA |

## Scripts

- `npm run dev` / `npm start` — servidor estático local
- `npm run lint` — ESLint em `src/js` e `src/config`
- `npm run deploy` — Vercel (requer CLI configurada)

## Licença

MIT (ver `LICENSE`).
