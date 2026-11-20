const headers = (key, token = key) => ({ apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
async function manager(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (!token) return null;
  const check = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: headers(env.SUPABASE_SERVICE_ROLE_KEY, token) });
  if (!check.ok) return null;
  const user = await check.json();
  return user.email?.toLowerCase() === "gerhardm@surex.insure" ? user : null;
}
export default async (request) => {
  const env = process.env;
  try {
    if (request.method === "POST") {
      const body = await request.json();
      const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (body.action === "update_password") {
        if (!key) return json({ error: "Password recovery is not configured on the server." }, 500);
        const accessToken = String(body.access_token || "");
        const password = String(body.password || "");
        if (!accessToken || password.length < 8) return json({ error: "A valid recovery session and a password of at least 8 characters are required." }, 400);
        const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
          method: "PUT", headers: { apikey: key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return json({ error: result.msg || result.message || result.error_description || "Could not update the password." }, 400);
        return json({ success: true });
      }
      if (body.action === "request_password_reset") {
        if (!key) return json({ error: "Password recovery is not configured on the server." }, 500);
        const email = String(body.email || "").trim();
        if (email.toLowerCase() !== "gerhardm@surex.insure") return json({ error: "This email is not authorised for manager access." }, 403);
        const redirect = "https://surex-funding-portal.netlify.app/manager-reset.html";
        const response = await fetch(`${env.SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`, {
          method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ email })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return json({ error: result.msg || result.message || result.error_description || "Could not send the recovery email." }, 400);
        return json({ success: true });
      }
      if (body.action === "login") {
        if (!key) return json({ error: "Login is not configured on the server." }, 500);
        const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ email: body.email, password: body.password })
        });
        const session = await response.json();
        if (!response.ok) return json({ error: session.msg || session.message || session.error_description || "Sign-in failed." }, 401);
        if (session.user?.email?.toLowerCase() !== "gerhardm@surex.insure") return json({ error: "This account is not authorised for the manager dashboard." }, 403);
        return json({ access_token: session.access_token, expires_in: session.expires_in, user: { email: session.user.email } });
      }
    }
    const user = await manager(request, env);
    if (!user) return json({ error: "Unauthorised. Please sign in with the manager account." }, 401);
    const base = `${env.SUPABASE_URL}/rest/v1/funding_requests`;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (request.method === "GET") {
      const url = base + "?select=id,request_reference,first_name,surname,adviser_email,branch,event_type,event_date,venue,expected_attendees,requested_amount,funding_breakdown,additional_notes,status,manager_comment,created_at,actual_attendees,completed_at&order=created_at.desc";
      const result = await fetch(url, { headers: headers(key) });
      const data = await result.json();
      if (!result.ok) return json({ error: "Could not load applications.", detail: data.message }, 500);
      return json({ requests: data });
    }
    if (request.method === "POST") {
      const body = await request.json();
      if (!body.id || !["approved", "declined"].includes(body.status)) return json({ error: "Invalid decision." }, 400);
      const update = await fetch(base + "?id=eq." + encodeURIComponent(body.id), {
        method: "PATCH", headers: { ...headers(key), Prefer: "return=minimal" },
        body: JSON.stringify({ status: body.status, manager_comment: String(body.comment || "").slice(0, 2000), reviewed_by: user.email, reviewed_at: new Date().toISOString() })
      });
      if (!update.ok) return json({ error: "Could not save the decision.", detail: await update.text() }, 500);
      return json({ success: true });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) { return json({ error: "Server error.", detail: error.message }, 500); }
};