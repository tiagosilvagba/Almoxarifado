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

## Desempenho

Os arquivos de compras são processados sequencialmente dentro de um Web Worker. Apenas uma parte permanece como texto na memória durante a consolidação, evitando o pico provocado pelo carregamento simultâneo de todas as bases.

O fluxo `Preparar bases de dados` também transforma os CSVs em `data/catalog.json.gz`. O navegador prioriza essa base compactada e usa os CSVs originais apenas como recuperação. A base otimizada é armazenada no cache do aplicativo e atualizada em segundo plano.
