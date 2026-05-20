// Instâncias dos gráficos para podermos destruir e recriar ao filtrar
let chartDist = null;
let chartAlert = null;

document.addEventListener('DOMContentLoaded', () => {
    popularSelectMotoristas();
    
    // Seta datas padrão (mês atual)
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
    const ultimoDia = hoje.toISOString().split('T')[0];
    
    document.getElementById('filtro-data-inicio').value = primeiroDia;
    document.getElementById('filtro-data-fim').value = ultimoDia;

    carregarBI();
});

async function popularSelectMotoristas() {
    const res = await fetch('/api/cadastros');
    const dados = await res.json();
    const sel = document.getElementById('filtro-motorista');
    dados.motoristas.forEach(m => sel.innerHTML += `<option value="${m.id}">${m.nome}</option>`);
}

async function carregarBI() {
    const agrupamento = document.getElementById('filtro-agrupamento').value;
    const apenasFimSemana = document.getElementById('filtro-fim-semana').value; // <--- CAPTURA O NOVO SELECT

    const payload = {
        id_motorista: document.getElementById('filtro-motorista').value,
        data_inicio: document.getElementById('filtro-data-inicio').value,
        data_fim: document.getElementById('filtro-data-fim').value,
        agrupamento: agrupamento,
        apenas_fim_semana: apenasFimSemana // <--- ENVIA NO PAYLOAD
    };

    const res = await fetch('/api/relatorios/bi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const dados = await res.json();

    // 1. Atualizar KPIs de forma responsiva
    document.getElementById('kpi-km').innerHTML = `${dados.total_km.toFixed(1)} <span class="fs-6 fw-normal">km</span>`;
    document.getElementById('kpi-litros').innerHTML = `${dados.total_litros.toFixed(1)} <span class="fs-6 fw-normal">L</span>`;
    
    const consumo = dados.total_litros > 0 ? (dados.total_km / dados.total_litros).toFixed(1) : "0";
    document.getElementById('kpi-consumo').innerHTML = `${consumo} <span class="fs-6 fw-normal">km/L</span>`;

    // 2. Classificação de Risco Comportamental Dinâmica
    const totalStrikes = (dados.alertas.ERR * 3) + (dados.alertas.INC * 2) + dados.alertas.ALT;
    const kpiRisco = document.getElementById('kpi-risco');
    const cardRisco = document.getElementById('card-status-risco');
    
    if (totalStrikes === 0) {
        kpiRisco.innerText = "Excelente";
        cardRisco.className = "card border-0 shadow-sm h-100 bg-success text-white";
    } else if (totalStrikes < 10) {
        kpiRisco.innerText = "Médio";
        cardRisco.className = "card border-0 shadow-sm h-100 bg-warning text-dark";
    } else {
        kpiRisco.innerText = "Crítico";
        cardRisco.className = "card border-0 shadow-sm h-100 bg-danger text-white";
    }

    // 3. Formatação inteligente de datas para os eixos do gráfico
    const formatarLabel = (periodo, tipo) => {
        if (tipo === 'mes') {
            const partes = periodo.split('-');
            return `${partes[1]}/${partes[0]}`; // MM/YYYY
        } else {
            const partes = periodo.split('-');
            return `${partes[2]}/${partes[1]}`; // DD/MM
        }
    };

    // 4. Atualizar Gráfico Dinâmico de KM (Linha)
    if (chartDist) chartDist.destroy();
    chartDist = new Chart(document.getElementById('chartDistancia'), {
        type: 'line',
        data: {
            labels: dados.km_por_tempo.map(d => formatarLabel(d.periodo, agrupamento)),
            datasets: [{
                label: 'KM Rodados',
                data: dados.km_por_tempo.map(d => d.km),
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // 5. Atualizar Gráfico de Alertas (Doughnut)
    if (chartAlert) chartAlert.destroy();
    chartAlert = new Chart(document.getElementById('chartAlertas'), {
        type: 'doughnut',
        data: {
            labels: ['Erros', 'Inconsist.', 'Alertas'],
            datasets: [{
                data: [dados.alertas.ERR, dados.alertas.INC, dados.alertas.ALT],
                backgroundColor: ['#dc3545', '#fd7e14', '#0dcaf0']
            }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
    });
}