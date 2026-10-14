# Gestão de Almoxarifado

Aplicação estática para análise de estoque, compras, consumo, reposição e comparativos mensais.

## Estrutura

- `index.html`: estrutura visual e acessibilidade.
- `script.js`: inicialização leve da aplicação.
- `app/core/`: regras centrais e processamento dos dados.
- `app/layers/`: camadas de compatibilidade das funcionalidades existentes.
- `app/modules/`: módulos carregados conforme prioridade.
- `tools/build_manifest.py`: descobre todos os CSVs e gera `data-manifest.json`.
- `sw-data-cache.js`: cache e atualização em segundo plano.

## Inclusão de novos CSVs

Adicione o arquivo na raiz seguindo o padrão correspondente. O fluxo do GitHub atualiza automaticamente o manifesto. Para atualizar localmente:

```bash
python tools/build_manifest.py
```

Arquivos de compras são reconhecidos pelo padrão `01 - Compras_Almox_Parte_NN.CSV`. Não há limite fixo de quatro partes.

## Consumo por mês (automatizado)

**Envie um CSV por mês na pasta [`consumo-mensal/`](consumo-mensal/README.md)**, por exemplo:

- `consumo-mensal/2026-08.csv`
- `consumo-mensal/2026-09.csv`
- `consumo-mensal/2026-10.csv`

Também são aceitos nomes como `03 - Consumo_Out_2026.csv` na raiz.

O workflow **Preparar bases de dados** consolida os arquivos em `data/consumo-consolidado.csv` e em `data/catalog.json.gz`, sem precisar executar comandos ou atualizar o site manualmente. A aba Consumo, a Revisão de Mínimo/Máximo e os cálculos de reposição continuam usando a mesma base, agora atualizada automaticamente.

O histórico original `03 - Consumo.csv` é preservado como legado; cada CSV mensal substitui integralmente os registros do mês correspondente (evitando duplicação). **Envie sempre o mês completo**, pois um upload parcial substituirá o mês inteiro. Para corrigir um mês, substitua o CSV anterior em vez de criar outro com o mesmo período.

Validação local opcional:

```bash
python tools/build_consumption.py
python -m unittest discover -s tests -p 'test_*.py'
node tools/build_catalog.mjs
```

O arquivo `data/consumo-meta.json` informa os meses carregados e substituídos, e a rotina falha de forma segura se houver arquivos mensais duplicados ou inconsistentes.

## Necessidade de compra: visão por fornecedor

Na aba **Necessidade de Compra**, selecione **Por fornecedor** para ver as sugestões agrupadas sem modificar a visão original **Por item**.

- Os grupos contêm apenas posições com **compra líquida positiva**, após descontar as coberturas por SC e OF; posições já cobertas e alertas especiais de Cavaco continuam na visão Por item.
- A indicação usa a OF mais recente do mesmo código de item e **mesma filial**. Se não houver OF na filial, um único fornecedor no histórico pode ser sugerido com aviso de confirmação. Vários fornecedores possíveis ficam em **Fornecedor a definir**.
- Fornecedores não identificados, campos como **Não informado** e históricos com múltiplas opções sem confirmação são agrupados em **um único card Fornecedor a definir**, exibido primeiro para não ficar escondido pela paginação.
- Os **demais cards** são ordenados pela **quantidade crescente de itens distintos** (do menor para o maior), e não pelo valor de compra nem pelo número de posições; em caso de empate, considera posições e nome do fornecedor.
- Cada grupo informa itens distintos, posições, valor líquido estimado e prioridades. Clique em um grupo para ver e abrir cada necessidade com seu código, filial, local e quantidade.
- O Excel/PDF segue a visão selecionada. **Por fornecedor** gera a planilha com nome e origem do fornecedor sugerido, sem perder as informações originais de lead time, cobertura e valor.
- **Atenção:** o agrupamento não emite SC, não escolhe definitivamente o fornecedor e não modifica saldos ou regras de compra. O comprador deve confirmar fornecedor, valor e condições antes de gerar a solicitação.

## Necessidade de compra: tipos de material por descrição

Selecione **Por tipo de material** na Necessidade de Compra. O sistema reconhece a família física da peça a partir do **nome e da descrição detalhada**, usando o cadastro apenas como apoio quando a descrição não identifica o material. Exemplos: **Rolamentos, Sensores, Correias, Válvulas, Motores, Redutores, Bombas, Parafusos, Filtros, Polias, Mangueiras e Instrumentos de medição**.

- Um item pertence somente a uma família, sem duplicação de consumo, posições, cobertura ou valores.
- Quando não há família identificável, o item fica em **Outros materiais / classificar**, sem inventar classificação.
- Apresenta itens distintos, posições e compra líquida estimada; permite detalhar cada necessidade.
- Agrupa apenas compras líquidas positivas, respeitando todos os filtros; itens cobertos e alertas especiais de Cavaco permanecem em **Por item**.
- Excel e PDF respeitam a visão selecionada e conservam as colunas de compra existentes.

## Necessidade de compra: itens comprados mais de uma vez no mês

A opção **Compras repetidas no mês** é uma **auditoria histórica de OFs**, independente de o item precisar de reposição hoje.

- Considera **mesmo código do item + mesma filial da OF + mesma competência**; registra ocorrências com **duas ou mais OFs distintas** naquele mês.
- Usa a data da OF para o mês, sem misturar SCs ainda sem OF nem contar pedidos cancelados.
- Mesmo quando uma OF aparece em várias linhas de recebimento/notas, ela é contada **uma única vez**. Não multiplica valores ou quantidades.
- Possui seleção de competência, mostra número e data de cada OF, fornecedor, SC, CCU e valor estimado quando houver informação confiável.
- Permite abrir o item e exportar as OFs em Excel/PDF, incluindo **Data OF no formato dd/mm/aaaa**.
- Aplica filtros do catálogo e de filial, local e responsável. Como o histórico informa a filial da OF, não é possível determinar pelo histórico um local físico de estoque específico quando há mais de um local na mesma filial.
- Não altera os saldos, indicadores de rupturas, compras líquidas, sugestões de fornecedor nem a lógica de reposição.

## Inteligência do Almoxarifado e planos 5W2H

A aba **Inteligência** é calculada localmente com a base de saldo, compras, consumo e parâmetros já carregada no Dashboard. Quando o GitHub Actions publica um novo catálogo, o navegador utiliza a nova base na próxima atualização do site, sem modificar solicitações ou ordens.

Ela identifica três famílias de anomalias:

1. **OFs repetidas no mesmo mês:** pelo menos duas OFs distintas para o mesmo código de item e filial na competência da data de emissão. Linhas repetidas por recebimentos da mesma OF não contam como novas compras.
2. **Volume de compras acima do máximo:** soma de OFs emitidas no mês mais recente daquele item/filial ou projeção de saldo com OF/SC em aberto para o CCU 1500 superior a **120% do máximo cadastrado** (limiar preventivo de 20%). O alerta exige conferência de sazonalidade, compras estratégicas e rateio entre locais.
3. **Zerados sem reposição e risco de zerar:** posições com saldo ≤ 0 ou cobertura estimada em até **30 dias** com base no consumo mensal ajustado, quando não foi identificada OF/SC em aberto para a filial e o CCU 1500. Registros de compras fora desse centro de custo não são contados automaticamente como cobertura do almoxarifado.

Cada ocorrência recebe um **5W2H específico (O quê, Por quê, Onde, Quando, Quem, Como, Quanto)**, com prioridade, evidências e valor potencial estimado quando há preço disponível. Os prazos e responsáveis apresentados são *recomendações a validar*, não tarefas executadas. O sistema não cria SCs, não cancela OFs e não altera parâmetros.

Filtros: tipo, prioridade, filial, competência, pesquisa e filtros globais; exportação Excel com o plano completo. O motor e seus testes ficam em `app/modules/inteligencia-almoxarifado.js` e `tests/warehouse-intelligence.test.js`.


## Histórico de atualizações dos CSVs e comparativo de estoque

A aba **Histórico do Estoque** guarda as posições de estoque de cada publicação consolidada dos CSVs. O workflow `Preparar bases de dados` constrói o catálogo, depois executa `tools/build_stock_history.mjs` e registra:

- Um arquivo de snapshot comprimido por atualização em `data/historico-estoque/<data-hora>-<assinatura>.json.gz`, contendo código sem pontos, descrição, filial, local, repartição, divisão, prateleira, saldo, custo unitário, valor do estoque, mínimo e máximo.
- Um índice público `data/historico-estoque/index.json` com data/hora em UTC, data local, assinatura das fontes, commit de origem e totais.
- Uma nova captura quando qualquer CSV do manifesto ou consumo mensal muda. Se o conteúdo for idêntico, não duplica; snapshots antigos não são substituídos.
- O navegador consulta apenas o índice e **duas capturas selecionadas**, para reduzir tempo de carregamento e consumo de memória.

Na aba, selecione **Posição inicial** e **Posição final**, filtre por item, filial ou local e visualize saldo inicial, saldo final, variação quantitativa e financeira, itens incluídos, retirados e alterados. É possível exportar o recorte em CSV compatível com Excel.

**Exemplo:** escolha a captura de 14/10/2026 e outra efetuada 50 dias depois. O histórico não fabrica posições intermediárias, não consulta futuras movimentações e não recria retroativamente as versões anteriores à implantação. O horário é o da captura do arquivo; valores de estoque dependem dos custos disponibilizados. A soma de quantidades de unidades diferentes é apenas uma soma aritmética, não um indicador físico homogêneo.

Teste automatizado: `tests/stock-history.test.js`. Para reconstruir o índice a partir das fontes atuais: `python tools/build_manifest.py`, `python tools/build_consumption.py`, `node tools/build_catalog.mjs`, `node tools/build_stock_history.mjs`. **Não remova a pasta de históricos** ao atualizar o site.

## Desempenho

Os arquivos de compras são processados sequencialmente dentro de um Web Worker. Apenas uma parte permanece como texto na memória durante a consolidação, evitando o pico provocado pelo carregamento simultâneo de todas as bases.

O fluxo `Preparar bases de dados` consolida o consumo e também transforma os CSVs em `data/catalog.json.gz`. O navegador prioriza essa base compactada e usa os CSVs originais apenas como recuperação. A base otimizada é armazenada no cache do aplicativo e atualizada em segundo plano.
