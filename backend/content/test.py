from langchain_ollama import OllamaEmbeddings
import os

api_key = os.getenv("OLLAMA_API_KEY")
print(api_key)


emb = OllamaEmbeddings(
    model="qwen3-embedding:0.6b",
    base_url="http://192.168.50.17:11434",  # 你的 Windows 机器 IP
)

vec = emb.embed_query("测试一下 embedding")
print("向量维度:", len(vec))
print("前20维:", vec[:20])

