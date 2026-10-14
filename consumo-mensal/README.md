# Consumo mensal — upload automático

Envie **um CSV completo para cada mês** nesta pasta, sem editar arquivos de código.

## Nome do arquivo

Use `2026-10.csv`, `2026-11.csv`, `2026-12.csv`, etc.
Também são aceitos nomes como `Consumo_Out_2026.csv` e, na raiz, `03 - Consumo_Out_2026.csv`.

Para corrigir um mês já enviado, **substitua o mesmo arquivo**, não envie outra cópia: duas planilhas para a mesma competência provocam erro de validação para impedir consumo duplicado.

## Estrutura dos CSVs

Separador: ponto e vírgula (`;`). Obrigatórios:

- `Cod_Item`: código do item, com ou sem ponto
- `Cd Filial`: código da filial
- `Local`: código do local
- `Qt Movimento`: consumo, permitindo vírgula decimal

Recomendados: `Nm Filial`, `Ds Local Estoque`, `mÊs`. Se o CSV não possuir a coluna `mÊs`, a competência é extraída do nome do arquivo; cada arquivo deve possuir somente um mês.

Exemplo para **2026-10.csv**:

```csv
Cod_Item;Cd Filial;Nm Filial;Local;Ds Local Estoque;mÊs;Qt Movimento
243370;704;ROLANDIA - AB.AVES;299;ALMOXARIFADO;10/2026;10,5
407919;704;ROLANDIA - AB.AVES;5;ALMOXARIFADO;10/2026;20
```

## O que acontece após o upload

O GitHub Actions executa **Preparar bases de dados**:

1. Lê `03 - Consumo.csv` como histórico legado, que não é modificado.
2. Para os meses com arquivo próprio, usa **somente o CSV mensal novo**; remove do consolidado as linhas antigas da mesma competência.
3. Soma registros do mesmo item, filial, local e mês, preservando saldos negativos quando existirem; valida competência e campos.
4. Gera `data/consumo-consolidado.csv` com colunas compatíveis com o sistema e `data/consumo-meta.json` para auditoria.
5. Reconstrói `data/catalog.json.gz`, de onde o Dashboard obtém os indicadores de consumo, revisão de mínimo/máximo e compra.

**Importante:** o histórico antigo usa abreviações de mês (`jan`, `fev`, ...). Elas foram associadas ao ano **2026**, conforme a base legada. Se o histórico original passar a representar outro ano, revise o parâmetro `--legacy-year` do consolidador antes de publicar os arquivos.

A rotina só considera o mês enviado como **completo**. Um arquivo parcial substituirá o mês inteiro e pode reduzir indevidamente o consumo; confira a exportação antes do upload.

Depois do envio, acompanhe a ação [Preparar bases de dados](https://github.com/tiagosilvagba/Almoxarifado/actions/workflows/update-data-manifest.yml) e confirme que foi concluída com sucesso. Enquanto não estiver concluída, a atualização ainda não estará garantida no Dashboard.
