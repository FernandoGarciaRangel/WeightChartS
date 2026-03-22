# WeightChartS

**Autor:** Fernando Garcia Rangel

Aplicação web mobile-first para acompanhamento de peso familiar: gráficos (Chart.js), interface com Tailwind (CDN) e dados em **localStorage** ou **Firebase** (autenticação + Firestore), conforme `src/js/database.js` e `index.html`.

## Como correr

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Mais detalhes em [QUICK_START.md](QUICK_START.md).

## Estrutura (web)

| Caminho | Função |
|--------|--------|
| `index.html` | Página, Firebase (script inline), Tailwind e Chart.js via CDN |
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
