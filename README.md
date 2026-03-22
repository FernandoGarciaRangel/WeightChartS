# WeightChartS

**Autor:** Fernando Garcia Rangel

Aplicação web mobile-first para acompanhamento de peso familiar: gráficos (Chart.js), interface com Tailwind (CDN) e dados em **localStorage** ou **Firebase** (autenticação + Firestore), conforme `src/js/database.js` e `index.html`.

### Configuração Firebase

Opcionalmente podes usar `src/config/firebase-config.js` (copiado do `firebase-config.example.js`) para não versionar a config no repositório. O `index.html` inclui um **fallback** com a configuração pública do projeto para o site funcionar em deploy mesmo quando esse ficheiro não existe (o ficheiro local, se existir, tem prioridade). A chave web do Firebase é pública por desenho; a segurança vem das **Firestore Rules**, **Auth** e restrições de domínio/API na Google Cloud.

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
