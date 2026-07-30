/**
 * pure rendering and validation logic for social media templates
 */

/**
 * Deduplicates and formats hashtags
 */
function processHashtags(aiHashtags = [], defaultHashtags = []) {
  const all = [...aiHashtags, ...defaultHashtags];
  const seen = new Set();
  const result = [];

  for (const tag of all) {
    if (!tag) continue;
    // Format tag to start with #
    let formatted = tag.trim();
    if (!formatted.startsWith('#')) {
      formatted = '#' + formatted;
    }
    const lower = formatted.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(formatted);
    }
  }

  return result;
}

/**
 * Renders the template string by replacing placeholders
 */
function substituteTemplate(templateBody, data) {
  return templateBody
    .replace(/\{\{headline\}\}/g, data.headline || '')
    .replace(/\{\{description\}\}/g, data.description || '')
    .replace(/\{\{hashtags\}\}/g, data.hashtags || '')
    .replace(/\{\{cta\}\}/g, data.cta || '');
}

/**
 * Renders and validates content for a specific platform
 * @returns {Object} { title, body, warnings, error }
 */
function renderPost(media, workspace, template, platform) {
  // Validate Media Type constraints
  if (platform === 'YOUTUBE' && media.mediaType === 'IMAGE') {
    return {
      error: 'YouTube requires video assets. Cannot generate a YouTube draft from an image.',
    };
  }

  const aiJson = media.aiMasterJson || {};
  
  // Resolve values
  const headline = aiJson.headline || '';
  const description = aiJson.description || '';
  const cta = aiJson.suggested_cta || workspace.cta || '';
  
  // Format and merge hashtags
  const aiHashtags = aiJson.hashtags || [];
  const defaultHashtags = workspace.defaultHashtags || [];
  const mergedHashtagsList = processHashtags(aiHashtags, defaultHashtags);
  const hashtagsString = mergedHashtagsList.join(' ');

  // Render body
  let body = substituteTemplate(template.templateBody, {
    headline,
    description,
    cta,
    hashtags: hashtagsString,
  });

  // If the template didn't contain {{hashtags}} placeholder, append them automatically at the end
  if (!template.templateBody.includes('{{hashtags}}') && hashtagsString) {
    body = body.trim() + '\n\n' + hashtagsString;
  }

  const warnings = [];

  // Run Platform Constraints Validation
  if (platform === 'LINKEDIN') {
    // Enforce max 5 hashtags for LinkedIn
    if (mergedHashtagsList.length > 5) {
      warnings.push(`LinkedIn post had ${mergedHashtagsList.length} hashtags — truncated to 5.`);
      const truncatedHashtags = mergedHashtagsList.slice(0, 5);
      const truncatedHashtagsString = truncatedHashtags.join(' ');

      // Re-render body with truncated hashtags
      body = substituteTemplate(template.templateBody, {
        headline,
        description,
        cta,
        hashtags: truncatedHashtagsString,
      });
      if (!template.templateBody.includes('{{hashtags}}') && truncatedHashtagsString) {
        body = body.trim() + '\n\n' + truncatedHashtagsString;
      }
    }
    if (body.length > 3000) {
      warnings.push(`LinkedIn post exceeds character limit of 3000 (currently ${body.length} characters).`);
    }
    return {
      body,
      warnings,
    };
  }

  if (platform === 'PINTEREST') {
    const title = headline.substring(0, 100);
    if (headline.length > 100) {
      warnings.push(`Pinterest title exceeds limit of 100 characters (will be truncated to: "${title}").`);
    }
    let finalBody = body;
    if (body.length > 500) {
      finalBody = body.substring(0, 500);
      warnings.push(`Pinterest description exceeds character limit of 500 (currently ${body.length} characters) (will be truncated to 500 characters).`);
    }
    return {
      title,
      body: finalBody,
      warnings,
    };
  }

  if (platform === 'YOUTUBE') {
    const title = headline.substring(0, 100);
    if (headline.length > 100) {
      warnings.push(`YouTube title exceeds limit of 100 characters (will be truncated to: "${title}").`);
    }
    if (body.length > 5000) {
      warnings.push(`YouTube description exceeds character limit of 5000 (currently ${body.length} characters).`);
    }
    return {
      title,
      body,
      warnings,
    };
  }

  return {
    body,
    warnings,
  };
}

module.exports = { renderPost, processHashtags };
