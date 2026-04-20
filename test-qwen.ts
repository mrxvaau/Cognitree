import { QwenOAuth2Client, loadCachedCredentials } from './src/services/qwen/qwenOAuth.ts';

const creds = await loadCachedCredentials();
if (!creds) { console.log('No creds'); process.exit(1); }

// Refresh to get fresh token
const client = new QwenOAuth2Client();
client.setCredentials(creds);
const _ = await client.refreshAccessToken();
const freshCreds = client.getCredentials();
const apiKey = freshCreds.access_token!;

console.log('Token:', apiKey.substring(0, 20) + '...');

// Try different endpoints
const endpoints = [
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  'https://portal.qwen.ai/v1/chat/completions',
];

const models = ['coder-model', 'qwen3-coder-plus', 'qwen-plus-latest'];

for (const endpoint of endpoints) {
  for (const model of models) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        }),
      });
      
      if (resp.status === 200) {
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let text = '';
        for (let j = 0; j < 5; j++) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value);
        }
        reader.releaseLock();
        console.log(`✅ ${model} @ ${endpoint.split('/')[2]} -> OK:`, text.substring(0, 200));
      } else {
        const errText = await resp.text();
        const msg = JSON.parse(errText).error?.message || errText.substring(0, 100);
        console.log(`❌ ${model} @ ${endpoint.split('/')[2]} -> ${resp.status}: ${msg.substring(0, 80)}`);
      }
    } catch (e: any) {
      console.log(`❌ ${model} @ ${endpoint.split('/')[2]} -> ERR: ${e.message.substring(0, 60)}`);
    }
  }
}
