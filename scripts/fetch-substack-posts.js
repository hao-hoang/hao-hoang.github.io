import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const SUBSTACK_RSS_URL = 'https://aiinterviewprep.substack.com/feed';
const POSTS_DIR = join(process.cwd(), 'src', 'content', 'post');

// Helper function to create a slug from title
function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100); // Limit length
}

// Helper function to format date
function formatDate(dateString) {
  const date = new Date(dateString);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

// Helper function to extract description from content
function extractDescription(content, maxLength = 200) {
  if (!content) return '';
  
  // Remove HTML tags and get plain text
  let text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  // Try to get the first sentence or paragraph
  const firstSentence = text.match(/^[^.!?]+[.!?]/);
  if (firstSentence && firstSentence[0].length <= maxLength) {
    return firstSentence[0].trim();
  }
  
  // Otherwise, take the first maxLength characters
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

// Parse RSS XML
function parseRSS(xmlText) {
  const posts = [];
  
  // Extract all <item> elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];
    
    // Extract title
    const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : '';
    
    // Extract link
    const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
    const link = linkMatch ? linkMatch[1] : '';
    
    // Extract pubDate
    const dateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
    const pubDate = dateMatch ? dateMatch[1] : new Date().toISOString();
    
    // Extract description/content
    const descMatch = itemContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? (descMatch[1] || descMatch[2]) : '';
    
    // Extract content:encoded if available (this usually has the full post content)
    const contentMatch = itemContent.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    const content = contentMatch ? contentMatch[1] : description;
    
    // Try to extract a better description from the content
    let finalDescription = extractDescription(content || description, 250);
    
    // If description is too short or just the title, try to get first paragraph
    if (finalDescription.length < 50 || finalDescription.toLowerCase() === title.toLowerCase()) {
      const firstParagraph = (content || description).match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (firstParagraph) {
        finalDescription = extractDescription(firstParagraph[1], 250);
      }
    }
    
    if (title && link) {
      posts.push({
        title: title.trim(),
        link: link.trim(),
        date: pubDate,
        description: finalDescription || 'Read the full article on Substack.',
        content: content || description
      });
    }
  }
  
  return posts;
}

async function fetchSubstackPosts() {
  try {
    console.log('Fetching Substack RSS feed...');
    const response = await fetch(SUBSTACK_RSS_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    console.log('Parsing RSS feed...');
    const posts = parseRSS(xmlText);
    
    console.log(`Found ${posts.length} posts`);
    
    // Ensure posts directory exists
    if (!existsSync(POSTS_DIR)) {
      mkdirSync(POSTS_DIR, { recursive: true });
    }
    
    // Get existing posts to avoid duplicates
    const existingFiles = existsSync(POSTS_DIR)
      ? readdirSync(POSTS_DIR)
          .filter(file => file.endsWith('.md'))
          .map(file => file.replace('.md', ''))
      : [];
    
    let created = 0;
    let skipped = 0;
    
    for (const post of posts) {
      const slug = createSlug(post.title);
      const filename = `${slug}.md`;
      const filepath = join(POSTS_DIR, filename);
      
      // Skip if file already exists
      if (existingFiles.includes(slug)) {
        console.log(`Skipping existing post: ${post.title}`);
        skipped++;
        continue;
      }
      
      // Create markdown content
      const dateFormatted = formatDate(post.date);
      const markdown = `---
layout: ../../layouts/post.astro
title: ${JSON.stringify(post.title)}
description: ${JSON.stringify(post.description)}
dateFormatted: ${dateFormatted}
---

> This post was originally published on [Substack](${post.link}). Click the link to read the full article.

${post.description}

---

**Read the full article on [Substack](${post.link})**
`;

      writeFileSync(filepath, markdown, 'utf-8');
      console.log(`Created: ${filename}`);
      created++;
    }
    
    console.log(`\n✅ Done! Created ${created} new posts, skipped ${skipped} existing posts.`);
    
  } catch (error) {
    console.error('Error fetching Substack posts:', error);
    process.exit(1);
  }
}

// Run the script
fetchSubstackPosts();
