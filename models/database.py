# arquivo: models/database.py
import sqlite3
import json
from services.drive_sync import enviar_banco_para_o_drive
from datetime import datetime, timedelta

DB_PATH = 'ecos_database.db'

def obter_conexao():
    """Abre uma conexão segura com o banco de dados SQLite local."""
    conexao = sqlite3.connect(DB_PATH, check_same_thread=False)
    conexao.row_factory = sqlite3.Row 
    return conexao

# ==========================================
# LEITURA (READ)
# ==========================================

def listar_motoristas_ativos():
    conexao = obter_conexao()
    cursor = conexao.cursor()
    cursor.execute("SELECT id, nome, matricula FROM dim_motorista WHERE status = 'ATIVO' ORDER BY nome")
    motoristas = cursor.fetchall()
    conexao.close()
    return [{"id": m["id"], "nome": m["nome"], "matricula": m["matricula"]} for m in motoristas]

def listar_veiculos_ativos():
    conexao = obter_conexao()
    cursor = conexao.cursor()
    cursor.execute("SELECT * FROM dim_veiculo WHERE status = 'ATIVO' ORDER BY placa")
    veiculos = cursor.fetchall()
    conexao.close()
    return [{
        "id": v["id"], 
        "placa": v["placa"], 
        "modelo": v["marca_modelo"],
        "ano": v["ano_modelo"],
        "combustivel": v["tipo_combustivel"],
        "especie": v["especie_capacidade"],
        "proprietario": v["proprietario_locadora"]
    } for v in veiculos]

# ==========================================
# ESCRITA E MODIFICAÇÃO (CRUD)
# ==========================================

def salvar_motorista(nome, matricula):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute("INSERT INTO dim_motorista (nome, matricula) VALUES (?, ?)", (nome, matricula))
        conexao.commit()
        enviar_banco_para_o_drive()
        return True, "Motorista cadastrado com sucesso!"
    except sqlite3.IntegrityError:
        return False, "Erro: Essa matrícula já está cadastrada no sistema."
    except Exception as e:
        return False, f"Erro inesperado: {str(e)}"
    finally:
        conexao.close()

def salvar_veiculo(placa, modelo, ano, combustivel, especie, proprietario):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute('''
            INSERT INTO dim_veiculo 
            (placa, marca_modelo, ano_modelo, tipo_combustivel, especie_capacidade, proprietario_locadora) 
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (placa, modelo, ano, combustivel, especie, proprietario))
        conexao.commit()
        enviar_banco_para_o_drive()
        return True, "Veículo cadastrado com sucesso!"
    except sqlite3.IntegrityError:
        return False, "Erro: Essa placa já está cadastrada no sistema."
    except Exception as e:
        return False, f"Erro inesperado: {str(e)}"
    finally:
        conexao.close()

def editar_motorista(id_motorista, nome, matricula):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute("UPDATE dim_motorista SET nome = ?, matricula = ? WHERE id = ?", (nome, matricula, id_motorista))
        conexao.commit()
        enviar_banco_para_o_drive()
        return True, "Motorista atualizado com sucesso!"
    except Exception as e:
        return False, f"Erro ao editar: {str(e)}"
    finally:
        conexao.close()

def excluir_motorista(id_motorista):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute("DELETE FROM dim_motorista WHERE id = ?", (id_motorista,))
        conexao.commit()
        enviar_banco_para_o_drive()
        return True, "Motorista excluído com sucesso!"
    except sqlite3.IntegrityError:
        return False, "Este motorista possui viagens vinculadas e não pode ser excluído."
    finally:
        conexao.close()

def editar_veiculo(id_veiculo, placa, modelo, ano, combustivel, especie, proprietario):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute('''
            UPDATE dim_veiculo 
            SET placa = ?, marca_modelo = ?, ano_modelo = ?, tipo_combustivel = ?, especie_capacidade = ?, proprietario_locadora = ?
            WHERE id = ?
        ''', (placa, modelo, ano, combustivel, especie, proprietario, id_veiculo))
        conexao.commit()
        enviar_banco_para_o_drive()
        return True, "Veículo atualizado com sucesso!"
    except Exception as e:
        return False, f"Erro ao editar: {str(e)}"
    finally:
        conexao.close()

def excluir_veiculo(id_veiculo):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute("DELETE FROM dim_veiculo WHERE id = ?", (id_veiculo,))
        conexao.commit()
        enviar_banco_para_o_drive()
        return True, "Veículo excluído com sucesso!"
    except sqlite3.IntegrityError:
        return False, "Este veículo possui viagens vinculadas e não pode ser excluído."
    finally:
        conexao.close()

# ==========================================
# OPERAÇÕES DE FATO (BDT AUDITADO)
# ==========================================

def salvar_jornada(id_motorista, id_veiculo, viagens, abastecimentos, alertas):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        alertas_str = json.dumps(alertas, ensure_ascii=False) if alertas else "Nenhum alerta"
        
        for v in viagens:
            data_v = v['dia']
            hora_in = v['hora_in']
            
            cursor.execute('''
                SELECT id_motorista, id_veiculo 
                FROM fato_viagem 
                WHERE data_viagem = ? AND hora_inicio = ? 
                  AND (id_motorista = ? OR id_veiculo = ?)
            ''', (data_v, hora_in, id_motorista, id_veiculo))
            
            conflito = cursor.fetchone()
            if conflito:
                conexao.rollback()
                if str(conflito['id_motorista']) == str(id_motorista):
                    return False, f"⚠️ DUPLICATA BLOQUEADA: O motorista já tem uma viagem salva no dia {data_v} às {hora_in}."
                else:
                    return False, f"⚠️ CONFLITO DE FROTA: O veículo já possui viagem salva no dia {data_v} às {hora_in} com outro motorista."
            
            km_in = float(v['km_in'])
            km_out = float(v['km_out'])
            distancia = km_out - km_in
            
            cursor.execute('''
                INSERT INTO fato_viagem 
                (id_motorista, id_veiculo, data_viagem, hora_inicio, hora_fim, origem, destino, km_inicial, km_final, distancia_percorrida, km_maps_opcional, alertas_gerados) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (id_motorista, id_veiculo, data_v, hora_in, v['hora_out'], v['origem'], v['destino'], km_in, km_out, distancia, v.get('km_maps', ''), alertas_str))

        for a in abastecimentos:
            cursor.execute("SELECT id FROM fato_abastecimento WHERE id_veiculo = ? AND data_iso = ? AND hora = ? AND km_bomba = ?", 
                           (id_veiculo, a['dia'], a['hora'], a['km_bomba']))
            
            if not cursor.fetchone():
                cursor.execute('''
                    INSERT INTO fato_abastecimento (id_motorista, id_veiculo, data_iso, hora, km_bomba, litros)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (id_motorista, id_veiculo, a['dia'], a['hora'], a['km_bomba'], a['litros']))

        conexao.commit()
        enviar_banco_para_o_drive()
        return True, "Jornada e Abastecimentos salvos com sucesso!"
    except Exception as e:
        conexao.rollback()
        return False, f"Erro ao salvar: {str(e)}"
    finally:
        conexao.close()

def buscar_dados_completos_periodo(id_motorista, id_veiculo, data_inicio, data_fim):
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute("SELECT * FROM fato_viagem WHERE id_motorista = ? AND id_veiculo = ? AND data_viagem BETWEEN ? AND ? ORDER BY data_viagem, hora_inicio", 
                       (id_motorista, id_veiculo, data_inicio, data_fim))
        viagens = [dict(v) for v in cursor.fetchall()]

        cursor.execute("SELECT * FROM fato_abastecimento WHERE id_motorista = ? AND id_veiculo = ? AND data_iso BETWEEN ? AND ? ORDER BY data_iso, hora", 
                       (id_motorista, id_veiculo, data_inicio, data_fim))
        abastecimentos = [dict(a) for a in cursor.fetchall()]

        return viagens, abastecimentos
    finally:
        conexao.close()

# ==========================================
# AMBIENTE DE DESENVOLVIMENTO (MOCK / HISTÓRICO)
# ==========================================

def buscar_ultima_jornada_dev():
    conexao = obter_conexao()
    cursor = conexao.cursor()
    try:
        cursor.execute("SELECT id_motorista, id_veiculo FROM fato_viagem ORDER BY id DESC LIMIT 1")
        ultimo = cursor.fetchone()
        if not ultimo:
            return None, None, []

        cursor.execute('''
            SELECT * FROM fato_viagem
            WHERE id_motorista = ? AND id_veiculo = ?
            ORDER BY id DESC LIMIT 10
        ''', (ultimo['id_motorista'], ultimo['id_veiculo']))
        
        viagens = cursor.fetchall()
        viagens_lista = [dict(v) for v in viagens]
        viagens_lista.reverse()
        
        return ultimo['id_motorista'], ultimo['id_veiculo'], viagens_lista
    finally:
        conexao.close()

# =========================================================================
# OPERAÇÕES DE BUSINESS INTELLIGENCE (MÓDULO BI COM DIM_DATA)
# =========================================================================

def inicializar_e_popular_dim_data():
    """Cria a tabela dim_data se não existir e popula o histórico de 2025 a 2030."""
    conexao = obter_conexao()
    cursor = conexao.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dim_data (
            id_data TEXT PRIMARY KEY,
            ano INTEGER,
            mes INTEGER,
            nome_mes TEXT,
            dia INTEGER,
            dia_semana INTEGER,
            nome_dia_semana TEXT,
            eh_fim_semana INTEGER,
            trimestre INTEGER
        )
    ''')
    
    # Se a tabela já contiver registros, não há necessidade de popular novamente
    cursor.execute("SELECT COUNT(*) FROM dim_data")
    if cursor.fetchone()[0] > 0:
        conexao.close()
        return
        
    print("📅 Populando dimensão de tempo dim_data (Calendário 2025 a 2030)...")
    
    meses_pt = {1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho",
                7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"}
    
    dias_pt = {0: "Segunda-feira", 1: "Terça-feira", 2: "Quarta-feira", 3: "Quinta-feira",
               4: "Sexta-feira", 5: "Sábado", 6: "Domingo"}
               
    data_inicio = datetime(2025, 1, 1)
    data_fim = datetime(2030, 12, 31)
    delta = timedelta(days=1)
    
    data_atual = data_inicio
    valores = []
    
    while data_atual <= data_fim:
        id_data = data_atual.strftime('%Y-%m-%d')
        ano = data_atual.year
        mes = data_atual.month
        nome_mes = meses_pt[mes]
        dia = data_atual.day
        dia_semana = data_atual.weekday()  # 0 = Segunda-feira, 6 = Domingo
        nome_dia_semana = dias_pt[dia_semana]
        eh_fim_semana = 1 if dia_semana in [5, 6] else 0
        trimestre = (mes - 1) // 3 + 1
        
        valores.append((id_data, ano, mes, nome_mes, dia, dia_semana, nome_dia_semana, eh_fim_semana, trimestre))
        data_atual += delta
        
    cursor.executemany('''
        INSERT INTO dim_data (id_data, ano, mes, nome_mes, dia, dia_semana, nome_dia_semana, eh_fim_semana, trimestre)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', valores)
    
    conexao.commit()
    conexao.close()
    print("✅ Dimensão de tempo dim_data estruturada com sucesso!")


def obter_resumo_bi(id_motorista=None, data_inicio=None, data_fim=None, agrupamento='dia', apenas_fim_semana='todos'):
    """Busca e agrega dados operacionais cruzando a fatos com a dim_data e aplicando filtros temporais."""
    conexao = obter_conexao()
    cursor = conexao.cursor()
    
    filtro_viagem = "WHERE 1=1"
    filtro_abs = "WHERE 1=1"
    params_viagem = []
    params_abs = []
    
    # Filtro de Motorista
    if id_motorista and id_motorista != 'todos':
        filtro_viagem += " AND f.id_motorista = ?"
        filtro_abs += " AND id_motorista = ?"
        params_viagem.append(id_motorista)
        params_abs.append(id_motorista)
        
    # Filtro de Período
    if data_inicio and data_fim:
        filtro_viagem += " AND f.data_viagem BETWEEN ? AND ?"
        filtro_abs += " AND data_iso BETWEEN ? AND ?"
        params_viagem.extend([data_inicio, data_fim])
        params_abs.extend([data_inicio, data_fim])
        
    # Filtro Avançado da dim_data (Finais de Semana vs Dias Úteis)
    if apenas_fim_semana == 'sim':
        filtro_viagem += " AND d.eh_fim_semana = 1"
        filtro_abs += " AND EXISTS (SELECT 1 FROM dim_data dd WHERE dd.id_data = data_iso AND dd.eh_fim_semana = 1)"
    elif apenas_fim_semana == 'nao':
        filtro_viagem += " AND d.eh_fim_semana = 0"
        filtro_abs += " AND EXISTS (SELECT 1 FROM dim_data dd WHERE dd.id_data = data_iso AND dd.eh_fim_semana = 0)"
            
    try:
        # 1. Distância Total utilizando JOIN relacional acelerado com dim_data
        cursor.execute(f"""
            SELECT SUM(f.distancia_percorrida) 
            FROM fato_viagem f
            JOIN dim_data d ON f.data_viagem = d.id_data
            {filtro_viagem}
        """, params_viagem)
        total_km = cursor.fetchone()[0] or 0
        
        # 2. Total de Litros Abastecidos
        cursor.execute(f"SELECT SUM(litros) FROM fato_abastecimento {filtro_abs}", params_abs)
        total_litros = cursor.fetchone()[0] or 0
        
        # 3. Processamento de Alertas utilizando a dimensão de tempo
        cursor.execute(f"""
            SELECT f.alertas_gerados 
            FROM fato_viagem f
            JOIN dim_data d ON f.data_viagem = d.id_data
            {filtro_viagem}
        """, params_viagem)
        todos_alertas_raw = cursor.fetchall()
        
        contagem_alertas = {"ERR": 0, "INC": 0, "ALT": 0}
        for row in todos_alertas_raw:
            try:
                alertas_lista = json.loads(row[0])
                if isinstance(alertas_lista, list):
                    for a in alertas_lista:
                        prefixo = a['codigo'][:3]
                        if prefixo in contagem_alertas:
                            contagem_alertas[prefixo] += 1
            except: 
                continue

        # 4. Gráfico de Linha: Agrupamento pelas colunas calculadas da dim_data
        if agrupamento == 'mes':
            sql_tempo = "d.ano || '-' || printf('%02d', d.mes)"
        else:
            sql_tempo = "f.data_viagem"

        query_grafico = f"""
            SELECT {sql_tempo} as periodo, SUM(f.distancia_percorrida) 
            FROM fato_viagem f
            JOIN dim_data d ON f.data_viagem = d.id_data
            {filtro_viagem}
            GROUP BY periodo
            ORDER BY periodo
        """
        cursor.execute(query_grafico, params_viagem)
        km_por_tempo = [{"periodo": r[0], "km": r[1]} for r in cursor.fetchall()]

        return {
            "total_km": total_km,
            "total_litros": total_litros,
            "alertas": contagem_alertas,
            "km_por_tempo": km_por_tempo
        }
    finally:
        conexao.close()