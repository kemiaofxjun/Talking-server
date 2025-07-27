import { getAllPosts } from './utils.js';

export async function handleAPI(request, env) {
  const url = new URL(request.url);
  
  if (url.pathname === '/api/posts' && request.method === 'GET') {
    try {
      const posts = await getAllPosts(env.POSTS_KV);
      return new Response(JSON.stringify({ data: posts }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      return new Response('获取数据失败', { status: 500 });
    }
  }

  return new Response('未找到', { status: 404 });
}
