# Regras de segurança do Firestore

As regras ficam em [`firestore.rules`](firestore.rules), que é a **fonte de verdade**. Não
edite as regras no Firebase Console: a próxima publicação a partir do arquivo desfaz a
edição.

## Como publicar

```bash
npx firebase-tools login                               # uma vez por máquina
npx firebase-tools deploy --only firestore:rules       # projeto em .firebaserc
```

Para só compilar e conferir, sem publicar, acrescente `--dry-run`.

## O que as regras garantem

| Coleção | Leitura | Escrita |
|---|---|---|
| `weightRecords/{id}` | só o dono (`userId`) | criar: `userId` = quem grava, só os campos do app, peso entre 0 e 500 kg. Editar: só `peso`/`data`/`mes`/`semana`/`timestamp`, sem trocar o dono |
| `users/{uid}` | só o dono | só `theme` (`light`/`dark`), `metaPeso` (null ou 0–500), `public` (bool) e `preferencesUpdatedAt` |
| `publicProfiles/{uid}` | qualquer autenticado | só o dono, no formato `{uid, displayName ≤ 100, meta, count ≥ 0, updatedAt}` |
| `publicSeries/{uid}` | qualquer autenticado | só o dono, `{points: lista ≤ 1000, updatedAt}` |

Duas decisões que não são óbvias:

- **Editar valida só os campos que mudam** (`diff().affectedKeys()`), não o documento
  inteiro. Documentos gravados por versões antigas do app têm campos extras (`userEmail`,
  o perfil público antigo dentro de `users/{uid}`); validar o doc inteiro faria corrigir
  um peso ou salvar o tema falhar para quem tem esses documentos.
- **As regras não iteram listas**, então os pontos de `publicSeries` não são validados um a
  um, só o tamanho da lista. Quem saneia cada ponto é o cliente
  (`_writePublicSnapshot`, invariante 5 do CLAUDE.md).

## Sintoma de regras por publicar ou desatualizadas

O app falha **em voz alta** em vez de fingir sucesso: a lista "Explorar" mostra erro, ativar
o perfil público mostra "não foi possível tornar o perfil público" e desativar mostra "seu
perfil continua público". Perfis que eram públicos no formato antigo precisam ser
reativados no toggle.
