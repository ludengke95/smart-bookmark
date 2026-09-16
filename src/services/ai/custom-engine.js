/**
 * 自定义大模型 API 适配器 (兼容 OpenAI / DeepSeek / Ollama / vLLM 标准格式)
 */
import { serviceError } from '../errors.js';
import { t } from '../../i18n/index.svelte.js';
import { getAiApiKey } from '../storage/secure-vault.js';

/**
 * 弹性解析大模型响应内容
 * 兼容标准非流式 JSON 与第三方网关/反向代理强制返回的 SSE (Server-Sent Events) 流式分块响应
 */
async function parseResponseContent(response) {
  const rawText = await response.text();
  if (!rawText || !rawText.trim()) {
    throw serviceError('apiEmptyResponse', 'Empty model response');
  }

  // 1. 优先尝试标准非流式 JSON
  try {
    const data = JSON.parse(rawText);
    const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
    if (content !== undefined && content !== null && String(content).trim()) {
      return String(content).trim();
    }
  } catch (e) {
    // 非单块 JSON，继续尝试流式分块解析
  }

  // 2. 兼容 SSE 流式 chunks (data: {...})
  if (rawText.includes('data:')) {
    const lines = rawText.split('\n');
    let accumulatedContent = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.replace(/^data:\s*/, '').trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(dataStr);
        const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
        accumulatedContent += delta;
      } catch (err) {
        // 忽略单个畸形 chunk 行
      }
    }
    if (accumulatedContent.trim()) {
      return accumulatedContent.trim();
    }
  }

  throw serviceError('apiEmptyResponse', 'Empty or unparseable model response');
}

/**
 * 测试自定义 API 连通性
 * @param {object} config - { baseUrl, apiKey, model }
 */
export async function testCustomApiConnection(config) {
  const baseUrl = (config?.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = config?.apiKey || await getAiApiKey();
  const model = config?.model || 'gpt-4o-mini';

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
    max_tokens: 20,
    stream: false
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw serviceError('apiHttpError', `HTTP ${response.status}`, { status: response.status }, errorText.slice(0, 300));
  }

  const reply = await parseResponseContent(response);
  return {
    success: true,
    model,
    reply
  };
}

/**
 * 执行自定义大模型 API 调用
 * 指令文本（默认专家身份 + JSON 硬约束）来自 aiPrompt.* 语言包，随当前界面语言渲染
 * @param {object} params
 * @param {object} params.config - { baseUrl, apiKey, model }
 * @param {string} params.systemPrompt
 * @param {string} params.prompt
 * @param {object} [params.schema]
 * @returns {Promise<string>}
 */
export async function runCustomApiPrompt({ config, systemPrompt, prompt, schema }) {
  const baseUrl = (config?.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = config?.apiKey || await getAiApiKey();
  const model = config?.model || 'gpt-4o-mini';

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
        content: `${systemPrompt || t('aiPrompt.defaultExpert')}\n${t('aiPrompt.jsonConstraint')}`
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    stream: false
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
    throw serviceError('apiHttpError', `HTTP ${response.status}`, { status: response.status }, errorText.slice(0, 300));
  }

  return await parseResponseContent(response);
}
