import { verifySession, getAllPosts } from './utils.js';

export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 验证管理员权限
  const isAuthenticated = await verifySession(request, env);
  if (!isAuthenticated && path !== '/admin/login') {
    const baseUrl = `${url.protocol}//${url.host}`;
    return Response.redirect(`${baseUrl}/admin/login`);
  }

  if (path === '/admin/login') {
    return new Response(getLoginHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (path === '/admin' || path === '/admin/') {
    if (request.method === 'GET') {
      const posts = await getAllPosts(env.POSTS_KV);
      return new Response(getAdminHTML(posts), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (request.method === 'POST') {
      return await handleCreatePost(request, env);
    }
  }

  if (path.startsWith('/admin/delete/')) {
    const postId = path.split('/').pop();
    await env.POSTS_KV.delete(`post:${postId}`);
    const baseUrl = `${url.protocol}//${url.host}`;
    return Response.redirect(`${baseUrl}/admin`);
  }

  return new Response('未找到', { status: 404 });
}

async function handleCreatePost(request, env) {
  const formData = await request.formData();
  const content = formData.get('content');
  const tags = formData.get('tags').split(',').map(tag => tag.trim()).filter(Boolean);
  const image = formData.get('image');

  const postId = Date.now().toString();
  const date = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 19);

  let finalContent = content;

  // 处理图片上传
  if (image && image.size > 0) {
    console.log('Processing image:', image.name, 'Size:', image.size);
    
    try {
      // 生成安全的文件名
      const imageKey = `${postId}-${image.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      console.log('Uploading image with key:', imageKey);
      
      // 上传到 R2
      const uploadResult = await env.POST_BUCKET.put(imageKey, image.stream(), {
        httpMetadata: {
          contentType: image.type || 'image/jpeg'
        }
      });
      
      console.log('Upload result:', uploadResult);
      
      if (uploadResult) {
        const url = new URL(request.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        const imageUrl = `${baseUrl}/images/${imageKey}`;
        finalContent = `![${image.name}](${imageUrl})\n\n${content}`;
        console.log('Image uploaded successfully, URL:', imageUrl);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
      // 继续发布文本内容，即使图片上传失败
    }
  }

  const postData = {
    id: postId,
    date: date,
    tags: tags,
    content: finalContent
  };

  await env.POSTS_KV.put(`post:${postId}`, JSON.stringify(postData));
  
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return Response.redirect(`${baseUrl}/admin`);
}

function getLoginHTML() {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>管理员登录</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
        .login-btn { background: #24292e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
    </style>
</head>
<body>
    <h1>管理员登录</h1>
    <p>请使用 GitHub 账号登录管理后台</p>
    <a href="/auth/login" class="login-btn">使用 GitHub 登录</a>
</body>
</html>`;
}

function getAdminHTML(posts) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>动态管理后台</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        
        .header p {
            color: #666;
            font-size: 1.1rem;
        }
        
        .post-form {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        
        .post-form h2 {
            font-size: 1.8rem;
            margin-bottom: 25px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #555;
            font-size: 0.95rem;
        }
        
        textarea, input[type="text"], input[type="file"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #e1e8ed;
            border-radius: 12px;
            font-size: 1rem;
            transition: all 0.3s ease;
            background: #fff;
        }
        
        textarea:focus, input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        textarea {
            height: 120px;
            resize: vertical;
            font-family: inherit;
        }
        
        .submit-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        
        .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
        }
        
        .posts-section {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        
        .posts-section h2 {
            font-size: 1.8rem;
            margin-bottom: 25px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .post-item {
            background: #fff;
            border: 1px solid #e1e8ed;
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 20px;
            transition: all 0.3s ease;
            position: relative;
        }
        
        .post-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }
        
        .post-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .post-date {
            color: #657786;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .post-tags {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .tag {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .post-content {
            margin: 15px 0;
            line-height: 1.6;
            color: #333;
        }
        
        .post-content pre {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .delete-btn {
            background: linear-gradient(135deg, #ff6b6b, #ee5a52);
            color: white;
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        
        .delete-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }
        
        .empty-state h3 {
            font-size: 1.5rem;
            margin-bottom: 10px;
        }
        
        @media (max-width: 768px) {
            .container { padding: 15px; }
            .header, .post-form, .posts-section { padding: 20px; }
            .header h1 { font-size: 2rem; }
            .post-meta { flex-direction: column; align-items: flex-start; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✨ 动态管理后台</h1>
            <p>创建和管理你的社交动态</p>
        </div>
        
        <div class="post-form">
            <h2>📝 发布新动态</h2>
            <form method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label>💭 内容 (支持 Markdown)</label>
                    <textarea name="content" placeholder="分享你的想法..." required></textarea>
                </div>
                <div class="form-group">
                    <label>🏷️ 标签 (用逗号分隔)</label>
                    <input type="text" name="tags" placeholder="例如: 生活, 工作, 学习">
                </div>
                <div class="form-group">
                    <label>🖼️ 图片</label>
                    <input type="file" name="image" accept="image/*">
                </div>
                <button type="submit" class="submit-btn">
                    🚀 发布动态
                </button>
            </form>
        </div>

        <div class="posts-section">
            <h2>📋 已发布动态</h2>
            ${posts.length === 0 ? `
                <div class="empty-state">
                    <h3>🌟 还没有动态</h3>
                    <p>发布你的第一条动态吧！</p>
                </div>
            ` : posts.map(post => `
                <div class="post-item">
                    <div class="post-meta">
                        <div class="post-date">
                            🕒 ${post.date}
                        </div>
                        <div class="post-tags">
                            ${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                    <div class="post-content">
                        <pre>${post.content}</pre>
                    </div>
                    <a href="/admin/delete/${post.id}" class="delete-btn" onclick="return confirm('确定删除这条动态吗？')">
                        🗑️ 删除
                    </a>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
}
