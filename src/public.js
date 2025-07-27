import { getAllPosts } from './utils.js';

export async function handlePublic(request, env) {
  const url = new URL(request.url);
  
  if (url.pathname.startsWith('/images/')) {
    const imageKey = url.pathname.replace('/images/', '');
    const object = await env.POST_BUCKET.get(imageKey);
    
    if (!object) {
      return new Response('图片未找到', { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  }

  // 主页展示
  const posts = await getAllPosts(env.POSTS_KV);
  return new Response(getPublicHTML(posts), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function getPublicHTML(posts) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>社交动态</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .login-btn { background: #24292e; color: white; padding: 8px 16px; text-decoration: none; 
                     border-radius: 6px; font-size: 14px; }
        .login-btn:hover { background: #1a1e22; }
        .post { background: white; border: 1px solid #e1e8ed; border-radius: 12px; 
                padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .post-date { color: #657786; font-size: 14px; margin-bottom: 10px; }
        .post-tags { margin: 10px 0; }
        .tag { background: #1da1f2; color: white; padding: 4px 8px; border-radius: 12px; 
               font-size: 12px; margin-right: 8px; }
        .post-content { margin-top: 15px; }
        .post-content img { max-width: 100%; border-radius: 8px; }
        h1 { text-align: center; color: #14171a; margin: 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌟 社交动态</h1>
        <a href="/auth/login" class="login-btn">管理员登录</a>
    </div>
    
    <div id="posts">
        ${posts.map(post => `
            <div class="post">
                <div class="post-date">${post.date}</div>
                <div class="post-tags">
                    ${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                <div class="post-content" data-markdown="${encodeURIComponent(post.content)}"></div>
            </div>
        `).join('')}
    </div>

    <script>
        // 渲染 Markdown 内容
        document.querySelectorAll('.post-content').forEach(element => {
            const markdown = decodeURIComponent(element.dataset.markdown);
            element.innerHTML = marked.parse(markdown);
        });
    </script>
</body>
</html>`;
}
