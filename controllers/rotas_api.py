# arquivo: controllers/rotas_api.py
from flask import Blueprint, request, jsonify, send_file
import pandas as pd
import io
import fitz  # PyMuPDF
import re
from datetime import datetime

# Importa todas as funções de banco de dados do nosso Model
from models.database import (
    listar_motoristas_ativos, listar_veiculos_ativos, 
    salvar_motorista, salvar_veiculo,
    editar_motorista, excluir_motorista,
    editar_veiculo, excluir_veiculo,
    salvar_jornada, buscar_dados_completos_periodo,
    buscar_ultima_jornada_dev,
    obter_resumo_bi
)

# Importa a matemática de auditoria do nosso Service
from services.auditoria import rodar_auditoria_completa

# Cria o "Blueprint" (Um mini-app Flask que será plugado no app principal)
bp = Blueprint('api', __name__, url_prefix='/api')

@bp.route('/cadastros', methods=['GET'])
def obter_cadastros():
    return jsonify({
        "motoristas": listar_motoristas_ativos(),
        "veiculos": listar_veiculos_ativos()
    })

# --- CRUD MOTORISTAS ---
@bp.route('/motoristas/salvar', methods=['POST'])
def api_salvar_motorista():
    dados = request.get_json()
    sucesso, mensagem = salvar_motorista(dados.get('nome'), dados.get('matricula'))
    return jsonify({"status": "sucesso" if sucesso else "erro", "mensagem": mensagem}), 200 if sucesso else 400

@bp.route('/motoristas/editar/<int:id_motorista>', methods=['PUT'])
def api_editar_motorista(id_motorista):
    dados = request.get_json()
    sucesso, mensagem = editar_motorista(id_motorista, dados.get('nome'), dados.get('matricula'))
    return jsonify({"status": "sucesso" if sucesso else "erro", "mensagem": mensagem}), 200 if sucesso else 400

@bp.route('/motoristas/excluir/<int:id_motorista>', methods=['DELETE'])
def api_excluir_motorista(id_motorista):
    sucesso, mensagem = excluir_motorista(id_motorista)
    return jsonify({"status": "sucesso" if sucesso else "erro", "mensagem": mensagem}), 200 if sucesso else 400

# --- CRUD VEÍCULOS ---
@bp.route('/veiculos/salvar', methods=['POST'])
def api_salvar_veiculo():
    dados = request.get_json()
    sucesso, mensagem = salvar_veiculo(dados.get('placa'), dados.get('modelo'), dados.get('ano'), dados.get('combustivel'), dados.get('especie'), dados.get('proprietario'))
    return jsonify({"status": "sucesso" if sucesso else "erro", "mensagem": mensagem}), 200 if sucesso else 400

@bp.route('/veiculos/editar/<int:id_veiculo>', methods=['PUT'])
def api_editar_veiculo(id_veiculo):
    dados = request.get_json()
    sucesso, mensagem = editar_veiculo(id_veiculo, dados.get('placa'), dados.get('modelo'), dados.get('ano'), dados.get('combustivel'), dados.get('especie'), dados.get('proprietario'))
    return jsonify({"status": "sucesso" if sucesso else "erro", "mensagem": mensagem}), 200 if sucesso else 400

@bp.route('/veiculos/excluir/<int:id_veiculo>', methods=['DELETE'])
def api_excluir_veiculo(id_veiculo):
    sucesso, mensagem = excluir_veiculo(id_veiculo)
    return jsonify({"status": "sucesso" if sucesso else "erro", "mensagem": mensagem}), 200 if sucesso else 400

# --- AUDITORIA E SALVAMENTO ---
@bp.route('/auditar', methods=['POST'])
def api_auditar_viagens():
    dados = request.get_json()
    resultado = rodar_auditoria_completa(
        dados.get('bdt', []), 
        dados.get('combustivel', []), 
        configs_dinamicas=dados.get('configuracoes', None)
    )
    return jsonify(resultado), 200

@bp.route('/viagens/salvar', methods=['POST'])
def api_salvar_viagens():
    dados = request.get_json()
    if not dados.get('bdt', []):
        return jsonify({"status": "erro", "mensagem": "Nenhuma viagem encontrada para salvar."}), 400
        
    sucesso, mensagem = salvar_jornada(dados.get('id_motorista'), dados.get('id_veiculo'), dados.get('bdt', []), dados.get('combustivel', []), dados.get('alertas', []))
    return jsonify({"status": "sucesso" if sucesso else "erro", "mensagem": mensagem}), 200 if sucesso else 400

# --- IMPORTAÇÕES E MODO DEV ---
@bp.route('/dev/mock_periodo', methods=['POST'])
def api_dev_mock_periodo():
    dados = request.get_json()
    viagens, abastecimentos = buscar_dados_completos_periodo(dados.get('id_motorista'), dados.get('id_veiculo'), dados.get('dia_inicio'), dados.get('dia_fim'))
    if not viagens and not abastecimentos:
        return jsonify({"status": "erro", "mensagem": "Nenhum dado encontrado para este motorista neste veículo."}), 400
    return jsonify({"status": "sucesso", "viagens": viagens, "abastecimentos": abastecimentos}), 200

@bp.route('/importar_pdf_combustivel', methods=['POST'])
def api_importar_pdf_combustivel():
    if 'file' not in request.files:
        return jsonify({"status": "erro", "mensagem": "Nenhum arquivo enviado"}), 400
    try:
        doc = fitz.open(stream=request.files['file'].read(), filetype="pdf")
        texto = "".join([page.get_text("text") for page in doc])
        
        matches_data = re.findall(r'\b\d{10}\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}):\d{2}\b', texto)
        dados_bomba = re.findall(r'\b(\d{5,7})\s+(\d+[\., :]\d{2})\s+\d+[\., :]\d{2}\b', texto)
        
        if len(matches_data) > 0 and len(matches_data) == len(dados_bomba):
            comb_list = []
            for (data_str, hora_str), (km, litros_raw) in zip(matches_data, dados_bomba):
                dia, mes, ano = data_str.split('/')
                comb_list.append({
                    "dia": f"{ano}-{mes}-{dia}",
                    "hora": hora_str,
                    "km_bomba": km,
                    "litros": litros_raw.replace(',', '.').replace(' ', '.').replace(':', '.')
                })
            return jsonify({"status": "sucesso", "combustivel": comb_list})
        return jsonify({"status": "erro", "mensagem": "Falha no pareamento dos dados do PDF."}), 400
    except Exception as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 500
    
# --- ROTAS DE IMPORTAÇÃO (ARQUIVOS) ---
@bp.route('/importar', methods=['POST'])
def api_importar():
    if 'file' not in request.files:
        return jsonify({"status": "erro", "mensagem": "Nenhum arquivo enviado"}), 400
    
    file = request.files['file']
    try:
        file_bytes = file.read()
        xls = pd.ExcelFile(io.BytesIO(file_bytes))
        
        df_bdt = pd.read_excel(xls, sheet_name='BDT Validado')
        df_bdt = df_bdt.dropna(subset=['Dia'])
        
        df_comb = pd.DataFrame()
        if 'Abastecimentos' in xls.sheet_names:
            df_comb = pd.read_excel(xls, sheet_name='Abastecimentos')
            col_dia = 'Dia' if 'Dia' in df_comb.columns else 'dia'
            if col_dia in df_comb.columns:
                df_comb = df_comb.dropna(subset=[col_dia])

        def safe_str(val):
            if pd.isna(val): return ""
            if isinstance(val, float) and val.is_integer(): return str(int(val))
            return str(val).strip()

        def safe_date(val):
            if pd.isna(val): return ""
            if isinstance(val, pd.Timestamp) or hasattr(val, 'strftime'):
                return val.strftime('%Y-%m-%d')
            try:
                dia_num = int(float(val))
                hoje = datetime.today()
                return f"{hoje.year}-{hoje.month:02d}-{dia_num:02d}"
            except:
                return str(val).strip()

        bdt_list = []
        for _, row in df_bdt.iterrows():
            bdt_list.append({
                "dia": safe_date(row.get("Dia")),
                "hora_in": safe_str(row.get("Hora In", "")),
                "hora_out": safe_str(row.get("Hora Fim", "")),
                "origem": safe_str(row["Origem"]),
                "destino": safe_str(row["Destino"]),
                "km_in": safe_str(row["KM Inicial"]),
                "km_out": safe_str(row["KM Final"]),
                "km_maps": safe_str(row.get("KM Maps", ""))
            })
        
        comb_list = []
        if not df_comb.empty:
            for _, row in df_comb.iterrows():
                col_dia = row.get("Dia") or row.get("dia")
                col_hora = row.get("Hora") or row.get("hora") or ""
                col_km = row.get("KM Marcado na Bomba") or row.get("km_bomba") or row.get("KM_Abastecimento")
                col_litros = row.get("Litros Abastecidos") or row.get("litros")

                comb_list.append({
                    "dia": safe_date(col_dia),
                    "hora": safe_str(col_hora),
                    "km_bomba": safe_str(col_km),
                    "litros": safe_str(col_litros)
                })

        return jsonify({"status": "sucesso", "bdt": bdt_list, "combustivel": comb_list})
    except Exception as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 500

# --- ROTAS DE BI PARA DASHBOARD ---
@bp.route('/relatorios/bi', methods=['POST'])
def api_relatorios_bi():
    dados = request.get_json()
    resumo = obter_resumo_bi(
        id_motorista=dados.get('id_motorista'),
        data_inicio=dados.get('data_inicio'),
        data_fim=dados.get('data_fim'),
        agrupamento=dados.get('agrupamento', 'dia'),
        apenas_fim_semana=dados.get('apenas_fim_semana', 'todos') # <--- PASSA O FILTRO DE FIM DE SEMANA
    )
    return jsonify(resumo), 200