// ==========================================
// ESTADO GLOBAL
// ==========================================
let configuracoesAuditoria = {
    consumo_esperado: 10.0,
    margem_salto: 5.0,
    tolerancia_maps: 30
};
let ultimoPayloadEnviado = null;
let ultimoResultadoAuditoria = null;
const cacheDeRotasMaps = {};

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    carregarMotoristasEVeiculos();
    criarNovaLinhaBDT();
    criarNovaLinhaComb();
    configurarAtalhosTeclado();

    // NOVIDADE: Alterna o texto e ícone do botão de ocultar tabela
    const collBdt = document.getElementById('collapseBdtTable');
    const btnToggle = document.getElementById('btn-toggle-tabela');
    if(collBdt && btnToggle) {
        collBdt.addEventListener('hidden.bs.collapse', () => {
            btnToggle.innerHTML = '<i class="bi bi-arrows-expand"></i> Expandir Planilha';
            btnToggle.classList.replace('btn-outline-secondary', 'btn-secondary');
        });
        collBdt.addEventListener('shown.bs.collapse', () => {
            btnToggle.innerHTML = '<i class="bi bi-arrows-collapse"></i> Ocultar Planilha';
            btnToggle.classList.replace('btn-secondary', 'btn-outline-secondary');
        });
    }
});

async function carregarMotoristasEVeiculos() {
    try {
        const res = await fetch('/api/cadastros');
        const dados = await res.json();
        
        const selMot = document.getElementById('select-motorista');
        const selVei = document.getElementById('select-veiculo');
        
        selMot.innerHTML = '<option value="">Selecione o Motorista...</option>';
        dados.motoristas.forEach(m => selMot.innerHTML += `<option value="${m.id}">${m.nome} (${m.matricula})</option>`);
        
        selVei.innerHTML = '<option value="">Selecione o Veículo...</option>';
        dados.veiculos.forEach(v => selVei.innerHTML += `<option value="${v.id}">${v.placa} - ${v.modelo}</option>`);
    } catch (e) {
        console.error("Erro ao carregar dados:", e);
    }
}

// ==========================================
// CONTROLE DE TABELAS
// ==========================================
function criarNovaLinhaBDT() {
    const tbody = document.querySelector('#bdtTable tbody');
    let numParadas = document.querySelectorAll('#bdtTable thead th.th-parada').length;
    let tdsParadas = '';
    
    for(let i = 1; i <= numParadas; i++) { 
        tdsParadas += `<td><input type="text" class="form-control form-control-sm parada" placeholder="Parada ${i}"></td>`; 
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="date" class="form-control form-control-sm data-viagem"></td>
        <td><input type="time" class="form-control form-control-sm hora-in"></td>
        <td><input type="number" step="0.1" class="form-control form-control-sm km-in"></td>
        <td><input type="text" class="form-control form-control-sm origem" placeholder="Origem" oninput="sincronizarCacheMaps(this)"></td>
        ${tdsParadas}
        <td class="td-destino"><input type="text" class="form-control form-control-sm destino" placeholder="Destino" oninput="sincronizarCacheMaps(this)"></td>
        <td><input type="time" class="form-control form-control-sm hora-out"></td>
        <td><input type="number" step="0.1" class="form-control form-control-sm km-out"></td>
        <td><input type="number" step="0.1" class="form-control form-control-sm km-maps" oninput="sincronizarCacheMaps(this)"></td>
        <td class="text-center"><button class="btn btn-outline-danger btn-sm border-0" onclick="deletarLinha(this)"><i class="bi bi-trash3"></i></button></td>
    `;
    tbody.appendChild(tr);
}

function criarNovaLinhaComb() {
    const tbody = document.querySelector('#combTable tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="date" class="form-control form-control-sm data-viagem"></td>
        <td><input type="time" class="form-control form-control-sm hora"></td>
        <td><input type="number" step="0.1" class="form-control form-control-sm km-bomba"></td>
        <td><input type="number" step="0.1" class="form-control form-control-sm litros"></td>
        <td class="text-center"><button class="btn btn-outline-danger btn-sm border-0" onclick="deletarLinha(this)"><i class="bi bi-trash3"></i></button></td>
    `;
    tbody.appendChild(tr);
}

window.deletarLinha = function(btn) {
    const tr = btn.closest('tr');
    const tbody = tr.closest('tbody');
    const isBdt = tbody.closest('table').id === 'bdtTable';
    tr.remove();
    
    if (tbody.children.length === 0) {
        if (isBdt) criarNovaLinhaBDT(); else criarNovaLinhaComb();
    }
};

function adicionarColunaParada(linhaAtual) {
    const theadTr = document.querySelector('#bdtTable thead tr');
    const thDestino = theadTr.querySelector('.th-destino');
    let numParadas = document.querySelectorAll('#bdtTable thead th.th-parada').length + 1;
    
    const novoTh = document.createElement('th');
    novoTh.className = 'th-parada bg-info text-white'; 
    novoTh.innerText = `Parada ${numParadas}`;
    theadTr.insertBefore(novoTh, thDestino);
    
    let novoInputFoco = null;
    document.querySelectorAll('#bdtTable tbody tr').forEach(tr => {
        const tdDestino = tr.querySelector('.td-destino');
        const novoTd = document.createElement('td');
        novoTd.innerHTML = `<input type="text" class="form-control form-control-sm parada" placeholder="Parada ${numParadas}">`;
        tr.insertBefore(novoTd, tdDestino);
        if (tr === linhaAtual) novoInputFoco = novoTd.querySelector('input');
    });
    if (novoInputFoco) novoInputFoco.focus();
}

function removerColunaParada(inputParada) {
    if (!inputParada.classList.contains('parada')) return;
    const td = inputParada.closest('td'); 
    const tr = td.closest('tr');
    const indexTd = Array.from(tr.children).indexOf(td);
    
    document.querySelector('#bdtTable thead tr').children[indexTd].remove();
    document.querySelectorAll('#bdtTable tbody tr').forEach(linha => linha.children[indexTd].remove());
    
    const novoFocoInput = tr.children[indexTd - 1].querySelector('input');
    if (novoFocoInput) novoFocoInput.focus();
}

// ==========================================
// INTELIGÊNCIA DA TABELA (Cache Maps e Teclado)
// ==========================================
window.sincronizarCacheMaps = function(el) {
    const tr = el.closest('tr');
    const o = (tr.querySelector('.origem')?.value || '').trim().toUpperCase();
    const d = (tr.querySelector('.destino')?.value || '').trim().toUpperCase();
    if (!o || !d) return;
    
    const chave = o + " -> " + d;
    const inputMaps = tr.querySelector('.km-maps');
    
    if (el.classList.contains('km-maps') && inputMaps.value) {
        cacheDeRotasMaps[chave] = inputMaps.value;
        document.querySelectorAll('#bdtTable tbody tr').forEach(row => {
            const rowO = (row.querySelector('.origem')?.value || '').toUpperCase();
            const rowD = (row.querySelector('.destino')?.value || '').toUpperCase();
            const rowMaps = row.querySelector('.km-maps');
            if (rowO === o && rowD === d && rowMaps && rowMaps !== inputMaps && !rowMaps.value) {
                rowMaps.value = inputMaps.value;
            }
        });
    } else if (cacheDeRotasMaps[chave] && !inputMaps.value) {
        inputMaps.value = cacheDeRotasMaps[chave];
    }
};

function configurarAtalhosTeclado() {
    document.addEventListener('keydown', (e) => {
        const input = e.target;
        if (input.tagName !== 'INPUT') return;
        
        if (e.key === 'Backspace' && input.value === '') {
            if (e.shiftKey && input.classList.contains('parada')) {
                e.preventDefault();
                removerColunaParada(input);
            } else {
                e.preventDefault();
                const tr = input.closest('tr');
                const inputs = Array.from(tr.querySelectorAll('input'));
                const idx = inputs.indexOf(input);
                if (idx > 0) inputs[idx - 1].focus();
            }
        }
        
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey && input.closest('table').id === 'bdtTable') {
                adicionarColunaParada(input.closest('tr'));
                return;
            }
            
            const tr = input.closest('tr');
            const inputs = Array.from(tr.querySelectorAll('input'));
            const idx = inputs.indexOf(input);
            
            if (idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            } else {
                if (!tr.nextElementSibling) {
                    if (tr.closest('table').id === 'bdtTable') criarNovaLinhaBDT();
                    else criarNovaLinhaComb();
                }
                tr.nextElementSibling.querySelector('input').focus();
            }
        }
    });
}

// ==========================================
// API: AUDITORIA E SALVAMENTO
// ==========================================
window.enviarParaAuditoria = async function() {
    const idMotorista = document.getElementById('select-motorista').value;
    const idVeiculo = document.getElementById('select-veiculo').value;
    
    if (!idMotorista || !idVeiculo) {
        return alert("Selecione Motorista e Veículo!");
    }

    const payload = { id_motorista: idMotorista, id_veiculo: idVeiculo, bdt: [], combustivel: [], configuracoes: configuracoesAuditoria };
    let temErroVazio = false;

    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

    document.querySelectorAll('#bdtTable tbody tr').forEach(tr => {
        const obrigatorios = ['.data-viagem', '.hora-in', '.origem', '.destino', '.hora-out', '.km-in', '.km-out'].map(cls => tr.querySelector(cls));
        const preenchidos = obrigatorios.filter(i => i.value.trim() !== '');
        
        if (preenchidos.length > 0 && preenchidos.length < 7) {
            temErroVazio = true;
            obrigatorios.filter(i => i.value.trim() === '').forEach(i => i.classList.add('is-invalid'));
        } else if (preenchidos.length === 7) {
            const paradas = Array.from(tr.querySelectorAll('.parada')).map(i => i.value.trim()).filter(v => v);
            let destinoFinal = tr.querySelector('.destino').value.trim();
            if (paradas.length > 0) destinoFinal = paradas.join(' ➔ ') + ' ➔ ' + destinoFinal;
            
            payload.bdt.push({
                dia: tr.querySelector('.data-viagem').value,
                hora_in: tr.querySelector('.hora-in').value,
                hora_out: tr.querySelector('.hora-out').value,
                origem: tr.querySelector('.origem').value,
                destino: destinoFinal,
                km_in: tr.querySelector('.km-in').value,
                km_out: tr.querySelector('.km-out').value,
                km_maps: tr.querySelector('.km-maps').value
            });
        }
    });

    document.querySelectorAll('#combTable tbody tr').forEach(tr => {
        const inputs = Array.from(tr.querySelectorAll('input'));
        const preenchidos = inputs.filter(i => i.value.trim() !== '');
        if (preenchidos.length > 0 && preenchidos.length < 4) {
            temErroVazio = true;
            inputs.filter(i => i.value.trim() === '').forEach(i => i.classList.add('is-invalid'));
        } else if (preenchidos.length === 4) {
            payload.combustivel.push({ dia: inputs[0].value, hora: inputs[1].value, km_bomba: inputs[2].value, litros: inputs[3].value });
        }
    });

    if (temErroVazio) return alert("Preencha todos os campos obrigatórios nas linhas que iniciou!");
    if (payload.bdt.length === 0 && payload.combustivel.length === 0) return alert("Tabelas vazias.");

    try {
        const res = await fetch('/api/auditar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const resultado = await res.json();
        
        ultimoPayloadEnviado = payload;
        ultimoResultadoAuditoria = resultado;
        
        renderizarResultados(resultado);
        
    } catch (e) {
        console.error(e);
        alert("Erro de comunicação com a API de auditoria.");
    }
};

function renderizarResultados(res) {

    // NOVIDADE: Oculta a planilha automaticamente para dar foco ao relatório!
    const collapseEl = document.getElementById('collapseBdtTable');
    if(collapseEl && collapseEl.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(collapseEl).hide();
    }

    document.getElementById('box-relatorio').style.display = 'block';
    document.getElementById('res-km-declarado').innerText = res.km_declarado.toFixed(1) + " km";
    document.getElementById('res-km-salto').innerText = res.km_nao_registrado.toFixed(1) + " km";
    document.getElementById('res-km-total').innerText = res.total_rodado.toFixed(1) + " km";
    document.getElementById('res-consumo').innerText = res.consumo > 0 ? res.consumo.toFixed(1) + " km/L" : "0 km/L";
    document.getElementById('res-total-abastecido').innerText = res.total_abastecido ? res.total_abastecido.toFixed(1) + " L" : "0 L";
    
    const saldo = res.saldo_teorico ? res.saldo_teorico.toFixed(1) : "0";
    const elSaldo = document.getElementById('res-saldo-teorico');
    elSaldo.innerText = saldo + " L";
    elSaldo.className = res.saldo_teorico < 0 ? "text-danger mb-0" : "text-success mb-0";

    // ==========================================
    // RENDERIZAÇÃO DO SISTEMA DE STRIKES
    // ==========================================
    document.getElementById('res-nivel-risco').innerText = res.nivel_risco;
    document.getElementById('badge-strikes').innerText = res.total_strikes + (res.total_strikes === 1 ? " Strike" : " Strikes");
    
    const cardRisco = document.getElementById('card-risco');
    const badgeStrikes = document.getElementById('badge-strikes');
    const textRisco = document.getElementById('res-nivel-risco');

    // Reseta as cores do cartão
    cardRisco.className = "card border-start border-4 h-100 shadow-sm";
    
    if (res.nivel_risco === "Excelente") {
        cardRisco.classList.add("border-success", "bg-success-subtle");
        textRisco.className = "text-success mb-0 fw-bold";
        badgeStrikes.className = "badge rounded-pill bg-success mt-2";
    } else if (res.nivel_risco === "Atenção") {
        cardRisco.classList.add("border-warning", "bg-warning-subtle");
        textRisco.className = "text-warning-emphasis mb-0 fw-bold";
        badgeStrikes.className = "badge rounded-pill bg-warning text-dark mt-2";
    } else if (res.nivel_risco === "Médio") {
        cardRisco.classList.add("border-orange", "bg-orange-subtle"); 
        cardRisco.style.borderColor = "#fd7e14";
        cardRisco.style.backgroundColor = "#fff3cd";
        textRisco.className = "mb-0 fw-bold";
        textRisco.style.color = "#fd7e14";
        badgeStrikes.className = "badge rounded-pill mt-2";
        badgeStrikes.style.backgroundColor = "#fd7e14";
    } else { // Crítico
        cardRisco.classList.add("border-danger", "bg-danger-subtle");
        textRisco.className = "text-danger mb-0 fw-bold";
        badgeStrikes.className = "badge rounded-pill bg-danger mt-2";
    }

    // ==========================================
    // AGRUPAMENTO DE ALERTAS (BOOTSTRAP ACCORDION)
    // ==========================================
    const divAlertas = document.getElementById('lista-alertas');
    divAlertas.innerHTML = "";
    
    if (res.alertas.length > 0) {
        // 1. Organiza os dados em categorias
        const categorias = {
            'ERR': { titulo: "🔴 ERROS CRÍTICOS", bg: "bg-danger text-white", border: "border-danger", itens: {} },
            'INC': { titulo: "🚨 INCONSISTÊNCIAS", bg: "bg-warning text-dark", border: "border-warning", itens: {} },
            'ALT': { titulo: "🟡 ALERTAS LEVES", bg: "bg-info text-dark", border: "border-info", itens: {} }
        };

        res.alertas.forEach(a => {
            const prefixo = a.codigo.substring(0, 3);
            if (categorias[prefixo]) {
                if (!categorias[prefixo].itens[a.codigo]) {
                    categorias[prefixo].itens[a.codigo] = { titulo: a.titulo, detalhe: a.detalhe, ocorrencias: [] };
                }
                categorias[prefixo].itens[a.codigo].ocorrencias.push(a.resumo);
            }
        });

        // 2. Constrói o HTML
        let htmlAlertas = '<div class="accordion" id="accordionAlertas">';
        let counterId = 0; // Para gerar IDs únicos para o sanfona abrir/fechar

        ['ERR', 'INC', 'ALT'].forEach(prefixo => {
            const cat = categorias[prefixo];
            const codigos = Object.keys(cat.itens);

            if (codigos.length > 0) {
                let totalIncidencias = 0;
                codigos.forEach(c => totalIncidencias += cat.itens[c].ocorrencias.length);

                htmlAlertas += `
                <div class="card mb-4 ${cat.border} shadow-sm border-0">
                    <div class="card-header ${cat.bg} fw-bold d-flex justify-content-between align-items-center rounded-top">
                        <span>${cat.titulo}</span>
                        <span class="badge bg-light text-dark shadow-sm">${totalIncidencias} eventos</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="accordion accordion-flush" id="acc-${prefixo}">
                `;

                codigos.forEach(codigo => {
                    const item = cat.itens[codigo];
                    const qtd = item.ocorrencias.length;
                    counterId++;

                    htmlAlertas += `
                            <div class="accordion-item border-bottom">
                                <h2 class="accordion-header" id="heading-${counterId}">
                                    <button class="accordion-button collapsed fw-semibold text-dark" type="button" data-bs-toggle="collapse" data-bs-target="#col-${counterId}">
                                        <span class="badge bg-secondary me-2 px-2 py-1">${qtd}</span>
                                        ${item.titulo}
                                    </button>
                                </h2>
                                <div id="col-${counterId}" class="accordion-collapse collapse" data-bs-parent="#acc-${prefixo}">
                                    <div class="accordion-body bg-light">
                                        <ul class="mb-3 text-secondary" style="font-size: 0.9rem;">
                                            ${item.ocorrencias.map(oc => `<li class="mb-1">${oc}</li>`).join('')}
                                        </ul>
                                        <div class="alert alert-secondary border-start border-4 border-secondary small mb-0 py-2">
                                            <i class="bi bi-info-circle-fill me-1"></i> <strong>Recomendação:</strong> ${item.detalhe}
                                        </div>
                                    </div>
                                </div>
                            </div>
                    `;
                });

                htmlAlertas += `
                        </div>
                    </div>
                </div>`;
            }
        });
        
        htmlAlertas += '</div>';
        divAlertas.innerHTML = htmlAlertas;

    } else {
        // Se a viagem for perfeita!
        divAlertas.innerHTML = `
            <div class="alert alert-success d-flex align-items-center shadow-sm py-3" role="alert">
                <i class="bi bi-check-circle-fill fs-3 me-3"></i>
                <div>
                    <h5 class="alert-heading mb-1 fw-bold">Jornada Aprovada!</h5>
                    <p class="mb-0 small">Nenhuma inconsistência matemática, temporal ou comportamental detectada no BDT e abastecimentos.</p>
                </div>
            </div>`;
    }

    const btnDownload = document.getElementById('btn-download');
    btnDownload.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + res.excel_b64;
    btnDownload.download = "Relatorio_Auditoria.xlsx";
    
    document.getElementById('box-relatorio').scrollIntoView({ behavior: 'smooth' });
}

window.salvarBDTAoBanco = async function() {
    if (!ultimoPayloadEnviado || !ultimoResultadoAuditoria) return;

    const temErro = ultimoResultadoAuditoria.alertas.some(a => a.codigo.startsWith('ERR') || a.codigo.startsWith('INC'));
    if (temErro) {
        if (!confirm("⚠️ Erros graves foram detectados. Tem certeza que deseja forçar o salvamento no banco de dados para avaliação da diretoria?")) return;
    }

    const payloadFinal = { ...ultimoPayloadEnviado, alertas: ultimoResultadoAuditoria.alertas };
    const btn = document.getElementById('btn-salvar-banco');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...`;

    try {
        const res = await fetch('/api/viagens/salvar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFinal)
        });
        const json = await res.json();
        
        if (res.ok) {
            alert("✅ " + json.mensagem);
            document.querySelector('#bdtTable tbody').innerHTML = '';
            document.querySelector('#combTable tbody').innerHTML = '';
            criarNovaLinhaBDT();
            criarNovaLinhaComb();
            document.getElementById('box-relatorio').style.display = 'none';
        } else {
            alert("❌ Erro ao salvar: " + json.mensagem);
        }
    } catch (e) {
        alert("Erro fatal ao salvar no banco.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill"></i> Salvar no Banco`;
    }

};

// ==========================================
// MÓDULO: MODAIS E MODO DEV
// ==========================================

// Configurações (Margens)
window.abrirModalConfig = function() {
    document.getElementById('config-consumo').value = configuracoesAuditoria.consumo_esperado;
    document.getElementById('config-salto').value = configuracoesAuditoria.margem_salto;
    document.getElementById('config-maps').value = configuracoesAuditoria.tolerancia_maps;
    
    const modal = new bootstrap.Modal(document.getElementById('modalConfig'));
    modal.show();
};

window.salvarConfiguracoes = function() {
    configuracoesAuditoria.consumo_esperado = parseFloat(document.getElementById('config-consumo').value) || 10.0;
    configuracoesAuditoria.margem_salto = parseFloat(document.getElementById('config-salto').value) || 5.0;
    configuracoesAuditoria.tolerancia_maps = parseFloat(document.getElementById('config-maps').value) || 30;
    
    bootstrap.Modal.getInstance(document.getElementById('modalConfig')).hide();
    alert("✅ Margens atualizadas para a próxima auditoria!");
};

// Painel Dev (Mock)
window.abrirModalDev = function() {
    document.getElementById('dev-motorista').innerHTML = document.getElementById('select-motorista').innerHTML;
    document.getElementById('dev-veiculo').innerHTML = document.getElementById('select-veiculo').innerHTML;
    
    const modal = new bootstrap.Modal(document.getElementById('modalDev'));
    modal.show();
};

window.executarMockMensal = async function() {
    const idMot = document.getElementById('dev-motorista').value;
    const idVei = document.getElementById('dev-veiculo').value;
    const diaIn = document.getElementById('dev-data-inicio').value;
    const diaFim = document.getElementById('dev-data-fim').value;

    if (!idMot || !idVei) return alert("Selecione motorista e veículo.");

    const payload = { id_motorista: idMot, id_veiculo: idVei, dia_inicio: diaIn, dia_fim: diaFim };
    const btn = document.getElementById('btn-executar-mock');
    const txtOriginal = btn.innerHTML;
    
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Buscando...`;
    btn.disabled = true;

    try {
        const res = await fetch('/api/dev/mock_periodo', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) 
        });
        const resultado = await res.json();
        
        if (resultado.status !== "sucesso") {
            return alert(resultado.mensagem);
        }

        // Esconde modal, limpa tela anterior
        bootstrap.Modal.getInstance(document.getElementById('modalDev')).hide();
        document.getElementById('box-relatorio').style.display = 'none';
        document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

        // Seta opções principais
        document.getElementById('select-motorista').value = idMot;
        document.getElementById('select-veiculo').value = idVei;
        
        // Limpa tabelas
        document.querySelector('#bdtTable tbody').innerHTML = '';
        document.querySelector('#combTable tbody').innerHTML = '';
        
        let maxParadas = 0;
        resultado.viagens.forEach(linha => {
            if (linha.destino && linha.destino.includes(' ➔ ')) {
                const qtd = linha.destino.split(' ➔ ').length - 1;
                if (qtd > maxParadas) maxParadas = qtd;
            }
        });

        // Refaz cabeçalho de paradas
        document.querySelectorAll('#bdtTable thead th.th-parada').forEach(th => th.remove());
        const theadTr = document.querySelector('#bdtTable thead tr');
        const thDestino = theadTr.querySelector('.th-destino');
        for (let i = 1; i <= maxParadas; i++) {
            const novoTh = document.createElement('th');
            novoTh.className = 'th-parada bg-info text-white';
            novoTh.innerText = `Parada ${i}`;
            theadTr.insertBefore(novoTh, thDestino);
        }

        // Popula Viagens com classes do Bootstrap
        if (resultado.viagens.length > 0) {
            resultado.viagens.forEach(linha => {
                let paradasTexto = [];
                let destinoFinal = linha.destino;
                if (linha.destino && linha.destino.includes(' ➔ ')) {
                    const partes = linha.destino.split(' ➔ ');
                    destinoFinal = partes.pop();
                    paradasTexto = partes;
                }

                let tdsParadas = '';
                for (let i = 0; i < maxParadas; i++) {
                    const valor = paradasTexto[i] || '';
                    tdsParadas += `<td><input type="text" class="form-control form-control-sm parada" placeholder="Parada ${i+1}" value="${valor}"></td>`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="date" class="form-control form-control-sm data-viagem" value="${linha.data_viagem || linha.data_iso}"></td>
                    <td><input type="time" class="form-control form-control-sm hora-in" value="${linha.hora_inicio}"></td>
                    <td><input type="number" step="0.1" class="form-control form-control-sm km-in" value="${linha.km_inicial}"></td>
                    <td><input type="text" class="form-control form-control-sm origem" value="${linha.origem}" oninput="sincronizarCacheMaps(this)"></td>
                    ${tdsParadas}
                    <td class="td-destino"><input type="text" class="form-control form-control-sm destino" value="${destinoFinal}" oninput="sincronizarCacheMaps(this)"></td>
                    <td><input type="time" class="form-control form-control-sm hora-out" value="${linha.hora_fim}"></td>
                    <td><input type="number" step="0.1" class="form-control form-control-sm km-out" value="${linha.km_final}"></td>
                    <td><input type="number" step="0.1" class="form-control form-control-sm km-maps" value="${linha.km_maps_opcional || ''}" oninput="sincronizarCacheMaps(this)"></td>
                    <td class="text-center"><button class="btn btn-outline-danger btn-sm border-0" onclick="deletarLinha(this)"><i class="bi bi-trash3"></i></button></td>
                `;
                document.querySelector('#bdtTable tbody').appendChild(tr);
            });
            document.querySelectorAll('.origem').forEach(input => sincronizarCacheMaps(input));
        } else {
            criarNovaLinhaBDT();
        }

        // Popula Abastecimentos
        if (resultado.abastecimentos && resultado.abastecimentos.length > 0) {
            resultado.abastecimentos.forEach(linha => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="date" class="form-control form-control-sm data-viagem" value="${linha.data_iso}"></td>
                    <td><input type="time" class="form-control form-control-sm hora" value="${linha.hora}"></td>
                    <td><input type="number" step="0.1" class="form-control form-control-sm km-bomba" value="${linha.km_bomba}"></td>
                    <td><input type="number" step="0.1" class="form-control form-control-sm litros" value="${linha.litros}"></td>
                    <td class="text-center"><button class="btn btn-outline-danger btn-sm border-0" onclick="deletarLinha(this)"><i class="bi bi-trash3"></i></button></td>
                `;
                document.querySelector('#combTable tbody').appendChild(tr);
            });
        } else {
            criarNovaLinhaComb();
        }

        // Força a aba BDT a aparecer
        const triggerEl = document.querySelector('#auditoriaTabs button[data-bs-target="#bdt"]');
        bootstrap.Tab.getOrCreateInstance(triggerEl).show();

    } catch (erro) {
        console.error(erro);
        alert("Erro de comunicação ao carregar o Dev Mode.");
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
};

// ==========================================
// IMPORTAÇÃO DE ARQUIVOS (EXCEL E PDF)
// ==========================================

window.importarExcel = async function(event) {
    const file = event.target.files[0]; 
    if (!file) return; 
    
    const formData = new FormData(); 
    formData.append('file', file);

    try {
        const res = await fetch('/api/importar', { method: 'POST', body: formData }); 
        const resultado = await res.json();
        
        if (resultado.status === "sucesso") {
            document.querySelector('#bdtTable tbody').innerHTML = ''; 
            document.querySelector('#combTable tbody').innerHTML = '';
            
            let maxParadas = 0;
            if (resultado.bdt && resultado.bdt.length > 0) { 
                resultado.bdt.forEach(linha => { 
                    if (linha.destino && linha.destino.includes(' ➔ ')) { 
                        const qtd = linha.destino.split(' ➔ ').length - 1; 
                        if (qtd > maxParadas) maxParadas = qtd; 
                    } 
                }); 
            }

            document.querySelectorAll('#bdtTable thead th.th-parada').forEach(th => th.remove());
            const theadTr = document.querySelector('#bdtTable thead tr'); 
            const thDestino = theadTr.querySelector('.th-destino');
            
            for (let i = 1; i <= maxParadas; i++) { 
                const novoTh = document.createElement('th'); 
                novoTh.className = 'th-parada bg-info text-white'; 
                novoTh.innerText = `Parada ${i}`; 
                theadTr.insertBefore(novoTh, thDestino); 
            }

            if(resultado.bdt.length > 0) {
                resultado.bdt.forEach(linha => {
                    let paradasTexto = []; 
                    let destinoFinal = linha.destino;
                    if (linha.destino && linha.destino.includes(' ➔ ')) { 
                        const partes = linha.destino.split(' ➔ '); 
                        destinoFinal = partes.pop(); 
                        paradasTexto = partes; 
                    }
                    
                    let tdsParadas = ''; 
                    for (let i = 0; i < maxParadas; i++) { 
                        const valor = paradasTexto[i] || ''; 
                        tdsParadas += `<td><input type="text" class="form-control form-control-sm parada" placeholder="Parada ${i+1}" value="${valor}"></td>`; 
                    }
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><input type="date" class="form-control form-control-sm data-viagem" value="${linha.dia}"></td> 
                        <td><input type="time" class="form-control form-control-sm hora-in" value="${linha.hora_in}"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm km-in" value="${linha.km_in}"></td>
                        <td><input type="text" class="form-control form-control-sm origem" value="${linha.origem}" oninput="sincronizarCacheMaps(this)"></td> 
                        ${tdsParadas} 
                        <td class="td-destino"><input type="text" class="form-control form-control-sm destino" value="${destinoFinal}" oninput="sincronizarCacheMaps(this)"></td>
                        <td><input type="time" class="form-control form-control-sm hora-out" value="${linha.hora_out}"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm km-out" value="${linha.km_out}"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm km-maps" value="${linha['KM Maps'] || linha.km_maps || ''}" placeholder="Ex: 25.5" oninput="sincronizarCacheMaps(this)"></td> 
                        <td class="text-center"><button class="btn btn-outline-danger btn-sm border-0" onclick="deletarLinha(this)" title="Excluir linha"><i class="bi bi-trash3"></i></button></td>
                    `;
                    document.querySelector('#bdtTable tbody').appendChild(tr);
                });
            } else { 
                criarNovaLinhaBDT(); 
            }

            if(resultado.combustivel && resultado.combustivel.length > 0) {
                resultado.combustivel.forEach(linha => {
                    const tr = document.createElement('tr'); 
                    tr.innerHTML = `
                        <td><input type="date" class="form-control form-control-sm data-viagem" value="${linha.dia}"></td> 
                        <td><input type="time" class="form-control form-control-sm hora" value="${linha.hora || ''}"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm km-bomba" value="${linha.km_bomba}"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm litros" value="${linha.litros}"></td> 
                        <td class="text-center"><button class="btn btn-outline-danger btn-sm border-0" onclick="deletarLinha(this)" title="Excluir linha"><i class="bi bi-trash3"></i></button></td>
                    `;
                    document.querySelector('#combTable tbody').appendChild(tr);
                });
            } else { 
                criarNovaLinhaComb(); 
            }
            
            alert("✅ Planilha importada com sucesso!"); 
            document.getElementById('box-relatorio').style.display = 'none'; 
            document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
            
            // Força a aba do BDT a aparecer (caso ele estivesse na aba combustível)
            const triggerEl = document.querySelector('#auditoriaTabs button[data-bs-target="#bdt"]');
            bootstrap.Tab.getOrCreateInstance(triggerEl).show();

        } else { 
            alert("Erro ao importar: " + resultado.mensagem); 
        }
    } catch (erro) { 
        console.error(erro); 
        alert("Erro de comunicação com o servidor ao importar Excel."); 
    }
    
    // Reseta o input de arquivo para permitir subir o mesmo arquivo duas vezes seguidas
    event.target.value = '';
};

window.importarPDF = async function(event) {
    const file = event.target.files[0]; 
    if (!file) return; 
    
    const formData = new FormData(); 
    formData.append('file', file);
    
    const btnVisual = event.target.nextElementSibling; 
    const textoOriginal = btnVisual.innerHTML; 
    btnVisual.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Extraindo dados...`;
    btnVisual.disabled = true;

    try {
        const resposta = await fetch('/api/importar_pdf_combustivel', { method: 'POST', body: formData }); 
        const resultado = await resposta.json();
        
        if (resultado.status === "sucesso") {
            const tbody = document.querySelector('#combTable tbody'); 
            tbody.innerHTML = '';
            
            if(resultado.combustivel.length > 0) {
                resultado.combustivel.forEach(linha => {
                    const tr = document.createElement('tr'); 
                    tr.innerHTML = `
                        <td><input type="date" class="form-control form-control-sm data-viagem" value="${linha.dia}"></td> 
                        <td><input type="time" class="form-control form-control-sm hora" value="${linha.hora}"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm km-bomba" value="${linha.km_bomba}"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm litros" value="${linha.litros}"></td> 
                        <td class="text-center"><button class="btn btn-outline-danger btn-sm border-0" onclick="deletarLinha(this)" title="Excluir linha"><i class="bi bi-trash3"></i></button></td>
                    `;
                    tbody.appendChild(tr);
                });
                alert(`✅ Sucesso! ${resultado.combustivel.length} abastecimentos extraídos do PDF.`);
            } else { 
                criarNovaLinhaComb(); 
            }
        } else {
            alert("Erro: " + resultado.mensagem);
        }
    } catch (erro) { 
        console.error(erro); 
        alert("Falha de comunicação ao processar o PDF.");
    } finally {
        btnVisual.innerHTML = textoOriginal;
        btnVisual.disabled = false;
        event.target.value = ''; 
    }
};