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
// CONTROLE DE TABELAS E SUGESTÕES
// ==========================================

function criarNovaLinhaBDT(sugestaoDia = '', sugestaoHoraIn = '', sugestaoOrigem = '', sugestaoKmIn = '') {
    const tbody = document.querySelector('#bdtTable tbody');
    let numParadas = document.querySelectorAll('#bdtTable thead th.th-parada').length;
    let tdsParadas = '';
    
    for(let i = 1; i <= numParadas; i++) { 
        tdsParadas += `<td><input type="text" class="form-control form-control-sm parada" placeholder="Parada ${i}" oninput="sincronizarCacheMaps(this)"></td>`;
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="form-control form-control-sm data-viagem" placeholder="${sugestaoDia || 'DD/MM/AAAA'}" data-sugestao="${sugestaoDia}" maxlength="10" oninput="mascaraData(this)" onblur="completarAno(this)"></td>
        <td><input type="text" class="form-control form-control-sm hora-in" placeholder="${sugestaoHoraIn || 'HH:MM'}" data-sugestao="${sugestaoHoraIn}" maxlength="5" oninput="mascaraHora(this)"></td>
        <td><input type="number" step="0.1" class="form-control form-control-sm km-in" placeholder="${sugestaoKmIn}" data-sugestao="${sugestaoKmIn}"></td>
        
        <td><input type="text" class="form-control form-control-sm origem" placeholder="${sugestaoOrigem}" data-sugestao="${sugestaoOrigem}" oninput="sincronizarCacheMaps(this); atualizarSugestaoDestino(this.closest('tr'))"></td>
        
        ${tdsParadas}
        <td class="td-destino"><input type="text" class="form-control form-control-sm destino" placeholder="Destino" oninput="sincronizarCacheMaps(this)"></td>
        <td><input type="text" class="form-control form-control-sm hora-out" placeholder="HH:MM" maxlength="5" oninput="mascaraHora(this)"></td>
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
        <td><input type="text" class="form-control form-control-sm data-viagem" placeholder="DD/MM/AAAA" maxlength="10" oninput="mascaraData(this)" onblur="completarAno(this)"></td>
        <td><input type="text" class="form-control form-control-sm hora" placeholder="HH:MM" maxlength="5" oninput="mascaraHora(this)"></td>
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
// INTELIGÊNCIA DA TABELA E TECLADO
// ==========================================

// NOVIDADE: A inteligência que "adivinha" o destino do motorista
window.atualizarSugestaoDestino = function(trAtual) {
    const inputOrigem = trAtual.querySelector('.origem');
    const inputDestino = trAtual.querySelector('.destino');
    if (!inputOrigem || !inputDestino) return;

    const origemAtual = inputOrigem.value.trim().toUpperCase();
    if (origemAtual === "") return;

    const linhas = Array.from(document.querySelectorAll('#bdtTable tbody tr'));
    const indexAtual = linhas.indexOf(trAtual);
    if (indexAtual <= 0) return;

    const contagemDestinos = {};
    let maxOcorrencias = 0;
    let destinoMaisComum = "";

    for (let i = 0; i < indexAtual; i++) {
        const origemPassada = linhas[i].querySelector('.origem').value.trim().toUpperCase();
        const destinoPassado = linhas[i].querySelector('.destino').value.trim();
        if (origemPassada === origemAtual && destinoPassado !== "") {
            const chave = destinoPassado.toUpperCase();
            contagemDestinos[chave] = (contagemDestinos[chave] || {nome: destinoPassado, cont: 0});
            contagemDestinos[chave].cont += 1;
            if (contagemDestinos[chave].cont > maxOcorrencias) {
                maxOcorrencias = contagemDestinos[chave].cont;
                destinoMaisComum = contagemDestinos[chave].nome;
            }
        }
    }

    if (destinoMaisComum !== "") {
        inputDestino.placeholder = destinoMaisComum;
        inputDestino.dataset.sugestao = destinoMaisComum;
    } else {
        inputDestino.placeholder = "Destino";
        inputDestino.dataset.sugestao = "";
    }
};

// INTELIGÊNCIA: Sincroniza KM Maps pelo valor MAIS POPULAR da rota, respeitando paradas e vazios
window.sincronizarCacheMaps = function(el) {
    const tr = el.closest('tr');
    
    // 1. Pega Origem e Destino
    const o = (tr.querySelector('.origem')?.value || '').trim().toUpperCase();
    const d = (tr.querySelector('.destino')?.value || '').trim().toUpperCase();
    if (!o || !d) return; 

    // 2. Pega todas as Paradas preenchidas na linha para formar a rota exata
    const paradas = Array.from(tr.querySelectorAll('.parada'))
        .map(p => p.value.trim().toUpperCase())
        .filter(v => v !== '');
        
    // 3. Constrói a "Chave Única" da rota atual
    let chaveAtual = o;
    if (paradas.length > 0) chaveAtual += " -> " + paradas.join(" -> ");
    chaveAtual += " -> " + d;

    const inputMaps = tr.querySelector('.km-maps');

    // MÁGICA: Função interna que faz uma "votação" para descobrir qual o KM mais comum dessa rota na tela
    const obterKmMaisPopular = (chaveBuscada) => {
        const contagem = {};
        let maxVotos = 0;
        let kmVencedor = "";

        document.querySelectorAll('#bdtTable tbody tr').forEach(row => {
            const rowO = (row.querySelector('.origem')?.value || '').trim().toUpperCase();
            const rowD = (row.querySelector('.destino')?.value || '').trim().toUpperCase();
            if (!rowO || !rowD) return;

            const rowParadas = Array.from(row.querySelectorAll('.parada'))
                .map(p => p.value.trim().toUpperCase())
                .filter(v => v !== '');
                
            let rowChave = rowO;
            if (rowParadas.length > 0) rowChave += " -> " + rowParadas.join(" -> ");
            rowChave += " -> " + rowD;

            // Se for a mesma rota exata, computa o voto do KM Maps preenchido
            if (rowChave === chaveBuscada) {
                const rowMapsVal = (row.querySelector('.km-maps')?.value || '').trim();
                if (rowMapsVal !== '') {
                    contagem[rowMapsVal] = (contagem[rowMapsVal] || 0) + 1;
                    
                    if (contagem[rowMapsVal] > maxVotos) {
                        maxVotos = contagem[rowMapsVal];
                        kmVencedor = rowMapsVal;
                    }
                }
            }
        });
        return kmVencedor;
    };

    // CENÁRIO A: Usuário está alterando o KM Maps manualmente
    if (el.classList.contains('km-maps')) {
        const kmPopular = obterKmMaisPopular(chaveAtual);
        
        // Se temos um vencedor claro, procuramos quem precisa de ajuda (caixas vazias)
        if (kmPopular !== "") {
            document.querySelectorAll('#bdtTable tbody tr').forEach(row => {
                const rowO = (row.querySelector('.origem')?.value || '').trim().toUpperCase();
                const rowD = (row.querySelector('.destino')?.value || '').trim().toUpperCase();
                if (!rowO || !rowD) return;

                const rowParadas = Array.from(row.querySelectorAll('.parada'))
                    .map(p => p.value.trim().toUpperCase())
                    .filter(v => v !== '');
                    
                let rowChave = rowO;
                if (rowParadas.length > 0) rowChave += " -> " + rowParadas.join(" -> ");
                rowChave += " -> " + rowD;

                const rowMaps = row.querySelector('.km-maps');
                
                // REGRA DE OURO: Rota idêntica E caixa totalmente vazia. (Nunca sobrepõe)
                if (rowChave === chaveAtual && rowMaps && rowMaps.value === '') {
                    rowMaps.value = kmPopular;
                }
            });
        }
    } 
    // CENÁRIO B: Usuário acabou de preencher Destino ou Parada
    else {
        // Se o KM Maps atual estiver vazio, puxamos o valor mais popular da tabela
        if (inputMaps && inputMaps.value === '') {
            const kmPopular = obterKmMaisPopular(chaveAtual);
            if (kmPopular !== "") {
                inputMaps.value = kmPopular;
            }
        }
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
            
            // NOVIDADE: Auto-preenche com a sugestão fantasma se o usuário apertar Enter no campo vazio
            if (input.value === '' && input.dataset.sugestao) {
                input.value = input.dataset.sugestao;
                if(input.classList.contains('destino')) sincronizarCacheMaps(input);
            }

            const tr = input.closest('tr');
            const inputs = Array.from(tr.querySelectorAll('input'));
            const idx = inputs.indexOf(input);
            
            if (idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            } else {
                if (!tr.nextElementSibling) {
                    if (tr.closest('table').id === 'bdtTable') {
                        // NOVIDADE: Puxa os dados da linha anterior para criar as sugestões da próxima
                        const diaAtual = tr.querySelector('.data-viagem').value;
                        const horaInAtual = tr.querySelector('.hora-out').value; // A hora de saída vira a de entrada
                        const destinoAtual = tr.querySelector('.destino').value; // O destino vira a origem
                        const kmFinalAtual = tr.querySelector('.km-out').value; // O KM final vira o KM inicial
                        
                        criarNovaLinhaBDT(diaAtual, horaInAtual, destinoAtual, kmFinalAtual);
                    }
                    else {
                        criarNovaLinhaComb();
                    }
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
                dia: parseDiaParaAPI(tr.querySelector('.data-viagem').value),
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
            payload.combustivel.push({ dia: parseDiaParaAPI(inputs[0].value), hora: inputs[1].value, km_bomba: inputs[2].value, litros: inputs[3].value });
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
                    <td><input type="text" class="form-control form-control-sm data-viagem" value="${formatarDataImportacao(linha.data_viagem || linha.data_iso)}" maxlength="10" oninput="mascaraData(this)" onblur="completarAno(this)"></td>
                    <td><input type="text" class="form-control form-control-sm hora-in" value="${formatarHoraImportacao(linha.hora_inicio)}" maxlength="5" oninput="mascaraHora(this)"></td>
                    <td><input type="number" step="0.1" class="form-control form-control-sm km-in" value="${linha.km_inicial}"></td>
                    <td><input type="text" class="form-control form-control-sm origem" value="${linha.origem}" oninput="sincronizarCacheMaps(this)"></td>
                    ${tdsParadas}
                    <td class="td-destino"><input type="text" class="form-control form-control-sm destino" value="${destinoFinal}" oninput="sincronizarCacheMaps(this)"></td>
                    <td><input type="text" class="form-control form-control-sm hora-out" value="${formatarHoraImportacao(linha.hora_fim)}" maxlength="5" oninput="mascaraHora(this)"></td>
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
                    <td><input type="text" class="form-control form-control-sm data-viagem" value="${formatarDataImportacao(linha.data_iso)}" maxlength="10" oninput="mascaraData(this)" onblur="completarAno(this)"></td>
                    <td><input type="text" class="form-control form-control-sm hora" value="${formatarHoraImportacao(linha.hora)}" maxlength="5" oninput="mascaraHora(this)"></td>
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
                        <td><input type="text" class="form-control form-control-sm data-viagem" value="${formatarDataImportacao(linha.dia)}" maxlength="10" oninput="mascaraData(this)" onblur="completarAno(this)"></td> 
                        <td><input type="text" class="form-control form-control-sm hora-in" value="${formatarHoraImportacao(linha.hora_in)}" maxlength="5" oninput="mascaraHora(this)"></td> 
                        <td><input type="number" step="0.1" class="form-control form-control-sm km-in" value="${linha.km_in}"></td>
                        <td><input type="text" class="form-control form-control-sm origem" value="${linha.origem}" oninput="sincronizarCacheMaps(this)"></td> 
                        ${tdsParadas} 
                        <td class="td-destino"><input type="text" class="form-control form-control-sm destino" value="${destinoFinal}" oninput="sincronizarCacheMaps(this)"></td>
                        <td><input type="text" class="form-control form-control-sm hora-out" value="${formatarHoraImportacao(linha.hora_out)}" maxlength="5" oninput="mascaraHora(this)"></td> 
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
                        <td><input type="text" class="form-control form-control-sm data-viagem" value="${formatarDataImportacao(linha.dia)}" maxlength="10" oninput="mascaraData(this)" onblur="completarAno(this)"></td> 
                        <td><input type="text" class="form-control form-control-sm hora" value="${formatarHoraImportacao(linha.hora || '')}" maxlength="5" oninput="mascaraHora(this)"></td> 
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

window.resetarBanco = async function() {
    // Trava de segurança 1
    if (!confirm("🚨 ATENÇÃO! Isso vai apagar TODAS as viagens e abastecimentos do banco de dados (os cadastros de motoristas e veículos serão mantidos). Deseja continuar?")) return;
    
    // Trava de segurança 2
    if (!confirm("Tem certeza absoluta? Essa ação apagará a nuvem também e NÃO tem volta.")) return;

    try {
        const res = await fetch('/api/dev/reset', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completo: false }) // Mude para true se quiser que apague motoristas também
        });
        const resultado = await res.json();
        
        if (resultado.status === "sucesso") {
            alert("✅ " + resultado.mensagem);
            location.reload(); // Dá um F5 na página para limpar tudo da tela
        } else {
            alert("❌ Erro: " + resultado.mensagem);
        }
    } catch (e) {
        console.error(e);
        alert("Erro fatal de comunicação ao tentar resetar o banco.");
    }
};


// ==========================================
// MÁSCARAS DE DATA E HORA
// ==========================================
window.mascaraData = function(el) {
    let v = el.value.replace(/\D/g, ''); 
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    if (v.length > 5) v = v.substring(0, 5) + '/' + v.substring(5, 9);
    el.value = v;
};

window.mascaraHora = function(el) {
    let v = el.value.replace(/\D/g, ''); 
    if (v.length > 2) v = v.substring(0, 2) + ':' + v.substring(2, 4);
    el.value = v;
};

// NOVIDADE: Completa o ano visualmente quando sai do campo
window.completarAno = function(el) {
    let partes = el.value.split('/');
    if (partes.length === 3 && partes[2].length === 2) {
        partes[2] = '20' + partes[2]; // Transforma 26 em 2026
        el.value = partes.join('/');
    }
};

// ATUALIZADO: Protege a API caso a data vá com 2 dígitos
window.parseDiaParaAPI = function(d) {
    if (!d) return '';
    if (d.includes('/')) {
        let partes = d.split('/');
        if (partes.length === 3 && partes[2].length === 2) {
            partes[2] = '20' + partes[2]; 
        }
        return partes.reverse().join('-');
    }
    return d;
};


// INTELIGÊNCIA: Sugestão de Destino baseada no preenchimento atual (Curto Prazo)
window.atualizarSugestaoDestino = function(trAtual) {
    const inputOrigem = trAtual.querySelector('.origem');
    const inputDestino = trAtual.querySelector('.destino');
    if (!inputOrigem || !inputDestino) return;

    const origemAtual = inputOrigem.value.trim().toUpperCase();
    if (origemAtual === "") {
        inputDestino.placeholder = "Destino";
        inputDestino.dataset.sugestao = "";
        return;
    }

    // Pega todas as linhas e vê em qual estamos
    const linhas = Array.from(document.querySelectorAll('#bdtTable tbody tr'));
    const indexAtual = linhas.indexOf(trAtual);
    if (indexAtual <= 0) return; // Se for a primeira linha, não tem o que olhar

    let maxOcorrencias = 0;
    let destinoMaisComum = "";
    const contagemDestinos = {};

    // Procura apenas nas linhas ACIMA da atual
    for (let i = 0; i < indexAtual; i++) {
        const origemPassada = linhas[i].querySelector('.origem').value.trim().toUpperCase();
        const destinoPassado = linhas[i].querySelector('.destino').value.trim();
        
        if (origemPassada === origemAtual && destinoPassado !== "") {
            const chave = destinoPassado.toUpperCase();
            contagemDestinos[chave] = (contagemDestinos[chave] || {nome: destinoPassado, cont: 0});
            contagemDestinos[chave].cont += 1;
            
            if (contagemDestinos[chave].cont > maxOcorrencias) {
                maxOcorrencias = contagemDestinos[chave].cont;
                destinoMaisComum = contagemDestinos[chave].nome;
            }
        }
    }

    // Aplica a sugestão dinamicamente como "Fantasma" e guarda no dataset
    if (destinoMaisComum !== "") {
        inputDestino.placeholder = destinoMaisComum;
        inputDestino.dataset.sugestao = destinoMaisComum;
    } else {
        inputDestino.placeholder = "Destino";
        inputDestino.dataset.sugestao = "";
    }
};

// ==========================================
// TRADUTORES DE IMPORTAÇÃO (EXCEL / PDF) BLINDADOS
// ==========================================
window.formatarDataImportacao = function(dataBruta) {
    console.log("🔍 Tradutor Data recebendo:", dataBruta, "| Tipo:", typeof dataBruta);
    
    // Se vier vazio, nulo ou undefined, devolve vazio sem dar erro
    if (dataBruta === null || dataBruta === undefined || dataBruta === "") return "";

    try {
        // 1. O SEGREDO DO PANDAS: Se for um Número (Timestamp em milissegundos)
        if (typeof dataBruta === 'number') {
            const d = new Date(dataBruta);
            // Usamos UTC para impedir que o fuso horário atrase a data em 1 dia
            const dia = String(d.getUTCDate()).padStart(2, '0');
            const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
            const ano = d.getUTCFullYear();
            return `${dia}/${mes}/${ano}`;
        }

        // 2. Se for um Texto (String)
        if (typeof dataBruta === 'string') {
            const strLimpa = dataBruta.trim();
            
            // Já tá no formato BR (DD/MM/AAAA)?
            if (strLimpa.includes('/')) return strLimpa;
            
            // Padrão Banco/ISO (AAAA-MM-DD ou AAAA-MM-DDTHH:MM)
            if (strLimpa.includes('-')) {
                const dataApenas = strLimpa.split('T')[0]; 
                const partes = dataApenas.split('-'); 
                if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
            }

            // String gringa de data (Wed, 14 May 2026...)
            const dText = new Date(strLimpa);
            if (!isNaN(dText)) {
                const dia = String(dText.getDate()).padStart(2, '0');
                const mes = String(dText.getMonth() + 1).padStart(2, '0');
                const ano = dText.getFullYear();
                return `${dia}/${mes}/${ano}`;
            }
        }

        // 3. Fallback: Se não entendeu, devolve como string para o usuário consertar
        return String(dataBruta);
        
    } catch (e) {
        console.error("❌ Erro interno ao formatar data:", e, dataBruta);
        return ""; // Se tudo explodir, retorna vazio em vez de travar a tela
    }
};

window.formatarHoraImportacao = function(horaBruta) {
    console.log("⏱️ Tradutor Hora recebendo:", horaBruta, "| Tipo:", typeof horaBruta);
    
    if (horaBruta === null || horaBruta === undefined || horaBruta === "") return "";

    try {
        // 1. Se for Texto ("14:30" ou "14:30:00")
        if (typeof horaBruta === 'string') {
            let h = horaBruta.trim();
            if (h.includes(':')) return h.substring(0, 5); // Corta os segundos, deixa HH:MM
            return h;
        }
        
        // 2. Se o Python mandar um Timestamp numérico para a hora
        if (typeof horaBruta === 'number') {
            const d = new Date(horaBruta);
            const hr = String(d.getUTCHours()).padStart(2, '0');
            const mn = String(d.getUTCMinutes()).padStart(2, '0');
            return `${hr}:${mn}`;
        }

        return String(horaBruta);
    } catch (e) {
        console.error("❌ Erro interno ao formatar hora:", e, horaBruta);
        return "";
    }
};