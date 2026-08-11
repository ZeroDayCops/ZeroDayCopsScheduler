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

const REQUIRED_MASTER_JSON_FIELDS = ['product', 'headline', 'description', 'keywords', 'hashtags'];
const OPTIONAL_MASTER_JSON_FIELDS = ['mood', 'suggested_cta', 'platform_variants'];
const MASTER_JSON_FIELDS = new Set([...REQUIRED_MASTER_JSON_FIELDS, ...OPTIONAL_MASTER_JSON_FIELDS]);

function isConfiguredKey(value) {
  return Boolean(value && value.trim() && !value.includes('your-'));
}

function parseMasterJson(rawText) {
  if (typeof rawText !== 'string') {
    throw new Error('AI response did not contain text JSON.');
  }

  const parsed = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim());
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response must be a JSON object.');
  }

  const unknownFields = Object.keys(parsed).filter(field => !MASTER_JSON_FIELDS.has(field));
  if (unknownFields.length > 0) {
    throw new Error(`AI response contains unsupported Master JSON fields: ${unknownFields.join(', ')}`);
  }

  for (const field of REQUIRED_MASTER_JSON_FIELDS) {
    if (!(field in parsed)) {
      throw new Error(`AI response is missing required Master JSON field: ${field}`);
    }
  }

  for (const field of ['product', 'headline', 'description']) {
    if (typeof parsed[field] !== 'string' || !parsed[field].trim()) {
      throw new Error(`AI response field ${field} must be a non-empty string.`);
    }
  }

  for (const field of ['keywords', 'hashtags']) {
    if (!Array.isArray(parsed[field]) || parsed[field].some(value => typeof value !== 'string')) {
      throw new Error(`AI response field ${field} must be an array of strings.`);
    }
  }

  for (const field of ['mood', 'suggested_cta']) {
    if (field in parsed && parsed[field] !== null && typeof parsed[field] !== 'string') {
      throw new Error(`AI response field ${field} must be a string when provided.`);
    }
  }

  if ('platform_variants' in parsed && parsed.platform_variants !== null && parsed.platform_variants !== undefined) {
    if (typeof parsed.platform_variants !== 'object' || Array.isArray(parsed.platform_variants)) {
      throw new Error('AI response field platform_variants must be an object when provided.');
    }
    const validPlatforms = new Set(['LINKEDIN', 'PINTEREST', 'YOUTUBE']);
    for (const [key, val] of Object.entries(parsed.platform_variants)) {
      if (!validPlatforms.has(key)) {
        throw new Error(`Invalid platform key in platform_variants: ${key}`);
      }
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        throw new Error(`platform_variants.${key} must be an object.`);
      }
      for (const subKey of Object.keys(val)) {
        if (subKey !== 'headline' && subKey !== 'description') {
          throw new Error(`Unsupported field platform_variants.${key}.${subKey}`);
        }
        if (typeof val[subKey] !== 'string') {
          throw new Error(`platform_variants.${key}.${subKey} must be a string.`);
        }
      }
    }
  }

  return parsed;
}

function masterJsonSchemaInstruction(configuredPlatforms = []) {
  if (configuredPlatforms && configuredPlatforms.length > 0) {
    const platformFields = configuredPlatforms.map(p => `    "${p}": { "headline": "string (optional)", "description": "string (optional)" }`).join(',\n');
    return `Return ONLY valid JSON matching this exact schema. No markdown, no preamble, no explanation. Do not add fields:\n{\n  "product": "string",\n  "headline": "string",\n  "description": "string",\n  "keywords": ["string"],\n  "hashtags": ["#string"],\n  "mood": "string (optional)",\n  "suggested_cta": "string (optional)",\n  "platform_variants": {\n${platformFields}\n  }\n}`;
  }

  return `Return ONLY valid JSON matching this exact schema. No markdown, no preamble, no explanation. Do not add fields:\n{\n  "product": "string",\n  "headline": "string",\n  "description": "string",\n  "keywords": ["string"],\n  "hashtags": ["#string"],\n  "mood": "string (optional)",\n  "suggested_cta": "string (optional)"\n}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DIRECT OPENAI API — Tier 0 Primary Provider
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function requestOpenAIJson({ model, prompt, imageBuffer, mimeType, timeout = 45000 }) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!isConfiguredKey(openaiKey)) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const content = [{ type: 'text', text: prompt }];
  if (imageBuffer) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBuffer.toString('base64')}` },
    });
  }

  const request = async (messages) => axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${openaiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      timeout,
    }
  );

  const initialResponse = await request([{ role: 'user', content }]);
  const rawText = initialResponse.data?.choices?.[0]?.message?.content;
  try {
    return parseMasterJson(rawText);
  } catch (parseError) {
    // Self-repair: ask the model to fix its own JSON
    const repairPrompt = `${masterJsonSchemaInstruction()}\n\nThe previous response was not valid JSON for this contract. Return only the corrected JSON. Previous response:\n${rawText || '(empty response)'}`;
    const repairResponse = await request([{ role: 'user', content: repairPrompt }]);
    return parseMasterJson(repairResponse.data?.choices?.[0]?.message?.content);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPENROUTER API — Tier 1 Fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function requestOpenRouterJson({ model, prompt, imageBuffer, mimeType, timeout = 35000 }) {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!isConfiguredKey(openrouterKey)) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const content = [{ type: 'text', text: prompt }];
  if (imageBuffer) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBuffer.toString('base64')}` },
    });
  }

  const request = async (messages) => axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${openrouterKey.trim()}`,
        'Content-Type': 'application/json',
      },
      timeout,
    }
  );

  const initialResponse = await request([{ role: 'user', content }]);
  const rawText = initialResponse.data?.choices?.[0]?.message?.content;
  try {
    return parseMasterJson(rawText);
  } catch (parseError) {
    const repairPrompt = `${masterJsonSchemaInstruction()}\n\nThe previous response was not valid JSON for this contract. Return only the corrected JSON. Previous response:\n${rawText || '(empty response)'}`;
    const repairResponse = await request([{ role: 'user', content: repairPrompt }]);
    return parseMasterJson(repairResponse.data?.choices?.[0]?.message?.content);
  }
}

async function regenerateCaption(media, userTags = [], notes = '') {
  const existingMasterJson = parseMasterJson(JSON.stringify(media.aiMasterJson));
  const tagsText = userTags.length
    ? `The user has confirmed this content includes: ${userTags.join(', ')}. Reflect these hints accurately when supported by the existing visual facts.`
    : 'The user has not supplied additional tags.';
  const notesText = notes.trim() ? `Additional user notes: ${notes.trim()}` : 'No additional user notes were supplied.';
  const prompt = `You are refining social-media copy for the brand "${media.workspace.brandName || 'the brand'}". The existing Master JSON was created from visual analysis and is the source of truth for the depicted facts. Preserve those facts; do not invent people, products, claims, or visual details. Rewrite headline, description, keywords, and hashtags to incorporate the confirmed user hints. Keep the existing product, mood, and suggested_cta unless a change is strictly necessary for consistency.\n\nExisting Master JSON:\n${JSON.stringify(existingMasterJson)}\n\n${tagsText}\n${notesText}\n\n${masterJsonSchemaInstruction()}`;

  // Prefer OpenAI direct → OpenRouter fallback for refinement
  let refined;
  if (isConfiguredKey(process.env.OPENAI_API_KEY)) {
    const model = process.env.OPENAI_REFINEMENT_MODEL || 'gpt-4o-mini';
    console.log(`[AI ENGINE] Caption refinement via OpenAI (${model})...`);
    refined = await requestOpenAIJson({ model, prompt, timeout: 25000 });
  } else if (isConfiguredKey(process.env.OPENROUTER_API_KEY)) {
    const model = process.env.OPENROUTER_REFINEMENT_MODEL || 'openai/gpt-5.6-luna';
    console.log(`[AI ENGINE] Caption refinement via OpenRouter (${model})...`);
    refined = await requestOpenRouterJson({ model, prompt, timeout: 25000 });
  } else {
    throw new Error('No API key configured for caption refinement. Set OPENAI_API_KEY or OPENROUTER_API_KEY.');
  }

  // Keep vision-derived identity fields stable; this action is intentionally a caption refinement.
  return parseMasterJson(JSON.stringify({
    ...refined,
    product: existingMasterJson.product,
    ...(existingMasterJson.mood ? { mood: existingMasterJson.mood } : {}),
    ...(existingMasterJson.suggested_cta ? { suggested_cta: existingMasterJson.suggested_cta } : {}),
  }));
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

    // Query per-platform AI style guides for workspace
    let styleGuidesText = '';
    const configuredPlatforms = [];
    try {
      const styleGuideTemplates = await prisma.template.findMany({
        where: { workspaceId: media.workspaceId, aiStyleGuide: { not: null } },
      });
      const validTemplates = styleGuideTemplates.filter(t => t.aiStyleGuide && t.aiStyleGuide.trim());
      if (validTemplates.length > 0) {
        styleGuidesText = '\n\nPLATFORM-SPECIFIC VARIANTS & STYLE GUIDES (MANDATORY WHEN CONFIGURED):\n' +
          'In addition to the generic headline and description, you MUST provide platform-specific headline and description overrides under "platform_variants" for ONLY the following platforms:\n' +
          validTemplates.map(t => {
            configuredPlatforms.push(t.platform);
            return `- ${t.platform}: ${t.aiStyleGuide.trim()}`;
          }).join('\n') +
          '\nDo NOT generate platform_variants for any platforms not listed above.';
      }
    } catch (sgErr) {
      console.warn('[AI ENGINE] Failed to fetch workspace style guides:', sgErr.message);
    }

    let systemPrompt = `You are the official marketing team for "${brand}". You write every caption, description, and title AS the brand — never as an anonymous content generator.
ANALYZE THE ATTACHED IMAGE OR VIDEO FRAME IN DETAIL.

PRIMARY SUBJECT & TEXT EXTRACTION RULES:
1. DOCUMENT & TEXT FIRST: Any visible text, certificates, awards, logos, screens, product labels, documents, or signage are the PRIMARY subject of the image. Read, transcribe key details, and base the caption entirely around what that text/logo actually represents (e.g. vulnerability disclosure recognition, security award, specific product line).
2. SECONDARY COLOR ONLY: Physical background details (e.g., clothing color, floor patterns, wall textures, furniture) are strictly secondary. Include them ONLY if they genuinely enhance the story — never lead with them or treat them as the main story.
3. NO GENERIC AI FILLER: Do NOT use stock celebratory phrases or generic AI filler like "proudly presents", "inspiring moment", "significant achievement", "celebrating a stellar achievement", "unwavering dedication", or "future leaders" unless the text explicitly supports it. Write specific, grounded, authentic copy.

GARMENT & ATTIRE RECOGNITION (ETHNIC WEAR):
- Actively analyze and identify specific ethnic-wear garment types from the image directly (e.g. Sherwani, Jodhpuri Suit, Indo-Western, Kurta Pajama, Bandhgala, Nehru Jacket, Tuxedo, Lehenga, Saree) rather than generic terms like "outfit", "clothing", or "apparel". Use precise fashion terminology in headlines and copy.

BRAND IDENTITY & HEADLINE/CAPTION STRUCTURE RULES (MANDATORY):
1. HEADLINE FORMAT (STRICT): The headline MUST explicitly incorporate both the brand name "${brand}" and the identified product name in this exact structure:
   "${brand} [Product Name] — [Title / Subject]"
   Example: "${brand} Sherwani — Embodying Elegance: Two Masterpieces, One Vision"
2. DESCRIPTION OPENING (STRICT): The description MUST open directly by introducing both the brand "${brand}" and the specific product name in the very first sentence.
   Example: "Discover the exclusive ${brand} Sherwani collection, where intricate embroidery meets regal silhouettes..."
3. PLATFORM VARIANTS STYLING: When platform_variants are generated for LinkedIn, Pinterest, or YouTube, maintain this exact ${brand} + Product Name identity while adhering strictly to each platform's style guide and template format.
4. NO REPETITIVE BRAND STUFFING: Apart from the opening headline and introductory sentence, do not repeat the brand name unnecessarily. Write naturally from the brand's perspective ("we", "our").
- Do NOT add a branded closing signature (e.g. "— Team ${brand}") — that creates redundant brand stuffing when combined with hashtags and CTA.
- Keep the tone authentic and grounded. The brand identity comes through voice and quality, not repetition.

BRAND VOICE & TONE GUIDANCE:
- Brand Voice / Tone: ${brandVoice}
- Emoji Style: ${emojiStyle === 'none' || emojiStyle === 'minimal' ? 'Minimal or no emojis — strictly formal, clean, and premium' : emojiStyle === 'heavy' ? 'Energetic with relevant emojis' : 'Selective, tasteful emojis'}
${media.workspace.cta ? `- Workspace Target CTA: "${media.workspace.cta}"` : ''}

CALL TO ACTION (suggested_cta) RULES:
- Provide a direct, specific call to action tied to the image subject.
${media.workspace.cta ? `- PRIMARY RULE: Use the workspace CTA "${media.workspace.cta}" directly or adapt it tightly to match the image subject. Do NOT output canned filler.` : `- E.g. "Visit us today" or "Discover the latest". Never output generic canned filler.`}
- Including the brand name in the CTA is optional — only if it reads naturally.

HASHTAG RULES:
- The FIRST hashtag MUST always be the brand hashtag: #${brandClean}
- PRIMARY SET: Actively prefer and lead with the workspace's configured default hashtags (${(media.workspace.defaultHashtags || []).join(', ')}) as the core set.
- Fill out any remaining slots (up to 5 total hashtags) with highly specific content-driven hashtags based strictly on what is depicted.
- If the workspace has no default hashtags configured, generate 3 to 5 content-driven hashtags strictly based on what is depicted.

QUALITY VALIDATION (self-check before returning):
✅ Brand name "${brand}" appears at most once across headline + description combined
✅ No branded closing signature appended
✅ First hashtag is #${brandClean}
✅ Tone matches the brand voice
✅ Description is approximately 300-350 characters
If any condition fails, fix it before returning.

Return a Master JSON with a specific product, headline, description, content-specific keywords and hashtags, plus optional mood and suggested CTA. The exact response contract follows below.`;

    if (brandDescription) {
      systemPrompt += `\n\nAdditional Brand Context:\n${brandDescription}`;
    }
    if (historicalExamplesText) {
      systemPrompt += `\n${historicalExamplesText}`;
    }
    if (styleGuidesText) {
      systemPrompt += styleGuidesText;
    }

    let resultJson = null;
    let isDegraded = false;
    let imageBuffer = null;
    let mimeType = 'image/jpeg';

    if (imageToAnalyze && fs.existsSync(imageToAnalyze)) {
      imageBuffer = fs.readFileSync(imageToAnalyze);
      mimeType = getMimeType(imageToAnalyze);
    }

    const schemaInstruction = masterJsonSchemaInstruction(configuredPlatforms);

    // ─── PROVIDER 0: ChatGPT Direct via OpenAI API (TOP TIER) ────────
    const openaiKey = process.env.OPENAI_API_KEY;
    const primaryOpenAIModel = process.env.OPENAI_MODEL || 'gpt-4o';
    if (!resultJson && isConfiguredKey(openaiKey)) {
      try {
        console.log(`[AI ENGINE] 🔥 Analyzing media ${mediaId} with ${primaryOpenAIModel} via OpenAI Direct...`);
        await prisma.media.update({
          where: { id: mediaId },
          data: { statusDetail: `Analyzing ${media.mediaType.toLowerCase()} with ChatGPT ${primaryOpenAIModel}...` },
        });
        resultJson = await requestOpenAIJson({
          model: primaryOpenAIModel,
          prompt: `${systemPrompt}\n\n${schemaInstruction}`,
          imageBuffer,
          mimeType,
        });
        console.log(`[AI ENGINE] ✅ ChatGPT ${primaryOpenAIModel} analysis successful for media ${mediaId}`);
      } catch (openaiErr) {
        console.warn('[AI ENGINE] OpenAI direct unavailable:', openaiErr.response?.data || openaiErr.message);
      }
    }

    // ─── PROVIDER 1: OpenRouter Fallback (multimodal) ────────────────
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const primaryOpenRouterModel = process.env.OPENROUTER_PRIMARY_MODEL || 'openai/gpt-5.6-terra';
    if (!resultJson && isConfiguredKey(openrouterKey)) {
      try {
        console.log(`[AI ENGINE] Analyzing media ${mediaId} with ${primaryOpenRouterModel} via OpenRouter...`);
        await prisma.media.update({
          where: { id: mediaId },
          data: { statusDetail: `Analyzing ${media.mediaType.toLowerCase()} with ${primaryOpenRouterModel}...` },
        });
        resultJson = await requestOpenRouterJson({
          model: primaryOpenRouterModel,
          prompt: `${systemPrompt}\n\n${schemaInstruction}`,
          imageBuffer,
          mimeType,
        });
        console.log(`[AI ENGINE] ${primaryOpenRouterModel} analysis successful for media ${mediaId}`);
      } catch (primaryErr) {
        console.warn('[AI ENGINE] OpenRouter primary unavailable:', primaryErr.response?.data || primaryErr.message);
      }
    }

    // ─── PROVIDER 2: Local Ollama (qwen2.5:1.5b) ─────────────────────
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
            prompt: `${systemPrompt}\n\n${schemaInstruction}`,
            stream: false,
            format: 'json',
          },
          { timeout: 15000 }
        );

        resultJson = parseMasterJson(ollamaRes.data.response);
        console.log(`[AI ENGINE] Ollama analysis successful for media ${mediaId}`);
      } catch (ollamaErr) {
        console.warn('[AI ENGINE] Ollama fallback unavailable:', ollamaErr.message);
      }
    }

    // ─── PROVIDER 3: Google Gemini Vision API (fallback) ─────────────
    const geminiKey = process.env.GEMINI_API_KEY;
    let geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (!resultJson && isConfiguredKey(geminiKey)) {
      try {
        const modelsRes = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey.trim()}`, { timeout: 10000 });
        const availableNames = (modelsRes.data.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        const preferredModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
        const resolved = preferredModels.find(p => availableNames.includes(p)) || availableNames.find(n => n.includes('flash'));
        if (resolved) {
          geminiModel = resolved;
          console.log(`[AI ENGINE] Live ListModels resolved active Gemini model: ${geminiModel}`);
        }
      } catch (listErr) {
        console.warn('[AI ENGINE] Failed to fetch live ListModels list, using configured default:', geminiModel, listErr.message);
      }

      try {
        console.log(`[AI ENGINE] Falling back to Google Gemini Vision (${geminiModel})...`);
        await prisma.media.update({
          where: { id: mediaId },
          data: { statusDetail: `Analyzing image with Gemini Vision AI (${geminiModel})...` },
        });

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
        resultJson = parseMasterJson(rawText);
        console.log(`[AI ENGINE] Gemini Vision analysis successful for media ${mediaId}`);
      } catch (err) {
        console.warn('[AI ENGINE] Gemini Vision API failed:', err.response?.data || err.message);
      }
    }

    // ─── PROVIDER 4: Dynamic Generator (Degraded Fallback) ───────────
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

module.exports = {
  analyzeMedia,
  checkBatchCompletion,
  regenerateCaption,
  parseMasterJson,
  MASTER_JSON_FIELDS,
};
