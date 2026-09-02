/**
 * 自定义大模型 API 适配器 (兼容 OpenAI / DeepSeek / Ollama / vLLM 标准格式)
 */

/**
 * 测试自定义 API 连通性
 * @param {object} config - { baseUrl, apiKey, model }
 */
export async function testCustomApiConnection(config) {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o-mini';

  const url = `${baseUrl}/chat/completions`;

  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const payload = {
    model,
    messages: [
      { role: 'system', content: 'You are a test ping responder. Reply with "pong" only.' },
      { role: 'user', content: 'ping' }
    ],
    temperature: 0.1,
    max_tokens: 10
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`API 响应错误 [HTTP ${response.status}]: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || '';
  return {
    success: true,
    model,
    reply: reply.trim()
  };
}

/**
 * 执行自定义大模型 API 调用
 * @param {object} params
 * @param {object} params.config - { baseUrl, apiKey, model }
 * @param {string} params.systemPrompt
 * @param {string} params.prompt
 * @param {object} [params.schema]
 * @returns {Promise<string>}
 */
export async function runCustomApiPrompt({ config, systemPrompt, prompt, schema }) {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o-mini';

  const url = `${baseUrl}/chat/completions`;

  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: (systemPrompt || '你是一个专业的数据分类和书签整理专家。') +
          '\n【必须输出严格的 JSON 格式】：直接输出 JSON 数组，严禁包含任何 Markdown 标记（如 ```json 等代码块标签），严禁包含任何开场白或结尾解释。'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  };

  // 支持 json_object 模式 (如果模型支持)
  if (schema || model.includes('gpt-4') || model.includes('gpt-3.5') || model.includes('deepseek')) {
    try {
      payload.response_format = { type: 'json_object' };
    } catch (e) {}
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`API 响应异常 [${response.status}]: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('模型未返回有效文本内容');
  }

  return content;
}
