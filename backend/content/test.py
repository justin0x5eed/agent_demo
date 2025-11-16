import os
from langchain_ollama import OllamaEmbeddings, OllamaLLM


emb = OllamaEmbeddings(
    model="qwen3-embedding:0.6b",
    base_url="http://192.168.50.17:11434",
)
embedding = emb.embed_query("测试embedding")
print("\nEmbedding 结果:")
print(embedding)


MODELS = [
    ("qwen3", "qwen3:30b"),
    ("gemma3", "gemma3:27b"),
    ("gpt-oss", "gpt-oss:20b"),
]

# 修改下方索引以选择不同模型
SELECTED_MODEL_INDEX = 0


model_key, model_name = MODELS[SELECTED_MODEL_INDEX]
base_url = "http://192.168.50.17:11434"

llm = OllamaLLM(model=model_name, base_url=base_url)

question = "请简单介绍一下 LangChain 是什么？"
print(f"正在向模型 {model_key!r} ({model_name}) 发送问题: {question}")

answer = llm.invoke(question)
print("模型响应:\n")
print(answer)

