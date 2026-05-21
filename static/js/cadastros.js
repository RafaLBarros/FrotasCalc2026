// ==========================================
// ESTADO GLOBAL
// ==========================================
let listaMotoristasGlobal = [];
let listaVeiculosGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarCadastros();
});

// ==========================================
// LEITURA (READ)
// ==========================================
async function carregarCadastros() {
    try {
        const res = await fetch('/api/cadastros');
        const dados = await res.json();
        
        listaMotoristasGlobal = dados.motoristas;
        listaVeiculosGlobal = dados.veiculos;

        atualizarTabelaMotoristas();
        atualizarTabelaVeiculos();
    } catch (e) {
        console.error("Erro ao carregar cadastros:", e);
    }
}

// ==========================================
// MÓDULO: MOTORISTAS
// ==========================================
function atualizarTabelaMotoristas() {
    const tbody = document.querySelector('#tabela-motoristas tbody');
    tbody.innerHTML = '';
    
    if(listaMotoristasGlobal.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">Nenhum motorista cadastrado.</td></tr>';
        return;
    }

    listaMotoristasGlobal.forEach(m => {
        tbody.innerHTML += `
            <tr>
                <td class="fw-semibold">${m.nome}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-warning border-0" onclick="prepararEdicaoMotorista(${m.id})" title="Editar"><i class="bi bi-pencil-square"></i></button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="excluirMotorista(${m.id})" title="Excluir"><i class="bi bi-trash3"></i></button>
                </td>
            </tr>
        `;
    });
}

async function salvarMotorista() {
    const id = document.getElementById('cad-mot-id').value;
    const payload = {
        nome: document.getElementById('cad-mot-nome').value
    };
    
    if(!payload.nome) return alert("Preencha o Nome do Motorista!");
    
    const url = id ? `/api/motoristas/editar/${id}` : '/api/motoristas/salvar';
    const method = id ? 'PUT' : 'POST';

    const btn = document.getElementById('btn-salvar-mot');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Salvando...`;
    btn.disabled = true;

    try {
        const resposta = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const resultado = await resposta.json();

        if(resposta.ok) {
            cancelarEdicaoMotorista();
            carregarCadastros(); 
        } else {
            alert(resultado.mensagem);
        }
    } catch (e) { 
        console.error(e); 
        alert("Erro fatal ao salvar motorista.");
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
}

function prepararEdicaoMotorista(id) {
    const mot = listaMotoristasGlobal.find(m => m.id === id);
    if(!mot) return;
    
    document.getElementById('cad-mot-id').value = mot.id;
    document.getElementById('cad-mot-nome').value = mot.nome;
    
    document.getElementById('titulo-form-mot').innerHTML = "<i class='bi bi-pencil-square me-1'></i> Editar Motorista";
    document.getElementById('btn-salvar-mot').innerHTML = "<i class='bi bi-arrow-repeat me-1'></i> Atualizar Motorista";
    document.getElementById('btn-salvar-mot').classList.replace('btn-primary', 'btn-warning');
    document.getElementById('btn-cancelar-mot').classList.remove('d-none');
}

function cancelarEdicaoMotorista() {
    document.getElementById('cad-mot-id').value = '';
    document.getElementById('cad-mot-nome').value = '';
    
    document.getElementById('titulo-form-mot').innerHTML = "<i class='bi bi-plus-circle me-1'></i> Adicionar Motorista";
    document.getElementById('btn-salvar-mot').innerHTML = "<i class='bi bi-floppy-fill me-1'></i> Cadastrar Motorista";
    document.getElementById('btn-salvar-mot').classList.replace('btn-warning', 'btn-primary');
    document.getElementById('btn-cancelar-mot').classList.add('d-none');
}

async function excluirMotorista(id) {
    if(!confirm("Tem certeza que deseja excluir este motorista?")) return;
    try {
        const resposta = await fetch(`/api/motoristas/excluir/${id}`, { method: 'DELETE' });
        const resultado = await resposta.json();
        
        if(resposta.ok) {
            carregarCadastros();
        } else {
            alert(resultado.mensagem);
        }
    } catch (e) { 
        console.error(e); 
    }
}

// ==========================================
// MÓDULO: VEÍCULOS
// ==========================================
function atualizarTabelaVeiculos() {
    const tbody = document.querySelector('#tabela-veiculos tbody');
    tbody.innerHTML = '';
    
    if(listaVeiculosGlobal.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4">Nenhum veículo cadastrado.</td></tr>';
        return;
    }

    listaVeiculosGlobal.forEach(v => {
        tbody.innerHTML += `
            <tr>
                <td><span class="badge bg-dark px-2 py-1 fs-6">${v.placa}</span></td>
                <td class="fw-semibold text-secondary">${v.modelo}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-warning border-0" onclick='prepararEdicaoVeiculo(${JSON.stringify(v)})' title="Editar"><i class="bi bi-pencil-square"></i></button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="excluirVeiculo(${v.id})" title="Excluir"><i class="bi bi-trash3"></i></button>
                </td>
            </tr>
        `;
    });
}

async function salvarVeiculo() {
    const id = document.getElementById('cad-vei-id').value;
    const payload = {
        placa: document.getElementById('cad-vei-placa').value.toUpperCase(),
        modelo: document.getElementById('cad-vei-modelo').value,
        ano: document.getElementById('cad-vei-ano').value,
        combustivel: document.getElementById('cad-vei-comb').value,
        especie: document.getElementById('cad-vei-especie').value,
        proprietario: document.getElementById('cad-vei-prop').value
    };
    
    if(!payload.placa || !payload.modelo) return alert("Placa e Modelo são obrigatórios!");
    
    const url = id ? `/api/veiculos/editar/${id}` : '/api/veiculos/salvar';
    const method = id ? 'PUT' : 'POST';

    const btn = document.getElementById('btn-salvar-vei');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Salvando...`;
    btn.disabled = true;

    try {
        const resposta = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const resultado = await resposta.json();

        if(resposta.ok) {
            cancelarEdicaoVeiculo();
            carregarCadastros();
        } else {
            alert(resultado.mensagem);
        }
    } catch (e) { 
        console.error(e); 
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
}

function prepararEdicaoVeiculo(v) {
    document.getElementById('cad-vei-id').value = v.id;
    document.getElementById('cad-vei-placa').value = v.placa;
    document.getElementById('cad-vei-modelo').value = v.modelo;
    document.getElementById('cad-vei-ano').value = v.ano || '';
    document.getElementById('cad-vei-comb').value = v.combustivel || 'FLEX';
    document.getElementById('cad-vei-especie').value = v.especie || '';
    document.getElementById('cad-vei-prop').value = v.proprietario || '';
    
    document.getElementById('titulo-form-vei').innerHTML = "<i class='bi bi-pencil-square me-1'></i> Editar Veículo";
    document.getElementById('btn-salvar-vei').innerHTML = "<i class='bi bi-arrow-repeat me-1'></i> Atualizar Veículo";
    document.getElementById('btn-salvar-vei').classList.replace('btn-primary', 'btn-warning');
    document.getElementById('btn-cancelar-vei').classList.remove('d-none');
}

function cancelarEdicaoVeiculo() {
    document.getElementById('cad-vei-id').value = '';
    document.getElementById('cad-vei-placa').value = '';
    document.getElementById('cad-vei-modelo').value = '';
    document.getElementById('cad-vei-ano').value = '';
    document.getElementById('cad-vei-comb').value = 'FLEX';
    document.getElementById('cad-vei-especie').value = '';
    document.getElementById('cad-vei-prop').value = '';
    
    document.getElementById('titulo-form-vei').innerHTML = "<i class='bi bi-plus-circle me-1'></i> Adicionar Veículo";
    document.getElementById('btn-salvar-vei').innerHTML = "<i class='bi bi-floppy-fill me-1'></i> Cadastrar Veículo";
    document.getElementById('btn-salvar-vei').classList.replace('btn-warning', 'btn-primary');
    document.getElementById('btn-cancelar-vei').classList.add('d-none');
}

async function excluirVeiculo(id) {
    if(!confirm("Tem certeza que deseja excluir este veículo?")) return;
    try {
        const resposta = await fetch(`/api/veiculos/excluir/${id}`, { method: 'DELETE' });
        const resultado = await resposta.json();
        
        if(resposta.ok) {
            carregarCadastros();
        } else {
            alert(resultado.mensagem);
        }
    } catch (e) { 
        console.error(e); 
    }
}