# arquivo: models/database.py
import sqlite3
import json
from services.drive_sync import enviar_banco_para_o_drive

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