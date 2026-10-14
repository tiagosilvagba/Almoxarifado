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
- Cada grupo informa itens distintos, posições, valor líquido estimado e prioridades. Clique em um grupo para ver e abrir cada necessidade com seu código, filial, local e quantidade.
- O Excel/PDF segue a visão selecionada. **Por fornecedor** gera a planilha com nome e origem do fornecedor sugerido, sem perder as informações originais de lead time, cobertura e valor.
- **Atenção:** o agrupamento não emite SC, não escolhe definitivamente o fornecedor e não modifica saldos ou regras de compra. O comprador deve confirmar fornecedor, valor e condições antes de gerar a solicitação.

## Desempenho

Os arquivos de compras são processados sequencialmente dentro de um Web Worker. Apenas uma parte permanece como texto na memória durante a consolidação, evitando o pico provocado pelo carregamento simultâneo de todas as bases.

O fluxo `Preparar bases de dados` consolida o consumo e também transforma os CSVs em `data/catalog.json.gz`. O navegador prioriza essa base compactada e usa os CSVs originais apenas como recuperação. A base otimizada é armazenada no cache do aplicativo e atualizada em segundo plano.
