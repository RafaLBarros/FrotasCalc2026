import os
import json
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

# ==========================================
# CACHE EM MEMÓRIA (O SEGREDO DA VELOCIDADE)
# ==========================================
_DRIVE_SERVICE = None

def obter_servico_drive():
    global _DRIVE_SERVICE
    # Se já autenticou nesta sessão do servidor, usa a memória!
    if _DRIVE_SERVICE:
        return _DRIVE_SERVICE
        
    creds_json_str = os.environ.get('GOOGLE_CREDENTIALS_JSON')
    if not creds_json_str:
        return None
        
    try:
        creds_data = json.loads(creds_json_str)
        scopes = ['https://www.googleapis.com/auth/drive']
        creds = service_account.Credentials.from_service_account_info(creds_data, scopes=scopes)
        
        # O parâmetro cache_discovery=False remove a lentidão brutal da API do Google
        _DRIVE_SERVICE = build('drive', 'v3', credentials=creds, cache_discovery=False)
        return _DRIVE_SERVICE
    except Exception as e:
        print(f"❌ Falha ao autenticar Conta de Serviço do Google: {e}")
        return None

# ==========================================
# FUNÇÕES DE SINCRONIZAÇÃO
# ==========================================

def baixar_banco_mais_recente():
    service = obter_servico_drive()
    file_id = os.environ.get('GOOGLE_DRIVE_FILE_ID') 
    
    if not service or not file_id:
        print("⚠️ Sincronização desativada: Credenciais ou FILE_ID ausentes no .env")
        return False

    try:
        print("🔄 Baixando o banco de dados do Drive Pessoal...")
        # pylint: disable=no-member
        request = service.files().get_media(fileId=file_id) 
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        
        done = False
        while not done:
            _, done = downloader.next_chunk()

        # Salva na raiz do projeto
        with open('ecos_database.db', 'wb') as f:
            f.write(buffer.getvalue())
            
        print("✅ Banco de dados sincronizado com a nuvem com sucesso!")
        return True
    except Exception as e:
        print(f"❌ Erro ao baixar banco de dados do Drive: {e}")
        return False

def enviar_banco_para_o_drive():
    service = obter_servico_drive()
    file_id = os.environ.get('GOOGLE_DRIVE_FILE_ID')
    
    if not service or not file_id or not os.path.exists('ecos_database.db'):
        return False

    try:
        media = MediaFileUpload('ecos_database.db', mimetype='application/x-sqlite3', resumable=True)
        
        # pylint: disable=no-member
        service.files().update( 
            fileId=file_id,
            media_body=media
        ).execute()
        
        # Removido o print daqui para não poluir o terminal durante o uso rápido
        return True
    except Exception as e:
        print(f"❌ Erro ao atualizar o Drive: {e}")
        return False