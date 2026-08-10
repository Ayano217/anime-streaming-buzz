export const prerender = false;

export async function POST({ request, locals }: any) {
  try {
    const env = (locals as any)?.runtime?.env || {};
    const adminPassword = env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Admin password not configured' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const password = (body.password || '').trim();

    if (!password) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Password required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (password !== adminPassword) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Wrong password' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate simple session token (base64 encoded timestamp + secret)
    const token = btoa(`${Date.now()}:${adminPassword}`).replace(/=/g, '');

    return new Response(JSON.stringify({ 
      success: true, 
      token: token,
      message: 'Login successful'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Login failed' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper function to verify token in other API endpoints
export function verifyAdminToken(token: string, adminPassword: string): boolean {
  try {
    if (!token || !adminPassword) return false;
    const decoded = atob(token);
    const [timestamp, pwd] = decoded.split(':');
    if (pwd !== adminPassword) return false;
    // Token valid for 24 hours
    const age = Date.now() - parseInt(timestamp);
    if (age > 24 * 60 * 60 * 1000) return false;
    return true;
  } catch (e) {
    return false;
  }
}
