---
name: run-weightcharts
description: Roda, pilota e tira screenshot do WeightChartS (PWA de peso, vanilla JS + Firebase + Chart.js). Use para iniciar/subir o app, abrir em localhost, clicar na UI, registrar pesos, ver o gráfico, testar tema claro/escuro, capturar tela, rodar o smoke test end-to-end, ou confirmar que uma mudança funciona no app de verdade (não só nos testes). Palavras-chave: run, start, dev, serve, build, test, lint, screenshot, driver, headless, e2e, smoke.
---

# Rodar e pilotar o WeightChartS

PWA em vanilla JS, **sem build e sem bundler**: `index.html` + `src/js/*` servidos
como arquivos estáticos. Tailwind, Chart.js e o SDK do Firebase vêm de CDN em
runtime; `window.firebase` / `window.firebaseSDK` / `window.Chart` são globais
que `src/config/firebase.js` e `src/js/database.js` leem **em tempo de execução**.

O caminho do agente é o **driver**: `.claude/skills/run-weightcharts/driver.mjs`.
Ele sobe um servidor estático, lança o Chrome headless e fala CDP direto pelo
`WebSocket` nativo do Node — **zero dependências**, nada de Playwright.

Todos os caminhos abaixo são relativos a `WeightChartS/`.

## Pré-requisitos

Só Node ≥ 22 (pelo `WebSocket` global) e o Chrome instalado. Nada de `npm i`
para o driver — apenas para lint/testes:

```bash
node -v          # v22.13.0 aqui
npm install      # só precisa para `npm test` e `npm run lint`
```

O driver acha o Chrome sozinho em `C:/Program Files/Google/Chrome/Application/chrome.exe`
(também tenta Program Files (x86), LocalAppData, Edge e os caminhos de Linux).
Se estiver em outro lugar: `CHROME=<caminho do exe>`.

Não existe etapa de build — `npm run build` é literalmente um `echo`.

## Run (caminho do agente) — comece por aqui

### Smoke test end-to-end

39 checagens: sobe o app, destrava a UI, registra 4 pesos em datas passadas,
valida estatísticas, gráfico, filtro de período, meta, modal e tema. Gera 5
screenshots em `.claude-shots/`.

```bash
node .claude/skills/run-weightcharts/driver.mjs smoke
```

Passa com `OK: 38/39 checagens passaram, 1 aviso(s)` — o aviso é o bug dos
ícones do manifest (ver Gotchas), que **não** derruba o exit code.

### REPL: um comando por linha no stdin

É assim que se pilota o app à mão. Este é o fluxo mínimo para chegar na tela
principal com dados — copie e ajuste:

```bash
node .claude/skills/run-weightcharts/driver.mjs repl <<'EOF'
offline
goto /
click #btnStartApp
eval window.dispatchEvent(new CustomEvent('userAuthChanged',{detail:{user:{uid:'drv-local',email:'driver@local',displayName:'Driver'}}}))
sleep 700
click #btnOutraData
fill #dataRegistro 2026-06-05
fill #peso 91,2
click #btnAdicionar
sleep 300
fill #dataRegistro 2026-08-14
fill #peso 86,3
click #btnAdicionar
sleep 400
eval JSON.stringify({total: document.getElementById('totalRegistros').innerText, atual: document.getElementById('pesoAtual').innerText})
eval window.Chart.getChart('graficoPeso').data.labels
shot app.png
errors
quit
EOF
```

Saída real desse bloco:

```
ok eval "{\"total\":\"2\",\"atual\":\"86,3 kg\"}"
ok eval ["5 jun","14 ago"]
ok shot D:\REPOS\Apps-Fit\WeightChartS\.claude-shots\app.png
ok errors 0
```

Cada linha responde `ok …` ou `err …`. Comandos:

| Comando | O que faz |
|---|---|
| `offline` | corta o Firebase → modo localStorage. **Antes** do `goto` |
| `goto <rota>` | navega, espera `load` + 2 frames de raf |
| `click <sel>` | clique real de mouse no centro; **recusa** elemento invisível ou `disabled` |
| `fill <sel> <valor>` | seta `.value` e dispara `input`+`change` |
| `press Enter\|Tab\|Escape` | tecla de verdade |
| `text <sel>` | `innerText` |
| `eval <js>` | avalia (com `await` de promise) e imprime JSON |
| `wait <js>` | espera a expressão virar truthy (8 s) |
| `fit <sel>` | mede largura do texto vs. da caixa (ver Gotchas do Apps-Hub) |
| `shot <a.png>` / `shotfull <a.png>` | screenshot do viewport / da página inteira |
| `size <w> <h>` | muda o viewport (default 420×900, dsf 2, mobile) |
| `console` / `errors` | despeja o que o app logou / exceções não capturadas |
| `sleep <ms>` / `quit` | |

Screenshots caem em `.claude-shots/` (gitignorado). `OUT_DIR=<dir>` muda.
`HEADFUL=1` abre uma janela de verdade em vez de headless.

### Screenshot rápido da landing

```bash
node .claude/skills/run-weightcharts/driver.mjs shot landing.png
```

## Modo `offline`: o único jeito seguro de mexer no app

`src/config/firebase-config.js` está **commitado com credenciais reais de
produção** (apesar do `.gitignore` — o arquivo já estava no índice). Sem cortar
a rede, o app conecta no Firestore de verdade: `npm run dev` + login escreve na
base real do usuário.

`offline` bloqueia via CDP só o que é Firebase:

```
*gstatic.com/firebasejs*        *firestore.googleapis.com*
*identitytoolkit.googleapis.com*  *securetoken.googleapis.com*
```

Tailwind, Chart.js e as fontes continuam vindo do CDN. `firebaseManager.initialize()`
falha, `weightDB.useFirebase` fica `false` e todo CRUD vai para
`localStorage['registrosPeso_{uid}']`. O console confirma:

```
[error] Firebase não foi carregado. Verifique se o CDN está funcionando.
[log]   Usando localStorage como banco de dados
```

## Destravar a UI principal sem autenticar

O conteúdo principal (`.p-4.space-y-4`) fica `hidden` enquanto
`WeightApp.isAuthenticated` for falso, e a landing/tela de auth cobre tudo. Não
existe modo anônimo na UI. O destravamento é **disparar o evento que o próprio
app escuta**:

```bash
click #btnStartApp
eval window.dispatchEvent(new CustomEvent('userAuthChanged',{detail:{user:{uid:'drv-local',email:'driver@local',displayName:'Driver'}}}))
```

`WeightApp.setupAuthListener` e `WeightDatabase.setupAuthListener` escutam
`userAuthChanged`; isso põe `isAuthenticated = true`, mostra o conteúdo, seta
`currentUserId` e carrega os dados do localStorage. Sem exceção nenhuma.

O `click #btnStartApp` antes é necessário: ele grava
`localStorage['weightcharts_skip_landing'] = '1'` e sai da landing.

## Invocação direta (sem subir o app)

A lógica pura de `database.js` (datas, CSV, estatísticas, snapshot) e os métodos
de perfil público de `firebase.js` (com `window.firebaseSDK` mockado) rodam sem
browser. **A maioria dos PRs precisa só disto:**

```bash
npm test                       # vitest run — 37 testes, 3 arquivos, ~2 s
npm run test:watch
npm run coverage
npm run lint                   # eslint em src/js/**/*.js e src/config/**/*.js — limpo
```

Saída real: `Test Files 3 passed (3) / Tests 37 passed (37) / Duration 2.09s`.

Para chamar uma função direto, importe o módulo — é ESM (`"type": "module"`) e
`database.js` não toca no DOM no topo:

```bash
node --input-type=module -e "
  const m = await import('./src/js/database.js');
  console.log(Object.keys(m));
"
```

## Run (caminho humano)

```bash
npm run dev      # http-server em http://localhost:3000, sem cache
```

Abre no browser de verdade e **conecta no Firebase de produção**. Serve para
olhar; não use para testar escrita. `npm start` é o mesmo comando.

## Gotchas

- **`#peso` é `type="text"`, não `type="number"`** — aceita `91,2` com vírgula
  (`WeightApp.parsePeso` normaliza). Isso é o **oposto** da CalculadoraTMB, onde
  os inputs são `type="number"` e uma vírgula faz o `.value` virar `""` calado.
- **O botão de tema não funciona no modo offline.** `toggleTheme()` começa com
  `const uid = firebaseManager.getCurrentUserId(); if (!uid) return;` — o evento
  falso de auth não seta o usuário real do Firebase, então o clique é um no-op
  silencioso. Use `eval window.weightApp.applyTheme('light')`. Confirmado: o
  grid do gráfico vai de `rgba(63, 63, 70, 0.6)` para `rgba(0, 0, 0, 0.1)`,
  provando que `WeightChart.refreshTheme()` relê os tokens via `getComputedStyle`.
- **A regra "um registro por dia" desativa o botão antes do clique.** Ao escolher
  em `#dataRegistro` um dia que já tem registro, `#btnAdicionar.disabled` fica
  `true` e o driver responde `err click - elemento disabled: #btnAdicionar`. Isso
  é o app funcionando, não o driver falhando. O aviso aparece em **`#periodoResumo`**
  (não em `#err` nem perto do input): `"Esse dia já tem um registro. Corrija na
  lista ou escolha outra data."`. Para registrar de novo, mude a data primeiro.
- **`#btnVerTodos` fica `hidden` com ≤ 3 registros** (`WeightApp.HOME_REGISTROS_LIMIT = 3`).
  Precisa de 4+ para o botão e o modal `#modalRegistros` existirem na tela.
- **`#cardPerfilPublico` (e o `#btnExplorar` dentro dele) fica `hidden` no modo
  offline** — `updateProfileCardVisibility()` exige `firebaseManager.isAvailable()`.
  Perfil público / Explorar **não são testáveis sem Firebase real**; o driver
  responde `err click - elemento invisivel: #btnExplorar`.
- **BUG ABERTO: os 4 ícones do manifest estão quebrados.** `index.html` aponta
  `<link rel="manifest" href="src/manifest.json">`, e dentro do manifest os `src`
  são `"src/icons/icon-192.png"` — resolvidos **relativos ao manifest**, dão
  `/src/src/icons/…`. Os quatro caem no fallback e voltam `text/html` em vez de
  imagem. O Chrome só reclama de um deles no console. Correção: tirar o `src/`
  de cada entrada (viram `icons/icon-192.png` a partir de `/src/`) ou mover o
  manifest para a raiz. O `smoke` reporta isso como **AVISO**, não falha.
- **`shotfull` pinta elementos `fixed`/`sticky` no meio da página.** O header
  `Conectado / Tema claro / Sair` e o toast laranja aparecem na altura do
  viewport, não no topo da imagem — é como o `captureBeyondViewport` do CDP
  funciona. Para screenshot limpo do topo use `shot` (viewport) e espere o toast
  sumir.
- **Datas: compare sempre em hora local.** O app converte via meio-dia local
  (`dateInputValueToMs`) e seta `#dataRegistro.max` com a data local. Comparar
  com `new Date().toISOString().slice(0,10)` dá falso negativo à noite no fuso
  do Brasil, porque o UTC já virou o dia.
- **`window.weightDB` não existe** — o singleton é escopo de módulo. `window.weightApp`
  existe e é o handle bom (`applyTheme`, `chart`, `metaPeso`…). Para o gráfico use
  `window.Chart.getChart('graficoPeso')`.
- **Os registros não sobrevivem entre execuções do driver.** Cada `launch` cria
  um perfil de Chrome novo em `%TEMP%`, então o localStorage começa vazio. Ótimo
  para isolamento, ruim se você esperava continuar de onde parou.

## Troubleshooting

| Sintoma | Causa / correção |
|---|---|
| `err click - elemento disabled: #btnAdicionar` | Regra de 1 registro/dia. Mude `#dataRegistro` para outro dia. |
| `err click - elemento invisivel: #btnExplorar` | Perfil público exige Firebase real; indisponível no `offline`. |
| `err click - elemento invisivel: #btnVerTodos` | Menos de 4 registros. |
| Tema não muda ao clicar em `#btnTheme` | `toggleTheme()` aborta sem uid do Firebase. Use `eval window.weightApp.applyTheme('light')`. |
| Conteúdo principal continua `hidden` | Faltou o `userAuthChanged`, ou faltou o `click #btnStartApp` antes. |
| Tudo responde `forbidden` / página em branco | `APP_DIR` com barras trocadas. O driver já normaliza com `path.resolve`; se sobrescrever à mão, passe um caminho absoluto. |
| `Chrome não encontrado` | `CHROME=<caminho do chrome.exe>`. |
| `Chrome não abriu a porta de debug em 20000ms` | Sobrou um Chrome do driver travado: `taskkill //F //IM chrome.exe` (cuidado: fecha o seu browser também) ou reinicie. |
| `[error] Firebase não foi carregado` no console | Esperado no modo `offline` — é o sinal de que caiu no localStorage. |
