# 🔥 Configuração do Firebase - WeightChartS

## 📋 Pré-requisitos

- Conta Google
- Projeto Firebase criado
- Acesso ao console Firebase

## 🚀 Passo a Passo

### 1. Criar Projeto Firebase

1. **Acesse**: [console.firebase.google.com](https://console.firebase.google.com)
2. **Clique em**: "Criar projeto"
3. **Nome do projeto**: `weightcharts-familia` (ou o nome que preferir)
4. **Google Analytics**: Desabilitar (opcional para começar)
5. **Clique em**: "Criar projeto"

### 2. Configurar Firestore Database

1. **No console Firebase**, clique em "Firestore Database"
2. **Clique em**: "Criar banco de dados"
3. **Modo**: "Iniciar no modo de teste" (para desenvolvimento)
4. **Localização**: Escolha a mais próxima (ex: `us-central1`)
5. **Clique em**: "Ativar"

### 3. Configurar Autenticação

1. **No console Firebase**, clique em "Authentication"
2. **Clique em**: "Começar"
3. **Métodos de login**: "Email/senha" (habilitar)
4. **Clique em**: "Salvar"

### 4. Obter Configuração da Aplicação

1. **No console Firebase**, clique na engrenagem (⚙️) ao lado de "Visão geral do projeto"
2. **Clique em**: "Configurações do projeto"
3. **Na aba "Geral"**, role para baixo até "Seus aplicativos"
4. **Clique em**: "Adicionar app" → "Web"
5. **Apelido**: `WeightChartS Web`
6. **Copie a configuração** que aparece

### 5. ✅ Configuração Concluída!

A configuração do Firebase já foi atualizada automaticamente com os dados do seu projeto:
- **Projeto**: `weightcharts-314d1`
- **API Key**: Configurada
- **Firestore**: Configurado
- **Auth**: Configurado

**Não é necessário fazer nenhuma alteração manual no código!**

### 6. Configurar Regras do Firestore

1. **No console Firebase**, vá para "Firestore Database"
2. **Clique em**: "Regras"
3. **Substitua** as regras por:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir leitura/escrita para usuários autenticados
    match /weightRecords/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

4. **Clique em**: "Publicar"

## 🔧 Estrutura dos Dados

### Coleção: `weightRecords`

```javascript
{
  id: "auto-gerado",
  mes: "janeiro",
  semana: "1",
  peso: 70.5,
  data: "24/08/2025",
  timestamp: 1234567890,
  userId: "user-id-anonimo",
  createdAt: "timestamp",
  updatedAt: "timestamp"
}
```

## 🧪 Testando

1. **Execute**: `npm run dev`
2. **Abra o console** do navegador
3. **Verifique** se aparece: "Firebase inicializado com sucesso!"
4. **Teste** adicionando um registro
5. **Verifique** no console Firebase se o dado foi salvo

**🎯 Status atual**: Firebase configurado e pronto para uso!

## 🚨 Solução de Problemas

### Erro: "Firebase não foi carregado"
- Verifique se os CDNs estão carregando
- Verifique se não há bloqueadores de script

### Erro: "Permission denied"
- Verifique as regras do Firestore
- Verifique se a autenticação está funcionando

### Erro: "Invalid API key"
- Verifique se a configuração está correta
- Verifique se o projeto está ativo

## 📱 Funcionalidades Implementadas

- ✅ **Sincronização automática** entre dispositivos
- ✅ **Backup automático** na nuvem
- ✅ **Fallback para localStorage** em caso de erro
- ✅ **Migração automática** de dados locais
- ✅ **Autenticação anônima** para cada usuário
- ✅ **Operações CRUD** completas

## 🔮 Próximos Passos

- [ ] Implementar autenticação com email/senha
- [ ] Adicionar múltiplos usuários da família
- [ ] Implementar sincronização em tempo real
- [ ] Adicionar notificações push

## 📞 Suporte

Se encontrar problemas:
1. Verifique o console do navegador
2. Verifique o console Firebase
3. Verifique as regras do Firestore
4. Teste com dados simples primeiro
