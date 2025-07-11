const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

// Webhook configuration
const WEBHOOK_URL = "https://discord.com/api/webhooks/1353511267889053767/AAHMBVG7vyD0SHEFK3pYf8sxsYS9_MEbQhINx_c1ASJbG_1fMrMlo8EvCaeGcF5wulcT";

// Function to send webhook notification
async function sendWebhookLog(endpoint, params = {}, responseData = null, isError = false) {
  if (!WEBHOOK_URL) {
    return; // Skip if webhook URL is not configured
  }

  try {
    const embed = {
      title: isError ? "❌ API Error Log" : "🚀 API Usage Log",
      color: isError ? 0xff0000 : 0x00ff00,
      fields: [
        { name: "Endpoint", value: endpoint, inline: true },
        { name: "Timestamp", value: new Date().toISOString(), inline: true }
      ],
      footer: { text: "bucu0368 API" }
    };

    // Add parameters if provided
    if (Object.keys(params).length > 0) {
      const paramText = Object.entries(params)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      embed.fields.push({ name: "Parameters", value: paramText, inline: false });
    }

    // Add response data if provided
    if (responseData) {
      const responseText = JSON.stringify(responseData, null, 2);
      // Discord embed field value limit is 1024 characters
      const truncatedResponse = responseText.length > 1000 
        ? responseText.substring(0, 1000) + "..." 
        : responseText;
      const fieldName = isError ? "Error Details" : "API Response";
      embed.fields.push({ name: fieldName, value: `\`\`\`json\n${truncatedResponse}\n\`\`\``, inline: false });
    }

    await axios.post(WEBHOOK_URL, {
      embeds: [embed]
    });
  } catch (error) {
    console.error('Webhook log error:', error.message);
  }
}

// Function to send error webhook notification
async function sendErrorWebhook(endpoint, params = {}, error) {
  const errorData = {
    error: error.message || 'Unknown error',
    stack: error.stack ? error.stack.substring(0, 1000) : 'No stack trace',
    status: error.status || 500
  };
  
  await sendWebhookLog(endpoint, params, errorData, true);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // Send error to webhook if user info is available
  if (req.userInfo) {
    const endpoint = req.path;
    const params = { ...req.query };
    delete params.apikey;
    
    sendErrorWebhook(endpoint, params, error);
  }
  
  // Send error response
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: error.message || 'Something went wrong'
  });
});

// API key configuration
const VALID_API_KEY = process.env.API_KEY || "bucu";

// Middleware to verify API key and log usage
function verifyApiKey(req, res, next) {
  const apikey = req.query.apikey || req.headers['x-api-key'];
  const userIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';
  
  if (!apikey) {
    return res.status(401).json({
      error: "API key required for authentication",
      message: "Provide apikey as query parameter or x-api-key header"
    });
  }
  
  // Check if it's the master key
  if (apikey !== VALID_API_KEY) {
    return res.status(401).json({
      error: "Invalid api key."
    });
  }
  
  // Capture response data for webhook logging
  const originalJson = res.json;
  res.json = function(data) {
    // Log API usage with response data
    const endpoint = req.path;
    const params = { ...req.query };
    delete params.apikey; // Remove API key from logged params
    
    // Check if response contains error
    const isError = res.statusCode >= 400 || (data && data.error);
    sendWebhookLog(endpoint, params, data, isError);
    
    // Call original json method
    return originalJson.call(this, data);
  };

  // Store user info for error handling
  req.userInfo = { userIP, apikey };
  
  next();
}

// Nitro API endpoint
app.get('/api/nitro', verifyApiKey, (req, res) => {
  const nitroCode = crypto.randomBytes(16).toString('hex').toUpperCase();
  res.json({
    code: `NITRO-${nitroCode}`,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'active'
  });
});

// Meme API endpoint
app.get('/api/meme', verifyApiKey, async (req, res) => {
  try {
    const response = await axios.get('https://meme-api.com/gimme');
    res.json({
      title: response.data.title,
      url: response.data.url,
      author: response.data.author,
      subreddit: response.data.subreddit,
      ups: response.data.ups
    });
  } catch (error) {
    // Fallback meme data
    res.json({
      title: "Programming Humor",
      url: "https://i.imgur.com/sample.jpg",
      author: "dev_memer",
      subreddit: "ProgrammerHumor",
      ups: 1337
    });
  }
});

// Pokemon API endpoint
app.get('/api/pokemon', verifyApiKey, async (req, res) => {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'Pokemon name is required' });
  }

  try {
    const response = await axios.get(`https://pokeapi.co/api/v2/pokemon/${name.toLowerCase()}`);
    const pokemon = response.data;

    // Convert stats array to object format
    const statsObj = {};
    pokemon.stats.forEach(stat => {
      statsObj[stat.stat.name] = stat.base_stat;
    });

    res.json({
      abilities: pokemon.abilities.map(ability => ability.ability.name),
      id: pokemon.id,
      name: pokemon.name,
      sprite: pokemon.sprites.front_default,
      stats: statsObj,
      types: pokemon.types.map(type => type.type.name)
    });
  } catch (error) {
    res.status(404).json({ error: 'Pokemon not found' });
  }
});

// URL Shortener API endpoint
app.get('/api/shorten', verifyApiKey, (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const shortCode = crypto.randomBytes(4).toString('hex');
  const shortenedUrl = `https://short.ly/${shortCode}`;

  res.json({
    original: url,
    shortened: shortenedUrl,
    code: shortCode,
    created: new Date().toISOString()
  });
});

// Password Generator API endpoint
app.get('/api/password', verifyApiKey, (req, res) => {
  const length = parseInt(req.query.length) || 12;
  const includeUppercase = req.query.uppercase !== 'false';
  const includeLowercase = req.query.lowercase !== 'false';
  const includeNumbers = req.query.numbers !== 'false';
  const includeSymbols = req.query.symbols !== 'false';

  let charset = '';
  if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (includeNumbers) charset += '0123456789';
  if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (charset === '') {
    return res.status(400).json({ error: 'At least one character type must be enabled' });
  }

  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  // Calculate strength
  let strength = 0;
  if (password.length >= 8) strength += 25;
  if (password.length >= 12) strength += 25;
  if (/[A-Z]/.test(password)) strength += 12.5;
  if (/[a-z]/.test(password)) strength += 12.5;
  if (/[0-9]/.test(password)) strength += 12.5;
  if (/[^A-Za-z0-9]/.test(password)) strength += 12.5;

  const strengthLevel = strength >= 75 ? 'Strong' : strength >= 50 ? 'Medium' : 'Weak';

  res.json({
    password,
    length: password.length,
    strength: {
      score: Math.round(strength),
      level: strengthLevel
    },
    criteria: {
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumbers: /[0-9]/.test(password),
      hasSymbols: /[^A-Za-z0-9]/.test(password)
    }
  });
});

// GitHub User API endpoint
app.get('/api/github', verifyApiKey, async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'GitHub username is required' });
  }

  try {
    const [userResponse, reposResponse] = await Promise.all([
      axios.get(`https://api.github.com/users/${username}`),
      axios.get(`https://api.github.com/users/${username}/repos?per_page=100`)
    ]);

    const user = userResponse.data;
    const repos = reposResponse.data;

    const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
    const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
    const languages = [...new Set(repos.map(repo => repo.language).filter(Boolean))];

    res.json({
      username: user.login,
      name: user.name,
      bio: user.bio,
      location: user.location,
      company: user.company,
      blog: user.blog,
      avatar: user.avatar_url,
      followers: user.followers,
      following: user.following,
      publicRepos: user.public_repos,
      created: user.created_at,
      statistics: {
        totalStars,
        totalForks,
        languages: languages.slice(0, 10),
        mostStarredRepo: repos.sort((a, b) => b.stargazers_count - a.stargazers_count)[0]?.name
      }
    });
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'GitHub user not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch GitHub data' });
    }
  }
});

// Roblox User Info API endpoint
app.get('/api/roblox', verifyApiKey, async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Roblox username is required' });
  }

  try {
    // First, get user ID from username
    const userSearchResponse = await axios.post('https://users.roblox.com/v1/usernames/users', {
      usernames: [username],
      excludeBannedUsers: false
    });

    if (!userSearchResponse.data.data || userSearchResponse.data.data.length === 0) {
      return res.status(404).json({ error: 'Roblox user not found' });
    }

    const userId = userSearchResponse.data.data[0].id;

    // Get detailed user information
    const [userResponse, avatarResponse, friendsResponse] = await Promise.all([
      axios.get(`https://users.roblox.com/v1/users/${userId}`),
      axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`),
      axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`).catch(() => ({ data: { count: 0 } }))
    ]);

    const user = userResponse.data;
    const avatar = avatarResponse.data.data[0];
    const friendsCount = friendsResponse.data.count;

    res.json({
      id: user.id,
      username: user.name,
      displayName: user.displayName,
      description: user.description || 'No description available',
      created: user.created,
      isBanned: user.isBanned,
      externalAppDisplayName: user.externalAppDisplayName,
      hasVerifiedBadge: user.hasVerifiedBadge,
      avatar: {
        imageUrl: avatar?.imageUrl || null,
        state: avatar?.state || 'Unavailable'
      },
      friends: friendsCount,
      profileUrl: `https://www.roblox.com/users/${userId}/profile`
    });
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'Roblox user not found' });
    } else if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch Roblox user data' });
    }
  }
});

// Function to create paste on sourcebin
function createSourcebinPaste(content, title = "API Generated Paste") {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      files: [{
        name: "paste.txt",
        content: content,
        languageId: 1
      }],
      title: title,
      description: ""
    });

    const options = {
      hostname: 'sourceb.in',
      port: 443,
      path: '/api/bins',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'SourcebinAPI/1.0'
      }
    };

    const req = https.request(options, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        console.log('Response status:', response.statusCode);
        console.log('Response data:', data);
        
        try {
          if (response.statusCode === 200 || response.statusCode === 201) {
            const result = JSON.parse(data);
            if (result.key) {
              resolve(`https://sourceb.in/${result.key}`);
            } else {
              reject(new Error(`No key in response: ${data}`));
            }
          } else {
            reject(new Error(`HTTP ${response.statusCode}: ${data}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Helper functions for generating random IDs and HWIDs
function generateRandomHwidFluxus(length = 96) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomHwidArceus(length = 18) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomIdDelta(length = 64) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomIdDeltaios(length = 64) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomIdCryptic(length = 64) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomIdHydrogen(length = 10) {
  const digits = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return result;
}

function generateRandomHwidVegax() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const partLength = Math.random() < 0.5 ? 8 : 7;
    let part = '';
    for (let j = 0; j < partLength; j++) {
      part += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    parts.push(part);
  }
  return parts.join('-');
}

function generateRandomHwidTrigonevo() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  function randomString(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  return `${randomString(8)}-${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(12)}`;
}

function generateRandomIdCacti(length = 64) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomHwidEvon() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  function randomString(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  return `${randomString(8)}-${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(12)}`;
}

// Link Generator API endpoint
app.get('/api/gen', verifyApiKey, (req, res) => {
  const { service } = req.query;

  if (!service) {
    return res.status(400).json({ result: 'Service parameter is required' });
  }

  let result;

  switch (service) {
    case 'fluxus':
      const randomHwidFluxus = generateRandomHwidFluxus();
      result = `https://flux.li/android/external/start.php?HWID=${randomHwidFluxus}`;
      break;
    case 'arceus':
      const randomHwidArceus = generateRandomHwidArceus();
      result = `https://spdmteam.com/key-system-1?hwid=${randomHwidArceus}&zone=Europe/Rome&os=android`;
      break;
    case 'delta':
      const randomIdDelta = generateRandomIdDelta();
      result = `https://gateway.platoboost.com/a/8?id=${randomIdDelta}`;
      break;
    case 'deltaios':
      const randomIdDeltaios = generateRandomIdDeltaios();
      result = `https://gateway.platoboost.com/a/2?id=${randomIdDeltaios}`;
      break;
    case 'cryptic':
      const randomIdCryptic = generateRandomIdCryptic();
      result = `https://gateway.platoboost.com/a/39097?id=${randomIdCryptic}`;
      break;
    case 'hydrogen':
      const randomIdHydrogen = generateRandomIdHydrogen();
      result = `https://gateway.platoboost.com/a/2569?id=${randomIdHydrogen}`;
      break;
    case 'vegax':
      const randomHwidVegax = generateRandomHwidVegax();
      result = `https://pandadevelopment.net/getkey?service=vegax&hwid=${randomHwidVegax}&provider=linkvertise`;
      break;
    case 'trigon':
      const randomHwidTrigon = generateRandomHwidTrigonevo();
      result = `https://trigonevo.fun/whitelist/?HWID=${randomHwidTrigon}`;
      break;
    case 'cacti':
      const randomIdCacti = generateRandomIdCacti();
      result = `https://gateway.platoboost.com/a/23344?id=${randomIdCacti}`;
      break;
    case 'evon':
      const randomHwidEvon = generateRandomHwidEvon();
      result = `https://pandadevelopment.net/getkey?service=evon&hwid=${randomHwidEvon}`;
      break;
    default:
      return res.status(400).json({ result: 'Invalid executor key provided' });
  }

  res.json({ result });
});

// Image Generation API endpoint
app.get('/api/image', verifyApiKey, async (req, res) => {
  try {
    const { 
      prompt, 
      width = 1024, 
      height = 1024, 
      model = 'midjourney', 
      nologo = true, 
      private = false, 
      enhance = true, 
      seed 
    } = req.query;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build the Pollinations AI URL
    const baseUrl = 'https://image.pollinations.ai/prompt/';
    const encodedPrompt = encodeURIComponent(prompt);
    
    let imageUrl = `${baseUrl}${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=${nologo}&private=${private}&enhance=${enhance}`;
    
    if (seed) {
      imageUrl += `&seed=${seed}`;
    }

    res.json({
      image_url: imageUrl,
      prompt: prompt,
    });

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// Discord Server Info API endpoint
app.get('/api/discord', verifyApiKey, async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Discord invite code or URL is required' });
  }

  try {
    // Extract invite code from URL or use as-is
    let inviteCode = code;
    if (code.includes('discord.gg/')) {
      inviteCode = code.split('discord.gg/')[1];
    }

    // Get invite information
    const inviteResponse = await axios.get(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true&with_expiration=true`);
    const inviteData = inviteResponse.data;

    if (!inviteData.guild) {
      return res.status(404).json({ error: 'No server information found for this invite' });
    }

    const guild = inviteData.guild;

    res.json({
      id: guild.id,
      name: guild.name,
      description: guild.description || 'No description available',
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
      banner: guild.banner ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png` : null,
      splash: guild.splash ? `https://cdn.discordapp.com/splashes/${guild.id}/${guild.splash}.png` : null,
      verification_level: guild.verification_level,
      member_count: inviteData.approximate_member_count || 0,
      online_count: inviteData.approximate_presence_count || 0,
      boost_level: guild.premium_subscription_count ? Math.floor(guild.premium_subscription_count / 2) : 0,
      features: guild.features || [],
      vanity_url_code: guild.vanity_url_code || null,
      invite_info: {
        code: inviteData.code,
        expires_at: inviteData.expires_at,
        uses: inviteData.uses || 0,
        max_uses: inviteData.max_uses || 0,
        inviter: inviteData.inviter ? {
          username: inviteData.inviter.username,
          discriminator: inviteData.inviter.discriminator,
          avatar: inviteData.inviter.avatar ? `https://cdn.discordapp.com/avatars/${inviteData.inviter.id}/${inviteData.inviter.avatar}.png` : null
        } : null,
        channel: inviteData.channel ? {
          name: inviteData.channel.name,
          type: inviteData.channel.type
        } : null
      },
      created_at: new Date(((parseInt(guild.id) / 4194304) + 1420070400000)).toISOString()
    });
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'Discord invite not found or has expired' });
    } else if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch Discord server data' });
    }
  }
});



// API endpoint to create paste on sourcebin
app.get('/api/sourced', verifyApiKey, async (req, res) => {
  const prompt = req.query.prompt;
  const content = req.query.content;
  const description = req.query.description;
  const title = req.query.title || 'API Generated Paste';
  
  // Support multiple parameter names for content
  const finalContent = content || prompt || description;
  
  if (!finalContent) {
    return res.status(400).json({ 
      error: 'Missing content parameter. Use "content", "prompt", or "description"' 
    });
  }

  try {
    const pasteUrl = await createSourcebinPaste(finalContent, title);
    // Extract the paste key from the URL to create raw URL
    const pasteKey = pasteUrl.split('/').pop();
    const rawUrl = `https://cdn.sourceb.in/bins/${pasteKey}/0`;
    
    res.json({ 
      success: true,
      credits: 'bucu0368',
      url: pasteUrl,
      raw: rawUrl,
      content: finalContent,
      title: title
    });
  } catch (error) {
    console.error('Error creating paste:', error);
    res.status(500).json({ 
      error: 'Failed to create paste',
      message: error.message 
    });
  }
});

// Helper function to extract paste ID from Pastefy URL
function extractPasteId(url) {
  if (url.startsWith('https://pastefy.app/')) {
    return url.split('/').pop();
  } else if (url.startsWith('pastefy.app/')) {
    return url.split('/').pop();
  } else {
    return url;
  }
}

// Helper function to get Pastefy content
async function getPasteFyContent(pasteId) {
  try {
    const apiUrl = `https://pastefy.app/api/v2/paste/${pasteId}`;
    const response = await axios.get(apiUrl);
    const data = response.data;
    
    return {
      success: true,
      content: data.content || '',
      title: data.title || 'N/A',
      language: data.language || 'N/A',
      created: data.created || 'N/A',
      paste_id: pasteId
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.status === 404 ? 'Paste not found' : `Request failed: ${error.message}`,
      paste_id: pasteId
    };
  }
}

// Pastefy bypass API endpoint
app.get('/api/pastefy/bypass', verifyApiKey, async (req, res) => {
  const { url, id } = req.query;
  
  let pasteId;
  if (url) {
    pasteId = extractPasteId(url);
  } else if (id) {
    pasteId = id;
  } else {
    return res.status(400).json({
      success: false,
      error: 'Please provide either "url" or "id" parameter'
    });
  }
  
  // Validate paste ID format
  if (!pasteId || pasteId.length < 3) {
    return res.status(400).json({
      success: false,
      error: 'Invalid paste ID format'
    });
  }
  
  const result = await getPasteFyContent(pasteId);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(404).json(result);
  }
});

// Discord server redirect endpoint
app.get('/server', (req, res) => {
  res.redirect('https://discord.gg/VvWgjhHyQN');
});

// Root endpoint - serve the API testing interface
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'bucu0368 API Documentation',
    endpoints: [
      'GET /api/nitro - Generate Nitro codes (requires API key)',
      'GET /api/meme - Get random memes (requires API key)',
      'GET /api/pokemon?name= - Get Pokemon information (requires API key)',
      'GET /api/shorten?url= - Shorten URLs (requires API key)',
      'GET /api/password - Generate secure passwords (requires API key)',
      'GET /api/github?username= - Get GitHub user info (requires API key)',
      'GET /api/roblox?username= - Get Roblox user info (requires API key)',
      'GET /api/discord?code= - Get Discord server info (requires API key)',
      'GET /api/image?prompt= - Generate AI images (requires API key)',
      'GET /api/gen?service= - Generate service links (requires API key)',
      'GET /api/sourced - Create Sourcebin paste (requires API key)',
      'GET /api/pastefy/bypass?url= - Bypass Pastefy and get content (requires API key)',
      'GET /server - Join Discord server'
    ],
    examples: [
      'GET /api/sourced?content=Hello World&title=My Paste&apikey=here',
      'GET /api/pastefy/bypass?url=https://pastefy.app/mFGLQfek&apikey=here'
    ],
    authentication: {
      required: true,
      method: "API key",
      parameter: "apikey (query parameter) or x-api-key (header)"
    },
    testInterface: 'Visit the root URL (/) to access the interactive API testing interface',
    webhookLogging: 'API usage is logged to Discord webhook if WEBHOOK_URL environment variable is set'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Server running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('- GET /api/nitro');
  console.log('- GET /api/meme');
  console.log('- GET /api/pokemon?name=pikachu');
  console.log('- GET /api/shorten?url=https://example.com');
  console.log('- GET /api/password');
  console.log('- GET /api/github?username=octocat');
  console.log('- GET /api/roblox?username=builderman');
  console.log('- GET /api/discord?code=VvWgjhHyQN');
  console.log('- GET /api/image?prompt=a beautiful landscape');
  console.log('- GET /api/gen?service=fluxus');
  console.log('- GET /api/sourced?content=test&apikey=your_key');
  console.log('- GET /api/pastefy/bypass?url=https://pastefy.app/mFGLQfek');
});
