# arquivo: app.py
import os
from flask import Flask, render_template
from dotenv import load_dotenv
from services.drive_sync import baixar_banco_mais_recente

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'ecos_secret_key_v2')

print("🚀 Inicializando persistência de dados via Google Drive...")
baixar_banco_mais_recente()

@app.route('/')
def index():
    return render_template('auditoria.html')

# ==========================================
# REGISTRO DE BLUEPRINTS (A MÁGICA ACONTECE AQUI)
# ==========================================
from controllers.rotas_api import bp
app.register_blueprint(bp)

if __name__ == '__main__':
    app.run(debug=True)