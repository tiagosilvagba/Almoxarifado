import { itensFiltrados, itensProcessados } from './state.js';
import { mostrarToast } from './loader.js';

window.exportarComprasExcel = function() {
    const necessitaCompra = itensFiltrados.filter(i => (i.saldo <= 0 || i.saldo < i.minimo) && i.minimo > 0 && i.maximo > 0);
    if(necessitaCompra.length === 0) {
        mostrarToast("Nenhum dado crítico na tela para exportar.", "warning");
        return;
    }
    
    let csvContent = "\uFEFF"; 
    csvContent += "Código;Descrição;Filial;Saldo Atual;Mínimo;Máximo;Sugestão Compra;Custo Unitário;Valor Estimado Compra\n";
    
    necessitaCompra.sort((a,b) => a.saldo - b.saldo).forEach(i => {
        let sug = i.maximo - i.saldo;
        let val = sug * i.custoUnitario;
        let descLimpa = i.desc.replace(/;/g, ',');
        let filialLimpa = i.filialNm.replace(/;/g, ',');
        csvContent += `${i.cod};${descLimpa};${filialLimpa};${i.saldo};${i.minimo};${i.maximo};${sug};${i.custoUnitario.toFixed(2)};${val.toFixed(2)}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Necessidade_Compra_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarToast("Arquivo Excel baixado com sucesso!", "success");
}

window.exportarRevisaoExcel = function() {
    const itensRevisao = itensFiltrados.filter(i => {
        if (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) return true;
        if (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) return true;
        if (i.saldoUtil > i.maximo && i.maximo > 0) return true;
        return false;
    });

    if(itensRevisao.length === 0) {
        mostrarToast("Nenhum dado de revisão na tela para exportar.", "warning");
        return;
    }

    let csvContent = "\uFEFF"; 
    csvContent += "Código;Descrição;Filial;Saldo Útil;Mínimo Atual;Máximo Atual;Sugestão Novo Mín;Sugestão Novo Máx;Custo Consumo Mês;Ação Recomendada\n";

    itensRevisao.forEach(i => {
        let acao = "";
        if (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) {
            acao = "Revisar/Zerar (Sem Consumo)";
        } else if (i.saldoUtil > i.maximo && i.maximo > 0) {
            acao = "Reduzir Máximo (Excesso)";
        } else if (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) {
            acao = "Aumentar Mínimo (Risco)";
        }

        let descLimpa = i.desc.replace(/;/g, ',');
        let filialLimpa = i.filialNm.replace(/;/g, ',');
        csvContent += `${i.cod};${descLimpa};${filialLimpa};${i.saldoUtil};${i.minimo};${i.maximo};${i.sugestaoMin};${i.sugestaoMax};${i.consumoFinanceiro.toFixed(2)};${acao}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Revisao_MinMax_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarToast("Planilha de Revisão baixada com sucesso!", "success");
}