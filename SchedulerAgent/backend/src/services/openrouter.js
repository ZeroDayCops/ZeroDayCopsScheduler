const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');
const prisma = require('../prisma');
const { handlePostAnalysisAutomation } = require('./automation');

/**
 * ARCHITECTURAL NOTICE (Vercel Serverless Fragility):
 * Running ffmpeg via exec() inside Vercel serverless functions is fundamentally fragile due to
 * ephemeral disk storage, non-guaranteed ffmpeg binaries, and strict 10s-60s function execution limits.
 * Video frame extraction should ideally run on a persistent worker process or background task queue.
 */

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
    exec(cmd, { timeout: 25000 }, (error) => {
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
    exec(cmd, { timeout: 25000 }, (error) => {
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

const { downloadFromR2 } = require('./r2Storage');

/**
 * Generates dynamic, file-unique copy if offline or un-keyed.
 */
function generateDynamicContent(filename, mediaType, brandVoice, emojiStyle, workspace) {
  let baseName = path.basename(filename, path.extname(filename))
    .replace(/^file[-_]?/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  // Strip date schedule patterns (e.g. 31july0834, 27july, 30jul2000) from product name
  baseName = baseName.replace(/^[0-9]{1,2}(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[0-9]*/gi, '').trim();

  const cleanTitle = (baseName.length > 2)
    ? baseName.replace(/\b\w/g, c => c.toUpperCase()) 
    : `${workspace.brandName || 'Brand'} Visual`;

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
  let tempR2DownloadedPath = null;

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

    // Fix 1.2: If local file does not exist on disk but media has r2Url/r2Key, download via R2 S3 SDK
    if ((!activeFilepath || !fs.existsSync(activeFilepath)) && (media.r2Url || media.r2Key)) {
      try {
        console.log(`[AI ENGINE] Local file missing for media ${mediaId}. Downloading from R2 via S3 SDK...`);
        const ext = path.extname(media.filename) || '.tmp';
        tempR2DownloadedPath = path.join(os.tmpdir(), `r2-download-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        await downloadFromR2(media.r2Key || media.r2Url, tempR2DownloadedPath);
        activeFilepath = tempR2DownloadedPath;
        console.log(`[AI ENGINE] Downloaded R2 media ${mediaId} to temporary path: ${activeFilepath}`);
      } catch (r2DlErr) {
        console.warn(`[AI ENGINE] Failed to download R2 media file for ${mediaId}:`, r2DlErr.message);
      }
    }

    // Handle Video Frame Extraction
    if (media.mediaType === 'VIDEO') {
      try {
        if (activeFilepath && fs.existsSync(activeFilepath)) {
          tempTrimmedPath = await trimVideo(activeFilepath);
          activeFilepath = tempTrimmedPath;
        }
      } catch (trimErr) {
        console.warn('[AI ENGINE] Video trim failed or timed out:', trimErr.message);
      }
      try {
        if (activeFilepath && fs.existsSync(activeFilepath)) {
          tempFramePath = await extractVideoFrame(activeFilepath);
        }
      } catch (frameErr) {
        console.warn('[AI ENGINE] Video frame extraction failed or timed out:', frameErr.message);
      }
    }

    const imageToAnalyze = tempFramePath || (media.mediaType === 'IMAGE' ? activeFilepath : null);
    const brandVoice = media.workspace.brandVoice || 'bold, creative, and professional';
    const brandDescription = media.workspace.brandDescription || '';
    const emojiStyle = media.workspace.emojiStyle || 'moderate';

    // ─── Step 3: Fetch historical caption style-matching examples ─────
    let historicalExamplesText = '';
    try {
      const pastPosts = await prisma.scheduledPost.findMany({
        where: {
          workspaceId: media.workspaceId,
          status: 'PUBLISHED',
        },
        orderBy: { publishedAt: 'desc' },
        take: 3,
      });

      if (pastPosts.length > 0) {
        const exampleSnippets = pastPosts
          .map((post, idx) => {
            const content = post.renderedContent || {};
            const text = content.description || content.caption || (typeof content === 'string' ? content : '');
            if (!text) return null;
            const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
            return `Example ${idx + 1}: "${truncated}"`;
          })
          .filter(Boolean);

        if (exampleSnippets.length > 0) {
          historicalExamplesText = `\nHistorical Style Reference Examples (match tone and formatting, do not duplicate content):\n${exampleSnippets.join('\n')}\n`;
        }
      }
    } catch (histErr) {
      console.warn('[AI ENGINE] Failed to fetch historical style examples:', histErr.message);
    }

    let systemPrompt = `You are an expert social media brand manager and visual analyst. 
ANALYZE THE ATTACHED IMAGE OR VIDEO FRAME IN DETAIL.

CRITICAL CONTENT REQUIREMENTS:
1. Grounding & Detail: Your description MUST directly describe and reference at least 2-3 specific visual elements physically present in the image (e.g. people, attire, specific objects, certificate/text, colors, background setting).
2. Length: Write a rich, detailed description of 2-3 full sentences.
3. ABSOLUTE PROHIBITION ON TEMPLATE ECHOING: NEVER include instruction phrases like "tailored to embody our brand voice", "crafted in a tone", or "in a bold tone". Write real, natural social media copy directly.
4. ABSOLUTE PROHIBITION ON FILENAMES & DATE STRINGS: Do NOT use file names, date strings (e.g. 31july, Y0853, 0834), or raw IDs anywhere in product, headline, description, keywords, or hashtags.

Schema Requirements (return ONLY a single valid raw JSON object):
{
  "product": "Specific, real title of what is shown in the image (NOT a filename or generic string)",
  "headline": "Engaging headline hook summarizing the visual content",
  "description": "2-3 sentence engaging post copy grounded in 2-3 physical visual details from the image",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
  "mood": "Specific visual vibe (e.g., proud, inspirational, professional)",
  "suggested_cta": "Actionable call to action"
}`;

    if (brandDescription) {
      systemPrompt += `\n\nWorkspace Brand Context:\n${brandDescription}`;
    }
    if (historicalExamplesText) {
      systemPrompt += `\n${historicalExamplesText}`;
    }

    let resultJson = null;
    let isDegraded = false;

    // ─── Live Dynamic Gemini Model Resolution via ListModels ───
    const geminiKey = process.env.GEMINI_API_KEY;
    let geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (geminiKey && geminiKey.trim() && !geminiKey.includes('your-')) {
      try {
        const modelsRes = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey.trim()}`, { timeout: 10000 });
        const availableNames = (modelsRes.data.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        
        // Pick preferred active vision model from available list
        const preferredModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
        const resolved = preferredModels.find(p => availableNames.includes(p)) || availableNames.find(n => n.includes('flash'));
        if (resolved) {
          geminiModel = resolved;
          console.log(`[AI ENGINE] Live ListModels resolved active Gemini model: ${geminiModel}`);
        }
      } catch (listErr) {
        console.warn('[AI ENGINE] Failed to fetch live ListModels list, using configured default:', geminiModel, listErr.message);
      }
    }

    // ─── PROVIDER 1: Google Gemini Vision API ───────────────────────
    if (!resultJson && geminiKey && geminiKey.trim() && !geminiKey.includes('your-')) {
      try {
        console.log(`[AI ENGINE] Analyzing media ${mediaId} with Google Gemini (${geminiModel})...`);
        await prisma.media.update({
          where: { id: mediaId },
          data: { statusDetail: `Analyzing image with Gemini Vision AI (${geminiModel})...` },
        });

        let imageBuffer = null;
        let mimeType = 'image/jpeg';

        if (imageToAnalyze && fs.existsSync(imageToAnalyze)) {
          imageBuffer = fs.readFileSync(imageToAnalyze);
          mimeType = getMimeType(imageToAnalyze);
        }

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
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey.trim()}`,
          {
            contents: [{ parts }],
            generationConfig: { response_mime_type: 'application/json' },
          },
          { timeout: 35000 }
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
          'http://127.0.0.1:11434/api/generate',
          {
            model: 'qwen2.5:1.5b',
            prompt: systemPrompt,
            stream: false,
            format: 'json',
          },
          { timeout: 15000 }
        );

        resultJson = JSON.parse(ollamaRes.data.response);
        console.log(`[AI ENGINE] Ollama analysis successful for media ${mediaId}`);
      } catch (ollamaErr) {
        console.warn('[AI ENGINE] Ollama fallback unavailable:', ollamaErr.message);
      }
    }

    // ─── PROVIDER 3: OpenRouter API Fallback ────────────────────────
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!resultJson && openrouterKey && openrouterKey.trim() && !openrouterKey.includes('your-')) {
      try {
        console.log(`[AI ENGINE] Attempting OpenRouter API fallback...`);
        const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
        const orRes = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model,
            messages: [{ role: 'user', content: systemPrompt }],
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              Authorization: `Bearer ${openrouterKey.trim()}`,
              'Content-Type': 'application/json',
            },
            timeout: 20000,
          }
        );

        resultJson = JSON.parse(orRes.data.choices[0].message.content);
        console.log(`[AI ENGINE] OpenRouter analysis successful for media ${mediaId}`);
      } catch (orErr) {
        console.warn('[AI ENGINE] OpenRouter API fallback failed:', orErr.message);
      }
    }

    // ─── PROVIDER 4: Dynamic Generator (Degraded Fallback) ──────────
    if (!resultJson || !resultJson.product || !resultJson.headline || !resultJson.description) {
      console.warn(`[AI ENGINE] All AI vision providers failed for media ${mediaId}. Falling through to degraded dynamic generator.`);
      isDegraded = true;
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
        aiDegraded: isDegraded,
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
    if (tempR2DownloadedPath && fs.existsSync(tempR2DownloadedPath)) {
      try { fs.unlinkSync(tempR2DownloadedPath); } catch {}
    }
  }
}

module.exports = { analyzeMedia };
