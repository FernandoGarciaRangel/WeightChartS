# WeightChartS

<div align="center">
  <img src="src/icons/weight-chart-icon.svg" alt="WeightChartS Logo" width="80" height="80">
  <h1>Aplicação web para acompanhamento de peso familiar</h1>
  <p>Gráficos interativos e persistência de dados na nuvem</p>
</div>

## 🚀 Funcionalidades

- **Registro de peso** por mês e semana
- **Gráficos interativos** usando Chart.js
- **Persistência local** (localStorage)
- **Interface mobile-first** com Tailwind CSS
- **Exportação/Importação** de dados
- **Design moderno** e intuitivo
- **PWA** - Instalável no celular
- **Estatísticas rápidas** em tempo real
- **Otimizado para touch** e mobile

## 🛠️ Tecnologias

- **Frontend:** HTML5, CSS3, JavaScript ES6+
- **Styling:** Tailwind CSS
- **Gráficos:** Chart.js
- **Deploy:** Vercel
- **Backend:** Firebase (preparado para implementação)

## 📁 Estrutura do Projeto

```
WeightChartS/
├── index.html              # Página principal (raiz)
├── src/
│   ├── css/
│   │   └── styles.css      # Estilos customizados
│   ├── js/
│   │   ├── app.js          # Aplicação principal
│   │   ├── database.js     # Gerenciamento de dados
│   │   └── chart.js        # Configuração de gráficos
│   ├── config/
│   │   └── firebase.js     # Configuração Firebase
│   └── icons/
│       └── weight-chart-icon.svg # Logo do projeto
├── vercel.json             # Configuração Vercel
└── package.json            # Dependências e scripts
```

## 🚀 Como Usar

### Desenvolvimento Local

1. Clone o repositório
2. Instale as dependências: `npm install`
3. Execute: `npm run dev`
4. Acesse: `http://localhost:3000`

### Deploy no Vercel

1. Conecte seu GitHub ao Vercel
2. Importe este repositório
3. Deploy automático a cada push

### Uso no Celular

1. Acesse o site no navegador do celular
2. **Instale como App**: Toque em "Adicionar à tela inicial"
3. Use como um aplicativo nativo
4. Funciona offline (dados salvos localmente)

## 📊 Como Funciona

1. **Selecione** o mês e semana
2. **Digite** seu peso atual
3. **Clique** em "Adicionar Registro"
4. **Visualize** a evolução no gráfico
5. **Exporte** seus dados quando necessário

## 🔮 Próximos Passos

- [x] **Interface mobile-first** otimizada
- [x] **PWA** para instalação no celular
- [x] **Estatísticas em tempo real**
- [ ] Implementar Firebase para persistência
- [ ] Adicionar autenticação de usuários
- [ ] Sistema de metas e alertas
- [ ] Comparação entre membros da família
- [ ] Notificações push
- [ ] Sincronização entre dispositivos

## 📝 Licença

MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 👨‍👩‍👧‍👦 Para a Família

Esta aplicação foi desenvolvida para ajudar sua família a acompanhar a evolução do peso de forma simples e visual. Todos os dados ficam salvos localmente e podem ser exportados para backup.

