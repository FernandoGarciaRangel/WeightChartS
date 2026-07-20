# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm install
npm run dev          # servidor em http://localhost:3000 (http-server, sem cache)
npm run lint         # ESLint em src/js/**/*.js e src/config/**/*.js
npm test             # Vitest (roda uma vez); test:watch para modo watch; coverage para cobertura
npm run deploy       # deploy para Vercel produção (requer Vercel CLI)
```

Não há etapa de build. Os testes usam **Vitest + jsdom** (`test/**/*.test.js`) e cobrem a lógica pura de `database.js` (datas, import de CSV, estatísticas, snapshot) e os métodos de perfil público em `firebase.js` (com `window.firebaseSDK` mockado). O app em si é HTML/JS/CSS estático servido diretamente. O projeto é ESM (`"type": "module"` no package.json); por isso o config do ESLint é `.eslintrc.cjs`.

## Configuração Firebase

`src/config/firebase-config.js` está no `.gitignore`. Para começar:

```bash
cp src/config/firebase-config.example.js src/config/firebase-config.js
# preencha com os dados do seu projeto Firebase
```

Se o arquivo não existir, o `index.html` usa automaticamente a config pública do projeto como fallback.

## Arquitetura

PWA em **vanilla JS** (sem framework, sem bundler). Todas as dependências são carregadas via CDN.

### Padrão de carregamento de dependências — ponto crítico

O `index.html` carrega o Firebase como módulos ES a partir do CDN do gstatic num bloco `<script type="module">` inline. Após a inicialização, expõe dois globais:

- `window.firebase = { app, db, auth }` — instâncias do Firebase
- `window.firebaseSDK = { collection, addDoc, getDocs, … }` — funções do SDK

`src/config/firebase.js` e `src/js/database.js` **leem esses globais em tempo de execução** — não importam do npm nem de nenhuma URL. O Chart.js é carregado da mesma forma via CDN e exposto como o global `Chart` (declarado `readonly` no `.eslintrc.js`). O Tailwind também é CDN-only com um bloco de configuração personalizado dentro do `index.html`.

### Responsabilidades dos módulos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `index.html` | Toda a UI (markup Tailwind), tags CDN, init do SDK Firebase, ponto de entrada do app |
| `src/config/firebase.js` | Singleton `FirebaseManager` — auth (registro/login/logout/reset de senha), CRUD no Firestore, preferência de tema em `users/{uid}` |
| `src/js/database.js` | Singleton `WeightDatabase` (`weightDB`) — abstração de armazenamento duplo: Firebase quando autenticado, localStorage como fallback |
| `src/js/app.js` | `WeightApp` — orquestração da UI, event listeners, fluxo de auth, alternância de tema |
| `src/js/chart.js` | `WeightChart` — wrapper do Chart.js para gráfico de linha, sincronização de cores por tema |
| `src/config/firebase-config.js` | Credenciais do projeto Firebase (gitignored) |
| `src/css/styles.css` | CSS personalizado adicional ao Tailwind |

### Fluxo de autenticação e dados

1. `index.html` inicializa o SDK Firebase e expõe os globais.
2. `FirebaseManager.initialize()` chama `auth.authStateReady()` (trata a restauração assíncrona de sessão no mobile).
3. Mudanças de estado de auth disparam o evento DOM personalizado `userAuthChanged`.
4. `WeightApp.bootstrapAuthUI()` escuta e navega entre: landing → modal de auth → app principal.
5. `WeightDatabase` também escuta `userAuthChanged` para recarregar ou limpar dados.

### Modelo de dados

Os registros de peso são organizados como `{ [mes]: { [semana]: [ {peso, data, timestamp, localId?} ] } }`.

- `mes` — chave em português minúsculo (`janeiro`…`dezembro`)
- `semana` — string `"1"`–`"4"` (semana do mês, via `ceil(dia / 7)`)
- Coleção Firestore: `weightRecords`; cada documento tem campo `userId` — as regras de segurança impõem isolamento por usuário
- Chave localStorage: `registrosPeso_{userId}` (ou `registrosPeso_anonymous`)

`WeightDatabase.flattenLocalChronological()` é a fonte única de verdade para ordenar registros por timestamp tanto no gráfico quanto nas estatísticas. Os rótulos exibidos na UI são gerados por `recordPeriodLabel()` em `database.js`, que dá prioridade ao timestamp real sobre as chaves de mês/semana salvas.

### Regras de negócio

- **Um registro por dia** — `addWeightRecord(peso, timestamp)` e a edição de data em `updateWeightRecord` recusam se já houver registro no mesmo dia de calendário (fuso local). A chave do dia vem de `dayKeyFromTs()`; a verificação é `hasRecordOnDay()`. A UI reflete isso de forma proativa: `WeightApp.refreshTodayState()` desativa o botão "Adicionar" quando o **dia selecionado** (campo `#dataRegistro`) já tem registro.
- **Registrar em data passada** — o formulário tem um seletor de data (default hoje, `max` = hoje); `addWeightRecord` recebe o `timestamp` (meio-dia local via `dateInputValueToMs`) e o `WeightDatabase` deriva `mes`/`semana`/`data` com `derivePeriodFromMillis`. `WeightApp` tem um guard de reentrância (`_addingRecord`) contra duplo-clique.
- **Editar data** — ao editar, se o timestamp muda de dia, `derivePeriodFromMillis()` recalcula `mes`/`semana`/`data`; no localStorage o registro é **movido** entre `registros[mes][semana]` (limpando meses/semanas vazios).
- **Excluir** — `deleteWeightRecord({ id, localId })` apaga um registro (Firebase por `id`, local por `localId`).
- Conversão de datas usa o **meio-dia local** (`dateInputValueToMs` em `app.js`) para evitar saltos de dia por fuso horário.
- **Cache de registros** — `WeightDatabase.getRecordsCached()` mantém a lista cronológica (asc) em memória; toda escrita chama `invalidateCache()`. Gráfico, estatísticas, lista e checagem de duplicado derivam dele (evita reler o Firestore a cada chamada).
- **Peso** — entrada aceita vírgula decimal (`WeightApp.parsePeso`) e é validada em 0–500 kg no cliente e no `WeightDatabase` (add/update).
- **Meta de peso** — `users/{uid}.metaPeso` (+ localStorage `weightcharts_meta_{uid}`); desenhada como linha tracejada (2º dataset) via `WeightChart.setGoal()`.
- **Filtro de período** — `getAllRecords(rangeDays)` filtra os últimos N dias (30/90/365/null=tudo); `WeightChart` guarda o range ativo em `_rangeDays`.
- **Estatísticas** — `WeightDatabase.getStats()` retorna `latestPeso`, `delta`, `delta7`, `delta30`, `min`, `max`, `avg`, `total`.
- **Perfil público / Explorar** — opt-in via flag `users/{uid}.public` (doc **privado**, só o dono lê). O snapshot público fica em **coleções separadas**, legíveis por qualquer autenticado: `publicProfiles/{uid}` guarda metadados leves (`displayName`, `meta`, `count` = total real de registros) para a lista, e `publicSeries/{uid}` guarda a série completa (`points: [{t,p}]`). `getEvolucaoSnapshot()` retorna `{ points, total }` — `points` limitado a 1000 (para o gráfico) e `total` = contagem real (para `count`). Assim tema/preferências e os `weightRecords` continuam privados. A seção "Explorar" lista `publicProfiles` (`firebaseManager.listPublicProfiles()` — docs pequenos) e, só ao abrir um perfil, busca a série de `publicSeries/{uid}` (`getPublicSeries(uid)`) e renderiza num `WeightChart` read-only (`new WeightChart(id, { live:false })` + `renderPoints()`). O snapshot é regravado após cada escrita/alteração de meta — e uma vez no carregamento se já público (auto-cura de drift entre dispositivos) — via `WeightApp.syncPublicProfile()` → `firebaseManager.updatePublicSnapshot()`; ao desativar, `setProfilePublic(false)` **apaga** ambos os docs públicos. `listPublicProfiles()` **lança** em erro para a UI distinguir "sem perfis" de "falha ao carregar". As regras do Firestore liberam leitura de `publicProfiles`/`publicSeries` a autenticados; `users/{uid}` volta a ser só-do-dono.

### Tema

O tema (`light`/`dark`) é aplicado via `document.documentElement.dataset.theme`. `WeightChart.refreshTheme()` relê as cores de `getThemeColors()` e chama `chart.update()` sem recriar o gráfico. A preferência de tema é salva tanto no localStorage (`weightcharts_theme_{uid}`) quanto no Firestore (`users/{uid}.theme`).

## Idioma

A UI, mensagens e documentação são em **português do Brasil (pt-BR)**. Mantenha textos novos em pt-BR (ex.: "arquivo", "salvar", "registro", "excluir").

## Deploy

O Vercel está configurado em `vercel.json` como build estático (`@vercel/static`). Todas as rotas fazem fallback para `index.html`. Arquivos JS e CSS são servidos com cabeçalhos `Content-Type` explícitos.
