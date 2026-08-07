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
  const brand = workspace.brandName || 'Brand';

  let baseName = path.basename(filename, path.extname(filename))
    .replace(/^file[-_]?/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  // Strip date schedule patterns (e.g. 31july0834, 27july, 30jul2000) from product name
  baseName = baseName.replace(/^[0-9]{1,2}(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[0-9]*/gi, '').trim();

  const cleanTitle = (baseName.length > 2)
    ? baseName.replace(/\b\w/g, c => c.toUpperCase()) 
    : `${brand} Visual`;

  const emojiList = emojiStyle === 'heavy' ? ['🚀', '✨', '🔥', '📸', '⚡'] : emojiStyle === 'moderate' ? ['✨', '🎯'] : ['✨'];
  const emojiStr = emojiList.join(' ');

  const headlines = [
    `Unveiling ${cleanTitle} ${emojiStr}`,
    `Next-Gen Spotlight: ${cleanTitle} by ${brand}`,
    `Transforming Your Vision with ${cleanTitle}`,
    `The Art of ${cleanTitle} — ${brand}`,
  ];

  // Brand-integrated closings — rotate to avoid repetition
  const closings = [
    `\n\n— Team ${brand}`,
    `\n\nOnly at ${brand}.`,
    `\n\nCrafted with pride by ${brand}.`,
    `\n\nExperience excellence at ${brand}.`,
  ];
  const randomIdx = Math.floor(Math.random() * headlines.length);
  const closing = closings[randomIdx % closings.length];

  const copies = [
    `At ${brand}, we bring you ${cleanTitle} — built to share key milestones and deliver clear, high-impact results. ${emojiStr}${closing}`,
    `Presenting ${cleanTitle} from ${brand} — a concise look at our latest visual update. Designed to captivate your audience with unmistakable brand detail. ${emojiStr}${closing}`,
    `Discover ${cleanTitle} at ${brand}. Elevating our visual content stream with sharp focus and professional quality. ${emojiStr}${closing}`,
  ];

  // Brand hashtag FIRST, then content-specific
  const hashPool = [
    `#${brand.replace(/\s+/g, '')}`,
    `#${cleanTitle.replace(/\s+/g, '')}`,
    '#Marketing', '#ContentStrategy', '#BrandIdentity'
  ];

  return {
    product: cleanTitle,
    headline: headlines[randomIdx],
    description: copies[randomIdx % copies.length],
    keywords: [cleanTitle.toLowerCase(), mediaType.toLowerCase(), brand.toLowerCase(), "social content"],
    hashtags: hashPool.slice(0, 4),
    mood: "modern and dynamic",
    suggested_cta: workspace.cta || `Discover more at ${brand}`,
  };
}

/**
 * Main Analysis Function
 */
async function analyzeMedia(mediaId) {
  let tempFramePath = null;
  let tempTrimmedPath = null;
  let tempR2DownloadedPath = null;
  let imageToAnalyze = null;

  try {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { workspace: true },
    });

    if (!media) {
      console.error(`[AI ENGINE] Media ${mediaId} not found.`);
      return;
    }

    await prisma.media.update({
      where: { id: mediaId },
      data: { status: 'ANALYZING', statusDetail: 'Preparing asset for analysis...' },
    });

    const storageProvider = require('./storageProvider');
    const ext = path.extname(media.filename) || (media.mediaType === 'VIDEO' ? '.mp4' : '.jpg');
    tempR2DownloadedPath = path.join(os.tmpdir(), `ai-analysis-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);

    try {
      await storageProvider.downloadFile(media.r2Key || media.filepath, tempR2DownloadedPath);
    } catch (dlErr) {
      console.warn(`[AI ENGINE] Storage fetch failed for media ${mediaId}:`, dlErr.message);
    }

    let localPath = fs.existsSync(tempR2DownloadedPath) ? tempR2DownloadedPath : storageProvider.resolveLocalPath(media.filepath);

    if (media.mediaType === 'VIDEO') {
      if (localPath && fs.existsSync(localPath)) {
        await prisma.media.update({
          where: { id: mediaId },
          data: { statusDetail: 'Trimming video & extracting frame...' },
        });

        try {
          tempTrimmedPath = await trimVideo(localPath);
          tempFramePath = await extractVideoFrame(tempTrimmedPath);
          imageToAnalyze = tempFramePath;
        } catch (ffmpegErr) {
          console.warn('[AI ENGINE] FFmpeg frame extraction failed:', ffmpegErr.message);
        }
      }
    } else {
      if (localPath && fs.existsSync(localPath)) {
        imageToAnalyze = localPath;
      }
    }

    // STRICT VALIDATION: Abort analysis if physical image/video buffer is unreadable
    if (!imageToAnalyze || !fs.existsSync(imageToAnalyze) || fs.statSync(imageToAnalyze).size === 0) {
      throw new Error(`Media asset file is missing or unreadable in storage. Key/Path: ${media.r2Key || media.filepath}`);
    }


    const brandVoice = media.workspace.brandVoice || 'Bold & Precise';
    const emojiStyle = media.workspace.emojiStyle || 'moderate';
    const brandDescription = media.workspace.brandDescription || '';

    let historicalExamplesText = '';
    try {
      const pastMedia = await prisma.media.findMany({
        where: {
          workspaceId: media.workspaceId,
          status: 'ANALYZED',
          id: { not: mediaId },
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { aiMasterJson: true },
      });

      const examples = pastMedia
        .map(m => m.aiMasterJson)
        .filter(j => j && j.description && j.headline);

      if (examples.length > 0) {
        historicalExamplesText = '\n\nReference Examples of This Brand\'s Post Copy Style:\n' +
          examples.map((ex, i) => `Example ${i+1}:\nHeadline: ${ex.headline}\nCopy: ${ex.description}`).join('\n\n');
      }
    } catch (histErr) {
      console.warn('[AI ENGINE] Failed to fetch historical style examples:', histErr.message);
    }

    const brand = media.workspace.brandName || 'the brand';
    const brandClean = (media.workspace.brandName || 'Brand').replace(/\s+/g, '');
    const wsWebsite = media.workspace.website || '';

    let systemPrompt = `You are the official marketing team for "${brand}". You write every caption, description, and title AS the brand — never as an anonymous content generator.
ANALYZE THE ATTACHED IMAGE OR VIDEO FRAME IN DETAIL.

PRIMARY SUBJECT & TEXT EXTRACTION RULES:
1. DOCUMENT & TEXT FIRST: Any visible text, certificates, awards, logos, screens, product labels, documents, or signage are the PRIMARY subject of the image. Read, transcribe key details, and base the caption entirely around what that text/logo actually represents (e.g. vulnerability disclosure recognition, security award, specific product line).
2. SECONDARY COLOR ONLY: Physical background details (e.g., clothing color, floor patterns, wall textures, furniture) are strictly secondary. Include them ONLY if they genuinely enhance the story — never lead with them or treat them as the main story.
3. NO GENERIC AI FILLER: Do NOT use stock celebratory phrases or generic AI filler like "proudly presents", "inspiring moment", "significant achievement", "celebrating a stellar achievement", "unwavering dedication", or "future leaders" unless the text explicitly supports it. Write specific, grounded, authentic copy.

BRAND IDENTITY RULES (MANDATORY — EVERY caption MUST follow these):
- The brand name "${brand}" MUST appear naturally 1-3 times in the description.
- Open or weave the brand into the caption naturally: e.g. "At ${brand}, ..." or "Discover our newest collection from ${brand}..."
- NEVER stuff the brand name repeatedly — keep it natural.
- Write from the brand's perspective: instead of "This product is perfect..." prefer "At ${brand}, this product is crafted to..."
- The description MUST end with a branded closing signature. Vary it each time — examples:
  "— Team ${brand}"
  "Only at ${brand}."
  "Crafted with pride by ${brand}."
  ${wsWebsite ? `"Visit ${brand} at ${wsWebsite}."` : `"Experience excellence at ${brand}."`}
  Choose the most natural ending. Do NOT repeat the same signature every time.

BRAND VOICE & TONE GUIDANCE:
- Brand Voice / Tone: ${brandVoice}
- Emoji Style: ${emojiStyle === 'none' || emojiStyle === 'minimal' ? 'Minimal or no emojis — strictly formal, clean, and premium' : emojiStyle === 'heavy' ? 'Energetic with relevant emojis' : 'Selective, tasteful emojis'}
${media.workspace.cta ? `- Workspace Target CTA: "${media.workspace.cta}"` : ''}

CALL TO ACTION (suggested_cta) RULES:
- The CTA MUST reinforce the brand. Include "${brand}" in the CTA.
${media.workspace.cta ? `- PRIMARY RULE: Use the workspace CTA "${media.workspace.cta}" directly or adapt it tightly to match the image subject and include the brand name. Do NOT output canned filler.` : `- Provide a direct, specific call to action tied to the subject matter AND the brand. E.g. "Visit ${brand} today" or "Discover the latest at ${brand}". Never output generic canned filler.`}

HASHTAG RULES:
- The FIRST hashtag MUST always be the brand hashtag: #${brandClean}
- Then generate 2 to 4 additional highly specific, content-driven hashtags based strictly on what is depicted.
- STRICT PROHIBITION: Do NOT include generic filler hashtags like #Achievement, #Recognition, #Innovation, #ProudMoment, #Success, or #Milestone.
- Do NOT include default workspace hashtags (${(media.workspace.defaultHashtags || []).join(', ')}) — those will be appended automatically.

QUALITY VALIDATION (self-check before returning):
✅ Brand name "${brand}" appears in the description (1-3 times naturally)
✅ Description ends with a branded closing signature
✅ suggested_cta includes the brand name
✅ First hashtag is #${brandClean}
✅ Tone matches the brand voice
If any condition fails, fix it before returning.

Schema Requirements (return ONLY a single valid raw JSON object matching this exact Master JSON schema):
{
  "product": "Specific title identifying the exact subject/document/product",
  "headline": "Punchy, specific hook in the brand voice — may include ${brand}",
  "description": "2-3 sentence branded caption. Must include ${brand} naturally 1-3 times. Must end with a branded closing signature.",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "hashtags": ["#${brandClean}", "#SpecificTag1", "#SpecificTag2"],
  "mood": "Visual vibe (e.g. authoritative, technical, executive, sleek)",
  "suggested_cta": "Brand-reinforcing CTA including ${brand}"
}`;

    if (brandDescription) {
      systemPrompt += `\n\nAdditional Brand Context:\n${brandDescription}`;
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

    // Check if parent batch is now fully processed
    if (media.batchId) {
      await checkBatchCompletion(media.batchId);
    }

    // Trigger automation (Auto-Schedule / Auto-Publish)
    handlePostAnalysisAutomation(mediaId).catch((err) => {
      console.error(`[AUTOMATION] Error after analysis for media ${mediaId}:`, err);
    });

  } catch (err) {
    console.error(`[AI ENGINE] Analysis failed for media ${mediaId}:`, err.message);
    const failedMedia = await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: 'FAILED',
        statusDetail: null,
        aiMasterJson: { error: err.message || 'Unknown analysis error' },
      },
    });

    if (failedMedia.batchId) {
      await checkBatchCompletion(failedMedia.batchId);
    }
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

/**
 * Checks if all media in a batch have reached a terminal status (ANALYZED or FAILED).
 * If so, updates UploadBatch.status to READY.
 */
async function checkBatchCompletion(batchId) {
  try {
    const batchMedia = await prisma.media.findMany({
      where: { batchId },
      select: { status: true },
    });

    if (batchMedia.length === 0) return;

    const allDone = batchMedia.every(m => m.status === 'ANALYZED' || m.status === 'FAILED');
    if (allDone) {
      await prisma.uploadBatch.update({
        where: { id: batchId },
        data: { status: 'READY' },
      });
      console.log(`[AI ENGINE] All ${batchMedia.length} media items in batch ${batchId} are complete. Updated batch status -> READY.`);
    }
  } catch (err) {
    console.error(`[AI ENGINE] Error checking completion for batch ${batchId}:`, err.message);
  }
}

module.exports = { analyzeMedia, checkBatchCompletion };
