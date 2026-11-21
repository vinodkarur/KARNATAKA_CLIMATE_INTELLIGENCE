/* ==========================================================================
   login.js — Karnataka Climate Intelligence Operations Login
   ========================================================================== */

function renderLogin() {
  const main = layout("login");
  main.innerHTML = `
    <div style="max-width:460px; margin:40px auto; padding:32px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; box-shadow:var(--shadow-command)">
      
      <div style="text-align:center; margin-bottom:28px">
        <div style="font-size:36px; margin-bottom:8px">🔐</div>
        <h1 style="font-size:22px; font-weight:800; color:var(--text-main); letter-spacing:-0.3px">
          Command Centre Login
        </h1>
        <p style="font-size:13px; color:var(--text-dim); margin-top:6px">
          Access personalized district forecasts, alert subscriptions, or administrative emergency broadcasting controls.
        </p>
      </div>

      <!-- Quick Demo Account Fill -->
      <div style="margin-bottom:20px; padding:12px; background:rgba(0,240,255,0.06); border:1px solid rgba(0,240,255,0.25); border-radius:8px">
        <div style="font-size:11px; font-weight:700; color:var(--cyan); text-transform:uppercase; margin-bottom:8px">
          ⚡ Fast-Fill Verified Credentials:
        </div>
        <div style="display:flex; gap:8px">
          <button type="button" onclick="fillDemo('admin')" class="btn btn-secondary" style="font-size:11.5px; padding:6px 10px; background:#181818; color:#fff; border:1px solid #333; border-radius:4px; flex:1">
            🛡️ Admin Officer
          </button>
          <button type="button" onclick="fillDemo('citizen')" class="btn btn-secondary" style="font-size:11.5px; padding:6px 10px; background:#181818; color:#fff; border:1px solid #333; border-radius:4px; flex:1">
            👤 Citizen User
          </button>
        </div>
      </div>

      <!-- Error / Alert Banner -->
      <div id="loginAlertBox" style="display:none; margin-bottom:18px; padding:12px 14px; border-radius:6px; font-size:13px; line-height:1.4"></div>

      <form id="loginForm" onsubmit="handleLoginSubmit(event)">
        <div style="margin-bottom:16px">
          <label for="loginEmail" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px">
            Email Address
          </label>
          <input type="email" id="loginEmail" required placeholder="user@karnataka-emergency.gov.in"
                 style="width:100%; padding:10px 14px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
        </div>

        <div style="margin-bottom:20px">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px">
            <label for="loginPassword" style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase">
              Password
            </label>
          </div>
          <input type="password" id="loginPassword" required placeholder="••••••••••••"
                 style="width:100%; padding:10px 14px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
        </div>

        <button type="submit" id="loginBtn"
                style="width:100%; padding:11px; background:var(--cyan); color:#050505; font-weight:800; font-size:14px; border:none; border-radius:6px; cursor:pointer; transition:opacity 0.2s">
          SIGN IN TO COMMAND CENTRE
        </button>
      </form>

      <div style="text-align:center; margin-top:24px; padding-top:18px; border-top:1px solid var(--border-subtle); font-size:13px; color:var(--text-dim)">
        Don't have an alert subscription account?
        <a href="/register" style="color:var(--cyan); font-weight:700; margin-left:4px">Register as Citizen</a>
      </div>
    </div>
  `;
}

function fillDemo(type) {
  const emailEl = document.getElementById("loginEmail");
  const pwEl = document.getElementById("loginPassword");
  if (type === "admin") {
    emailEl.value = "admin@karnataka-emergency.gov.in";
    pwEl.value = "Admin@KCI2026!";
  } else {
    emailEl.value = "citizen@karnataka-emergency.gov.in";
    pwEl.value = "Citizen@KCI2026!";
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const alertBox = document.getElementById("loginAlertBox");
  const btn = document.getElementById("loginBtn");
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  alertBox.style.display = "none";
  btn.disabled = true;
  btn.textContent = "VERIFYING CREDENTIALS...";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (data.status === "success") {
      localStorage.setItem("kci_user", JSON.stringify(data.user));
      localStorage.setItem("kci_token", data.token);

      alertBox.style.display = "block";
      alertBox.style.background = "rgba(16,185,129,0.15)";
      alertBox.style.border = "1px solid rgba(16,185,129,0.4)";
      alertBox.style.color = "#10b981";
      alertBox.textContent = "Login verified. Redirecting to command dashboard...";

      setTimeout(() => {
        if (data.user.is_admin) {
          window.location.href = "/admin";
        } else {
          window.location.href = "/user-dashboard";
        }
      }, 600);
    } else {
      alertBox.style.display = "block";
      alertBox.style.background = "rgba(239,68,68,0.15)";
      alertBox.style.border = "1px solid rgba(239,68,68,0.4)";
      alertBox.style.color = "#ef4444";
      alertBox.textContent = data.message || "Invalid credentials.";
    }
  } catch (err) {
    alertBox.style.display = "block";
    alertBox.style.background = "rgba(239,68,68,0.15)";
    alertBox.style.border = "1px solid rgba(239,68,68,0.4)";
    alertBox.style.color = "#ef4444";
    alertBox.textContent = "Connection error while reaching authentication service.";
  } finally {
    btn.disabled = false;
    btn.textContent = "SIGN IN TO COMMAND CENTRE";
  }
}

document.addEventListener("DOMContentLoaded", renderLogin);
