import 'dotenv/config';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

const content = fs.readFileSync('Content/procedimiento_mtv.md', 'utf8');
const chunks = content.split(/\n\n+/).filter(c => c.trim().length > 10);

console.log('Chunks a indexar:', chunks.length);

const vectors = [];
for (let i = 0; i < chunks.length; i++) {
  console.log('Indexando chunk', i + 1, 'de', chunks.length);
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks[i]
  });
  vectors.push({
    id: 'chunk_' + i,
    values: embedding.data[0].embedding,
    metadata: { text: chunks[i] }
  });
}

const response = await fetch('https://mtvrag-1536-hymtv3q.svc.aped-4627-b74a.pinecone.io/vectors/upsert', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Api-Key': PINECONE_API_KEY
  },
  body: JSON.stringify({ vectors: vectors, namespace: 'MTVRAG' })
});

console.log('Indexación completada:', response.status, await response.text());