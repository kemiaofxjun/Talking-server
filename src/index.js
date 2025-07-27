import { handleAuth } from './auth.js';
import { handleAPI } from './api.js';
import { handleAdmin } from './admin.js';
import { handlePublic } from './public.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 路由处理
    if (path.startsWith('/auth')) {
      return handleAuth(request, env);
    }
    
    if (path.startsWith('/api')) {
      return handleAPI(request, env);
    }
    
    if (path.startsWith('/admin')) {
      return handleAdmin(request, env);
    }
    
    return handlePublic(request, env);
  }
};