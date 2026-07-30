const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');
const sharp = require('sharp');
const { google } = require('googleapis');

// Resolve ffmpeg binary path from ffmpeg-static if available, else system PATH
let ffmpegBinaryPath = 'ffmpeg';
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) {
    ffmpegBinaryPath = ffmpegStatic;
  }
} catch (e) {
  // fallback to system ffmpeg
}

/**
 * Helper to decrypt access token inside the calling function if needed,
 * or receive decrypted token.
 */
function isMockToken(token) {
  return !token || token.startsWith('mock_');
}

/**
 * Extracts a video frame at 2 seconds using bundled ffmpeg for mandatory cover image.
 */
function extractPinterestVideoFrame(videoPath) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(
      os.tmpdir(),
      `pinterest-cover-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`
    );
    const cmd = `"${ffmpegBinaryPath}" -y -ss 00:00:02 -i "${videoPath}" -vframes 1 "${outputPath}"`;
    exec(cmd, (error) => {
      if (error) {
        console.error('[FFMPEG COVER FRAME ERROR]:', error.message);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
}

/**
 * Normalizes images via Sharp to guarantee standard JPEG/PNG base64 format for Pinterest API v5.
 * Defaults to high-quality JPEG (85%, max 1500px) to prevent payload bloat, switching to PNG if alpha channel is present.
 */
async function preparePinterestMediaSource(mediaPath, isVideoFrame = false) {
  try {
    const image = sharp(mediaPath);
    const meta = await image.metadata();

    let processedBuffer;
    let contentType;

    if (meta.hasAlpha && !isVideoFrame) {
      contentType = 'image/png';
      processedBuffer = await image
        .resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true })
        .png({ quality: 85, compressionLevel: 6 })
        .toBuffer();
    } else {
      contentType = 'image/jpeg';
      processedBuffer = await image
        .resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
    }

    return {
      source_type: 'image_base64',
      content_type: contentType,
      data: processedBuffer.toString('base64'),
    };
  } catch (err) {
    console.error('[PINTEREST SHARP ERROR]:', err.message);
    const rawBuffer = fs.readFileSync(mediaPath);
    return {
      source_type: 'image_base64',
      content_type: 'image/jpeg',
      data: rawBuffer.toString('base64'),
    };
  }
}

/**
 * LinkedIn REST API Publisher (v202504+)
 */
async function publishToLinkedIn(post, decryptedToken, media) {
  if (isMockToken(decryptedToken)) {
    console.log(`[LINKEDIN PUBLISH MOCK] Registering asset, uploading ${media.filename}, and creating post...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      success: true,
      externalPostId: `urn:li:share:mock-${Date.now()}`,
    };
  }

  try {
    const personId = post.socialAccount.externalAccountId;
    const authorUrn = post.socialAccount.selectedAuthorUrn || `urn:li:person:${personId}`;
    const fileBuffer = fs.readFileSync(media.filepath);
    const mime = media.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    const initResponse = await axios.post(
      'https://api.linkedin.com/rest/images?action=initializeUpload',
      {
        initializeUploadRequest: {
          owner: authorUrn,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202606',
        },
      }
    );

    const uploadUrl = initResponse.data.value.uploadUrl;
    const imageUrn = initResponse.data.value.image;

    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        Authorization: `Bearer ${decryptedToken}`,
        'Content-Type': mime,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const postBody = {
      author: authorUrn,
      commentary: post.renderedContent.body,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          altText: post.renderedContent.title || 'Shared Post',
          id: imageUrn,
        },
      },
      lifecycleState: 'PUBLISHED',
    };

    const postResponse = await axios.post(
      'https://api.linkedin.com/rest/posts',
      postBody,
      {
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202606',
        },
      }
    );

    const postUrn = postResponse.headers['x-restli-id'] || postResponse.data?.id || `urn:li:share:${Date.now()}`;

    return {
      success: true,
      externalPostId: postUrn,
    };
  } catch (err) {
    console.error('[LINKEDIN PUBLISH ERROR]:', err.response?.data || err.message);
    const status = err.response?.status;
    const isPermanent = status >= 400 && status < 500 && status !== 429;
    return {
      success: false,
      isPermanent,
      error: err.response ? JSON.stringify(err.response.data) : err.message,
    };
  }
}

/**
 * Pinterest Pins API Publisher with real video sequence, mandatory cover image, polling, opt-in fallback, and 4xx fast-fail classification.
 */
async function publishToPinterest(post, decryptedToken, media) {
  if (isMockToken(decryptedToken)) {
    console.log(`[PINTEREST PUBLISH MOCK] Creating Pin on mock board...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      success: true,
      externalPostId: `mock-pin-id-${Date.now()}`,
    };
  }

  try {
    const pinterestApiBase = process.env.PINTEREST_API_BASE || 'https://api.pinterest.com';

    // 1. Board ID resolution
    let boardId = post.socialAccount.externalAccountId;
    if (!boardId || boardId.startsWith('mock-') || !/^\d+$/.test(boardId)) {
      const boardsRes = await axios.get(`${pinterestApiBase}/v5/boards`, {
        headers: { Authorization: `Bearer ${decryptedToken}` },
      });
      let firstBoard = boardsRes.data.items?.[0];
      if (!firstBoard) {
        try {
          const createBoardRes = await axios.post(
            `${pinterestApiBase}/v5/boards`,
            {
              name: 'My Pins',
              description: 'Default board created automatically by SchedulerAgent',
              privacy: 'PUBLIC',
            },
            {
              headers: {
                Authorization: `Bearer ${decryptedToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          firstBoard = createBoardRes.data;
        } catch (createErr) {
          console.error('Failed to auto-create board:', createErr?.response?.data || createErr.message);
          throw new Error('No Pinterest boards found. Create a board first.');
        }
      }
      boardId = firstBoard.id;
    }

    // 2. VIDEO PIN SEQUENCE
    if (media.mediaType === 'VIDEO') {
      let coverFramePath = null;
      try {
        console.log(`[PINTEREST] Generating mandatory cover frame from video...`);
        coverFramePath = await extractPinterestVideoFrame(media.filepath);
        const coverSource = await preparePinterestMediaSource(coverFramePath, true);

        console.log(`[PINTEREST] Step 1: Registering media upload via POST /v5/media...`);
        const mediaRegRes = await axios.post(
          `${pinterestApiBase}/v5/media`,
          { media_type: 'video' },
          {
            headers: {
              Authorization: `Bearer ${decryptedToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (mediaRegRes.data && mediaRegRes.data.upload_url && mediaRegRes.data.media_id) {
          const { media_id, upload_url, upload_parameters } = mediaRegRes.data;

          console.log(`[PINTEREST] Step 2: Constructing multipart form-data with upload_parameters...`);
          const FormData = require('form-data');
          const formData = new FormData();
          if (upload_parameters) {
            Object.entries(upload_parameters).forEach(([key, value]) => {
              formData.append(key, value);
            });
          }
          formData.append('file', fs.createReadStream(media.filepath));

          console.log(`[PINTEREST] Uploading video to S3 presigned URL ${upload_url}...`);
          await axios.post(upload_url, formData, {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          });

          console.log(`[PINTEREST] Step 3: Polling media processing status for media_id ${media_id}...`);
          let status = 'registered';
          const maxAttempts = 30; // 60s max timeout (30 x 2s)
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise((r) => setTimeout(r, 2000));
            const checkRes = await axios.get(`${pinterestApiBase}/v5/media/${media_id}`, {
              headers: { Authorization: `Bearer ${decryptedToken}` },
            });
            status = checkRes.data.status;
            console.log(`[PINTEREST MEDIA POLL ${attempt}/${maxAttempts}]: status = ${status}`);
            if (status === 'succeeded' || status === 'registered') break;
            if (status === 'failed') throw new Error('Pinterest video processing failed on server');
          }

          if (status === 'succeeded' || status === 'registered') {
            console.log(`[PINTEREST] Step 4: Creating Video Pin with mandatory cover image...`);
            const pinResponse = await axios.post(
              `${pinterestApiBase}/v5/pins`,
              {
                board_id: boardId,
                title: post.renderedContent.title || 'New Video Pin',
                description: post.renderedContent.body,
                media_source: {
                  source_type: 'video_id',
                  media_id,
                  cover_image_key_frame_time: 2,
                  cover_image_data: coverSource.data,
                  cover_image_content_type: coverSource.content_type,
                },
              },
              {
                headers: {
                  Authorization: `Bearer ${decryptedToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            return {
              success: true,
              externalPostId: pinResponse.data.id,
            };
          } else {
            throw new Error(`Pinterest video processing timed out after 60 seconds (status: ${status})`);
          }
        } else {
          throw new Error('Invalid /v5/media registration response');
        }
      } catch (videoErr) {
        console.warn('[PINTEREST VIDEO ERROR]:', videoErr.response?.data || videoErr.message);

        // Check if workspace allows opt-in video-to-image fallback
        const allowFallback = post.workspace?.allowVideoImageFallback === true;

        if (!allowFallback) {
          const status = videoErr.response?.status;
          const isPermanent = status >= 400 && status < 500 && status !== 429;
          return {
            success: false,
            isPermanent,
            error: `Pinterest video publishing failed: ${videoErr.message}. Allow Video-to-Image fallback is disabled in Workspace Settings.`,
          };
        }

        // Opt-in Fallback Path: Publish static image pin derived from video frame
        console.log(`[PINTEREST] Workspace allows fallback. Publishing video as static image pin...`);
        if (!coverFramePath) {
          coverFramePath = await extractPinterestVideoFrame(media.filepath);
        }
        const fallbackSource = await preparePinterestMediaSource(coverFramePath, true);

        const pinResponse = await axios.post(
          `${pinterestApiBase}/v5/pins`,
          {
            board_id: boardId,
            title: post.renderedContent.title || 'New Pin',
            description: post.renderedContent.body,
            media_source: fallbackSource,
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        return {
          success: true,
          isFallback: true,
          fallbackReason: videoErr.message,
          externalPostId: pinResponse.data.id,
        };
      } finally {
        if (coverFramePath && fs.existsSync(coverFramePath)) {
          try { fs.unlinkSync(coverFramePath); } catch {}
        }
      }
    }

    // 3. STATIC IMAGE PIN SEQUENCE
    const mediaSource = await preparePinterestMediaSource(media.filepath, false);

    const pinResponse = await axios.post(
      `${pinterestApiBase}/v5/pins`,
      {
        board_id: boardId,
        title: post.renderedContent.title || 'New Pin',
        description: post.renderedContent.body,
        media_source: mediaSource,
      },
      {
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      externalPostId: pinResponse.data.id,
    };
  } catch (err) {
    console.error('[PINTEREST PUBLISH ERROR]:', err.response?.data || err.message);
    const status = err.response?.status;
    const isPermanent = status >= 400 && status < 500 && status !== 429;
    return {
      success: false,
      isPermanent,
      error: err.response ? JSON.stringify(err.response.data) : err.message,
    };
  }
}

/**
 * YouTube videos.insert API Publisher
 */
async function publishToYouTube(post, decryptedToken, media) {
  // Defensive check: reject image assets immediately
  if (media.mediaType === 'IMAGE') {
    return {
      success: false,
      error: 'YouTube requires video assets. Cannot upload an image.',
    };
  }

  if (isMockToken(decryptedToken)) {
    console.log(`[YOUTUBE PUBLISH MOCK] Uploading video to YouTube...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      success: true,
      externalPostId: `mock-youtube-video-${Date.now()}`,
    };
  }

  // Real YouTube Video upload
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: decryptedToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const mediaSize = fs.statSync(media.filepath).size;
    const mediaStream = fs.createReadStream(media.filepath);

    const videoResponse = await youtube.videos.insert(
      {
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: post.renderedContent.title || 'New Video Upload',
            description: post.renderedContent.body,
          },
          status: {
            privacyStatus: 'public', // public/unlisted/private
          },
        },
        media: {
          body: mediaStream,
        },
      },
      {
        // Resumable upload for larger video clips
        onUploadProgress: (evt) => {
          const progress = (evt.bytesRead / mediaSize) * 100;
          console.log(`[YOUTUBE UPLOAD PROGRESS]: ${progress.toFixed(2)}%`);
        },
      }
    );

    return {
      success: true,
      externalPostId: videoResponse.data.id,
    };
  } catch (err) {
    console.error('[YOUTUBE PUBLISH ERROR]:', err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * General router map for platforms
 */
async function publishToPlatform(post, decryptedToken, media) {
  switch (post.platform) {
    case 'LINKEDIN':
      return publishToLinkedIn(post, decryptedToken, media);
    case 'PINTEREST':
      return publishToPinterest(post, decryptedToken, media);
    case 'YOUTUBE':
      return publishToYouTube(post, decryptedToken, media);
    default:
      return {
        success: false,
        error: `Unsupported platform: ${post.platform}`,
      };
  }
}

module.exports = { publishToPlatform, publishToPinterest, preparePinterestMediaSource };
