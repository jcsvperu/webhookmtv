import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq, { toFile } from 'groq-sdk';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

import { skillMTV } from './skill-mtv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const staticPath = process.cwd();
app.use('/Content', express.static(path.join(staticPath, 'Content')));
app.use(express.static(staticPath));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const pineconeIndex = pc.index('mtvrag-1536');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let knowledgeBase = '';
let procedureSummary = '';

const conversationHistory = [];
const stats = { totalRequests: 0, successfulResponses: 0, avgResponseTime: 0 };

async function loadDocument() {
  const mdPath = path.join(process.cwd(), 'Content', 'procedimiento_mtv.md');
  
  const possiblePaths = [
    path.join(process.cwd(), 'Content', 'procedimiento_mtv.md'),
    path.join(__dirname, 'Content', 'procedimiento_mtv.md'),
    '/tmp/Content/procedimiento_mtv.md'
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      knowledgeBase = fs.readFileSync(p, 'utf8');
      console.log('Documento Markdown cargado desde:', p);
      console.log('Caracteres:', knowledgeBase.length);
      return;
    }
  }
  console.log('Documento no encontrado');
}

function loadProcedureSummary() {
  const filePath = path.join(process.cwd(), 'Content', 'ProcedimientoCompletoMTV.md');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      procedureSummary = content
        .replace(/^#\s+/gm, '')
        .replace(/^##\s+/gm, '')
        .replace(/\*\*/g, '')
        .replace(/^-\s/gm, '  • ')
        .trim();
      console.log('Procedimiento completo cargado desde:', filePath);
    } else {
      console.log('ProcedimientoCompletoMTV.md no encontrado en:', filePath);
    }
  } catch (err) {
    console.error('Error cargando ProcedimientoCompletoMTV.md:', err.message);
  }
}

const KEYWORDS = [
  'módulo', 'módulos', 'modulo', 'modulos', 'mtv', 'temporal', 'temporales', 'vivienda', 'emergencia',
  'damnificado', 'damnificados', 'decreto', '012', '012-2015', 
  'sinpad', 'evacuación', 'predio', 'gobierno regional', 'gobierno local',
  'mvcs', 'dgppvu', 'sbn', 'cofopri', 'pnc', 'osdn', 'defensa nacional',
  'colapsada', 'inhabitable', 'vulnerable', 'asistencia técnica',
  'padrones', 'padrón', 'instalación', 'entrega', 'entregar', 'acta', 'situación de emergencia',
  'declaratoria', 'estado de emergencia', 'terreno', 'zona de riesgo',
  'artículo', 'articulo', 'art.', 'persona', 'familia', 'afectado', 'desastre',
  'acceder', 'acceso', 'beneficiario', 'requisitos', 'plazo', 'plazos',
  'cuantificación', 'evaluación', 'entregar', 'donación',
  'art'
];

function isRelevantQuestion(question) {
  const questionLower = question.toLowerCase();
  
  if (questionLower.includes('art') && /\d+/.test(question)) {
    return true;
  }
  
  const cleanQuestion = questionLower.replace(/[¿?]/g, '').trim();
  if (/^(qué|es|cómo|cuándo|dónde|cuál|quién|cuántos)/i.test(cleanQuestion)) {
    return true;
  }
  
  return KEYWORDS.some(keyword => questionLower.includes(keyword));
}

function isProcedureRequest(question) {
  const qLower = question.toLowerCase().replace(/[¿?().,!¡]/g, ' ').replace(/\s+/g, ' ').trim();

  // Si pregunta por un artículo específico, no es solicitud de procedimiento completo
  if (/\bart[\.\s]*\d+/i.test(qLower) || /\bartículo\s*\d+/i.test(qLower)) {
    return false;
  }

  const patterns = [
    'procedimiento completo',
    'procedimiento de entrega',
    'procedimiento',
    'resumen del procedimiento',
    'resumen completo',
    'resumen de entrega',
    'resumen del proceso',
    'resumen',
    'proceso completo',
    'proceso de entrega',
    'todo el procedimiento',
    'todo el proceso',
    'entrega de módulos completo',
    'entrega de modulos completo',
    'entrega de módulos',
    'entrega de modulos',
    'la entrega de',
    'explicame todo el proceso',
    'explicame el proceso completo',
    'explicame el procedimiento',
    'etapas del procedimiento',
    'fases del procedimiento',
    'pasos del procedimiento',
    'paso a paso',
    'muestrame el procedimiento',
    'quiero el procedimiento',
    'necesito el procedimiento',
    'dame el procedimiento',
    'cual es el procedimiento',
    'cómo es el procedimiento',
    'como es el procedimiento',
    'cómo funciona el procedimiento',
    'como funciona el procedimiento',
    'del procedimiento',
    'del proceso',
    'el proceso de entrega',
    'procedimiento paso a paso',
    'cómo se entregan',
    'como se entregan',
    'se entregan',
    'se entrega',
    'entregan los módulos',
    'entregan los modulos',
    'entregar los módulos',
    'entregar los modulos',
    'cómo funciona la entrega',
    'como funciona la entrega',
    'explica el procedimiento',
    'explica el proceso',
    'información del procedimiento',
    'información del proceso',
    'información sobre el procedimiento',
    'información sobre el proceso',
    'información de la entrega',
    'procedimiento completo de entrega',
    'procedimiento de los módulos',
    'procedimiento de entrega de módulos',
    'procedimiento de entrega de modulos'
  ];
  return patterns.some(pattern => qLower.includes(pattern));
}

function hasProcedureKeywords(question) {
  const qLower = question.toLowerCase().replace(/[¿?]/g, '');
  const keywords = [
    'procedimiento', 'proceso', 'resumen', 'fases', 'etapas',
    'pasos', 'flujo', 'etapa', 'fase', 'paso',
    'entrega', 'entregan', 'entregar'
  ];
  return keywords.some(kw => qLower.includes(kw));
}

function findArticleResponse(question) {
  const qLower = question.toLowerCase();
  
  const subArticleMatch = qLower.match(/art.*?(\d+)\.(\d+)/i);
  if (subArticleMatch) {
    const key = `articulo_${subArticleMatch[1]}_${subArticleMatch[2]}`;
    return skillMTV.quickResponses[key] || null;
  }
  
  const articleMatch = qLower.match(/art.*?(\d+)/i);
  if (articleMatch) {
    const num = articleMatch[1];
    return skillMTV.quickResponses[`articulo_${num}`] || null;
  }
  return null;
}

async function searchPinecone(query) {
  try {
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });
    
    const results = await pineconeIndex.namespace('MTVRAG').query({
      vector: embedding.data[0].embedding,
      topK: 3,
      includeMetadata: true
    });
    
    if (results.matches && results.matches.length > 0) {
      return results.matches.map(m => m.metadata?.text || '').filter(t => t).join('\n\n');
    }
    return '';
  } catch (error) {
    console.error('Error Pinecone:', error.message);
    return '';
  }
}

function searchContext(query) {
  if (!knowledgeBase) return '';
  
  const queryLower = query.toLowerCase();
  let chunks = knowledgeBase.split(/\n\n+/).filter(c => c.trim().length > 3);
  
  const articleMatch = queryLower.match(/(?:art.*culo|art\.?)\s*(\d+)(?:\.(\d+))?|^(\d+)(?:\.\d+)?\.?/i);
  if (articleMatch) {
    const articleNum = articleMatch[1] || articleMatch[3];
    const subArticleNum = articleMatch[2];
    
    let articleChunks = chunks.filter(c => {
      const cLower = c.toLowerCase();
      
      if (subArticleNum) {
        return cLower.includes(`${articleNum}.${subArticleNum}`) ||
               cLower.includes(`artículo ${articleNum}`) ||
               cLower.includes(`articulo ${articleNum}`) ||
               cLower.includes(`art ${articleNum}`);
      }
      
      return cLower.includes(`${articleNum}.-`) ||
             cLower.includes(`artículo ${articleNum}`) || 
             cLower.includes(`articulo ${articleNum}`) ||
             cLower.includes(`art ${articleNum}`);
    });
    
    if (articleChunks.length > 0) {
      return articleChunks.join('\n\n');
    }
  }
  
  const scored = chunks.map(chunk => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;
    const queryWords = queryLower.split(' ').filter(w => w.length > 2);
    for (const word of queryWords) {
      if (chunkLower.includes(word)) score += 1;
    }
    const keywordMatch = KEYWORDS.filter(k => chunkLower.includes(k.toLowerCase())).length;
    score += keywordMatch * 3;
    return { text: chunk, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(s => s.text).join('\n\n');
}

function splitTextIntoChunks(text, maxLength = 180) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks.length > 0 ? chunks : [text.substring(0, maxLength)];
}

async function textToSpeech(text, retries = 3) {
  const cleanText = text.replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ.,!?¿¡\-:;%()/–—"''"]/g, '').trim();
  if (!cleanText) return null;

  const MAX_CHUNK = 1500;
  if (cleanText.length > MAX_CHUNK) {
    const parts = splitTextIntoChunks(cleanText, MAX_CHUNK);
    const audioBuffers = [];
    for (const part of parts) {
      try {
        const mp3 = await openai.audio.speech.create({
          model: 'tts-1',
          voice: 'alloy',
          input: part,
          response_format: 'mp3'
        });
        audioBuffers.push(Buffer.from(await mp3.arrayBuffer()));
      } catch (error) {
        console.error('TTS parcial fallido:', error.message);
      }
    }
    if (audioBuffers.length === 0) return null;
    return Buffer.concat(audioBuffers).toString('base64');
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const mp3 = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: cleanText,
        response_format: 'mp3'
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer.toString('base64');
    } catch (error) {
      console.error('Intento TTS fallido:', error.message);
      if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.log('TTS: Todos los intentos fallaron');
  return null;
}

async function transcribeAudio(audioBase64, retries = 2) {
  // Limpiar prefijo data URL si el cliente lo envió completo
  let cleanBase64 = audioBase64;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',').pop();
    console.log('Se limpió prefijo data URL del audio');
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const extensions = ['webm', 'mp3', 'ogg', 'wav'];
    const ext = extensions[attempt % extensions.length];

    try {
      const buffer = Buffer.from(cleanBase64, 'base64');
      const sizeKB = (buffer.length / 1024).toFixed(1);
      console.log(`Intento ${attempt + 1} (${ext}): buffer ${sizeKB}KB`);

      if (buffer.length < 100) {
        console.error('Audio demasiado pequeño:', buffer.length, 'bytes');
        return null;
      }

      const audioFile = await toFile(buffer, `audio.${ext}`);

      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'es',
        response_format: 'json'
      });

      const text = transcription.text.trim();
      console.log('Transcripción exitosa:', text.substring(0, 120));
      return text;
    } catch (error) {
      console.error(`Intento ${attempt + 1} (${ext}) falló:`, error.message);
      if (error.status) console.error('Status code:', error.status);
      if (error.code) console.error('Código:', error.code);
      if (error.body) console.error('Body:', error.body);
      if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.log('Transcripción: Todos los intentos fallaron');
  return null;
}

function truncateResponse(text, maxLines = 5) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + '...';
}

function findQuickResponse(question) {
  const qLower = question.toLowerCase();
  
  const quickMap = {
    'objeto': ['objeto', 'para qué sirve', 'qué es'],
    'alcance': ['alcance', 'aplica', 'territorio'],
    'interviene': ['interviene', 'intervención'],
    'evaluacion': ['evaluación', 'evaluar', 'informe'],
    'asistencia': ['asistencia técnica', 'ayuda técnica', 'capacita'],
    'cuantificacion': ['cuantificación', 'cantidad', 'cuántos'],
    'requisitos_predio': ['requisitos del predio', 'predio', 'terreno'],
    'instalacion': ['instalación', 'instalar', 'nivelación'],
    'servicios': ['servicios básicos', 'agua', 'excretas'],
    'entrega': ['entrega', 'entregar', 'acta'],
    'excepcion': ['excepción', 'excepcional', 'resolución']
  };
  
  for (const [key, phrases] of Object.entries(quickMap)) {
    for (const phrase of phrases) {
      if (qLower.includes(phrase)) {
        return skillMTV.quickResponses[key];
      }
    }
  }
  
  return null;
}

async function answerQuestion(question, isVoice = false) {
  // Todas las preguntas se buscan en la BD vectorial

  if (isProcedureRequest(question)) {
    if (procedureSummary) {
      return procedureSummary;
    }
    return 'El resumen del procedimiento no está disponible en este momento.';
  }
  
  const articleResponse = findArticleResponse(question);
  if (articleResponse) {
    return articleResponse;
  }
  
  const quickResponse = findQuickResponse(question);
  if (quickResponse) {
    return quickResponse;
    return quickResponse;
  }
  
  let context = searchContext(question);
  
  const pineconeContext = await searchPinecone(question);
  context = pineconeContext || context;
  
  // Si la pregunta tiene palabras clave del procedimiento pero no coincidió exactamente,
  // inyectar el resumen completo como contexto adicional
  if (hasProcedureKeywords(question) && procedureSummary) {
    context = context
      ? `${procedureSummary}\n\n${context}`
      : procedureSummary;
  }
  
  if (context) {
    const prompt = `Solo puedes responder sobre Módulos Temporales de Vivienda (MTV). Si no tienes información, dilo.
    
CONtexto IMPORTANTE (usa solo esto):
${context}

Pregunta: ${question}

Responde en máximo 3 líneas.`;
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 100
    });
    let answer = completion.choices[0].message.content.trim();
return answer;
  }
  
  return "No tengo información específica sobre ese tema. ¿Tienes otra pregunta sobre módulos temporales de vivienda?";
}

app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  console.log('Headers:', req.headers['content-type']);
  console.log('Body keys:', Object.keys(req.body));
  
  try {
    const { text, audio, respondWithVoice } = req.body;
    
    if (req.body.image) {
      console.log('IMAGEN RECIBIDA - largo:', req.body.image.length);
    }
    
    if (!text && !audio) {
      return res.status(400).json({ error: 'Falta texto o audio' });
    }

    let question = text;
    let transcribed = null;
    
    if (audio) {
      console.log('Audio recibido, largo:', audio.length);
      transcribed = await transcribeAudio(audio);
      console.log('Transcripción:', transcribed);
      if (!transcribed) {
        console.error('Transcripción falló después de reintentos');
        return res.status(500).json({ error: 'No se pudo transcribir el audio. Intente hablar más claro o escribir su consulta.' });
      }
      question = transcribed;
    }

    const answer = await answerQuestion(question);
    const responseTime = Date.now() - startTime;

    const response = { answer };

    if (transcribed) {
      response.transcribedQuestion = transcribed;
    }

    const audioBase64 = await Promise.race([
      textToSpeech(answer),
      new Promise(resolve => setTimeout(() => resolve(null), 60000))
    ]);
    if (audioBase64) {
      response.audio = audioBase64;
    }

    conversationHistory.push({
      timestamp: new Date().toISOString(),
      question: question,
      answer: answer.substring(0, 200),
      responseTime: responseTime,
      audioUsed: !!audio,
      voiceResponse: respondWithVoice
    });

    if (conversationHistory.length > 100) conversationHistory.shift();

    stats.totalRequests++;
    stats.successfulResponses++;
    stats.avgResponseTime = ((stats.avgResponseTime * (stats.totalRequests - 1)) + responseTime) / stats.totalRequests;

    res.json(response);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    stats.totalRequests++;
    conversationHistory.push({
      timestamp: new Date().toISOString(),
      question: req.body.text || req.body.audio ? 'audio' : 'unknown',
      answer: 'ERROR: ' + error.message,
      responseTime: responseTime,
      error: true
    });
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', documentLoaded: !!knowledgeBase });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'test.html'));
});

app.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({ 
    total: conversationHistory.length,
    history: conversationHistory.slice(-limit).reverse()
  });
});

app.get('/stats', (req, res) => {
  res.json({
    totalRequests: stats.totalRequests,
    successfulResponses: stats.successfulResponses,
    avgResponseTime: Math.round(stats.avgResponseTime) + 'ms',
    recentHistory: conversationHistory.slice(-10).reverse()
  });
});

app.post('/clear-history', (req, res) => {
  conversationHistory.length = 0;
  res.json({ message: 'Historial清除' });
});

app.get('/skill', (req, res) => {
  res.json({
    name: skillMTV.name,
    version: skillMTV.version,
    description: skillMTV.description,
    conversationStarters: skillMTV.conversationStarters,
    quickResponses: skillMTV.quickResponses
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log('Servidor iniciado en puerto', PORT);
  loadDocument().then(() => {
    console.log('Documento cargado');
  }).catch(err => {
    console.error('Error cargando documento:', err);
  });
  loadProcedureSummary();
});

export default app;