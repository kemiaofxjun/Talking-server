export async function verifySession(request, env) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return false;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(cookie => {
      const [key, value] = cookie.trim().split('=');
      return [key, value];
    })
  );

  const sessionToken = cookies.session;
  if (!sessionToken) return false;

  // 这里可以添加更复杂的会话验证逻辑
  // 简单起见，我们假设有效的会话令牌就是已认证的
  return true;
}

export async function getAllPosts(kv) {
  const list = await kv.list({ prefix: 'post:' });
  const posts = [];

  for (const key of list.keys) {
    const postData = await kv.get(key.name, 'json');
    if (postData) {
      posts.push(postData);
    }
  }

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return posts;
}