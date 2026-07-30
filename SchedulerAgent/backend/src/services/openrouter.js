const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');
const prisma = require('../prisma');
const { handlePostAnalysisAutomation } = require('./automation');

/**
 * Extracts a representative video frame at 2 seconds using ffmpeg.
 */
function extractVideoFrame(videoPath) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(
      os.tmpdir(),
      `frame-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`
    );
    const cmd = `ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 "${outputPath}"`;
    exec(cmd, (error) => {
      if (error) {
        console.error('[FFMPEG FRAME ERROR]:', error.message);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
}

/**
 * Trims a video to the first 20 seconds.
 */
function trimVideo(inputPath) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(inputPath);
    const outputPath = path.join(
      os.tmpdir(),
      `trimmed-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
    );
    const cmd = `ffmpeg -y -ss 0 -t 20 -i "${inputPath}" -c copy "${outputPath}"`;
    exec(cmd, (error) => {
      if (error) {
        console.error('[FFMPEG ERROR] Failed to trim video:', error.message);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return mimeMap[ext] || 'image/jpeg';
}

/**
 * Generates dynamic, file-unique copy if offline or un-keyed.
 */
function generateDynamicContent(filename, mediaType, brandVoice, emojiStyle, workspace) {
  const baseName = path.basename(filename, path.extname(filename))
    .replace(/^file[-_]?/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  
  const cleanTitle = baseName.length > 2 
    ? baseName.replace(/\b\w/g, c => c.toUpperCase()) 
    : `${workspace.brandName || 'Brand'} Visual ${Date.now().toString().slice(-4)}`;

  const emojiList = emojiStyle === 'heavy' ? ['🚀', '✨', '🔥', '📸', '⚡'] : emojiStyle === 'moderate' ? ['✨', '🎯'] : ['✨'];
  const emojiStr = emojiList.join(' ');

  const headlines = [
    `Unveiling ${cleanTitle} ${emojiStr}`,
    `Next-Gen Spotlight: ${cleanTitle}`,
    `Transforming Your Vision with ${cleanTitle}`,
    `The Art of ${cleanTitle} — ${workspace.brandName || 'Brand Spotlight'}`,
  ];

  const copies = [
    `Elevate your content stream with ${cleanTitle}. Crafted in a ${brandVoice} tone to inspire engagement across all platforms. ${emojiStr}`,
    `Immerse your audience in ${cleanTitle}. Perfectly tailored to embody our ${brandVoice} brand voice. ${emojiStr}`,
    `Meet ${cleanTitle} — designed to captivate and deliver high-impact results for ${workspace.brandName || 'your business'}. ${emojiStr}`,
  ];

  const hashPool = [
    `#${cleanTitle.replace(/\s+/g, '')}`,
    `#${(workspace.brandName || 'Brand').replace(/\s+/g, '')}`,
    '#Marketing', '#ContentStrategy', '#SocialMediaMarketing', '#VisualContent', '#BrandIdentity'
  ];

  const randomIdx = Math.floor(Math.random() * headlines.length);

  return {
    product: cleanTitle,
    headline: headlines[randomIdx],
    description: copies[randomIdx % copies.length],
    keywords: [cleanTitle.toLowerCase(), mediaType.toLowerCase(), "brand campaign", "social content"],
    hashtags: hashPool.slice(0, 4),
    mood: "modern and dynamic",
    suggested_cta: workspace.cta || "Discover more",
  };
}

/**
 * Primary AI Analysis Function:
 * Tries Gemini Vision API -> Local Ollama (qwen2.5:1.5b) -> OpenRouter -> Dynamic Generator.
 */
async function analyzeMedia(mediaId) {
  let tempTrimmedPath = null;
  let tempFramePath = null;

  try {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { workspace: true },
    });

    if (!media) {
      console.error(`Media asset not found: ${mediaId}`);
      return;
    }

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: 'ANALYZING',
        statusDetail: media.mediaType === 'VIDEO' ? 'Processing video...' : 'Analyzing media...'
      },
    });

    let activeFilepath = media.filepath;

    // Handle Video Frame Extraction
    if (media.mediaType === 'VIDEO') {
      try {
        tempTrimmedPath = await trimVideo(media.filepath);
        activeFilepath = tempTrimmedPath;
      } catch {
        activeFilepath = media.filepath;
      }
      try {
        tempFramePath = await extractVideoFrame(activeFilepath);
      } catch {}
    }

    const imageToAnalyze = tempFramePath || (media.mediaType === 'IMAGE' ? activeFilepath : null);
    const brandVoice = media.workspace.brandVoice || 'bold, creative, and professional';
    const emojiStyle = media.workspace.emojiStyle || 'moderate';

    const systemPrompt = `You are an expert social media brand manager. Analyze the provided media and return a SINGLE, valid JSON object following this exact schema:

{
  "product": "Short, catchy product/feature/theme title",
  "headline": "Attention-grabbing headline hook",
  "description": "Engaging social media post copy written in a ${brandVoice} tone with ${emojiStyle} emojis",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
  "mood": "Visual mood/vibe (e.g. sleek, energetic, premium)",
  "suggested_cta": "Clear call to action"
}

Return ONLY the raw JSON object. Do not wrap in markdown or backticks. All fields are required.`;

    let resultJson = null;

    // ─── PROVIDER 1: Google Gemini 2.5 Flash Vision (API Key) ────────
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!resultJson && geminiKey && geminiKey.trim() && !geminiKey.includes('your-')) {
      try {
        console.log(`[AI ENGINE] Analyzing media ${mediaId} with Google Gemini 2.5 Flash Vision...`);
        await prisma.media.update({
          where: { id: mediaId },
          data: { statusDetail: 'Analyzing image with Gemini Vision AI...' },
        });

        const imageBuffer = imageToAnalyze ? fs.readFileSync(imageToAnalyze) : null;
        const mimeType = imageToAnalyze ? getMimeType(imageToAnalyze) : 'image/jpeg';

        const parts = [{ text: systemPrompt }];
        if (imageBuffer) {
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: imageBuffer.toString('base64'),
            },
          });
        }

        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey.trim()}`,
          {
            contents: [{ parts }],
            generationConfig: { response_mime_type: 'application/json' },
          },
          { timeout: 25000 }
        );

        const rawText = geminiRes.data.candidates[0].content.parts[0].text;
        resultJson = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim());
        console.log(`[AI ENGINE] Gemini Vision analysis successful for media ${mediaId}`);
      } catch (err) {
        console.warn('[AI ENGINE] Gemini Vision API failed:', err.response?.data || err.message);
      }
    }

    // ─── PROVIDER 2: Local Ollama (qwen2.5:1.5b) ────────────────────
    if (!resultJson) {
      try {
        console.log(`[AI ENGINE] Attempting Local Ollama (qwen2.5:1.5b)...`);
        await prisma.media.update({
          where: { id: mediaId },
          data: { statusDetail: 'Generating copy with Local Qwen AI...' },
        });

        const ollamaRes = await axios.post(
          'http://localhost:11434/api/chat',
          {
            model: 'qwen2.5:1.5b',
            messages: [{ role: 'user', content: systemPrompt }],
            stream: false,
            format: 'json',
          },
          { timeout: 15000 }
        );

        const rawText = ollamaRes.data.message.content;
        resultJson = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim());
        console.log(`[AI ENGINE] Local Ollama Qwen2.5 analysis successful for media ${mediaId}`);
      } catch (err) {
        console.warn('[AI ENGINE] Local Ollama failed:', err.message);
      }
    }

    // ─── PROVIDER 3: OpenRouter API ─────────────────────────────────
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!resultJson && openRouterKey && openRouterKey.trim() && !openRouterKey.includes('your-')) {
      try {
        console.log(`[AI ENGINE] Attempting OpenRouter API...`);
        const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash:free';
        const imageBuffer = imageToAnalyze ? fs.readFileSync(imageToAnalyze) : null;
        const mimeType = imageToAnalyze ? getMimeType(imageToAnalyze) : 'image/jpeg';

        const content = [{ type: 'text', text: systemPrompt }];
        if (imageBuffer) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageBuffer.toString('base64')}` },
          });
        }

        const orRes = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model,
            messages: [{ role: 'user', content }],
            response_format: { type: 'json_object' },
          },
          {
            headers: { Authorization: `Bearer ${openRouterKey.trim()}` },
            timeout: 25000,
          }
        );

        const rawText = orRes.data.choices[0].message.content;
        resultJson = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim());
        console.log(`[AI ENGINE] OpenRouter analysis successful for media ${mediaId}`);
      } catch (err) {
        console.warn('[AI ENGINE] OpenRouter API failed:', err.message);
      }
    }

    // ─── PROVIDER 4: Smart Dynamic Generator (Fallback) ─────────────
    if (!resultJson) {
      console.log(`[AI ENGINE] Generating dynamic tailored copy for media ${mediaId}...`);
      resultJson = generateDynamicContent(
        media.filename,
        media.mediaType,
        brandVoice,
        emojiStyle,
        media.workspace
      );
    }

    // Ensure required schema keys exist
    if (!resultJson.product || !resultJson.headline || !resultJson.description) {
      resultJson = generateDynamicContent(
        media.filename,
        media.mediaType,
        brandVoice,
        emojiStyle,
        media.workspace
      );
    }

    // Save final analyzed AI result
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: 'ANALYZED',
        statusDetail: null,
        aiMasterJson: resultJson,
      },
    });

    console.log(`[AI ENGINE] Media ${mediaId} analyzed & updated successfully!`);

    // Trigger automation (Auto-Schedule / Auto-Publish)
    handlePostAnalysisAutomation(mediaId).catch((err) => {
      console.error(`[AUTOMATION] Error after analysis for media ${mediaId}:`, err);
    });

  } catch (err) {
    console.error(`[AI ENGINE] Analysis failed for media ${mediaId}:`, err.message);
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: 'FAILED',
        statusDetail: null,
        aiMasterJson: { error: err.message || 'Unknown analysis error' },
      },
    });
  } finally {
    // Cleanup temporary files
    if (tempFramePath && fs.existsSync(tempFramePath)) {
      try { fs.unlinkSync(tempFramePath); } catch {}
    }
    if (tempTrimmedPath && fs.existsSync(tempTrimmedPath)) {
      try { fs.unlinkSync(tempTrimmedPath); } catch {}
    }
  }
}

module.exports = { analyzeMedia };
