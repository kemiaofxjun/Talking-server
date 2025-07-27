import { verifySession, getAllPosts } from './utils.js';

export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 处理退出登录
  if (path === '/admin/logout') {
    const baseUrl = `${url.protocol}//${url.host}`;
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${baseUrl}/admin/login`,
        'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
      }
    });
  }

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

  if (path.startsWith('/admin/edit/')) {
    const postId = path.split('/').pop();
    
    if (request.method === 'GET') {
      const postData = await env.POSTS_KV.get(`post:${postId}`, 'json');
      if (!postData) {
        return new Response('动态未找到', { status: 404 });
      }
      return new Response(getEditHTML(postData), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    
    if (request.method === 'POST') {
      return await handleUpdatePost(request, env, postId);
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

async function handleUpdatePost(request, env, postId) {
  const formData = await request.formData();
  const content = formData.get('content');
  const tags = formData.get('tags').split(',').map(tag => tag.trim()).filter(Boolean);
  const image = formData.get('image');

  // 获取原有数据
  const existingPost = await env.POSTS_KV.get(`post:${postId}`, 'json');
  if (!existingPost) {
    return new Response('动态未找到', { status: 404 });
  }

  let finalContent = content;

  // 处理新图片上传
  if (image && image.size > 0) {
    console.log('Processing new image:', image.name, 'Size:', image.size);
    
    try {
      const imageKey = `${postId}-${image.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      console.log('Uploading image with key:', imageKey);
      
      const uploadResult = await env.POST_BUCKET.put(imageKey, image.stream(), {
        httpMetadata: {
          contentType: image.type || 'image/jpeg'
        }
      });
      
      if (uploadResult) {
        const url = new URL(request.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        const imageUrl = `${baseUrl}/images/${imageKey}`;
        finalContent = `![${image.name}](${imageUrl})\n\n${content}`;
        console.log('Image uploaded successfully, URL:', imageUrl);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
    }
  }

  const updatedPost = {
    ...existingPost,
    tags: tags,
    content: finalContent,
    updatedAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 19)
  };

  await env.POSTS_KV.put(`post:${postId}`, JSON.stringify(updatedPost));
  
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
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }
        
        .login-container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 50px 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 650px;
            width: 90%;
            margin: 20px;
        }
        
        .login-header {
            margin-bottom: 40px;
        }
        
        .login-header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 15px;
        }
        
        .login-header p {
            color: #666;
            font-size: 1.1rem;
            line-height: 1.6;
        }
        
        .login-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            display: block;
        }
        
        .login-btn {
            background: linear-gradient(135deg, #24292e, #1a1e22);
            color: white;
            padding: 18px 35px;
            text-decoration: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 12px;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(36, 41, 46, 0.2);
        }
        
        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(36, 41, 46, 0.3);
            background: linear-gradient(135deg, #1a1e22, #0d1117);
        }
        
        .github-icon {
            font-size: 1.3rem;
        }
        
        .features {
            margin-top: 40px;
            padding-top: 30px;
            border-top: 1px solid #e1e8ed;
        }
        
        .features h3 {
            color: #333;
            font-size: 1.2rem;
            margin-bottom: 20px;
        }
        
        .feature-list {
            display: grid;
            gap: 15px;
            text-align: left;
        }
        
        .feature-item {
            display: flex;
            align-items: center;
            gap: 12px;
            color: #666;
            font-size: 0.95rem;
        }
        
        .feature-icon {
            font-size: 1.2rem;
            width: 24px;
            text-align: center;
        }
        
        .back-home {
            position: absolute;
            top: 30px;
            left: 30px;
            background: rgba(255, 255, 255, 0.9);
            color: #667eea;
            padding: 12px 20px;
            text-decoration: none;
            border-radius: 10px;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            backdrop-filter: blur(10px);
        }
        
        .back-home:hover {
            background: rgba(255, 255, 255, 1);
            transform: translateY(-1px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);
        }
        
        @media (max-width: 768px) {
            .login-container {
                padding: 40px 30px;
                margin: 15px;
            }
            
            .login-header h1 {
                font-size: 2rem;
            }
            
            .back-home {
                position: static;
                margin-bottom: 20px;
                align-self: flex-start;
            }
            
            body {
                padding: 20px 0;
                align-items: flex-start;
            }
        }
        
        .security-note {
            margin-top: 30px;
            padding: 20px;
            background: rgba(102, 126, 234, 0.1);
            border-radius: 12px;
            border-left: 4px solid #667eea;
        }
        
        .security-note h4 {
            color: #667eea;
            font-size: 1rem;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .security-note p {
            color: #666;
            font-size: 0.9rem;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <a href="/" class="back-home">
        🏠 返回首页
    </a>
    
    <div class="login-container">
        <div class="login-header">
            <span class="login-icon">🔐</span>
            <h1>管理员登录</h1>
            <p>使用 GitHub 账号安全登录管理后台</p>
        </div>
        
        <a href="/auth/login" class="login-btn">
            <span class="github-icon">🐙</span>
            使用 GitHub 登录
        </a>
        
        <div class="security-note">
            <h4>
                🛡️ 安全提示
            </h4>
            <p>只有授权的管理员账号才能访问后台管理功能，登录过程通过 GitHub OAuth 进行安全验证。</p>
        </div>
        
        <div class="features">
            <h3>✨ 管理功能</h3>
            <div class="feature-list">
                <div class="feature-item">
                    <span class="feature-icon">📝</span>
                    <span>发布和编辑动态内容</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">🖼️</span>
                    <span>上传和管理图片</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">🏷️</span>
                    <span>添加和管理标签</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span>查看所有已发布内容</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">🗑️</span>
                    <span>删除不需要的动态</span>
                </div>
            </div>
        </div>
    </div>
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
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
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
        
        .logout-btn {
            background: linear-gradient(135deg, #dc3545, #c82333);
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        
        .logout-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
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
        
        .post-content img {
            max-width: 50%;
            border-radius: 8px;
            margin: 10px 0;
        }
        
        .post-content h1, .post-content h2, .post-content h3 {
            margin: 15px 0 10px 0;
            color: #333;
        }
        
        .post-content p {
            margin: 10px 0;
        }
        
        .post-content code {
            background: #f1f3f4;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        
        .post-content pre {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 10px 0;
        }
        
        .post-content blockquote {
            border-left: 4px solid #667eea;
            padding-left: 15px;
            margin: 15px 0;
            color: #666;
            font-style: italic;
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
            <div style="margin-top: 15px;">
                <a href="/admin/logout" class="logout-btn" onclick="return confirm('确定要退出登录吗？')">
                    🚪 退出登录
                </a>
            </div>
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
                    <div class="post-content" data-markdown="${encodeURIComponent(post.content)}"></div>
                    <div class="post-actions" style="display: flex; gap: 10px; margin-top: 15px;">
                        <a href="/admin/edit/${post.id}" class="edit-btn" style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 8px 16px; text-decoration: none; border-radius: 8px; font-size: 0.9rem; font-weight: 500; transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 5px;">
                            ✏️ 编辑
                        </a>
                        <a href="/admin/delete/${post.id}" class="delete-btn" onclick="return confirm('确定删除这条动态吗？')">
                            🗑️ 删除
                        </a>
                    </div>
                </div>
            `).join('')}
        </div>
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

function getEditHTML(post) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>编辑动态</title>
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
            max-width: 800px;
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
        
        .back-btn {
            background: #6c757d;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 8px;
            font-size: 0.9rem;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin-bottom: 20px;
            transition: all 0.3s ease;
        }
        
        .back-btn:hover {
            background: #5a6268;
            transform: translateY(-1px);
        }
        
        .edit-form {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
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
            height: 200px;
            resize: vertical;
            font-family: inherit;
        }
        
        .btn-group {
            display: flex;
            gap: 15px;
            margin-top: 25px;
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
        
        .cancel-btn {
            background: #6c757d;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        
        .cancel-btn:hover {
            background: #5a6268;
            transform: translateY(-2px);
        }
        
        .post-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 0.9rem;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/admin" class="back-btn">← 返回管理后台</a>
        
        <div class="header">
            <h1>✏️ 编辑动态</h1>
            <div style="margin-top: 15px;">
                <a href="/admin/logout" class="logout-btn" style="background: linear-gradient(135deg, #dc3545, #c82333); color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-size: 0.9rem; font-weight: 500; transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 5px;" onclick="return confirm('确定要退出登录吗？')">
                    🚪 退出登录
                </a>
            </div>
        </div>
        
        <div class="edit-form">
            <div class="post-info">
                <strong>创建时间：</strong>${post.date}<br>
                <strong>动态 ID：</strong>${post.id}
                ${post.updatedAt ? `<br><strong>最后更新：</strong>${post.updatedAt}` : ''}
            </div>
            
            <form method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label>💭 内容 (支持 Markdown)</label>
                    <textarea name="content" required>${post.content}</textarea>
                </div>
                <div class="form-group">
                    <label>🏷️ 标签 (用逗号分隔)</label>
                    <input type="text" name="tags" value="${post.tags.join(', ')}">
                </div>
                <div class="form-group">
                    <label>🖼️ 更换图片 (可选)</label>
                    <input type="file" name="image" accept="image/*">
                    <small style="color: #666; font-size: 0.8rem;">如果不选择新图片，将保持原有图片</small>
                </div>
                
                <div class="btn-group">
                    <button type="submit" class="submit-btn">
                        💾 保存更改
                    </button>
                    <a href="/admin" class="cancel-btn">
                        ❌ 取消
                    </a>
                </div>
            </form>
        </div>
    </div>
</body>
</html>`;
}
