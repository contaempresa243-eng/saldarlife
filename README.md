# Saldar Life

Registo simples de vendas de recargas e cartões físicos. Funciona 100% offline (PWA) e guarda os dados só no telemóvel.

## Funções
- Venda de recargas (Unitel, Africell, Zapadinha) com número do cliente
- Venda de cartões físicos (Africell 200/500, Unitel 500/1000)
- Carrinho com várias vendas de uma vez
- Total do dia, por caixa (Dinheiro, Transferência, Multicaixa) e lucro
- Histórico com filtros
- Backup e importação (.json) e exportação para Excel (.csv)

## Ficheiros
`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png`

## Atualizar
Ao mudar qualquer ficheiro, aumenta o número do `CACHE` no `sw.js` (ex.: `saldar-life-v11` para `saldar-life-v12`) para os telemóveis receberem a versão nova.
