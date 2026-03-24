export default async function(request, context) {
  const url = new URL(request.url);
  const cookie = request.headers.get('cookie') || '';
  const authenticated = cookie.includes('phc-ops=authorized');

  if (request.method === 'POST') {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const pw = params.get('pw');

    if (pw === 'outer.court.open') {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/ops',
          'Set-Cookie': 'phc-ops=authorized; Path=/ops; HttpOnly; Secure; SameSite=Strict; Max-Age=86400'
        }
      });
    }
    return new Response(loginPage('ACCESS DENIED · CLEARANCE INVALID'), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (!authenticated) {
    return new Response(loginPage(''), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  return context.next();
}

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PHC // ACCESS RESTRICTED</title>
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a08;color:#e8e0d0;font-family:'Share Tech Mono',monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column}
  .logo{font-size:11px;letter-spacing:6px;color:#e8e0d0;margin-bottom:6px}
  .logo span{color:#b8960c}
  .sub{font-size:9px;letter-spacing:4px;color:#504840;margin-bottom:48px}
  form{display:flex;flex-direction:column;align-items:center;gap:16px;width:280px}
  label{font-size:9px;letter-spacing:4px;color:#504840;align-self:flex-start}
  input[type=password]{width:100%;background:transparent;border:none;border-bottom:1px solid #504840;color:#e8e0d0;font-family:'Share Tech Mono',monospace;font-size:13px;letter-spacing:4px;padding:8px 0;outline:none;text-align:center}
  input[type=password]:focus{border-bottom-color:#b8960c}
  button{background:transparent;border:1px solid #504840;color:#504840;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:4px;padding:10px 24px;cursor:pointer;transition:border-color 0.2s,color 0.2s;margin-top:8px}
  button:hover{border-color:#b8960c;color:#b8960c}
  .error{font-size:9px;letter-spacing:3px;color:#8b1a1a;height:14px;text-align:center}
  .foot{position:fixed;bottom:24px;font-size:9px;letter-spacing:3px;color:#504840}
</style>
</head>
<body>
  <div class="logo">PALE HORSE <span>//</span> COLLECTIVE</div>
  <div class="sub">MISSION CONTROL · ACCESS RESTRICTED</div>
  <form method="POST" action="/ops">
    <label>CLEARANCE CODE</label>
    <input type="password" name="pw" placeholder="· · · · · · · · · · · · · · ·" autocomplete="off" autofocus>
    <div class="error">${error}</div>
    <button type="submit">REQUEST ACCESS</button>
  </form>
  <div class="foot">FILE REF: PHC-OPS-001 · INTERNAL · NOT FOR DISTRIBUTION</div>
</body>
</html>`;
}