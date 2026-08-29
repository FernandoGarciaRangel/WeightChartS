# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm install
npm run dev          # servidor em http://localhost:3000 (http-server, sem cache)
                     # 3000 é fixo por convenção: o Apps-Hub usa 8080 e a
                     # Calculadora 8081, para os três subirem ao mesmo tempo.
                     # O link "voltar para Apps" aponta para o 8080 em dev.
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
| `src/css/tokens.css` | Tokens do sistema de design "Preto & Laranja" (cópia idêntica nos três apps do workspace — ver `../Apps-Hub/DESIGN-SYSTEM.md`). Carregado **antes** de `styles.css` |
| `src/css/styles.css` | Camada de componentes dirigida pelos tokens (`card`, `panel`, `btn-primary`, `input-row`, `list-row`, `range-btn`…) + tokens locais de perigo (o sistema compartilhado não tem cor de perigo) |

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

#### As cinco invariantes do perfil público

A visibilidade é a única parte do app em que um erro **expõe dados de outra pessoa** ou apaga
o que já estava publicado. Cada regra abaixo corrige um bug real (todas têm teste; ver
`test/app.publicProfile.test.js` e `test/firebase.publicProfile.test.js`).

1. **A flag é a última escrita, e a ordem é oposta nos dois sentidos.** Ao ficar público:
   grava `publicProfiles`/`publicSeries` e **só depois** `users/{uid}.public = true`. Ao voltar
   a privado: **apaga** os dois docs e só depois `public = false`. Se algo falhar, a flag
   privada nunca diz o contrário do que está realmente publicado.
2. **Falhar ao apagar não é sucesso.** `setProfilePublic(false)` **lança** se o `deleteDoc`
   falhar (regra por publicar, offline) — antes havia um `.catch(() => {})` que fazia a UI
   anunciar "voltou a ser privado" com os documentos ainda legíveis por todos. A UI mantém o
   toggle ligado e diz *"seu perfil continua público"*.
3. **Snapshot vazio nunca é publicado por falha de leitura.** `getEvolucaoSnapshot()` **lança**
   em vez de devolver `{ points: [], total: 0 }`; publicar esse vazio apagava a evolução de
   quem já era público (e a auto-cura no boot fazia isso sozinha, offline).
4. **Escritas do perfil público são serializadas (`WeightApp.queuePublicOp`) e versionadas.**
   `_publicEpoch` muda a cada troca de visibilidade/sessão e `_publicSyncSeq` a cada sync; um
   `void syncPublicProfile()` em voo que resolvesse depois do toggle recriava os docs apagados
   — perfil público outra vez, UI a dizer "privado". A **leitura** fica fora da fila de
   propósito: uma leitura lenta não pode segurar o caminho de voltar a privado.
   `_lastPublicPayload` evita reescrever snapshot idêntico (o boot chama o sync duas vezes:
   `bootstrapAuthUI()` e o listener `userAuthChanged`).
5. **Só vai para a série o que o gráfico consegue desenhar.** `getEvolucaoSnapshot()` (e, por
   defesa, `_writePublicSnapshot`) descarta ponto sem timestamp (sairia em 1970) e converte
   peso em string ("80,5"); um `p` undefined faz o Firestore **recusar a escrita inteira**.
   `count` nunca é menor que a série publicada.

Falha de leitura ≠ ausência de dados, também na UI: o sync em erro escreve no cartão que a
evolução pública ficou desatualizada, e o detalhe do Explorar mostra erro em vez de
"este perfil ainda não tem registros". O próprio perfil **não** aparece na lista (por design —
o texto do vazio diz isso).

### Tema

O tema (`light`/`dark`) é aplicado via `document.documentElement.dataset.theme`. `WeightChart.refreshTheme()` relê as cores de `getThemeColors()` e chama `chart.update()` sem recriar o gráfico — e `getThemeColors()` lê os tokens com `getComputedStyle(document.documentElement).getPropertyValue(...)`, então o gráfico acompanha o tema sem hex duplicado. A preferência é salva no localStorage (`weightcharts_theme_{uid}`) e no Firestore (`users/{uid}.theme`); `applyTheme()` espelha também em `weightcharts_theme_last`, a chave sem uid que o script inline do `<head>` consegue ler antes do Firebase resolver a sessão (é o que evita o flash de tema errado).

**Trocar o tema é trocar variável, não acrescentar exceção.** Não existe mais o bloco `html[data-theme="light"] … !important` que mirava classes Tailwind (`.theme-card h2.text-white`); as cores saem de classes semânticas em `styles.css`. Duas consequências ao mexer no markup:

- Use as classes de componente (`card`, `panel`, `btn-primary`, `btn-secondary`, `btn-chip`, `input-row`, `list-row`, `t-dim`, `t-accent`…) em vez de utilitárias de cor do Tailwind (`bg-zinc-900`, `text-white`). As utilitárias de **layout** (`flex`, `gap-2`, `p-4`) continuam normais.
- As regras de componente começam com `:root` de propósito: o Tailwind CDN injeta o `<style>` dele **depois** do nosso CSS, então empata em especificidade (0,1,0) e vence pela ordem. `:root .card` dá (0,2,0) e ganha sem `!important`.

Regras de contraste (medidas, ver `../Apps-Hub/DESIGN-SYSTEM.md`): texto sobre laranja é `--on-accent`, nunca branco; laranja como **texto** é `--accent-text` (que escurece no tema claro), nunca `--accent`; `--text-faint` não é cor de texto pequeno. E o hover tem de se **afastar** do fundo — no escuro clareia, no claro escurece (`--link-hover`).

#### Ao auditar cor por script, três armadilhas

Duas sessões já perderam tempo com a primeira, e uma quase reportou três bugs inexistentes:

1. **Espere a transição acabar.** `body` tem `transition: background-color 0.2s`. Ler `getComputedStyle` logo depois de trocar `data-theme` devolve o valor **interpolado**: o `html` já está claro e o `body` ainda escuro, e o contraste sai errado. Espere ~600 ms, ou injete `*{transition:none!important}` antes de medir.
2. **Filtre elementos ocluídos.** Revelar todas as telas de uma vez faz medir texto que está por baixo de um scrim, contra o fundo errado. Meça uma tela de cada vez, ou confirme com `elementFromPoint`.
3. **`:hover` não se revela injetando CSS**, ao contrário de `.hidden`. Para medir um estado de hover, resolva o token que a regra usa (`getComputedStyle` num elemento-sonda com `color: var(--link-hover)`) — foi assim que o bug do `.btn-link` foi confirmado depois de escapar a uma auditoria que só media repouso.
4. **`shotfull` não é fiável com `<canvas>`.** O `#graficoPeso` sai com eixos, grelha, legenda e rótulos certos e **sem a linha** — parece que o gráfico está partido. Não está. Para gráfico: `shot` de viewport com `scrollIntoView` antes, e **confirme sempre por `Chart.getChart('graficoPeso')`** (`data.datasets[0].data`, `.labels`, `borderColor`) em vez de pelo píxel. Observado em duas máquinas independentes.

   O `scrollIntoView` sozinho **não** resolve — testado, sai vazio na mesma. No único caso em que o `shotfull` saiu completo havia um `shot` de viewport antes dele, o que não é remédio em que se possa confiar. Não documente mecanismo aqui: a primeira versão desta nota afirmava "canvas fora do viewport não repinta" e dava o `scrollIntoView` como solução, com base numa execução só; falhou noutra máquina. A condição observável acima é o que se sustenta.

As três primeiras fazem **inventar** problemas; a quarta faz **esconder** um que não existe, logo na parte mais retematizada. Em qualquer das quatro, a regra é a mesma: **meça, não confie no pixel**. Três falsos alarmes nesta série vieram de olhar para uma imagem reduzida — um laranja "mais claro", uns numerais "achatados" (é o desenho do Syne) e este gráfico "sem linha".

Handles para o driver: `window.weightApp` **existe** (`applyTheme`, `chart`, `createRegistroLi`, `metaPeso`); `window.weightDB` **não** — é escopo de módulo. Para o gráfico, `window.Chart.getChart('graficoPeso')`.

## Idioma

A UI, mensagens e documentação são em **português do Brasil (pt-BR)**. Mantenha textos novos em pt-BR (ex.: "arquivo", "salvar", "registro", "excluir").

## Deploy

O Vercel está configurado em `vercel.json` como build estático (`@vercel/static`). Todas as rotas fazem fallback para `index.html`. Arquivos JS e CSS são servidos com cabeçalhos `Content-Type` explícitos.

### Duas armadilhas ao conferir um deploy

**Maiúsculas/minúsculas.** O NTFS ignora, o Linux da Vercel não. Um `href="src/css/tokens.css"` apontando para um arquivo salvo como `Tokens.css` funciona local e some em produção — 404 silencioso, sem erro de build, página sem estilo. Já aconteceu neste workspace (registrado em `Apps-Hub/CLAUDE.md`). Confira o nome no disco letra por letra contra o `href` antes de commitar.

**Cache de stylesheet ao verificar.** Depois de um deploy, o browser pode continuar reportando os valores antigos dos tokens mesmo após recarregar — o CSS fica em cache. Dá para "confirmar" um deploy e estar lendo o anterior. Antes de acreditar no que o browser mostra, busque o CSS com cache-buster:

```bash
curl -s "https://<host>/src/css/tokens.css?v=$RANDOM" | grep accent-tint
```
