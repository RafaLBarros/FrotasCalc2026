FROM python:3.10-slim

WORKDIR /app

# Copia e instala as dependências estruturadas no seu arquivo
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o restante do código do projeto para dentro do contêiner
COPY . .

# Indica a porta padrão do Flask
EXPOSE 5000

# Define a variável de ambiente para o Flask saber qual arquivo executar
# IMPORTANTE: Se o seu arquivo principal não for "app.py", mude o nome abaixo
ENV FLASK_APP=app.py

# Executa o Flask garantindo que ele escute em todas as interfaces de rede (--host=0.0.0.0)
CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=5000"]